'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gift,
  LockKeyhole,
  Plus,
  Repeat2,
  Search,
  ShieldCheck,
  WalletCards,
  Zap,
} from 'lucide-react';
import { productService } from '@/services/product.service';
import type { Product } from '@/types/api.types';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { MarketplaceFeatures } from '@/components/site/MarketplaceFeatures';
import { useRouter } from 'next/navigation';
import { getSellerStartPath } from '@/lib/seller-access';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/hooks/use-toast';

const categories = ['All', 'Gift Cards', 'Gaming', 'Crypto', 'Subscriptions'];
const categorySlugs: Record<string, string> = {
  'Gift Cards': 'gift-cards',
  Gaming: 'gaming',
  Subscriptions: 'streaming',
};

const services = [
  {
    title: 'Gift Card Marketplace',
    description: 'Use cryptocurrency to purchase instant delivery global gift cards.',
    icon: Gift,
    accent: 'from-emerald-400/20 to-cyan-400/5',
    iconClass: 'text-emerald-300',
    href: '/products?category=gift-cards',
  },
  {
    title: 'SnapX',
    description: 'Sell your gift cards in a snap with dynamic rates.',
    icon: Zap,
    accent: 'from-amber-400/20 to-orange-400/5',
    iconClass: 'text-amber-300',
    href: '/p2p-offers',
  },
  {
    title: 'Secure Wallet',
    description: 'Send and receive secure crypto assets protected by our non-custodial escrow.',
    icon: WalletCards,
    accent: 'from-violet-400/20 to-indigo-400/5',
    iconClass: 'text-violet-300',
    href: '/dashboard/wallet',
  },
  {
    title: 'P2P Swap',
    description: 'Instantly exchange your digital assets with low processing fees.',
    icon: Repeat2,
    accent: 'from-sky-400/20 to-blue-400/5',
    iconClass: 'text-sky-300',
    href: '/p2p-offers',
  },
];

const currencies = [
  { name: 'Bitcoin', symbol: 'BTC', color: 'F7931A', icon: 'btc.svg', value: '$67,248.24', change: '+3.42%' },
  { name: 'BNB', symbol: 'BNB', color: 'F3BA2F', icon: 'bnb.svg', value: '$591.18', change: '+1.86%' },
  { name: 'Ethereum', symbol: 'ETH', color: '627EEA', icon: 'eth.svg', value: '$3,482.60', change: '+2.18%' },
  { name: 'Bitcoin Cash', symbol: 'BCH', color: '0AC18E', icon: 'bch.svg', value: '$362.91', change: '+0.94%' },
  { name: 'Solana', symbol: 'SOL', color: '9945FF', icon: 'sol.svg', value: '$168.44', change: '+5.16%' },
  { name: 'Litecoin', symbol: 'LTC', color: '345D9D', icon: 'ltc.svg', value: '$72.84', change: '+1.22%' },
  { name: 'TRON', symbol: 'TRX', color: 'EF0027', icon: 'trx.svg', value: '$0.16', change: '+0.71%' },
  { name: 'Tether', symbol: 'USDT', color: '26A17B', icon: 'usdt.svg', value: '$1.00', change: '0.01%' },
  { name: 'USD Coin', symbol: 'USDC', color: '2775CA', icon: 'usdc-logo.svg', value: '$1.00', change: '0.00%' },
];

const topCategories = [
  {
    title: 'Game Items',
    description: 'Full items marketplace showcase.',
    detail: 'Skins · Coins · Collectibles',
    href: '/products?category=gaming',
    image: '/assets/marketplace/scene.svg',
    accent: 'from-violet-500/80 via-indigo-500/25 to-transparent',
  },
  {
    title: 'Gift Cards',
    description: 'PlayStation, Xbox, Steam, Amazon, iTunes.',
    detail: 'Global brands · Instant delivery',
    href: '/products?category=gift-cards',
    image: '/assets/marketplace/scene.svg',
    accent: 'from-emerald-500/80 via-cyan-500/25 to-transparent',
  },
  {
    title: 'Full Games',
    description: 'PC, Playstation, and Xbox keys.',
    detail: 'Verified keys · Secure checkout',
    href: '/products?category=gaming',
    image: '/assets/marketplace/scene.svg',
    accent: 'from-amber-500/80 via-orange-500/25 to-transparent',
  },
];

const popularGames = [
  { title: 'Fortnite', genre: 'Battle royale', image: '/assets/marketplace/scene.svg' },
  { title: 'Elden Ring', genre: 'Action RPG', image: '/assets/marketplace/scene.svg' },
  { title: 'Call of Duty', genre: 'Shooter', image: '/assets/marketplace/scene.svg' },
  { title: 'Monopoly Go', genre: 'Casual strategy', image: '/assets/marketplace/scene.svg' },
];

export default function HomePageContent({
  initialFeaturedProducts,
  initialDataReady,
}: {
  initialFeaturedProducts: Product[];
  initialDataReady: boolean;
}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { toast } = useToast();
  const [isStartingSellerFlow, setIsStartingSellerFlow] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [featuredProducts, setFeaturedProducts] = useState(initialFeaturedProducts);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const featuredRequestSequence = useRef(0);

  const refreshFeaturedProducts = useCallback(async () => {
    const requestSequence = ++featuredRequestSequence.current;
    try {
      const categorySlug = categorySlugs[activeCategory];
      const products = categorySlug
        ? (await productService.getProducts({
          category: categorySlug,
          limit: 48,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })).data
        : await productService.getNewArrivals(48);
      if (requestSequence === featuredRequestSequence.current) setFeaturedProducts(products);
    } catch (error) {
      console.error('Unable to refresh latest homepage listings:', error);
    }
  }, [activeCategory]);

  const categoryOptions = useMemo(() => {
    const facets = featuredProducts.flatMap((product) => [
      product.category?.name,
      product.brand,
    ]).filter((value): value is string => Boolean(value?.trim()));
    return [...categories, ...Array.from(new Set(facets)).filter((facet) =>
      !categories.some((category) => category.toLowerCase() === facet.toLowerCase()),
    )];
  }, [featuredProducts]);

  const visibleProducts = useMemo(() => {
    if (activeCategory === 'All') return featuredProducts;
    const target = activeCategory.trim().toLowerCase();
    return featuredProducts.filter((product) => {
      const categoryName = product.category?.name?.trim().toLowerCase() ?? '';
      const categorySlug = product.category?.slug?.trim().toLowerCase().replace(/-/g, ' ') ?? '';
      const brand = product.brand?.trim().toLowerCase() ?? '';
      const name = product.name.trim().toLowerCase();
      if (brand === target || categoryName === target || categorySlug === target || name.startsWith(target)) return true;
      if (target === 'gift cards') return categorySlug.includes('gift') || categoryName.includes('gift');
      if (target === 'gaming') return categorySlug.includes('gaming') || categoryName.includes('gaming');
      if (target === 'subscriptions') return categorySlug.includes('streaming') || categoryName.includes('subscription');
      return false;
    });
  }, [activeCategory, featuredProducts]);

  const handleStartSelling = async () => {
    if (isStartingSellerFlow) return;
    setIsStartingSellerFlow(true);
    try {
      router.push(await getSellerStartPath());
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to check seller status',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsStartingSellerFlow(false);
    }
  };

  useEffect(() => {
    void refreshFeaturedProducts();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshFeaturedProducts();
    }, 5_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshFeaturedProducts();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshFeaturedProducts]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || carouselPaused || visibleProducts.length < 2) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    const interval = window.setInterval(() => {
      const card = carousel.querySelector<HTMLElement>('[data-product-card]');
      if (!card) return;
      const distance = card.offsetWidth + 16;
      const atEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 8;
      carousel.scrollTo({ left: atEnd ? 0 : carousel.scrollLeft + distance, behavior: 'smooth' });
    }, 4_500);
    return () => window.clearInterval(interval);
  }, [carouselPaused, visibleProducts.length]);

  useEffect(() => {
    carouselRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [activeCategory]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#06080d] text-white">
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 rounded-[28px] border border-white/10 bg-[#0d1119]/90 p-4 shadow-2xl shadow-black/30 lg:flex-row lg:items-center lg:justify-between lg:p-5">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#080c13] px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              aria-label="Search marketplace"
              placeholder="Search gift cards, games, subscriptions..."
              className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
            />
          </div>
          <div translate="no" className="notranslate flex flex-wrap items-center gap-2">
            <Link href="/p2p-offers" prefetch={true} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/10 transition hover:-translate-y-0.5 hover:from-emerald-200 hover:to-cyan-200">
              <Zap className="h-4 w-4 fill-current" /> Quick P2P Exchange
            </Link>
            <Link href="/products?delivery=INSTANT" prefetch={true} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-indigo-400/40 hover:bg-indigo-500/10">
              <ArrowUpRight className="h-4 w-4 text-indigo-300" /> Instant Buy/Sell
            </Link>
          </div>
        </div>
        <div translate="no" className="notranslate mt-4 flex items-center gap-2 overflow-x-auto pb-1">
          {categoryOptions.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition ${activeCategory === category ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'}`}
            >
              {category}
            </button>
          ))}
          <span className="ml-auto hidden text-xs text-slate-600 sm:block">Curated for you · {activeCategory}</span>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[#0c1119]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.28),transparent_35%),radial-gradient(circle_at_30%_80%,rgba(16,185,129,0.12),transparent_35%)]" />
          <div className="absolute right-0 top-0 hidden h-full w-1/2 bg-[url('/assets/marketplace/scene.svg')] bg-cover bg-center opacity-25 mix-blend-screen sm:block" />
          <div className="relative grid min-h-[360px] items-center p-5 sm:min-h-[430px] sm:p-12 lg:p-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" /> The trusted digital asset layer
              </div>
              <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[0.98] tracking-[-0.05em] text-white sm:mt-6 sm:text-6xl lg:text-7xl">
                Move value.<br /><span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">Keep control.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                A premium marketplace for gift cards, gaming credits, subscriptions, and crypto exchanges — backed by transparent escrow.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/products" prefetch={true} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-100">
                  Explore marketplace <ArrowUpRight className="h-4 w-4" />
                </Link>
                <button type="button" onClick={() => void handleStartSelling()} disabled={isStartingSellerFlow} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-indigo-400/50 hover:bg-indigo-500/10 disabled:cursor-wait disabled:opacity-60">
                  <Plus className="h-4 w-4 text-indigo-300" /> {isStartingSellerFlow ? 'Checking seller status...' : 'Become a seller'}
                </button>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                    Earn up to 20% per purchase
                  </span>
                  <Link href="/referrals" className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/60 hover:bg-emerald-400/20">
                    <Gift className="h-4 w-4 text-emerald-300" /> Refer &amp; Earn <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">One account. Every rail.</p><h2 className="mt-2 text-3xl font-black tracking-tight">Everything you need to move digital value</h2></div>
          <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><LockKeyhole className="h-4 w-4" /> Non-custodial by design</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map(({ title, description, icon: Icon, accent, iconClass, href }) => (
            <Link key={title} href={href} className={`group rounded-3xl border border-white/10 bg-gradient-to-br ${accent} p-5 transition hover:-translate-y-1 hover:border-white/20`}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-black/20 ${iconClass}`}><Icon className="h-5 w-5" /></div>
              <h3 className="mt-6 text-lg font-bold">{title}</h3>
              <p className="mt-2 min-h-14 text-sm leading-6 text-slate-400">{description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-white">Learn more <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">Explore the marketplace</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Top Categories</h2>
          </div>
          <Link href="/products" className="hidden items-center gap-1 text-sm font-semibold text-slate-400 transition hover:text-white sm:flex">
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {topCategories.map((category) => (
            <Link
              key={category.title}
              href={category.href}
              className="group relative min-h-[280px] overflow-hidden rounded-3xl border border-white/10 bg-[#0c1119] transition hover:-translate-y-1 hover:border-white/25"
            >
              <img src={category.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-65 transition duration-500 group-hover:scale-105 group-hover:opacity-80" />
              <div className={`absolute inset-0 bg-gradient-to-t ${category.accent} via-[#090d14]/60 to-[#090d14]/10`} />
              <div className="relative flex h-full min-h-[280px] flex-col justify-end p-6">
                <span className="mb-3 w-fit rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200 backdrop-blur-sm">Category</span>
                <h3 className="text-2xl font-black tracking-tight text-white">{category.title}</h3>
                <p className="mt-2 text-sm font-medium text-slate-200">{category.description}</p>
                <p className="mt-1 text-xs text-slate-400">{category.detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">What players are buying</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Popular Games</h2>
          </div>
          <Link href="/products?category=gaming" className="hidden items-center gap-1 text-sm font-semibold text-slate-400 transition hover:text-white sm:flex">
            Browse games <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {popularGames.map((game) => (
            <Link
              key={game.title}
              href="/products?category=gaming"
              className="group relative aspect-[1.35] overflow-hidden rounded-2xl border border-white/10 bg-[#0c1119]"
            >
              <img src={game.image} alt={game.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105 group-hover:blur-[2px] group-hover:brightness-75" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-200">{game.genre}</p>
                <h3 className="mt-1 text-base font-black tracking-tight text-white sm:text-lg">{game.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Curated marketplace picks</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Just For You</h2>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/products" className="hidden items-center gap-1 text-sm font-semibold text-indigo-300 hover:text-indigo-200 sm:flex">View all listings <ArrowUpRight className="h-4 w-4" /></Link>
            <button type="button" aria-label="Previous products" onClick={() => carouselRef.current?.scrollBy({ left: -320, behavior: 'smooth' })} className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-indigo-400/50 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next products" onClick={() => carouselRef.current?.scrollBy({ left: 320, behavior: 'smooth' })} className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-indigo-400/50 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div
          ref={carouselRef}
          translate="no"
          onMouseEnter={() => setCarouselPaused(true)}
          onMouseLeave={() => setCarouselPaused(false)}
          onFocusCapture={() => setCarouselPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCarouselPaused(false);
          }}
          className="notranslate flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleProducts.map((product) => (
            <div key={product.id} data-product-card className="w-[min(84vw,360px)] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]">
              <ProductCard product={product} onBuyNow={(selectedProduct) => { window.location.href = `/products/${selectedProduct.slug}`; }} />
            </div>
          ))}
          {visibleProducts.length === 0 && <p className="w-full rounded-2xl border border-white/10 bg-[#0d121a] p-8 text-center text-sm text-slate-400">{initialDataReady ? `No active listings match ${activeCategory}. Choose another category to explore the latest products.` : 'Active listings are temporarily unavailable.'}</p>}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Supported assets</p><h2 className="mt-2 text-3xl font-black tracking-tight">Your portfolio, in one view</h2></div><Link href="/dashboard/wallet" className="hidden items-center gap-1 text-sm font-semibold text-indigo-300 hover:text-indigo-200 sm:flex">Open wallet <ArrowUpRight className="h-4 w-4" /></Link></div>
        <div translate="no" className="notranslate grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currencies.map((currency) => (
            <div key={currency.symbol} className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d121a] p-4 transition hover:border-white/20 hover:bg-white/[0.045]">
              <img
                src={`/icons/crypto/${currency.icon}`}
                alt={`${currency.name} logo`}
                className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.12)]"
              />
              <div className="min-w-0 flex-1"><p className="font-semibold">{currency.name}</p><p className="text-xs text-slate-500">{currency.symbol}</p></div>
            </div>
          ))}
        </div>
      </section>

      <MarketplaceFeatures />

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-400/50 bg-emerald-400/[0.06] p-5 shadow-[0_0_40px_rgba(16,185,129,0.08)] sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"><ShieldCheck className="h-6 w-6" /></div>
          <div><h2 className="font-bold text-white">Protected Escrow System</h2><p className="mt-1 text-sm leading-6 text-slate-300">Your funds are secure. Assets are safely locked until the transaction is verified and completed by the buyer.</p></div>
          <CheckCircle2 className="ml-auto hidden h-5 w-5 shrink-0 text-emerald-300 sm:block" />
        </div>
      </section>
    </main>
  );
}
