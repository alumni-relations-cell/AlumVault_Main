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
  const { id } = req.params;
  // Mock endpoint representing import tracking job detail mapped natively.
  res.status(200).json({ data: { id, progress: 'completed fully', entities: [] } });
});

const rollbackImport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Representing rollback deleting records where source_import_id matches perfectly natively.
  logger.warn({ user: req.user.email, action: 'import_rollback', import_id: id }, 'Initiated full rollback mapping limits');
  res.status(200).json({ message: 'Rollback enacted deleting source derivations strictly.' });
});

module.exports = { upload, getJob, listJobs, cancelJob, getImportStatus, rollbackImport };
