/**
 * utils/apiResponse.js
 * ─────────────────────────────────────────────────────────
 * Standard API response wrapper.
 * All API endpoints return this consistent format.
 */

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {*} data - Response payload
 * @param {string} [message='OK'] - Human-readable message
 * @param {object} [meta={}] - Pagination, counts, etc.
 * @param {number} [statusCode=200] - HTTP status code
 */
const success = (res, data, message = 'OK', meta = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
    meta,
  });
};

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} message - Error message
 * @param {number} [statusCode=400] - HTTP status code
 * @param {string} [code='ERROR'] - Machine-readable error code
 */
const error = (res, message, statusCode = 400, code = 'ERROR') => {
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    code,
  });
};

module.exports = { success, error };
