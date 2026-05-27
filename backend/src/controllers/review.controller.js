const reviewService = require('../services/review.service');
const asyncHandler = require('../utils/asyncHandler');

const listPending = asyncHandler(async (req, res) => {
  const result = await reviewService.listPending(req.query);
  res.json(result);
});

const getById = asyncHandler(async (req, res) => {
  const review = await reviewService.getById(req.params.id);
  res.json(review);
});

const resolve = asyncHandler(async (req, res) => {
  const { resolution, note } = req.body;
  if (!['merged', 'new', 'skipped'].includes(resolution)) {
    return res.status(400).json({ error: 'Resolution must be: merged, new, or skipped' });
  }
  const result = await reviewService.resolve(req.params.id, resolution, req.user.id, note);
  res.json(result);
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await reviewService.getStats();
  res.json(stats);
});

module.exports = { listPending, getById, resolve, getStats };
