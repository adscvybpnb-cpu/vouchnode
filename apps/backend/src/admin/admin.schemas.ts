import { z } from 'zod';
import { ADMIN_SUPPORTED_ASSETS } from './admin.constants';

export const adminPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().trim().min(1).optional(),
  search: z.string().trim().max(120).optional(),
});

export const adminReasonSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const adminWithdrawalDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(1000).optional(),
});

export const adminDepositDecisionSchema = z.object({
  decision: z.enum(['VERIFY', 'REJECT']),
  transactionHash: z.string().trim().min(8).max(200).optional(),
  reason: z.string().trim().max(1000).optional(),
});

const adminAssetValues = [...ADMIN_SUPPORTED_ASSETS] as [
  typeof ADMIN_SUPPORTED_ASSETS[number],
  ...typeof ADMIN_SUPPORTED_ASSETS[number][]
];

export const adminAssetSchema = z.enum(adminAssetValues);

export const adminDisputeDecisionSchema = z.object({
  resolution: z.enum(['BUYER', 'SELLER']),
  note: z.string().trim().min(3).max(2000),
});

export type AdminPageQuery = z.infer<typeof adminPageQuerySchema>;
export type AdminReason = z.infer<typeof adminReasonSchema>;
export type AdminWithdrawalDecision = z.infer<typeof adminWithdrawalDecisionSchema>;
export type AdminDepositDecision = z.infer<typeof adminDepositDecisionSchema>;
export type AdminDisputeDecision = z.infer<typeof adminDisputeDecisionSchema>;
