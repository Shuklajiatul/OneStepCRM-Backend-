/**
 * modules/tenant/tenant.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Tenant settings management.
 */

const tenantModel = require('./tenant.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired } = require('../../utils/validators');
const { NotFoundError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');
const { publishWebhook } = require('../../jobs/webhookQueue');

/**
 * GET /api/tenant
 * Get details for current tenant.
 */
async function getDetails(req, res, next) {
  try {
    const tenant = await tenantModel.getTenantById(req.tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    return success(res, tenant, 'Tenant settings retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/tenant
 * Update current tenant settings.
 */
async function updateDetails(req, res, next) {
  try {
    const before = await tenantModel.getTenantById(req.tenantId);
    if (!before) {
      throw new NotFoundError('Tenant not found');
    }

    const { company_name, settings } = req.body;

    const tenant = await tenantModel.updateTenant(req.tenantId, {
      companyName: company_name,
      settings
    });

    publishWebhook(req.tenantId, 'tenant.updated', tenant);
    auditLog(req, 'UPDATE', 'tenant', tenant.id, before, tenant);

    return success(res, tenant, 'Tenant settings updated successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDetails,
  updateDetails
};
