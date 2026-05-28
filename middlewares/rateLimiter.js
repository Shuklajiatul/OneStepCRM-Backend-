/**
 * middlewares/rateLimiter.js
 * ─────────────────────────────────────────────────────────
 * Redis-based sliding window rate limiter.
 * Per-tenant rate limiting for API calls and stricter auth endpoint limits.
 */

const { incrementWithTTL } = require('../config/redis');
const config = require('../config/environment');
const { RateLimitError } = require('../utils/errors');

/**
 * General API rate limiter — per tenant.
 * 1000 requests per 15 minutes (configurable).
 */
async function apiRateLimiter(req, res, next) {
  try {
    // Use tenant ID if available, otherwise use IP
    const identifier = (req.user && req.user.tenantId) || req.ip;
    const key = `ratelimit:api:${identifier}`;
    const windowSeconds = Math.floor(config.rateLimit.windowMs / 1000);
    const maxRequests = config.rateLimit.maxRequests;

    const count = await incrementWithTTL(key, windowSeconds);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)));

    if (count > maxRequests) {
      res.set('Retry-After', String(windowSeconds));
      throw new RateLimitError('API rate limit exceeded. Please try again later.');
    }

    next();
  } catch (err) {
    if (err instanceof RateLimitError) {
      return next(err);
    }
    // If Redis is down, allow the request through (fail open for rate limiting)
    console.error('[RateLimiter] Redis error, allowing request:', err.message);
    next();
  }
}

/**
 * Auth endpoint rate limiter — per IP.
 * 10 login attempts per 15 minutes.
 */
async function authRateLimiter(req, res, next) {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `ratelimit:auth:${ip}`;
    const windowSeconds = Math.floor(config.rateLimit.windowMs / 1000);
    const maxAttempts = config.rateLimit.authMax;

    const count = await incrementWithTTL(key, windowSeconds);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(maxAttempts));
    res.set('X-RateLimit-Remaining', String(Math.max(0, maxAttempts - count)));

    if (count > maxAttempts) {
      res.set('Retry-After', String(windowSeconds));
      throw new RateLimitError('Too many authentication attempts. Please try again later.');
    }

    next();
  } catch (err) {
    if (err instanceof RateLimitError) {
      return next(err);
    }
    // Fail open if Redis is down
    console.error('[RateLimiter] Redis error, allowing request:', err.message);
    next();
  }
}

module.exports = {
  apiRateLimiter,
  authRateLimiter,
};
