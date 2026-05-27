const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Hash a password using bcrypt with 12 rounds.
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
};

/**
 * Compare a plaintext password against a bcrypt hash.
 */
const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Validate password meets complexity requirements.
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const validatePasswordPolicy = (password) => {
  const errors = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Check if a password has been used recently (in password history).
 * @param {string} password - New plaintext password.
 * @param {Array} history - Array of previous password hashes (JSONB from DB).
 * @param {number} maxHistory - How many previous passwords to check (default: 5).
 */
const checkPasswordHistory = async (password, history = [], maxHistory = 5) => {
  const recentHistory = history.slice(-maxHistory);
  for (const oldHash of recentHistory) {
    const isSame = await bcrypt.compare(password, oldHash);
    if (isSame) {
      return false; // Password was recently used
    }
  }
  return true; // Password is unique
};

module.exports = { hashPassword, comparePassword, validatePasswordPolicy, checkPasswordHistory };
