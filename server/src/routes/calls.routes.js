const express = require('express');
const { prisma } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/history', requireAuth, async (req, res) => {
  const take = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const calls = await prisma.call.findMany({
    where: { OR: [{ callerId: req.user.id }, { hostId: req.user.id }] },
    include: {
      caller: { select: { id: true, displayName: true, avatarUrl: true } },
      host: { select: { id: true, displayName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json({ calls });
});

module.exports = router;
