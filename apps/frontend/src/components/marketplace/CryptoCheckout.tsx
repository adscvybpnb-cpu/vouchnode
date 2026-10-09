'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { orderService } from '@/services/order.service';
import { walletService } from '@/services/wallet.service';
import type { CheckoutQuote } from '@/services/wallet.service';
import type { Product } from '@/types/api.types';
import { hasUsableAccessToken, useAuthStore } from '@/store/auth.store';

export function CryptoCheckout({ product }: { product: Product }) {
  const router = useRouter();
  const authenticatedUser = useAuthStore((store) => store.user);
  const accessToken = useAuthStore((store) => store.accessToken);
  const hasUsableAuth = hasUsableAccessToken(accessToken);
  const isSoldOut = product.status === 'SOLD' || product.stock === 0;
  const isOwnListing = Boolean(authenticatedUser && (
    product.sellerId === authenticatedUser.id || product.seller?.userId === authenticatedUser.id
  ) && hasUsableAuth);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOwnListing || !hasUsableAuth) {
      setQuote(null);
      setWalletBalance(null);
      return;
    }
    void walletService.getCheckoutQuote(Number(product.currentPrice))
      .then((checkoutQuote) => {
        setQuote(checkoutQuote);
        setWalletBalance(checkoutQuote.totalUsdBalance);
      })
      .catch(() => setWalletBalance(null));
  }, [hasUsableAuth, isOwnListing, product.currentPrice]);

  if (isOwnListing) {
    return (
      <div className="space-y-3 rounded-2xl border border-indigo-400/30 bg-[#11131c] p-5 shadow-2xl shadow-black/20">
        <p className="text-sm text-slate-300">This is your listing.</p>
        <Button className="w-full bg-indigo-500 text-white hover:bg-indigo-400" onClick={() => router.push(`/seller/products/${product.id}/edit`)}>
          Edit Listing
        </Button>
      </div>
    );
  }

  if (isSoldOut) {
    return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-[#11131c] p-5 shadow-2xl shadow-black/20">
        <p className="text-sm text-slate-400">This listing is no longer available for purchase.</p>
        <Button disabled className="w-full cursor-not-allowed bg-slate-700 text-slate-400">
          Sold Out
        </Button>
      </div>
    );
  }

  const beginCheckout = async () => {
    if (checkoutSubmitting) return;
    setError('');
    setCheckoutSubmitting(true);
    try {
      if (!quote) throw new Error('Wallet balance is still loading.');
      if (quote.usdtBalance < quote.priceUsd) {
        if (!quote.canAutoConvert) {
          setError('Insufficient wallet balance');
          setCheckoutSubmitting(false);
          return;
        }
        setSwapModalOpen(true);
        setCheckoutSubmitting(false);
        return;
      }
      const paid = await orderService.payWithWallet(product.id, 1);
      setWalletBalance((balance) => balance === null ? null : balance - Number(product.currentPrice));
      window.dispatchEvent(new Event('wallet:updated'));
      router.push(`/orders/${paid.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete wallet checkout.');
      setCheckoutSubmitting(false);
    }
  };

  const confirmAutoSwap = async () => {
    if (!quote?.conversionAsset) return;
    setSwapSubmitting(true);
    setError('');
    try {
      const paid = await orderService.payWithWallet(product.id, 1, {
        autoConvert: true,
        sourceAsset: quote.conversionAsset
      });
      window.dispatchEvent(new Event('wallet:updated'));
      setSwapModalOpen(false);
      router.push(`/orders/${paid.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to auto-convert assets and complete checkout.');
    } finally {
      setSwapSubmitting(false);
    }
  };

  return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-[#11131c] p-5 shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              {hasUsableAuth ? 'Protected wallet checkout' : 'Ready to purchase?'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {hasUsableAuth
                ? 'Pay securely from your internal wallet. Funds remain in escrow until delivery is confirmed.'
                : 'Sign in to purchase this product securely.'}
            </p>
          </div>
          {hasUsableAuth && <ShieldCheck className="h-5 w-5 text-emerald-400" />}
        </div>
        {hasUsableAuth ? (
          <>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-300">Wallet Balance</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {walletBalance === null ? 'Loading balance...' : `$${walletBalance.toFixed(2)} total`}
              </p>
              {quote && <p className="mt-1 text-xs text-slate-400">USDT available: ${quote.usdtBalance.toFixed(2)}</p>}
            </div>
            {quote && quote.usdtBalance < quote.priceUsd && (
              <p className="text-sm text-amber-300">Insufficient wallet balance</p>
            )}
            {quote && quote.usdtBalance < quote.priceUsd && !quote.canAutoConvert && (
              <Button variant="outline" className="w-full border-indigo-400/50 text-indigo-200 hover:bg-indigo-400/10" onClick={() => router.push('/dashboard/wallet')}>
                + Deposit Funds to Wallet
              </Button>
            )}
            <Button
              type="button"
              className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              onClick={beginCheckout}
              disabled={!quote || (!quote.canAutoConvert && quote.usdtBalance < quote.priceUsd) || checkoutSubmitting}
              isLoading={checkoutSubmitting}
            >
              {checkoutSubmitting ? 'Starting checkout...' : 'Buy Now with Wallet'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-indigo-400/50 text-indigo-200 hover:bg-indigo-400/10"
              onClick={() => router.push(`/checkout/pay-direct?productId=${encodeURIComponent(product.id)}&price=${encodeURIComponent(Number(product.currentPrice).toFixed(2))}`)}
            >
              Proceed to Payment
            </Button>
          </>
        ) : (
          <Button className="w-full bg-indigo-500 text-white hover:bg-indigo-400" onClick={() => router.push('/login')}>
            Sign In to Buy
          </Button>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {swapModalOpen && quote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="auto-swap-title">
            <div className="w-full max-w-md space-y-5 rounded-2xl border border-indigo-400/30 bg-[#11131c] p-6 shadow-2xl">
              <div>
                <h2 id="auto-swap-title" className="text-xl font-semibold text-white">Insufficient USDT Balance - Auto-Convert Options</h2>
                <p className="mt-2 text-sm text-slate-400">You are short <span className="font-semibold text-amber-300">${quote.shortfallUsd.toFixed(2)} USDT</span>.</p>
              </div>
              <div className="rounded-xl border border-indigo-400/20 bg-indigo-400/5 p-4 text-sm text-slate-200">
                Convert approximately <span className="font-semibold text-white">{quote.conversionAmount?.toFixed(8)} {quote.conversionAsset}</span> at the locked rate of <span className="font-semibold text-white">${quote.conversionRate?.toLocaleString()} / {quote.conversionAsset}</span>.
              </div>
              <p className="text-sm leading-6 text-slate-300">Your volatile assets fluctuate constantly. Confirming this action will instantly lock the current real-time market price and exchange your {quote.conversionAsset} to USDT to complete this purchase.</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setSwapModalOpen(false)} disabled={swapSubmitting}>Cancel</Button>
                <Button className="flex-1 bg-emerald-500 text-slate-950 hover:bg-emerald-400" onClick={confirmAutoSwap} disabled={swapSubmitting}>{swapSubmitting ? 'Converting...' : 'Confirm & Auto-Swap'}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
}
