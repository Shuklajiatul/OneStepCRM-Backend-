/**
 * modules/files/files.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for File Attachments.
 */

const db = require('../../config/database');

/**
 * Save a new file attachment record in the DB.
 */
async function createFileAttachment(tenantId, { uploadedBy, entityType, entityId, originalFilename, storedFilename, filePath, fileSizeBytes, mimeType, isPublic }) {
  const result = await db.query(
    `INSERT INTO file_attachments
       (tenant_id, uploaded_by, entity_type, entity_id, original_filename, stored_filename, file_path, file_size_bytes, mime_type, is_public)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      tenantId,
      uploadedBy,
      entityType,
      entityId,
      originalFilename,
      storedFilename,
      filePath,
      fileSizeBytes,
      mimeType,
      isPublic ?? false
    ]
  );
  return result.rows[0];
}

/**
 * Retrieve a file attachment by ID.
 */
async function getFileAttachmentById(tenantId, id) {
  const result = await db.query(
    `SELECT f.*, u.name as uploader_name, u.email as uploader_email
     FROM file_attachments f
     JOIN users u ON f.uploaded_by = u.id
     WHERE f.id = $1 AND f.tenant_id = $2`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * List all file attachments for a specific entity.
 */
async function listFilesForEntity(tenantId, entityType, entityId) {
  const result = await db.query(
    `SELECT f.*, u.name as uploader_name, u.email as uploader_email
     FROM file_attachments f
     JOIN users u ON f.uploaded_by = u.id
     WHERE f.tenant_id = $1 AND f.entity_type = $2 AND f.entity_id = $3
     ORDER BY f.created_at DESC`,
    [tenantId, entityType, entityId]
  );
  return result.rows;
}

/**
 * Delete a file attachment record from the DB.
 */
async function deleteFileAttachment(tenantId, id) {
  const result = await db.query(
    'DELETE FROM file_attachments WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = {
  createFileAttachment,
  getFileAttachmentById,
  listFilesForEntity,
  deleteFileAttachment
};
