const redisClient = require('../config/redis');
const rateLimitRules = require('../constants/rateLimits');
const logger = require('../utils/logger');

/**
 * Redis-backed sliding window rate limiter.
 * Uses sorted sets for precise sliding window tracking.
 */
const rateLimiter = (req, res, next) => {
  // Build route key for rule lookup
  const routeKey = `${req.method} ${req.route?.path || req.path}`;
  const rule = rateLimitRules[routeKey] || rateLimitRules.default;

  if (!rule) return next();

  // Parse window duration
  const windowMs = parseWindow(rule.window);

  // Determine rate limit key (per IP or per user)
  let limitKey;
  if (rule.key === 'ip') {
    limitKey = `ratelimit:${routeKey}:ip:${req.ip}`;
  } else {
    const userId = req.user?.id || req.ip;
    limitKey = `ratelimit:${routeKey}:user:${userId}`;
  }

  // Determine max requests (with role overrides)
  let maxRequests = rule.max;
  if (rule.roleOverrides && req.user?.role) {
    const override = rule.roleOverrides[req.user.role];
    if (override !== undefined) {
      maxRequests = override;
    }
  }

  // Check role restriction
  if (rule.roles && req.user?.role && !rule.roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: role not allowed for this endpoint' });
  }

  if (maxRequests === Infinity) return next();

  // Sliding window implementation using Redis sorted sets
  const now = Date.now();
  const windowStart = now - windowMs;

  const multi = redisClient.multi ? redisClient : {
    // Fallback for mock Redis
    pipeline: () => ({ exec: async () => [[null, 0]] })
  };

  (async () => {
    try {
      // Remove old entries outside window
      await redisClient.zremrangebyscore(limitKey, 0, windowStart);

      // Count current requests in window
      const count = await redisClient.zcard(limitKey);

      if (count >= maxRequests) {
        // Calculate retry-after
        const oldestStr = await redisClient.zrange(limitKey, 0, 0);
        const oldest = oldestStr && oldestStr[0] ? parseInt(oldestStr[0]) : now;
        const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);

        res.set('Retry-After', retryAfter);
        res.set('X-RateLimit-Limit', maxRequests);
        res.set('X-RateLimit-Remaining', 0);

        logger.warn({ key: limitKey, count, max: maxRequests }, 'Rate limit exceeded');
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter,
        });
      }

      // Add current request timestamp
      await redisClient.zadd(limitKey, now, `${now}:${Math.random()}`);
      await redisClient.expire(limitKey, Math.ceil(windowMs / 1000));

      // Set rate limit headers
      res.set('X-RateLimit-Limit', maxRequests);
      res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - count - 1));

      next();
    } catch (err) {
      logger.error({ error: err.message }, 'Rate limiter error — allowing request');
      next(); // Fail open on Redis errors
    }
  })();
};

function parseWindow(window) {
  const match = window.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 60000; // default 1 minute

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 60000;
  }
}

module.exports = rateLimiter;
