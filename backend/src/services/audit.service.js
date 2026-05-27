const db = require('../config/db');
const logger = require('../utils/logger');

class AuditService {
  /**
   * Insert an audit log entry.
   */
  async log(userId, email, role, action, resourceType, resourceId, details, ip, userAgent) {
    try {
      await db.query(
        `INSERT INTO audit.log (user_id, user_email, user_role, action, resource_type, resource_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)`,
        [userId, email, role, action, resourceType, resourceId, JSON.stringify(details), ip || '127.0.0.1', userAgent]
      );
    } catch (err) {
      logger.error({ error: err.message, action }, 'Audit log insert failed');
    }
  }

  /**
   * Query audit logs with filters.
   */
  async query(filters = {}) {
    const { userId, action, resourceType, startDate, endDate, limit = 50, offset = 0 } = filters;
    let conditions = [];
    let params = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }
    if (resourceType) {
      params.push(resourceType);
      conditions.push(`resource_type = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(Math.min(limit, 100));
    params.push(offset);

    const result = await db.query(
      `SELECT * FROM audit.log ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return result.rows;
  }
}

module.exports = new AuditService();
