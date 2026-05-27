const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const HS256_SECRET = process.env.JWT_SECRET || 'alumni-portal-dev-secret-key-2024';

/**
 * Generate an access token (JWT RS256 or HS256 fallback).
 * Payload includes: sub, email, role, perms, name, fp (fingerprint).
 */
const generateAccessToken = (user, ip, userAgent) => {
  const { ROLE_PERMISSIONS } = require('../constants/roles');
  const perms = ROLE_PERMISSIONS[user.role] || [];

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    perms,
    fp: generateFingerprint(ip, userAgent),
  };

  return jwt.sign(payload, HS256_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '1h',
  });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, HS256_SECRET);
};

/**
 * Generate a cryptographically random refresh token (256-bit).
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Hash a refresh token using SHA-256 for storage in the database.
 */
const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate a device fingerprint from IP and User-Agent.
 */
const generateFingerprint = (ip, userAgent) => {
  return crypto.createHmac('sha256', HS256_SECRET)
    .update(`${ip || ''}:${userAgent || ''}`)
    .digest('hex')
    .substring(0, 16);
};

/**
 * Verify that the fingerprint in the token matches the current request.
 */
const verifyFingerprint = (token, ip, userAgent) => {
  const expected = generateFingerprint(ip, userAgent);
  return token.fp === expected;
};

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateFingerprint,
  verifyFingerprint,
};
