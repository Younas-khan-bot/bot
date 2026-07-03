const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { applyCoinDelta } = require('../services/coinLedger');

const router = express.Router();

// Hosts cash out coins they've earned. This only creates a PENDING request —
// actually paying out real money is a manual/admin process (or your own
// payout integration + KYC flow), which is out of scope for this MVP.
const requestSchema = z.object({ coinsAmount: z.number().int().min(100) });

router.post('/request', requireAuth, async (req, res, next) => {
  try {
    const { coinsAmount } = requestSchema.parse(req.body);

    const hostProfile = await prisma.hostProfile.findUnique({ where: { userId: req.user.id } });
    if (!hostProfile) {
      return res.status(403).json({ error: 'Only hosts can request withdrawals' });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet || wallet.coinBalance < coinsAmount) {
      return res.status(402).json({ error: 'Insufficient coin balance' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Hold the coins immediately so they can't be spent or withdrawn twice
      // while the request is pending.
      await applyCoinDelta({
        userId: req.user.id,
        amount: -coinsAmount,
        type: 'WITHDRAWAL',
        metadata: { status: 'PENDING' },
        tx,
      });

      return tx.withdrawalRequest.create({
        data: { hostId: hostProfile.id, coinsAmount, status: 'PENDING' },
      });
    });

    res.status(201).json({ withdrawalRequest: result });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  const hostProfile = await prisma.hostProfile.findUnique({ where: { userId: req.user.id } });
  if (!hostProfile) return res.json({ withdrawalRequests: [] });
  const withdrawalRequests = await prisma.withdrawalRequest.findMany({
    where: { hostId: hostProfile.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ withdrawalRequests });
});

// --- Admin endpoints ---

router.get('/admin/pending', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const withdrawalRequests = await prisma.withdrawalRequest.findMany({
    where: { status: 'PENDING' },
    include: { hostProfile: { include: { user: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ withdrawalRequests });
});

const decisionSchema = z.object({ note: z.string().max(500).optional() });

router.post('/admin/:id/approve', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { note } = decisionSchema.parse(req.body || {});
    const updated = await prisma.withdrawalRequest.update({
      where: { id: req.params.id },
      data: { status: 'PAID', processedAt: new Date(), note },
    });
    res.json({ withdrawalRequest: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/:id/reject', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { note } = decisionSchema.parse(req.body || {});

    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id: req.params.id },
      include: { hostProfile: true },
    });
    if (!withdrawal || withdrawal.status !== 'PENDING') {
      return res.status(400).json({ error: 'Withdrawal request is not pending' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Refund the held coins back to the host's wallet.
      await applyCoinDelta({
        userId: withdrawal.hostProfile.userId,
        amount: withdrawal.coinsAmount,
        type: 'ADJUSTMENT',
        metadata: { reason: 'withdrawal_rejected', withdrawalId: withdrawal.id },
        tx,
      });
      return tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: { status: 'REJECTED', processedAt: new Date(), note },
      });
    });

    res.json({ withdrawalRequest: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
