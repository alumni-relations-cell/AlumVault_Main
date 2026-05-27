const db = require('../config/db');
const { publishToQueue } = require('../config/rabbitmq');
const logger = require('../utils/logger');

class ImportService {
  /**
   * Create a new import job and publish to RabbitMQ for Go worker processing.
   */
  async createJob(metadata, filePath, userId) {
    const { source_type, source_tier, source_name, column_mapping } = metadata;

    const result = await db.query(
      `INSERT INTO import_jobs (source_type, source_tier, source_name, file_path, column_mapping, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [source_type, source_tier, source_name, filePath, column_mapping ? JSON.stringify(column_mapping) : null, userId]
    );

    const job = result.rows[0];

    // Publish to RabbitMQ for Go importer/matcher
    await publishToQueue('import.pending', {
      job_id: job.id,
      file_path: filePath,
      source_tier: source_tier,
      column_mapping: column_mapping || {},
      initiated_by: userId,
    });

    logger.info({ jobId: job.id, sourceType: source_type, tier: source_tier }, 'Import job created');
    return job;
  }

  /**
   * Get an import job by ID.
   */
  async getJob(jobId) {
    const result = await db.query('SELECT * FROM import_jobs WHERE id = $1', [jobId]);
    if (result.rows.length === 0) throw new Error('Import job not found');
    return result.rows[0];
  }

  /**
   * List all import jobs with pagination.
   */
  async listJobs(query) {
    const limit = Math.min(parseInt(query.limit) || 25, 100);
    const offset = parseInt(query.offset) || 0;
    const status = query.status;

    let sql = 'SELECT * FROM import_jobs';
    const params = [];

    if (status) {
      params.push(status);
      sql += ` WHERE status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const result = await db.query(sql, params);
    const countResult = await db.query('SELECT COUNT(*) FROM import_jobs');

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    };
  }

  /**
   * Cancel a pending or processing import job.
   */
  async cancelJob(jobId, userId) {
    const result = await db.query(
      `UPDATE import_jobs SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'processing') RETURNING *`,
      [jobId]
    );

    if (result.rows.length === 0) {
      throw new Error('Job not found or cannot be cancelled');
    }

    logger.info({ jobId, cancelledBy: userId }, 'Import job cancelled');
    return result.rows[0];
  }
}

module.exports = new ImportService();
