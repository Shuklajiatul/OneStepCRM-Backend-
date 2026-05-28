/**
 * jobs/webhookQueue.js
 * ─────────────────────────────────────────────────────────
 * Bull queue for outbound webhook delivery.
 * Sends HTTP POST with HMAC-SHA256 signature, exponential backoff retry.
 */

const crypto = require('crypto');
const { createQueue } = require('../config/queue');
const db = require('../config/database');

// Create the webhook queue
const webhookQueue = createQueue('webhook');

/**
 * Process webhook delivery jobs.
 */
webhookQueue.process(async (job) => {
  const { deliveryId, webhookId, endpointUrl, secretKey, eventType, payload } = job.data;

  // Update delivery attempt count
  await db.query(
    'UPDATE webhook_deliveries SET attempts = attempts + 1 WHERE id = $1',
    [deliveryId]
  );

  // Build request
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'X-OneStepCRM-Event': eventType,
    'X-OneStepCRM-Delivery': deliveryId,
  };

  // Add HMAC signature if secret key is set
  if (secretKey) {
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(body)
      .digest('hex');
    headers['X-OneStepCRM-Signature'] = `sha256=${signature}`;
  }

  try {
    // Use native fetch (Node 18+)
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseBody = await response.text().catch(() => '');
    const httpStatus = response.status;

    if (response.ok) {
      // Success — mark delivery as completed
      await db.query(
        `UPDATE webhook_deliveries
         SET status = 'success', http_status_code = $1, response_body = $2, completed_at = NOW()
         WHERE id = $3`,
        [httpStatus, responseBody.substring(0, 1000), deliveryId]
      );

      // Reset failure count on webhook
      await db.query(
        'UPDATE webhooks SET last_triggered_at = NOW(), failure_count = 0 WHERE id = $1',
        [webhookId]
      );
    } else {
      // HTTP error — will be retried by Bull
      await db.query(
        `UPDATE webhook_deliveries
         SET http_status_code = $1, response_body = $2
         WHERE id = $3`,
        [httpStatus, responseBody.substring(0, 1000), deliveryId]
      );

      throw new Error(`Webhook returned HTTP ${httpStatus}`);
    }
  } catch (err) {
    // Network/timeout error
    if (job.attemptsMade >= 2) {
      // Final attempt failed — mark as failed
      await db.query(
        `UPDATE webhook_deliveries SET status = 'failed', completed_at = NOW() WHERE id = $1`,
        [deliveryId]
      );

      // Increment failure count
      await db.query(
        'UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = $1',
        [webhookId]
      );
    }

    throw err; // Let Bull handle retry
  }
});

/**
 * Dispatch a webhook event to all subscribers.
 *
 * @param {string} tenantId
 * @param {string} eventType - e.g., 'lead.created', 'deal.won'
 * @param {object} payload - Event data
 */
async function dispatchWebhook(tenantId, eventType, payload) {
  try {
    // Find all active webhooks for this tenant+event
    const result = await db.query(
      `SELECT id, endpoint_url, secret_key
       FROM webhooks
       WHERE tenant_id = $1 AND is_active = true AND $2 = ANY(events)`,
      [tenantId, eventType]
    );

    for (const webhook of result.rows) {
      // Create delivery record
      const deliveryResult = await db.query(
        `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [webhook.id, eventType, JSON.stringify(payload)]
      );

      const deliveryId = deliveryResult.rows[0].id;

      // Enqueue for async processing
      await webhookQueue.add('deliver', {
        deliveryId,
        webhookId: webhook.id,
        endpointUrl: webhook.endpoint_url,
        secretKey: webhook.secret_key,
        eventType,
        payload,
      });
    }
  } catch (err) {
    console.error('[WebhookQueue] Failed to dispatch webhooks:', err.message);
  }
}

module.exports = {
  webhookQueue,
  dispatchWebhook,
  publishWebhook: dispatchWebhook,
};
