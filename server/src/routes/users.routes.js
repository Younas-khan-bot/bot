const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const avatarSchema = z.object({
  base64: z.string().min(10),
  mime: z.string().default('image/jpeg'),
});

// Upload / replace the caller's profile photo. The image is stored in the DB
// and User.avatarUrl is set to the public serve URL (with a cache-busting
// version so the new photo shows immediately).
router.post('/me/avatar', requireAuth, async (req, res, next) => {
  try {
    const { base64, mime } = avatarSchema.parse(req.body || {});
    const data = Buffer.from(base64, 'base64');
    if (data.length > 6 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max ~6MB).' });
    }

    await prisma.avatar.upsert({
      where: { userId: req.user.id },
      update: { mime, data },
      create: { userId: req.user.id, mime, data },
    });

    const url = `https://${req.get('host')}/users/${req.user.id}/avatar?v=${Date.now()}`;
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: url } });

    res.json({ avatarUrl: url });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

// Public: serve a user's avatar image bytes so it loads in the host grid
// without auth headers (React Native <Image> can't send them).
router.get('/:id/avatar', async (req, res, next) => {
  try {
    const avatar = await prisma.avatar.findUnique({ where: { userId: req.params.id } });
    if (!avatar) return res.status(404).end();
    res.setHeader('Content-Type', avatar.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(avatar.data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
