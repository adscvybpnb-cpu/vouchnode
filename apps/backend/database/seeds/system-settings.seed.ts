import { PrismaClient, SettingType } from '@prisma/client';

export async function seedSettings(prisma: PrismaClient) {
  console.log('Seeding system settings...');
  const settings = [
    { key: 'seller_response_period_hours', value: '96', type: SettingType.NUMBER, group: 'business' },
    { key: 'buyer_confirmation_period_hours', value: '96', type: SettingType.NUMBER, group: 'business' },
    { key: 'order_payment_timeout_hours', value: '24', type: SettingType.NUMBER, group: 'business' },
    { key: 'platform_fee_percent', value: '2.5', type: SettingType.NUMBER, group: 'fees' },
    { key: 'withdrawal_fee_percent', value: '1', type: SettingType.NUMBER, group: 'fees' },
    { key: 'withdrawal_fee_fixed', value: '0', type: SettingType.NUMBER, group: 'fees' }
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: s,
      create: s
    });
  }
}
