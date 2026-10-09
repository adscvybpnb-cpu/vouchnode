import { Header } from '@/components/layout/Header';
import { TelegramVerificationBanner } from '@/components/layout/TelegramVerificationBanner';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <TelegramVerificationBanner />
      <main className="min-h-screen min-w-0 overflow-x-hidden">{children}</main>
    </>
  );
}