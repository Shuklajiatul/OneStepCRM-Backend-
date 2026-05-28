/**
 * modules/pipelines/pipelines.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Pipelines and Stages.
 */

const db = require('../../config/database');

/**
 * List all pipelines for a tenant, optionally filtered by entity type.
 * Includes stage count.
 */
async function listPipelines(tenantId, entityType = null) {
  let query = `
    SELECT p.*, COUNT(s.id)::int as stage_count
    FROM pipelines p
    LEFT JOIN pipeline_stages s ON p.id = s.pipeline_id
    WHERE p.tenant_id = $1
  `;
  const params = [tenantId];

  if (entityType) {
    query += ` AND p.entity_type = $2`;
    params.push(entityType);
  }

  query += `
    GROUP BY p.id
    ORDER BY p.is_default DESC, p.created_at DESC
  `;

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Get pipeline by ID with its stages ordered by order_index.
 */
async function getPipelineById(tenantId, id) {
  const pipelineResult = await db.query(
    `SELECT * FROM pipelines WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (pipelineResult.rows.length === 0) return null;

  const stagesResult = await db.query(
    `SELECT * FROM pipeline_stages
     WHERE pipeline_id = $1 AND tenant_id = $2
     ORDER BY order_index ASC`,
    [id, tenantId]
  );

  const pipeline = pipelineResult.rows[0];
  pipeline.stages = stagesResult.rows;
  return pipeline;
}

/**
 * Get the default pipeline for a specific entity type (lead or deal).
 */
async function getDefaultPipeline(tenantId, entityType) {
  const pipelineResult = await db.query(
    `SELECT * FROM pipelines WHERE tenant_id = $1 AND entity_type = $2 AND is_default = true LIMIT 1`,
    [tenantId, entityType]
  );

  if (pipelineResult.rows.length === 0) return null;

  const pipeline = pipelineResult.rows[0];
  const stagesResult = await db.query(
    `SELECT * FROM pipeline_stages
     WHERE pipeline_id = $1 AND tenant_id = $2
     ORDER BY order_index ASC`,
    [pipeline.id, tenantId]
  );

  pipeline.stages = stagesResult.rows;
  return pipeline;
}

/**
 * Create a new pipeline with optional stages in a transaction.
 */
async function createPipeline(tenantId, { name, entityType, isDefault, stages }) {
  return db.transaction(async (client) => {
    // If setting as default, unset existing default for this entity type
    if (isDefault) {
      await client.query(
        `UPDATE pipelines SET is_default = false, updated_at = NOW()
         WHERE tenant_id = $1 AND entity_type = $2 AND is_default = true`,
        [tenantId, entityType]
      );
    }

    // Insert pipeline
    const pipelineResult = await client.query(
      `INSERT INTO pipelines (tenant_id, name, entity_type, is_default)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, name, entityType, isDefault ?? false]
    );
    const pipeline = pipelineResult.rows[0];

    // Insert stages if provided
    const insertedStages = [];
    if (stages && Array.isArray(stages) && stages.length > 0) {
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const stageResult = await client.query(
          `INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, order_index, probability, color, is_won_stage, is_lost_stage)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            tenantId,
            pipeline.id,
            stage.name,
            stage.order_index ?? i,
            stage.probability ?? 0,
            stage.color || '#6366f1',
            stage.is_won_stage ?? false,
            stage.is_lost_stage ?? false
          ]
        );
        insertedStages.push(stageResult.rows[0]);
      }
    }

    pipeline.stages = insertedStages;
    return pipeline;
  });
}

/**
 * Update pipeline metadata and optionally rebuild/sync stages in a transaction.
 */
async function updatePipeline(tenantId, id, { name, isDefault, stages }) {
  return db.transaction(async (client) => {
    // Get existing pipeline to know the entity_type
    const existResult = await client.query(
      `SELECT entity_type FROM pipelines WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (existResult.rows.length === 0) return null;
    const entityType = existResult.rows[0].entity_type;

    // Handle default toggle
    if (isDefault) {
      await client.query(
        `UPDATE pipelines SET is_default = false, updated_at = NOW()
         WHERE tenant_id = $1 AND entity_type = $2 AND id != $3 AND is_default = true`,
        [tenantId, entityType, id]
      );
    }

    // Update pipeline properties
    const setClauses = [];
    const params = [tenantId, id];
    let paramIndex = 3;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }
    if (isDefault !== undefined) {
      setClauses.push(`is_default = $${paramIndex}`);
      params.push(isDefault);
      paramIndex++;
    }

    let pipeline;
    if (setClauses.length > 0) {
      setClauses.push('updated_at = NOW()');
      const pipelineResult = await client.query(
        `UPDATE pipelines SET ${setClauses.join(', ')} WHERE id = $2 AND tenant_id = $1 RETURNING *`,
        params
      );
      pipeline = pipelineResult.rows[0];
    } else {
      const pipelineResult = await client.query(
        `SELECT * FROM pipelines WHERE id = $2 AND tenant_id = $1`,
        [tenantId, id]
      );
      pipeline = pipelineResult.rows[0];
    }

    // Sync stages if provided (complete replacement to keep it simple and clean, OR partial update)
    // For robust production: Delete old stages not in updates, update existing, insert new.
    // To avoid breaking existing FK constraints (deals/leads pointing to stage IDs),
    // let's do a smart sync.
    if (stages && Array.isArray(stages)) {
      // 1. Get existing stages
      const existingStagesResult = await client.query(
        `SELECT id FROM pipeline_stages WHERE pipeline_id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      const existingStageIds = existingStagesResult.rows.map((s) => s.id);

      const incomingStageIds = stages.filter((s) => s.id).map((s) => s.id);

      // 2. Delete stages that are NOT in incoming list
      // Note: In real life, check if deals/leads use them. Postgres will block if constraint is violated,
      // which is correct behavior.
      const toDelete = existingStageIds.filter((eid) => !incomingStageIds.includes(eid));
      if (toDelete.length > 0) {
        await client.query(
          `DELETE FROM pipeline_stages WHERE pipeline_id = $1 AND id = ANY($2)`,
          [id, toDelete]
        );
      }

      // 3. Insert or Update incoming stages
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage.id && existingStageIds.includes(stage.id)) {
          // Update
          await client.query(
            `UPDATE pipeline_stages
             SET name = $1, order_index = $2, probability = $3, color = $4,
                 is_won_stage = $5, is_lost_stage = $6, updated_at = NOW()
             WHERE id = $7 AND pipeline_id = $8 AND tenant_id = $9`,
            [
              stage.name,
              stage.order_index ?? i,
              stage.probability ?? 0,
              stage.color || '#6366f1',
              stage.is_won_stage ?? false,
              stage.is_lost_stage ?? false,
              stage.id,
              id,
              tenantId
            ]
          );
        } else {
          // Insert
          await client.query(
            `INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, order_index, probability, color, is_won_stage, is_lost_stage)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              tenantId,
              id,
              stage.name,
              stage.order_index ?? i,
              stage.probability ?? 0,
              stage.color || '#6366f1',
              stage.is_won_stage ?? false,
              stage.is_lost_stage ?? false
            ]
          );
        }
      }
    }

    const updatedStages = await client.query(
      `SELECT * FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY order_index ASC`,
      [id]
    );
    pipeline.stages = updatedStages.rows;
    return pipeline;
  });
}

/**
 * Delete a pipeline. Note that Cascade Delete will handle the stages.
 */
async function deletePipeline(tenantId, id) {
  const result = await db.query(
    'DELETE FROM pipelines WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listPipelines,
  getPipelineById,
  getDefaultPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline
};
