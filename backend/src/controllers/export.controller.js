const asyncHandler = require('../utils/asyncHandler');
const db = require('../config/db');
const redis = require('../config/redis');
const Cursor = require('pg-cursor');

const exportCSV = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const rateLimitKey = `export_limit:${userId}`;

  const exportsCount = await redis.incr(rateLimitKey);
  if (exportsCount === 1) {
    await redis.expire(rateLimitKey, 3600);
  }

  if (exportsCount > 3) {
    return res.status(429).json({ error: 'Export limit reached. Maximum 3 exports per hour.' });
  }

  await db.query(
    'INSERT INTO audit.log (user_id, user_email, user_role, action, resource_type, ip_address, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
    [userId, req.user.email, req.user.role, 'export_csv', 'alumni', req.ip]
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="alumni_export.csv"');
  res.write('id,full_name,batch_year,branch,current_company,current_title,current_city\n');

  const client = await db.connect();
  const cursor = client.query(new Cursor('SELECT id, full_name, batch_year, branch, current_company, current_title, current_city FROM alumni'));

  const readAndSend = () => {
    try {
      cursor.read(1000, (err, rows) => {
        if (err) {
          cursor.close(() => client.release());
          return res.status(500).end();
        }
        
        if (rows.length === 0) {
          cursor.close(() => client.release());
          return res.end();
        }

        rows.forEach(row => {
          const line = `"${row.id}","${row.full_name || ''}","${row.batch_year || ''}","${row.branch || ''}","${row.current_company || ''}","${row.current_title || ''}","${row.current_city || ''}"\n`;
          res.write(line);
        });

        readAndSend();
      });
    } catch (err) {
      cursor.close(() => client.release());
      res.status(500).end();
    }
  };

  readAndSend();
});

module.exports = { exportCSV };
