/**
 * modules/contacts/contacts.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Contacts.
 */

const contactsModel = require('./contacts.model');
const usersModel = require('../users/users.model');
const companiesModel = require('../companies/companies.model');
const customFieldsModel = require('../customFields/customFields.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID, isValidEmail, validateCustomFields } = require('../../utils/validators');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');
const { publishWebhook } = require('../../jobs/webhookQueue');

const ALLOWED_LIFECYCLE_STAGES = ['subscriber', 'lead', 'opportunity', 'customer', 'evangelist'];

/**
 * GET /api/contacts
 */
async function list(req, res, next) {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, owner_id, company_id, lifecycle_stage, tag, include_deleted } = req.query;

    if (lifecycle_stage) {
      validateEnum(lifecycle_stage, ALLOWED_LIFECYCLE_STAGES, 'lifecycle_stage');
    }

    const { contacts, total } = await contactsModel.listContacts(req.tenantId, {
      limit,
      offset,
      search,
      ownerId: owner_id,
      companyId: company_id,
      lifecycleStage: lifecycle_stage,
      tag,
      includeDeleted: include_deleted === 'true'
    });

    return success(res, contacts, 'Contacts retrieved', buildMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/contacts/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid contact ID');
    }

    const contact = await contactsModel.getContactById(req.tenantId, req.params.id);
    if (!contact) {
      throw new NotFoundError('Contact not found');
    }

    return success(res, contact, 'Contact retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/contacts
 */
async function create(req, res, next) {
  try {
    const {
      owner_id, first_name, last_name, email, phone, mobile,
      job_title, department, company_id, lead_id, lifecycle_stage,
      custom_properties, tags
    } = req.body;

    validateRequired(req.body, ['first_name', 'owner_id']);
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

    if (lifecycle_stage) {
      validateEnum(lifecycle_stage, ALLOWED_LIFECYCLE_STAGES, 'lifecycle_stage');
    }

    // Custom properties validation
    const customProps = custom_properties || {};
    const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'contact');
    validateCustomFields(customProps, fieldDefs);

    const contact = await contactsModel.createContact(req.tenantId, {
      ownerId: owner_id,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      mobile,
      jobTitle: job_title,
      department,
      companyId: company_id,
      leadId: lead_id,
      lifecycleStage: lifecycle_stage,
      customProperties: customProps,
      tags
    });

    publishWebhook(req.tenantId, 'contact.created', contact);
    auditLog(req, 'CREATE', 'contact', contact.id, null, contact);

    return success(res, contact, 'Contact created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/contacts/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid contact ID');
    }

    const before = await contactsModel.getContactById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Contact not found');
    }

    const {
      owner_id, first_name, last_name, email, phone, mobile,
      job_title, department, company_id, lead_id, lifecycle_stage,
      custom_properties, tags
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

    if (company_id) {
      if (!isValidUUID(company_id)) {
        throw new ValidationError('Invalid company ID');
      }
      const company = await companiesModel.getCompanyById(req.tenantId, company_id);
      if (!company) {
        throw new ValidationError('Company does not exist in this tenant');
      }
    }

    if (lifecycle_stage) {
      validateEnum(lifecycle_stage, ALLOWED_LIFECYCLE_STAGES, 'lifecycle_stage');
    }

    // Custom properties validation if provided
    let customProps = before.custom_properties;
    if (custom_properties) {
      customProps = { ...before.custom_properties, ...custom_properties };
      const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'contact');
      validateCustomFields(customProps, fieldDefs);
    }

    const contact = await contactsModel.updateContact(req.tenantId, req.params.id, {
      ownerId: owner_id,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      mobile,
      jobTitle: job_title,
      department,
      companyId: company_id,
      leadId: lead_id,
      lifecycleStage: lifecycle_stage,
      customProperties: customProps,
      tags
    });

    if (!contact) {
      throw new NotFoundError('Contact not found or deleted');
    }

    publishWebhook(req.tenantId, 'contact.updated', contact);
    auditLog(req, 'UPDATE', 'contact', contact.id, before, contact);

    return success(res, contact, 'Contact updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/contacts/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid contact ID');
    }

    const before = await contactsModel.getContactById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Contact not found');
    }

    await contactsModel.deleteContact(req.tenantId, req.params.id);

    publishWebhook(req.tenantId, 'contact.deleted', { id: req.params.id });
    auditLog(req, 'DELETE', 'contact', req.params.id, before, null);

    return success(res, null, 'Contact deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/contacts/:id/restore
 */
async function restore(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid contact ID');
    }

    const contact = await contactsModel.restoreContact(req.tenantId, req.params.id);
    if (!contact) {
      throw new NotFoundError('Contact not found in deleted records');
    }

    publishWebhook(req.tenantId, 'contact.restored', contact);
    auditLog(req, 'UPDATE', 'contact', contact.id, { deleted: true }, contact);

    return success(res, contact, 'Contact restored successfully');
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
