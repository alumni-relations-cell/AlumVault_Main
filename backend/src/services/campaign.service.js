const db = require('../config/db');
const logger = require('../utils/logger');

class CampaignService {
  /**
   * Create a new campaign with audience filtering.
   */
  async create(data, userId) {
    // Calculate audience count based on filter
    const audienceCount = await this._calculateAudience(data.audience_filter);

    const result = await db.query(
      `INSERT INTO campaigns (name, type, audience_filter, audience_count, template_body, template_subject, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [data.name, data.type, JSON.stringify(data.audience_filter), audienceCount,
       data.template_body, data.template_subject, data.scheduled_at || null, userId]
    );

    logger.info({ campaignId: result.rows[0].id, audience: audienceCount }, 'Campaign created');
    return result.rows[0];
  }

  /**
   * List all campaigns.
   */
  async list(query) {
    const limit = Math.min(parseInt(query.limit) || 25, 100);
    const offset = parseInt(query.offset) || 0;

    const result = await db.query(
      'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return {
      data: result.rows,
      limit,
      offset,
    };
  }

  /**
   * Get a campaign by ID with recipient stats.
   */
  async getById(id) {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new Error('Campaign not found');

    const recipientStats = await db.query(
      `SELECT status, COUNT(*) as count FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status`,
      [id]
    );

    return {
      ...result.rows[0],
      recipient_stats: recipientStats.rows,
    };
  }

  /**
   * Update campaign (only draft campaigns).
   */
  async update(id, data, userId) {
    const campaign = await this.getById(id);
    if (campaign.status !== 'draft') {
      throw new Error('Only draft campaigns can be edited');
    }

    const updateFields = [];
    const values = [];
    let idx = 1;

    if (data.name) { values.push(data.name); updateFields.push(`name = $${idx++}`); }
    if (data.template_body) { values.push(data.template_body); updateFields.push(`template_body = $${idx++}`); }
    if (data.template_subject) { values.push(data.template_subject); updateFields.push(`template_subject = $${idx++}`); }
    if (data.scheduled_at) { values.push(data.scheduled_at); updateFields.push(`scheduled_at = $${idx++}`); }
    if (data.status) { values.push(data.status); updateFields.push(`status = $${idx++}`); }

    values.push(id);
    const result = await db.query(
      `UPDATE campaigns SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Calculate audience count from filter criteria.
   */
  async _calculateAudience(filter) {
    let conditions = ['1=1'];
    const params = [];

    if (filter.batch_year?.length > 0) {
      params.push(filter.batch_year);
      conditions.push(`batch_year = ANY($${params.length})`);
    }
    if (filter.branch?.length > 0) {
      params.push(filter.branch);
      conditions.push(`branch = ANY($${params.length})`);
    }
    if (filter.is_verified !== undefined) {
      params.push(filter.is_verified);
      conditions.push(`is_verified = $${params.length}`);
    }
    if (filter.min_completeness) {
      params.push(filter.min_completeness);
      conditions.push(`data_completeness >= $${params.length}`);
    }

    const result = await db.query(
      `SELECT COUNT(*) FROM alumni WHERE ${conditions.join(' AND ')}`,
      params
    );

    return parseInt(result.rows[0].count);
  }
}

module.exports = new CampaignService();
