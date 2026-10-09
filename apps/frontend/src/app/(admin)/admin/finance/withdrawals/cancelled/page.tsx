import { AdminFinanceTable } from '@/components/admin/AdminFinanceTable';

export default function CancelledWithdrawalsPage() {
  return <AdminFinanceTable kind="withdrawal" status="CANCELLED" title="Cancelled Withdrawals" />;
}
