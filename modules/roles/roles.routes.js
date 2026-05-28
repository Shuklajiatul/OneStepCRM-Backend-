/**
 * modules/roles/roles.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for role profile management.
 */

const express = require('express');
const router = express.Router();
const rolesController = require('./roles.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/permissions-schema', checkPermission('roles', 'read'), rolesController.permissionsSchema);
router.get('/',    checkPermission('roles', 'read'),   rolesController.list);
router.post('/',   checkPermission('roles', 'create'), rolesController.create);
router.put('/:id', checkPermission('roles', 'update'), rolesController.update);
router.delete('/:id', checkPermission('roles', 'delete'), rolesController.remove);

module.exports = router;
