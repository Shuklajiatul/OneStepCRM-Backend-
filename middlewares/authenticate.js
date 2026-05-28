/**
 * middlewares/authenticate.js
 * ─────────────────────────────────────────────────────────
 * JWT authentication middleware.
 * Verifies access tokens, checks Redis blacklist, and provides token generation.
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const config = require('../config/environment');
const { isMemberOfSet, addToSet } = require('../config/redis');
const db = require('../config/database');
const { AuthError } = require('../utils/errors');

const JWT_BLACKLIST_SET = 'jwt:blacklist';

/**
 * Express middleware: verify JWT access token from Authorization header.
 * On success, attaches req.user = { id, tenantId, email, roleProfileId, name }
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError('Access token is required', 'TOKEN_MISSING');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AuthError('Access token is required', 'TOKEN_MISSING');
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthError('Access token has expired', 'TOKEN_EXPIRED');
      }
      throw new AuthError('Invalid access token', 'TOKEN_INVALID');
    }

    // Check Redis blacklist for revoked tokens
    const isBlacklisted = await isMemberOfSet(JWT_BLACKLIST_SET, decoded.jti);
    if (isBlacklisted) {
      throw new AuthError('Token has been revoked', 'TOKEN_REVOKED');
    }

    // Attach user info to request
    req.user = {
      id: decoded.sub,
      tenantId: decoded.tenantId,
      email: decoded.email,
      roleProfileId: decoded.roleProfileId,
      name: decoded.name,
    };

    // Store the raw token and jti for logout
    req.tokenJti = decoded.jti;
    req.tokenExp = decoded.exp;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Generate access token (JWT, 15 min) and refresh token (UUID, stored hashed in DB).
 *
 * @param {object} user - User record from DB
 * @param {string} user.id - User UUID
 * @param {string} user.tenant_id - Tenant UUID
 * @param {string} user.email
 * @param {string} user.role_profile_id
 * @param {string} user.name
 * @param {object} [meta] - Optional metadata
 * @param {string} [meta.userAgent] - Request user agent
 * @param {string} [meta.ipAddress] - Request IP
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
async function generateTokens(user, meta = {}) {
  const jti = uuidv4();

  // Access token — short-lived JWT
  const accessToken = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      roleProfileId: user.role_profile_id,
      name: user.name,
      jti,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiry }
  );

  // Refresh token — random UUID, stored hashed in DB
  const refreshToken = uuidv4();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.jwt.refreshExpiryDays);

  // Store hashed refresh token in DB
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshTokenHash, expiresAt, meta.userAgent || null, meta.ipAddress || null]
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes in seconds
  };
}

/**
 * Add a JWT's jti to the Redis blacklist.
 * TTL is set to the token's remaining lifetime.
 *
 * @param {string} jti - JWT ID
 * @param {number} exp - JWT expiration timestamp (epoch seconds)
 */
async function blacklistToken(jti, exp) {
  const ttl = exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await addToSet(JWT_BLACKLIST_SET, jti, ttl);
  }
}

module.exports = {
  authenticate,
  generateTokens,
  blacklistToken,
};
