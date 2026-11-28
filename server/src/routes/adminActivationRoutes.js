const express = require('express');
const router = express.Router();
const activationController = require('../controllers/activationController');
const packageController = require('../controllers/packageController');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/authMiddleware');

const staff = [requireAuth, requireAdmin];
const superAdmin = [requireAuth, requireSuperAdmin];

// List all activations
router.get('/list', ...staff, activationController.listActivations);

// Fetch activation details for a specific student
router.get('/student/:studentId', ...staff, activationController.getStudentActivation);

// Verify student payment
router.post('/verify-payment', ...staff, activationController.verifyPayment);

// Authorize courses for student
router.post('/authorize-courses', ...staff, activationController.authorizeCourses);

// Generate 4-digit activation PIN for specific package
router.post('/generate-package-pin', ...staff, activationController.generatePackagePin);

// Regenerate 4-digit activation PIN
router.post('/regenerate-package-pin', ...staff, activationController.regeneratePackagePin);

// Legacy/wrapper PIN generation
router.post('/generate-pin', ...staff, activationController.generatePin);

// Package management
router.get('/packages', ...staff, packageController.listPackages);
router.get('/packages/:id', ...staff, packageController.getPackage);
router.put('/packages/:id/courses', ...superAdmin, packageController.updatePackageCourses);

// Reset device activation (clears hardware binding)
router.post('/reset', ...staff, activationController.resetActivation);

// Revoke activation immediately
router.post('/revoke', ...staff, activationController.revokeActivation);

// Re-authorize revoked or expired activation
router.post('/reauthorize', ...staff, activationController.reauthorizeActivation);

module.exports = router;
