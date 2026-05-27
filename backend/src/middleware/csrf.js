const crypto = require('crypto');

/**
 * CSRF protection using double-submit cookie pattern.
 * On GET requests: generates and sets XSRF-TOKEN cookie.
 * On mutation requests (POST/PUT/DELETE/PATCH): validates the token.
 */
function csrfProtection(req, res, next) {
  // Skip in development
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  // Skip for non-browser API calls (check for API key or internal calls)
  if (req.headers['x-internal-signature']) {
    return next();
  }

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    // Generate CSRF token and set as cookie
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
    return next();
  }

  // On mutations, validate token
  const cookieToken = req.cookies?.['XSRF-TOKEN'];
  const headerToken = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  // Timing-safe comparison
  try {
    const cookieBuf = Buffer.from(cookieToken);
    const headerBuf = Buffer.from(headerToken);

    if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
      return res.status(403).json({ error: 'CSRF token mismatch' });
    }
  } catch (err) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  next();
}

module.exports = csrfProtection;
