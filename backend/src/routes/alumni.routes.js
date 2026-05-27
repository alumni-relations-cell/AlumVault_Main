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
router.get('/:id', maskData, alumniController.getById);

// Update — team_lead, admin, super_admin
router.patch('/:id', rbac(['team_lead', 'admin', 'super_admin']), validate(updateAlumniSchema), alumniController.update);

// Delete — admin, super_admin only
router.delete('/:id', rbac(['admin', 'super_admin']), alumniController.remove);

router.patch('/:id/role', authenticate, rbac(['super_admin']), alumniController.update);

router.post('/:id/reveal', authenticate, rbac(['team_member', 'team_lead', 'admin', 'super_admin']), alumniController.revealField);
router.post('/:id/reveal/approve', authenticate, rbac(['team_lead', 'admin', 'super_admin']), alumniController.approveReveal);

module.exports = router;
