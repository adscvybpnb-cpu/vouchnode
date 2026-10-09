import { StandardDisputeStatusPage } from '@/components/admin/StandardDisputeStatusPage';

export default function StandardDisputesPage() {
  return <StandardDisputeStatusPage status="OPEN,AWAITING_SELLER,AWAITING_BUYER,ESCALATED" title="Active Standard Disputes" />;
}
