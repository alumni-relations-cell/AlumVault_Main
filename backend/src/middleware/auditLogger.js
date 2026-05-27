const db = require('../config/db');
const logger = require('../utils/logger');

/**
 * Audit logging middleware — logs every API request to audit.log table.
 * Uses the 'finish' event to capture the response status.
 */
function auditLogger(req, res, next) {
  const startTime = Date.now();

  res.on('finish', async () => {
    // Only log authenticated requests
    if (!req.user) return;

    // Determine action from method + path
    const action = `${req.method} ${req.originalUrl}`.substring(0, 50);

    // Extract resource context
    const resourceType = extractResourceType(req.originalUrl);
    const resourceId = req.params?.id || null;

    // Build details object
    const details = {
      statusCode: res.statusCode,
      method: req.method,
      path: req.originalUrl,
      duration: Date.now() - startTime,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
    };

    try {
      await db.query(
        `INSERT INTO audit.log (user_id, user_email, user_role, action, resource_type, resource_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)`,
        [
          req.user.id,
          req.user.email,
          req.user.role,
          action,
          resourceType,
          resourceId,
          JSON.stringify(details),
          req.ip || '127.0.0.1',
          req.headers['user-agent'] || 'unknown',
        ]
      );
    } catch (err) {
      // Don't fail the request if audit logging fails
      logger.error({ error: err.message, action }, 'Audit log insert failed');
    }
  });

  next();
}

/**
 * Extract the resource type from the URL path.
 */
function extractResourceType(url) {
  const segments = url.replace(/^\/api\//, '').split('/');
  if (segments.length > 0) {
    return segments[0].split('?')[0]; // e.g., 'alumni', 'import', 'auth'
  }
  return 'unknown';
}

module.exports = auditLogger;
