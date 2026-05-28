/**
 * modules/search/search.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Global Search.
 */

const searchModel = require('./search.model');
const { success } = require('../../utils/apiResponse');
const { ValidationError } = require('../../utils/errors');

/**
 * GET /api/search
 * Search across all entities.
 */
async function search(req, res, next) {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim() === '') {
      throw new ValidationError('Search query (q) is required');
    }

    const maxLimit = limit ? parseInt(limit, 10) : 5;
    const results = await searchModel.searchAll(req.tenantId, q, maxLimit);

    return success(res, results, 'Search results retrieved');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  search
};
