/**
 * modules/companies/companies.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Companies.
 */

const express = require('express');
const router = express.Router();
const companiesController = require('./companies.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',        checkPermission('companies', 'read'),   companiesController.list);
router.get('/:id',     checkPermission('companies', 'read'),   companiesController.getById);
router.post('/',       checkPermission('companies', 'create'), companiesController.create);
router.put('/:id',     checkPermission('companies', 'update'), companiesController.update);
router.delete('/:id',  checkPermission('companies', 'delete'), companiesController.remove);
router.post('/:id/restore', checkPermission('companies', 'update'), companiesController.restore);

module.exports = router;
