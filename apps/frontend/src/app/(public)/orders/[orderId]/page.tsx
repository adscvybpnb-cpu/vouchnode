import { OrderWorkspace } from '@/components/order/OrderWorkspace';

export default function OrderPage({ params }: { params: { orderId: string } }) {
  return <OrderWorkspace orderId={params.orderId} />;
}
