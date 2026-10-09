import { ProductRepository, ProductFiltersInput, PaginationInput } from '../repositories/product.repository';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { getEncryptionKey } from '../lib/encryption';
import { config } from '../config';
import { DeliveryType } from '@vouchnode/shared';
import { Decimal } from '@prisma/client/runtime/library';

export class ProductService {
  static async getProducts(filters: ProductFiltersInput, pagination: PaginationInput, isAdmin: boolean = false) {
    if (!isAdmin && !filters.includeAllStatuses) {
      filters.publicOnly = true;
    }
    return ProductRepository.findMany(filters, pagination);
  }

  static async getProduct(slug: string, userId?: string) {
    const product = await ProductRepository.findBySlug(slug) ?? await ProductRepository.findById(slug);
    if (!product) throw new Error('Product not found');
    
    // Sold listings remain publicly viewable until the scheduled cleanup removes them.
    if (product.status !== 'ACTIVE' && product.status !== 'SOLD' && product.stock !== 0) {
      const isSeller = userId && product.seller.userId === userId;
      // Note: Admin check would happen via roles in a real flow, simplified here
      if (!isSeller) throw new Error('Product not found');
    }
    if (product.deliveryType === 'INSTANT' && product.status === 'ACTIVE') {
      const isSeller = userId && product.seller.userId === userId;
      if (!isSeller) {
        const availableInventory = await prisma.productInventory.count({
          where: { productId: product.id, isDelivered: false, orderId: null },
        });
        if (availableInventory === 0) throw new Error('Product not found');
      }
    }

    // Increment view async
    ProductRepository.incrementViewCount(product.id).catch(console.error);
    
    const offers = await ProductRepository.getRelated(product);

    return { ...product, offers };
  }

  static async createProduct(sellerUserId: string, data: any) {
    if (!Array.isArray(data.inventoryDetails) || data.inventoryDetails.length === 0 || data.inventoryDetails.some((code: unknown) => typeof code !== 'string' || !code.trim())) {
      throw new Error('You must add a digital code to list this product.');
    }
    const seller = await prisma.seller.findUnique({ where: { userId: sellerUserId } });
    if (!seller || seller.status !== 'ACTIVE') {
      throw new Error('Seller account is not active');
    }

    const originalPrice = parseFloat(data.originalPrice);
    const currentPrice = parseFloat(data.currentPrice);
    
    const discountPercent = originalPrice > currentPrice
      ? ((originalPrice - currentPrice) / originalPrice) * 100
      : 0;
    const slug = await this.generateSlug(data.name);
    const category = await prisma.category.findUnique({
      where: { slug: data.category },
      select: { id: true },
    });
    if (!category) throw new Error('Selected product category does not exist');
    const product = await ProductRepository.create({
      name: data.name,
      slug,
      description: data.description,
      categoryId: category.id,
      sellerId: seller.id,
      brand: data.brand,
      regionCode: data.region && data.region !== 'Global' ? data.region : undefined,
      originalPrice,
      currentPrice,
      stock: 0,
      discountPercent: new Decimal(discountPercent.toFixed(2)),
      deliveryType: data.deliveryType,
      status: 'ACTIVE',
      images: {
        create: data.images.map((url: string, index: number) => ({ url, sortOrder: index }))
      },
      tags: Array.isArray(data.tags) ? data.tags : []
    });
    if (Array.isArray(data.inventoryDetails) && data.inventoryDetails.length > 0) {
      await this.addInventory(product.id, sellerUserId, data.inventoryDetails);
    }
    return ProductRepository.findById(product.id);
  }

  static async updateProduct(id: string, sellerUserId: string, data: any) {
    const product = await ProductRepository.findById(id);
    if (!product) throw new Error('Product not found');
    if (['SOLD', 'SOLD_OUT', 'COMPLETED'].includes(String(product.status))) {
      throw new Error('Cannot edit a sold listing');
    }

    const seller = await prisma.seller.findUnique({ where: { userId: sellerUserId } });
    if (!seller || product.sellerId !== seller.id) throw new Error('Unauthorized');

    let discountPercent = product.discountPercent;
    let slug = product.slug;

    if (data.originalPrice !== undefined || data.currentPrice !== undefined) {
      const orig = parseFloat(data.originalPrice || product.originalPrice.toString());
      const curr = parseFloat(data.currentPrice || product.currentPrice.toString());
      discountPercent = new Decimal(
        (orig > curr ? ((orig - curr) / orig) * 100 : 0).toFixed(2)
      );
    }

    if (data.name && data.name !== product.name) {
      slug = await this.generateSlug(data.name);
    }

    await ProductRepository.update(id, {
      ...data,
      slug,
      discountPercent
    });
    return ProductRepository.findById(id);
  }

  static async updateProductStatus(id: string, sellerUserId: string, status: 'ACTIVE' | 'HIDDEN') {
    const product = await ProductRepository.findById(id);
    if (!product) throw new Error('Product not found');
    if (['SOLD', 'SOLD_OUT', 'COMPLETED'].includes(String(product.status))) {
      throw new Error('Cannot change the visibility of a sold listing');
    }

    const seller = await prisma.seller.findUnique({ where: { userId: sellerUserId } });
    if (!seller || product.sellerId !== seller.id) throw new Error('Unauthorized');

    await ProductRepository.update(id, { status });
    return ProductRepository.findById(id);
  }

  static async cloneProduct(id: string, sellerUserId: string, digitalCode: string) {
    if (!digitalCode.trim()) throw new Error('A new digital code is required to clone a listing');
    const product = await ProductRepository.findById(id);
    if (!product) throw new Error('Product not found');
    
    const seller = await prisma.seller.findUnique({ where: { userId: sellerUserId } });
    if (!seller || product.sellerId !== seller.id) throw new Error('Unauthorized');

    const slug = await this.generateSlug(`${product.name}-copy`);
    const clone = await prisma.$transaction(async (tx) => tx.product.create({
      data: {
        name: product.name,
        slug,
        description: product.description,
        categoryId: product.categoryId,
        sellerId: product.sellerId,
        brand: product.brand,
        regionCode: product.regionCode,
        originalPrice: product.originalPrice,
        currentPrice: product.currentPrice,
        discountPercent: product.discountPercent,
        currency: product.currency,
        deliveryType: product.deliveryType,
        status: 'HIDDEN',
        tags: product.tags,
        images: {
          create: product.images.map((image) => ({
            url: image.url,
            altText: image.altText,
            sortOrder: image.sortOrder,
          })),
        },
      },
      include: { images: true },
    }));
    await this.addInventory(clone.id, sellerUserId, [digitalCode.trim()]);
    return ProductRepository.findById(clone.id);
  }

  static async deleteProduct(id: string, sellerUserId: string) {
    const product = await ProductRepository.findById(id);
    if (!product) throw new Error('Product not found');
    if (['SOLD', 'SOLD_OUT', 'COMPLETED'].includes(String(product.status))) {
      throw new Error('Cannot delete a sold listing');
    }
    
    const seller = await prisma.seller.findUnique({ where: { userId: sellerUserId } });
    if (!seller || product.sellerId !== seller.id) throw new Error('Unauthorized');

    await prisma.$transaction(async (transaction) => {
      const activeOrders = await transaction.order.count({
        where: { productId: id, status: { notIn: ['COMPLETED', 'REFUNDED', 'CANCELLED', 'EXPIRED'] } },
      });

      if (activeOrders > 0) {
        throw new Error('Cannot delete product with active orders');
      }

      await transaction.product.delete({ where: { id } });
    });
  }

  static async addInventory(productId: string, sellerUserId: string, codes: string[]) {
    const product = await ProductRepository.findById(productId);
    if (!product) throw new Error('Product not found');
    if (['SOLD', 'SOLD_OUT', 'COMPLETED'].includes(String(product.status))) {
      throw new Error('Cannot edit a sold listing');
    }
    
    const seller = await prisma.seller.findUnique({ where: { userId: sellerUserId } });
    if (!seller || product.sellerId !== seller.id) throw new Error('Unauthorized');
    
    if (product.deliveryType !== DeliveryType.INSTANT) {
      throw new Error('Can only add inventory to INSTANT delivery products');
    }

    const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (uniqueCodes.length === 0) throw new Error('No valid codes provided');

    const key = getEncryptionKey(config.security.encryptionKey);
    
    const encryptedCodes = uniqueCodes.map(code => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(code, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      return {
        codeHash: crypto.createHash('sha256').update(code).digest('hex'),
        encryptedContent: `${iv.toString('hex')}:${encrypted}:${authTag}`,
      };
    });

    await prisma.productInventory.createMany({
      data: encryptedCodes.map(ec => ({
        productId,
        codeHash: ec.codeHash,
        encryptedContent: ec.encryptedContent,
      }))
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        stock: { increment: uniqueCodes.length },
        status: 'ACTIVE'
      }
    });
  }

  static async addInventoryAsAdmin(productId: string, codes: string[]) {
    const product = await ProductRepository.findById(productId);
    if (!product) throw new Error('Product not found');
    if (product.deliveryType !== DeliveryType.INSTANT) throw new Error('Only instant products accept unique codes');
    const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (uniqueCodes.length !== codes.length) throw new Error('Codes must be non-empty and unique');
    const rows = uniqueCodes.map((code) => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(config.security.encryptionKey), iv);
      const encrypted = `${cipher.update(code, 'utf8', 'hex')}${cipher.final('hex')}`;
      return {
        productId,
        codeHash: crypto.createHash('sha256').update(code).digest('hex'),
        encryptedContent: `${iv.toString('hex')}:${encrypted}:${cipher.getAuthTag().toString('hex')}`,
      };
    });
    await prisma.productInventory.createMany({ data: rows, skipDuplicates: true });
    await prisma.product.update({ where: { id: productId }, data: { stock: { increment: uniqueCodes.length }, status: 'ACTIVE' } });
    return { added: rows.length };
  }

  static async generateSlug(name: string): Promise<string> {
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = baseSlug;
    let counter = 1;
    
    while (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }
    
    return slug;
  }

  static async decrementStock(productId: string, quantity: number) {
    await prisma.product.updateMany({
      where: { id: productId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } }
    });
  }
}
