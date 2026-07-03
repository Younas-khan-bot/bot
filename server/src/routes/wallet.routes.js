const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { applyCoinDelta } = require('../services/coinLedger');
const { verifyAndroidPurchase, consumeAndroidPurchase } = require('../services/googlePlayBilling');
const { getPackage, COIN_PACKAGES } = require('../config/coinPackages');

const router = express.Router();

router.get('/packages', (req, res) => {
  const packages = Object.entries(COIN_PACKAGES).map(([productId, info]) => ({
    productId,
    ...info,
  }));
  res.json({ packages });
});

router.get('/', requireAuth, async (req, res) => {
  const wallet = await prisma.wallet.upsert({
    where: { userId: req.user.id },
    update: {},
    create: { userId: req.user.id, coinBalance: 0 },
  });
  res.json({ coinBalance: wallet.coinBalance });
});

router.get('/transactions', requireAuth, async (req, res) => {
  const take = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const transactions = await prisma.coinTransaction.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json({ transactions });
});

const purchaseSchema = z.object({
  productId: z.string().min(1),
  purchaseToken: z.string().min(1),
});

// Called by the app right after a successful Google Play purchase.
// Server independently re-verifies the purchase with Google before crediting
// coins, and the purchaseToken is stored as a unique key so the same
// purchase can never be credited twice (replay protection).
router.post('/purchase/verify', requireAuth, async (req, res, next) => {
  try {
    const { productId, purchaseToken } = purchaseSchema.parse(req.body);

    const pkg = getPackage(productId);
    if (!pkg) {
      return res.status(400).json({ error: 'Unknown product id' });
    }

    const existingReceipt = await prisma.iapReceipt.findUnique({ where: { purchaseToken } });
    if (existingReceipt) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
      return res.status(200).json({
        alreadyCredited: true,
        coinBalance: wallet?.coinBalance ?? 0,
      });
    }

    const verification = await verifyAndroidPurchase({ productId, purchaseToken });
    if (!verification.valid) {
      return res.status(402).json({ error: 'Purchase could not be verified' });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.iapReceipt.create({
        data: {
          userId: req.user.id,
          productId,
          purchaseToken,
          orderId: verification.orderId,
          coinsCredited: pkg.coins,
        },
      });

      return applyCoinDelta({
        userId: req.user.id,
        amount: pkg.coins,
        type: 'PURCHASE',
        metadata: { productId, orderId: verification.orderId },
        tx,
      });
    });

    await consumeAndroidPurchase({ productId, purchaseToken }).catch((err) => {
      console.error('Failed to acknowledge/consume Play purchase', err);
    });

    res.json({ alreadyCredited: false, coinBalance: result.wallet.coinBalance });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    // Unique constraint race: two requests for the same token at once.
    if (err.code === 'P2002') {
      const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
      return res.status(200).json({ alreadyCredited: true, coinBalance: wallet?.coinBalance ?? 0 });
    }
    next(err);
  }
});

module.exports = router;
