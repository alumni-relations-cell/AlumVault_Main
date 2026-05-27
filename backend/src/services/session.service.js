const redisClient = require('../config/redis');
const crypto = require('crypto');
const logger = require('../utils/logger');

class SessionService {
  /**
   * Create a new session in Redis.
   */
  async create(userId, accessToken, userAgent) {
    const deviceHash = this._deviceHash(userAgent);
    const key = `session:${userId}:${deviceHash}`;
    await redisClient.set(key, accessToken, 'EX', 900); // 15 minutes
    return key;
  }

  /**
   * Check if a session is valid.
   */
  async check(userId, userAgent) {
    const deviceHash = this._deviceHash(userAgent);
    const key = `session:${userId}:${deviceHash}`;
    const session = await redisClient.get(key);
    return session !== null;
  }

  /**
   * Destroy a specific session (logout).
   */
  async destroy(userId, userAgent) {
    const deviceHash = this._deviceHash(userAgent);
    const key = `session:${userId}:${deviceHash}`;
    await redisClient.del(key);
    logger.info({ userId }, 'Session destroyed');
  }

  /**
   * Force logout all sessions for a user.
   */
  async destroyAll(userId) {
    const keys = await redisClient.keys(`session:${userId}:*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    logger.info({ userId, sessions: keys.length }, 'All sessions destroyed');
    return keys.length;
  }

  /**
   * List active sessions for a user.
   */
  async listActive(userId) {
    const keys = await redisClient.keys(`session:${userId}:*`);
    return keys.map(key => ({
      key,
      deviceHash: key.split(':')[2],
    }));
  }

  /**
   * Slide session expiry (call on each authenticated request).
   */
  async touch(userId, userAgent) {
    const deviceHash = this._deviceHash(userAgent);
    const key = `session:${userId}:${deviceHash}`;
    await redisClient.expire(key, 900); // Reset to 15 minutes
  }

  _deviceHash(userAgent) {
    return crypto.createHash('md5').update(userAgent || 'unknown').digest('hex');
  }
}

module.exports = new SessionService();
