const db = require('../config/db');
const redisClient = require('../config/redis');
const { comparePassword, hashPassword, validatePasswordPolicy, checkPasswordHistory } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, hashRefreshToken, generateFingerprint } = require('../utils/jwt');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Login with email and password. Returns tokens or 2FA challenge.
   */
  async login(email, password, ip, userAgent) {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];

    if (user.is_locked || !user.is_active) {
      throw new Error('Account is locked or inactive');
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // 2FA check
    if (user.totp_enabled && user.totp_secret) {
      // Return a temporary token for 2FA verification
      const tempToken = generateRefreshToken(); // reuse random token gen
      const tempHash = hashRefreshToken(tempToken);

      // Store temp token in Redis with 5-minute expiry
      await redisClient.set(`2fa:${tempHash}`, JSON.stringify({
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      }), 'EX', 300);

      return { requires_2fa: true, temp_token: tempToken };
    }

    // Generate tokens
    return this._issueTokens(user, ip, userAgent);
  }

  /**
   * Verify 2FA TOTP code after initial login.
   */
  async verify2FA(tempToken, totpCode, ip, userAgent) {
    const tempHash = hashRefreshToken(tempToken);
    const userDataStr = await redisClient.get(`2fa:${tempHash}`);

    if (!userDataStr) {
      throw new Error('2FA session expired');
    }

    const userData = JSON.parse(userDataStr);
    const result = await db.query('SELECT * FROM users WHERE id = $1', [userData.userId]);
    const user = result.rows[0];

    if (!user) throw new Error('User not found');

    // Verify TOTP code
    const { authenticator } = require('otplib');
    const isValid = authenticator.check(totpCode, user.totp_secret);

    if (!isValid) {
      throw new Error('Invalid 2FA code');
    }

    // Delete temp token
    await redisClient.del(`2fa:${tempHash}`);

    // Issue real tokens
    return this._issueTokens(user, ip, userAgent);
  }

  /**
   * Refresh access token using refresh token (rotation + theft detection).
   */
  async refreshToken(refreshTokenValue, ip, userAgent) {
    const tokenHash = hashRefreshToken(refreshTokenValue);

    const result = await db.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      // Token not found — possible theft; revoke all tokens for this user
      logger.warn({ tokenHash: tokenHash.substring(0, 8) }, 'Refresh token not found — possible token theft');
      throw new Error('Invalid refresh token');
    }

    const tokenRecord = result.rows[0];

    // Delete the used refresh token (rotation)
    await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);

    // Get user
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [tokenRecord.user_id]);
    const user = userResult.rows[0];

    if (!user || !user.is_active) {
      throw new Error('User account inactive');
    }

    // Issue new token pair
    return this._issueTokens(user, ip, userAgent);
  }

  /**
   * Register a new user (admin-only operation).
   */
  async register(userData, createdBy) {
    const { email, password, name, role, team_lead_id } = userData;

    // Check policy
    const policy = validatePasswordPolicy(password);
    if (!policy.valid) {
      throw new Error(`Password policy: ${policy.errors.join(', ')}`);
    }

    // Check existing user
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new Error('User already exists with this email');
    }

    const passwordHash = await hashPassword(password);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, role, name, team_lead_id, password_history)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, name, created_at`,
      [email, passwordHash, role, name, team_lead_id || null, JSON.stringify([passwordHash])]
    );

    logger.info({ userId: result.rows[0].id, email }, 'New user registered');
    return result.rows[0];
  }

  /**
   * Change password with history check.
   */
  async changePassword(userId, currentPassword, newPassword) {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) throw new Error('User not found');

    const isValid = await comparePassword(currentPassword, user.password_hash);
    if (!isValid) throw new Error('Current password incorrect');

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      throw new Error(`Password policy: ${policy.errors.join(', ')}`);
    }

    // Check password history
    const history = user.password_history || [];
    const isUnique = await checkPasswordHistory(newPassword, history);
    if (!isUnique) {
      throw new Error('Password was recently used. Choose a different password.');
    }

    const newHash = await hashPassword(newPassword);
    const updatedHistory = [...history, newHash].slice(-5);

    await db.query(
      'UPDATE users SET password_hash = $2, password_history = $3, last_password_change = NOW() WHERE id = $1',
      [userId, newHash, JSON.stringify(updatedHistory)]
    );

    // Invalidate all sessions
    const keys = await redisClient.keys(`session:${userId}:*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }

    logger.info({ userId }, 'Password changed, sessions invalidated');
    return { message: 'Password changed successfully' };
  }

  /**
   * Logout — destroy session and refresh token.
   */
  async logout(userId, userAgent, refreshTokenValue) {
    // Delete Redis session
    const crypto = require('crypto');
    const deviceHash = crypto.createHash('md5').update(userAgent || 'unknown').digest('hex');
    await redisClient.del(`session:${userId}:${deviceHash}`);

    // Delete refresh token if provided
    if (refreshTokenValue) {
      const tokenHash = hashRefreshToken(refreshTokenValue);
      await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Internal helper to issue access + refresh tokens.
   */
  async _issueTokens(user, ip, userAgent) {
    const accessToken = generateAccessToken(user, ip, userAgent);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    // Store refresh token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4::inet, $5)`,
      [user.id, tokenHash, JSON.stringify({ userAgent }), ip || '127.0.0.1', expiresAt]
    );

    // Create Redis session
    const crypto = require('crypto');
    const deviceHash = crypto.createHash('md5').update(userAgent || 'unknown').digest('hex');
    await redisClient.set(`session:${user.id}:${deviceHash}`, accessToken, 'EX', 900);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }
}

module.exports = new AuthService();
