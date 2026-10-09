import { StandardDisputeStatusPage } from '@/components/admin/StandardDisputeStatusPage';

export default function CompletedStandardDisputesPage() {
  return <StandardDisputeStatusPage status="RESOLVED_BUYER,RESOLVED_SELLER,CLOSED" title="Completed Standard Disputes" />;
}
