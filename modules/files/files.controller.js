/**
 * modules/files/files.controller.js
 * ─────────────────────────────────────────────────────────
 * File Upload, Retrieval, and Deletion management.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const filesModel = require('./files.model');
const leadsModel = require('../leads/leads.model');
const contactsModel = require('../contacts/contacts.model');
const companiesModel = require('../companies/companies.model');
const dealsModel = require('../deals/deals.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, validateEnum, isValidUUID } = require('../../utils/validators');
const { NotFoundError, ValidationError, PermissionError } = require('../../utils/errors');
const { auditLog } = require('../../middlewares/auditLogger');

const ALLOWED_ENTITY_TYPES = ['lead', 'contact', 'company', 'deal'];
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Disk Storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Create Multer instance
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

/**
 * Helper to verify that the polymorphic target entity exists.
 */
async function verifyEntityExists(tenantId, entityType, entityId) {
  let entity = null;
  switch (entityType) {
    case 'lead':
      entity = await leadsModel.getLeadById(tenantId, entityId);
      break;
    case 'contact':
      entity = await contactsModel.getContactById(tenantId, entityId);
      break;
    case 'company':
      entity = await companiesModel.getCompanyById(tenantId, entityId);
      break;
    case 'deal':
      entity = await dealsModel.getDealById(tenantId, entityId);
      break;
  }
  return !!entity;
}

/**
 * POST /api/files
 * Upload a file attachment for an entity.
 */
async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const { entity_type, entity_id, is_public } = req.body;

    validateRequired(req.body, ['entity_type', 'entity_id']);
    validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');

    if (!isValidUUID(entity_id)) {
      // Remove file from disk if validation fails
      fs.unlinkSync(req.file.path);
      throw new ValidationError('Invalid entity ID');
    }

    // Verify polymorphic target entity exists
    const entityExists = await verifyEntityExists(req.tenantId, entity_type, entity_id);
    if (!entityExists) {
      fs.unlinkSync(req.file.path);
      throw new ValidationError(`Referenced ${entity_type} with ID ${entity_id} does not exist in this tenant`);
    }

    const attachment = await filesModel.createFileAttachment(req.tenantId, {
      uploadedBy: req.user.id,
      entityType: entity_type,
      entityId: entity_id,
      originalFilename: req.file.originalname,
      storedFilename: req.file.filename,
      filePath: req.file.path,
      fileSizeBytes: req.file.size,
      mimeType: req.file.mimetype,
      isPublic: is_public === 'true'
    });

    auditLog(req, 'CREATE', 'file_attachment', attachment.id, null, attachment);

    return success(res, attachment, 'File uploaded successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/entity/:entity_type/:entity_id
 * List all files attached to an entity.
 */
async function listForEntity(req, res, next) {
  try {
    const { entity_type, entity_id } = req.params;

    validateEnum(entity_type, ALLOWED_ENTITY_TYPES, 'entity_type');
    if (!isValidUUID(entity_id)) {
      throw new ValidationError('Invalid entity ID');
    }

    const files = await filesModel.listFilesForEntity(req.tenantId, entity_type, entity_id);
    return success(res, files, 'Files retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:id
 * Securely get file metadata and check access permissions.
 */
async function getById(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid file ID');
    }

    const file = await filesModel.getFileAttachmentById(req.tenantId, req.params.id);
    if (!file) {
      throw new NotFoundError('File attachment not found');
    }

    return success(res, file, 'File retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:id/download
 * Securely download the actual file from disk.
 */
async function downloadFile(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid file ID');
    }

    const file = await filesModel.getFileAttachmentById(req.tenantId, req.params.id);
    if (!file) {
      throw new NotFoundError('File attachment not found');
    }

    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      throw new NotFoundError('File physically missing on server storage');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    res.setHeader('Content-Type', file.mime_type);
    return res.sendFile(file.file_path);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/files/:id
 * Delete file attachment from DB and physical file from disk.
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid file ID');
    }

    const file = await filesModel.getFileAttachmentById(req.tenantId, req.params.id);
    if (!file) {
      throw new NotFoundError('File attachment not found');
    }

    // Delete record from DB
    await filesModel.deleteFileAttachment(req.tenantId, req.params.id);

    // Delete physical file from disk if it exists
    if (fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    auditLog(req, 'DELETE', 'file_attachment', req.params.id, file, null);

    return success(res, null, 'File deleted successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  upload,
  uploadFile,
  listForEntity,
  getById,
  downloadFile,
  remove
};
