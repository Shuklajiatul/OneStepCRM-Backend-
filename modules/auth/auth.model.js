/**
 * modules/auth/auth.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for authentication operations.
 * Raw SQL via pg — no ORM.
 */

const db = require('../../config/database');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

// ─── Default permissions for system roles ─────────────────
const DEFAULT_PERMISSIONS = {
  Admin: {
    leads:       { create: true,  read: true,  update: true,  delete: true  },
    contacts:    { create: true,  read: true,  update: true,  delete: true  },
    companies:   { create: true,  read: true,  update: true,  delete: true  },
    deals:       { create: true,  read: true,  update: true,  delete: true  },
    activities:  { create: true,  read: true,  update: true,  delete: true  },
    pipelines:   { create: true,  read: true,  update: true,  delete: true  },
    reports:     { create: true,  read: true,  update: true,  delete: true  },
    settings:    { create: true,  read: true,  update: true,  delete: true  },
    users:       { create: true,  read: true,  update: true,  delete: true  },
    roles:       { create: true,  read: true,  update: true,  delete: true  },
    webhooks:    { create: true,  read: true,  update: true,  delete: true  },
    customFields:{ create: true,  read: true,  update: true,  delete: true  },
    files:       { create: true,  read: true,  update: true,  delete: true  },
  },
  Manager: {
    leads:       { create: true,  read: true,  update: true,  delete: false },
    contacts:    { create: true,  read: true,  update: true,  delete: false },
    companies:   { create: true,  read: true,  update: true,  delete: false },
    deals:       { create: true,  read: true,  update: true,  delete: false },
    activities:  { create: true,  read: true,  update: true,  delete: true  },
    pipelines:   { create: false, read: true,  update: false, delete: false },
    reports:     { create: false, read: true,  update: false, delete: false },
    settings:    { create: false, read: true,  update: false, delete: false },
    users:       { create: false, read: true,  update: false, delete: false },
    roles:       { create: false, read: true,  update: false, delete: false },
    webhooks:    { create: false, read: true,  update: false, delete: false },
    customFields:{ create: false, read: true,  update: false, delete: false },
    files:       { create: true,  read: true,  update: true,  delete: false },
  },
  Member: {
    leads:       { create: true,  read: true,  update: true,  delete: false },
    contacts:    { create: true,  read: true,  update: true,  delete: false },
    companies:   { create: true,  read: true,  update: false, delete: false },
    deals:       { create: true,  read: true,  update: true,  delete: false },
    activities:  { create: true,  read: true,  update: true,  delete: false },
    pipelines:   { create: false, read: true,  update: false, delete: false },
    reports:     { create: false, read: true,  update: false, delete: false },
    settings:    { create: false, read: false, update: false, delete: false },
    users:       { create: false, read: false, update: false, delete: false },
    roles:       { create: false, read: false, update: false, delete: false },
    webhooks:    { create: false, read: false, update: false, delete: false },
    customFields:{ create: false, read: true,  update: false, delete: false },
    files:       { create: true,  read: true,  update: false, delete: false },
  },
};

/**
 * Register a new tenant with an admin user in a single transaction.
 * Creates: tenant → system role profiles → admin user → default pipelines.
 */
async function registerTenant({ companyName, slug, adminName, adminEmail, adminPassword }) {
  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  return db.withTransaction(async (client) => {
    // 1. Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (company_name, slug, plan, settings)
       VALUES ($1, $2, 'starter', $3)
       RETURNING *`,
      [companyName, slug, JSON.stringify({ timezone: 'UTC', currency: 'USD', date_format: 'YYYY-MM-DD' })]
    );
    const tenant = tenantResult.rows[0];

    // 2. Create system role profiles
    const roles = {};
    for (const [roleName, permissions] of Object.entries(DEFAULT_PERMISSIONS)) {
      const roleResult = await client.query(
        `INSERT INTO role_profiles (tenant_id, role_name, is_system_role, permissions)
         VALUES ($1, $2, true, $3)
         RETURNING *`,
        [tenant.id, roleName, JSON.stringify(permissions)]
      );
      roles[roleName] = roleResult.rows[0];
    }

    // 3. Create admin user with Admin role
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, role_profile_id, name, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, role_profile_id, name, email, avatar_url, is_active, created_at`,
      [tenant.id, roles.Admin.id, adminName, adminEmail, passwordHash]
    );
    const user = userResult.rows[0];

    // 4. Create default pipelines
    // Lead pipeline
    const leadPipelineResult = await client.query(
      `INSERT INTO pipelines (tenant_id, name, entity_type, is_default)
       VALUES ($1, 'Default Lead Pipeline', 'lead', true)
       RETURNING id`,
      [tenant.id]
    );
    const leadPipelineId = leadPipelineResult.rows[0].id;

    const leadStages = [
      { name: 'New', order: 0, probability: 10, color: '#6366f1' },
      { name: 'Contacted', order: 1, probability: 25, color: '#8b5cf6' },
      { name: 'Qualified', order: 2, probability: 50, color: '#a855f7' },
      { name: 'Proposal', order: 3, probability: 75, color: '#d946ef' },
      { name: 'Won', order: 4, probability: 100, color: '#22c55e', isWon: true },
      { name: 'Lost', order: 5, probability: 0, color: '#ef4444', isLost: true },
    ];

    for (const stage of leadStages) {
      await client.query(
        `INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, order_index, probability, color, is_won_stage, is_lost_stage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenant.id, leadPipelineId, stage.name, stage.order, stage.probability, stage.color, stage.isWon || false, stage.isLost || false]
      );
    }

    // Deal pipeline
    const dealPipelineResult = await client.query(
      `INSERT INTO pipelines (tenant_id, name, entity_type, is_default)
       VALUES ($1, 'Default Sales Pipeline', 'deal', true)
       RETURNING id`,
      [tenant.id]
    );
    const dealPipelineId = dealPipelineResult.rows[0].id;

    const dealStages = [
      { name: 'Prospecting', order: 0, probability: 10, color: '#6366f1' },
      { name: 'Discovery', order: 1, probability: 20, color: '#8b5cf6' },
      { name: 'Proposal', order: 2, probability: 50, color: '#a855f7' },
      { name: 'Negotiation', order: 3, probability: 75, color: '#d946ef' },
      { name: 'Closed Won', order: 4, probability: 100, color: '#22c55e', isWon: true },
      { name: 'Closed Lost', order: 5, probability: 0, color: '#ef4444', isLost: true },
    ];

    for (const stage of dealStages) {
      await client.query(
        `INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, order_index, probability, color, is_won_stage, is_lost_stage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenant.id, dealPipelineId, stage.name, stage.order, stage.probability, stage.color, stage.isWon || false, stage.isLost || false]
      );
    }

    return { tenant, user };
  });
}

/**
 * Find a user by email and tenant slug (for login).
 */
async function findUserByEmailAndSlug(email, tenantSlug) {
  const result = await db.query(
    `SELECT u.*, t.slug as tenant_slug, t.is_active as tenant_is_active
     FROM users u
     JOIN tenants t ON u.tenant_id = t.id
     WHERE u.email = $1 AND t.slug = $2`,
    [email, tenantSlug]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by ID.
 */
async function findUserById(userId) {
  const result = await db.query(
    `SELECT u.id, u.tenant_id, u.role_profile_id, u.name, u.email, u.avatar_url,
            u.is_active, u.last_login_at, u.created_at, u.updated_at,
            rp.role_name, rp.permissions
     FROM users u
     JOIN role_profiles rp ON u.role_profile_id = rp.id
     WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Update user's last login timestamp.
 */
async function updateLastLogin(userId) {
  await db.query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [userId]
  );
}

/**
 * Find valid (non-revoked, non-expired) refresh tokens for a user.
 */
async function findValidRefreshTokens(userId) {
  const result = await db.query(
    `SELECT * FROM refresh_tokens
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Revoke a specific refresh token.
 */
async function revokeRefreshToken(tokenId) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
    [tokenId]
  );
}

/**
 * Revoke ALL refresh tokens for a user (e.g., on password reset).
 */
async function revokeAllRefreshTokens(userId) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

/**
 * Find a user by invitation/reset token.
 */
async function findUserByResetToken(token) {
  const result = await db.query(
    `SELECT * FROM users
     WHERE invitation_token = $1 AND invitation_expires_at > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * Set password reset token on a user record.
 */
async function setResetToken(userId, tokenHash, expiresAt) {
  await db.query(
    'UPDATE users SET invitation_token = $1, invitation_expires_at = $2, updated_at = NOW() WHERE id = $1',
    [tokenHash, expiresAt]
  );
  // Fix: use correct parameter reference
  await db.query(
    'UPDATE users SET invitation_token = $1, invitation_expires_at = $2, updated_at = NOW() WHERE id = $3',
    [tokenHash, expiresAt, userId]
  );
}

/**
 * Update user password and clear reset token.
 */
async function updatePassword(userId, newPasswordHash) {
  await db.query(
    `UPDATE users
     SET password_hash = $1, invitation_token = NULL, invitation_expires_at = NULL, updated_at = NOW()
     WHERE id = $2`,
    [newPasswordHash, userId]
  );
}

/**
 * Check if a tenant slug already exists.
 */
async function isSlugTaken(slug) {
  const result = await db.query(
    'SELECT id FROM tenants WHERE slug = $1',
    [slug]
  );
  return result.rows.length > 0;
}

/**
 * Check if an email already exists for a tenant.
 */
async function isEmailTaken(email, tenantId) {
  const result = await db.query(
    'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
    [email, tenantId]
  );
  return result.rows.length > 0;
}

module.exports = {
  registerTenant,
  findUserByEmailAndSlug,
  findUserById,
  updateLastLogin,
  findValidRefreshTokens,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  findUserByResetToken,
  setResetToken,
  updatePassword,
  isSlugTaken,
  isEmailTaken,
  BCRYPT_ROUNDS,
};
