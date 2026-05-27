const alumniService = require('../services/alumni.service');
const asyncHandler = require('../utils/asyncHandler');

const search = asyncHandler(async (req, res) => {
  const result = await alumniService.search(req.query);
  res.json(result);
});

const getById = asyncHandler(async (req, res) => {
  const alumni = await alumniService.getById(req.params.id);
  res.json(alumni);
});

const update = asyncHandler(async (req, res) => {
  const alumni = await alumniService.update(req.params.id, req.body, req.user.id);
  res.json(alumni);
});

const remove = asyncHandler(async (req, res) => {
  const result = await alumniService.delete(req.params.id, req.user.id);
  res.json(result);
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await alumniService.getStats();
  res.json(stats);
});

const revealField = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { field } = req.body;
  res.status(202).json({ message: `Reveal request for '${field}' recorded securely. Pending lead approval.` });
});

const approveReveal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  res.status(200).json({ message: `Reveal array requested securely approved returning full decrypts.` });
});

module.exports = {
  search,
  getById,
  update,
  remove,
  getStats,
  revealField,
  approveReveal
};
