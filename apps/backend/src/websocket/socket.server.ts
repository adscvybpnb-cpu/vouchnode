import { randomUUID } from 'node:crypto';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { setupChatHandlers } from './chat.handler';
import { setupNotificationHandlers } from './notification.handler';

const MARKETPLACE_ORDER_CHANNEL = 'marketplace:order-events';
const socketInstanceId = randomUUID();
let socketServer: Server | null = null;
const presenceConnections = new Map<string, number>();
const presenceExpiryTimers = new Map<string, NodeJS.Timeout>();

const normalizeToken = (value: unknown) => {
  if (Array.isArray(value)) return normalizeToken(value[0]);
  if (typeof value !== 'string') return null;
  let token: string;
  try {
    token = decodeURIComponent(value).trim();
  } catch {
    return null;
  }
  if (!token) return null;
  return token.replace(/^Bearer\s+/i, '');
};

const getHandshakeToken = (socket: Socket) => {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const query = socket.handshake.query as Record<string, unknown> | undefined;
  return normalizeToken(auth?.token)
    || normalizeToken(query?.token);
};

export async function setupSocketServer(server: any) {
  if (socketServer) return socketServer;
  const io = new Server(server, {
    cors: {
      origin: config.app.env === 'production'
        ? [config.app.frontendUrl]
        : [config.app.frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: true,
    },
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    pingInterval: 10_000,
    pingTimeout: 20_000,
  });

  const authenticateSocket = async (socket: Socket, next: (error?: Error) => void) => {
    const token = getHandshakeToken(socket);
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret) as { id?: string };
      if (!decoded.id) return next(new Error('Authentication payload is invalid'));
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { status: true },
      });
      if (!user || (user.status !== 'ACTIVE' && user.status !== 'PENDING_VERIFICATION')) {
        return next(new Error('ACCOUNT_LOCKED'));
      }
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  };

  io.use(authenticateSocket);
  const chat = io.of('/chat');
  chat.use(authenticateSocket);
  setupChatHandlers(chat);
  const notifications = io.of('/notifications');
  notifications.use(authenticateSocket);
  setupNotificationHandlers(notifications);
  const presence = io.of('/presence');
  presence.use(authenticateSocket);
  presence.on('connection', (socket) => {
    const userId = socket.data.user?.id as string | undefined;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    void socket.join(`user:${userId}`);
    const connections = (presenceConnections.get(userId) ?? 0) + 1;
    presenceConnections.set(userId, connections);
    void updatePresence(presence, userId, true);

    socket.on('disconnect', () => {
      const remainingConnections = Math.max((presenceConnections.get(userId) ?? 1) - 1, 0);
      if (remainingConnections === 0) presenceConnections.delete(userId);
      else presenceConnections.set(userId, remainingConnections);
      if (remainingConnections === 0) void updatePresence(presence, userId, false);
    });
  });

  const marketplaceEventSubscriber = redis.duplicate();
  marketplaceEventSubscriber.on('message', (channel, message) => {
    if (channel !== MARKETPLACE_ORDER_CHANNEL) return;
    try {
      const orderEvent = JSON.parse(message) as {
        source?: unknown;
        orderId?: unknown;
        name?: unknown;
        payload?: unknown;
      };
      if (orderEvent.source === socketInstanceId) return;
      if (typeof orderEvent.orderId !== 'string' || typeof orderEvent.name !== 'string') {
        throw new Error('Invalid marketplace order event');
      }
      io.of('/chat').to(`order-${orderEvent.orderId}`).emit(orderEvent.name, orderEvent.payload);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Unable to relay marketplace order event');
    }
  });
  await marketplaceEventSubscriber.subscribe(MARKETPLACE_ORDER_CHANNEL);

  socketServer = io;
  return io;
}

async function updatePresence(namespace: ReturnType<Server['of']>, userId: string, isOnline: boolean) {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { onlineUntil: true },
    });
    const forcedOnline = Boolean(existingUser?.onlineUntil && existingUser.onlineUntil.getTime() > Date.now());
    if (!isOnline && forcedOnline) return;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isOnline, lastActiveAt: new Date(), ...(isOnline ? {} : { onlineUntil: null }) },
      select: { id: true, isOnline: true, onlineUntil: true },
    });
    namespace.emit('presence:update', {
      userId: user.id,
      isOnline: user.isOnline,
      onlineUntil: user.onlineUntil,
    });
  } catch (error) {
    console.error('Presence update failed:', error);
  }
}

export function schedulePresenceExpiry(userId: string, onlineUntil: Date | null) {
  const existingTimer = presenceExpiryTimers.get(userId);
  if (existingTimer) clearTimeout(existingTimer);
  presenceExpiryTimers.delete(userId);
  if (!onlineUntil) return;

  const delay = Math.max(onlineUntil.getTime() - Date.now(), 0);
  const timer = setTimeout(() => {
    presenceExpiryTimers.delete(userId);
    void prisma.user.update({
      where: { id: userId },
      data: { isOnline: false, onlineUntil: null, lastActiveAt: new Date() },
    }).then(() => {
      socketServer?.of('/presence').emit('presence:update', {
        userId,
        isOnline: false,
        onlineUntil: null,
      });
    }).catch((error) => console.error('Presence expiry update failed:', error));
  }, delay);
  timer.unref();
  presenceExpiryTimers.set(userId, timer);
}

export function getSocketServer() {
  return socketServer;
}

export function emitAccountStatusRevoked(userId: string, reason: 'BANNED' | 'SUSPENDED') {
  socketServer?.of('/presence').to(`user:${userId}`).emit('ACCOUNT_STATUS_REVOKED', {
    reason,
    message: 'Your account has been restricted by administration.',
  });
}

export function emitPresenceUpdate(userId: string, isOnline: boolean, onlineUntil: Date | null = null) {
  socketServer?.of('/presence').emit('presence:update', { userId, isOnline, onlineUntil });
}

export function emitP2POrderEvent(orderId: string, event: string, payload: unknown) {
  socketServer?.of('/chat').to(`p2p-order:${orderId}`).emit(event, payload);
}

export function emitP2POfferBalanceUpdate(userId: string, cryptoAsset: string) {
  socketServer?.of('/presence').emit('p2p:offers-updated', { userId, cryptoAsset });
}

export function emitMarketplaceOrderEvent(orderId: string, event: string, payload: unknown) {
  socketServer?.of('/chat').to(`order-${orderId}`).emit(event, payload);
  void redis.publish(MARKETPLACE_ORDER_CHANNEL, JSON.stringify({
    source: socketInstanceId,
    orderId,
    name: event,
    payload,
  })).catch((error) => {
    logger.error({ orderId, event, error: error instanceof Error ? error.message : String(error) }, 'Unable to publish marketplace order event');
  });
}
