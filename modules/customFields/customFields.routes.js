/**
 * modules/customFields/customFields.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Custom Field Definitions.
 */

const express = require('express');
const router = express.Router();
const customFieldsController = require('./customFields.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',        checkPermission('customFields', 'read'),   customFieldsController.list);
router.get('/:id',     checkPermission('customFields', 'read'),   customFieldsController.getById);
router.post('/',       checkPermission('customFields', 'create'), customFieldsController.create);
router.put('/:id',     checkPermission('customFields', 'update'), customFieldsController.update);
router.delete('/:id',  checkPermission('customFields', 'delete'), customFieldsController.remove);

module.exports = router;
