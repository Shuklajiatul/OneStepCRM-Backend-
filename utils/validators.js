/**
 * utils/validators.js
 * ─────────────────────────────────────────────────────────
 * Input validation helpers for common data types.
 */

const { ValidationError } = require('./errors');

/**
 * Validate that a string is a valid email address.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate that a string is a valid UUID v4.
 * @param {string} id
 * @returns {boolean}
 */
function isValidUUID(id) {
  if (!id || typeof id !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Validate a tenant slug: lowercase alphanumeric + hyphens, 3-50 chars.
 * @param {string} slug
 * @returns {boolean}
 */
function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
  return slugRegex.test(slug);
}

/**
 * Validate a password meets minimum requirements.
 * At least 8 characters, one uppercase, one lowercase, one number.
 * @param {string} password
 * @returns {boolean}
 */
function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

/**
 * Validate required fields are present in an object.
 * Throws ValidationError with details on missing fields.
 * @param {object} body - Request body
 * @param {string[]} requiredFields - Array of required field names
 * @throws {ValidationError}
 */
function validateRequired(body, requiredFields) {
  const missing = [];
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      missing.map((f) => ({ field: f, message: `${f} is required` }))
    );
  }
}

/**
 * Validate that a value is one of the allowed options.
 * @param {string} value
 * @param {string[]} allowed - Array of allowed values
 * @param {string} fieldName - Field name for error message
 * @throws {ValidationError}
 */
function validateEnum(value, allowed, fieldName) {
  if (value && !allowed.includes(value)) {
    throw new ValidationError(
      `Invalid value for ${fieldName}. Allowed: ${allowed.join(', ')}`
    );
  }
}

/**
 * Sanitize string input — trim and limit length.
 * @param {string} value
 * @param {number} [maxLength=255]
 * @returns {string}
 */
function sanitizeString(value, maxLength = 255) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().substring(0, maxLength);
}

/**
 * Validate custom field values against field definitions.
 * @param {object} values - The custom_properties from request body
 * @param {Array} fieldDefs - Array of custom field definition objects from DB
 * @throws {ValidationError}
 */
function validateCustomFields(values, fieldDefs) {
  const errors = [];

  for (const def of fieldDefs) {
    const value = values[def.field_key];

    // Check required fields
    if (def.is_required && (value === undefined || value === null || value === '')) {
      errors.push({ field: def.field_key, message: `${def.field_label} is required` });
      continue;
    }

    // Skip validation if value is not provided and not required
    if (value === undefined || value === null) continue;

    // Type-specific validation
    switch (def.field_type) {
      case 'number':
      case 'currency':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push({ field: def.field_key, message: `${def.field_label} must be a number` });
        }
        break;

      case 'date':
        if (isNaN(Date.parse(value))) {
          errors.push({ field: def.field_key, message: `${def.field_label} must be a valid date` });
        }
        break;

      case 'email':
        if (!isValidEmail(value)) {
          errors.push({ field: def.field_key, message: `${def.field_label} must be a valid email` });
        }
        break;

      case 'url':
        try {
          new URL(value);
        } catch {
          errors.push({ field: def.field_key, message: `${def.field_label} must be a valid URL` });
        }
        break;

      case 'dropdown':
        if (def.options && Array.isArray(def.options)) {
          const allowedValues = def.options.map((o) => o.value);
          if (!allowedValues.includes(value)) {
            errors.push({ field: def.field_key, message: `${def.field_label} must be one of: ${allowedValues.join(', ')}` });
          }
        }
        break;

      case 'multi_select':
        if (!Array.isArray(value)) {
          errors.push({ field: def.field_key, message: `${def.field_label} must be an array` });
        } else if (def.options && Array.isArray(def.options)) {
          const allowedValues = def.options.map((o) => o.value);
          for (const v of value) {
            if (!allowedValues.includes(v)) {
              errors.push({ field: def.field_key, message: `Invalid option "${v}" for ${def.field_label}` });
            }
          }
        }
        break;

      case 'checkbox':
        if (typeof value !== 'boolean') {
          errors.push({ field: def.field_key, message: `${def.field_label} must be a boolean` });
        }
        break;

      case 'phone':
        if (typeof value !== 'string' || value.length < 7 || value.length > 20) {
          errors.push({ field: def.field_key, message: `${def.field_label} must be a valid phone number` });
        }
        break;

      // text, textarea — no additional validation beyond presence
      default:
        break;
    }
  }

  // Check for unknown custom fields
  const definedKeys = new Set(fieldDefs.map((d) => d.field_key));
  for (const key of Object.keys(values)) {
    if (!definedKeys.has(key)) {
      errors.push({ field: key, message: `Unknown custom field: ${key}` });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Custom field validation failed', errors);
  }
}

module.exports = {
  isValidEmail,
  isValidUUID,
  isValidSlug,
  isValidPassword,
  validateRequired,
  validateEnum,
  sanitizeString,
  validateCustomFields,
};
