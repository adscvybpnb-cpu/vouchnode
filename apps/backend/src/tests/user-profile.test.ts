import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profileFindUnique: vi.fn(),
  profileFindFirst: vi.fn(),
  profileUpdateMany: vi.fn(),
  profileUpdate: vi.fn(),
  profileFindUniqueOrThrow: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({
      userProfile: {
        findUnique: mocks.profileFindUnique,
        findFirst: mocks.profileFindFirst,
        updateMany: mocks.profileUpdateMany,
        update: mocks.profileUpdate,
        findUniqueOrThrow: mocks.profileFindUniqueOrThrow,
      },
    })),
    userProfile: {
      update: mocks.profileUpdate,
    },
  },
}));

import { UserService } from '../services/user.service';

describe('user profile updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileFindUnique.mockResolvedValue({
      userId: 'user-1',
      username: 'old_name',
      usernameChangedAt: null,
    });
    mocks.profileFindFirst.mockResolvedValue(null);
    mocks.profileUpdateMany.mockResolvedValue({ count: 1 });
    mocks.profileFindUniqueOrThrow.mockResolvedValue({
      userId: 'user-1',
      username: 'new_name',
      usernameChangedAt: new Date(),
    });
  });

  it('updates a username and records the change time', async () => {
    await UserService.updateProfile('user-1', { username: 'new_name' });

    expect(mocks.profileUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', username: 'old_name', usernameChangedAt: null },
      data: { username: 'new_name', usernameChangedAt: expect.any(Date) },
    });
  });

  it('rejects username changes within the eight-day cooldown', async () => {
    mocks.profileFindUnique.mockResolvedValue({
      userId: 'user-1',
      username: 'old_name',
      usernameChangedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });

    await expect(UserService.updateProfile('user-1', { username: 'new_name' }))
      .rejects.toMatchObject({ statusCode: 429 });
    expect(mocks.profileUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects concurrent username changes when the profile has changed', async () => {
    mocks.profileUpdateMany.mockResolvedValue({ count: 0 });

    await expect(UserService.updateProfile('user-1', { username: 'new_name' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
