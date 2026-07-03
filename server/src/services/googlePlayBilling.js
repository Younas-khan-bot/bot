const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');
const env = require('../env');

let googleAuth = null;

function getAuth() {
  if (googleAuth) return googleAuth;

  if (!fs.existsSync(env.googleServiceAccountJsonPath)) {
    throw new Error(
      `Google service account JSON not found at ${env.googleServiceAccountJsonPath}. ` +
        'Set GOOGLE_SERVICE_ACCOUNT_JSON_PATH or enable SKIP_IAP_VERIFICATION for local dev.'
    );
  }

  const keys = JSON.parse(fs.readFileSync(env.googleServiceAccountJsonPath, 'utf8'));
  googleAuth = new GoogleAuth({
    credentials: keys,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return googleAuth;
}

/**
 * Verifies a consumable in-app purchase server-side against the Google Play
 * Developer API. Returns { valid, orderId, purchaseState, consumptionState }.
 *
 * Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
 */
async function verifyAndroidPurchase({ productId, purchaseToken }) {
  if (env.skipIapVerification) {
    // Local-dev bypass only. Never enable this in production.
    return { valid: true, orderId: `dev-${Date.now()}`, purchaseState: 0, consumptionState: 0 };
  }

  const auth = getAuth();
  const client = await auth.getClient();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(env.googlePlayPackageName)}/purchases/products/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const response = await client.request({ url });
  const data = response.data;

  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
  const valid = data.purchaseState === 0;
  return {
    valid,
    orderId: data.orderId,
    purchaseState: data.purchaseState,
    consumptionState: data.consumptionState,
  };
}

/**
 * Marks a consumable purchase as consumed so the user can buy the same
 * product again. Call this only after coins have been credited.
 */
async function consumeAndroidPurchase({ productId, purchaseToken }) {
  if (env.skipIapVerification) return;

  const auth = getAuth();
  const client = await auth.getClient();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(env.googlePlayPackageName)}/purchases/products/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;

  await client.request({ url, method: 'POST' });
}

module.exports = { verifyAndroidPurchase, consumeAndroidPurchase };
