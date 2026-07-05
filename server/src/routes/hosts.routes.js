const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { blockedUserIdsFor } = require('./moderation.routes');

const router = express.Router();

function serializeHost(hostProfile) {
  return {
    hostId: hostProfile.userId,
    displayName: hostProfile.user.displayName,
    avatarUrl: hostProfile.user.avatarUrl,
    bio: hostProfile.bio,
    country: hostProfile.country,
    age: hostProfile.age,
    gender: hostProfile.gender,
    language: hostProfile.language,
    ratePerMinute: hostProfile.ratePerMinute,
    isOnline: hostProfile.isOnline,
  };
}

// Public-ish list of approved, online hosts available for a call.
router.get('/', requireAuth, async (req, res) => {
  const onlineOnly = req.query.online === 'true'; // default: show all approved hosts
  const language = req.query.language; // optional filter chip: Arabic, Spanish, ...
  const sort = req.query.sort; // 'new' | 'popular' (default)
  // Hide hosts the caller has blocked (or who blocked the caller), in either
  // direction, so blocked users never surface to each other.
  const blocked = await blockedUserIdsFor(req.user.id);
  const hosts = await prisma.hostProfile.findMany({
    where: {
      isApproved: true,
      ...(onlineOnly ? { isOnline: true } : {}),
      ...(language && language !== 'All' ? { language } : {}),
      ...(blocked.size ? { userId: { notIn: [...blocked] } } : {}),
    },
    include: { user: true },
    orderBy:
      sort === 'new'
        ? { createdAt: 'desc' }
        : [{ isOnline: 'desc' }, { totalEarnedCoins: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
  });
  res.json({ hosts: hosts.map(serializeHost) });
});

// Apply to become a host. isApproved starts false and requires an admin
// (or automated moderation check you build later) to flip it on, since a
// paid-video-call marketplace is exactly the kind of feature Play Store
// reviewers and payment processors scrutinize for abuse.
const becomeHostSchema = z.object({
  bio: z.string().max(500).optional(),
  country: z.string().max(60).optional(),
  age: z.number().int().min(18).max(99).optional(),
  gender: z.string().max(20).optional(),
  language: z.string().max(30).optional(),
  ratePerMinute: z.number().int().min(1).max(10000).optional(),
});

router.post('/apply', requireAuth, async (req, res, next) => {
  try {
    const { bio, country, age, gender, language, ratePerMinute } = becomeHostSchema.parse(
      req.body || {},
    );

    const fields = {
      bio,
      country,
      age,
      gender,
      language,
      ...(ratePerMinute ? { ratePerMinute } : {}),
    };

    const hostProfile = await prisma.hostProfile.upsert({
      where: { userId: req.user.id },
      update: fields,
      create: {
        userId: req.user.id,
        ratePerMinute: ratePerMinute || 10,
        ...fields,
      },
    });

    res.json({ hostProfile });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

const onlineStatusSchema = z.object({ isOnline: z.boolean() });

router.post('/status', requireAuth, async (req, res, next) => {
  try {
    const { isOnline } = onlineStatusSchema.parse(req.body);
    const hostProfile = await prisma.hostProfile.findUnique({ where: { userId: req.user.id } });
    if (!hostProfile) {
      return res.status(404).json({ error: 'You are not a host yet. Call /hosts/apply first.' });
    }
    if (!hostProfile.isApproved) {
      return res.status(403).json({ error: 'Your host application is still pending approval.' });
    }
    const updated = await prisma.hostProfile.update({
      where: { userId: req.user.id },
      data: { isOnline },
    });
    res.json({ hostProfile: updated });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const hostProfile = await prisma.hostProfile.findUnique({ where: { userId: req.user.id } });
  res.json({ hostProfile });
});

// --- Admin endpoints ---

router.get('/admin/pending', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const hostProfiles = await prisma.hostProfile.findMany({
    where: { isApproved: false },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ hostProfiles });
});

router.post('/admin/:userId/approve', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const hostProfile = await prisma.hostProfile.update({
      where: { userId: req.params.userId },
      data: { isApproved: true },
    });
    res.json({ hostProfile });
  } catch (err) {
    next(err);
  }
});

// Reject a host application: remove the profile and take them offline. They
// can re-apply later if they want.
router.post('/admin/:userId/reject', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.hostProfile.deleteMany({ where: { userId: req.params.userId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
