/**
 * modules/tenant/tenant.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Tenant settings management.
 */

const express = require('express');
const router = express.Router();
const tenantController = require('./tenant.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',    checkPermission('settings', 'read'),   tenantController.getDetails);
router.put('/',    checkPermission('settings', 'update'), tenantController.updateDetails);

module.exports = router;
