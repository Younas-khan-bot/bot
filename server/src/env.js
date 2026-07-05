require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  // The account with this email is auto-promoted to ADMIN on login/register, so
  // the owner can approve hosts from the admin dashboard without any DB surgery.
  // Defaults to the app owner's email so it works even without setting the env.
  adminEmail: (process.env.ADMIN_EMAIL || 'younasmalik787898@gmail.com').toLowerCase(),
  // Chamet-style split: host earns 60% of coins spent, platform keeps 40%.
  hostPayoutPercent: parseInt(process.env.HOST_PAYOUT_PERCENT || '60', 10),
  googlePlayPackageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || '',
  googleServiceAccountJsonPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || '',
  skipIapVerification: (process.env.SKIP_IAP_VERIFICATION || 'false').toLowerCase() === 'true',
  stunUrl: process.env.STUN_URL || 'stun:stun.l.google.com:19302',
  turnUrl: process.env.TURN_URL || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
};
