import { FastifyInstance } from 'fastify';
import { ReviewService } from '../services/review.service';
import { authenticate } from '../middleware/auth.middleware';

export default async function reviewRoutes(app: FastifyInstance) {
  app.post('/:orderId', { preHandler: [authenticate] }, async (req: any, res) => {
    return res.status(201).send(await ReviewService.createReview(req.params.orderId, req.user.id, req.body));
  });

  app.get('/product/:productId', async (req: any, res) => {
    return res.send(await ReviewService.getProductReviews(req.params.productId));
  });

  app.get('/seller/:sellerId', async (req: any, res) => {
    return res.send(await ReviewService.getSellerReviews(req.params.sellerId));
  });
}
