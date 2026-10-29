DELETE FROM "SystemSetting"
WHERE "key" IN (
  'referral_bonuses_enabled',
  'referral_commission_rate_percent',
  'referral_platform_fee_cap_percent'
);
