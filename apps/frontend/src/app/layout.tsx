import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers'; // We'll create this to wrap client providers
import { APP_NAME, APP_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: {
    template: `%s | ${APP_NAME}`,
    default: `${APP_NAME} - Premium Gift Card Marketplace`,
  },
  description: 'Buy and sell gift cards instantly with crypto.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: APP_NAME,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no" className="notranslate dark" suppressHydrationWarning>
      <body translate="no" className="notranslate flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-background font-sans text-foreground antialiased" suppressHydrationWarning>
        <Providers>
          <div className="min-w-0 flex-grow overflow-x-hidden">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
