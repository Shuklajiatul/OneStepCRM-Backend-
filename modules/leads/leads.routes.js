/**
 * modules/leads/leads.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Leads.
 */

const express = require('express');
const router = express.Router();
const leadsController = require('./leads.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',        checkPermission('leads', 'read'),   leadsController.list);
router.get('/:id',     checkPermission('leads', 'read'),   leadsController.getById);
router.post('/',       checkPermission('leads', 'create'), leadsController.create);
router.put('/:id',     checkPermission('leads', 'update'), leadsController.update);
router.delete('/:id',  checkPermission('leads', 'delete'), leadsController.remove);
router.post('/:id/restore', checkPermission('leads', 'update'), leadsController.restore);
router.post('/:id/convert', checkPermission('leads', 'update'), leadsController.convert);

module.exports = router;
