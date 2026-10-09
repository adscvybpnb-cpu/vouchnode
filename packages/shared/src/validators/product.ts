import { z } from 'zod';
import { DeliveryType } from '../types';

export const MarketplaceCategorySchema = z.enum([
  'gift-cards', 'gaming', 'steam-keys', 'pubg-mobile', 'free-fire',
  'roblox', 'fortnite', 'rocket-league', 'streaming', 'software',
]);

const CreateProductBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  category: MarketplaceCategorySchema,
  brand: z.string().optional(),
  region: z.string().optional(),
  originalPrice: z.number().positive(),
  currentPrice: z.number().positive(),
  deliveryType: z.nativeEnum(DeliveryType),
  images: z.array(z.string().url()).min(1),
  inventoryDetails: z.array(z.string().trim().min(1, 'A valid digital code is required')).min(1, 'You must add a digital code to list this product.'),
  terms: z.string().optional()
});

export const CreateProductSchema = CreateProductBaseSchema;

export const UpdateProductSchema = CreateProductBaseSchema.partial();

export const ProductFiltersSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  region: z.string().trim().max(32).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  deliveryType: z.nativeEnum(DeliveryType).optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  hasDiscount: z.boolean().optional(),
  verifiedSeller: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.enum(['relevance', 'price', 'rating', 'createdAt', 'soldCount']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});
