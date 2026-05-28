/**
 * modules/auth/auth.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for authentication endpoints.
 * Controller layer: parse input → call model → format response.
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const authModel = require('./auth.model');
const { generateTokens, blacklistToken } = require('../../middlewares/authenticate');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../../jobs/emailQueue');
const { success, error } = require('../../utils/apiResponse');
const { validateRequired, isValidSlug, isValidEmail, isValidPassword } = require('../../utils/validators');
const { AuthError, ValidationError, ConflictError } = require('../../utils/errors');

/**
 * POST /api/auth/register-tenant
 * Create a new tenant and the first admin user.
 */
async function registerTenant(req, res, next) {
  try {
    const { company_name, slug, admin_name, admin_email, admin_password } = req.body;

    // Validate required fields
    validateRequired(req.body, ['company_name', 'slug', 'admin_name', 'admin_email', 'admin_password']);

    // Validate slug format
    if (!isValidSlug(slug)) {
      throw new ValidationError('Slug must be lowercase alphanumeric with hyphens, 3-50 characters');
    }

    // Validate email
    if (!isValidEmail(admin_email)) {
      throw new ValidationError('Invalid email address');
    }

    // Validate password
    if (!isValidPassword(admin_password)) {
      throw new ValidationError('Password must be at least 8 characters with uppercase, lowercase, and number');
    }

    // Check slug uniqueness
    const slugTaken = await authModel.isSlugTaken(slug);
    if (slugTaken) {
      throw new ConflictError('This company slug is already taken');
    }

    // Create tenant and admin user in transaction
    const { tenant, user } = await authModel.registerTenant({
      companyName: company_name,
      slug,
      adminName: admin_name,
      adminEmail: admin_email,
      adminPassword: admin_password,
    });

    // Generate tokens
    const tokens = await generateTokens(user, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // Send welcome email (async)
    sendWelcomeEmail(admin_email, admin_name, company_name);

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth',
    });

    return success(res, {
      tenant: {
        id: tenant.id,
        company_name: tenant.company_name,
        slug: tenant.slug,
        plan: tenant.plan,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    }, 'Tenant registered successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Authenticate user with email + password + tenant slug.
 */
async function login(req, res, next) {
  try {
    const { email, password, tenant_slug } = req.body;

    // Validate required fields
    validateRequired(req.body, ['email', 'password', 'tenant_slug']);

    // Find user
    const user = await authModel.findUserByEmailAndSlug(email, tenant_slug);
    if (!user) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Check tenant is active
    if (!user.tenant_is_active) {
      throw new AuthError('This organization account has been deactivated', 'TENANT_INACTIVE');
    }

    // Check user is active
    if (!user.is_active) {
      throw new AuthError('Your account has been deactivated', 'USER_INACTIVE');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Generate tokens
    const tokens = await generateTokens(user, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // Update last login
    await authModel.updateLastLogin(user.id);

    // Set refresh token cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    // Get role info
    const userProfile = await authModel.findUserById(user.id);

    return success(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: userProfile.role_name,
      },
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Issue new access token using refresh token cookie.
 */
async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      throw new AuthError('Refresh token is required', 'REFRESH_TOKEN_MISSING');
    }

    // Find valid refresh tokens — we need to compare hashes
    // Since we don't know which user, we need to search all non-revoked tokens
    // In practice, we'd also store the user_id in the cookie or decode it
    // For security, we iterate and bcrypt.compare
    const result = await require('../../config/database').query(
      `SELECT rt.*, u.tenant_id, u.email, u.name, u.role_profile_id, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.revoked_at IS NULL AND rt.expires_at > NOW()
       ORDER BY rt.created_at DESC
       LIMIT 100`
    );

    let matchedToken = null;
    let matchedUser = null;

    for (const row of result.rows) {
      const isMatch = await bcrypt.compare(refreshToken, row.token_hash);
      if (isMatch) {
        matchedToken = row;
        matchedUser = {
          id: row.user_id,
          tenant_id: row.tenant_id,
          email: row.email,
          name: row.name,
          role_profile_id: row.role_profile_id,
          is_active: row.is_active,
        };
        break;
      }
    }

    if (!matchedToken || !matchedUser) {
      // Clear cookie
      res.clearCookie('refreshToken', { path: '/api/auth' });
      throw new AuthError('Invalid or expired refresh token', 'REFRESH_TOKEN_INVALID');
    }

    // Check user is still active
    if (!matchedUser.is_active) {
      throw new AuthError('Your account has been deactivated', 'USER_INACTIVE');
    }

    // Revoke old refresh token (rotation)
    await authModel.revokeRefreshToken(matchedToken.id);

    // Generate new token pair
    const tokens = await generateTokens(matchedUser, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // Set new refresh token cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    return success(res, {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    }, 'Token refreshed successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Revoke refresh token and blacklist access token.
 */
async function logout(req, res, next) {
  try {
    // Blacklist current access token
    if (req.tokenJti && req.tokenExp) {
      await blacklistToken(req.tokenJti, req.tokenExp);
    }

    // Revoke refresh token
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      // Find and revoke matching refresh tokens for this user
      const tokens = await authModel.findValidRefreshTokens(req.user.id);
      for (const token of tokens) {
        const isMatch = await bcrypt.compare(refreshToken, token.token_hash);
        if (isMatch) {
          await authModel.revokeRefreshToken(token.id);
          break;
        }
      }
    }

    // Clear cookie
    res.clearCookie('refreshToken', { path: '/api/auth' });

    return success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password
 * Send password reset email.
 */
async function forgotPassword(req, res, next) {
  try {
    const { email, tenant_slug } = req.body;

    validateRequired(req.body, ['email', 'tenant_slug']);

    // Find user (don't reveal if email exists)
    const user = await authModel.findUserByEmailAndSlug(email, tenant_slug);

    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store hashed token
      await authModel.setResetToken(user.id, resetTokenHash, expiresAt);

      // Send email (async)
      sendPasswordResetEmail(email, user.name, resetToken);
    }

    // Always return success (prevent email enumeration)
    return success(res, null, 'If an account with this email exists, a password reset link has been sent');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Reset password using token.
 */
async function resetPassword(req, res, next) {
  try {
    const { token, new_password } = req.body;

    validateRequired(req.body, ['token', 'new_password']);

    if (!isValidPassword(new_password)) {
      throw new ValidationError('Password must be at least 8 characters with uppercase, lowercase, and number');
    }

    // Hash the incoming token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with this reset token
    const user = await authModel.findUserByResetToken(tokenHash);
    if (!user) {
      throw new AuthError('Invalid or expired reset token', 'INVALID_RESET_TOKEN');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(new_password, authModel.BCRYPT_ROUNDS);

    // Update password and clear token
    await authModel.updatePassword(user.id, newPasswordHash);

    // Revoke all existing refresh tokens (force re-login)
    await authModel.revokeAllRefreshTokens(user.id);

    return success(res, null, 'Password has been reset successfully. Please log in with your new password.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerTenant,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};
