const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const getDashboard = asyncHandler(async (req, res) => {
  const [alumniStats, importStats, reviewStats, campaignStats] = await Promise.all([
    db.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_verified) as verified,
             AVG(data_completeness)::numeric(5,2) as avg_completeness
      FROM alumni
    `),
    db.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'processing') as active,
             SUM(merged_count) as total_merged,
             SUM(new_count) as total_new
      FROM import_jobs
    `),
    db.query(`SELECT COUNT(*) FILTER (WHERE status = 'pending') as pending FROM review_queue`),
    db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'sent') as sent FROM campaigns`),
  ]);

  res.json({
    alumni: alumniStats.rows[0],
    imports: importStats.rows[0],
    reviews: reviewStats.rows[0],
    campaigns: campaignStats.rows[0],
    timestamp: new Date().toISOString(),
  });
});

module.exports = { getDashboard };
