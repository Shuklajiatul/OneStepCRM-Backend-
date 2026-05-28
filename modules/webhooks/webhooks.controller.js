/**
 * modules/webhooks/webhooks.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Webhook subscriptions and delivery log viewing.
 */

const webhooksModel = require('./webhooks.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, isValidUUID } = require('../../utils/validators');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');

const ALLOWED_EVENTS = [
  'lead.created', 'lead.updated', 'lead.deleted', 'lead.converted',
  'contact.created', 'contact.updated', 'contact.deleted',
  'company.created', 'company.updated', 'company.deleted',
  'deal.created', 'deal.updated', 'deal.deleted',
  'activity.created', 'activity.updated', 'activity.deleted'
];

/**
 * GET /api/webhooks
 */
async function list(req, res, next) {
  try {
    const webhooks = await webhooksModel.listWebhooks(req.tenantId);
    return success(res, webhooks, 'Webhooks retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/webhooks/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid webhook ID');
    }

    const webhook = await webhooksModel.getWebhookById(req.tenantId, req.params.id);
    if (!webhook) {
      throw new NotFoundError('Webhook subscription not found');
    }

    return success(res, webhook, 'Webhook retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/webhooks
 */
async function create(req, res, next) {
  try {
    const { name, endpoint_url, secret_key, events } = req.body;

    validateRequired(req.body, ['name', 'endpoint_url', 'events']);

    // Validate URL format
    try {
      new URL(endpoint_url);
    } catch {
      throw new ValidationError('Invalid endpoint URL format');
    }

    if (!Array.isArray(events) || events.length === 0) {
      throw new ValidationError('Events must be a non-empty array');
    }

    // Check events list
    for (const event of events) {
      if (!ALLOWED_EVENTS.includes(event)) {
        throw new ValidationError(`Unsupported event: "${event}". Supported: ${ALLOWED_EVENTS.join(', ')}`);
      }
    }

    const webhook = await webhooksModel.createWebhook(req.tenantId, {
      createdBy: req.user.id,
      name,
      endpointUrl: endpoint_url,
      secretKey: secret_key,
      events
    });

    auditLog(req, 'CREATE', 'webhook_subscription', webhook.id, null, webhook);

    return success(res, webhook, 'Webhook subscribed successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/webhooks/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid webhook ID');
    }

    const before = await webhooksModel.getWebhookById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Webhook subscription not found');
    }

    const { name, endpoint_url, secret_key, events, is_active } = req.body;

    if (endpoint_url) {
      try {
        new URL(endpoint_url);
      } catch {
        throw new ValidationError('Invalid endpoint URL format');
      }
    }

    if (events) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new ValidationError('Events must be a non-empty array');
      }
      for (const event of events) {
        if (!ALLOWED_EVENTS.includes(event)) {
          throw new ValidationError(`Unsupported event: "${event}". Supported: ${ALLOWED_EVENTS.join(', ')}`);
        }
      }
    }

    const webhook = await webhooksModel.updateWebhook(req.tenantId, req.params.id, {
      name,
      endpointUrl: endpoint_url,
      secretKey: secret_key,
      events,
      isActive: is_active
    });

    if (!webhook) {
      throw new NotFoundError('Webhook subscription not found');
    }

    auditLog(req, 'UPDATE', 'webhook_subscription', webhook.id, before, webhook);

    return success(res, webhook, 'Webhook updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/webhooks/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid webhook ID');
    }

    const before = await webhooksModel.getWebhookById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Webhook subscription not found');
    }

    await webhooksModel.deleteWebhook(req.tenantId, req.params.id);

    auditLog(req, 'DELETE', 'webhook_subscription', req.params.id, before, null);

    return success(res, null, 'Webhook deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/webhooks/:id/deliveries
 * Fetch history of webhook triggers and delivery responses.
 */
async function getDeliveries(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid webhook ID');
    }

    const { limit, offset, page } = parsePagination(req.query);

    const { deliveries, total } = await webhooksModel.listDeliveries(req.tenantId, req.params.id, { limit, offset });

    return success(res, deliveries, 'Webhook deliveries retrieved', buildMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getDeliveries
};
