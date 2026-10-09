import { DepositSessionNetwork } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { createBlockchainAdapters } from '../src/services/native-blockchain-adapters';

const enabledNetworks = new Set<DepositSessionNetwork>(['ARBITRUM_ONE', 'TRC20', 'SOLANA']);

async function main() {
  const adapters = createBlockchainAdapters().filter((adapter) => enabledNetworks.has(adapter.network));
  for (const adapter of adapters) {
    const existing = await prisma.blockCursor.findUnique({ where: { network: adapter.network } });
    if (existing) {
      console.info(JSON.stringify({
        event: 'block_cursor_unchanged',
        network: adapter.network,
        nextBlock: existing.nextBlock.toString(),
        status: existing.status,
      }));
      continue;
    }

    const safeTip = await adapter.getSafeTip();
    const cursor = await prisma.blockCursor.create({
      data: {
        network: adapter.network,
        nextBlock: safeTip,
        observedTip: safeTip,
        status: 'ACTIVE',
      },
    });
    console.info(JSON.stringify({
      event: 'block_cursor_initialized',
      network: cursor.network,
      nextBlock: cursor.nextBlock.toString(),
      observedTip: cursor.observedTip?.toString(),
    }));
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      event: 'block_cursor_initialization_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
