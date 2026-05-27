const { verifyAccessToken } = require('../utils/jwt');
const logger = require('../utils/logger');

/**
 * Authenticate a WebSocket connection using the token from query string or headers.
 */
function authenticateWS(request, callback) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      callback(false, 401, 'Missing authentication token');
      return;
    }

    const decoded = verifyAccessToken(token);
    request.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };

    callback(true);
  } catch (err) {
    logger.warn({ error: err.message }, 'WebSocket auth failed');
    callback(false, 401, 'Invalid token');
  }
}

module.exports = authenticateWS;
