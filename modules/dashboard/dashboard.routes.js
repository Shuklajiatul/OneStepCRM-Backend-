/**
 * modules/dashboard/dashboard.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Dashboard reporting.
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');

router.use(authenticate, tenantContext);

router.get('/summary', dashboardController.getSummary);

module.exports = router;
