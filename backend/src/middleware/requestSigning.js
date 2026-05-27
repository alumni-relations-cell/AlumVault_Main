const { verifySignature } = require('../utils/hmac');
const logger = require('../utils/logger');

/**
 * HMAC request signing middleware for internal Node↔Go service calls.
 * Verifies the x-internal-signature header against the request body.
 */
function requestSigning(req, res, next) {
  const signature = req.headers['x-internal-signature'];
  const timestamp = req.headers['x-internal-timestamp'];

  if (!signature) {
    return res.status(401).json({ error: 'Missing internal signature' });
  }

  // Check timestamp freshness (5 minute window to prevent replay attacks)
  if (timestamp) {
    const requestTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTime) > 300) {
      logger.warn({ timestamp, now }, 'Request signature timestamp too old');
      return res.status(401).json({ error: 'Request expired' });
    }
  }

  // Verify HMAC signature
  const body = JSON.stringify(req.body);
  try {
    if (!verifySignature(body, signature)) {
      logger.warn({ path: req.path }, 'Invalid HMAC signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    logger.error({ error: err.message }, 'Signature verification error');
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  next();
}

/**
 * Create a signed request headers object for outgoing internal calls.
 */
function createSignedHeaders(payload) {
  const { signMessage } = require('../utils/hmac');
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    'x-internal-signature': signMessage(body),
    'x-internal-timestamp': Math.floor(Date.now() / 1000).toString(),
    'Content-Type': 'application/json',
  };
}

module.exports = requestSigning;
module.exports.createSignedHeaders = createSignedHeaders;
