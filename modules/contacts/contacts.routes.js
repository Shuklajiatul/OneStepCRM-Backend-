/**
 * modules/contacts/contacts.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Contacts.
 */

const express = require('express');
const router = express.Router();
const contactsController = require('./contacts.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

router.get('/',        checkPermission('contacts', 'read'),   contactsController.list);
router.get('/:id',     checkPermission('contacts', 'read'),   contactsController.getById);
router.post('/',       checkPermission('contacts', 'create'), contactsController.create);
router.put('/:id',     checkPermission('contacts', 'update'), contactsController.update);
router.delete('/:id',  checkPermission('contacts', 'delete'), contactsController.remove);
router.post('/:id/restore', checkPermission('contacts', 'update'), contactsController.restore);

module.exports = router;
