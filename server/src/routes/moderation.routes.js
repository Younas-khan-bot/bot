const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// --- Report a user ---
// Google Play requires apps with user-generated content / live interaction to
// offer an in-app way to report abusive users. Reports land in a queue an
// admin reviews. A report never trusts the reported user's coin/role state.
const reportSchema = z.object({
  reportedUserId: z.string().min(1),
  reason: z.enum([
    'NUDITY_OR_SEXUAL',
    'HARASSMENT',
    'SCAM_OR_FRAUD',
    'UNDERAGE',
    'VIOLENCE',
    'OTHER',
  ]),
  callId: z.string().optional(),
  details: z.string().max(1000).optional(),
});

router.post('/report', requireAuth, async (req, res, next) => {
  try {
    const { reportedUserId, reason, callId, details } = reportSchema.parse(req.body || {});

    if (reportedUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot report yourself.' });
    }

    const reported = await prisma.user.findUnique({ where: { id: reportedUserId } });
    if (!reported) {
      return res.status(404).json({ error: 'That user does not exist.' });
    }

    const report = await prisma.userReport.create({
      data: {
        reporterUserId: req.user.id,
        reportedUserId,
        reason,
        callId: callId || null,
        details: details || null,
      },
    });

    res.status(201).json({ report: { id: report.id, status: report.status } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

// --- Block a user ---
const blockSchema = z.object({ blockedUserId: z.string().min(1) });

router.post('/block', requireAuth, async (req, res, next) => {
  try {
    const { blockedUserId } = blockSchema.parse(req.body || {});

    if (blockedUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot block yourself.' });
    }

    const target = await prisma.user.findUnique({ where: { id: blockedUserId } });
    if (!target) {
      return res.status(404).json({ error: 'That user does not exist.' });
    }

    await prisma.userBlock.upsert({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId: req.user.id,
          blockedUserId,
        },
      },
      update: {},
      create: { blockerUserId: req.user.id, blockedUserId },
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

// --- Unblock a user ---
router.delete('/block/:userId', requireAuth, async (req, res, next) => {
  try {
    await prisma.userBlock.deleteMany({
      where: { blockerUserId: req.user.id, blockedUserId: req.params.userId },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- List users I've blocked ---
router.get('/blocks', requireAuth, async (req, res, next) => {
  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerUserId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    const blockedIds = blocks.map((b) => b.blockedUserId);
    const users = blockedIds.length
      ? await prisma.user.findMany({
          where: { id: { in: blockedIds } },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({
      blocks: blocks.map((b) => ({
        userId: b.blockedUserId,
        displayName: byId.get(b.blockedUserId)?.displayName ?? 'Unknown',
        avatarUrl: byId.get(b.blockedUserId)?.avatarUrl ?? null,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// --- Admin: review report queue ---
router.get('/admin/reports', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const status = req.query.status || 'OPEN';
    const reports = await prisma.userReport.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

const resolveSchema = z.object({
  status: z.enum(['REVIEWED', 'ACTIONED', 'DISMISSED']),
});

router.post('/admin/reports/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { status } = resolveSchema.parse(req.body || {});
    const report = await prisma.userReport.update({
      where: { id: req.params.id },
      data: { status, reviewedAt: new Date() },
    });
    res.json({ report });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

module.exports = router;

// Shared helper: the set of user IDs that `userId` should not see and should
// not be seen by (blocks in either direction). Used to filter host discovery.
async function blockedUserIdsFor(userId) {
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerUserId: userId }, { blockedUserId: userId }],
    },
    select: { blockerUserId: true, blockedUserId: true },
  });
  const ids = new Set();
  for (const r of rows) {
    ids.add(r.blockerUserId === userId ? r.blockedUserId : r.blockerUserId);
  }
  return ids;
}

module.exports.blockedUserIdsFor = blockedUserIdsFor;
