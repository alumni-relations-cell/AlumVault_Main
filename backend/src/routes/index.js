const router = require('express').Router();
const rateLimiter = require('../middleware/rateLimiter');
const auditLogger = require('../middleware/auditLogger');

// Apply rate limiter globally
router.use(rateLimiter);

// Apply audit logging globally (only for authenticated routes)
router.use(auditLogger);

const authRoutes = require('./auth.routes');
const alumniRoutes = require('./alumni.routes');
const importRoutes = require('./import.routes');
const reviewRoutes = require('./review.routes');
const campaignRoutes = require('./campaign.routes');
const userRoutes = require('./user.routes');
const auditRoutes = require('./audit.routes');
const dashboardRoutes = require('./dashboard.routes');
const enrichmentRoutes = require('./enrichment.routes');
const exportRoutes = require('./export.routes');
const adminRoutes = require('./admin.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/alumni', alumniRoutes);
router.use('/import', importRoutes);
router.use('/review', reviewRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/users', userRoutes);
router.use('/audit', auditRoutes);
router.use('/dashboard', dashboardRoutes);

router.use('/enrichment', enrichmentRoutes);
router.use('/export', exportRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
