/**
 * modules/customFields/customFields.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Custom Field Definitions.
 */

const customFieldsModel = require('./customFields.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID } = require('../../utils/validators');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { toFieldKey } = require('../../utils/slugify');
const { auditLog } = require('../../middlewares/auditLogger');

const ALLOWED_ENTITY_TYPES = ['lead', 'contact', 'company', 'deal'];
const ALLOWED_FIELD_TYPES = [
  'text', 'number', 'date', 'dropdown', 'multi_select',
  'checkbox', 'url', 'phone', 'email', 'textarea', 'currency'
];

/**
 * GET /api/custom-fields
 */
async function list(req, res, next) {
  try {
    const { entity_type } = req.query;
    if (entity_type) {
      validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');
    }

    const fields = await customFieldsModel.listDefinitions(req.tenantId, entity_type);
    return success(res, fields, 'Custom fields retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/custom-fields/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid field definition ID');
    }

    const field = await customFieldsModel.getDefinitionById(req.tenantId, req.params.id);
    if (!field) {
      throw new NotFoundError('Custom field definition not found');
    }

    return success(res, field, 'Custom field retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/custom-fields
 */
async function create(req, res, next) {
  try {
    const { entity_type, field_label, field_type, options, is_required, is_visible, display_order, section_name } = req.body;

    validateRequired(req.body, ['entity_type', 'field_label', 'field_type']);
    validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');
    validateEnum(field_type, ALLOWED_FIELD_TYPES, 'field_type');

    // Generate snake_case field key from label
    const fieldKey = toFieldKey(field_label);
    if (!fieldKey) {
      throw new ValidationError('Field label could not be converted to a valid database field key');
    }

    // Check if key already exists for tenant & entity type
    const exists = await customFieldsModel.existsByKey(req.tenantId, entity_type, fieldKey);
    if (exists) {
      throw new ConflictError(`Custom field with key "${fieldKey}" already exists for ${entity_type}`);
    }

    // Ensure options is array for dropdown/multi_select
    if (['dropdown', 'multi_select'].includes(field_type)) {
      if (!options || !Array.isArray(options) || options.length === 0) {
        throw new ValidationError('Options array is required for dropdown or multi_select fields');
      }
    }

    const field = await customFieldsModel.createDefinition(req.tenantId, {
      entityType: entity_type,
      fieldKey,
      fieldLabel: field_label,
      fieldType: field_type,
      options,
      isRequired: is_required,
      isVisible: is_visible,
      displayOrder: display_order,
      sectionName: section_name
    });

    auditLog(req, 'CREATE', 'custom_field_definition', field.id, null, field);

    return success(res, field, 'Custom field definition created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/custom-fields/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid field definition ID');
    }

    const before = await customFieldsModel.getDefinitionById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Custom field definition not found');
    }

    const { field_label, options, is_required, is_visible, display_order, section_name } = req.body;

    // Entity type, field key and field type cannot be updated to prevent data corruption.
    const updates = {
      field_label,
      options,
      is_required,
      is_visible,
      display_order,
      section_name
    };

    // Ensure options is valid array for dropdown/multi_select
    if (['dropdown', 'multi_select'].includes(before.field_type) && options !== undefined) {
      if (!options || !Array.isArray(options) || options.length === 0) {
        throw new ValidationError('Options array is required for dropdown or multi_select fields');
      }
    }

    const field = await customFieldsModel.updateDefinition(req.tenantId, req.params.id, updates);

    auditLog(req, 'UPDATE', 'custom_field_definition', field.id, before, field);

    return success(res, field, 'Custom field definition updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/custom-fields/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid field definition ID');
    }

    const field = await customFieldsModel.getDefinitionById(req.tenantId, req.params.id);
    if (!field) {
      throw new NotFoundError('Custom field definition not found');
    }

    await customFieldsModel.deleteDefinition(req.tenantId, req.params.id);

    auditLog(req, 'DELETE', 'custom_field_definition', req.params.id, field, null);

    return success(res, null, 'Custom field definition deleted successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
