import { NotificationType } from '@prisma/client';

export type NotificationEmailRole = 'buyer' | 'seller';

export interface NotificationEmailInput {
  title: string;
  message: string;
  recipientName: string;
  type: NotificationType;
  link: string | null;
  role: NotificationEmailRole;
  frontendUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface WelcomeDiscount {
  productName: string;
  categoryName: string;
  discountPercent: string;
  currency: string;
  currentPrice: string;
}

export const WELCOME_EMAIL_SUBJECT = 'Welcome to VouchNode! 🎉 Your Exclusive Gift Cards & Discounts Inside';

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function resolveNotificationEmailRole(
  type: NotificationType,
  link: string | null,
  roleNames: string[],
  title: string,
): NotificationEmailRole {
  if (type === NotificationType.SALE_NEW || link?.startsWith('/seller/')) return 'seller';
  if (type === NotificationType.ORDER_NEW || type === NotificationType.ORDER_COMPLETED) return 'buyer';
  if (/^sale\b/i.test(title)) return 'seller';
  if (roleNames.includes('SELLER') && !roleNames.includes('BUYER')) return 'seller';
  return 'buyer';
}

function getActionUrl(frontendUrl: string, link: string | null) {
  if (!link?.startsWith('/') || link.startsWith('//') || /[\r\n\\]/.test(link)) return null;
  const base = new URL(frontendUrl);
  const action = new URL(link, base);
  return action.origin === base.origin ? action.toString() : null;
}

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const isSeller = input.role === 'seller';
  const actionUrl = getActionUrl(input.frontendUrl, input.link);
  const actionLabel = isSeller ? 'Open seller dashboard' : 'View your VouchNode account';
  const audienceLabel = isSeller ? 'Seller update' : 'Buyer update';
  const audienceBackground = isSeller ? '#eff8ff' : '#fffaeb';
  const audienceBorder = isSeller ? '#155eef' : '#ffd43b';
  const messageText = input.message || input.title;
  const subject = `${input.title} | VouchNode`;
  const html = [
    `<p style="margin:0 0 18px;color:#475467;font-size:15px">Hello ${escapeHtml(input.recipientName)},</p>`,
    `<p style="display:inline-block;margin:0 0 16px;padding:7px 10px;background:${audienceBackground};border-left:4px solid ${audienceBorder};color:#344054;font-size:12px;font-weight:700;text-transform:uppercase">${audienceLabel}</p>`,
    `<h1 style="margin:0 0 16px;color:#101828;font-size:24px;line-height:1.3">${escapeHtml(input.title)}</h1>`,
    `<p style="margin:0;color:#475467;font-size:15px;line-height:1.7">${escapeHtml(messageText).replace(/\r?\n/g, '<br>')}</p>`,
    actionUrl
      ? `<p style="margin:26px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 20px;background:#155eef;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${actionLabel}</a></p>`
      : '',
  ].join('');
  const text = [
    `Hello ${input.recipientName},`,
    '',
    audienceLabel,
    input.title,
    messageText,
    ...(actionUrl ? ['', `${actionLabel}: ${actionUrl}`] : []),
  ].join('\n');

  return { subject, html, text };
}

export function renderWelcomeEmail(
  recipientName: string,
  frontendUrl: string,
  categories: string[],
  discounts: WelcomeDiscount[],
): RenderedEmail {
  const name = escapeHtml(recipientName);
  const marketplaceUrl = escapeHtml(new URL('/marketplace', frontendUrl).toString());
  const categoryList = categories.length
    ? `<ul style="padding-left:22px;color:#475467;line-height:1.8">${categories.map((category) => `<li>${escapeHtml(category)}</li>`).join('')}</ul>`
    : '<p style="color:#475467;line-height:1.7">Explore gift cards and digital products across the VouchNode marketplace.</p>';
  const discountContent = discounts.length
    ? `<h2 style="margin:26px 0 12px;color:#101828;font-size:18px">Active marketplace discounts</h2>
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${discounts.map((offer) => `
         <tr><td style="padding:12px 0;border-top:1px solid #eaecf0;color:#344054">
           <strong>${escapeHtml(offer.productName)}</strong> · ${escapeHtml(offer.categoryName)}
           <span style="color:#067647;font-weight:700">${escapeHtml(offer.discountPercent)}% off</span>
           <br><span style="color:#667085">Now ${escapeHtml(offer.currentPrice)} ${escapeHtml(offer.currency)}</span>
         </td></tr>`).join('')}</table>`
    : '<p style="margin-top:20px;color:#475467;line-height:1.7">There are no discounted listings to feature right now. Check the marketplace for current seller offers and rewards.</p>';
  const html = [
    `<p style="margin:0 0 18px;color:#475467;font-size:15px">Hello ${name},</p>`,
    '<h1 style="margin:0 0 16px;color:#101828;font-size:25px;line-height:1.3">Welcome to VouchNode!</h1>',
    '<p style="margin:0;color:#475467;font-size:15px;line-height:1.7">Thanks for joining our marketplace. You can now discover gift cards and digital products from VouchNode sellers.</p>',
    '<h2 style="margin:26px 0 8px;color:#101828;font-size:18px">Start exploring</h2>',
    categoryList,
    discountContent,
    `<p style="margin:26px 0 0"><a href="${marketplaceUrl}" style="display:inline-block;padding:12px 20px;background:#155eef;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Explore VouchNode</a></p>`,
  ].join('');
  const discountText = discounts.length
    ? `Active marketplace discounts:\n${discounts.map((offer) => `- ${offer.productName} (${offer.categoryName}): ${offer.discountPercent}% off, now ${offer.currentPrice} ${offer.currency}`).join('\n')}`
    : 'There are no discounted listings to feature right now. Check the marketplace for current seller offers and rewards.';
  const text = [
    `Hello ${recipientName},`,
    '',
    'Welcome to VouchNode!',
    'Thanks for joining our marketplace. Discover gift cards and digital products from VouchNode sellers.',
    '',
    'Start exploring:',
    ...(categories.length ? categories.map((category) => `- ${category}`) : ['- Gift cards and digital products across the marketplace']),
    '',
    discountText,
    '',
    `Explore VouchNode: ${new URL('/marketplace', frontendUrl).toString()}`,
  ].join('\n');
  return { subject: WELCOME_EMAIL_SUBJECT, html, text };
}

export function wrapInVouchNodeBrand(content: string) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#101828">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
      <tr><td style="padding:24px 32px;background:#155eef">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td style="width:42px;height:42px;background:#0b3ca8;border-radius:8px;text-align:center;vertical-align:middle">
            <svg role="img" aria-label="VouchNode" width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="28" height="28" rx="4" fill="#155eef"/>
              <rect x="16" y="3" width="4" height="28" fill="#ffd43b"/>
              <path d="M17 15c-7-8-12-2-5 2 2 1 4 1 5 1-1-5 0-9 0-9s1 4 0 9c1 0 3 0 5-1 7-4 2-10-5-2Zm-1 4h2v7h-2z" fill="#fff"/>
            </svg>
          </td>
          <td style="padding-left:12px;color:#fff;font-size:21px;font-weight:700">VouchNode</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px">${content}</td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #eaecf0;color:#667085;font-size:12px;line-height:1.6">
        This is an automatic message from VouchNode. Please do not reply to this email.
      </td></tr>
    </table>
  </body>
</html>`;
}
