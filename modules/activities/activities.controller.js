/**
 * modules/activities/activities.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Activities.
 */

const activitiesModel = require('./activities.model');
const usersModel = require('../users/users.model');
const leadsModel = require('../leads/leads.model');
const contactsModel = require('../contacts/contacts.model');
const companiesModel = require('../companies/companies.model');
const dealsModel = require('../deals/deals.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID } = require('../../utils/validators');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');
const { publishWebhook } = require('../../jobs/webhookQueue');

const ALLOWED_ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'task', 'sms', 'whatsapp'];
const ALLOWED_ENTITY_TYPES = ['lead', 'contact', 'company', 'deal'];
const ALLOWED_CALL_OUTCOMES = ['connected', 'no_answer', 'busy', 'left_voicemail'];

/**
 * Helper to verify that the polymorphic target entity exists.
 */
async function verifyEntityExists(tenantId, entityType, entityId) {
  let entity = null;
  switch (entityType) {
    case 'lead':
      entity = await leadsModel.getLeadById(tenantId, entityId);
      break;
    case 'contact':
      entity = await contactsModel.getContactById(tenantId, entityId);
      break;
    case 'company':
      entity = await companiesModel.getCompanyById(tenantId, entityId);
      break;
    case 'deal':
      entity = await dealsModel.getDealById(tenantId, entityId);
      break;
  }
  return !!entity;
}

/**
 * GET /api/activities
 */
async function list(req, res, next) {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, owner_id, activity_type, entity_type, entity_id, is_completed, include_deleted } = req.query;

    if (activity_type) {
      validateEnum(activity_type, ALLOWED_ACTIVITY_TYPES, 'activity_type');
    }
    if (entity_type) {
      validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');
    }

    const { activities, total } = await activitiesModel.listActivities(req.tenantId, {
      limit,
      offset,
      search,
      ownerId: owner_id,
      activityType: activity_type,
      entityType: entity_type,
      entityId: entity_id,
      isCompleted: is_completed !== undefined ? is_completed === 'true' : undefined,
      includeDeleted: include_deleted === 'true'
    });

    return success(res, activities, 'Activities retrieved', buildMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/activities/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid activity ID');
    }

    const activity = await activitiesModel.getActivityById(req.tenantId, req.params.id);
    if (!activity) {
      throw new NotFoundError('Activity not found');
    }

    return success(res, activity, 'Activity retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/activities
 */
async function create(req, res, next) {
  try {
    const {
      owner_id, activity_type, entity_type, entity_id, subject,
      description, due_date, completed_at, is_completed,
      call_duration_seconds, call_outcome, metadata
    } = req.body;

    validateRequired(req.body, ['owner_id', 'activity_type', 'entity_type', 'entity_id']);
    validateEnum(activity_type, ALLOWED_ACTIVITY_TYPES, 'activity_type');
    validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');

    if (!isValidUUID(owner_id)) {
      throw new ValidationError('Invalid owner ID');
    }
    if (!isValidUUID(entity_id)) {
      throw new ValidationError('Invalid entity ID');
    }

    // Verify owner exists
    const owner = await usersModel.getUserById(req.tenantId, owner_id);
    if (!owner) {
      throw new ValidationError('Owner user does not exist in this tenant');
    }

    // Verify polymorphic entity exists
    const entityExists = await verifyEntityExists(req.tenantId, entity_type, entity_id);
    if (!entityExists) {
      throw new ValidationError(`Referenced ${entity_type} with ID ${entity_id} does not exist in this tenant`);
    }

    if (call_outcome) {
      validateEnum(call_outcome, ALLOWED_CALL_OUTCOMES, 'call_outcome');
    }

    const activity = await activitiesModel.createActivity(req.tenantId, {
      ownerId: owner_id,
      activityType: activity_type,
      entityType: entity_type,
      entityId: entity_id,
      subject,
      description,
      dueDate: due_date,
      completedAt: completed_at,
      isCompleted: is_completed,
      callDurationSeconds: call_duration_seconds,
      callOutcome: call_outcome,
      metadata
    });

    publishWebhook(req.tenantId, 'activity.created', activity);
    auditLog(req, 'CREATE', 'activity', activity.id, null, activity);

    return success(res, activity, 'Activity created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/activities/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid activity ID');
    }

    const before = await activitiesModel.getActivityById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Activity not found');
    }

    const {
      owner_id, subject, description, due_date, completed_at,
      is_completed, call_duration_seconds, call_outcome, metadata
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

    if (call_outcome) {
      validateEnum(call_outcome, ALLOWED_CALL_OUTCOMES, 'call_outcome');
    }

    const activity = await activitiesModel.updateActivity(req.tenantId, req.params.id, {
      ownerId: owner_id,
      subject,
      description,
      dueDate: due_date,
      completedAt: completed_at,
      isCompleted: is_completed,
      callDurationSeconds: call_duration_seconds,
      callOutcome: call_outcome,
      metadata
    });

    if (!activity) {
      throw new NotFoundError('Activity not found or deleted');
    }

    publishWebhook(req.tenantId, 'activity.updated', activity);
    auditLog(req, 'UPDATE', 'activity', activity.id, before, activity);

    return success(res, activity, 'Activity updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/activities/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid activity ID');
    }

    const before = await activitiesModel.getActivityById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Activity not found');
    }

    await activitiesModel.deleteActivity(req.tenantId, req.params.id);

    publishWebhook(req.tenantId, 'activity.deleted', { id: req.params.id });
    auditLog(req, 'DELETE', 'activity', req.params.id, before, null);

    return success(res, null, 'Activity deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/activities/:id/restore
 */
async function restore(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid activity ID');
    }

    const activity = await activitiesModel.restoreActivity(req.tenantId, req.params.id);
    if (!activity) {
      throw new NotFoundError('Activity not found in deleted records');
    }

    publishWebhook(req.tenantId, 'activity.restored', activity);
    auditLog(req, 'UPDATE', 'activity', activity.id, { deleted: true }, activity);

    return success(res, activity, 'Activity restored successfully');
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
