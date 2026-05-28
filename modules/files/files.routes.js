/**
 * modules/files/files.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for File Uploads and Downloads.
 */

const express = require('express');
const router = express.Router();
const filesController = require('./files.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');
const { checkPermission } = require('../../middlewares/rbacValidator');

router.use(authenticate, tenantContext);

// Upload a file
router.post('/',
  checkPermission('files', 'create'),
  filesController.upload.single('file'),
  filesController.uploadFile
);

// File details and management
router.get('/:id',                    checkPermission('files', 'read'),   filesController.getById);
router.get('/:id/download',           checkPermission('files', 'read'),   filesController.downloadFile);
router.delete('/:id',                 checkPermission('files', 'delete'), filesController.remove);
router.get('/entity/:entity_type/:entity_id', checkPermission('files', 'read'),   filesController.listForEntity);

module.exports = router;
