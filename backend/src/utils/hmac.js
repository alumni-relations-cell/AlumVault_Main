const crypto = require('crypto');

const HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || 'dev-hmac-secret';

/**
 * Sign a message payload with HMAC-SHA256.
 * Used for internal Node↔Go service-to-service request signing.
 */
const signMessage = (payload) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', HMAC_SECRET).update(body).digest('hex');
};

/**
 * Verify an HMAC-SHA256 signature against a payload.
 */
const verifySignature = (payload, signature) => {
  const expected = signMessage(payload);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
};

/**
 * Generate a blind index using HMAC-SHA256 for searchable encrypted fields.
 */
const blindIndex = (value) => {
  const key = process.env.BLIND_INDEX_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  return crypto.createHmac('sha256', Buffer.from(key, 'hex'))
    .update(value.toLowerCase().trim())
    .digest('hex');
};

module.exports = { signMessage, verifySignature, blindIndex };
