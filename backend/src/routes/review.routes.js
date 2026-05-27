const router = require('express').Router();
const reviewController = require('../controllers/review.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(authenticate);

router.get('/', reviewController.listPending);
router.get('/stats', reviewController.getStats);
router.get('/:id', reviewController.getById);
router.post('/:id/resolve', rbac(['team_lead', 'admin', 'super_admin']), reviewController.resolve);

module.exports = router;
