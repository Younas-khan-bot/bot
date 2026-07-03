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
  hostPayoutPercent: parseInt(process.env.HOST_PAYOUT_PERCENT || '70', 10),
  googlePlayPackageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || '',
  googleServiceAccountJsonPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || '',
  skipIapVerification: (process.env.SKIP_IAP_VERIFICATION || 'false').toLowerCase() === 'true',
  stunUrl: process.env.STUN_URL || 'stun:stun.l.google.com:19302',
  turnUrl: process.env.TURN_URL || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
};
