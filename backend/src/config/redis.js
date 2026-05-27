const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  lazyConnect: false,
};

if (process.env.REDIS_PASSWORD) {
  redisOptions.password = process.env.REDIS_PASSWORD;
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', redisOptions);

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err) => {
  logger.error({ error: err.message }, 'Redis connection error');
});

module.exports = redis;
