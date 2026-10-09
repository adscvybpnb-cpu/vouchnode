import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DepositSessionNetwork, Prisma } from '@prisma/client';
import { config } from '../src/config';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { getEncryptionKey } from '../src/lib/encryption';
import { OrderService } from '../src/services/order.service';
import { DisputeService } from '../src/services/dispute.service';
import { requiresManualReview, TOKEN_DEPLOYMENTS } from '../src/config/blockchain';
import { buyerConfirmationQueue, disputeTimerQueue, orderExpiryQueue } from '../src/jobs/queue';

const OPERATIONS_PER_PAIR = 300;
const PAYMENT_WORKER_CONCURRENCY = 10;
const SELLING_PRICE = new Prisma.Decimal(100);

type Pair = { asset: string; network: DepositSessionNetwork };

const pairs: Pair[] = [
  { asset: 'BTC', network: 'BTC' },
  { asset: 'BCH', network: 'BCH' },
  { asset: 'LTC', network: 'LTC' },
  { asset: 'ETH', network: 'ERC20' },
  { asset: 'BNB', network: 'BEP20' },
  { asset: 'TRX', network: 'TRC20' },
  { asset: 'SOL', network: 'SOLANA' },
  ...TOKEN_DEPLOYMENTS.map(({ asset, network }) => ({
    asset,
    network: network as DepositSessionNetwork,
  })),
];

function assertIsolatedEnvironment() {
  if (config.app.env === 'production' || process.env.STRESS_TEST_ALLOW_DB_WRITES !== 'YES') {
    throw new Error('Refusing load test: set NODE_ENV=test and STRESS_TEST_ALLOW_DB_WRITES=YES explicitly.');
  }
  const databaseHost = new URL(config.db.url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const redisHost = new URL(config.redis.url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(databaseHost) || !localHosts.has(redisHost)) {
    throw new Error('Refusing load test: database and Redis must both be local disposable services.');
  }
}

function encryptCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(config.security.encryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${cipher.getAuthTag().toString('hex')}`;
}

function decryptCode(value: string) {
  const [ivHex, encryptedHex, authTagHex] = value.split(':');
  if (!ivHex || !encryptedHex || !authTagHex) throw new Error('Invalid test inventory encryption payload');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(config.security.encryptionKey),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return `${decipher.update(encryptedHex, 'hex', 'utf8')}${decipher.final('utf8')}`;
}

async function assertAllFulfilled<T>(
  label: string,
  operations: Array<() => Promise<T>>,
  concurrency = operations.length,
) {
  const results = new Array<PromiseSettledResult<T>>(operations.length);
  let nextOperation = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, operations.length) }, async () => {
    while (true) {
      const index = nextOperation++;
      if (index >= operations.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await operations[index]() };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }));
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length) {
    const examples = failures.slice(0, 5).map(({ reason }) =>
      reason instanceof Error ? reason.message : String(reason),
    );
    throw new Error(`${label}: ${failures.length}/${results.length} failed; examples: ${examples.join(' | ')}`);
  }
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createFixtures(runId: string) {
  await prisma.currency.upsert({
    where: { code: 'USDT' },
    create: { code: 'USDT', name: 'Test Tether', symbol: 'USDT', type: 'CRYPTO' },
    update: {},
  });
  const buyer = await prisma.user.create({
    data: {
      email: `load-buyer-${runId}@stress.invalid`,
      passwordHash: 'stress-test-only',
      profile: {
        create: {
          displayName: 'Load Test Buyer',
          username: `load-buyer-${runId}`,
        },
      },
    },
  });
  const sellerUser = await prisma.user.create({
    data: {
      email: `load-seller-${runId}@stress.invalid`,
      passwordHash: 'stress-test-only',
      profile: {
        create: {
          displayName: 'Load Test Seller',
          username: `load-seller-${runId}`,
        },
      },
      sellerProfile: {
        create: {
          shopName: `Load Shop ${runId}`,
          shopSlug: `load-shop-${runId}`,
          status: 'ACTIVE',
        },
      },
    },
    include: { sellerProfile: true },
  });
  const admin = await prisma.user.create({
    data: {
      email: `load-admin-${runId}@stress.invalid`,
      passwordHash: 'stress-test-only',
      profile: {
        create: {
          displayName: 'Load Test Admin',
          username: `load-admin-${runId}`,
        },
      },
    },
  });
  const category = await prisma.category.create({
    data: { name: `Stress Category ${runId}`, slug: `stress-category-${runId}` },
  });
  if (!sellerUser.sellerProfile) throw new Error('Stress seller fixture was not created');
  return { buyer, sellerUser, seller: sellerUser.sellerProfile, admin, category };
}

async function runPair(
  pair: Pair,
  pairIndex: number,
  runId: string,
  fixtures: Awaited<ReturnType<typeof createFixtures>>,
) {
  const startedAt = performance.now();
  const pairName = `${pair.asset}/${pair.network}`;
  const product = await prisma.product.create({
    data: {
      slug: `stress-${runId}-${pairIndex}`,
      name: `Load Test ${pairName}`,
      description: 'Disposable stress-test listing',
      categoryId: fixtures.category.id,
      sellerId: fixtures.seller.id,
      originalPrice: SELLING_PRICE,
      currentPrice: SELLING_PRICE,
      stock: OPERATIONS_PER_PAIR,
      currency: 'USDT',
      deliveryType: 'INSTANT',
      status: 'ACTIVE',
    },
  });

  const inventory = Array.from({ length: OPERATIONS_PER_PAIR }, (_, index) => {
    const code = `GF-LOAD-${runId}-${pairIndex}-${index}`;
    return {
      productId: product.id,
      codeHash: createHash('sha256').update(code).digest('hex'),
      encryptedContent: encryptCode(code),
    };
  });
  await prisma.productInventory.createMany({ data: inventory });

  const orders = await assertAllFulfilled(
    `${pairName} purchase creation`,
    Array.from({ length: OPERATIONS_PER_PAIR }, () =>
      () => OrderService.createOrder(fixtures.buyer.id, product.id, 1, 'DIRECT_INVOICE'),
    ),
    OPERATIONS_PER_PAIR,
  );
  const transactionHashes = orders.map((order, index) =>
    `stress-${runId}-${pairIndex}-${index}`,
  );
  const addresses = orders.map((order, index) =>
    `stress-${runId}-${pair.network.toLowerCase()}-${pair.asset.toLowerCase()}-${index}`,
  );
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.depositSession.createMany({
    data: orders.map((order, index) => ({
      userId: fixtures.buyer.id,
      orderId: order.id,
      currency: pair.asset,
      assignedAddress: addresses[index],
      network: pair.network,
      amount: 1,
      usdAmount: 100,
      exchangeRate: 1,
      expiresAt,
    })),
  });
  await prisma.staticAddressPool.createMany({
    data: addresses.map((address) => ({
      asset: pair.asset,
      address,
      status: 'BUSY',
      expiresAt,
    })),
  });

  const deposits = orders.map((order, index) => async () => {
    const transactionHash = transactionHashes[index];
    if (requiresManualReview(pair.asset, pair.network)) {
      await prisma.depositSession.updateMany({
        where: { orderId: order.id, status: 'PENDING', transactionHash: null },
        data: { transactionHash },
      });
      await OrderService.markManualPaymentReview(order.id, transactionHash, pair.asset, pair.network);
      await OrderService.approveManualPayment(
        order.id,
        fixtures.admin.id,
        transactionHash,
        Number(order.totalAmount),
      );
      return;
    }

    await OrderService.processPaymentConfirmed(
      order.id,
      transactionHash,
      Number(order.totalAmount),
      undefined,
      { depositAmount: 1 },
    );
  });
  await assertAllFulfilled(`${pairName} deposit settlement`, deposits, PAYMENT_WORKER_CONCURRENCY);

  const orderIds = orders.map(({ id }) => id);
  const [statusGroups, completedSessions, deliveredInventory, activeConversations, availableAddresses] = await Promise.all([
    prisma.order.groupBy({
      by: ['status', 'paymentStatus'],
      where: { id: { in: orderIds } },
      _count: { _all: true },
    }),
    prisma.depositSession.count({ where: { orderId: { in: orderIds }, status: 'COMPLETED' } }),
    prisma.productInventory.count({
      where: { productId: product.id, isDelivered: true, orderId: { not: null } },
    }),
    prisma.conversation.count({
      where: { orderId: { in: orderIds }, isActive: true },
    }),
    prisma.staticAddressPool.count({
      where: { address: { in: addresses }, status: 'AVAILABLE' },
    }),
  ]);

  assert(
    statusGroups.length === 1 &&
      statusGroups[0].status === 'PAID' &&
      statusGroups[0].paymentStatus === 'COMPLETED' &&
      statusGroups[0]._count._all === OPERATIONS_PER_PAIR,
    `${pairName}: found orders not atomically paid`,
  );
  assert(completedSessions === OPERATIONS_PER_PAIR, `${pairName}: incomplete deposit sessions`);
  assert(deliveredInventory === OPERATIONS_PER_PAIR, `${pairName}: inventory was not delivered exactly once`);
  assert(activeConversations === OPERATIONS_PER_PAIR, `${pairName}: buyer/seller conversations are missing`);
  assert(availableAddresses === OPERATIONS_PER_PAIR, `${pairName}: deposit addresses were not released`);

  const workspaceOrder = await prisma.order.findUniqueOrThrow({
    where: { id: orders[0].id },
    include: { conversation: true, product: true },
  });
  const purchasedCode = await prisma.productInventory.findUniqueOrThrow({
    where: { orderId: workspaceOrder.id },
    select: { encryptedContent: true },
  });
  assert(Boolean(workspaceOrder.conversation?.isActive), `${pairName}: buyer workspace chat is not active`);
  assert(Boolean(workspaceOrder.escrowDeadline && workspaceOrder.escrowDeadline > new Date(Date.now() + 47 * 60 * 60 * 1000)), `${pairName}: 48-hour stage-one deadline is missing`);
  assert(
    new RegExp(`^GF-LOAD-${runId}-${pairIndex}-\\d+$`).test(decryptCode(purchasedCode.encryptedContent)),
    `${pairName}: delivered gift-card code failed decryption`,
  );

  await OrderService.confirmOrder(orders[0].id, fixtures.buyer.id);

  const stageOneTimeoutOrder = orders[1];
  await prisma.order.update({
    where: { id: stageOneTimeoutOrder.id },
    data: { escrowDeadline: new Date(Date.now() - 1000) },
  });
  await OrderService.completeExpiredBuyerConfirmations(new Date(), 10);
  const stageOneTimeoutResult = await prisma.order.findUniqueOrThrow({
    where: { id: stageOneTimeoutOrder.id },
    select: { status: true },
  });
  assert(stageOneTimeoutResult.status === 'COMPLETED', `${pairName}: stage-one timeout did not settle`);

  const disputeOrder = orders[2];
  await DisputeService.escalateDispute(disputeOrder.id, fixtures.buyer.id, 'STRESS_TEST', 'Test dispute stage');
  const sellerDeadline = await prisma.order.findUniqueOrThrow({
    where: { id: disputeOrder.id },
    select: { status: true, sellerResponseDeadline: true },
  });
  assert(sellerDeadline.status === 'DISPUTE_OPEN', `${pairName}: dispute did not enter seller response stage`);
  assert(Boolean(sellerDeadline.sellerResponseDeadline && sellerDeadline.sellerResponseDeadline > new Date(Date.now() + 47 * 60 * 60 * 1000)), `${pairName}: stage-two 48-hour deadline is missing`);
  await DisputeService.respondToDispute(disputeOrder.id, fixtures.sellerUser.id, 'Test seller response');
  const buyerDeadline = await prisma.order.findUniqueOrThrow({
    where: { id: disputeOrder.id },
    select: { status: true, buyerReviewDeadline: true },
  });
  assert(buyerDeadline.status === 'DISPUTED_WAITING_BUYER', `${pairName}: seller response did not enter buyer review stage`);
  assert(Boolean(buyerDeadline.buyerReviewDeadline && buyerDeadline.buyerReviewDeadline > new Date(Date.now() + 47 * 60 * 60 * 1000)), `${pairName}: stage-three 48-hour deadline is missing`);
  await prisma.order.update({
    where: { id: disputeOrder.id },
    data: { buyerReviewDeadline: new Date(Date.now() - 1000) },
  });
  await OrderService.completeExpiredBuyerDisputeResponses(new Date(), 10);
  const stageThreeResult = await prisma.order.findUniqueOrThrow({
    where: { id: disputeOrder.id },
    select: { status: true },
  });
  assert(stageThreeResult.status === 'COMPLETED', `${pairName}: stage-three timeout did not settle`);

  const sellerTimeoutOrder = orders[3];
  await DisputeService.escalateDispute(sellerTimeoutOrder.id, fixtures.buyer.id, 'STRESS_TEST', 'Test seller timeout');
  await prisma.order.update({
    where: { id: sellerTimeoutOrder.id },
    data: { sellerResponseDeadline: new Date(Date.now() - 1000) },
  });
  await OrderService.completeExpiredDisputeResponses(new Date(), 10);
  const sellerTimeoutResult = await prisma.order.findUniqueOrThrow({
    where: { id: sellerTimeoutOrder.id },
    select: { status: true },
  });
  assert(sellerTimeoutResult.status === 'CANCELLED', `${pairName}: seller timeout did not refund/cancel`);

  return {
    pair: pairName,
    purchases: orders.length,
    deposits: OPERATIONS_PER_PAIR,
    manualReview: requiresManualReview(pair.asset, pair.network),
    elapsedMs: Math.round(performance.now() - startedAt),
    orderIds,
  };
}

async function main() {
  assertIsolatedEnvironment();
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const startedAt = performance.now();
  const fixtures = await createFixtures(runId);
  const results = [];

  console.log('DIRECT CHECKOUT DATABASE LOAD TEST');
  console.log(`Target: localhost disposable services; ${pairs.length} asset/network pairs`);
  console.log(`Load: ${OPERATIONS_PER_PAIR} concurrent purchases + ${OPERATIONS_PER_PAIR} deposit events per pair`);
  console.log(`Payment worker concurrency: ${PAYMENT_WORKER_CONCURRENCY} (bounded like the production confirmation worker)`);
  console.log('Deposit confirmation: synthetic verified settlement through the production order/payment service (no RPC broadcasts)');

  for (const [index, pair] of pairs.entries()) {
    const result = await runPair(pair, index, runId, fixtures);
    results.push(result);
    console.log(`[PASS] ${result.pair}: purchases=${result.purchases}, deposits=${result.deposits}, stage1/2/3 escrow checks=PASS, elapsed=${result.elapsedMs}ms`);
  }

  const orderIds = results.flatMap(({ orderIds: ids }) => ids);
  const [remainingPendingOrders, incompletePayments, unfinishedSessions, undeliveredInventory, missingConversations] = await Promise.all([
    prisma.order.count({ where: { id: { in: orderIds }, status: { in: ['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'] } } }),
    prisma.order.count({ where: { id: { in: orderIds }, paymentStatus: { not: 'COMPLETED' } } }),
    prisma.depositSession.count({ where: { orderId: { in: orderIds }, status: { not: 'COMPLETED' } } }),
    prisma.productInventory.count({
      where: { product: { orders: { some: { id: { in: orderIds } } } }, isDelivered: false },
    }),
    prisma.conversation.count({ where: { orderId: { in: orderIds }, isActive: false } }),
  ]);
  assert(remainingPendingOrders === 0, `Final state has ${remainingPendingOrders} stuck orders`);
  assert(incompletePayments === 0, `Final state has ${incompletePayments} incomplete payments`);
  assert(unfinishedSessions === 0, `Final state has ${unfinishedSessions} unfinished deposit sessions`);
  assert(undeliveredInventory === 0, `Final state has ${undeliveredInventory} undelivered inventory records`);
  assert(missingConversations === 0, `Final state has ${missingConversations} inactive conversations`);

  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(`[PASS] purchases completed: ${orderIds.length}/${orderIds.length}`);
  console.log(`[PASS] deposits settled: ${orderIds.length}/${orderIds.length}`);
  console.log('[PASS] stuck pending orders: 0');
  console.log('[PASS] incomplete payments/sessions: 0');
  console.log('[PASS] gift-code delivery, active private conversations, and escrow workflows verified');
  console.log(`[SUMMARY] pairs=${pairs.length} purchases=${orderIds.length} deposits=${orderIds.length} elapsed=${elapsedMs}ms`);
  console.log('DIRECT CHECKOUT DATABASE LOAD TEST PASSED');
}

main()
  .catch((error) => {
    console.error('DIRECT CHECKOUT DATABASE LOAD TEST FAILED');
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([
      orderExpiryQueue.close(),
      buyerConfirmationQueue.close(),
      disputeTimerQueue.close(),
      redis.quit(),
      prisma.$disconnect(),
    ]);
  });
