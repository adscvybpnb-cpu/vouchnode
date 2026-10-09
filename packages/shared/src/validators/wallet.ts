import { z } from 'zod';

export const InitDepositSchema = z.object({
  currency: z.string().min(2),
  network: z.string().optional()
});

export const WithdrawSchema = z.object({
  currency: z.string().min(2),
  network: z.string().optional(),
  amount: z.number().positive(),
  destinationAddress: z.string().min(1),
  securityCode: z.string().optional()
});
