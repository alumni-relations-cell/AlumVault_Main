/**
 * Rate limit rules per route.
 * Format: { max, window, key, roles?, roleOverrides? }
 */
module.exports = {
  'POST /auth/login': { max: 5, window: '1m', key: 'ip' },
  'POST /auth/refresh': { max: 10, window: '1m', key: 'ip' },
  'POST /auth/register': { max: 3, window: '1h', key: 'ip' },
  'POST /auth/verify-2fa': { max: 5, window: '1m', key: 'ip' },

  'GET /alumni': {
    max: 100, window: '1m', key: 'user',
    roleOverrides: { super_admin: Infinity, admin: 500 },
  },
  'GET /alumni/:id': { max: 100, window: '1m', key: 'user' },
  'PATCH /alumni/:id': { max: 30, window: '1m', key: 'user' },
  'DELETE /alumni/:id': { max: 10, window: '1m', key: 'user' },

  'POST /import': { max: 5, window: '1h', key: 'user' },
  'GET /import': { max: 50, window: '1m', key: 'user' },

  'GET /review': { max: 100, window: '1m', key: 'user' },
  'POST /review/:id/resolve': { max: 30, window: '1m', key: 'user' },

  'POST /campaigns': { max: 10, window: '1h', key: 'user' },
  'GET /campaigns': { max: 50, window: '1m', key: 'user' },

  'GET /dashboard': { max: 30, window: '1m', key: 'user' },
  'GET /audit': { max: 20, window: '1m', key: 'user' },

  default: { max: 60, window: '1m', key: 'ip' },
};
