/**
 * modules/users/users.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for user management endpoints.
 */

const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

// All user routes require authentication and tenant context
router.use(authenticate, tenantContext);

// Current user profile (no permission check needed)
router.get('/me', usersController.me);

// User management
router.get('/',        checkPermission('users', 'read'),   usersController.list);
router.get('/:id',     checkPermission('users', 'read'),   usersController.getById);
router.post('/invite', checkPermission('users', 'create'), usersController.invite);
router.put('/:id',     checkPermission('users', 'update'), usersController.update);
router.delete('/:id',  checkPermission('users', 'delete'), usersController.deactivate);

// Password change (user can change their own)
router.put('/:id/password', usersController.changePassword);

module.exports = router;
