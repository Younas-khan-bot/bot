import { Platform } from 'react-native';

// 10.0.2.2 is the Android emulator's alias for your dev machine's localhost.
// A real device on the same network needs your machine's LAN IP instead.
// Before a Play Store release, point this at your deployed HTTPS backend.
const DEV_HOST = Platform.OS === 'android' ? '192.168.1.61' : 'localhost';

export const API_BASE_URL = __DEV__ ? `http://${DEV_HOST}:4000` : 'https://bot-production-7417.up.railway.app';
export const SOCKET_URL = API_BASE_URL;

// Public legal pages served by the backend (server/public). Google Play needs
// a reachable Privacy Policy URL for the store listing AND inside the app.
// Served from Railway so it works whether the repo is public or private.
export const PRIVACY_POLICY_URL = 'https://bot-production-7417.up.railway.app/privacy.html';
export const TERMS_URL = 'https://bot-production-7417.up.railway.app/terms.html';
