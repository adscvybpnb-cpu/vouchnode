import { FastifyInstance } from 'fastify';
import { WalletService } from '../services/wallet.service';
import { authenticate } from '../middleware/auth.middleware';
import { InitDepositSchema, WithdrawSchema } from '@vouchnode/shared';
import { UnifiedWalletEngineService } from '../services/unified-wallet-engine.service';
import { z } from 'zod';
import { DepositScannerService } from '../services/deposit-scanner.service';
import { config } from '../config';
import { isTestPaymentSimulationAuthorized } from '../middleware/test-payment-simulation';

const depositSessionSchema = z.object({
  currency: z.string().trim().min(2).max(10).transform((value) => value.toUpperCase()),
  // Network aliases are normalized by UnifiedWalletEngineService so this route
  // accepts the same labels used by checkout clients (for example, BEP-20).
  network: z.string().trim().min(2).max(30),
  amount: z.number().finite().nonnegative().optional().default(0),
  orderId: z.string().trim().min(1).optional()
});
const simulatedPaymentSchema = z.object({
  sessionId: z.string().min(1),
  amount: z.number().finite().positive(),
  transactionHash: z.string().trim().min(6).max(200)
});

export default async function walletRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req: any, res) => {
    try {
      return res.send(await WalletService.getBalanceSummary(req.user.id));
    } catch (error) {
      req.log.error(error, 'Unable to load wallet balance');
      return res.send({ availableBalance: 0, pendingBalance: 0, frozenBalance: 0, totalUsdBalance: 0, currency: 'USD' });
    }
  });

  app.get('/balance', async (req: any, res) => {
    const wallet = await WalletService.getUsdBalance(req.user.id);
    return res.send(wallet);
  });

  app.get('/checkout-quote', async (req: any, res) => {
    const price = Number(req.query?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).send({ statusCode: 400, error: 'Invalid price', message: 'A positive product price is required.' });
    }
    return res.send(await WalletService.getCheckoutQuote(req.user.id, price));
  });

  app.get('/portfolio', async (req: any, res) => {
    try {
      return res.send(await WalletService.getPortfolioSummary(req.user.id));
    } catch (error) {
      req.log.error(error, 'Unable to load portfolio summary');
      return res.send({ totalUsdBalance: 0, assets: [] });
    }
  });

  app.get('/assets', async (req: any, res) => {
    return res.send(await WalletService.supportedAssets());
  });

  app.get('/transactions', async (req: any, res) => {
    try {
      return res.send(await WalletService.getTransactionHistory(req.user.id, req.query?.currency));
    } catch (error) {
      req.log.error(error, 'Unable to load wallet transaction history');
      return res.send([]);
    }
  });

  app.post('/swap', async (req: any, res) => {
    try {
      const { fromAsset, toAsset, amount } = req.body || {};
      if (typeof fromAsset !== 'string' || typeof toAsset !== 'string' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).send({
          statusCode: 400,
          error: 'Swap Failed',
          message: 'fromAsset, toAsset, and a positive numeric amount are required'
        });

        app.post('/swap/quote', async (req: any, res) => {
          try {
            const { fromAsset, toAsset, amount } = req.body || {};
            if (typeof fromAsset !== 'string' || typeof toAsset !== 'string' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
              return res.status(400).send({ statusCode: 400, error: 'Quote Failed', message: 'fromAsset, toAsset, and a positive numeric amount are required' });
            }
            return res.status(201).send(await WalletService.createSwapQuote(req.user.id, { fromCurrency: fromAsset, toCurrency: toAsset, amount }));
          } catch (error: any) {
            req.log.error(error, 'Swap quote creation failed');
            return res.status(400).send({ statusCode: 400, error: 'Quote Failed', message: error.message || 'Unable to create swap quote' });
          }
        });

        app.post('/swap/:swapId/confirm', async (req: any, res) => {
          try {
            return res.send(await WalletService.confirmSwapQuote(req.user.id, req.params.swapId));
          } catch (error: any) {
            req.log.error(error, 'Swap quote confirmation failed');
            return res.status(400).send({ statusCode: 400, error: 'Swap Confirmation Failed', message: error.message || 'Unable to confirm swap quote' });
          }
        });
      }
      const result = await WalletService.swapInternalAssets(req.user.id, { fromCurrency: fromAsset, toCurrency: toAsset, amount });
      return res.status(200).send({ message: 'Swap completed successfully', ...result });
    } catch (error: any) {
      req.log.error(error, 'Internal wallet swap failed');
      return res.status(400).send({ statusCode: 400, error: 'Swap Failed', message: error.message || 'Unable to swap assets' });
    }
  });

  app.post('/deposit/init', async (req: any, res) => {
    const data = InitDepositSchema.parse(req.body);
    if (!data.network) {
      return res.status(400).send({
        statusCode: 400,
        error: 'Invalid deposit request',
        message: 'An EVM deposit network is required.'
      });
    }

    const deposit = await UnifiedWalletEngineService.createDepositSession(
      req.user.id,
      data.currency,
      data.network,
      0
    );
    return res.status(201).send({
      id: deposit.id,
      address: deposit.address,
      depositAddress: deposit.address,
      network: deposit.network,
      status: deposit.status,
      amount: Number(deposit.amount),
      expiresAt: deposit.expiresAt
    });
  });

  app.post('/deposit/session', async (req: any, res) => {
    const parsed = depositSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).send({
        statusCode: 400,
        error: 'Invalid deposit session',
        message: 'Select a valid deposit network for the selected asset.'
      });
    }

    try {
      const deposit = await UnifiedWalletEngineService.createDepositSession(
        req.user.id,
        parsed.data.currency,
        parsed.data.network,
          parsed.data.amount,
          parsed.data.orderId
      );
      return res.status(201).send({
        id: deposit.id,
        address: deposit.address,
        assignedAddress: deposit.address,
        network: deposit.network,
        status: deposit.status,
        amount: Number(deposit.amount),
        expiresAt: deposit.expiresAt,
        walletIndex: 'walletIndex' in deposit ? deposit.walletIndex : undefined
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reserve a deposit address.';
      if (message.includes('No available static') || message.includes('temporarily busy')) {
        return res.status(409).send({ statusCode: 409, error: 'Deposit Pool Busy', message });
      }
      req.log.error(error, 'Deposit session creation failed');
      return res.status(500).send({ statusCode: 500, error: 'Deposit Session Failed', message });
    }
  });

  app.post('/deposit/session/simulate-payment', async (req: any, res) => {
        if (!isTestPaymentSimulationAuthorized(req)) {
          return res.status(404).send({ message: 'Payment simulation is available only in development.' });
        }
        const parsed = simulatedPaymentSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).send({ statusCode: 400, error: 'Invalid simulated payment', message: 'sessionId, positive amount, and transactionHash are required.' });
        }
        try {
          const session = await DepositScannerService.simulatePayment(req.user.id, parsed.data.sessionId, parsed.data.amount, parsed.data.transactionHash);
          return res.send({ id: session.id, status: session.status, amount: Number(session.amount), transactionHash: session.transactionHash, completedAt: session.completedAt });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to process simulated payment.';
          const status = message.includes('not found') ? 404 : message.includes('no longer active') || message.includes('already been processed') ? 409 : 400;
          return res.status(status).send({ statusCode: status, error: 'Simulated Payment Failed', message });
        }
  });

  app.post('/withdraw', async (req: any, res) => {
    const data = WithdrawSchema.parse(req.body);
    const withdrawal = await WalletService.requestWithdrawal(req.user.id, data);
    return res.status(201).send(withdrawal);
  });
}
