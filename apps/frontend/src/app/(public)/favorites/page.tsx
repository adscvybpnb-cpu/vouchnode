'use client';

import { useEffect, useState } from 'react';
import { Heart, Loader2, Search, Users } from 'lucide-react';
import { favoriteService, type FavoritesResponse } from '@/services/favorite.service';

type Tab = 'JUST FOR YOU' | 'SAVED SEARCHES' | 'LISTINGS' | 'PROFILES';

export default function FavoritesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('JUST FOR YOU');
  const [favorites, setFavorites] = useState<FavoritesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    favoriteService.getAll().then(setFavorites).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unable to load favorites');
    }).finally(() => setLoading(false));
  }, []);

  const count = favorites
    ? activeTab === 'LISTINGS' ? favorites.listings.length : activeTab === 'SAVED SEARCHES' ? favorites.searches.length : activeTab === 'PROFILES' ? favorites.profiles.length : favorites.listings.length + favorites.profiles.length
    : 0;

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Your collection</p><h1 className="mt-2 text-3xl font-bold">Favorites</h1><p className="mt-2 text-slate-400">Keep track of listings, searches, and profiles you want to revisit.</p></div>
        <div className="overflow-x-auto border-b border-white/10"><div className="flex min-w-max gap-7">{(['JUST FOR YOU', '+ SAVED SEARCHES', 'LISTINGS', 'PROFILES'] as const).map((tab) => { const key = tab === '+ SAVED SEARCHES' ? 'SAVED SEARCHES' : tab; return <button key={tab} onClick={() => setActiveTab(key)} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${activeTab === key ? 'border-indigo-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>{tab}</button>; })}</div></div>
        {loading ? <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? <div className="py-20 text-center text-red-300">{error}</div> : count === 0 ? <div className="rounded-2xl border border-white/10 bg-[#141420] py-20 text-center"><Heart className="mx-auto h-12 w-12 text-slate-600" /><h2 className="mt-4 text-xl font-semibold">Nothing saved yet</h2><p className="mt-2 text-slate-500">Favorite a listing or follow a profile to see it here.</p></div> : <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(activeTab === 'LISTINGS' || activeTab === 'JUST FOR YOU') && favorites?.listings.map(({ id, product }) => <article key={id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#141420]"><img src={product.images?.[0]?.url || '/placeholder-product.png'} alt="" className="h-44 w-full object-cover" /><div className="p-4"><h3 className="font-semibold">{product.name}</h3><p className="mt-2 text-indigo-200">{Number(product.currentPrice).toFixed(2)} {product.currency}</p></div></article>)}
          {(activeTab === 'SAVED SEARCHES') && favorites?.searches.map((search) => <article key={search.id} className="rounded-2xl border border-white/10 bg-[#141420] p-5"><Search className="h-5 w-5 text-indigo-300" /><h3 className="mt-4 font-semibold">{search.name}</h3><p className="mt-2 text-sm text-slate-400">{search.query}</p></article>)}
          {activeTab === 'PROFILES' && favorites?.profiles.map(({ id, following }) => <article key={id} className="rounded-2xl border border-white/10 bg-[#141420] p-5"><Users className="h-5 w-5 text-indigo-300" /><h3 className="mt-4 font-semibold">{following.sellerProfile?.shopName || following.profile?.displayName || following.username || 'Profile'}</h3></article>)}
        </div>}
      </div>
    </main>
  );
}
