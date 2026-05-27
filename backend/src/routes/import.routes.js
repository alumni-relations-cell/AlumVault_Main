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

module.exports = router;
