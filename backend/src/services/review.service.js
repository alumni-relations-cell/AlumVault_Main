const db = require('../config/db');
const logger = require('../utils/logger');

class ReviewService {
  /**
   * Get pending review items with pagination.
   */
  async listPending(query) {
    const limit = Math.min(parseInt(query.limit) || 25, 100);
    const offset = parseInt(query.offset) || 0;

    const result = await db.query(
      `SELECT rq.*, a.full_name as existing_name, a.batch_year as existing_batch, a.branch as existing_branch
       FROM review_queue rq
       LEFT JOIN alumni a ON rq.existing_alumni_id = a.id
       WHERE rq.status = 'pending'
       ORDER BY rq.match_score DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await db.query("SELECT COUNT(*) FROM review_queue WHERE status = 'pending'");

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    };
  }

  /**
   * Get a specific review item by ID.
   */
  async getById(id) {
    const result = await db.query(
      `SELECT rq.*, a.full_name as existing_name, a.batch_year, a.branch, a.emails, a.phones
       FROM review_queue rq
       LEFT JOIN alumni a ON rq.existing_alumni_id = a.id
       WHERE rq.id = $1`,
      [id]
    );
    if (result.rows.length === 0) throw new Error('Review item not found');
    return result.rows[0];
  }

  /**
   * Resolve a review item: merge, skip, or create new.
   */
  async resolve(id, resolution, userId, note) {
    const review = await this.getById(id);
    if (review.status !== 'pending') {
      throw new Error('Review already resolved');
    }

    // Update review status
    await db.query(
      `UPDATE review_queue SET status = $2, resolved_by = $3, resolved_at = NOW(), resolution_note = $4
       WHERE id = $1`,
      [id, resolution, userId, note || null]
    );

    // Handle resolution
    if (resolution === 'merged') {
      // Apply the incoming data to the existing alumni record
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data;

      const updateFields = {};
      if (incoming.current_company) updateFields.current_company = incoming.current_company;
      if (incoming.current_title) updateFields.current_title = incoming.current_title;
      if (incoming.linkedin_url) updateFields.linkedin_url = incoming.linkedin_url;
      if (incoming.current_city) updateFields.current_city = incoming.current_city;

      if (Object.keys(updateFields).length > 0) {
        const sets = Object.keys(updateFields).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const values = [review.existing_alumni_id, ...Object.values(updateFields)];
        await db.query(`UPDATE alumni SET ${sets}, updated_at = NOW(), updated_by = $${values.length + 1} WHERE id = $1`,
          [...values, userId]);
      }
    } else if (resolution === 'new') {
      // Create a new alumni record from the incoming data
      const incoming = typeof review.incoming_data === 'string'
        ? JSON.parse(review.incoming_data)
        : review.incoming_data;

      await db.query(
        `INSERT INTO alumni (full_name, batch_year, branch, current_company, current_title, linkedin_url, current_city, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [incoming.full_name, incoming.batch_year, incoming.branch,
         incoming.current_company, incoming.current_title, incoming.linkedin_url,
         incoming.current_city, userId]
      );
    }
    // 'skipped' — no action needed

    logger.info({ reviewId: id, resolution, resolvedBy: userId }, 'Review resolved');
    return { id, resolution, resolved: true };
  }

  /**
   * Get review stats.
   */
  async getStats() {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'merged') as merged,
        COUNT(*) FILTER (WHERE status = 'new') as new_records,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
        COUNT(*) as total
      FROM review_queue
    `);
    return result.rows[0];
  }
}

module.exports = new ReviewService();
