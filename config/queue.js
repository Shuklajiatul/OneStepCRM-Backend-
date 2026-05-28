/**
 * config/queue.js
 * ─────────────────────────────────────────────────────────
 * Bull queue factory using Redis connection.
 * Creates named queues for async job processing.
 */

const Bull = require('bull');
const config = require('./environment');

/**
 * Redis connection options shared by all queues.
 */
const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
};

/**
 * Create a new Bull queue with standard options.
 * @param {string} name - Queue name (e.g., 'email', 'webhook')
 * @returns {Bull.Queue}
 */
function createQueue(name) {
  const queue = new Bull(name, {
    redis: redisOptions,
    defaultJobOptions: {
      removeOnComplete: 100,  // Keep last 100 completed jobs
      removeOnFail: 200,      // Keep last 200 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,          // Start with 2 seconds
      },
    },
  });

  queue.on('error', (err) => {
    console.error(`[Queue:${name}] Error:`, err.message);
  });

  queue.on('failed', (job, err) => {
    console.error(`[Queue:${name}] Job ${job.id} failed:`, err.message);
  });

  if (config.isDev) {
    queue.on('completed', (job) => {
      console.log(`[Queue:${name}] Job ${job.id} completed`);
    });
  }

  return queue;
}

/**
 * Gracefully close all provided queues.
 * @param  {...Bull.Queue} queues
 */
async function closeQueues(...queues) {
  console.log('[Queues] Closing all queues...');
  await Promise.all(queues.map((q) => q.close()));
  console.log('[Queues] All queues closed.');
}

module.exports = {
  createQueue,
  closeQueues,
};
