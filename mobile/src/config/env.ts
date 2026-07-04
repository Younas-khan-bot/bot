import { Platform } from 'react-native';

// 10.0.2.2 is the Android emulator's alias for your dev machine's localhost.
// A real device on the same network needs your machine's LAN IP instead.
// Before a Play Store release, point this at your deployed HTTPS backend.
const DEV_HOST = Platform.OS === 'android' ? '192.168.1.61' : 'localhost';

export const API_BASE_URL = __DEV__ ? `http://${DEV_HOST}:4000` : 'https://api.yourdomain.com';
export const SOCKET_URL = API_BASE_URL;
