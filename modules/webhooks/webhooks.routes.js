/**
 * modules/webhooks/webhooks.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Webhook management.
 */

const express = require('express');
const router = express.Router();
const webhooksController = require('./webhooks.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',                    checkPermission('webhooks', 'read'),   webhooksController.list);
router.get('/:id',                 checkPermission('webhooks', 'read'),   webhooksController.getById);
router.post('/',                   checkPermission('webhooks', 'create'), webhooksController.create);
router.put('/:id',                 checkPermission('webhooks', 'update'), webhooksController.update);
router.delete('/:id',              checkPermission('webhooks', 'delete'), webhooksController.remove);
router.get('/:id/deliveries',      checkPermission('webhooks', 'read'),   webhooksController.getDeliveries);

module.exports = router;
