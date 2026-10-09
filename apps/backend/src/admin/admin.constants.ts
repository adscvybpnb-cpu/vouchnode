import { INTERNAL_SUPPORTED_ASSET_CODES } from '../lib/internal-wallet';

export const ADMIN_SUPPORTED_ASSETS = [...INTERNAL_SUPPORTED_ASSET_CODES] as const;

export const ADMIN_SLA_HOURS = {
  p2pDispute: 12,
  standardTicket: 48,
} as const;

export const ADMIN_CAPABILITIES = {
  catalogWrite: 'catalog:write',
  userRiskWrite: 'risk:write',
  financialReview: 'finance:review',
  kycReview: 'kyc:review',
  disputeReview: 'dispute:review',
  supportWrite: 'support:write',
  settingsWrite: 'settings:write',
} as const;

export type AdminCapability = typeof ADMIN_CAPABILITIES[keyof typeof ADMIN_CAPABILITIES];

export const ADMIN_ROLE_CAPABILITIES: Record<'ADMIN' | 'SUPPORT', readonly AdminCapability[]> = {
  ADMIN: Object.values(ADMIN_CAPABILITIES),
  SUPPORT: [
    ADMIN_CAPABILITIES.kycReview,
    ADMIN_CAPABILITIES.disputeReview,
    ADMIN_CAPABILITIES.supportWrite,
    ADMIN_CAPABILITIES.userRiskWrite,
  ],
};
