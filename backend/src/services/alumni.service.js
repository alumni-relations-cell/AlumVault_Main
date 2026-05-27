const db = require('../config/db');
const { encrypt, blindIndex } = require('./encryption.service');
const { parsePagination, buildPaginatedResponse, applyCursorPagination } = require('../utils/pagination');
const logger = require('../utils/logger');

class AlumniService {
  /**
   * Search alumni with fuzzy text search and filters.
   */
  async search(query) {
    const { limit, cursor, direction } = parsePagination(query);
    let params = [];
    let conditions = ['1=1'];

    // Full-text fuzzy search
    if (query.q && query.q.trim()) {
      params.push(query.q.trim());
      conditions.push(`(full_name % $${params.length} OR full_name ILIKE '%' || $${params.length} || '%')`);
    }

    // Filters
    if (query.batch_year) {
      params.push(parseInt(query.batch_year));
      conditions.push(`batch_year = $${params.length}`);
    }
    if (query.branch) {
      params.push(query.branch);
      conditions.push(`branch ILIKE $${params.length}`);
    }
    if (query.company) {
      params.push(query.company);
      conditions.push(`current_company % $${params.length}`);
    }
    if (query.tag) {
      params.push(query.tag);
      conditions.push(`$${params.length} = ANY(tags)`);
    }
    if (query.is_verified !== undefined) {
      params.push(query.is_verified === 'true');
      conditions.push(`is_verified = $${params.length}`);
    }
    if (query.min_completeness) {
      params.push(parseFloat(query.min_completeness));
      conditions.push(`data_completeness >= $${params.length}`);
    }

    const baseQuery = `SELECT * FROM alumni WHERE ${conditions.join(' AND ')}`;
    const { query: paginatedQuery, params: allParams } = applyCursorPagination(
      baseQuery, cursor, direction, limit, 'created_at', params
    );

    const result = await db.query(paginatedQuery, allParams);
    return buildPaginatedResponse(result.rows, limit);
  }

  /**
   * Get a single alumni by ID.
   */
  async getById(id) {
    const result = await db.query('SELECT * FROM alumni WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new Error('Alumni not found');
    }
    return result.rows[0];
  }

  /**
   * Update specific alumni fields (encrypting contact data).
   */
  async update(id, data, userId) {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Alumni not found');

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    const simpleFields = ['full_name', 'enrollment_no', 'batch_year', 'branch', 'degree',
      'current_company', 'current_title', 'industry', 'linkedin_url', 'current_city'];

    for (const field of simpleFields) {
      if (data[field] !== undefined) {
        values.push(data[field]);
        updateFields.push(`${field} = $${paramIndex++}`);
      }
    }

    // Handle full_name_blind update
    if (data.full_name) {
      values.push(blindIndex(data.full_name));
      updateFields.push(`full_name_blind = $${paramIndex++}`);
    }

    // Handle encrypted contact fields
    if (data.emails) {
      const encryptedEmails = data.emails.map(e => ({
        ...e,
        value: encrypt(e.value),
        added_at: new Date().toISOString(),
      }));
      values.push(JSON.stringify(encryptedEmails));
      updateFields.push(`emails = $${paramIndex++}`);
    }

    if (data.phones) {
      const encryptedPhones = data.phones.map(p => ({
        ...p,
        value: encrypt(p.value),
        added_at: new Date().toISOString(),
      }));
      values.push(JSON.stringify(encryptedPhones));
      updateFields.push(`phones = $${paramIndex++}`);
    }

    if (data.tags) {
      values.push(data.tags);
      updateFields.push(`tags = $${paramIndex++}`);
    }

    // Add updated_by
    values.push(userId);
    updateFields.push(`updated_by = $${paramIndex++}`);

    // Add id
    values.push(id);

    const query = `UPDATE alumni SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, values);

    logger.info({ alumniId: id, updatedBy: userId }, 'Alumni updated');
    return result.rows[0];
  }

  /**
   * Delete an alumni record (soft-delete could be added).
   */
  async delete(id, userId) {
    const result = await db.query('DELETE FROM alumni WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      throw new Error('Alumni not found');
    }
    logger.info({ alumniId: id, deletedBy: userId }, 'Alumni deleted');
    return { id, deleted: true };
  }

  /**
   * Get aggregated statistics.
   */
  async getStats() {
    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_verified) as verified,
        AVG(data_completeness)::numeric(5,2) as avg_completeness,
        COUNT(DISTINCT batch_year) as batch_years,
        COUNT(DISTINCT branch) as branches
      FROM alumni
    `);
    return result.rows[0];
  }
}

module.exports = new AlumniService();
