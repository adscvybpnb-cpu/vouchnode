import { P2PDisputeStatusPage } from '@/components/admin/DisputeStatusPage';

export default function QuickP2PDisputesPage() {
  return <P2PDisputeStatusPage status={['OPEN']} title="Active P2P Disputes" />;
}
