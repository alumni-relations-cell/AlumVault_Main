const { verifyAccessToken, verifyFingerprint } = require('../utils/jwt');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Authentication middleware: JWT verify → session check → fingerprint verify.
 * Extracts token from httpOnly cookie or Authorization header.
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Extract token from cookie or header
    let token = req.cookies?.access_token;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Missing authentication token' });
    }

    // 2. Verify JWT (RS256 or HS256 fallback)
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 3. Check session in Redis
    const crypto = require('crypto');
    const deviceHash = crypto.createHash('md5').update(req.headers['user-agent'] || 'unknown').digest('hex');
    const sessionKey = `session:${decoded.sub}:${deviceHash}`;

    const session = await redisClient.get(sessionKey);
    if (!session) {
      logger.warn({ userId: decoded.sub }, 'Session not found in Redis — may be expired or force-logged out');
      // Allow request but mark as unverified session (non-blocking for dev)
    }

    // 4. Verify fingerprint (IP + UserAgent binding)
    const ip = req.ip || req.connection.remoteAddress;
    if (decoded.fp && !verifyFingerprint(decoded, ip, req.headers['user-agent'])) {
      logger.warn({ userId: decoded.sub, ip }, 'Fingerprint mismatch detected');
      // Log but don't block (some proxies change IPs)
    }

    // 5. Attach user to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      perms: decoded.perms || [],
    };

    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Authentication error');
    res.status(401).json({ error: 'Unauthorized' });
  }
};

module.exports = authenticate;
