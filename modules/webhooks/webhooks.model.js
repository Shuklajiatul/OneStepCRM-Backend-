/**
 * modules/webhooks/webhooks.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Webhook Subscriptions and Delivery Logs.
 */

const db = require('../../config/database');

/**
 * List all webhooks for a tenant.
 */
async function listWebhooks(tenantId) {
  const result = await db.query(
    `SELECT id, tenant_id, name, endpoint_url, events, is_active, last_triggered_at, failure_count, created_at, updated_at
     FROM webhooks
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows;
}

/**
 * Get a single webhook by ID.
 */
async function getWebhookById(tenantId, id) {
  const result = await db.query(
    `SELECT id, tenant_id, name, endpoint_url, secret_key, events, is_active, last_triggered_at, failure_count, created_at, updated_at
     FROM webhooks
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new webhook subscription.
 */
async function createWebhook(tenantId, { createdBy, name, endpointUrl, secretKey, events }) {
  const result = await db.query(
    `INSERT INTO webhooks (tenant_id, created_by, name, endpoint_url, secret_key, events)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, endpoint_url, events, is_active, created_at`,
    [tenantId, createdBy, name, endpointUrl, secretKey, events]
  );
  return result.rows[0];
}

/**
 * Update an existing webhook.
 */
async function updateWebhook(tenantId, id, updates) {
  const allowedFields = ['name', 'endpoint_url', 'secret_key', 'events', 'is_active'];
  const setClauses = [];
  const params = [tenantId, id];
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
    `UPDATE webhooks
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1
     RETURNING id, name, endpoint_url, events, is_active, updated_at`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Delete a webhook.
 */
async function deleteWebhook(tenantId, id) {
  const result = await db.query(
    'DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * List delivery attempts/logs for a specific webhook.
 */
async function listDeliveries(tenantId, webhookId, { limit, offset }) {
  // First verify webhook belongs to tenant
  const webhookCheck = await db.query(
    'SELECT 1 FROM webhooks WHERE id = $1 AND tenant_id = $2',
    [webhookId, tenantId]
  );
  if (webhookCheck.rows.length === 0) return { deliveries: [], total: 0 };

  const countResult = await db.query(
    'SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = $1',
    [webhookId]
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await db.query(
    `SELECT id, webhook_id, event_type, status, http_status_code, response_body, attempts, created_at, completed_at
     FROM webhook_deliveries
     WHERE webhook_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [webhookId, limit, offset]
  );

  return { deliveries: dataResult.rows, total };
}

module.exports = {
  listWebhooks,
  getWebhookById,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listDeliveries
};
