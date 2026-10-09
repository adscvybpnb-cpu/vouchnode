import { OrderWorkspace } from '@/components/order/OrderWorkspace';

export default function OrderDetailsPage({ params }: { params: { id: string } }) {
  return <OrderWorkspace orderId={params.id} />;
}