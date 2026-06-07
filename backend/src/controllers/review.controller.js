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
  const { resolution, note, overrides, selected_alumni_id } = req.body;
  if (!['merged', 'new', 'skipped'].includes(resolution)) {
    return res.status(400).json({ error: 'Resolution must be: merged, new, or skipped' });
  }
  const result = await reviewService.resolve(
    req.params.id, resolution, req.user.id, note, overrides || {}, selected_alumni_id || null
  );
  res.json(result);
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await reviewService.getStats();
  res.json(stats);
});

const filterOptions = asyncHandler(async (req, res) => {
  const opts = await reviewService.filterOptions();
  res.json(opts);
});

const rematchPending = asyncHandler(async (req, res) => {
  const result = await reviewService.rematchPending(req.user.id);
  res.json(result);
});

const rematchScan = asyncHandler(async (req, res) => {
  const result = await reviewService.scanRematchDoubts(req.user.id);
  res.json(result);
});

const rematchDoubtRecords = asyncHandler(async (req, res) => {
  const { field, a, b } = req.query || {};
  if (field !== 'branch' && field !== 'degree') {
    return res.status(400).json({ error: 'field must be branch or degree' });
  }
  if (!a || !b) return res.status(400).json({ error: 'a and b required' });
  const result = await reviewService.doubtRecords(field, a, b);
  res.json(result);
});

const rematchApply = asyncHandler(async (req, res) => {
  const branchDecisions = Array.isArray(req.body?.branch_decisions) ? req.body.branch_decisions : [];
  const degreeDecisions = Array.isArray(req.body?.degree_decisions) ? req.body.degree_decisions : [];
  const result = await reviewService.applyRematchWithDecisions(branchDecisions, degreeDecisions, req.user.id);
  res.json(result);
});

const rematchDecideOne = asyncHandler(async (req, res) => {
  const { field, a, b, same, preferred } = req.body || {};
  if (!field || !a || !b) return res.status(400).json({ error: 'field, a, b required' });
  if (field !== 'branch' && field !== 'degree') return res.status(400).json({ error: 'field must be branch or degree' });
  const result = await reviewService.applyOneDecision(field, a, b, !!same, preferred || null, req.user.id);
  res.json(result);
});

const rematchDecideBatch = asyncHandler(async (req, res) => {
  const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  for (const d of decisions) {
    if (!d || !d.field || !d.a || !d.b) return res.status(400).json({ error: 'each decision needs field, a, b' });
    if (d.field !== 'branch' && d.field !== 'degree') return res.status(400).json({ error: 'field must be branch or degree' });
  }
  const result = await reviewService.applyBatchDecisions(decisions, req.user.id);
  res.json(result);
});

const rematchForget = asyncHandler(async (req, res) => {
  const { field, a, b } = req.body || {};
  if (!field || !a || !b) return res.status(400).json({ error: 'field, a, b required' });
  await reviewService.forgetDecision(field, a, b);
  res.json({ ok: true });
});

const rematchResolved = asyncHandler(async (req, res) => {
  const rows = await reviewService.listResolvedDecisions();
  res.json({ data: rows });
});

const bulkResolveByContact = asyncHandler(async (req, res) => {
  const batchSize = Math.min(parseInt(req.body?.batch_size) || 500, 2000);
  const result = await reviewService.bulkResolveByContact(req.user.id, batchSize);
  res.json(result);
});

const diagnostics = asyncHandler(async (req, res) => {
  const result = await reviewService.diagnostics();
  res.json(result);
});

const bulkSeparateByLinkedin = asyncHandler(async (req, res) => {
  const batchSize = Math.min(parseInt(req.body?.batch_size) || 500, 2000);
  const result = await reviewService.bulkSeparateByDifferentLinkedin(req.user.id, batchSize);
  res.json(result);
});

const bulkResolveUnmergeable = asyncHandler(async (req, res) => {
  const batchSize = Math.min(parseInt(req.body?.batch_size) || 1000, 5000);
  const result = await reviewService.bulkResolveUnmergeable(req.user.id, batchSize);
  res.json(result);
});

const bulkSeparateByBranchDegree = asyncHandler(async (req, res) => {
  const batchSize = Math.min(parseInt(req.body?.batch_size) || 500, 2000);
  const result = await reviewService.bulkSeparateByDifferentBranchAndDegree(req.user.id, batchSize);
  res.json(result);
});

const bulkMergeBareDuplicates = asyncHandler(async (req, res) => {
  const batchSize = Math.min(parseInt(req.body?.batch_size) || 50, 500);
  const result = await reviewService.bulkMergeBareDuplicates(req.user.id, batchSize);
  res.json(result);
});

const cleanCollegeStudentValues = asyncHandler(async (req, res) => {
  const preview = req.body?.preview === true;
  const result = await reviewService.cleanCollegeStudentValues(req.user.id, { preview });
  res.json(result);
});

module.exports = {
  listPending, getById, resolve, getStats,
  rematchPending, rematchScan, rematchDoubtRecords, rematchApply, rematchDecideOne,
  rematchDecideBatch, rematchForget, rematchResolved,
  bulkResolveByContact,
  bulkSeparateByLinkedin,
  bulkResolveUnmergeable,
  bulkSeparateByBranchDegree,
  bulkMergeBareDuplicates,
  cleanCollegeStudentValues,
  filterOptions,
  diagnostics,
};
