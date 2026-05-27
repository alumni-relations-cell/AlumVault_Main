const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

// All admin routes restricted to super_admin initially unless explicit
router.use(auth);

router.get('/users', rbac(['super_admin', 'admin']), adminController.listUsers);
router.post('/users/invite', rbac(['super_admin']), adminController.inviteUser);
router.patch('/users/:id/role', rbac(['super_admin']), adminController.editRole);

router.get('/sessions', rbac(['super_admin']), adminController.getActiveSessions);
router.delete('/sessions/:id', rbac(['super_admin']), adminController.forceLogoutSession);

router.get('/settings', rbac(['super_admin']), adminController.getSettings);
router.put('/settings', rbac(['super_admin']), adminController.updateSettings);

module.exports = router;
