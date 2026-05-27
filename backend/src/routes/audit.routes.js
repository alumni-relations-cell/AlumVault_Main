const router = require('express').Router();
const auditController = require('../controllers/audit.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(authenticate);
router.use(rbac(['super_admin', 'admin']));

router.get('/', auditController.query);

module.exports = router;
