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
  // Bulk cleanup endpoints — operator may click multiple times if the
  // operation is long-running and the proxy aborts before commit.
  'POST /alumni/bulk/normalize': { max: 30, window: '1m', key: 'user' },
  'POST /alumni/bulk/dedupe':    { max: 30, window: '1m', key: 'user' },

  'POST /import': { max: 5, window: '1h', key: 'user' },
  'GET /import': { max: 50, window: '1m', key: 'user' },
  // Frontend polls this every ~3s during a long rollback. Keep generous.
  'GET /import/:id/rollback-status': { max: 240, window: '1m', key: 'user' },
  // Admin cleanup — operator may click "Delete batch_year=0" several times in
  // a row if the proxy aborts a chunked run partway through, so allow retries
  // freely. Server-side it's still gated by RBAC (super_admin/admin).
  'POST /import/cleanup/batch-year-zero': { max: 30, window: '1m', key: 'user' },

  'GET /review': { max: 100, window: '1m', key: 'user' },
  'POST /review/:id/resolve': { max: 30, window: '1m', key: 'user' },
  // Bulk rematch may be invoked repeatedly while inspecting the queue.
  'POST /review/rematch': { max: 10, window: '1m', key: 'user' },
  'POST /review/rematch/scan':       { max: 10, window: '1m', key: 'user' },
  'POST /review/rematch/apply':      { max: 10, window: '1m', key: 'user' },
  // One call per doubt the operator clicks through — keep generous.
  'POST /review/rematch/decide-one':   { max: 600, window: '1m', key: 'user' },
  'POST /review/rematch/decide-batch': { max: 200, window: '1m', key: 'user' },
  'POST /review/rematch/forget':       { max: 600, window: '1m', key: 'user' },
  'GET /review/rematch/resolved':      { max: 60,  window: '1m', key: 'user' },
  // Frontend loops this every ~1s while draining the queue; keep headroom.
  'POST /review/bulk/resolve-by-contact': { max: 240, window: '1m', key: 'user' },

  'POST /campaigns': { max: 10, window: '1h', key: 'user' },
  'GET /campaigns': { max: 50, window: '1m', key: 'user' },

  'GET /dashboard': { max: 30, window: '1m', key: 'user' },
  'GET /audit': { max: 20, window: '1m', key: 'user' },

  default: { max: 60, window: '1m', key: 'ip' },
};
