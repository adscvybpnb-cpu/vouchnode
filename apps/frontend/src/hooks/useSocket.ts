'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { hasUsableAccessToken, useAuthStore } from '../store/auth.store';
import { WS_URL } from '../lib/constants';

export function useSocket(namespace = '', enabled = true) {
  const { accessToken, isAuthenticated } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const cleanupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const disconnectOnAuthClear = () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
    window.addEventListener('auth:cleared', disconnectOnAuthClear);
    return () => window.removeEventListener('auth:cleared', disconnectOnAuthClear);
  }, []);

  useEffect(() => {
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    if (!enabled || !hasSession) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setSocket(null);
      return;
    }

    const socketOrigin = WS_URL
      .replace(/^ws:/i, 'http:')
      .replace(/^wss:/i, 'https:')
      .replace(/\/+(chat|notifications|socket\.io)\/?$/i, '')
      .replace(/\/+$/, '');
    const socketNamespace = namespace ? `/${namespace.replace(/^\/+/, '')}` : '/chat';
    const socket = io(`${socketOrigin}${socketNamespace}`, {
      autoConnect: false,
      auth: { token: accessToken, Authorization: `Bearer ${accessToken}` },
      query: { token: accessToken || '' },
      extraHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 3,
      timeout: 5000,
    });

    socket.on('connect', () => {
      setConnectionError(null);
      setIsConnected(true);
    });
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (error) => {
      setIsConnected(false);
      setConnectionError(error.message);
    });

    socketRef.current = socket;
    setSocket(socket);
    socket.connect();

    return () => {
      // React Strict Mode mounts effects twice in development. Deferring
      // teardown prevents the first probe from aborting a socket mid-handshake.
      cleanupTimerRef.current = window.setTimeout(() => {
        if (socketRef.current !== socket) return;
        socket.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }, 0);
    };
  }, [accessToken, enabled, hasSession, namespace]);

  return {
    socket,
    isConnected,
    connectionError,
  };
}
