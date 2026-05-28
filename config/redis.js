/**
 * config/redis.js
 * ─────────────────────────────────────────────────────────
 * Redis client using ioredis.
 * Provides helper methods for common cache operations.
 */

const Redis = require('ioredis');
const config = require('./environment');

// Create ioredis client with reconnect strategy
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  retryStrategy(times) {
    // Exponential backoff: 50ms, 100ms, 200ms ... capped at 2 seconds
    const delay = Math.min(times * 50, 2000);
    console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('close', () => {
  console.log('[Redis] Connection closed');
});

/**
 * Get a value from Redis (parsed from JSON if possible).
 * @param {string} key
 * @returns {Promise<*|null>}
 */
async function getCache(key) {
  try {
    const value = await redis.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (err) {
    console.error('[Redis] GET error:', key, err.message);
    return null;
  }
}

/**
 * Set a value in Redis with optional TTL.
 * Objects/arrays are automatically JSON-stringified.
 * @param {string} key
 * @param {*} value
 * @param {number} [ttlSeconds] - Time-to-live in seconds
 */
async function setCache(key, value, ttlSeconds = null) {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  } catch (err) {
    console.error('[Redis] SET error:', key, err.message);
  }
}

/**
 * Delete one or more keys from Redis.
 * @param  {...string} keys
 */
async function delCache(...keys) {
  try {
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('[Redis] DEL error:', keys, err.message);
  }
}

/**
 * Delete all keys matching a pattern (e.g., 'perm:tenant123:*').
 * Uses SCAN to avoid blocking.
 * @param {string} pattern
 */
async function delByPattern(pattern) {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error('[Redis] DEL pattern error:', pattern, err.message);
  }
}

/**
 * Check if a value exists in a Redis SET.
 * @param {string} setKey
 * @param {string} member
 * @returns {Promise<boolean>}
 */
async function isMemberOfSet(setKey, member) {
  try {
    const result = await redis.sismember(setKey, member);
    return result === 1;
  } catch (err) {
    console.error('[Redis] SISMEMBER error:', setKey, err.message);
    return false;
  }
}

/**
 * Add a member to a Redis SET with optional TTL on the set key.
 * @param {string} setKey
 * @param {string} member
 * @param {number} [ttlSeconds]
 */
async function addToSet(setKey, member, ttlSeconds = null) {
  try {
    await redis.sadd(setKey, member);
    if (ttlSeconds) {
      await redis.expire(setKey, ttlSeconds);
    }
  } catch (err) {
    console.error('[Redis] SADD error:', setKey, err.message);
  }
}

/**
 * Increment a key and set TTL if it's new (for rate limiting).
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<number>} - Current count after increment
 */
async function incrementWithTTL(key, ttlSeconds) {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return count;
  } catch (err) {
    console.error('[Redis] INCR error:', key, err.message);
    return 0;
  }
}

/**
 * Gracefully close Redis connection.
 */
async function closeRedis() {
  console.log('[Redis] Closing connection...');
  await redis.quit();
  console.log('[Redis] Connection closed.');
}

module.exports = {
  redis,
  getCache,
  setCache,
  delCache,
  delByPattern,
  isMemberOfSet,
  addToSet,
  incrementWithTTL,
  closeRedis,
};
