/**
 * config/environment.js
 * ─────────────────────────────────────────────────────────
 * Loads and validates all environment variables.
 * Provides a single source of truth for app configuration.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Get an environment variable, with optional default.
 * Throws if required and missing.
 */
function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}

const config = {
  // ── Server ──────────────────────────────────────────────
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: parseInt(getEnv('PORT', '5000'), 10),
  isDev: getEnv('NODE_ENV', 'development') === 'development',
  isProd: getEnv('NODE_ENV', 'development') === 'production',

  // ── PostgreSQL ──────────────────────────────────────────
  db: {
    host: getEnv('DB_HOST', 'localhost'),
    port: parseInt(getEnv('DB_PORT', '5432'), 10),
    database: getEnv('DB_NAME', 'onestepcrm'),
    user: getEnv('DB_USER', 'admin'),
    password: getEnv('DB_PASSWORD', 'postgres'),
    max: parseInt(getEnv('DB_MAX_CONNECTIONS', '20'), 10),
    idleTimeoutMillis: parseInt(getEnv('DB_IDLE_TIMEOUT', '30000'), 10),
  },

  // ── Redis ───────────────────────────────────────────────
  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: parseInt(getEnv('REDIS_PORT', '6379'), 10),
    password: getEnv('REDIS_PASSWORD', '') || undefined,
    db: parseInt(getEnv('REDIS_DB', '0'), 10),
  },

  // ── JWT ─────────────────────────────────────────────────
  jwt: {
    secret: getEnv('JWT_SECRET', 'dev-secret-change-me'),
    accessExpiry: getEnv('JWT_ACCESS_EXPIRY', '15m'),
    refreshExpiryDays: parseInt(getEnv('JWT_REFRESH_EXPIRY_DAYS', '7'), 10),
  },

  // ── CORS ────────────────────────────────────────────────
  corsOrigin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),

  // ── File Uploads ────────────────────────────────────────
  upload: {
    dir: getEnv('UPLOAD_DIR', './uploads'),
    maxFileSizeMB: parseInt(getEnv('MAX_FILE_SIZE_MB', '10'), 10),
  },

  // ── Rate Limiting ───────────────────────────────────────
  rateLimit: {
    windowMs: parseInt(getEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    maxRequests: parseInt(getEnv('RATE_LIMIT_MAX_REQUESTS', '1000'), 10),
    authMax: parseInt(getEnv('AUTH_RATE_LIMIT_MAX', '10'), 10),
  },

  // ── Email ───────────────────────────────────────────────
  email: {
    host: getEnv('SMTP_HOST', ''),
    port: parseInt(getEnv('SMTP_PORT', '587'), 10),
    user: getEnv('SMTP_USER', ''),
    pass: getEnv('SMTP_PASS', ''),
    from: getEnv('EMAIL_FROM', 'noreply@onestepcrm.com'),
  },

  // ── App URLs ────────────────────────────────────────────
  appUrl: getEnv('APP_URL', 'http://localhost:5000'),
  frontendUrl: getEnv('FRONTEND_URL', 'http://localhost:3000'),
};

module.exports = config;
