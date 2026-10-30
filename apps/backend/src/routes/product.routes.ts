import { FastifyInstance } from 'fastify';
import { ProductController } from '../controllers/product.controller';
import { authenticate, optionalAuth, requireApprovedSeller, requireRole } from '../middleware/auth.middleware';
import { ProductRepository } from '../repositories/product.repository';
import { UserRole } from '@vouchnode/shared';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { config } from '../config';
import { redis } from '../lib/redis';

export default async function productRoutes(app: FastifyInstance) {
  app.get('/products', { preHandler: [optionalAuth] }, ProductController.getProducts);
  app.get('/products/mine', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.getMyProducts);

  const safeLimit = (value: unknown) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 48) : 10;
  };
  const safeCollection = async (
    req: any,
    res: any,
    collection: () => Promise<unknown[]>,
    label: string,
    cacheKey: string,
  ) => {
    if (redis.status === 'ready') {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const cached = await new Promise<string | null>((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Product cache read timed out')), 100);
          redis.get(cacheKey).then(resolve, reject);
        });
        if (cached !== null) {
          const items: unknown = JSON.parse(cached);
          if (Array.isArray(items)) return res.status(200).send(items);
          req.log.warn({ cacheKey }, 'Ignoring invalid product collection cache entry');
        }
      } catch (error) {
        req.log.warn({ error, cacheKey }, 'Unable to read product collection cache');
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    try {
      const items = await collection();
      if (redis.status === 'ready') {
        void redis.set(cacheKey, JSON.stringify(items), 'EX', 15).catch((error) => {
          req.log.warn({ error, cacheKey }, 'Unable to update product collection cache');
        });
      }
      return res.status(200).send(items);
    } catch (error) {
      req.log.error({ error }, `${label} products lookup failed`);
      return res.status(200).send([]);
    }
  };
  app.get('/products/featured', async (req: any, res) => {
    const limit = safeLimit(req.query?.limit);
    return safeCollection(req, res, () => ProductRepository.getFeatured(limit), 'Featured', `products:featured:${limit}`);
  });
  app.get('/products/trending', async (req: any, res) => {
    const limit = safeLimit(req.query?.limit);
    return safeCollection(req, res, () => ProductRepository.getTrending(limit), 'Trending', `products:trending:${limit}`);
  });
  app.get('/products/best-sellers', async (req: any, res) => {
    const limit = safeLimit(req.query?.limit);
    return safeCollection(req, res, () => ProductRepository.getBestSellers(limit), 'Best sellers', `products:best-sellers:${limit}`);
  });
  app.get('/products/new-arrivals', async (req: any, res) => {
    const limit = safeLimit(req.query?.limit);
    return safeCollection(req, res, () => ProductRepository.getNewArrivals(limit), 'New arrivals', `products:new-arrivals:${limit}`);
  });
  app.get('/products/instant', async (req: any, res) => {
    const limit = safeLimit(req.query?.limit);
    return safeCollection(req, res, () => ProductRepository.getInstantDelivery(limit), 'Instant delivery', `products:instant:${limit}`);
  });
  app.get('/products/:slug/offers', { preHandler: [optionalAuth] }, ProductController.getOffers);

  app.post('/products', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.createProduct);
  app.post('/products/upload-image', { preHandler: [authenticate, requireApprovedSeller] }, async (req: any, reply) => {
    const part = await req.file();
    if (!part || part.fieldname !== 'image') return reply.code(400).send({ message: 'An image file is required' });
    if (!part.mimetype.startsWith('image/')) return reply.code(415).send({ message: 'Only image files are supported' });
    const storage = createStorageProvider(config.storage.provider, config.storage.local.path, '/uploads', config.storage.s3, config.storage.cloudinary);
    const uploaded = await storage.upload(await part.toBuffer(), `products/${req.user.id}`, `${Date.now()}-${part.filename}`);
    return reply.send({ url: uploaded.url });
  });
  app.patch('/products/:id', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.updateProduct);
  app.patch('/products/:id/status', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.updateProductStatus);
  app.post('/products/:id/clone', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.cloneProduct);
  app.delete('/products/:id', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.deleteProduct);
  app.post('/products/:id/inventory', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.addInventory);

  app.get('/categories', ProductController.getCategories);
  app.post('/categories', { preHandler: [authenticate, requireRole([UserRole.ADMIN])] }, ProductController.createCategory);
  app.patch('/categories/:id', { preHandler: [authenticate, requireRole([UserRole.ADMIN])] }, ProductController.updateCategory);
  app.get('/products/:slug', { preHandler: [optionalAuth] }, ProductController.getProduct);
}
