import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { UnifiedWalletEngineService } from '../services/unified-wallet-engine.service';

const generateDepositSchema = z.object({
  asset: z.preprocess(
    (value) => value ?? undefined,
    z.string().trim().min(2).max(10).optional()
  ),
  cryptoCurrency: z.preprocess(
    (value) => value ?? undefined,
    z.string().trim().min(2).max(10).optional()
  ),
  currency: z.preprocess(
    (value) => value ?? undefined,
    z.string().trim().min(2).max(10).optional()
  ),
  network: z.enum([
    'BTC',
    'BCH',
    'LTC',
    'TRC20',
    'BEP20',
    'BSC',
    'ERC20',
    'ETHEREUM',
    'POLYGON',
    'ARBITRUM_ONE',
    'BASE',
    'OPTIMISM',
    'SOLANA'
  ]),
  amount: z.coerce.number().finite().nonnegative().default(0)
}).superRefine((value, context) => {
  if (!value.asset && !value.cryptoCurrency && !value.currency) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['asset'],
      message: 'asset, cryptoCurrency, or currency is required.'
    });
  }
});

export default async function financeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post('/deposit/generate', async (request, reply) => {
    const parsed = generateDepositSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Invalid deposit request',
        message: 'asset, network, and a non-negative amount are required.'
      });
    }

    try {
      const userId = (request as any).user?.id;
      if (typeof userId !== 'string' || !userId) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required.'
        });
      }

      const asset = parsed.data.asset || parsed.data.cryptoCurrency || parsed.data.currency;
      if (!asset) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Invalid deposit request',
          message: 'A cryptocurrency asset is required.'
        });
      }

      const session = await UnifiedWalletEngineService.createDepositSession(
        userId,
        asset,
        parsed.data.network,
        parsed.data.amount
      );

      return reply.status(201).send({
        id: session.id,
        address: session.address,
        assignedAddress: session.address,
        network: session.network,
        status: session.status,
        amount: Number(session.amount),
        remainingSeconds: Math.max(
          0,
          Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000)
        )
      });
    } catch (error) {
      request.log.error(error, 'Unified deposit address generation failed');
      const message = error instanceof Error
        ? error.message
        : 'Unable to generate a deposit address.';

      return reply.status(400).send({
        statusCode: 400,
        error: 'Deposit Generation Failed',
        message
      });
    }
  });
}
