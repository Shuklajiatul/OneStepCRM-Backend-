/**
 * modules/auth/auth.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for authentication endpoints.
 */

const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authRateLimiter } = require('../../middlewares/rateLimiter');

// Public routes (no auth required)
router.post('/register-tenant', authRateLimiter, authController.registerTenant);
router.post('/login',           authRateLimiter, authController.login);
router.post('/refresh',         authController.refresh);
router.post('/forgot-password', authRateLimiter, authController.forgotPassword);
router.post('/reset-password',  authRateLimiter, authController.resetPassword);

// Protected routes (auth required)
router.post('/logout', authenticate, authController.logout);

module.exports = router;
