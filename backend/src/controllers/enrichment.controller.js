const asyncHandler = require('../utils/asyncHandler');
const amqp = require('../config/rabbitmq');
const db = require('../config/db');

const triggerBatch = asyncHandler(async (req, res) => {
  const { source } = req.body; // apollo or linkedin

  const result = await db.query(`
    INSERT INTO import_jobs (source_type, source_tier, source_name, status, total_rows)
    VALUES ('api', 3, $1, 'pending', 0)
    RETURNING id
  `, [source || 'apollo_batch']);

  await amqp.publish('alumni.exchange', 'enrich.batch', {
    job_id: result.rows[0].id,
    triggered_by: req.user.id
  });

  res.status(202).json({ message: 'Enrichment batch triggered successfully', job_id: result.rows[0].id });
});

const getProgress = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const result = await db.query('SELECT status, total_rows, processed_rows FROM import_jobs WHERE id = $1', [jobId]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
  
  res.status(200).json({ data: result.rows[0] });
});

const getEmailHealth = asyncHandler(async (req, res) => {
  // Aggregate SMTP validity from emails JSONB array
  const result = await db.query(`
    WITH emails_expanded AS (
      SELECT jsonb_array_elements(emails) AS e
      FROM alumni
    )
    SELECT 
      e->>'smtp_status' AS status,
      COUNT(*) AS count
    FROM emails_expanded
    GROUP BY e->>'smtp_status'
  `);

  res.status(200).json({ data: result.rows });
});

module.exports = { triggerBatch, getProgress, getEmailHealth };
