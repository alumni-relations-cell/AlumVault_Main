const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { loginSchema, registerSchema, verify2FASchema, resetPasswordSchema, refreshSchema } = require('../validators/auth.validator');

// Public routes
router.post('/login', validate(loginSchema), authController.login);
router.post('/verify-2fa', validate(verify2FASchema), authController.verify2FA);
router.post('/refresh', validate(refreshSchema), authController.refresh);

// Protected routes
router.post('/register', validate(registerSchema), authenticate, rbac(['super_admin', 'admin']), authController.register);
router.post('/change-password', validate(resetPasswordSchema), authenticate, authController.changePassword);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getProfile);

module.exports = router;
