/**
 * middlewares/errorHandler.js
 * ─────────────────────────────────────────────────────────
 * Global Express error handler.
 * Maps custom AppError subclasses to proper HTTP responses.
 */

const config = require('../config/environment');
const { AppError } = require('../utils/errors');

/**
 * 404 handler — catches requests that didn't match any route.
 */
function notFoundHandler(req, res, next) {
  const err = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(err);
}

/**
 * Global error handler middleware.
 * Must have 4 parameters for Express to recognize it as an error handler.
 */
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Handle specific pg (PostgreSQL) errors
  if (err.code === '23505') {
    // Unique constraint violation
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A record with this value already exists';
  } else if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Referenced record does not exist';
  } else if (err.code === '23502') {
    // Not-null violation
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = `Missing required field: ${err.column || 'unknown'}`;
  }

  // Handle JSON parse errors from body-parser
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains invalid JSON';
  }

  // Handle multer file size errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    code = 'FILE_TOO_LARGE';
    message = 'File size exceeds the maximum allowed limit';
  }

  // Log the error
  if (statusCode >= 500) {
    console.error('[ERROR]', {
      statusCode,
      code,
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  } else if (config.isDev) {
    console.warn('[WARN]', { statusCode, code, message, url: req.originalUrl });
  }

  // Build response
  const response = {
    success: false,
    data: null,
    message,
    code,
  };

  // Include validation errors if present
  if (err.errors && Array.isArray(err.errors)) {
    response.errors = err.errors;
  }

  // Include stack trace in development only
  if (config.isDev && statusCode >= 500) {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
