const db = require('../config/db');
const { publishToQueue } = require('../config/rabbitmq');
const logger = require('../utils/logger');

class ImportService {
  /**
   * Create a new import job and publish to RabbitMQ for Go worker processing.
   */
  async createJob(metadata, filePath, userId) {
    const source_type = metadata.source_type || 'excel_upload';
    const source_tier = metadata.source_tier != null ? parseInt(metadata.source_tier, 10) : 3;
    const source_name = metadata.source_name || null;
    const column_mapping = metadata.column_mapping;

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
      source_type: source_type,
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
   * Delete alumni rows created by a specific import job, and strip JSONB
   * contact entries that the same job appended to pre-existing rows.
   *
   * Inserts vs. updates:
   *   - Inserts → source_import_id was stamped → row-level DELETE.
   *   - Updates → the job only appended to emails/phones; we filter those
   *     entries back out (by source_name = job.file_path) without touching
   *     the rest of the row.
   *
   * Returns a summary the UI can show before/after the operation.
   */
  async rollback(jobId, userId) {
    const jobRes = await db.query('SELECT * FROM import_jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) throw new Error('Import job not found');
    const job = jobRes.rows[0];

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Delete alumni rows whose creation provenance points at this job.
      const delRes = await client.query(
        `DELETE FROM alumni WHERE source_import_id = $1`,
        [jobId]
      );
      const deletedAlumni = delRes.rowCount;

      // 2. Strip this job's contact entries from rows it merely *updated*.
      //    Identify candidates by JSONB source_name match, then rebuild the
      //    array without those entries. Empty arrays stay as '[]'.
      const stripRes = await client.query(
        `UPDATE alumni a
         SET emails = COALESCE((
               SELECT jsonb_agg(e)
               FROM jsonb_array_elements(COALESCE(a.emails, '[]'::jsonb)) e
               WHERE e->>'source_name' IS DISTINCT FROM $2
             ), '[]'::jsonb),
             phones = COALESCE((
               SELECT jsonb_agg(p)
               FROM jsonb_array_elements(COALESCE(a.phones, '[]'::jsonb)) p
               WHERE p->>'source_name' IS DISTINCT FROM $2
             ), '[]'::jsonb),
             updated_at = NOW()
         WHERE a.source_import_id IS DISTINCT FROM $1
           AND (
             EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(a.emails, '[]'::jsonb)) e
               WHERE e->>'source_name' = $2
             )
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(a.phones, '[]'::jsonb)) p
               WHERE p->>'source_name' = $2
             )
           )`,
        [jobId, job.file_path]
      );
      const strippedAlumni = stripRes.rowCount;

      // 3. Clean up review queue entries this job spawned (only pending ones —
      //    already-resolved reviews are historical record).
      const revRes = await client.query(
        `DELETE FROM review_queue WHERE source_import_id = $1 AND status = 'pending'`,
        [jobId]
      );
      const deletedReviews = revRes.rowCount;

      // 4. Mark the job as rolled back. Keep the row so the audit trail still
      //    shows it ran — the status change is the receipt.
      await client.query(
        `UPDATE import_jobs SET status = 'rolled_back', completed_at = NOW() WHERE id = $1`,
        [jobId]
      );

      await client.query('COMMIT');

      logger.warn({
        jobId, userId, deletedAlumni, strippedAlumni, deletedReviews,
        filePath: job.file_path,
      }, 'Import rolled back');

      return {
        job_id: jobId,
        deleted_alumni: deletedAlumni,
        stripped_alumni: strippedAlumni,
        deleted_reviews: deletedReviews,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lightweight progress check used by the UI to poll a rollback that may
   * outlast the 30s reverse-proxy timeout. The actual DELETE is still
   * grinding inside the backend transaction even after the HTTP call drops;
   * the UI polls this every few seconds until alumni_remaining = 0 or status
   * flips to 'rolled_back'.
   */
  async rollbackStatus(jobId) {
    const j = await db.query(
      `SELECT id, status, new_count, file_path FROM import_jobs WHERE id = $1`,
      [jobId]
    );
    if (j.rows.length === 0) throw new Error('Import job not found');
    const job = j.rows[0];

    const cnt = await db.query(
      `SELECT count(*)::int AS n FROM alumni WHERE source_import_id = $1`,
      [jobId]
    );
    const alumniRemaining = cnt.rows[0].n;

    return {
      job_id: jobId,
      status: job.status,
      alumni_remaining: alumniRemaining,
      alumni_originally_created: job.new_count || 0,
      file_path: job.file_path,
      done: job.status === 'rolled_back' || alumniRemaining === 0,
    };
  }

  /**
   * Delete every alumnus whose batch_year is exactly 0 — the sentinel value
   * the Go importer writes when it couldn't derive a graduation year (unknown
   * PROGRAMNAME, unparseable ACADEMICYEAR, etc.). NULL and missing rows are
   * left alone; this is a targeted cleanup, not a wildcard purge.
   *
   * Used as the "undo the bad roster import" escape hatch when the per-job
   * rollback button can't reach rows whose source_import_id never got set
   * (e.g. an earlier import before source tracking existed).
   */
  async purgeBatchYearZero(userId) {
    // Batched delete in short transactions so locks release between chunks
    // and committed rows survive a proxy timeout. Two FKs reference alumni
    // with NO ACTION (review_queue.existing_alumni_id, campaign_recipients
    // .alumni_id) — we clear those references inside the same transaction
    // before deleting the alumni rows, otherwise PG raises 23503. The
    // CASCADE FKs (alumni_alternates, alumni_companies) clean themselves up.
    const BATCH = 500;
    const MAX_BATCHES = 2000; // 1M-row safety ceiling

    let totalDeleted = 0;
    let totalReviewsCleared = 0;
    let totalCampaignsCleared = 0;
    let batches = 0;

    while (batches < MAX_BATCHES) {
      const client = await db.getClient();
      let batchDeleted = 0;
      try {
        await client.query('BEGIN');

        const idsRes = await client.query(
          `SELECT id FROM alumni WHERE batch_year = 0 LIMIT $1 FOR UPDATE SKIP LOCKED`,
          [BATCH]
        );
        const ids = idsRes.rows.map(r => r.id);
        if (ids.length === 0) {
          await client.query('COMMIT');
          break;
        }

        const rq = await client.query(
          `DELETE FROM review_queue WHERE existing_alumni_id = ANY($1::uuid[])`,
          [ids]
        );
        totalReviewsCleared += rq.rowCount;

        const cr = await client.query(
          `DELETE FROM campaign_recipients WHERE alumni_id = ANY($1::uuid[])`,
          [ids]
        );
        totalCampaignsCleared += cr.rowCount;

        const al = await client.query(
          `DELETE FROM alumni WHERE id = ANY($1::uuid[])`,
          [ids]
        );
        batchDeleted = al.rowCount;
        totalDeleted += batchDeleted;

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      batches++;
      if (batchDeleted < BATCH) break; // last partial chunk → done
    }

    logger.warn({
      userId, deleted: totalDeleted, batches,
      reviewsCleared: totalReviewsCleared,
      campaignsCleared: totalCampaignsCleared,
    }, 'Batch-year-zero alumni purged');
    return {
      deleted: totalDeleted,
      batches,
      reviews_cleared: totalReviewsCleared,
      campaigns_cleared: totalCampaignsCleared,
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
