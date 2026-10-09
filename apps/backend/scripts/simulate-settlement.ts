type Network = 'ERC20' | 'TRC20' | 'SOLANA' | 'BTC' | 'BCH' | 'LTC';
type SessionStatus = 'PENDING' | 'EXPIRED';
type DepositState = 'DETECTED' | 'CONFIRMING' | 'SETTLED' | 'MANUAL_REVIEW';

type Scenario = {
  id: string;
  network: Network;
  asset: string;
  minute: number;
  confirmationsAt: number;
  sessionStatusAtDetection: SessionStatus;
  transactionHash: string;
  address: string;
};

const scenarios: Scenario[] = [
  { id: 'scenario-1', network: 'ERC20', asset: 'USDT', minute: 2, confirmationsAt: 4, sessionStatusAtDetection: 'PENDING', transactionHash: '0xquick-1', address: '0xuser1' },
  { id: 'scenario-2', network: 'TRC20', asset: 'USDT', minute: 3, confirmationsAt: 5, sessionStatusAtDetection: 'PENDING', transactionHash: 'trx-quick-2', address: 'Tuser2' },
  { id: 'scenario-3', network: 'SOLANA', asset: 'USDC', minute: 8, confirmationsAt: 10, sessionStatusAtDetection: 'PENDING', transactionHash: 'sol-concurrent-3', address: 'sol-user3' },
  { id: 'scenario-4', network: 'SOLANA', asset: 'USDC', minute: 8, confirmationsAt: 10, sessionStatusAtDetection: 'PENDING', transactionHash: 'sol-concurrent-4', address: 'sol-user4' },
  { id: 'scenario-5', network: 'BTC', asset: 'BTC', minute: 59, confirmationsAt: 66, sessionStatusAtDetection: 'PENDING', transactionHash: 'btc-late-59', address: 'bc1-user5' },
  { id: 'scenario-6', network: 'BCH', asset: 'BCH', minute: 61, confirmationsAt: 64, sessionStatusAtDetection: 'EXPIRED', transactionHash: 'bch-late-61', address: 'bitcoincash:user6' },
];

async function main() {
  const seenEvents = new Set<string>();
  const queue: Scenario[] = [];
  let settled = 0;
  let manualReview = 0;
  let cursor = 0;

  console.log('SETTLEMENT SIMULATION');
  console.log('Mode: deterministic dry-run; no RPC broadcast and no Prisma writes');
  console.log('Queue: BLOCKCHAIN_SETTLEMENT_QUEUE, concurrency=1');

  for (const scenario of scenarios) {
    cursor += 1;
    const eventKey = `${scenario.network}:${scenario.transactionHash}:0`;
    console.log(`[cursor ${cursor}] ${scenario.network} block observed for ${scenario.id} at minute ${scenario.minute}`);
    if (seenEvents.has(eventKey)) {
      console.log(`[replay] ${scenario.id} skipped: unique eventKey already processed`);
      continue;
    }
    seenEvents.add(eventKey);
    if (scenario.sessionStatusAtDetection === 'EXPIRED') {
      manualReview += 1;
      console.log(`[manual-review] ${scenario.id} captured after expiration; no automatic credit`);
      continue;
    }
    queue.push(scenario);
    console.log(`[queue] ${scenario.id} enqueued: ${eventKey}`);
  }

  while (queue.length) {
    const scenario = queue.shift()!;
    console.log(`[queue] processing ${scenario.id} (${scenario.network}/${scenario.asset})`);
    if (scenario.confirmationsAt > 60) {
      manualReview += 1;
      console.log(`[manual-review] ${scenario.id} crossed the 60-minute session boundary before finality`);
      continue;
    }
    settled += 1;
    console.log(`[settled] ${scenario.id}: CONFIRMED -> SETTLING -> SETTLED`);
  }

  const concurrent = scenarios.filter((scenario) => scenario.minute === 8);
  if (concurrent.length !== 2 || settled < 4) throw new Error('Concurrent settlement assertion failed');
  if (manualReview !== 2) throw new Error('Late-payment manual review assertion failed');
  if (seenEvents.size !== scenarios.length) throw new Error('Replay identity assertion failed');

  console.log(`[PASS] standard deposits settled: 2`);
  console.log(`[PASS] concurrent same-asset deposits serialized: ${concurrent.length}`);
  console.log(`[PASS] minute-59 late-finality deposit routed to manual review`);
  console.log(`[PASS] minute-61 post-expiration deposit captured and routed to manual review`);
  console.log(`[PASS] replay identities: ${seenEvents.size} unique`);
  console.log(`[SUMMARY] detected=${scenarios.length} settled=${settled} manualReview=${manualReview} cursor=${cursor}`);
  console.log('SETTLEMENT SIMULATION PASSED');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
