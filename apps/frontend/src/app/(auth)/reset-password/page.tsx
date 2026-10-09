'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/services/auth.service';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<{ password: string; confirmPassword: string }>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: { password: string }) => {
    setIsLoading(true);
    try {
      await authService.resetPassword(data.password);
      toast({
        title: 'Password updated',
        description: 'Your password was reset successfully.',
      });
      router.push('/login');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Unable to reset password.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Create a new password</h1>
      <p className="text-slate-400 mb-6">Use a strong password with at least 8 characters.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" {...register('password')} className="bg-[#141420] border-[#1E1E2E]" />
          {errors.password && <span className="text-xs text-red-500">{String(errors.password.message)}</span>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" type="password" {...register('confirmPassword')} className="bg-[#141420] border-[#1E1E2E]" />
          {errors.confirmPassword && <span className="text-xs text-red-500">{String(errors.confirmPassword.message)}</span>}
        </div>

        <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Reset password'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Back to{' '}
        <Link href="/login" className="text-indigo-400 hover:underline">
          login
        </Link>
      </p>
    </div>
  );
}
