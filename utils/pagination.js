/**
 * utils/pagination.js
 * ─────────────────────────────────────────────────────────
 * Pagination helpers for offset-based and cursor-based pagination.
 */

/**
 * Parse offset-based pagination from query parameters.
 * @param {object} query - Express req.query
 * @param {number} [maxLimit=100] - Maximum allowed limit
 * @returns {{ limit: number, offset: number, page: number }}
 */
function parsePagination(query, maxLimit = 100) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  // Defaults and bounds
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;

  return { limit, offset, page };
}

/**
 * Parse cursor-based pagination from query parameters.
 * @param {object} query - Express req.query
 * @param {number} [maxLimit=100] - Maximum allowed limit
 * @returns {{ cursor: string|null, limit: number, direction: string }}
 */
function parseCursor(query, maxLimit = 100) {
  const cursor = query.cursor || null;
  let limit = parseInt(query.limit, 10);
  const direction = query.direction === 'prev' ? 'prev' : 'next';

  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > maxLimit) limit = maxLimit;

  return { cursor, limit, direction };
}

/**
 * Build pagination metadata for response.
 * @param {number} total - Total record count
 * @param {number} page - Current page number
 * @param {number} limit - Records per page
 * @returns {{ total: number, page: number, limit: number, totalPages: number, hasNext: boolean, hasPrev: boolean }}
 */
function buildMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

module.exports = {
  parsePagination,
  parseCursor,
  buildMeta,
};
