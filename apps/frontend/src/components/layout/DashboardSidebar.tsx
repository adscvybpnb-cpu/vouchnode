import Link from 'next/link';
import { X } from 'lucide-react';

const links = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/orders', label: 'My Orders' },
  { href: '/dashboard/wallet', label: 'Wallet' },
  { href: '/referrals', label: 'Referrals' },
  { href: '/messages', label: 'Messages' },
  { href: '/dashboard/disputes', label: 'Disputes' },
  { href: '/dashboard/reviews', label: 'Reviews' },
  { href: '/dashboard/profile', label: 'Profile' },
];

interface DashboardSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function DashboardSidebar({ open = false, onClose }: DashboardSidebarProps) {
  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside translate="no" className={`notranslate fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card border-r border-border overflow-y-auto transition-transform duration-200 ease-out lg:hidden ${
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
      <nav className="p-4 space-y-1">
        <div className="flex items-center justify-between mb-4 px-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buyer Dashboard</h2>
          <button aria-label="Close navigation" className="lg:hidden text-muted-foreground" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center px-3 py-2 text-sm font-medium rounded-md hover:bg-muted text-foreground transition-colors"
            onClick={onClose}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      </aside>
    </>
  );
}
