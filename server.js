/**
 * server.js
 * ─────────────────────────────────────────────────────────
 * Main application entrypoint.
 * Configures Express middleware, registers API routes,
 * starts Bull queue workers, and boots the HTTP server.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const config = require('./config/environment');
const db = require('./config/database');
const redis = require('./config/redis');

// Import Bull Queue Workers to initialize them
require('./jobs/emailQueue');
require('./jobs/webhookQueue');

// Import Middlewares
const { apiRateLimiter } = require('./middlewares/rateLimiter');
const { notFoundHandler, globalErrorHandler } = require('./middlewares/errorHandler');

// Import Routes
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const customFieldsRoutes = require('./modules/customFields/customFields.routes');
const pipelinesRoutes = require('./modules/pipelines/pipelines.routes');
const companiesRoutes = require('./modules/companies/companies.routes');
const contactsRoutes = require('./modules/contacts/contacts.routes');
const leadsRoutes = require('./modules/leads/leads.routes');
const dealsRoutes = require('./modules/deals/deals.routes');
const activitiesRoutes = require('./modules/activities/activities.routes');
const filesRoutes = require('./modules/files/files.routes');
const searchRoutes = require('./modules/search/search.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const tenantRoutes = require('./modules/tenant/tenant.routes');
const webhooksRoutes = require('./modules/webhooks/webhooks.routes');

const app = express();

// ── Standard Middlewares ───────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));
app.use(morgan(config.isDev ? 'dev' : 'combined'));
app.use(cookieParser());
app.use(express.json());

// ── Healthcheck Route ──────────────────────────────────────
app.get('/health', async (req, res) => {
  let dbStatus = 'healthy';
  let redisStatus = 'healthy';

  try {
    await db.query('SELECT 1');
  } catch (err) {
    dbStatus = `unhealthy: ${err.message}`;
  }

  try {
    const pingResult = await redis.redis.ping();
    if (pingResult !== 'PONG') {
      throw new Error('Redis ping failed');
    }
  } catch (err) {
    redisStatus = `unhealthy: ${err.message}`;
  }

  const status = (dbStatus === 'healthy' && redisStatus === 'healthy') ? 200 : 500;
  return res.status(status).json({
    status: status === 200 ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus
    }
  });
});

// ── Rate Limiting (Applied to all API paths except Auth) ───
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) {
    return next(); // Auth routes have their own strict rate limiter
  }
  return apiRateLimiter(req, res, next);
});

// ── Mounting Route Modules ──────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/custom-fields', customFieldsRoutes);
app.use('/api/pipelines', pipelinesRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/webhooks', webhooksRoutes);

// ── Static serving of public uploads (if requested/public) ──
app.use('/uploads', express.static(config.upload.dir));

// ── Error Handling Middlewares ─────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ── Start HTTP Server ───────────────────────────────────────
const server = app.listen(config.port, () => {
  console.log(`🚀 OneStepCRM Server running in [${config.nodeEnv}] mode on port ${config.port}`);
});

// ── Graceful Shutdown ───────────────────────────────────────
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('\n🛑 Shutdown signal received. Starting graceful termination...');

  // Stop accepting new HTTP requests
  server.close(() => {
    console.log('HTTP server closed.');
  });

  try {
    // Close DB pool - check what db.end actually is
    if (typeof db.end === 'function') {
      await db.end();
      console.log('PostgreSQL connection pool closed.');
    } else if (typeof db.close === 'function') {
      await db.close();
      console.log('PostgreSQL connection pool closed.');
    } else if (db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
      console.log('PostgreSQL connection pool closed.');
    } else {
      console.log('PostgreSQL: No close method found, skipping.');
    }

    // Close Redis connection
    if (typeof redis.closeRedis === 'function') {
      await redis.closeRedis();
    } else if (typeof redis.quit === 'function') {
      await redis.quit();
    } else if (redis.redis && typeof redis.redis.quit === 'function') {
      await redis.redis.quit();
    }
    console.log('Redis client connection closed.');

    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
}
