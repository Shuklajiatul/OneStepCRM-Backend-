/**
 * modules/activities/activities.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Activities.
 */

const express = require('express');
const router = express.Router();
const activitiesController = require('./activities.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',        checkPermission('activities', 'read'),   activitiesController.list);
router.get('/:id',     checkPermission('activities', 'read'),   activitiesController.getById);
router.post('/',       checkPermission('activities', 'create'), activitiesController.create);
router.put('/:id',     checkPermission('activities', 'update'), activitiesController.update);
router.delete('/:id',  checkPermission('activities', 'delete'), activitiesController.remove);
router.post('/:id/restore', checkPermission('activities', 'update'), activitiesController.restore);

module.exports = router;
