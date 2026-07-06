// Virtual gifts users send during calls. Cost is in coins and is ALWAYS decided
// server-side from this catalog, never trusted from the client. Hosts earn the
// platform's host-payout share of every gift (same 60% split as call minutes).
const GIFTS = {
  rose: { name: 'Rose', emoji: '🌹', coins: 10 },
  heart: { name: 'Heart', emoji: '💖', coins: 50 },
  teddy: { name: 'Teddy', emoji: '🧸', coins: 100 },
  kiss: { name: 'Kiss', emoji: '💋', coins: 200 },
  crown: { name: 'Crown', emoji: '👑', coins: 500 },
  car: { name: 'Sports Car', emoji: '🏎️', coins: 1000 },
  rocket: { name: 'Rocket', emoji: '🚀', coins: 2000 },
  castle: { name: 'Castle', emoji: '🏰', coins: 5000 },
};

function getGift(id) {
  return GIFTS[id] || null;
}

// Ordered list for the client picker.
function giftList() {
  return Object.entries(GIFTS).map(([id, g]) => ({ id, ...g }));
}

module.exports = { GIFTS, getGift, giftList };
