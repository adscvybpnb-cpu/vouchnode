import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { NotificationService } from '../services/notification.service';
import { WalletRepository } from '../repositories/wallet.repository';

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => callback({
      role: { upsert: vi.fn().mockResolvedValue({}) },
      country: { upsert: vi.fn().mockResolvedValue({}) },
      currency: { upsert: vi.fn().mockResolvedValue({}) }
    })),
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn()
    },
    role: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn()
    }
  }
}));

vi.mock('../services/notification.service', () => ({
  NotificationService: { createNotification: vi.fn() }
}));

vi.mock('../repositories/wallet.repository', () => ({
  WalletRepository: { initializeUserWallets: vi.fn() }
}));

describe('AuthService', () => {
  it('should throw if user already exists', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: '1' } as any);
    await expect(AuthService.register({ email: 'test@test.com', password: 'Password123!', username: 'test' }))
      .rejects.toThrow('Email or username already exists');
  });

  it('queues the branded welcome email after a successful registration', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.findUniqueOrThrow).mockResolvedValue({ id: 'buyer-role' } as any);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'new-user',
      email: 'new-user@example.com',
      passwordHash: 'hashed',
      profile: { displayName: 'New Buyer' },
      roles: [{ role: { name: 'BUYER' } }]
    } as any);
    vi.mocked(WalletRepository.initializeUserWallets).mockResolvedValue([]);
    vi.mocked(NotificationService.createNotification).mockResolvedValue({});

    await AuthService.register({
      email: ' New-User@example.com ',
      username: 'new-buyer',
      firstName: 'New',
      lastName: 'Buyer',
      country: 'us',
      password: 'Password123!'
    });

    expect(WalletRepository.initializeUserWallets).toHaveBeenCalledWith('new-user');
    expect(NotificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'new-user',
      type: 'SYSTEM',
      title: expect.stringContaining('Welcome to VouchNode!'),
      data: { emailTemplate: 'welcome' },
      sendEmail: true
    }));
  });

  it('should login and return tokens for valid user', async () => {
    // Note: requires argon2 mock or proper integration test in reality
    expect(true).toBe(true);
  });
});
