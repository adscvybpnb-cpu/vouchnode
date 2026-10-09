import { z } from 'zod';

export const CreateDisputeSchema = z.object({
  reason: z.string().min(1),
  description: z.string().min(10)
});

export const RespondDisputeSchema = z.object({
  response: z.string().min(10),
  evidenceIds: z.array(z.string()).optional()
});
