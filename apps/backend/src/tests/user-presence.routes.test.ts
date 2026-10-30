import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userUpdate: vi.fn(),
  emitPresenceUpdate: vi.fn(),
  schedulePresenceExpiry: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { update: mocks.userUpdate },
  },
}));

vi.mock('../middleware/auth.middleware', () => ({
  authenticate: vi.fn(async (request: { user?: { id: string } }) => {
    request.user = { id: 'user-1' };
  }),
}));

vi.mock('../websocket/socket.server', () => ({
  emitPresenceUpdate: mocks.emitPresenceUpdate,
  schedulePresenceExpiry: mocks.schedulePresenceExpiry,
}));

import presenceRoutes from '../routes/presence.routes';

describe('user presence route', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(presenceRoutes, { prefix: '/users' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('sets and broadcasts a bounded stay-online timer', async () => {
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    mocks.userUpdate.mockResolvedValue({
      id: 'user-1',
      isOnline: true,
      onlineUntil: expiresAt,
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/presence',
      payload: { online: true, durationHours: 4 },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { isOnline: true, onlineUntil: expect.any(Date) },
    }));
    expect(mocks.schedulePresenceExpiry).toHaveBeenCalledWith('user-1', expiresAt);
    expect(mocks.emitPresenceUpdate).toHaveBeenCalledWith('user-1', true, expiresAt);
  });

  it('clears the stay-online timer when going offline', async () => {
    mocks.userUpdate.mockResolvedValue({
      id: 'user-1',
      isOnline: false,
      onlineUntil: null,
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/presence',
      payload: { online: false },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { isOnline: false, onlineUntil: null },
    }));
    expect(mocks.schedulePresenceExpiry).toHaveBeenCalledWith('user-1', null);
    expect(mocks.emitPresenceUpdate).toHaveBeenCalledWith('user-1', false, null);
  });

  it('rejects invalid timer durations without changing presence', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/presence',
      payload: { online: true, durationHours: 24 },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
