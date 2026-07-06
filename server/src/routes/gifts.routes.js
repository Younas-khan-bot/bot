const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { giftList } = require('../config/gifts');

const router = express.Router();

// The gift catalog shown in the in-call gift picker.
router.get('/', requireAuth, (req, res) => {
  res.json({ gifts: giftList() });
});

module.exports = router;
