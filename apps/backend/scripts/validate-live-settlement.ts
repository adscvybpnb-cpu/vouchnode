import { prisma } from '../src/lib/prisma';
import { createBlockchainAdapters } from '../src/services/native-blockchain-adapters';

const requiredNetworks = ['BTC', 'BCH', 'LTC', 'ERC20', 'BEP20', 'ARBITRUM_ONE', 'TRC20', 'SOLANA'] as const;

async function main() {
  const adapters = createBlockchainAdapters();
  const byNetwork = new Map(adapters.map((adapter) => [adapter.network, adapter]));
  const failures: string[] = [];

  console.log('LIVE SETTLEMENT SANITY CHECK');
  console.log('Mode: read-only; no balances, sessions, orders, or deposit states will be changed');

  for (const network of requiredNetworks) {
    const adapter = byNetwork.get(network);
    if (!adapter) {
      failures.push(`${network}: adapter missing`);
      console.log(`[FAIL] ${network}: adapter missing`);
      continue;
    }
    try {
      const [tip, safeTip] = await Promise.all([adapter.getTip(), adapter.getSafeTip()]);
      console.log(`[PASS] ${network}: tip=${tip.toString()} safeTip=${safeTip.toString()}`);
    } catch (error) {
      failures.push(`${network}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`[FAIL] ${network}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const network of ['POLYGON', 'BASE', 'OPTIMISM'] as const) {
    const adapter = byNetwork.get(network);
    if (!adapter) {
      failures.push(`${network}: token-network adapter missing`);
      console.log(`[FAIL] ${network}: token-network adapter missing`);
      continue;
    }
    try {
      const tip = await adapter.getTip();
      console.log(`[PASS] ${network} token RPC: tip=${tip.toString()}`);
    } catch (error) {
      failures.push(`${network}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`[FAIL] ${network}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const [pendingSessions, paymentPendingOrders, replayIndexes] = await Promise.all([
    prisma.depositSession.count({ where: { status: 'PENDING' } }),
    prisma.order.count({ where: { status: 'PAYMENT_PENDING' } }),
    prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'DetectedDeposit'
        AND indexname IN (
          'DetectedDeposit_eventKey_key',
          'DetectedDeposit_network_transactionHash_eventIndex_key'
        )
    `,
  ]);

  const indexNames = new Set(replayIndexes.map((row) => row.indexname));
  const requiredIndexes = [
    'DetectedDeposit_eventKey_key',
    'DetectedDeposit_network_transactionHash_eventIndex_key',
  ];
  const missingIndexes = requiredIndexes.filter((indexName) => !indexNames.has(indexName));
  if (missingIndexes.length) {
    failures.push(`missing replay indexes: ${missingIndexes.join(', ')}`);
    console.log(`[FAIL] replay indexes missing: ${missingIndexes.join(', ')}`);
  } else {
    console.log('[PASS] replay indexes: eventKey and network/transactionHash/eventIndex unique constraints active');
  }

  console.log(`[PASS] matching inputs readable: pendingDepositSessions=${pendingSessions} paymentPendingOrders=${paymentPendingOrders}`);
  console.log(`[SUMMARY] rpcNetworks=${requiredNetworks.length + 3} failures=${failures.length}`);

  if (failures.length) {
    throw new Error(`Live settlement sanity check failed: ${failures.join('; ')}`);
  }
  console.log('LIVE SETTLEMENT SANITY CHECK PASSED');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
