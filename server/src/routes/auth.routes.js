const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { prisma } = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const env = require('../env');

const router = express.Router();

// Promote the configured owner account to ADMIN the first time it logs in, so
// the owner can reach the admin dashboard without manual DB edits.
async function ensureAdmin(user) {
  if (env.adminEmail && user.email.toLowerCase() === env.adminEmail && user.role !== 'ADMIN') {
    return prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  }
  return user;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  displayName: z.string().min(2).max(40),
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, displayName } = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        wallet: { create: { coinBalance: 0 } },
      },
    });

    user = await ensureAdmin(user);

    const token = signToken(user);
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    user = await ensureAdmin(user);

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
  res.json({
    id: req.user.id,
    email: req.user.email,
    displayName: req.user.displayName,
    role: req.user.role,
    avatarUrl: req.user.avatarUrl,
    coinBalance: wallet?.coinBalance ?? 0,
  });
});

module.exports = router;
