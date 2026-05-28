/**
 * modules/pipelines/pipelines.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Pipelines and Stages.
 */

const express = require('express');
const router = express.Router();
const pipelinesController = require('./pipelines.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',        checkPermission('pipelines', 'read'),   pipelinesController.list);
router.get('/:id',     checkPermission('pipelines', 'read'),   pipelinesController.getById);
router.post('/',       checkPermission('pipelines', 'create'), pipelinesController.create);
router.put('/:id',     checkPermission('pipelines', 'update'), pipelinesController.update);
router.delete('/:id',  checkPermission('pipelines', 'delete'), pipelinesController.remove);

module.exports = router;
