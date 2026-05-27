const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT id, email, role, name, is_active, is_locked, totp_enabled, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

const getById = asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT id, email, role, name, is_active, is_locked, totp_enabled, team_lead_id, created_at FROM users WHERE id = $1',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { role, is_active, is_locked, team_lead_id } = req.body;
  const result = await db.query(
    `UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active),
     is_locked = COALESCE($4, is_locked), team_lead_id = COALESCE($5, team_lead_id), updated_at = NOW()
     WHERE id = $1 RETURNING id, email, role, name, is_active, is_locked`,
    [req.params.id, role, is_active, is_locked, team_lead_id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  await db.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
  res.json({ message: 'User deactivated' });
});

module.exports = { list, getById, update, remove };
