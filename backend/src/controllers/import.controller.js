const importService = require('../services/import.service');
const asyncHandler = require('../utils/asyncHandler');

const upload = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const job = await importService.createJob(req.body, req.file.path, req.user.id);
  res.status(201).json(job);
});

const getJob = asyncHandler(async (req, res) => {
  const job = await importService.getJob(req.params.id);
  res.json(job);
});

const listJobs = asyncHandler(async (req, res) => {
  const result = await importService.listJobs(req.query);
  res.json(result);
});

const cancelJob = asyncHandler(async (req, res) => {
  const result = await importService.cancelJob(req.params.id, req.user.id);
  res.json(result);
});

const getImportStatus = asyncHandler(async (req, res) => {
  const job = await importService.getJob(req.params.id);
  res.json(job);
});

const rollbackImport = asyncHandler(async (req, res) => {
  const result = await importService.rollback(req.params.id, req.user.id);
  res.json(result);
});

const rollbackStatus = asyncHandler(async (req, res) => {
  const result = await importService.rollbackStatus(req.params.id);
  res.json(result);
});

const purgeBatchYearZero = asyncHandler(async (req, res) => {
  const result = await importService.purgeBatchYearZero(req.user.id);
  res.json(result);
});

module.exports = { upload, getJob, listJobs, cancelJob, getImportStatus, rollbackImport, rollbackStatus, purgeBatchYearZero };
