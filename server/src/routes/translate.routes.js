const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { translate } = require('../services/translate');

const router = express.Router();

const schema = z.object({
  text: z.string().max(1000),
  from: z.string().max(10).optional(),
  to: z.string().min(2).max(10),
});

// On-demand translation (e.g. translate a host bio or a single message).
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { text, from, to } = schema.parse(req.body || {});
    const translated = await translate(text, from, to);
    res.json({ translated });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

module.exports = router;
