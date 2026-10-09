import { describe, expect, it } from 'vitest';
import { getTelegramNotificationText } from '../jobs/notification-message';

describe('getTelegramNotificationText', () => {
  it('formats order message alerts without including the message body', () => {
    const alert = getTelegramNotificationText({
      type: 'MESSAGE_NEW',
      title: 'Buyer Name',
      body: 'Private message body',
      message: 'Private message body',
      data: { orderId: 'order-123' },
    });

    expect(alert).toBe(
      'New Message Received!\nYou have a new unread message regarding Order ID: order-123.\nPlease log back into the platform to view and reply.',
    );
    expect(alert).not.toContain('Private message body');
  });

  it('uses the P2P order ID and never falls back to raw message content', () => {
    const alert = getTelegramNotificationText({
      type: 'MESSAGE_NEW',
      title: 'Seller Name',
      body: 'Private message body',
      message: 'Private message body',
      data: { p2pOrderId: 'p2p-order-456' },
    });

    expect(alert).toContain('Order ID: p2p-order-456.');
    expect(alert).not.toContain('Private message body');
  });

  it('uses a privacy-safe alert when a message has no order context', () => {
    const alert = getTelegramNotificationText({
      type: 'MESSAGE_NEW',
      title: 'Buyer Name',
      body: 'Private message body',
      message: 'Private message body',
      data: {},
    });

    expect(alert).toBe(
      'New Message Received!\nYou have a new unread message in your conversation.\nPlease log back into the platform to view and reply.',
    );
    expect(alert).not.toContain('Private message body');
  });
});
