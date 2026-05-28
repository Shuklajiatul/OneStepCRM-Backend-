/**
 * utils/errors.js
 * ─────────────────────────────────────────────────────────
 * Custom error classes for structured error handling.
 * The global error handler maps these to proper HTTP responses.
 */

/**
 * Base application error.
 * All custom errors extend this class.
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes from programmer errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request — Invalid input, missing required fields, etc.
 */
class ValidationError extends AppError {
  /**
   * @param {string} message
   * @param {Array} [errors=[]] - Array of field-level errors
   */
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * 401 Unauthorized — Invalid/missing/expired credentials.
 */
class AuthError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTH_ERROR') {
    super(message, 401, code);
  }
}

/**
 * 403 Forbidden — Valid auth but insufficient permissions.
 */
class PermissionError extends AppError {
  constructor(message = 'Permission denied') {
    super(message, 403, 'PERMISSION_DENIED');
  }
}

/**
 * 404 Not Found — Requested resource doesn't exist.
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * 409 Conflict — Duplicate resource, unique constraint violation, etc.
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * 429 Too Many Requests — Rate limit exceeded.
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  PermissionError,
  NotFoundError,
  ConflictError,
  RateLimitError,
};
