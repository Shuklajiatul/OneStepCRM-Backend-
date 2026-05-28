/**
 * modules/dashboard/dashboard.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Dashboard statistics and reports.
 */

const db = require('../../config/database');

/**
 * Gather aggregated metrics for the tenant dashboard.
 */
async function getSummaryMetrics(tenantId) {
  // 1. Leads counts (total, converted, open)
  const leadsPromise = db.query(
    `SELECT COUNT(*)::int as total,
            COUNT(CASE WHEN is_converted = true THEN 1 END)::int as converted,
            COUNT(CASE WHEN is_converted = false AND deleted_at IS NULL THEN 1 END)::int as open
     FROM leads
     WHERE tenant_id = $1`,
    [tenantId]
  );

  // 2. Contacts & Companies counts
  const contactsPromise = db.query(
    `SELECT COUNT(*)::int as count FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const companiesPromise = db.query(
    `SELECT COUNT(*)::int as count FROM companies WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );

  // 3. Deals summary (won, open, lost, values)
  const dealsPromise = db.query(
    `SELECT
       COUNT(*)::int as total,
       COUNT(CASE WHEN status = 'won' THEN 1 END)::int as won_count,
       COUNT(CASE WHEN status = 'open' THEN 1 END)::int as open_count,
       COALESCE(SUM(CASE WHEN status = 'won' THEN deal_value ELSE 0 END), 0)::numeric as won_value,
       COALESCE(SUM(CASE WHEN status = 'open' THEN deal_value ELSE 0 END), 0)::numeric as open_value
     FROM deals
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );

  // 4. Deals value and count grouped by pipeline stage
  const stagesPromise = db.query(
    `SELECT ps.id as stage_id, ps.name as stage_name, ps.color, ps.probability,
            COUNT(d.id)::int as deal_count,
            COALESCE(SUM(d.deal_value), 0)::numeric as total_value
     FROM pipeline_stages ps
     LEFT JOIN deals d ON ps.id = d.stage_id AND d.deleted_at IS NULL AND d.status = 'open'
     WHERE ps.tenant_id = $1
     GROUP BY ps.id, ps.name, ps.color, ps.probability, ps.order_index
     ORDER BY ps.order_index ASC`,
    [tenantId]
  );

  // 5. Recent activities (5 items)
  const activitiesPromise = db.query(
    `SELECT a.id, a.activity_type, a.subject, a.created_at, u.name as owner_name
     FROM activities a
     JOIN users u ON a.owner_id = u.id
     WHERE a.tenant_id = $1 AND a.deleted_at IS NULL
     ORDER BY a.created_at DESC
     LIMIT 5`,
    [tenantId]
  );

  const [leadsRes, contactsRes, companiesRes, dealsRes, stagesRes, activitiesRes] = await Promise.all([
    leadsPromise,
    contactsPromise,
    companiesPromise,
    dealsPromise,
    stagesPromise,
    activitiesPromise
  ]);

  return {
    leadsSummary: leadsRes.rows[0],
    contactsCount: contactsRes.rows[0].count,
    companiesCount: companiesRes.rows[0].count,
    dealsSummary: dealsRes.rows[0],
    dealsByStage: stagesRes.rows,
    recentActivities: activitiesRes.rows
  };
}

module.exports = {
  getSummaryMetrics
};
