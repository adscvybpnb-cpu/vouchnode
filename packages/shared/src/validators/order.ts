import { z } from 'zod';

export const CreateOrderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().default(1)
});
