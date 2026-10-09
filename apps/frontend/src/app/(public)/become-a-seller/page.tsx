'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';

export default function BecomeASellerPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  // Auth guard — redirect unauthenticated users to login
  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace('/login?redirect=/become-a-seller');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated === true) {
      router.replace('/seller/onboarding');
    }
  }, [isAuthenticated, router]);

  // While auth state is loading, show spinner
  if (isAuthenticated === null || isAuthenticated === undefined) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — briefly shown before redirect fires
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <p className="text-slate-400">Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}