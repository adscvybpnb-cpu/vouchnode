import { FastifyInstance } from 'fastify';
import { ProductController } from '../controllers/product.controller';
import { authenticate, optionalAuth, requireApprovedSeller, requireRole } from '../middleware/auth.middleware';
import { ProductRepository } from '../repositories/product.repository';
import { UserRole } from '@vouchnode/shared';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { config } from '../config';

export default async function productRoutes(app: FastifyInstance) {
  app.get('/products', { preHandler: [optionalAuth] }, ProductController.getProducts);
  app.get('/products/mine', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.getMyProducts);
  
  const safeLimit = (value: unknown) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 48) : 10;
  };
  const safeCollection = async (req: any, res: any, collection: () => Promise<unknown[]>, label: string) => {
    try {
      return res.status(200).send(await collection());
    } catch (error) {
      req.log.error({ error }, `${label} products lookup failed`);
      return res.status(200).send([]);
    }
  };
  app.get('/products/featured', async (req: any, res) => safeCollection(req, res, () => ProductRepository.getFeatured(safeLimit(req.query?.limit)), 'Featured'));
  app.get('/products/trending', async (req: any, res) => safeCollection(req, res, () => ProductRepository.getTrending(safeLimit(req.query?.limit)), 'Trending'));
  app.get('/products/best-sellers', async (req: any, res) => safeCollection(req, res, () => ProductRepository.getBestSellers(safeLimit(req.query?.limit)), 'Best sellers'));
  app.get('/products/new-arrivals', async (req: any, res) => safeCollection(req, res, () => ProductRepository.getNewArrivals(safeLimit(req.query?.limit)), 'New arrivals'));
  app.get('/products/instant', async (req: any, res) => safeCollection(req, res, () => ProductRepository.getInstantDelivery(safeLimit(req.query?.limit)), 'Instant delivery'));
  app.get('/products/:slug/offers', { preHandler: [optionalAuth] }, ProductController.getOffers);
  
  app.post('/products', { preHandler: [authenticate, requireApprovedSeller] }, ProductController.createProduct);
  app.post('/products/upload-image', { preHandler: [authenticate, requireApprovedSeller] }, async (req: any, reply) => {
    const part = await req.file();
    if (!part || part.fieldname !== 'image') return reply.code(400).send({ message: 'An image file is required' });
    if (!part.mimetype.startsWith('image/')) return reply.code(415).send({ message: 'Only image files are supported' });
    const storage = createStorageProvider(config.storage.provider, config.storage.local.path, '/uploads', config.storage.s3);
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
