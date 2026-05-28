/**
 * modules/search/search.routes.js
 * ─────────────────────────────────────────────────────────
 * Express router for Global Search.
 */

const express = require('express');
const router = express.Router();
const searchController = require('./search.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { tenantContext } = require('../../middlewares/tenantContext');

router.use(authenticate, tenantContext);

router.get('/', searchController.search);

module.exports = router;
