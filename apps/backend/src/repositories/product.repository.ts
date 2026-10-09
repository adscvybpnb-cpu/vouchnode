import { Prisma, PrismaClient, Product } from '@prisma/client';
import { prisma } from '../lib/prisma';

const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const legacyCountryNameAliases: Record<string, string[]> = {
  AG: ['Antigua and Barbuda'],
  BA: ['Bosnia and Herzegovina'],
  BL: ['Saint Barthélemy'],
  BQ: ['Bonaire, Sint Eustatius and Saba'],
  CD: ['Democratic Republic of the Congo'],
  CG: ['Congo'],
  CV: ['Cabo Verde'],
  GS: ['South Georgia and the South Sandwich Islands'],
  HK: ['Hong Kong'],
  HM: ['Heard Island and McDonald Islands'],
  KN: ['Saint Kitts and Nevis'],
  LC: ['Saint Lucia'],
  MF: ['Saint Martin'],
  MM: ['Myanmar'],
  MO: ['Macao'],
  PM: ['Saint Pierre and Miquelon'],
  PN: ['Pitcairn'],
  PS: ['Palestine'],
  SH: ['Saint Helena'],
  SJ: ['Svalbard and Jan Mayen'],
  ST: ['São Tomé and Príncipe'],
  TC: ['Turks and Caicos Islands'],
  TT: ['Trinidad and Tobago'],
  UM: ['United States Minor Outlying Islands'],
  VC: ['Saint Vincent and the Grenadines'],
  VG: ['Virgin Islands (British)'],
  VI: ['Virgin Islands (U.S.)'],
  WF: ['Wallis and Futuna'],
  XK: ['Kosovo'],
};

function countryRegionValues(code: string) {
  const countryName = code === 'XK' ? 'Kosovo' : countryDisplayNames.of(code);
  return [...new Set([code, countryName, ...(legacyCountryNameAliases[code] ?? [])].filter((value): value is string => Boolean(value)))];
}

export interface ProductFiltersInput {
  search?: string;
  categoryId?: string;
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  deliveryType?: 'INSTANT' | 'MANUAL';
  status?: 'ACTIVE' | 'HIDDEN' | 'INACTIVE' | 'PENDING_REVIEW' | 'REJECTED' | 'SOLD' | 'SOLD_OUT';
  hasDiscount?: boolean;
  minRating?: number;
  verifiedSeller?: boolean;
  tags?: string[];
  regionCode?: string;
  region?: string;
  currency?: string;
  includeAllStatuses?: boolean;
  publicOnly?: boolean;
}

export interface PaginationInput {
  page: number;
  limit: number;
  sortBy: 'price' | 'rating' | 'createdAt' | 'soldCount' | 'relevance';
  sortOrder: 'asc' | 'desc';
}

export class ProductRepository {
  private static readonly publicSellerSelect = {
    id: true,
    userId: true,
    shopName: true,
    shopSlug: true,
    status: true,
    verificationLevel: true,
    avgRating: true,
    reviewCount: true,
    user: {
      select: {
        isOnline: true,
        onlineUntil: true,
        profile: { select: { displayName: true, username: true, avatarUrl: true } },
      },
    },
  } satisfies Prisma.SellerSelect;

  private static publicAvailabilityWhere(): Prisma.ProductWhereInput {
    const soldOutCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return {
      seller: {
        status: 'ACTIVE',
        user: { status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } },
      },
      AND: [
        {
          OR: [
            { status: 'ACTIVE', stock: { gt: 0 } },
            {
              status: 'SOLD_OUT',
              stock: 0,
              updatedAt: { gte: soldOutCutoff },
            },
          ],
        },
        {
          OR: [
            { deliveryType: { not: 'INSTANT' } },
            { inventory: { some: { isDelivered: false, orderId: null } } },
          ],
        },
      ],
    };
  }

  static async findMany(filters: ProductFiltersInput, pagination: PaginationInput) {
    const skip = (pagination.page - 1) * pagination.limit;
    
    let where: Prisma.ProductWhereInput = {};
    
    if (!filters.publicOnly) {
      if (filters.status) where.status = filters.status;
      else if (!filters.includeAllStatuses) where.status = 'ACTIVE';
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.sellerId) where.sellerId = filters.sellerId;
    if (filters.deliveryType) where.deliveryType = filters.deliveryType;
    const region = filters.region?.trim().toUpperCase();
    if (region === 'GLOBAL') {
      where.regionCode = null;
    } else if (region === 'EUROPE') {
      const europeanCodes = ['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA'];
      where.regionCode = { in: europeanCodes.flatMap(countryRegionValues) };
    } else if (region) {
      where.regionCode = { in: countryRegionValues(region) };
    } else if (filters.regionCode) {
      where.regionCode = filters.regionCode;
    }
    if (filters.currency) where.currency = filters.currency;
    if (filters.tags && filters.tags.length > 0) where.tags = { hasSome: filters.tags };
    if (!filters.status || filters.status === 'ACTIVE') {
      where.OR = [
        { deliveryType: { not: 'INSTANT' } },
        { inventory: { some: { isDelivered: false, orderId: null } } },
      ];
    }
    if (filters.hasDiscount) where.discountPercent = { gt: 0 };
    if (filters.minRating !== undefined) where.avgRating = { gte: filters.minRating };
    if (filters.verifiedSeller) where.seller = { verificationLevel: { gte: 1 } };
    
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.currentPrice = {};
      if (filters.minPrice !== undefined) where.currentPrice.gte = filters.minPrice;
      if (filters.maxPrice !== undefined) where.currentPrice.lte = filters.maxPrice;
    }

    if (filters.search) {
      const searchConditions: Prisma.ProductWhereInput[] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { category: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: searchConditions }];
    }
    if (filters.publicOnly) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        this.publicAvailabilityWhere(),
      ];
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = {};
    switch (pagination.sortBy) {
      case 'price': orderBy = { currentPrice: pagination.sortOrder }; break;
      case 'rating': orderBy = { avgRating: pagination.sortOrder }; break;
      case 'soldCount': orderBy = { totalSold: pagination.sortOrder }; break;
      case 'relevance':
        orderBy = [{ totalSold: 'desc' }, { avgRating: 'desc' }, { createdAt: 'desc' }];
        break;
      case 'createdAt': 
      default:
        orderBy = { createdAt: pagination.sortOrder }; 
        break;
    }

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy,
        include: {
          images: true,
          category: true,
          ...(!filters.publicOnly && {
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                id: true,
                status: true,
                paymentStatus: true,
                deliveryStatus: true,
                createdAt: true,
                totalAmount: true,
                currency: true,
                transaction: true,
              },
            },
          }),
          seller: { select: this.publicSellerSelect },
        }
      }),
      prisma.product.count({ where })
    ]);

    return { data, total };
  }

  static async findBySlug(slug: string) {
    return prisma.product.findUnique({
      where: { slug },
      include: {
        images: true,
        category: true,
        seller: {
          include: {
            user: {
              select: {
                isOnline: true,
                onlineUntil: true,
                profile: { select: { username: true, displayName: true, avatarUrl: true } },
              },
            },
          },
        },
      }
    });
  }

  static async findAdminMany(page: number, limit: number, search?: string, status?: string) {
    const where: Prisma.ProductWhereInput = {};
    if (status) where.status = status as Prisma.ProductWhereInput['status'];
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          images: true,
          category: true,
          inventory: { select: { id: true, isDelivered: true } },
          seller: { select: { id: true, userId: true, shopName: true, shopSlug: true, user: { select: { profile: { select: { username: true, displayName: true } } } } } },
        },
      }),
      prisma.product.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  static async findById(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: {
        images: true,
        category: true,
        seller: { include: { user: { select: { isOnline: true, onlineUntil: true } } } },
      }
    });
  }

  private static async resolveRegionCode(regionCode?: string | null): Promise<string | undefined> {
    const value = regionCode?.trim();
    if (!value || value.toLowerCase() === 'global' || value.toLowerCase() === 'global / worldwide') {
      return undefined;
    }

    const normalizedCode = value.length === 2 ? value.toUpperCase() : undefined;
    const country = await prisma.country.findFirst({
      where: normalizedCode
        ? { code: normalizedCode }
        : { name: { equals: value, mode: 'insensitive' } },
      select: { code: true },
    });

    return country?.code;
  }

  static async create(data: Prisma.ProductUncheckedCreateInput) {
    const regionCode = await this.resolveRegionCode(data.regionCode);
    return prisma.product.create({
      data: {
        ...data,
        regionCode,
      },
    });
  }

  static async update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data });
  }

  static async delete(id: string) {
    await prisma.product.delete({ where: { id } });
  }

  static async incrementViewCount(id: string) {
    await prisma.product.update({
      where: { id },
      data: { viewCount: { increment: 1 } }
    });
  }

  static async updateRating(productId: string) {
    const agg = await prisma.review.aggregate({
      where: { productId, isVisible: true },
      _avg: { rating: true },
      _count: { id: true }
    });
    
    await prisma.product.update({
      where: { id: productId },
      data: { 
        avgRating: agg._avg.rating || 0,
        reviewCount: agg._count.id
      }
    });
  }

  static async getFeatured(limit: number = 10) {
    return prisma.product.findMany({
      where: { isFeatured: true, AND: [this.publicAvailabilityWhere()] },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { images: true, seller: { select: this.publicSellerSelect } }
    });
  }

  static async getTrending(limit: number = 10) {
    return prisma.product.findMany({
      where: { AND: [this.publicAvailabilityWhere()] },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { images: true, seller: { select: this.publicSellerSelect } }
    });
  }

  static async getBestSellers(limit: number = 10) {
    return prisma.product.findMany({
      where: { AND: [this.publicAvailabilityWhere()] },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { images: true, seller: { select: this.publicSellerSelect } }
    });
  }

  static async getNewArrivals(limit: number = 10) {
    return prisma.product.findMany({
      where: { AND: [this.publicAvailabilityWhere(), { status: 'ACTIVE' }] },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { images: true, category: true, seller: { select: this.publicSellerSelect } }
    });
  }

  static async getInstantDelivery(limit: number = 10) {
    return prisma.product.findMany({
      where: { deliveryType: 'INSTANT', AND: [this.publicAvailabilityWhere()] },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { images: true, seller: { select: this.publicSellerSelect } }
    });
  }

  static async getRelated(
    product: {
      id: string;
      name: string;
    },
    limit: number = 22,
  ) {
    const products = await prisma.product.findMany({
      where: {
        id: { not: product.id },
        status: 'ACTIVE',
        stock: { gt: 0 },
        seller: {
          status: 'ACTIVE',
          user: { status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } },
        },
        name: { equals: product.name, mode: 'insensitive' },
        OR: [
          { deliveryType: { not: 'INSTANT' } },
          { inventory: { some: { isDelivered: false, orderId: null } } },
        ],
      },
      orderBy: [{ currentPrice: 'asc' }, { createdAt: 'asc' }],
      include: {
        images: true,
        seller: {
          select: {
            id: true,
            userId: true,
            shopName: true,
            shopSlug: true,
            logoUrl: true,
            status: true,
            avgRating: true,
            reviewCount: true,
            verificationLevel: true,
            user: { select: { profile: { select: { username: true, avatarUrl: true } } } },
          },
        },
      },
    });

    const offersBySeller = new Map<string, (typeof products)[number]>();
    for (const offer of products) {
      if (!offersBySeller.has(offer.sellerId)) {
        offersBySeller.set(offer.sellerId, offer);
      }
    }

    return Array.from(offersBySeller.values()).slice(0, Math.min(limit, 22));
  }

  static async getBySellerSlug(shopSlug: string, filters: ProductFiltersInput, pagination: PaginationInput) {
    const seller = await prisma.seller.findUnique({ where: { shopSlug } });
    if (!seller) return { data: [], total: 0 };
    return this.findMany({ ...filters, sellerId: seller.id }, pagination);
  }

  static async getBySellerUserId(userId: string, filters: ProductFiltersInput, pagination: PaginationInput) {
    const seller = await prisma.seller.findUnique({ where: { userId }, select: { id: true } });
    if (!seller) return { data: [], total: 0 };
    return this.findMany({ ...filters, sellerId: seller.id }, pagination);
  }
}
