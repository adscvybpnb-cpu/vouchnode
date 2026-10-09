import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TelegramVerificationBanner } from '@/components/layout/TelegramVerificationBanner';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <TelegramVerificationBanner />
      <div className="min-h-screen min-w-0 overflow-x-hidden">{children}</div>
      <Footer />
    </>
  );
}
