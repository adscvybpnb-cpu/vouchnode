import type { Notification } from '../types/api.types';

const marketplaceOrderNotificationTypes = new Set([
  'DISPUTE_OPENED',
  'DISPUTE_SUBMITTED',
  'DISPUTE_RESOLVED',
  'SALE_PAYMENT_RECEIVED',
  'SALE_NEW',
  'PAYMENT_RECEIVED',
  'ORDER_UPDATE',
]);

const disputeNotificationTypes = new Set([
  'DISPUTE_OPENED',
  'DISPUTE_SUBMITTED',
  'DISPUTE_RESOLVED',
]);

export function getNotificationPath(notification: Notification, isSeller = false): string | undefined {
  const orderId = notification.data?.orderId;
  const disputeId = notification.data?.disputeId;
  if (isSeller && disputeNotificationTypes.has(notification.type)) {
    const linkedDisputeId = typeof disputeId === 'string' && disputeId
      ? disputeId
      : notification.link?.match(/^\/seller\/disputes\/([^/?#]+)/)?.[1];
    if (typeof orderId === 'string' && orderId) {
      return `/orders/${encodeURIComponent(orderId)}`;
    }
    if (linkedDisputeId) {
      return `/seller/disputes?disputeId=${encodeURIComponent(linkedDisputeId)}`;
    }
  }
  if (typeof orderId === 'string' && marketplaceOrderNotificationTypes.has(notification.type)) {
    if (isSeller) return `/orders/${encodeURIComponent(orderId)}`;
    return `/dashboard/orders/${encodeURIComponent(orderId)}`;
  }
  return notification.link;
}
