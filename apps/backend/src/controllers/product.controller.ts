import { FastifyInstance } from 'fastify';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../services/category.service';
import { ProductFiltersSchema, CreateProductSchema, UpdateProductSchema } from '@vouchnode/shared';
import { prisma } from '../lib/prisma';
import { ProductRepository } from '../repositories/product.repository';

export class ProductController {
  static async getProducts(request: any, reply: any) {
    try {
      const rawQuery = (request.query ?? {}) as Record<string, any>;
      const categorySlug = typeof rawQuery.category === 'string'
        ? rawQuery.category
        : typeof rawQuery.categoryId === 'string'
          ? rawQuery.categoryId
          : undefined;
      const category = categorySlug
        ? await prisma.category.findUnique({ where: { slug: categorySlug }, select: { id: true } })
        : undefined;

      const parsed = ProductFiltersSchema.safeParse({
        ...rawQuery,
        categoryId: category?.id ?? (categorySlug && !category ? categorySlug : undefined),
        page: rawQuery.page !== undefined ? Number(rawQuery.page) : 1,
        limit: rawQuery.limit !== undefined ? Number(rawQuery.limit) : 20,
        sortBy: rawQuery.sortBy ?? 'relevance',
        sortOrder: rawQuery.sortOrder ?? 'desc'
      });

      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: parsed.error.errors.map((error) => `${error.path.join('.')}: ${error.message}`).join('; '),
        });
      }

      const filters = { ...parsed.data, minRating: parsed.data.rating };

      const pagination = {
        page: filters.page || 1,
        limit: filters.limit || 20,
        sortBy: filters.sortBy || 'relevance',
        sortOrder: filters.sortOrder || 'desc'
      };

      const result = await ProductService.getProducts(filters, pagination, false);
      return reply.send(result ?? { data: [], total: 0 });
    } catch (error) {
      request.log?.error({ err: error, query: request.query }, 'Product list failed');
      return reply.code(500).send({ statusCode: 500, error: 'Product Search Failed', message: 'Unable to load marketplace listings.' });
    }
  }

  static async getProduct(request: any, reply: any) {
    const product = await ProductService.getProduct(request.params.slug, request.user?.id);
    return reply.send(product);
  }

  static async getMyProducts(request: any, reply: any) {
    const rawQuery = request.query ?? {};
    if (rawQuery.userId && rawQuery.userId !== request.user.id) {
      return reply.status(403).send({ message: 'You can only access your own listings' });
    }
    const page = Math.max(Number(rawQuery.page) || 1, 1);
    const limit = Math.min(Math.max(Number(rawQuery.limit) || 50, 1), 100);
    const seller = await prisma.seller.findUnique({ where: { userId: request.user.id }, select: { id: true, userId: true } });
    if (!seller) return reply.send({ data: [], total: 0, page, limit, totalPages: 1 });
    if (String(rawQuery.status).toUpperCase() === 'SOLD') {
      const where = {
        sellerId: request.user.id,
        product: { sellerId: seller.id },
      };
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: rawQuery.sortOrder === 'asc' ? 'asc' as const : 'desc' as const },
          include: {
            product: {
              include: {
                images: true,
                category: true,
                seller: {
                  select: {
                    id: true,
                    userId: true,
                    shopName: true,
                    shopSlug: true,
                    verificationLevel: true,
                    avgRating: true,
                    user: {
                      select: {
                        profile: { select: { displayName: true, username: true, avatarUrl: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.order.count({ where }),
      ]);
      const data = orders.map((order) => ({
        ...order.product,
        status: 'SOLD' as const,
        orders: [{
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          deliveryStatus: order.deliveryStatus,
          createdAt: order.createdAt,
          totalAmount: order.totalAmount,
          currency: order.currency,
        }],
      }));
      return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
    }
    const result = await ProductService.getProducts(
      { sellerId: seller.id, status: rawQuery.status, includeAllStatuses: !rawQuery.status },
      { page, limit, sortBy: 'createdAt', sortOrder: rawQuery.sortOrder === 'asc' ? 'asc' : 'desc' },
      true,
    );
    return reply.send({ ...result, page, limit, totalPages: Math.max(1, Math.ceil(result.total / limit)) });
  }

  static async getOffers(request: any, reply: any) {
    try {
      const product = await ProductRepository.findBySlug(String(request.params.slug || '').trim());
      if (!product) return reply.status(404).send({ message: 'Product not found' });

      const offers = await ProductRepository.getRelated(product);
      return reply.status(200).send(offers);
    } catch (error) {
      request.log.error({ error, slug: request.params.slug }, 'Product offers lookup failed');
      return reply.status(200).send([]);
    }
  }

  static async createProduct(request: any, reply: any) {
    try {
      const data = CreateProductSchema.parse(request.body);
      const product = await ProductService.createProduct(request.user.id, data);
      return reply.status(201).send(product);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create product';
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message });
    }
  }

  static async updateProduct(request: any, reply: any) {
    try {
      const data = UpdateProductSchema.parse(request.body);
      const product = await ProductService.updateProduct(request.params.id, request.user.id, data);
      return reply.send(product);
    } catch (error) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Unable to update listing',
      });
    }
  }

  static async updateProductStatus(request: any, reply: any) {
    try {
      const { status } = request.body ?? {};
      if (status !== 'ACTIVE' && status !== 'HIDDEN') {
        return reply.status(400).send({ message: 'Status must be ACTIVE or HIDDEN' });
      }
      const product = await ProductService.updateProductStatus(request.params.id, request.user.id, status);
      return reply.send(product);
    } catch (error) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Unable to update listing status',
      });
    }
  }

  static async cloneProduct(request: any, reply: any) {
    try {
      const digitalCode = typeof request.body?.digitalCode === 'string' ? request.body.digitalCode.trim() : '';
      if (!digitalCode) {
        return reply.status(400).send({ message: 'A new digital code is required to clone a listing' });
      }
      const product = await ProductService.cloneProduct(request.params.id, request.user.id, digitalCode);
      return reply.status(201).send(product);
    } catch (error) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Unable to clone listing',
      });
    }
  }

  static async deleteProduct(request: any, reply: any) {
    await ProductService.deleteProduct(request.params.id, request.user.id);
    return reply.status(204).send();
  }

  static async addInventory(request: any, reply: any) {
    try {
      const { codes } = request.body;
      if (!Array.isArray(codes)) return reply.status(400).send({ message: 'codes must be an array' });
      await ProductService.addInventory(request.params.id, request.user.id, codes);
      return reply.send({ message: 'Inventory added successfully' });
    } catch (error) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Unable to update inventory',
      });
    }
  }

  static async getCategories(request: any, reply: any) {
    const categories = await CategoryService.getAll();
    return reply.send(categories);
  }

  static async createCategory(request: any, reply: any) {
    const category = await CategoryService.create(request.body);
    return reply.status(201).send(category);
  }

  static async updateCategory(request: any, reply: any) {
    const category = await CategoryService.update(request.params.id, request.body);
    return reply.send(category);
  }
}
