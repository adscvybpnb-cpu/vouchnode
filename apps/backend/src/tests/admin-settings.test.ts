import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: new Map<string, { key: string; value: string; type: string; group: string; updatedBy?: string }>(),
  auditCreate: vi.fn(),
  userFindUnique: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('../lib/prisma', () => {
  const upsert = vi.fn(async ({ where, create, update }: {
    where: { key: string };
    create: { key: string; value: string; type: string; group: string; updatedBy?: string };
    update: Partial<{ value: string; type: string; group: string; updatedBy: string }>;
  }) => {
    const current = mocks.settings.get(where.key);
    mocks.settings.set(where.key, current ? { ...current, ...update } : create);
  });
  const tx = {
    systemSetting: { upsert },
    user: { findUnique: mocks.userFindUnique },
    auditLog: { create: mocks.auditCreate },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (operation: unknown) => {
        if (typeof operation === 'function') return operation(tx);
        return Promise.all(operation as Promise<unknown>[]);
      }),
      systemSetting: {
        upsert,
        findMany: vi.fn(async () => Array.from(mocks.settings.values())),
      },
    },
  };
});

vi.mock('../services/seller.service', () => ({ SellerService: {} }));
vi.mock('../services/dispute.service', () => ({ DisputeService: {} }));
vi.mock('../services/p2p-order.service', () => ({ P2POrderService: {} }));
vi.mock('../services/system-settings.service', () => ({
  SystemSettingsService: { invalidate: mocks.invalidate },
}));
vi.mock('../services/report.service', () => ({ ReportService: {} }));
vi.mock('../repositories/product.repository', () => ({ ProductRepository: {} }));
vi.mock('../services/product.service', () => ({ ProductService: {} }));
vi.mock('../services/notification.service', () => ({ NotificationService: {} }));
vi.mock('../websocket/socket.server', () => ({ emitAccountStatusRevoked: vi.fn() }));

import { AdminService } from '../services/admin.service';

describe('admin system settings', () => {
  beforeEach(() => {
    mocks.settings.clear();
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.auditCreate.mockResolvedValue({});
    mocks.invalidate.mockResolvedValue(undefined);
  });

  it('saves fast-launch settings for dedicated admin tokens without a User row', async () => {
    const settings = await AdminService.updateSettings('env-admin', {
      seller_fast_launch_enabled: 'true',
    });

    expect(mocks.settings.get('seller_fast_launch_enabled')).toMatchObject({
      value: 'true',
      type: 'BOOLEAN',
      group: 'operations',
      updatedBy: 'env-admin',
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        actorType: 'ADMIN',
        action: 'system.settings.update',
        metadata: {
          keys: ['seller_fast_launch_enabled'],
          originalActorId: 'env-admin',
          auditActorUnavailable: true,
        },
      }),
    });
    expect(settings.find((setting) => setting.key === 'seller_fast_launch_enabled')?.value).toBe('true');
  });
});
