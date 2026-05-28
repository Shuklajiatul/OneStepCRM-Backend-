/**
 * modules/users/users.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for user management endpoints.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const usersModel = require('./users.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, isValidEmail, isValidPassword, isValidUUID } = require('../../utils/validators');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { NotFoundError, ValidationError, ConflictError, PermissionError } = require('../../utils/errors');
const { sendInviteEmail } = require('../../jobs/emailQueue');
const { auditLog } = require('../../middlewares/auditLogger');

/**
 * GET /api/users
 * List users for current tenant with filters and pagination.
 */
async function list(req, res, next) {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, role_profile_id, is_active } = req.query;

    const { users, total } = await usersModel.listUsers(req.tenantId, {
      limit,
      offset,
      search,
      roleProfileId: role_profile_id,
      isActive: is_active !== undefined ? is_active === 'true' : undefined,
    });

    return success(res, users, 'Users retrieved', buildMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me
 * Return current authenticated user's profile with permissions.
 */
async function me(req, res, next) {
  try {
    const user = await usersModel.getUserById(req.tenantId, req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return success(res, user, 'Profile retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:id
 * Get a single user by ID.
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid user ID');
    }

    const user = await usersModel.getUserById(req.tenantId, req.params.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return success(res, user, 'User retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/users/invite
 * Invite a new user to the tenant.
 */
async function invite(req, res, next) {
  try {
    const { name, email, role_profile_id } = req.body;

    validateRequired(req.body, ['name', 'email', 'role_profile_id']);

    if (!isValidEmail(email)) {
      throw new ValidationError('Invalid email address');
    }

    if (!isValidUUID(role_profile_id)) {
      throw new ValidationError('Invalid role profile ID');
    }

    // Check tenant user limit
    const userCount = await usersModel.getUserCount(req.tenantId);
    if (userCount >= req.tenant.max_users) {
      throw new ConflictError(`User limit reached (${req.tenant.max_users}). Upgrade your plan to add more users.`);
    }

    // Generate invitation token and temporary password
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const user = await usersModel.createUser(req.tenantId, {
      name,
      email,
      passwordHash,
      roleProfileId: role_profile_id,
      invitedBy: req.user.id,
      invitationToken,
      invitationExpiresAt: expiresAt,
    });

    // Send invite email
    sendInviteEmail(email, req.user.name, req.tenant.company_name, invitationToken);

    auditLog(req, 'CREATE', 'user', user.id, null, user);

    return success(res, user, 'User invited successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/users/:id
 * Update a user's name, role, or active status.
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid user ID');
    }

    const before = await usersModel.getUserById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('User not found');
    }

    const { name, role_profile_id, is_active, avatar_url } = req.body;

    const user = await usersModel.updateUser(req.tenantId, req.params.id, {
      name,
      role_profile_id,
      is_active,
      avatar_url,
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    auditLog(req, 'UPDATE', 'user', user.id, before, user);

    return success(res, user, 'User updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/:id
 * Soft deactivate a user (set is_active = false).
 */
async function deactivate(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid user ID');
    }

    // Cannot delete self
    if (req.params.id === req.user.id) {
      throw new PermissionError('You cannot deactivate your own account');
    }

    // Cannot delete last admin
    const isLast = await usersModel.isLastAdmin(req.tenantId, req.params.id);
    const user = await usersModel.getUserById(req.tenantId, req.params.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (user.role_name === 'Admin' && isLast) {
      throw new PermissionError('Cannot deactivate the last admin user');
    }

    const updated = await usersModel.updateUser(req.tenantId, req.params.id, { is_active: false });

    auditLog(req, 'DELETE', 'user', req.params.id, user, updated);

    return success(res, updated, 'User deactivated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/users/:id/password
 * Change own password (requires current password).
 */
async function changePassword(req, res, next) {
  try {
    const userId = req.params.id;

    // Users can only change their own password
    if (userId !== req.user.id) {
      throw new PermissionError('You can only change your own password');
    }

    const { current_password, new_password } = req.body;
    validateRequired(req.body, ['current_password', 'new_password']);

    if (!isValidPassword(new_password)) {
      throw new ValidationError('Password must be at least 8 characters with uppercase, lowercase, and number');
    }

    const result = await usersModel.changePassword(req.tenantId, userId, current_password, new_password);

    if (!result.success) {
      throw new ValidationError(result.reason);
    }

    return success(res, null, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  me,
  getById,
  invite,
  update,
  deactivate,
  changePassword,
};
