/**
 * modules/activities/activities.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Activities.
 */

const db = require('../../config/database');

/**
 * List activities with filters, search, and sorting.
 */
async function listActivities(tenantId, { limit, offset, search, ownerId, activityType, entityType, entityId, isCompleted, includeDeleted = false }) {
  let whereConditions = ['a.tenant_id = $1'];
  let params = [tenantId];
  let paramIndex = 2;

  if (!includeDeleted) {
    whereConditions.push('a.deleted_at IS NULL');
  }

  if (search) {
    whereConditions.push(`(a.subject ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (ownerId) {
    whereConditions.push(`a.owner_id = $${paramIndex}`);
    params.push(ownerId);
    paramIndex++;
  }

  if (activityType) {
    whereConditions.push(`a.activity_type = $${paramIndex}`);
    params.push(activityType);
    paramIndex++;
  }

  if (entityType) {
    whereConditions.push(`a.entity_type = $${paramIndex}`);
    params.push(entityType);
    paramIndex++;
  }

  if (entityId) {
    whereConditions.push(`a.entity_id = $${paramIndex}`);
    params.push(entityId);
    paramIndex++;
  }

  if (isCompleted !== undefined) {
    whereConditions.push(`a.is_completed = $${paramIndex}`);
    params.push(isCompleted);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM activities a WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await db.query(
    `SELECT a.*, u.name as owner_name, u.email as owner_email
     FROM activities a
     JOIN users u ON a.owner_id = u.id
     WHERE ${whereClause}
     ORDER BY a.created_at DESC, a.due_date ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { activities: dataResult.rows, total };
}

/**
 * Get a single activity by ID.
 */
async function getActivityById(tenantId, id, includeDeleted = false) {
  let query = `
    SELECT a.*, u.name as owner_name, u.email as owner_email
    FROM activities a
    JOIN users u ON a.owner_id = u.id
    WHERE a.id = $1 AND a.tenant_id = $2
  `;
  const params = [id, tenantId];

  if (!includeDeleted) {
    query += ' AND a.deleted_at IS NULL';
  }

  const result = await db.query(query, params);
  return result.rows[0] || null;
}

/**
 * Create a new activity.
 */
async function createActivity(tenantId, { ownerId, activityType, entityType, entityId, subject, description, dueDate, completedAt, isCompleted, callDurationSeconds, callOutcome, metadata }) {
  const result = await db.query(
    `INSERT INTO activities
       (tenant_id, owner_id, activity_type, entity_type, entity_id, subject, description, due_date, completed_at, is_completed, call_duration_seconds, call_outcome, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      tenantId,
      ownerId,
      activityType,
      entityType,
      entityId,
      subject,
      description,
      dueDate,
      completedAt,
      isCompleted ?? false,
      callDurationSeconds,
      callOutcome,
      metadata ? JSON.stringify(metadata) : '{}'
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing activity.
 */
async function updateActivity(tenantId, id, updates) {
  const allowedFields = [
    'owner_id', 'subject', 'description', 'due_date', 'completed_at',
    'is_completed', 'call_duration_seconds', 'call_outcome', 'metadata'
  ];
  const setClauses = [];
  const params = [tenantId, id];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      if (key === 'metadata') {
        params.push(value ? JSON.stringify(value) : '{}');
      } else {
        params.push(value);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');

  // Automatically update completed_at if is_completed toggled
  if (updates.is_completed === true) {
    setClauses.push('completed_at = NOW()');
  } else if (updates.is_completed === false) {
    setClauses.push('completed_at = NULL');
  }

  const result = await db.query(
    `UPDATE activities
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Soft delete an activity.
 */
async function deleteActivity(tenantId, id) {
  const result = await db.query(
    `UPDATE activities
     SET deleted_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * Restore a soft-deleted activity.
 */
async function restoreActivity(tenantId, id) {
  const result = await db.query(
    `UPDATE activities
     SET deleted_at = NULL
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL
     RETURNING *`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = {
  listActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  restoreActivity
};
