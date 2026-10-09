import { NotificationType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { htmlToPlainText, renderNotificationEmail, renderWelcomeEmail, resolveNotificationEmailRole, WELCOME_EMAIL_SUBJECT, wrapInVouchNodeBrand } from '../integrations/email/email.templates';

describe('transactional email templates', () => {
  it('selects the buyer or seller variant from the recipient event context', () => {
    expect(resolveNotificationEmailRole(NotificationType.SALE_NEW, '/dashboard/orders/order-1', ['BUYER', 'SELLER'], 'New sale')).toBe('seller');
    expect(resolveNotificationEmailRole(NotificationType.ORDER_NEW, '/dashboard/orders/order-1', ['BUYER', 'SELLER'], 'Order placed')).toBe('buyer');
    expect(resolveNotificationEmailRole(NotificationType.DISPUTE_OPENED, '/seller/disputes/dispute-1', ['BUYER', 'SELLER'], 'Dispute opened')).toBe('seller');

    const sellerEmail = renderNotificationEmail({
      title: 'New sale',
      message: 'A new order was placed.',
      recipientName: 'Seller',
      type: NotificationType.SALE_NEW,
      link: '/dashboard/orders/order-1',
      role: 'seller',
      frontendUrl: 'https://vouchnode.example',
    });
    const buyerEmail = renderNotificationEmail({
      title: 'Order placed',
      message: 'Your order is awaiting payment.',
      recipientName: 'Buyer',
      type: NotificationType.ORDER_NEW,
      link: '/dashboard/orders/order-1',
      role: 'buyer',
      frontendUrl: 'https://vouchnode.example',
    });
    expect(sellerEmail.html).toContain('Seller update');
    expect(sellerEmail.html).toContain('Open seller dashboard');
    expect(buyerEmail.html).toContain('Buyer update');
    expect(buyerEmail.html).toContain('View your VouchNode account');
  });

  it('escapes user-supplied content and only links back to the configured site', () => {
    const rendered = renderNotificationEmail({
      title: '<script>alert(1)</script>',
      message: 'Product <img src=x onerror=alert(1)> was purchased.',
      recipientName: 'Buyer <b>name</b>',
      type: NotificationType.ORDER_NEW,
      link: '/dashboard/orders/order-1',
      role: 'buyer',
      frontendUrl: 'https://vouchnode.example',
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('Buyer &lt;b&gt;name&lt;/b&gt;');
    expect(rendered.html).toContain('https://vouchnode.example/dashboard/orders/order-1');

    const externalLink = renderNotificationEmail({
      title: 'Order placed',
      message: 'Payment pending.',
      recipientName: 'Buyer',
      type: NotificationType.ORDER_NEW,
      link: '//evil.example/phishing',
      role: 'buyer',
      frontendUrl: 'https://vouchnode.example',
    });
    expect(externalLink.html).not.toContain('evil.example');
    expect(externalLink.text).not.toContain('evil.example');
  });

  it('adds VouchNode visual branding to outgoing HTML', () => {
    const branded = wrapInVouchNodeBrand('<p>Order placed</p>');
    expect(branded).toContain('VouchNode');
    expect(branded).toContain('#ffd43b');
    expect(branded).toContain('fill="#fff"');
    expect(branded).toContain('<p>Order placed</p>');
  });

  it('preserves links in the plain-text version of HTML emails', () => {
    expect(htmlToPlainText('<p>Reset your password <a href="https://vouchnode.example/reset?token=abc">here</a>.</p>'))
      .toBe('Reset your password here (https://vouchnode.example/reset?token=abc).');
  });

  it('renders a branded welcome email with live listings and the required subject', () => {
    const email = renderWelcomeEmail('New Buyer', 'https://vouchnode.example', ['Gaming', 'Entertainment'], [
      {
        productName: 'Game & Store card',
        categoryName: 'Gaming',
        discountPercent: '15.00',
        currency: 'USDT',
        currentPrice: '42.50',
      },
    ]);

    expect(email.subject).toBe(WELCOME_EMAIL_SUBJECT);
    expect(email.html).toContain('Welcome to VouchNode!');
    expect(email.html).toContain('Active marketplace discounts');
    expect(email.html).toContain('Game &amp; Store card');
    expect(email.html).toContain('15.00% off');
    expect(email.text).toContain('Gaming');
    expect(email.text).toContain('https://vouchnode.example/marketplace');
  });
});
