// Coin packages sold as Google Play "managed products" (consumable in-app
// purchases). The productId here MUST exactly match the product ID you
// create in Play Console > Monetize > Products > In-app products.
//
// Coin amounts are decided server-side from productId, never trusted from
// the client, so a tampered client can't credit itself free coins.
const COIN_PACKAGES = {
  coins_100: { coins: 100, label: '100 Coins' },
  coins_550: { coins: 550, label: '550 Coins (10% bonus)' },
  coins_1200: { coins: 1200, label: '1,200 Coins (20% bonus)' },
  coins_2600: { coins: 2600, label: '2,600 Coins (30% bonus)' },
  coins_7000: { coins: 7000, label: '7,000 Coins (40% bonus)' },
};

function getPackage(productId) {
  return COIN_PACKAGES[productId] || null;
}

module.exports = { COIN_PACKAGES, getPackage };
