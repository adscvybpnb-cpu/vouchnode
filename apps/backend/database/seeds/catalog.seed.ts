import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config } from '../../src/config';
import { getEncryptionKey } from '../../src/lib/encryption';

export interface CatalogItem {
  slug: string;
  name: string;
  brand: string;
  categorySlug: string;
  faceValue: number;
  codePrefix: string;
  imageUrl: string;
}

const image = (brand: string) => `https://placehold.co/640x400/111827/ffffff?text=${encodeURIComponent(brand)}`;

const gamingPackages = [
  { brand: 'PUBG Mobile', categorySlug: 'pubg-mobile', codePrefix: 'PUBG', imageUrl: image('PUBG Mobile'), packages: [[60, 'PUBG Mobile 60 UC'], [325, 'PUBG Mobile 325 UC'], [660, 'PUBG Mobile 660 UC'], [1800, 'PUBG Mobile 1800 UC'], [3850, 'PUBG Mobile 3850 UC']] },
  { brand: 'Free Fire', categorySlug: 'free-fire', codePrefix: 'FF', imageUrl: image('Free Fire'), packages: [[100, 'Free Fire 100 Diamonds'], [310, 'Free Fire 310 Diamonds'], [520, 'Free Fire 520 Diamonds'], [1060, 'Free Fire 1060 Diamonds'], [2180, 'Free Fire 2180 Diamonds']] },
  { brand: 'Roblox', categorySlug: 'roblox', codePrefix: 'RBX', imageUrl: image('Roblox'), packages: [[400, 'Roblox 400 Robux'], [800, 'Roblox 800 Robux'], [1700, 'Roblox 1700 Robux'], [2000, 'Roblox 2000 Robux'], [4500, 'Roblox 4500 Robux'], [10000, 'Roblox 10000 Robux']] },
  { brand: 'Steam', categorySlug: 'gift-cards', codePrefix: 'STEAM', imageUrl: image('Steam'), packages: [[10, 'Steam $10 Wallet Code'], [20, 'Steam $20 Wallet Code'], [30, 'Steam $30 Wallet Code'], [50, 'Steam $50 Wallet Code'], [60, 'Steam $60 Wallet Code']] },
  { brand: 'Fortnite', categorySlug: 'fortnite', codePrefix: 'FN', imageUrl: image('Fortnite'), packages: [[1000, 'Fortnite 1000 V-Bucks'], [2800, 'Fortnite 2800 V-Bucks'], [5000, 'Fortnite 5000 V-Bucks'], [13500, 'Fortnite 13500 V-Bucks']] },
  { brand: 'Rocket League', categorySlug: 'rocket-league', codePrefix: 'RL', imageUrl: image('Rocket League'), packages: [[5, 'Rocket League 500 Credits'], [10, 'Rocket League 1100 Credits'], [20, 'Rocket League 3000 Credits'], [50, 'Rocket League Starter Pack']] },
  { brand: 'Gaming Credits', categorySlug: 'gaming', codePrefix: 'GAME', imageUrl: image('Gaming Credits'), packages: [[5, 'Gaming Credits $5 Wallet'], [10, 'Gaming Credits $10 Wallet'], [25, 'Gaming Credits $25 Wallet']] },
] as const;

export const massiveCatalogSeed: CatalogItem[] = gamingPackages.flatMap((family) =>
  family.packages.map(([faceValue, name]) => ({
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name,
    brand: family.brand,
    categorySlug: family.categorySlug,
    faceValue,
    codePrefix: family.codePrefix,
    imageUrl: family.imageUrl,
  })),
);

function encryptCode(code: string) {
  const key = getEncryptionKey(config.security.encryptionKey);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = `${cipher.update(code, 'utf8', 'hex')}${cipher.final('hex')}`;
  return {
    codeHash: crypto.createHash('sha256').update(code).digest('hex'),
    encryptedContent: `${iv.toString('hex')}:${encrypted}:${cipher.getAuthTag().toString('hex')}`,
  };
}

function mockCode(item: CatalogItem) {
  const token = crypto.createHash('sha256').update(item.slug).digest('hex').slice(0, 8).toUpperCase();
  return `${item.codePrefix}-${token.slice(0, 4)}-${token.slice(4)}`;
}

export async function seedMassiveCatalog(prisma: PrismaClient, sellerId: string) {
  await prisma.product.updateMany({
    where: {
      OR: [
        { slug: { startsWith: 'pubg-mobile-uc-' } },
        { slug: { startsWith: 'free-fire-diamonds-' } },
        { slug: { startsWith: 'roblox-robux-' } },
        { slug: { startsWith: 'steam-' } },
        { slug: { startsWith: 'fortnite-vbucks-' } },
        { slug: { startsWith: 'rocket-league-item-' } },
      ],
    },
    data: { status: 'INACTIVE' },
  });

  for (const item of massiveCatalogSeed) {
    const category = await prisma.category.findUnique({ where: { slug: item.categorySlug } });
    if (!category) throw new Error(`Missing catalog category: ${item.categorySlug}`);

    const currentPrice = Number(Math.max(1, item.faceValue * 0.95).toFixed(2));
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { name: item.name, currentPrice, originalPrice: item.faceValue, status: 'ACTIVE', categoryId: category.id, sellerId },
      create: {
        slug: item.slug,
        name: item.name,
        description: `${item.name} with one unique code and instant secure delivery.`,
        brand: item.brand,
        categoryId: category.id,
        sellerId,
        originalPrice: item.faceValue,
        currentPrice,
        currency: 'USD',
        deliveryType: 'INSTANT',
        status: 'ACTIVE',
        tags: ['gaming', item.brand.toLowerCase(), 'single-use'],
        images: { create: { url: item.imageUrl, altText: item.name } },
      },
    });
    const encrypted = encryptCode(mockCode(item));
    await prisma.productInventory.upsert({
      where: { codeHash: encrypted.codeHash },
      update: { productId: product.id, isDelivered: false, deliveredAt: null, orderId: null },
      create: { productId: product.id, ...encrypted },
    });
  }
}
