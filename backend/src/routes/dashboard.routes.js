const router = require('express').Router();
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/auth');

router.use(authenticate);

router.get('/', dashboardController.getDashboard);

module.exports = router;
