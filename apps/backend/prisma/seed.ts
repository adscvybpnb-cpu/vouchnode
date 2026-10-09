import { PrismaClient, Prisma, RiskLevel, SellerStatus, UserStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEFAULT_SELLER_COUNT = 500;
const SEEDED_EMAIL_PREFIX = 'mock-seller-';
const SEEDED_EMAIL_DOMAIN = '@seed.vouchnode.test';
const DEFAULT_PASSWORD = 'MockSeller123!';

const handles = [
  'pixel', 'quest', 'loot', 'arcade', 'vault', 'respawn', 'guild', 'level',
  'checkpoint', 'powerup', 'console', 'raid', 'boss', 'controller', 'legend',
];
const specialties = [
  'console gift cards', 'PC gaming credits', 'competitive gaming rewards',
  'digital game keys', 'mobile game top-ups', 'streaming subscriptions',
  'gaming bundles', 'esports vouchers',
];
const regions = ['NA', 'EU', 'APAC', 'LATAM'];

function getCount() {
  const requested = Number.parseInt(process.env.SEED_SELLERS_COUNT || String(DEFAULT_SELLER_COUNT), 10);
  if (!Number.isInteger(requested) || requested < 1 || requested > DEFAULT_SELLER_COUNT) {
    throw new Error(`SEED_SELLERS_COUNT must be an integer between 1 and ${DEFAULT_SELLER_COUNT}.`);
  }
  return requested;
}

function getOnlineMode(): boolean {
  const mode = (process.env.SEED_SELLERS_ONLINE || 'false').toLowerCase();
  if (mode !== 'true' && mode !== 'false') {
    throw new Error('SEED_SELLERS_ONLINE must be either true or false.');
  }
  return mode === 'true';
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomRating() {
  return Number((4.5 + Math.random() * 0.5).toFixed(2));
}

function sellerData(index: number, passwordHash: string, isOnline: boolean) {
  const suffix = String(index + 1).padStart(3, '0');
  const handle = `${handles[index % handles.length]}${regions[index % regions.length].toLowerCase()}${suffix}`;
  const specialty = specialties[index % specialties.length];
  const sales = randomInt(100, 20_000);
  const rating = randomRating();
  const displayName = `${handle.charAt(0).toUpperCase()}${handle.slice(1)} Market`;
  const email = `${SEEDED_EMAIL_PREFIX}${suffix}${SEEDED_EMAIL_DOMAIN}`;

  return {
    email,
    passwordHash,
    emailVerified: true,
    status: UserStatus.ACTIVE,
    riskLevel: RiskLevel.LOW,
    isOnline,
    completedTradesCount: sales,
    positiveFeedback: Math.max(1, Math.round(sales * (rating / 5))),
    negativeFeedback: Math.max(0, Math.round(sales * ((5 - rating) / 5))),
    totalVolumeUSD: new Prisma.Decimal((sales * randomInt(8, 85)).toFixed(2)),
    profile: {
      create: {
        username: handle,
        displayName,
        // Include the immutable seed index in both the path and query to guarantee
        // a distinct URL for every generated profile, even if naming inputs change.
        avatarUrl: `https://api.dicebear.com/9.x/avataaars/svg/vouchnode-${suffix}.svg?seed=vouchnode-${suffix}-${encodeURIComponent(handle)}`,
        bio: `Trusted ${specialty} seller helping gamers in ${regions[index % regions.length]} find fast, secure digital value. Stock is refreshed regularly and every order is handled with care.`,
        isIdentityVerified: true,
        totalSuccessfulTrades: sales,
        successRate: Number((98 + Math.random() * 2).toFixed(2)),
      },
    },
    sellerProfile: {
      create: {
        shopName: displayName,
        shopSlug: handle,
        description: `Verified storefront for ${specialty}, with reliable delivery and buyer-first support.`,
        logoUrl: `https://api.dicebear.com/9.x/shapes/svg?seed=vouchnode-logo-${encodeURIComponent(handle)}`,
        status: SellerStatus.ACTIVE,
        verificationLevel: 2,
        totalSales: sales,
        completedOrders: sales,
        avgRating: rating,
        reviewCount: randomInt(Math.max(10, Math.floor(sales * 0.05)), Math.max(20, Math.floor(sales * 0.35))),
        avgResponseTime: randomInt(2, 45),
        approvedAt: new Date(),
      },
    },
  };
}

async function resetSeededSellers() {
  const result = await prisma.user.deleteMany({
    where: { email: { startsWith: SEEDED_EMAIL_PREFIX, endsWith: SEEDED_EMAIL_DOMAIN } },
  });
  console.log(`Reset ${result.count} seeded seller account(s).`);
}

async function main() {
  const count = getCount();
  const isOnline = getOnlineMode();
  const shouldReset = process.env.SEED_SELLERS_RESET === 'true';
  const sellerRole = await prisma.role.findUnique({ where: { name: 'SELLER' } });

  if (!sellerRole) {
    throw new Error('SELLER role is missing. Run the base role seed before this script.');
  }

  if (shouldReset) await resetSeededSellers();

  const passwordHash = await argon2.hash(DEFAULT_PASSWORD);
  const existingSeeded = await prisma.user.count({
    where: { email: { startsWith: SEEDED_EMAIL_PREFIX, endsWith: SEEDED_EMAIL_DOMAIN } },
  });
  const startIndex = existingSeeded;

  for (let index = startIndex; index < count; index += 1) {
    const data = sellerData(index, passwordHash, isOnline);
    await prisma.user.create({
      data: {
        ...data,
        roles: { create: { roleId: sellerRole.id } },
      },
    });
  }

  if (startIndex >= count) {
    await prisma.user.updateMany({
      where: { email: { startsWith: SEEDED_EMAIL_PREFIX, endsWith: SEEDED_EMAIL_DOMAIN } },
      data: { isOnline },
    });
  }

  console.log(`Seeded ${count} unique mock seller profile(s). Online: ${isOnline}.`);
  console.log(`Mock seller password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seller seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
