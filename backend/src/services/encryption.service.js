// backend/src/services/encryption.service.js

const crypto = require('crypto');

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '1234567890123456789012345678901234567890123456789012345678901234', 'hex'); // 32 bytes
const BLIND_INDEX_KEY = Buffer.from(process.env.BLIND_INDEX_KEY || '1234567890123456789012345678901234567890123456789012345678901234', 'hex');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

function blindIndex(value) {
  return crypto.createHmac('sha256', BLIND_INDEX_KEY)
    .update(value.toLowerCase().trim())
    .digest('hex');
}

module.exports = { encrypt, decrypt, blindIndex };
