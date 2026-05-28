/**
 * modules/search/search.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Global Search across CRM entities.
 */

const db = require('../../config/database');

/**
 * Execute full-text search across leads, contacts, companies, and deals.
 */
async function searchAll(tenantId, searchQuery, limit = 5) {
  const tsQuery = searchQuery.trim().split(/\s+/).map(word => `${word}:*`).join(' & ');

  // Lead Search Query
  const leadsPromise = db.query(
    `SELECT id, title as headline, first_name, last_name, company_name, email, pipeline_stage, 'lead' as type
     FROM leads
     WHERE tenant_id = $1 AND deleted_at IS NULL AND
           (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(company_name, '')) @@ to_tsquery('english', $2))
     LIMIT $3`,
    [tenantId, tsQuery, limit]
  );

  // Contact Search Query
  const contactsPromise = db.query(
    `SELECT id, (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) as headline, email, phone, job_title, 'contact' as type
     FROM contacts
     WHERE tenant_id = $1 AND deleted_at IS NULL AND
           (to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(job_title, '')) @@ to_tsquery('english', $2))
     LIMIT $3`,
    [tenantId, tsQuery, limit]
  );

  // Company Search Query
  const companiesPromise = db.query(
    `SELECT id, name as headline, website, industry, 'company' as type
     FROM companies
     WHERE tenant_id = $1 AND deleted_at IS NULL AND
           (to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(website, '') || ' ' || COALESCE(industry, '')) @@ to_tsquery('english', $2))
     LIMIT $3`,
    [tenantId, tsQuery, limit]
  );

  // Deal Search Query
  const dealsPromise = db.query(
    `SELECT id, title as headline, deal_value, status, 'deal' as type
     FROM deals
     WHERE tenant_id = $1 AND deleted_at IS NULL AND
           (title ILIKE $2 OR lost_reason ILIKE $2)
     LIMIT $3`,
    [tenantId, `%${searchQuery}%`, limit]
  );

  const [leadsResult, contactsResult, companiesResult, dealsResult] = await Promise.all([
    leadsPromise,
    contactsPromise,
    companiesPromise,
    dealsPromise
  ]);

  return {
    leads: leadsResult.rows,
    contacts: contactsResult.rows,
    companies: companiesResult.rows,
    deals: dealsResult.rows
  };
}

module.exports = {
  searchAll
};
