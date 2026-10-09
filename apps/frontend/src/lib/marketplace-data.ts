export type MarketplaceCategorySlug = 'gift-cards' | 'gaming' | 'streaming' | 'software' | 'mobile-top-up' | 'steam-keys' | 'pubg-mobile' | 'free-fire' | 'roblox' | 'fortnite' | 'rocket-league';

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: MarketplaceCategorySlug;
  icon: string;
  description: string;
}

export interface MarketplaceSeller {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  verified: boolean;
  memberSince: string;
  responseTime: string;
  sales: number;
  rating: number;
  feedback: number;
  reviewCount: number;
  description: string;
  products: string[];
}

export interface MarketplaceReview {
  buyer: string;
  rating: number;
  comment: string;
  date: string;
}

export interface MarketplaceProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryId: MarketplaceCategorySlug;
  description: string;
  currentPrice: number;
  originalPrice: number;
  currency: string;
  stock: number;
  deliveryType: 'INSTANT' | 'MANUAL';
  status: 'ACTIVE' | 'DRAFT' | 'SUSPENDED';
  sellerId: string;
  images: { id: string; url: string; isPrimary: boolean }[];
  seller?: {
    id: string;
    shopName: string;
    isVerified: boolean;
    rating: number;
    avatarUrl?: string;
  };
  rating: number;
  reviewCount: number;
  region: string;
}

export const marketplaceCategories: MarketplaceCategory[] = [
  { id: 'gift-cards', name: 'Gift Cards', slug: 'gift-cards', icon: '🎁', description: 'Digital gift cards for shopping, entertainment, and subscriptions.' },
  { id: 'gaming', name: 'Gaming', slug: 'gaming', icon: '🎮', description: 'Game credits, top-ups, and digital in-game currencies.' },
  { id: 'steam-keys', name: 'Steam Keys', slug: 'steam-keys', icon: '🕹️', description: 'Steam game keys and downloadable PC titles.' },
  { id: 'pubg-mobile', name: 'PUBG Mobile UC', slug: 'pubg-mobile', icon: '🎯', description: 'PUBG Mobile UC top-ups and digital credits.' },
  { id: 'free-fire', name: 'Free Fire Diamonds', slug: 'free-fire', icon: '💎', description: 'Free Fire diamond top-ups.' },
  { id: 'roblox', name: 'Roblox Robux', slug: 'roblox', icon: '🧱', description: 'Roblox Robux and digital items.' },
  { id: 'fortnite', name: 'Fortnite V-Bucks', slug: 'fortnite', icon: '⚡', description: 'Fortnite V-Bucks and digital items.' },
  { id: 'rocket-league', name: 'Rocket League', slug: 'rocket-league', icon: '🚗', description: 'Rocket League items and credits.' },
  { id: 'streaming', name: 'Streaming', slug: 'streaming', icon: '📺', description: 'Supercharge your streaming and entertainment subscriptions.' },
  { id: 'software', name: 'Software', slug: 'software', icon: '💻', description: 'Software, licenses, and premium digital tools.' },
  { id: 'mobile-top-up', name: 'Mobile Top-Up', slug: 'mobile-top-up', icon: '📱', description: 'Instant mobile balance top-ups and prepaid credits.' },
];

export const marketplaceSellers: MarketplaceSeller[] = [
  {
    id: 'vaultmarket-official',
    username: 'vaultmarket-official',
    displayName: 'VaultMarket Official',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    verified: true,
    memberSince: '2021-04-18',
    responseTime: '8 min',
    sales: 15430,
    rating: 4.9,
    feedback: 99,
    reviewCount: 890,
    description: 'Official VaultMarket partner specializing in premium digital gift cards, instant delivery, and buyer protection across global brands.',
    products: ['google-play-100', 'apple-itunes-100', 'amazon-100', 'playstation-100', 'steam-100', 'netflix-100', 'spotify-30'],
  },
  {
    id: 'pixelreel-exchange',
    username: 'pixelreel-exchange',
    displayName: 'PixelReel Exchange',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    verified: true,
    memberSince: '2022-09-07',
    responseTime: '12 min',
    sales: 9830,
    rating: 4.8,
    feedback: 98,
    reviewCount: 620,
    description: 'Trusted wallet and premium digital storefront for gaming credits, streaming gift cards, and mobile top-ups with rapid fulfillment.',
    products: ['xbox-100', 'razer-gold-100', 'roblox-100', 'fortnite-100', 'valorant-100', 'twitch-25'],
  },
  {
    id: 'northstar-wallet',
    username: 'northstar-wallet',
    displayName: 'NorthStar Wallet',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80',
    verified: true,
    memberSince: '2020-11-15',
    responseTime: '15 min',
    sales: 12890,
    rating: 4.9,
    feedback: 100,
    reviewCount: 760,
    description: 'Global digital wallet provider offering shopping, software, and entertainment cards with dependable stock and verification.',
    products: ['nintendo-50', 'spotify-30', 'netflix-50', 'apple-itunes-50', 'youtube-premium-30', 'uber-25'],
  },
  {
    id: 'playdome-goods',
    username: 'playdome-goods',
    displayName: 'PlayDome Goods',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    verified: true,
    memberSince: '2023-02-03',
    responseTime: '20 min',
    sales: 6120,
    rating: 4.7,
    feedback: 97,
    reviewCount: 430,
    description: 'Focused on gaming credits, subscriptions, and instant delivery for active community players and digital gift card buyers worldwide.',
    products: ['pubg-uc', 'mobile-legends-100', 'razer-gold-50', 'steam-50', 'netflix-25', 'discord-nitro-12'],
  },
];

export const marketplaceReviews: MarketplaceReview[] = [
  { buyer: 'A. Rahman', rating: 5, comment: 'Fast delivery! Code worked perfectly and landed within minutes.', date: '2026-08-14' },
  { buyer: 'N. Patel', rating: 5, comment: 'Smooth transaction and the seller responded quickly. Highly recommended!', date: '2026-08-11' },
  { buyer: 'M. Silva', rating: 5, comment: 'Code works perfectly, thanks! The order was exactly as described.', date: '2026-08-09' },
  { buyer: 'K. Kim', rating: 5, comment: 'Excellent communication and instant redemption. Will buy again.', date: '2026-08-02' },
  { buyer: 'D. Thompson', rating: 4, comment: 'Everything arrived fast, good value, and no issues with redemption.', date: '2026-07-28' },
];

const sellerMap = Object.fromEntries(marketplaceSellers.map((seller) => [seller.id, seller]));

export const generateSellerDirectory = (count: number = 500) =>
  Array.from({ length: count }, (_, index) => {
    const base = marketplaceSellers[index % marketplaceSellers.length];
    const generatedIndex = index + 1;
    const username = `seller-${generatedIndex.toString().padStart(3, '0')}`;

    return {
      id: `seller-${generatedIndex}`,
      username,
      displayName: `${base.displayName.split(' ')[0]} ${generatedIndex}`,
      avatar: base.avatar,
      verified: index % 4 !== 0,
      memberSince: '2022-01-15',
      responseTime: `${(index % 12) + 4} min`,
      sales: 1200 + index * 23,
      rating: Number((4.5 + (index % 5) * 0.1).toFixed(1)),
      feedback: 96 + (index % 4),
      reviewCount: 200 + index * 12,
      description: 'High-volume P2P marketplace seller with fast digital delivery and strong buyer trust.',
      products: [`listing-${index + 1}`, `listing-${index + 2}`],
    } satisfies MarketplaceSeller;
  });

export const marketplaceSellerDirectory = [...marketplaceSellers, ...generateSellerDirectory(500)];

const withSeller = (product: Omit<MarketplaceProduct, 'seller'>): MarketplaceProduct => ({
  ...product,
  seller: {
    id: product.sellerId,
    shopName: sellerMap[product.sellerId]?.displayName ?? 'VaultMarket Official',
    isVerified: sellerMap[product.sellerId]?.verified ?? true,
    rating: sellerMap[product.sellerId]?.rating ?? 4.9,
    avatarUrl: sellerMap[product.sellerId]?.avatar,
  },
});

const fallbackGamingImage = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80';

const giftCardVariants = [
  { brand: 'Google Play', slug: 'google-play', values: [5, 10, 15, 25, 50, 100], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/34a853/ffffff?text=Google+Play' },
  { brand: 'Apple iTunes', slug: 'apple-itunes', values: [5, 10, 15, 25, 50, 100], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/1687d9/ffffff?text=App+Store+%26+iTunes' },
  { brand: 'Amazon', slug: 'amazon', values: [5, 10, 25, 50, 75, 100], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/171717/ffffff?text=Amazon' },
  { brand: 'PlayStation Store', slug: 'playstation', values: [10, 25, 50, 75, 100], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/0070cc/ffffff?text=PlayStation+Store' },
  { brand: 'Xbox', slug: 'xbox', values: [10, 25, 50, 75, 100], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/107c10/ffffff?text=XBOX' },
  { brand: 'Nintendo eShop', slug: 'nintendo', values: [10, 20, 35, 50, 99], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/e60012/ffffff?text=Nintendo' },
  { brand: 'Razer Gold', slug: 'razer-gold', values: [10, 20, 50, 100], categoryId: 'gaming', image: 'https://placehold.co/640x400/111111/44d62c?text=Razer+Gold' },
  { brand: 'Starbucks', slug: 'starbucks', values: [10, 25, 50, 100], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/00704a/ffffff?text=Starbucks' },
  { brand: "Dunkin' Donuts", slug: 'dunkin-donuts', values: [10, 25, 50, 100], categoryId: 'gift-cards', image: 'https://placehold.co/640x400/ff671f/ffffff?text=Dunkin' },
].flatMap((brand) =>
  brand.values.map((value) =>
    withSeller({
      id: `${brand.slug}-${value}`,
      slug: `${brand.slug}-${value}`,
      name: `${brand.brand} $${value} Gift Card`,
      brand: brand.brand,
      categoryId: brand.categoryId as MarketplaceCategorySlug,
      description: `${brand.brand} digital gift card delivered securely worldwide.`,
      currentPrice: Number((value * 0.98).toFixed(2)),
      originalPrice: value,
      currency: 'USD',
      stock: 1,
      deliveryType: 'INSTANT',
      status: 'ACTIVE',
      sellerId: brand.brand === 'Razer Gold' || brand.brand === 'Xbox' ? 'pixelreel-exchange' : 'vaultmarket-official',
      images: [{ id: `${brand.slug}-${value}-image`, url: brand.image, isPrimary: true }],
      rating: 4.8,
      reviewCount: 240 + value,
      region: 'Global',
    }),
  ),
);

const gamingCatalogVariants = [
  { brand: 'PUBG Mobile', categoryId: 'gaming', packages: [[60, 'PUBG Mobile 60 UC'], [325, 'PUBG Mobile 325 UC'], [660, 'PUBG Mobile 660 UC'], [1800, 'PUBG Mobile 1800 UC'], [3850, 'PUBG Mobile 3850 UC']] },
  { brand: 'Free Fire', categoryId: 'gaming', packages: [[100, 'Free Fire 100 Diamonds'], [310, 'Free Fire 310 Diamonds'], [520, 'Free Fire 520 Diamonds'], [1060, 'Free Fire 1060 Diamonds'], [2180, 'Free Fire 2180 Diamonds']] },
  { brand: 'Roblox', categoryId: 'gaming', packages: [[400, 'Roblox 400 Robux'], [800, 'Roblox 800 Robux'], [1700, 'Roblox 1700 Robux'], [2000, 'Roblox 2000 Robux'], [4500, 'Roblox 4500 Robux'], [10000, 'Roblox 10000 Robux']] },
  { brand: 'Steam', categoryId: 'software', packages: [[10, 'Steam $10 Wallet Code'], [20, 'Steam $20 Wallet Code'], [30, 'Steam $30 Wallet Code'], [50, 'Steam $50 Wallet Code'], [60, 'Steam $60 Wallet Code']] },
  { brand: 'Fortnite', categoryId: 'gaming', packages: [[1000, 'Fortnite 1000 V-Bucks'], [2800, 'Fortnite 2800 V-Bucks'], [5000, 'Fortnite 5000 V-Bucks'], [13500, 'Fortnite 13500 V-Bucks']] },
  { brand: 'Rocket League', categoryId: 'gaming', packages: [[5, 'Rocket League 500 Credits'], [10, 'Rocket League 1100 Credits'], [20, 'Rocket League 3000 Credits'], [50, 'Rocket League Starter Pack']] },
].flatMap((family) =>
  family.packages.map(([value, name]) => {
    const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return withSeller({
      id: slug,
      slug,
      name: String(name),
      brand: family.brand,
      categoryId: family.categoryId as MarketplaceCategorySlug,
      description: `${family.brand} digital item with a unique instant-delivery code.`,
      currentPrice: Number(Math.max(1, Number(value) * 0.95).toFixed(2)),
      originalPrice: Number(value),
      currency: 'USD',
      stock: 1,
      deliveryType: 'INSTANT',
      status: 'ACTIVE',
      sellerId: 'vaultmarket-official',
      images: [{ id: `${slug}-image`, url: fallbackGamingImage, isPrimary: true }],
      rating: 4.8,
      reviewCount: 180,
      region: 'Global',
    });
  }),
);

export const marketplaceProducts: MarketplaceProduct[] = [
  withSeller({ id: 'netflix-100', slug: 'netflix-100', name: 'Netflix Gift Card', brand: 'Netflix', categoryId: 'streaming', description: 'Use for monthly plans, premium streaming, and entertainment subscriptions.', currentPrice: 98, originalPrice: 100, currency: 'USD', stock: 210, deliveryType: 'INSTANT', status: 'ACTIVE', sellerId: 'vaultmarket-official', images: [{ id: 'nf1', url: fallbackGamingImage, isPrimary: true }], rating: 4.9, reviewCount: 660, region: 'Global' }),
  withSeller({ id: 'spotify-30', slug: 'spotify-30', name: 'Spotify Premium Gift Card', brand: 'Spotify', categoryId: 'streaming', description: 'Enjoy premium music streaming and family plan upgrades without delays.', currentPrice: 28, originalPrice: 30, currency: 'USD', stock: 330, deliveryType: 'INSTANT', status: 'ACTIVE', sellerId: 'vaultmarket-official', images: [{ id: 'sp1', url: fallbackGamingImage, isPrimary: true }], rating: 4.8, reviewCount: 420, region: 'Global' }),
  withSeller({ id: 'twitch-25', slug: 'twitch-25', name: 'Twitch Gift Card', brand: 'Twitch', categoryId: 'streaming', description: 'Support creators and unlock channel subscriptions and digital goodies.', currentPrice: 23, originalPrice: 25, currency: 'USD', stock: 205, deliveryType: 'INSTANT', status: 'ACTIVE', sellerId: 'pixelreel-exchange', images: [{ id: 'tw1', url: fallbackGamingImage, isPrimary: true }], rating: 4.7, reviewCount: 250, region: 'Global' }),
  withSeller({ id: 'youtube-premium-30', slug: 'youtube-premium-30', name: 'YouTube Premium', brand: 'YouTube', categoryId: 'streaming', description: 'Enjoy ad-free viewing, background play, and offline downloads.', currentPrice: 28, originalPrice: 30, currency: 'USD', stock: 180, deliveryType: 'INSTANT', status: 'ACTIVE', sellerId: 'northstar-wallet', images: [{ id: 'yt1', url: fallbackGamingImage, isPrimary: true }], rating: 4.8, reviewCount: 360, region: 'Global' }),
  ...giftCardVariants,
  ...gamingCatalogVariants,
  withSeller({ id: 'adobe-creative-cloud', slug: 'adobe-creative-cloud', name: 'Adobe Creative Cloud', brand: 'Adobe', categoryId: 'software', description: 'Access creative tools, edit projects, and unlock premium design workflows.', currentPrice: 120, originalPrice: 150, currency: 'USD', stock: 90, deliveryType: 'MANUAL', status: 'ACTIVE', sellerId: 'northstar-wallet', images: [{ id: 'ad1', url: fallbackGamingImage, isPrimary: true }], rating: 4.7, reviewCount: 290, region: 'Global' }),
  withSeller({ id: 'discord-nitro-12', slug: 'discord-nitro-12', name: 'Discord Nitro', brand: 'Discord', categoryId: 'software', description: 'Upgrade your server perks, custom emojis, and premium chat features.', currentPrice: 11, originalPrice: 12, currency: 'USD', stock: 184, deliveryType: 'INSTANT', status: 'ACTIVE', sellerId: 'playdome-goods', images: [{ id: 'dc1', url: fallbackGamingImage, isPrimary: true }], rating: 4.8, reviewCount: 260, region: 'Global' }),
  withSeller({ id: 'uber-25', slug: 'uber-25', name: 'Uber Gift Card', brand: 'Uber', categoryId: 'mobile-top-up', description: 'Load rides, deliveries, and on-demand travels instantly with a digital voucher.', currentPrice: 22, originalPrice: 25, currency: 'USD', stock: 170, deliveryType: 'INSTANT', status: 'ACTIVE', sellerId: 'northstar-wallet', images: [{ id: 'ub1', url: fallbackGamingImage, isPrimary: true }], rating: 4.7, reviewCount: 230, region: 'Global' }),
  withSeller({ id: 'airtel-topup-20', slug: 'airtel-topup-20', name: 'Airtel Mobile Top-Up', brand: 'Airtel', categoryId: 'mobile-top-up', description: 'Instant mobile balance top-up for calls, data, and voice packages.', currentPrice: 18, originalPrice: 20, currency: 'USD', stock: 280, deliveryType: 'INSTANT', status: 'ACTIVE', sellerId: 'vaultmarket-official', images: [{ id: 'at1', url: fallbackGamingImage, isPrimary: true }], rating: 4.8, reviewCount: 200, region: 'Global' }),
];

export const adminDashboardData = {
  users: 13240,
  sellers: 486,
  kycApplications: 13,
  orders: 8142,
  disputes: 27,
};
