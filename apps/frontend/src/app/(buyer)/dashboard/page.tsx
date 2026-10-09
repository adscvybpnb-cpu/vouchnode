'use client';
import { useAuth } from '@/hooks/useAuth';
import { WalletBalance } from '@/components/wallet/WalletBalance';

export default function BuyerDashboardOverview() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back, {user?.username}</h1>
        <p className="text-muted-foreground mt-1">Here is your account overview</p>
      </div>
      
      <WalletBalance wallet={user?.walletBalance as any} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Orders</h2>
          <div className="text-sm text-muted-foreground text-center py-8">No recent orders found.</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Active Disputes</h2>
          <div className="text-sm text-muted-foreground text-center py-8">You have no active disputes.</div>
        </div>
      </div>
    </div>
  );
}
