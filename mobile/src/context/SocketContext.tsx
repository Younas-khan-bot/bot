import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';
import { useAuth } from './AuthContext';
import { IncomingCall } from '../types';

interface SocketContextValue {
  socket: Socket | null;
  incomingCall: IncomingCall | null;
  clearIncomingCall: () => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  incomingCall: null,
  clearIncomingCall: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      return;
    }

    const s = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    s.on('call:incoming', (data: IncomingCall) => setIncomingCall(data));
    s.on('call:rejected', () => setIncomingCall(null));

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return (
    <SocketContext.Provider
      value={{ socket, incomingCall, clearIncomingCall: () => setIncomingCall(null) }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
