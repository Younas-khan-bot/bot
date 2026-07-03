export type Role = 'USER' | 'HOST' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  role: Role;
  coinBalance: number;
}

export interface Host {
  hostId: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  ratePerMinute: number;
  isOnline: boolean;
}

export interface CoinPackage {
  productId: string;
  coins: number;
  label: string;
}

export interface IncomingCall {
  callId: string;
  ratePerMinute: number;
  caller: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}
