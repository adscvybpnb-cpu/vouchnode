interface TelegramNotificationContent {
  type: string;
  title: string;
  body: string;
  message: string;
  data: unknown;
}

export function getTelegramNotificationText(notification: TelegramNotificationContent) {
  if (notification.type !== 'MESSAGE_NEW') {
    return `${notification.title}\n\n${notification.body || notification.message}`;
  }

  const data = notification.data;
  const orderId = data && typeof data === 'object' && !Array.isArray(data)
    ? ('orderId' in data && typeof data.orderId === 'string' ? data.orderId
      : 'p2pOrderId' in data && typeof data.p2pOrderId === 'string' ? data.p2pOrderId
        : null)
    : null;

  if (!orderId) {
    return 'New Message Received!\nYou have a new unread message in your conversation.\nPlease log back into the platform to view and reply.';
  }

  return `New Message Received!\nYou have a new unread message regarding Order ID: ${orderId}.\nPlease log back into the platform to view and reply.`;
}
