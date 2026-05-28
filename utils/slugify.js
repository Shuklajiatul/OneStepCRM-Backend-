/**
 * utils/slugify.js
 * ─────────────────────────────────────────────────────────
 * Converts labels to URL-safe slugs or snake_case field keys.
 */

/**
 * Convert a string to a URL-safe slug (lowercase, hyphens).
 * Example: "My Company Name" → "my-company-name"
 * @param {string} text
 * @returns {string}
 */
function toSlug(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')       // Remove special characters
    .replace(/[\s_]+/g, '-')        // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '');       // Trim leading/trailing hyphens
}

/**
 * Convert a label to a snake_case field key.
 * Example: "Annual Revenue" → "annual_revenue"
 * @param {string} label
 * @returns {string}
 */
function toFieldKey(label) {
  if (!label || typeof label !== 'string') return '';
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')        // Remove special characters
    .replace(/\s+/g, '_')           // Replace spaces with underscores
    .replace(/_+/g, '_')            // Collapse multiple underscores
    .replace(/^_+|_+$/g, '');       // Trim leading/trailing underscores
}

module.exports = {
  toSlug,
  toFieldKey,
};
