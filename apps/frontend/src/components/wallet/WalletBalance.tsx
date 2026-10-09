import { formatAmount } from '../../lib/format';
import type { Wallet } from '../../types/api.types';

export function WalletBalance({ wallet }: { wallet?: Wallet }) {
  if (!wallet) return <div className="h-40 bg-card rounded-xl animate-pulse"></div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-card border border-success/30 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 rounded-bl-full -z-10"></div>
        <h3 className="text-sm font-medium text-muted-foreground mb-1">Available Balance</h3>
        <p className="text-3xl font-bold text-foreground">{formatAmount(wallet.availableBalance, wallet.currency)}</p>
      </div>

      <div className="bg-card border border-warning/30 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-warning/10 rounded-bl-full -z-10"></div>
        <h3 className="text-sm font-medium text-muted-foreground mb-1">Pending <span className="text-xs opacity-70">(Escrow)</span></h3>
        <p className="text-3xl font-bold text-foreground">{formatAmount(wallet.pendingBalance, wallet.currency)}</p>
      </div>

      <div className="bg-card border border-destructive/30 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-destructive/10 rounded-bl-full -z-10"></div>
        <h3 className="text-sm font-medium text-muted-foreground mb-1">Frozen</h3>
        <p className="text-3xl font-bold text-foreground">{formatAmount(wallet.frozenBalance, wallet.currency)}</p>
      </div>
    </div>
  );
}
