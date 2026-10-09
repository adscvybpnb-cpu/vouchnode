import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { giftCardSeed } from './gift-cards.seed';
import crypto from 'crypto';
import { config } from '../../src/config';
import { seedMassiveCatalog } from './catalog.seed';
import { massiveCatalogSeed } from './catalog.seed';
import { getEncryptionKey } from '../../src/lib/encryption';

export async function seedDemo(prisma: PrismaClient) {
  console.log('Seeding demo data...');
  // Ensure roles exist
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (!adminRole) return;

  const pw = await argon2.hash('Password123!');
  
  await prisma.user.upsert({
    where: { email: 'admin@vouchnode.com' },
    update: {},
    create: {
      email: 'admin@vouchnode.com',
      passwordHash: pw,
      roles: { create: { roleId: adminRole.id } },
      profile: { create: { username: 'admin', displayName: 'Admin' } }
    }
  });

  const sellerRole = await prisma.role.findUnique({ where: { name: 'SELLER' } });
  const sellerUser = await prisma.user.upsert({
    where: { email: 'vaultmarket@vouchnode.com' },
    update: {},
    create: {
      email: 'vaultmarket@vouchnode.com',
      passwordHash: pw,
      roles: sellerRole ? { create: { roleId: sellerRole.id } } : undefined,
      profile: {
        create: {
          username: 'vaultmarket-official',
          displayName: 'VaultMarket Official',
          avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=VaultMarket%20Official',
        },
      },
    },
  });

  const seller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    update: {
      status: 'ACTIVE',
      verificationLevel: 2,
      avgRating: 4.9,
      reviewCount: 890,
      completedSales: 890,
      positiveRatingPercentage: 99.8,
      logoUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=VaultMarket%20Official',
    },
    create: {
      userId: sellerUser.id,
      shopName: 'VaultMarket Official',
      shopSlug: 'vaultmarket-official',
      status: 'ACTIVE',
      verificationLevel: 2,
      avgRating: 4.9,
      reviewCount: 890,
      completedSales: 890,
      positiveRatingPercentage: 99.8,
      logoUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=VaultMarket%20Official',
    },
  });

  for (const product of giftCardSeed) {
    const category = await prisma.category.findUnique({ where: { slug: product.categorySlug } });
    if (!category) throw new Error(`Missing seed category: ${product.categorySlug}`);

    const seededProduct = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        brand: product.brand,
        originalPrice: product.value,
        currentPrice: product.currentPrice,
        avgRating: product.rating,
        reviewCount: product.reviewCount,
        status: 'ACTIVE',
        sellerId: seller.id,
        categoryId: category.id,
      },
      create: {
        slug: product.slug,
        name: product.name,
        description: `${product.brand} digital gift card worth $${product.value.toFixed(2)} USD, delivered securely worldwide.`,
        brand: product.brand,
        categoryId: category.id,
        sellerId: seller.id,
        originalPrice: product.value,
        currentPrice: product.currentPrice,
        discountPercent: Number((((product.value - product.currentPrice) / product.value) * 100).toFixed(2)),
        currency: 'USD',
        deliveryType: 'INSTANT',
        status: 'ACTIVE',
        avgRating: product.rating,
        reviewCount: product.reviewCount,
        tags: ['gift-card', product.brand.toLowerCase(), 'global'],
        images: { create: { url: product.imageUrl, altText: product.name } },
      },
    });
    const codeToken = crypto.createHash('sha256').update(product.slug).digest('hex').slice(0, 8).toUpperCase();
    const code = `${product.codePrefix}-${codeToken.slice(0, 4)}-${codeToken.slice(4)}`;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(config.security.encryptionKey), iv);
    const encryptedContent = `${cipher.update(code, 'utf8', 'hex')}${cipher.final('hex')}`;
    await prisma.productInventory.upsert({
      where: { codeHash: crypto.createHash('sha256').update(code).digest('hex') },
      update: { productId: seededProduct.id, isDelivered: false, deliveredAt: null, orderId: null },
      create: {
        productId: seededProduct.id,
        codeHash: crypto.createHash('sha256').update(code).digest('hex'),
        encryptedContent: `${iv.toString('hex')}:${encryptedContent}:${cipher.getAuthTag().toString('hex')}`,
      },
    });
  }

  await seedMassiveCatalog(prisma, seller.id);

  const alternateSellers = await Promise.all([
    createAlternateSeller(prisma, sellerRole, 'orbit-digital@vouchnode.com', 'Orbit Digital', 'orbit-digital'),
    createAlternateSeller(prisma, sellerRole, 'pixelvault@vouchnode.com', 'PixelVault Exchange', 'pixelvault-exchange'),
  ]);
  await prisma.seller.updateMany({
    where: { status: 'ACTIVE' },
    data: {
      completedSales: 150,
      positiveRatingPercentage: 99,
    },
  });
  const offerItems = [
    ...giftCardSeed.map((item) => ({
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      categorySlug: item.categorySlug,
      faceValue: item.value,
      currentPrice: item.currentPrice,
      codePrefix: item.codePrefix,
      imageUrl: item.imageUrl,
    })),
    ...massiveCatalogSeed.map((item) => ({
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      categorySlug: item.categorySlug,
      faceValue: item.faceValue,
      currentPrice: Number(Math.max(1, item.faceValue * 0.97).toFixed(2)),
      codePrefix: item.codePrefix,
      imageUrl: item.imageUrl,
    })),
  ];

  for (const alternateSeller of alternateSellers) {
    for (const item of offerItems) {
      const category = await prisma.category.findUnique({ where: { slug: item.categorySlug } });
      if (!category) continue;
      const slug = `${item.slug}-${alternateSeller.shopSlug}`;
      const product = await prisma.product.upsert({
        where: { slug },
        update: {
          currentPrice: item.currentPrice,
          status: 'ACTIVE',
          sellerId: alternateSeller.id,
          categoryId: category.id,
        },
        create: {
          slug,
          name: item.name,
          description: `${item.name} from ${alternateSeller.shopName}, with instant secure delivery.`,
          brand: item.brand,
          categoryId: category.id,
          sellerId: alternateSeller.id,
          originalPrice: item.faceValue,
          currentPrice: item.currentPrice,
          currency: 'USD',
          deliveryType: 'INSTANT',
          status: 'ACTIVE',
          avgRating: alternateSeller.shopSlug === 'orbit-digital' ? 4.8 : 4.7,
          reviewCount: 340,
          tags: ['instant', 'single-use', item.brand.toLowerCase()],
          images: { create: { url: item.imageUrl, altText: item.name } },
        },
      });
      const code = `${item.codePrefix}-${alternateSeller.shopSlug.slice(0, 4).toUpperCase()}-${crypto.createHash('sha256').update(slug).digest('hex').slice(0, 8).toUpperCase()}`;
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(config.security.encryptionKey), iv);
      const encryptedContent = `${cipher.update(code, 'utf8', 'hex')}${cipher.final('hex')}`;
      await prisma.productInventory.upsert({
        where: { codeHash: crypto.createHash('sha256').update(code).digest('hex') },
        update: { productId: product.id, isDelivered: false, deliveredAt: null, orderId: null },
        create: {
          productId: product.id,
          codeHash: crypto.createHash('sha256').update(code).digest('hex'),
          encryptedContent: `${iv.toString('hex')}:${encryptedContent}:${cipher.getAuthTag().toString('hex')}`,
        },
      });
    }
  }

  await seedSellerReviews(prisma, [seller, ...alternateSellers], pw);
}

async function seedSellerReviews(prisma: PrismaClient, sellers: Array<{ id: string }>, passwordHash: string) {
  const reviewTexts = [
    'Fast delivery and the code worked immediately.',
    'Code works perfectly, thanks!',
    'Highly recommended vendor.',
    'Great price and instant delivery.',
    'Everything matched the listing perfectly.',
    'Reliable seller, I will buy again.',
  ];

  for (const seller of sellers) {
    const sellerRecord = await prisma.seller.findUnique({ where: { id: seller.id }, select: { userId: true, shopSlug: true, completedSales: true } });
    if (!sellerRecord) continue;
    const reviewTotal = Math.max(60, Math.round(sellerRecord.completedSales * 0.4));
    const products = await prisma.product.findMany({
      where: { sellerId: seller.id, status: 'ACTIVE' },
      select: { id: true, currentPrice: true, currency: true },
      orderBy: { createdAt: 'asc' },
    });

    for (let index = 0; index < reviewTotal; index += 1) {
      const buyerNumber = `${sellerRecord.shopSlug}-${String(index + 1).padStart(3, '0')}`;
      const buyer = await prisma.user.upsert({
        where: { email: `${buyerNumber}@demo.vouchnode.com` },
        update: {},
        create: {
          email: `${buyerNumber}@demo.vouchnode.com`,
          passwordHash,
          profile: { create: { username: buyerNumber, displayName: `Buyer ${index + 1}` } },
        },
      });
      const product = products[index % products.length];
      if (!product) continue;
      const orderNumber = `GF-DEMO-${seller.id.slice(-6).toUpperCase()}-${index + 1}`;
      const order = await prisma.order.upsert({
        where: { orderNumber },
        update: { buyerId: buyer.id, status: 'COMPLETED', completedAt: new Date(Date.now() - (reviewTotal - index) * 86400000) },
        create: {
          orderNumber,
          buyerId: buyer.id,
          sellerId: sellerRecord.userId,
          productId: product.id,
          unitPrice: product.currentPrice,
          totalAmount: product.currentPrice,
          platformFee: 0,
          sellerAmount: product.currentPrice,
          currency: product.currency,
          status: 'COMPLETED',
          paymentStatus: 'COMPLETED',
          deliveryStatus: 'DELIVERED',
          completedAt: new Date(Date.now() - (reviewTotal - index) * 86400000),
        },
      });
      await prisma.review.upsert({
        where: { orderId: order.id },
        update: {
          buyerId: buyer.id,
          rating: index % 7 === 0 ? 4 : 5,
          content: reviewTexts[index % reviewTexts.length],
          createdAt: new Date(Date.now() - (reviewTotal - index) * 86400000),
        },
        create: {
          orderId: order.id,
          productId: product.id,
          buyerId: buyer.id,
          sellerId: sellerRecord.userId,
          rating: index % 7 === 0 ? 4 : 5,
          title: 'Verified purchase',
          content: reviewTexts[index % reviewTexts.length],
          createdAt: new Date(Date.now() - (reviewTotal - index) * 86400000),
        },
      });
    }
    const aggregate = await prisma.review.aggregate({ where: { sellerId: sellerRecord.userId }, _avg: { rating: true }, _count: { id: true } });
    const positive = await prisma.review.count({ where: { sellerId: sellerRecord.userId, rating: { gte: 4 } } });
    await prisma.seller.update({
      where: { id: seller.id },
      data: {
        reviewCount: aggregate._count.id,
        avgRating: aggregate._avg.rating || 0,
        positiveRatingPercentage: aggregate._count.id ? (positive / aggregate._count.id) * 100 : 0,
      },
    });
  }
}

async function createAlternateSeller(
  prisma: PrismaClient,
  sellerRole: { id: string } | null,
  email: string,
  shopName: string,
  shopSlug: string,
) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: 'seeded-alternate-seller',
      roles: sellerRole ? { create: { roleId: sellerRole.id } } : undefined,
      profile: {
        create: {
          username: shopSlug,
          displayName: shopName,
          avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(shopName)}`,
        },
      },
    },
  });
  return prisma.seller.upsert({
    where: { userId: user.id },
    update: {
      status: 'ACTIVE',
      verificationLevel: 2,
      logoUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(shopName)}`,
      avgRating: shopSlug === 'orbit-digital' ? 4.8 : 4.7,
      reviewCount: 340,
    },
    create: {
      userId: user.id,
      shopName,
      shopSlug,
      status: 'ACTIVE',
      verificationLevel: 2,
      logoUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(shopName)}`,
      avgRating: shopSlug === 'orbit-digital' ? 4.8 : 4.7,
      reviewCount: 340,
    },
  });
}
