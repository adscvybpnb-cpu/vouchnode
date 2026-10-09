import Link from 'next/link';

export function Footer() {
  return (
    <footer translate="no" className="notranslate mt-auto border-t border-border bg-card pt-12 pb-6">
      <div className="container mx-auto mb-8 px-4">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <Link href="/" translate="no" className="notranslate mb-4 block text-xl font-bold text-primary">🎁 VouchNode</Link>
            <p translate="no" className="notranslate mb-4 text-sm text-muted-foreground">
              The premium marketplace for gift cards and digital assets. Secure, instant, and crypto-friendly.
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
              <li><Link href="/help" translate="no" className="notranslate hover:text-primary">Help Center</Link></li>
              <li><Link href="/support/ticket" translate="no" className="notranslate hover:text-primary">Contact Support</Link></li>
              <li><Link href="/terms" translate="no" className="notranslate hover:text-primary">Terms & Privacy</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="container mx-auto flex flex-col items-center justify-between border-t border-border px-4 pt-6 text-sm text-muted-foreground sm:flex-row">
        <p translate="no" className="notranslate">© {new Date().getFullYear()} VouchNode. All rights reserved.</p>
        <div translate="no" className="notranslate mt-4 flex gap-4 sm:mt-0">
          <span translate="no" className="notranslate">USDT</span>
          <span translate="no" className="notranslate">BTC</span>
          <span translate="no" className="notranslate">ETH</span>
        </div>
      </div>
    </footer>
  );
}
