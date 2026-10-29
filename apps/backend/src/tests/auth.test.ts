import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { NotificationService } from '../services/notification.service';
import { COUNTRY_CATALOG } from '../catalogs/countries';
import { CURRENCY_CATALOG } from '../catalogs/currencies';
import { INTERNAL_SUPPORTED_ASSET_CODES } from '../lib/internal-wallet';

const mocks = vi.hoisted(() => ({
  userCreate: vi.fn(),
  walletCreateMany: vi.fn(),
  walletFindMany: vi.fn(),
  userUpdate: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
  passwordHash: vi.fn().mockResolvedValue('hashed-password'),
  passwordVerify: vi.fn(),
  roleCreateMany: vi.fn(),
  countryCreateMany: vi.fn(),
  currencyCreateMany: vi.fn(),
  countryFindUnique: vi.fn(),
  currencyFindMany: vi.fn(),
  roleFindUnique: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => callback({
      user: { create: mocks.userCreate, update: mocks.userUpdate },
      session: { create: mocks.sessionCreate },
      wallet: {
        createMany: mocks.walletCreateMany,
        findMany: mocks.walletFindMany,
      },
    })),
    country: { createMany: mocks.countryCreateMany, findUnique: mocks.countryFindUnique },
    currency: { createMany: mocks.currencyCreateMany, findMany: mocks.currencyFindMany },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: mocks.userUpdate,
    },
    session: {
      findUnique: mocks.sessionFindUnique,
      updateMany: mocks.sessionUpdateMany,
    },
    role: {
      createMany: mocks.roleCreateMany,
      findUnique: mocks.roleFindUnique,
      findUniqueOrThrow: vi.fn(),
      create: vi.fn()
    }
  }
}));

vi.mock('argon2', () => ({
  default: {
    hash: mocks.passwordHash,
    verify: mocks.passwordVerify,
  },
}));

vi.mock('../services/notification.service', () => ({
  NotificationService: { createNotification: vi.fn() }
}));

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.countryFindUnique.mockResolvedValue(null);
    mocks.currencyFindMany.mockResolvedValue([]);
    mocks.roleFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses complete, valid country metadata from the seed catalog', () => {
    expect(COUNTRY_CATALOG.length).toBeGreaterThan(200);
    expect(new Set(COUNTRY_CATALOG.map(({ code }) => code)).size).toBe(COUNTRY_CATALOG.length);
    expect(COUNTRY_CATALOG.every(({ code, name, dialCode }) => code && name && dialCode && dialCode !== '+0')).toBe(true);
  });

  it('defines metadata for every currency used to initialize wallets', () => {
    const catalogCodes = new Set(CURRENCY_CATALOG.map(({ code }) => code));
    expect(['USD', ...INTERNAL_SUPPORTED_ASSET_CODES].every((code) => catalogCodes.has(code))).toBe(true);
  });

  it('creates wallets atomically for a country represented in the country catalog', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.findUniqueOrThrow).mockResolvedValue({ id: 'buyer-role' } as any);
    mocks.userCreate.mockResolvedValue({
      id: 'egypt-user',
      email: 'egypt-user@example.com',
      passwordHash: 'hashed',
      profile: { displayName: 'Egypt User' },
      roles: [{ role: { name: 'BUYER' } }]
    });
    mocks.walletCreateMany.mockResolvedValue({ count: INTERNAL_SUPPORTED_ASSET_CODES.length });
    mocks.walletFindMany.mockResolvedValue(Array.from({ length: INTERNAL_SUPPORTED_ASSET_CODES.length }, () => ({})));

    await AuthService.register({
      email: 'egypt-user@example.com',
      username: 'egypt-user',
      firstName: 'Egypt',
      lastName: 'User',
      country: 'eg',
      password: 'Password123!'
    });

    expect(mocks.countryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ code: 'EG', name: 'Egypt', dialCode: '+20' })],
      skipDuplicates: true,
    });
    expect(mocks.currencyCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ code: 'USD' })]),
      skipDuplicates: true,
    }));
    expect(mocks.walletCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ currency: 'USDT', isPrimary: false }),
      ]),
      skipDuplicates: true,
    }));
    expect(mocks.walletCreateMany.mock.calls[0][0].data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ currency: 'USD' })]),
    );
    expect(mocks.walletFindMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should throw if user already exists', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: '1' } as any);
    await expect(AuthService.register({ email: 'test@test.com', password: 'Password123!', username: 'test' }))
      .rejects.toThrow('Email or username already exists');
  });

  it('keeps signup on the Telegram verification path without waiting for email delivery', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.role.findUniqueOrThrow).mockResolvedValue({ id: 'buyer-role' } as any);
    mocks.userCreate.mockResolvedValue({
      id: 'new-user',
      email: 'new-user@example.com',
      passwordHash: 'hashed',
      profile: { displayName: 'New Buyer' },
      roles: [{ role: { name: 'BUYER' } }]
    });
    mocks.walletCreateMany.mockResolvedValue({ count: INTERNAL_SUPPORTED_ASSET_CODES.length });
    mocks.walletFindMany.mockResolvedValue(Array.from({ length: INTERNAL_SUPPORTED_ASSET_CODES.length }, () => ({})));
    await AuthService.register({
      email: ' New-User@example.com ',
      username: 'new-buyer',
      firstName: 'New',
      lastName: 'Buyer',
      country: 'us',
      password: 'Password123!'
    });

    expect(mocks.walletCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ userId: 'new-user' })]),
    }));
    expect(NotificationService.createNotification).not.toHaveBeenCalled();
  });

  it('creates a session transactionally and binds the access token to it', async () => {
    const user = {
      id: 'login-user',
      email: 'login@example.com',
      passwordHash: 'stored-hash',
      status: 'ACTIVE',
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      emailVerified: true,
      roles: [{ role: { name: 'BUYER' } }],
    };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user as any);
    mocks.passwordVerify.mockResolvedValue(true);
    mocks.userUpdate.mockResolvedValue(user);
    mocks.sessionCreate.mockResolvedValue({ id: 'login-session' });
    const tokenSpy = vi.spyOn(AuthService, 'generateAccessToken').mockReturnValue('access-token');

    const result = await AuthService.login(user.email, 'Password123!', '127.0.0.1', 'test-agent');

    expect(result).toMatchObject({ accessToken: 'access-token', refreshToken: expect.any(String) });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.sessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: user.id, ipAddress: '127.0.0.1', userAgent: 'test-agent' }),
    }));
    expect(mocks.userUpdate).toHaveBeenCalledOnce();
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: user.id },
      data: expect.objectContaining({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: expect.any(Date),
        lastLoginIp: '127.0.0.1',
        isOnline: true,
      }),
    });
    expect(tokenSpy).toHaveBeenCalledWith(user, 'login-session');
  });

  it('allows pending accounts to sign in and continue to Telegram verification', async () => {
    const user = {
      id: 'pending-user',
      email: 'pending@example.com',
      passwordHash: 'stored-hash',
      status: 'PENDING_VERIFICATION',
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      roles: [{ role: { name: 'BUYER' } }],
    };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user as any);
    mocks.passwordVerify.mockResolvedValue(true);
    mocks.userUpdate.mockResolvedValue(user);
    mocks.sessionCreate.mockResolvedValue({ id: 'pending-session' });
    vi.spyOn(AuthService, 'generateAccessToken').mockReturnValue('pending-access-token');

    const result = await AuthService.login(user.email, 'Password123!', '', '');

    expect(result.accessToken).toBe('pending-access-token');
    expect(mocks.passwordVerify).toHaveBeenCalledWith(user.passwordHash, 'Password123!');
    expect(mocks.sessionCreate).toHaveBeenCalled();
  });

  it('marks email as verified without activating a Telegram-pending account', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'pending-user' } as any);
    mocks.userUpdate.mockResolvedValue({});

    await AuthService.verifyEmail('verification-token');

    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { emailVerificationToken: 'verification-token' },
          { emailVerificationToken: expect.any(String) },
        ]),
      }),
    }));
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null },
    }));
  });

  it('rotates refresh tokens with a one-time conditional update', async () => {
    const session = {
      id: 'refresh-session',
      refreshToken: 'old-refresh-token',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'login-user',
        email: 'login@example.com',
        status: 'ACTIVE',
        tokenVersion: 0,
        roles: [{ role: { name: 'BUYER' } }],
      },
    };
    mocks.sessionFindUnique.mockResolvedValue(session);
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    const tokenSpy = vi.spyOn(AuthService, 'generateAccessToken').mockReturnValue('refreshed-access-token');

    const result = await AuthService.refreshToken('old-refresh-token');

    expect(result.accessToken).toBe('refreshed-access-token');
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: session.id, refreshToken: 'old-refresh-token' }),
    }));
    expect(tokenSpy).toHaveBeenCalledWith(session.user, session.id);
  });

  it('keeps pending accounts able to refresh while they complete Telegram verification', async () => {
    const session = {
      id: 'pending-refresh-session',
      refreshToken: 'pending-refresh-token',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'pending-user',
        email: 'pending@example.com',
        status: 'PENDING_VERIFICATION',
        tokenVersion: 0,
        roles: [{ role: { name: 'BUYER' } }],
      },
    };
    mocks.sessionFindUnique.mockResolvedValue(session);
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(AuthService, 'generateAccessToken').mockReturnValue('pending-refreshed-access-token');

    await expect(AuthService.refreshToken('pending-refresh-token'))
      .resolves.toMatchObject({ accessToken: 'pending-refreshed-access-token' });
  });
});
