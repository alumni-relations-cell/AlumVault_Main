const router = require('express').Router();
const reviewController = require('../controllers/review.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(authenticate);

router.get('/', reviewController.listPending);
router.get('/stats', reviewController.getStats);
// Re-match pending reviews against current alumni — run after a roster import
// so identity-disambiguated rows can be auto-resolved or flipped to multi-candidate.
router.post('/rematch', rbac(['admin', 'super_admin']), reviewController.rematchPending);
// Interactive rematch — two phases. The scan endpoint surfaces every
// branch/degree pair the canonicalizer can't reconcile so the operator can
// resolve them once; apply re-runs the match using those decisions as aliases.
router.post('/rematch/scan',       rbac(['admin', 'super_admin']), reviewController.rematchScan);
router.post('/rematch/apply',      rbac(['admin', 'super_admin']), reviewController.rematchApply);
// Incremental — called once per doubt by the modal so the progress bar can
// advance live and the user sees merges happen as they decide.
router.post('/rematch/decide-one', rbac(['admin', 'super_admin']), reviewController.rematchDecideOne);
// Apply a buffer of up to 3 decisions atomically (with persistence in
// branch_alias_decisions so future scans don't re-ask).
router.post('/rematch/decide-batch', rbac(['admin', 'super_admin']), reviewController.rematchDecideBatch);
// Undo within the buffer window — removes the stored decision so the doubt
// can re-appear if the modal advances back to it.
router.post('/rematch/forget',       rbac(['admin', 'super_admin']), reviewController.rematchForget);
// History tab in the modal — every persisted decision.
router.get('/rematch/resolved',      rbac(['admin', 'super_admin']), reviewController.rematchResolved);
// Auto-merge pending reviews where incoming row and existing alumnus share
// an email or phone — the strongest identity signal available. One call =
// one batch (default 500); the frontend loops until remaining = 0.
router.post('/bulk/resolve-by-contact', rbac(['admin', 'super_admin']), reviewController.bulkResolveByContact);
// Auto-separate pending reviews where incoming and existing both have a
// LinkedIn URL AND they differ — definitive "different people" signal.
router.post('/bulk/separate-by-linkedin', rbac(['admin', 'super_admin']), reviewController.bulkSeparateByLinkedin);
// Skip-resolve every pending review whose incoming branch is junk
// (year-only, job title, empty). Clears the unactionable noise so the
// remaining queue is real merge candidates.
router.post('/bulk/resolve-unmergeable',  rbac(['admin', 'super_admin']), reviewController.bulkResolveUnmergeable);
// Auto-separate where BOTH canonical branch AND canonical degree differ —
// strong "different people" signal even without LinkedIn.
router.post('/bulk/separate-by-branch-degree', rbac(['admin', 'super_admin']), reviewController.bulkSeparateByBranchDegree);
// Dev page diagnostics — full branch/batch/duplicate-cluster inventory so the
// operator can see what's causing manual work.
router.get('/diagnostics',              rbac(['admin', 'super_admin']), reviewController.diagnostics);
router.get('/:id', reviewController.getById);
router.post('/:id/resolve', rbac(['team_lead', 'admin', 'super_admin']), reviewController.resolve);

module.exports = router;
