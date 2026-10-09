'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/services/auth.service';
import { Button } from '@/components/ui/button';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    authService.verifyEmail(token)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/login'), 3000);
      })
      .catch(() => setStatus('error'));
  }, [token, router]);

  return (
    <div className="text-center">
      {status === 'loading' && <p className="text-white">Verifying email...</p>}
      {status === 'success' && (
        <>
          <h2 className="text-2xl font-bold text-green-500 mb-4">Email verified!</h2>
          <p className="text-slate-400">Redirecting to login...</p>
        </>
      )}
      {status === 'error' && (
        <>
          <h2 className="text-2xl font-bold text-red-500 mb-4">Verification failed</h2>
          <p className="text-slate-400 mb-6">The link is invalid or has expired.</p>
          <Button onClick={() => router.push('/login')} className="w-full bg-indigo-600">Back to Login</Button>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-center text-white">Loading verification...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}