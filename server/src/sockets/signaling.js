const { verifyToken } = require('../utils/jwt');
const { prisma } = require('../db');
const { applyCoinDelta } = require('../services/coinLedger');
const { blockedUserIdsFor } = require('../routes/moderation.routes');
const { getGift } = require('../config/gifts');
const { getIceServers } = require('./iceServers');
const env = require('../env');

const BILLING_INTERVAL_MS = 60 * 1000; // charge once per minute of call time

// userId -> socketId, for routing events to a specific user regardless of
// which screen/room they're currently in.
const onlineUsers = new Map();
// callId -> { callerId, hostId, ratePerMinute, timer }
const activeCalls = new Map();

function userRoom(userId) {
  return `user:${userId}`;
}

function callRoom(callId) {
  return `call:${callId}`;
}

async function chargeOneMinute(io, callId) {
  const active = activeCalls.get(callId);
  if (!active) return;

  const hostShare = Math.floor((active.ratePerMinute * env.hostPayoutPercent) / 100);

  try {
    const callerResult = await applyCoinDelta({
      userId: active.callerId,
      amount: -active.ratePerMinute,
      type: 'CALL_SPEND',
      callId,
    });

    await applyCoinDelta({
      userId: active.hostId,
      amount: hostShare,
      type: 'CALL_EARN',
      callId,
    });

    await prisma.hostProfile.update({
      where: { userId: active.hostId },
      data: { totalEarnedCoins: { increment: hostShare } },
    });

    await prisma.call.update({
      where: { id: callId },
      data: {
        durationSeconds: { increment: 60 },
        coinsSpent: { increment: active.ratePerMinute },
      },
    });

    io.to(callRoom(callId)).emit('call:billing-tick', {
      callId,
      callerCoinBalance: callerResult.wallet.coinBalance,
      chargedThisTick: active.ratePerMinute,
    });
  } catch (err) {
    // Insufficient balance (or other billing failure): end the call.
    await endCall(io, callId, 'INSUFFICIENT_BALANCE');
  }
}

async function startBilling(io, callId) {
  const active = activeCalls.get(callId);
  if (!active) return;
  active.timer = setInterval(() => chargeOneMinute(io, callId), BILLING_INTERVAL_MS);
}

async function endCall(io, callId, reason) {
  const active = activeCalls.get(callId);
  if (!active) return;

  if (active.timer) clearInterval(active.timer);
  activeCalls.delete(callId);

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.status === 'ENDED') return;

  const startedAt = call.startedAt || new Date();
  const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));

  await prisma.call.update({
    where: { id: callId },
    data: {
      status: 'ENDED',
      endedAt: new Date(),
      endReason: reason,
      // durationSeconds already tracked in whole-minute billing increments;
      // this just makes sure it reflects at least the elapsed wall time.
      durationSeconds: Math.max(call.durationSeconds, durationSeconds),
    },
  });

  io.to(callRoom(callId)).emit('call:ended', { callId, reason });
}

function registerSignaling(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Missing auth token'));
      const payload = verifyToken(token);
      socket.userId = payload.sub;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    onlineUsers.set(socket.userId, socket.id);
    socket.join(userRoom(socket.userId));

    socket.on('call:request', async ({ hostId }, ack) => {
      try {
        const hostProfile = await prisma.hostProfile.findUnique({
          where: { userId: hostId },
          include: { user: true },
        });
        if (!hostProfile || !hostProfile.isApproved || !hostProfile.isOnline) {
          return ack?.({ error: 'Host is not available right now' });
        }
        if (!onlineUsers.has(hostId)) {
          return ack?.({ error: 'Host is not connected' });
        }

        // Don't allow a call between users who have blocked each other.
        const blocked = await blockedUserIdsFor(socket.userId);
        if (blocked.has(hostId)) {
          return ack?.({ error: 'This host is unavailable' });
        }

        const wallet = await prisma.wallet.findUnique({ where: { userId: socket.userId } });
        if (!wallet || wallet.coinBalance < hostProfile.ratePerMinute) {
          return ack?.({ error: 'Not enough coins for at least one minute of this call' });
        }

        const caller = await prisma.user.findUnique({ where: { id: socket.userId } });

        const call = await prisma.call.create({
          data: {
            callerId: socket.userId,
            hostId,
            ratePerMinute: hostProfile.ratePerMinute,
            status: 'REQUESTED',
          },
        });

        io.to(userRoom(hostId)).emit('call:incoming', {
          callId: call.id,
          ratePerMinute: hostProfile.ratePerMinute,
          caller: {
            id: caller.id,
            displayName: caller.displayName,
            avatarUrl: caller.avatarUrl,
          },
        });

        ack?.({ callId: call.id });
      } catch (err) {
        console.error(err);
        ack?.({ error: 'Failed to request call' });
      }
    });

    socket.on('call:accept', async ({ callId }, ack) => {
      try {
        const call = await prisma.call.findUnique({ where: { id: callId } });
        if (!call || call.hostId !== socket.userId || call.status !== 'REQUESTED') {
          return ack?.({ error: 'Call is no longer available' });
        }

        const callerSocketId = onlineUsers.get(call.callerId);
        if (!callerSocketId) {
          await prisma.call.update({ where: { id: callId }, data: { status: 'MISSED' } });
          return ack?.({ error: 'Caller disconnected' });
        }

        await prisma.call.update({
          where: { id: callId },
          data: { status: 'ONGOING', startedAt: new Date() },
        });

        socket.join(callRoom(callId));
        io.sockets.sockets.get(callerSocketId)?.join(callRoom(callId));

        activeCalls.set(callId, {
          callerId: call.callerId,
          hostId: call.hostId,
          ratePerMinute: call.ratePerMinute,
        });

        const iceServers = getIceServers();
        // Charge the first minute immediately (prepaid-per-minute model).
        await chargeOneMinute(io, callId);
        await startBilling(io, callId);

        io.to(callRoom(callId)).emit('call:accepted', { callId, iceServers });
        ack?.({ ok: true, iceServers });
      } catch (err) {
        console.error(err);
        ack?.({ error: 'Failed to accept call' });
      }
    });

    socket.on('call:reject', async ({ callId }, ack) => {
      try {
        const call = await prisma.call.findUnique({ where: { id: callId } });
        if (!call || call.hostId !== socket.userId || call.status !== 'REQUESTED') {
          return ack?.({ error: 'Call is no longer available' });
        }
        await prisma.call.update({ where: { id: callId }, data: { status: 'REJECTED' } });
        io.to(userRoom(call.callerId)).emit('call:rejected', { callId });
        ack?.({ ok: true });
      } catch (err) {
        console.error(err);
        ack?.({ error: 'Failed to reject call' });
      }
    });

    socket.on('call:end', async ({ callId }) => {
      await endCall(io, callId, 'ENDED_BY_USER');
    });

    // Send a virtual gift during a call. Coins move from sender to the other
    // participant (host earns the platform's host-payout share), and both
    // clients get a 'gift:received' event to animate it.
    socket.on('gift:send', async ({ callId, giftId }, ack) => {
      try {
        const active = activeCalls.get(callId);
        if (!active) return ack?.({ error: 'Call is not active' });

        const gift = getGift(giftId);
        if (!gift) return ack?.({ error: 'Unknown gift' });

        const senderId = socket.userId;
        const recipientId = active.callerId === senderId ? active.hostId : active.callerId;
        const hostShare = Math.floor((gift.coins * env.hostPayoutPercent) / 100);

        const senderResult = await applyCoinDelta({
          userId: senderId,
          amount: -gift.coins,
          type: 'CALL_SPEND',
          callId,
          metadata: { gift: giftId },
        });

        await applyCoinDelta({
          userId: recipientId,
          amount: hostShare,
          type: 'CALL_EARN',
          callId,
          metadata: { gift: giftId },
        });

        await prisma.hostProfile
          .update({
            where: { userId: recipientId },
            data: { totalEarnedCoins: { increment: hostShare } },
          })
          .catch(() => {}); // recipient may not be a host; ignore

        io.to(callRoom(callId)).emit('gift:received', {
          callId,
          giftId,
          emoji: gift.emoji,
          name: gift.name,
          fromUserId: senderId,
        });

        ack?.({ ok: true, coinBalance: senderResult.wallet.coinBalance });
      } catch (err) {
        ack?.({ error: err.publicMessage || 'Could not send gift' });
      }
    });

    // In-call text chat. Relayed to the other participant, who live-translates
    // it to their own language on their device.
    socket.on('chat:send', ({ callId, text }) => {
      const clean = String(text || '').slice(0, 1000);
      if (!clean.trim()) return;
      socket.to(callRoom(callId)).emit('chat:message', {
        callId,
        fromUserId: socket.userId,
        text: clean,
        at: Date.now(),
      });
    });

    // Relay raw WebRTC signaling payloads between the two call participants.
    socket.on('webrtc:offer', ({ callId, sdp }) => {
      socket.to(callRoom(callId)).emit('webrtc:offer', { callId, sdp });
    });
    socket.on('webrtc:answer', ({ callId, sdp }) => {
      socket.to(callRoom(callId)).emit('webrtc:answer', { callId, sdp });
    });
    socket.on('webrtc:ice-candidate', ({ callId, candidate }) => {
      socket.to(callRoom(callId)).emit('webrtc:ice-candidate', { callId, candidate });
    });

    socket.on('disconnect', async () => {
      if (onlineUsers.get(socket.userId) === socket.id) {
        onlineUsers.delete(socket.userId);
      }
      for (const [callId, active] of activeCalls.entries()) {
        if (active.callerId === socket.userId || active.hostId === socket.userId) {
          await endCall(io, callId, 'PEER_DISCONNECTED');
        }
      }
    });
  });
}

module.exports = { registerSignaling };
