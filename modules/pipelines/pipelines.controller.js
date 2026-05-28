/**
 * modules/pipelines/pipelines.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for Pipelines and Stages.
 */

const pipelinesModel = require('./pipelines.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID } = require('../../utils/validators');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');

const ALLOWED_ENTITY_TYPES = ['lead', 'deal'];

/**
 * GET /api/pipelines
 */
async function list(req, res, next) {
  try {
    const { entity_type } = req.query;
    if (entity_type) {
      validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');
    }

    const pipelines = await pipelinesModel.listPipelines(req.tenantId, entity_type);
    return success(res, pipelines, 'Pipelines retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pipelines/:id
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid pipeline ID');
    }

    const pipeline = await pipelinesModel.getPipelineById(req.tenantId, req.params.id);
    if (!pipeline) {
      throw new NotFoundError('Pipeline not found');
    }

    return success(res, pipeline, 'Pipeline retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/pipelines
 */
async function create(req, res, next) {
  try {
    const { name, entity_type, is_default, stages } = req.body;

    validateRequired(req.body, ['name', 'entity_type']);
    validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');

    if (stages && !Array.isArray(stages)) {
      throw new ValidationError('Stages must be an array');
    }

    // Validate stages structure if provided
    if (stages) {
      stages.forEach((stage, idx) => {
        if (!stage.name) {
          throw new ValidationError(`Stage at index ${idx} is missing a name`);
        }
        if (stage.probability !== undefined && (stage.probability < 0 || stage.probability > 100)) {
          throw new ValidationError(`Stage probability must be between 0 and 100 at index ${idx}`);
        }
      });
    }

    const pipeline = await pipelinesModel.createPipeline(req.tenantId, {
      name,
      entityType: entity_type,
      isDefault: is_default,
      stages
    });

    auditLog(req, 'CREATE', 'pipeline', pipeline.id, null, pipeline);

    return success(res, pipeline, 'Pipeline created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/pipelines/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid pipeline ID');
    }

    const before = await pipelinesModel.getPipelineById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Pipeline not found');
    }

    const { name, is_default, stages } = req.body;

    if (stages && !Array.isArray(stages)) {
      throw new ValidationError('Stages must be an array');
    }

    if (stages) {
      stages.forEach((stage, idx) => {
        if (!stage.name) {
          throw new ValidationError(`Stage at index ${idx} is missing a name`);
        }
        if (stage.probability !== undefined && (stage.probability < 0 || stage.probability > 100)) {
          throw new ValidationError(`Stage probability must be between 0 and 100 at index ${idx}`);
        }
        if (stage.id && !isValidUUID(stage.id)) {
          throw new ValidationError(`Stage at index ${idx} has an invalid ID`);
        }
      });
    }

    const pipeline = await pipelinesModel.updatePipeline(req.tenantId, req.params.id, {
      name,
      isDefault: is_default,
      stages
    });

    auditLog(req, 'UPDATE', 'pipeline', pipeline.id, before, pipeline);

    return success(res, pipeline, 'Pipeline updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/pipelines/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid pipeline ID');
    }

    const pipeline = await pipelinesModel.getPipelineById(req.tenantId, req.params.id);
    if (!pipeline) {
      throw new NotFoundError('Pipeline not found');
    }

    if (pipeline.is_default) {
      throw new ValidationError('Cannot delete the default pipeline. Mark another pipeline as default first.');
    }

    await pipelinesModel.deletePipeline(req.tenantId, req.params.id);

    auditLog(req, 'DELETE', 'pipeline', req.params.id, pipeline, null);

    return success(res, null, 'Pipeline deleted successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
