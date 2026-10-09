'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { hasUsableAccessToken, useAuthStore } from '@/store/auth.store';
import { WS_URL } from '@/lib/constants';

export function useAdminSocket(namespace = '/chat', enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !hasUsableAccessToken(accessToken)) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const origin = WS_URL
      .replace(/^ws:/i, 'http:')
      .replace(/^wss:/i, 'https:')
      .replace(/\/+$/, '');
    const normalizedNamespace = `/${namespace.replace(/^\/+/, '')}`;
    const adminSocket = io(`${origin}${normalizedNamespace}`, {
      autoConnect: false,
      auth: { token: accessToken },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 3,
      timeout: 8000,
      withCredentials: true,
    });

    adminSocket.on('connect', () => {
      setConnectionError(null);
      setIsConnected(true);
    });
    adminSocket.on('disconnect', () => setIsConnected(false));
    adminSocket.on('connect_error', (error) => {
      setIsConnected(false);
      setConnectionError(error.message);
    });

    socketRef.current = adminSocket;
    setSocket(adminSocket);
    adminSocket.connect();

    return () => {
      adminSocket.removeAllListeners();
      adminSocket.disconnect();
      if (socketRef.current === adminSocket) socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [accessToken, enabled, isAuthenticated, namespace]);

  return { socket, isConnected, connectionError };
}
