/**
 * modules/companies/companies.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Companies.
 */

const companiesModel = require('./companies.model');
const usersModel = require('../users/users.model');
const customFieldsModel = require('../customFields/customFields.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID, validateCustomFields } = require('../../utils/validators');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');
const { publishWebhook } = require('../../jobs/webhookQueue');

const ALLOWED_SIZES = ['1-10', '11-50', '51-200', '200+'];

/**
 * GET /api/companies
 */
async function list(req, res, next) {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, owner_id, industry, company_size, tag, include_deleted } = req.query;

    if (company_size) {
      validateEnum(company_size, ALLOWED_SIZES, 'company_size');
    }

    const { companies, total } = await companiesModel.listCompanies(req.tenantId, {
      limit,
      offset,
      search,
      ownerId: owner_id,
      industry,
      companySize: company_size,
      tag,
      includeDeleted: include_deleted === 'true'
    });

    return success(res, companies, 'Companies retrieved', buildMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/companies/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid company ID');
    }

    const company = await companiesModel.getCompanyById(req.tenantId, req.params.id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    return success(res, company, 'Company retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/companies
 */
async function create(req, res, next) {
  try {
    const {
      owner_id, name, website, industry, company_size,
      annual_revenue, employee_count, billing_address,
      shipping_address, custom_properties, tags
    } = req.body;

    validateRequired(req.body, ['name', 'owner_id']);
    if (!isValidUUID(owner_id)) {
      throw new ValidationError('Invalid owner ID');
    }

    // Verify owner exists
    const owner = await usersModel.getUserById(req.tenantId, owner_id);
    if (!owner) {
      throw new ValidationError('Owner user does not exist in this tenant');
    }

    if (company_size) {
      validateEnum(company_size, ALLOWED_SIZES, 'company_size');
    }

    // Custom properties validation
    const customProps = custom_properties || {};
    const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'company');
    validateCustomFields(customProps, fieldDefs);

    const company = await companiesModel.createCompany(req.tenantId, {
      ownerId: owner_id,
      name,
      website,
      industry,
      companySize: company_size,
      annualRevenue: annual_revenue,
      employeeCount: employee_count,
      billingAddress: billing_address,
      shippingAddress: shipping_address,
      customProperties: customProps,
      tags
    });

    // Publish webhook event
    publishWebhook(req.tenantId, 'company.created', company);

    // Audit log
    auditLog(req, 'CREATE', 'company', company.id, null, company);

    return success(res, company, 'Company created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/companies/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid company ID');
    }

    const before = await companiesModel.getCompanyById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Company not found');
    }

    const {
      owner_id, name, website, industry, company_size,
      annual_revenue, employee_count, billing_address,
      shipping_address, custom_properties, tags
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

    if (company_size) {
      validateEnum(company_size, ALLOWED_SIZES, 'company_size');
    }

    // Custom properties validation if provided
    let customProps = before.custom_properties;
    if (custom_properties) {
      customProps = { ...before.custom_properties, ...custom_properties };
      const fieldDefs = await customFieldsModel.listDefinitions(req.tenantId, 'company');
      validateCustomFields(customProps, fieldDefs);
    }

    const company = await companiesModel.updateCompany(req.tenantId, req.params.id, {
      ownerId: owner_id,
      name,
      website,
      industry,
      companySize: company_size,
      annualRevenue: annual_revenue,
      employeeCount: employee_count,
      billingAddress: billing_address,
      shippingAddress: shipping_address,
      customProperties: customProps,
      tags
    });

    if (!company) {
      throw new NotFoundError('Company not found or deleted');
    }

    publishWebhook(req.tenantId, 'company.updated', company);
    auditLog(req, 'UPDATE', 'company', company.id, before, company);

    return success(res, company, 'Company updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/companies/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid company ID');
    }

    const before = await companiesModel.getCompanyById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Company not found');
    }

    await companiesModel.deleteCompany(req.tenantId, req.params.id);

    publishWebhook(req.tenantId, 'company.deleted', { id: req.params.id });
    auditLog(req, 'DELETE', 'company', req.params.id, before, null);

    return success(res, null, 'Company deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/companies/:id/restore
 */
async function restore(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid company ID');
    }

    const company = await companiesModel.restoreCompany(req.tenantId, req.params.id);
    if (!company) {
      throw new NotFoundError('Company not found in deleted records');
    }

    publishWebhook(req.tenantId, 'company.restored', company);
    auditLog(req, 'UPDATE', 'company', company.id, { deleted: true }, company);

    return success(res, company, 'Company restored successfully');
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
