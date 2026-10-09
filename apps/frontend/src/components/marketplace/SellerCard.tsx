'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

export function SellerCard({ seller }: { seller?: any }) {
  const sellerUserId = seller?.userId ?? seller?.user?.id;
  const onlineUntil = seller?.onlineUntil ?? seller?.user?.onlineUntil;
  const initialOnline = Boolean(seller && (seller.isOnline ?? seller.user?.isOnline)) &&
    (!onlineUntil || new Date(onlineUntil).getTime() > Date.now());
  const [isOnline, setIsOnline] = useState(initialOnline);

  useEffect(() => {
    setIsOnline(initialOnline);
  }, [initialOnline]);

  useEffect(() => {
    if (!sellerUserId) return;
    const handlePresenceUpdate = (event: Event) => {
      const payload = (event as CustomEvent<{ userId?: string; isOnline?: boolean }>).detail;
      if (payload?.userId === sellerUserId && typeof payload.isOnline === 'boolean') {
        setIsOnline(payload.isOnline);
      }
    };
    window.addEventListener('presence:update', handlePresenceUpdate);
    return () => window.removeEventListener('presence:update', handlePresenceUpdate);
  }, [sellerUserId]);
  if (!seller) return null;
  const sellerName = seller.username ?? seller.user?.profile?.username ?? seller.shopName ?? seller.name ?? 'VaultMarket Seller';

  return (
    <div className="rounded-2xl border border-white/10 bg-[#12131a] p-4">
      <Link href={`/sellers/${seller.userId}`} className="flex items-center gap-3 hover:opacity-80">
        <img src={seller.avatarUrl || seller.avatar || '/placeholder-avatar.svg'} alt={seller.shopName || seller.name} className="h-12 w-12 rounded-full object-cover" />
        <div>
          <p className="flex items-center gap-2 font-semibold text-white">{sellerName} <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-500'}`} /></p>
          <p className="flex flex-wrap items-center gap-1 text-sm text-slate-400">
            {isOnline && <><span className="text-emerald-300">Online</span> · </>}
            {seller.isVerified && <><Check className="h-3.5 w-3.5 text-emerald-400" /> Verified seller</>}
            {seller.status === 'ACTIVE' && <span>{seller.isVerified ? '· ' : ''}Active seller</span>}
            {!seller.isVerified && seller.status !== 'ACTIVE' && 'Marketplace seller'}
          </p>
        </div>
      </Link>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
        <span>Rating</span>
        <span className="font-semibold text-cyan-300">{(Number(seller.rating ?? seller.avgRating) || 0).toFixed(1)}</span>
      </div>
    </div>
  );
}