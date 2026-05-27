const express = require('express');
const router = express.Router();
const enrichmentController = require('../controllers/enrichment.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/trigger', rbac(['super_admin', 'admin']), enrichmentController.triggerBatch);
router.get('/:jobId/progress', rbac(['super_admin', 'admin', 'team_lead', 'team_member']), enrichmentController.getProgress);
router.get('/email-health', rbac(['super_admin', 'admin', 'team_lead']), enrichmentController.getEmailHealth);

module.exports = router;
