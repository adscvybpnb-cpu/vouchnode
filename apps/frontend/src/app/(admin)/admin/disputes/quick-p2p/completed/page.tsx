import { P2PDisputeStatusPage } from '@/components/admin/DisputeStatusPage';

export default function CompletedP2PDisputesPage() {
  return <P2PDisputeStatusPage status={['RESOLVED', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED']} title="Completed P2P Disputes" />;
}
