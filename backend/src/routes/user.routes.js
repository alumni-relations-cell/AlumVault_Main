const router = require('express').Router();
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(authenticate);
router.use(rbac(['super_admin', 'admin']));

router.get('/', userController.list);
router.get('/:id', userController.getById);
router.patch('/:id', userController.update);
router.delete('/:id', rbac(['super_admin']), userController.remove);

module.exports = router;
