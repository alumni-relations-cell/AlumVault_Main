const router = require('express').Router();
const campaignController = require('../controllers/campaign.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { createCampaignSchema, updateCampaignSchema } = require('../validators/campaign.validator');

router.use(authenticate);
router.use(rbac(['admin', 'super_admin']));

router.post('/', rbac(['super_admin', 'admin']), campaignController.create);
router.get('/', rbac(['super_admin', 'admin', 'team_lead']), campaignController.list);
router.put('/:id', rbac(['super_admin', 'admin']), campaignController.update);
router.delete('/:id', rbac(['super_admin', 'admin']), campaignController.remove);

router.get('/:id', rbac(['super_admin', 'admin', 'team_lead']), campaignController.getCampaignReport);
router.post('/:id/send', rbac(['super_admin', 'admin']), campaignController.sendCampaign);

module.exports = router;
