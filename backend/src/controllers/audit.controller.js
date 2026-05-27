const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');

const query = asyncHandler(async (req, res) => {
  const logs = await auditService.query(req.query);
  res.json({ data: logs });
});

module.exports = { query };
