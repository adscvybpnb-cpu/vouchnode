'use client';

import Link from 'next/link';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APP_NAME } from '@/lib/constants';
import { siteConfigService } from '@/services/site-config.service';
import { VouchNodesLogo } from './VouchNodesLogo';

export function Footer() {
  const [logoUrl, setLogoUrl] = useState('/favicon.svg');

  useEffect(() => {
    let active = true;
    void siteConfigService.getPublic()
      .then((config) => {
        if (active) setLogoUrl(config.logoUrl);
      })
      .catch((error: unknown) => {
        console.error('Unable to load the VouchNodes footer logo:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <footer translate="no" className="notranslate mt-auto border-t border-border bg-card pt-12 pb-6">
      <div className="container mx-auto mb-8 px-4">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <Link href="/" translate="no" className="notranslate mb-4 inline-flex items-center gap-2.5">
              <VouchNodesLogo logoUrl={logoUrl} />
              <span className="text-lg font-bold tracking-tight text-white">{APP_NAME}</span>
            </Link>
            <p translate="no" className="notranslate mb-4 text-sm text-muted-foreground">
              VouchNodes is a premier, secure digital asset marketplace specializing in global gift cards, gaming subscriptions, and crypto-friendly solutions since 2018. Trusted worldwide for instant deliveries and bulletproof escrow protection.
            </p>
          </div>
          <div>
            <h4 className="mb-4 font-semibold">Marketplace</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/products?category=all" translate="no" className="notranslate hover:text-primary">Browse All</Link></li>
              <li><Link href="/products?category=gift-cards" translate="no" className="notranslate hover:text-primary">Categories</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold">Account</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/login" translate="no" className="notranslate hover:text-primary">Sign In</Link></li>
              <li><Link href="/register" translate="no" className="notranslate hover:text-primary">Register</Link></li>
              <li><Link href="/become-a-seller" translate="no" className="notranslate hover:text-primary">Become a Seller</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about" translate="no" className="notranslate hover:text-primary">About Us</Link></li>
              <li><Link href="/help" translate="no" className="notranslate hover:text-primary">Help Center</Link></li>
              <li><Link href="/support/ticket" translate="no" className="notranslate hover:text-primary">Contact Support</Link></li>
              <li><Link href="/terms" translate="no" className="notranslate hover:text-primary">Terms & Privacy</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="container mx-auto flex flex-col items-center justify-between border-t border-border px-4 pt-6 text-sm text-muted-foreground sm:flex-row">
        <p translate="no" className="notranslate">© {new Date().getFullYear()} VouchNodes. All rights reserved.</p>
        <div className="mt-4 flex items-center gap-3 sm:mt-0">
          <span className="text-xs uppercase tracking-wider">Social</span>
          <a
            href="https://t.me/vouchnodes"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit VouchNodes on Telegram (opens in a new tab)"
            className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Send aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
        <div translate="no" className="notranslate mt-4 flex gap-4 sm:mt-0">
          <span translate="no" className="notranslate">USDT</span>
          <span translate="no" className="notranslate">BTC</span>
          <span translate="no" className="notranslate">ETH</span>
        </div>
      </div>
    </footer>
  );
}
