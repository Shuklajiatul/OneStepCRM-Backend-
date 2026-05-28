/**
 * modules/leads/leads.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Leads.
 */

const leadsModel = require('./leads.model');
const usersModel = require('../users/users.model');
const customFieldsModel = require('../customFields/customFields.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID, isValidEmail, validateCustomFields } = require('../../utils/validators');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');
const { publishWebhook } = require('../../jobs/webhookQueue');

const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];

/**
 * GET /api/leads
 */
async function list(req, res, next) {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, owner_id, pipeline_stage, priority, tag, include_deleted } = req.query;

    if (priority) {
      validateEnum(priority, ALLOWED_PRIORITIES, 'priority');
    }

    const { leads, total } = await leadsModel.listLeads(req.tenantId, {
      limit,
      offset,
      search,
      ownerId: owner_id,
      pipelineStage: pipeline_stage,
      priority,
      tag,
      includeDeleted: include_deleted === 'true'
    });

    return success(res, leads, 'Leads retrieved', buildMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/leads/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid lead ID');
    }

    const lead = await leadsModel.getLeadById(req.tenantId, req.params.id);
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    return success(res, lead, 'Lead retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/leads
 */
async function create(req, res, next) {
  try {
    const {
      owner_id, title, first_name, last_name, email, phone,
      company_name, lead_source, pipeline_stage, priority,
      estimated_value, expected_close_date, custom_properties, tags
    } = req.body;

    validateRequired(req.body, ['title', 'owner_id']);
    if (!isValidUUID(owner_id)) {
      throw new ValidationError('Invalid owner ID');
    }

    // Verify owner exists
    const owner = await usersModel.getUserById(req.tenantId, owner_id);
    if (!owner) {
      throw new ValidationError('Owner user does not exist in this tenant');
    }

    if (email && !isValidEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    if (priority) {
      validateEnum(priority, ALLOWED_PRIORITIES, 'priority');
    }

    // Custom properties validation
    const customProps = custom_properties || {};
    const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'lead');
    validateCustomFields(customProps, fieldDefs);

    const lead = await leadsModel.createLead(req.tenantId, {
      ownerId: owner_id,
      title,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      companyName: company_name,
      leadSource: lead_source,
      pipelineStage: pipeline_stage,
      priority,
      estimatedValue: estimated_value,
      expectedCloseDate: expected_close_date,
      customProperties: customProps,
      tags
    });

    publishWebhook(req.tenantId, 'lead.created', lead);
    auditLog(req, 'CREATE', 'lead', lead.id, null, lead);

    return success(res, lead, 'Lead created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/leads/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid lead ID');
    }

    const before = await leadsModel.getLeadById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Lead not found');
    }

    const {
      owner_id, title, first_name, last_name, email, phone,
      company_name, lead_source, pipeline_stage, priority,
      estimated_value, expected_close_date, custom_properties, tags
    } = req.body;

    if (owner_id) {
      if (!isValidUUID(owner_id)) {
        throw new ValidationError('Invalid owner ID');
      }
      const owner = await usersModel.getUserById(req.tenantId, owner_id);
      if (!owner) {
        throw new ValidationError('Owner user does not exist in this tenant');
      }
    }

    if (email && !isValidEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    if (priority) {
      validateEnum(priority, ALLOWED_PRIORITIES, 'priority');
    }

    // Custom properties validation if provided
    let customProps = before.custom_properties;
    if (custom_properties) {
      customProps = { ...before.custom_properties, ...custom_properties };
      const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'lead');
      validateCustomFields(customProps, fieldDefs);
    }

    const lead = await leadsModel.updateLead(req.tenantId, req.params.id, {
      ownerId: owner_id,
      title,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      companyName: company_name,
      leadSource: lead_source,
      pipelineStage: pipeline_stage,
      priority,
      estimatedValue: estimated_value,
      expectedCloseDate: expected_close_date,
      customProperties: customProps,
      tags
    });

    if (!lead) {
      throw new NotFoundError('Lead not found or deleted');
    }

    publishWebhook(req.tenantId, 'lead.updated', lead);
    auditLog(req, 'UPDATE', 'lead', lead.id, before, lead);

    return success(res, lead, 'Lead updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/leads/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid lead ID');
    }

    const before = await leadsModel.getLeadById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Lead not found');
    }

    await leadsModel.deleteLead(req.tenantId, req.params.id);

    publishWebhook(req.tenantId, 'lead.deleted', { id: req.params.id });
    auditLog(req, 'DELETE', 'lead', req.params.id, before, null);

    return success(res, null, 'Lead deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/leads/:id/restore
 */
async function restore(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid lead ID');
    }

    const lead = await leadsModel.restoreLead(req.tenantId, req.params.id);
    if (!lead) {
      throw new NotFoundError('Lead not found in deleted records');
    }

    publishWebhook(req.tenantId, 'lead.restored', lead);
    auditLog(req, 'UPDATE', 'lead', lead.id, { deleted: true }, lead);

    return success(res, lead, 'Lead restored successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/leads/:id/convert
 * Convert lead into a Contact, Company, and optional Deal.
 */
async function convert(req, res, next) {
  try {
    const leadId = req.params.id;
    if (!isValidUUID(leadId)) {
      throw new ValidationError('Invalid lead ID');
    }

    const { create_deal, deal_name, deal_stage_id, deal_pipeline_id } = req.body;

    if (deal_stage_id && !isValidUUID(deal_stage_id)) {
      throw new ValidationError('Invalid deal stage ID');
    }
    if (deal_pipeline_id && !isValidUUID(deal_pipeline_id)) {
      throw new ValidationError('Invalid deal pipeline ID');
    }

    const result = await leadsModel.convertLead(req.tenantId, leadId, req.user.id, {
      createDeal: create_deal === true,
      dealName: deal_name,
      dealStageId: deal_stage_id,
      dealPipelineId: deal_pipeline_id
    });

    publishWebhook(req.tenantId, 'lead.converted', {
      lead_id: leadId,
      company_id: result.companyId,
      contact_id: result.contact.id,
      deal_id: result.deal ? result.deal.id : null
    });

    auditLog(req, 'UPDATE', 'lead', leadId, { is_converted: false }, { is_converted: true });

    return success(res, result, 'Lead converted successfully');
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
  restore,
  convert
};
