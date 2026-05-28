/**
 * modules/deals/deals.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Deals.
 */

const dealsModel = require('./deals.model');
const usersModel = require('../users/users.model');
const contactsModel = require('../contacts/contacts.model');
const companiesModel = require('../companies/companies.model');
const pipelinesModel = require('../pipelines/pipelines.model');
const customFieldsModel = require('../customFields/customFields.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID, validateCustomFields } = require('../../utils/validators');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');
const { publishWebhook } = require('../../jobs/webhookQueue');

const ALLOWED_STATUSES = ['open', 'won', 'lost'];

/**
 * GET /api/deals
 */
async function list(req, res, next) {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, owner_id, pipeline_id, stage_id, status, tag, contact_id, company_id, include_deleted } = req.query;

    if (status) {
      validateEnum(status, ALLOWED_STATUSES, 'status');
    }

    const { deals, total } = await dealsModel.listDeals(req.tenantId, {
      limit,
      offset,
      search,
      ownerId: owner_id,
      pipelineId: pipeline_id,
      stageId: stage_id,
      status,
      tag,
      contactId: contact_id,
      companyId: company_id,
      includeDeleted: include_deleted === 'true'
    });

    return success(res, deals, 'Deals retrieved', buildMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/deals/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid deal ID');
    }

    const deal = await dealsModel.getDealById(req.tenantId, req.params.id);
    if (!deal) {
      throw new NotFoundError('Deal not found');
    }

    return success(res, deal, 'Deal retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/deals
 */
async function create(req, res, next) {
  try {
    const {
      owner_id, title, contact_id, company_id, pipeline_id, stage_id,
      deal_value, currency, probability, expected_close_date, status,
      lost_reason, custom_properties, tags
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

    // Verify contact exists if provided
    if (contact_id) {
      if (!isValidUUID(contact_id)) {
        throw new ValidationError('Invalid contact ID');
      }
      const contact = await contactsModel.getContactById(req.tenantId, contact_id);
      if (!contact) {
        throw new ValidationError('Contact does not exist in this tenant');
      }
    }

    // Verify company exists if provided
    if (company_id) {
      if (!isValidUUID(company_id)) {
        throw new ValidationError('Invalid company ID');
      }
      const company = await companiesModel.getCompanyById(req.tenantId, company_id);
      if (!company) {
        throw new ValidationError('Company does not exist in this tenant');
      }
    }

    // Resolve default pipeline and stage if not provided
    let finalPipelineId = pipeline_id;
    let finalStageId = stage_id;

    if (!finalPipelineId || !finalStageId) {
      const defaultPipeline = await pipelinesModel.getDefaultPipeline(req.tenantId, 'deal');
      if (defaultPipeline) {
        finalPipelineId = defaultPipeline.id;
        if (defaultPipeline.stages && defaultPipeline.stages.length > 0) {
          finalStageId = defaultPipeline.stages[0].id;
        }
      }
    }

    // Verify pipeline & stage if explicitly provided
    if (finalPipelineId) {
      if (!isValidUUID(finalPipelineId)) {
        throw new ValidationError('Invalid pipeline ID');
      }
      const pipeline = await pipelinesModel.getPipelineById(req.tenantId, finalPipelineId);
      if (!pipeline) {
        throw new ValidationError('Pipeline does not exist in this tenant');
      }

      if (finalStageId) {
        if (!isValidUUID(finalStageId)) {
          throw new ValidationError('Invalid stage ID');
        }
        const stageExists = pipeline.stages.some(s => s.id === finalStageId);
        if (!stageExists) {
          throw new ValidationError('Pipeline stage does not belong to the selected pipeline');
        }
      }
    }

    if (status) {
      validateEnum(status, ALLOWED_STATUSES, 'status');
    }

    // Custom properties validation
    const customProps = custom_properties || {};
    const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'deal');
    validateCustomFields(customProps, fieldDefs);

    const deal = await dealsModel.createDeal(req.tenantId, {
      ownerId: owner_id,
      title,
      contactId: contact_id,
      companyId: company_id,
      pipelineId: finalPipelineId,
      stageId: finalStageId,
      dealValue: deal_value,
      currency,
      probability,
      expectedCloseDate: expected_close_date,
      status,
      lostReason: lost_reason,
      customProperties: customProps,
      tags
    });

    publishWebhook(req.tenantId, 'deal.created', deal);
    auditLog(req, 'CREATE', 'deal', deal.id, null, deal);

    return success(res, deal, 'Deal created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/deals/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid deal ID');
    }

    const before = await dealsModel.getDealById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Deal not found');
    }

    const {
      owner_id, title, contact_id, company_id, pipeline_id, stage_id,
      deal_value, currency, probability, expected_close_date, status,
      lost_reason, custom_properties, tags
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

    if (contact_id) {
      if (!isValidUUID(contact_id)) {
        throw new ValidationError('Invalid contact ID');
      }
      const contact = await contactsModel.getContactById(req.tenantId, contact_id);
      if (!contact) {
        throw new ValidationError('Contact does not exist in this tenant');
      }
    }

    if (company_id) {
      if (!isValidUUID(company_id)) {
        throw new ValidationError('Invalid company ID');
      }
      const company = await companiesModel.getCompanyById(req.tenantId, company_id);
      if (!company) {
        throw new ValidationError('Company does not exist in this tenant');
      }
    }

    // Verify pipeline & stage update
    const finalPipelineId = pipeline_id || before.pipeline_id;
    const finalStageId = stage_id || before.stage_id;

    if (pipeline_id || stage_id) {
      if (finalPipelineId) {
        if (!isValidUUID(finalPipelineId)) {
          throw new ValidationError('Invalid pipeline ID');
        }
        const pipeline = await pipelinesModel.getPipelineById(req.tenantId, finalPipelineId);
        if (!pipeline) {
          throw new ValidationError('Pipeline does not exist in this tenant');
        }

        if (finalStageId) {
          if (!isValidUUID(finalStageId)) {
            throw new ValidationError('Invalid stage ID');
          }
          const stageExists = pipeline.stages.some(s => s.id === finalStageId);
          if (!stageExists) {
            throw new ValidationError('Pipeline stage does not belong to the selected pipeline');
          }
        }
      }
    }

    if (status) {
      validateEnum(status, ALLOWED_STATUSES, 'status');
    }

    // Custom properties validation if provided
    let customProps = before.custom_properties;
    if (custom_properties) {
      customProps = { ...before.custom_properties, ...custom_properties };
      const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'deal');
      validateCustomFields(customProps, fieldDefs);
    }

    const deal = await dealsModel.updateDeal(req.tenantId, req.params.id, {
      ownerId: owner_id,
      title,
      contactId: contact_id,
      companyId: company_id,
      pipelineId: finalPipelineId,
      stageId: finalStageId,
      dealValue: deal_value,
      currency,
      probability,
      expectedCloseDate: expected_close_date,
      status,
      lostReason: lost_reason,
      customProperties: customProps,
      tags
    });

    if (!deal) {
      throw new NotFoundError('Deal not found or deleted');
    }

    publishWebhook(req.tenantId, 'deal.updated', deal);
    auditLog(req, 'UPDATE', 'deal', deal.id, before, deal);

    return success(res, deal, 'Deal updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/deals/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid deal ID');
    }

    const before = await dealsModel.getDealById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Deal not found');
    }

    await dealsModel.deleteDeal(req.tenantId, req.params.id);

    publishWebhook(req.tenantId, 'deal.deleted', { id: req.params.id });
    auditLog(req, 'DELETE', 'deal', req.params.id, before, null);

    return success(res, null, 'Deal deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/deals/:id/restore
 */
async function restore(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid deal ID');
    }

    const deal = await dealsModel.restoreDeal(req.tenantId, req.params.id);
    if (!deal) {
      throw new NotFoundError('Deal not found in deleted records');
    }

    publishWebhook(req.tenantId, 'deal.restored', deal);
    auditLog(req, 'UPDATE', 'deal', deal.id, { deleted: true }, deal);

    return success(res, deal, 'Deal restored successfully');
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
  restore
};
