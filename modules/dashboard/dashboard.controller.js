/**
 * modules/dashboard/dashboard.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Dashboard metrics and reporting.
 */

const dashboardModel = require('./dashboard.model');
const { success } = require('../../utils/apiResponse');

/**
 * GET /api/dashboard/summary
 * Fetch top-level dashboard figures and recent activities.
 */
async function getSummary(req, res, next) {
  try {
    const summary = await dashboardModel.getSummaryMetrics(req.tenantId);
    return success(res, summary, 'Dashboard summary retrieved');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary
};
