/**
 * modules/deals/deals.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Deals.
 */

const express = require('express');
const router = express.Router();
const dealsController = require('./deals.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',        checkPermission('deals', 'read'),   dealsController.list);
router.get('/:id',     checkPermission('deals', 'read'),   dealsController.getById);
router.post('/',       checkPermission('deals', 'create'), dealsController.create);
router.put('/:id',     checkPermission('deals', 'update'), dealsController.update);
router.delete('/:id',  checkPermission('deals', 'delete'), dealsController.remove);
router.post('/:id/restore', checkPermission('deals', 'update'), dealsController.restore);

module.exports = router;
