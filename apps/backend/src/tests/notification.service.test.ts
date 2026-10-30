import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import { NotificationService } from '../services/notification.service';

vi.mock('../lib/prisma', () => ({
  prisma: {
    notification: { create: vi.fn() },
  },
}));
vi.mock('../jobs/queue', () => ({
  scheduleNotificationDelivery: vi.fn(),
}));
vi.mock('../websocket/socket.server', () => ({
  getSocketServer: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationService recipient validation', () => {
  it('rejects a missing recipient before calling Prisma', async () => {
    await expect(NotificationService.createNotification({
      userId: '',
      type: 'DEPOSIT_CONFIRMED',
      title: 'Deposit credited',
    })).rejects.toThrow('A non-empty notification recipient userId is required.');

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
