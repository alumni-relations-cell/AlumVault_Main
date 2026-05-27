const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post('/', rbac(['super_admin']), exportController.exportCSV);

module.exports = router;
