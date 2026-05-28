/**
 * modules/users/users.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for user management.
 */

const db = require('../../config/database');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

/**
 * List users for a tenant with filtering, search, and pagination.
 */
async function listUsers(tenantId, { limit, offset, search, roleProfileId, isActive }) {
  let whereConditions = ['u.tenant_id = $1'];
  let params = [tenantId];
  let paramIndex = 2;

  if (search) {
    whereConditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (roleProfileId) {
    whereConditions.push(`u.role_profile_id = $${paramIndex}`);
    params.push(roleProfileId);
    paramIndex++;
  }

  if (isActive !== undefined) {
    whereConditions.push(`u.is_active = $${paramIndex}`);
    params.push(isActive);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  // Get paginated results
  const dataResult = await db.query(
    `SELECT u.id, u.name, u.email, u.avatar_url, u.is_active, u.last_login_at,
            u.created_at, u.updated_at,
            rp.id as role_profile_id, rp.role_name
     FROM users u
     JOIN role_profiles rp ON u.role_profile_id = rp.id
     WHERE ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { users: dataResult.rows, total };
}

/**
 * Get a single user by ID with role profile details.
 */
async function getUserById(tenantId, userId) {
  const result = await db.query(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.avatar_url, u.is_active,
            u.last_login_at, u.invited_by, u.created_at, u.updated_at,
            rp.id as role_profile_id, rp.role_name, rp.permissions
     FROM users u
     JOIN role_profiles rp ON u.role_profile_id = rp.id
     WHERE u.id = $1 AND u.tenant_id = $2`,
    [userId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new user (for invite flow).
 */
async function createUser(tenantId, { name, email, passwordHash, roleProfileId, invitedBy, invitationToken, invitationExpiresAt }) {
  const result = await db.query(
    `INSERT INTO users (tenant_id, role_profile_id, name, email, password_hash, invited_by, invitation_token, invitation_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, tenant_id, role_profile_id, name, email, avatar_url, is_active, created_at`,
    [tenantId, roleProfileId, name, email, passwordHash, invitedBy, invitationToken, invitationExpiresAt]
  );
  return result.rows[0];
}

/**
 * Update a user's profile.
 */
async function updateUser(tenantId, userId, updates) {
  const allowedFields = ['name', 'role_profile_id', 'is_active', 'avatar_url'];
  const setClauses = [];
  const params = [tenantId, userId];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE users SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1
     RETURNING id, tenant_id, role_profile_id, name, email, avatar_url, is_active, updated_at`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Change a user's password (requires current password verification).
 */
async function changePassword(tenantId, userId, currentPassword, newPassword) {
  // Get current hash
  const result = await db.query(
    'SELECT password_hash FROM users WHERE id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );

  if (result.rows.length === 0) return { success: false, reason: 'User not found' };

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!isValid) return { success: false, reason: 'Current password is incorrect' };

  // Hash and update new password
  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
    [newHash, userId, tenantId]
  );

  return { success: true };
}

/**
 * Check if user is the last admin in the tenant.
 */
async function isLastAdmin(tenantId, userId) {
  const result = await db.query(
    `SELECT COUNT(*) as admin_count
     FROM users u
     JOIN role_profiles rp ON u.role_profile_id = rp.id
     WHERE u.tenant_id = $1 AND rp.role_name = 'Admin' AND rp.is_system_role = true
       AND u.is_active = true AND u.id != $2`,
    [tenantId, userId]
  );
  return parseInt(result.rows[0].admin_count, 10) === 0;
}

/**
 * Get user count for a tenant (for plan limit checking).
 */
async function getUserCount(tenantId) {
  const result = await db.query(
    'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND is_active = true',
    [tenantId]
  );
  return parseInt(result.rows[0].count, 10);
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  isLastAdmin,
  getUserCount,
};
