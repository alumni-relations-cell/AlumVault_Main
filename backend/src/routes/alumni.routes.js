const router = require('express').Router();
const alumniController = require('../controllers/alumni.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const maskData = require('../middleware/dataMasking');
const validate = require('../middleware/validate');
const { searchSchema, updateAlumniSchema } = require('../validators/alumni.validator');

// All alumni routes require authentication
router.use(authenticate);

// Search & read — all roles
router.get('/', validate(searchSchema, 'query'), maskData, alumniController.search);
router.get('/stats', alumniController.getStats);
// Distinct values for filter dropdowns (batch years, branches, top companies)
// Listed before /:id so the static path matches first.
router.get('/filter-options', alumniController.filterOptions);
// Bulk cleanup endpoints — admin-only because they touch many rows at once.
// Normalize rewrites every distinct branch / degree value to canonical form.
// Dedupe collapses (canon_name, batch, canon_branch) clusters into one row.
router.post('/bulk/normalize', rbac(['admin', 'super_admin']), alumniController.bulkNormalize);
router.post('/bulk/dedupe',    rbac(['admin', 'super_admin']), alumniController.bulkDedupe);
// Permanently delete alumni rows with no batch_year, branch, linkedin_url, or
// enrollment_no (NULL/blank on all four). { preview: true } returns counts only.
router.post('/bulk/delete-empty', rbac(['admin', 'super_admin']), alumniController.bulkDeleteEmpty);
router.get('/:id', maskData, alumniController.getById);

// Update — team_lead, admin, super_admin
router.patch('/:id', rbac(['team_lead', 'admin', 'super_admin']), validate(updateAlumniSchema), alumniController.update);

// Delete — admin, super_admin only
router.delete('/:id', rbac(['admin', 'super_admin']), alumniController.remove);

router.patch('/:id/role', authenticate, rbac(['super_admin']), alumniController.update);

router.post('/:id/reveal', authenticate, rbac(['team_member', 'team_lead', 'admin', 'super_admin']), alumniController.revealField);
router.post('/:id/reveal/approve', authenticate, rbac(['team_lead', 'admin', 'super_admin']), alumniController.approveReveal);

module.exports = router;
