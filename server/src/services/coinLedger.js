const { prisma } = require('../db');

/**
 * Applies a coin delta to a user's wallet and records a transaction row,
 * inside a single DB transaction so balance and ledger never drift apart.
 * Throws if a debit would take the balance negative.
 */
async function applyCoinDelta({ userId, amount, type, callId, metadata, tx }) {
  const client = tx || prisma;

  const wallet = await client.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, coinBalance: 0 },
  });

  const newBalance = wallet.coinBalance + amount;
  if (newBalance < 0) {
    const err = new Error('Insufficient coin balance');
    err.status = 402;
    err.publicMessage = 'Insufficient coin balance';
    throw err;
  }

  const updatedWallet = await client.wallet.update({
    where: { userId },
    data: { coinBalance: newBalance },
  });

  const transaction = await client.coinTransaction.create({
    data: {
      userId,
      type,
      amount,
      balanceAfter: newBalance,
      callId: callId || null,
      metadata: metadata || undefined,
    },
  });

  return { wallet: updatedWallet, transaction };
}

async function runInTransaction(fn) {
  return prisma.$transaction((tx) => fn(tx));
}

module.exports = { applyCoinDelta, runInTransaction };
