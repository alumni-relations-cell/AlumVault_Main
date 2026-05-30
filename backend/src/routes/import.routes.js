const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const importController = require('../controllers/import.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { uploadSchema } = require('../validators/import.validator');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.tsv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, XLSX, and TSV files are allowed'), false);
    }
  },
});

router.use(authenticate);

// Upload a file for import
router.post('/', rbac(['team_lead', 'admin', 'super_admin']), upload.single('file'), importController.upload);

// List import jobs
router.get('/',  rbac(['super_admin', 'admin', 'team_lead', 'team_member']), importController.listJobs);

// Cancel a job
router.post('/:id/cancel', rbac(['super_admin', 'admin']), importController.cancelJob);

// Get specific job
router.get('/:id', rbac(['super_admin', 'admin', 'team_lead', 'team_member']), importController.getImportStatus);

// Rollback a job
router.post('/:id/rollback', rbac(['super_admin', 'admin']), importController.rollbackImport);
// Poll rollback progress — the DELETE keeps running after the proxy aborts
// the POST, so the UI watches this endpoint to know when it's actually done.
router.get('/:id/rollback-status', rbac(['super_admin', 'admin', 'team_lead']), importController.rollbackStatus);

// Targeted cleanup: nuke every alumnus with batch_year = 0 (importer's "couldn't
// derive graduation year" sentinel). Used when bad imports left orphans the
// per-job rollback can't reach.
router.post('/cleanup/batch-year-zero', rbac(['super_admin', 'admin']), importController.purgeBatchYearZero);

module.exports = router;
