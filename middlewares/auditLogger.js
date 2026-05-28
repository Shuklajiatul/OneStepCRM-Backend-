/**
 * middlewares/auditLogger.js
 * ─────────────────────────────────────────────────────────
 * Audit logging utility — records all CUD operations to audit_logs table.
 * Fire-and-forget: does not add latency to write operations.
 */

const db = require('../config/database');

/**
 * Log an audit event asynchronously (fire and forget).
 * Does NOT await the DB insert — prevents adding latency.
 *
 * @param {object} req - Express request (for user, tenant, IP)
 * @param {string} action - 'CREATE' | 'UPDATE' | 'DELETE'
 * @param {string} entityType - e.g., 'lead', 'contact', 'deal'
 * @param {string} entityId - UUID of the affected record
 * @param {object|null} before - State before change (null for CREATE)
 * @param {object|null} after - State after change (null for DELETE)
 */
function auditLog(req, action, entityType, entityId, before = null, after = null) {
  // Build changes diff
  const changes = {};
  if (before) changes.before = before;
  if (after) changes.after = after;

  const tenantId = req.tenantId || (req.user && req.user.tenantId) || null;
  const userId = (req.user && req.user.id) || null;
  const ipAddress = req.ip || req.connection.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;

  // Fire and forget — do not await
  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, changes, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [tenantId, userId, action, entityType, entityId, JSON.stringify(changes), ipAddress, userAgent]
  ).catch((err) => {
    // Log error but don't crash the process
    console.error('[AuditLog] Failed to write audit log:', err.message);
  });
}

/**
 * Compute a diff between two objects (shallow comparison).
 * Returns only the changed fields.
 *
 * @param {object} before - Original record
 * @param {object} after - Updated record
 * @returns {{ before: object, after: object }}
 */
function computeDiff(before, after) {
  const beforeDiff = {};
  const afterDiff = {};

  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of allKeys) {
    // Skip internal fields
    if (['updated_at', 'created_at'].includes(key)) continue;

    const oldVal = before ? before[key] : undefined;
    const newVal = after ? after[key] : undefined;

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      beforeDiff[key] = oldVal;
      afterDiff[key] = newVal;
    }
  }

  return { before: beforeDiff, after: afterDiff };
}

module.exports = {
  auditLog,
  computeDiff,
};
