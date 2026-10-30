import { BRAND_NAME } from '@vouchnode/shared';

export const APP_NAME = BRAND_NAME;
const isProduction = process.env.NODE_ENV === 'production';
const isPublicHttpsUrl = (value: string | undefined): value is string => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname !== 'localhost' &&
      url.hostname !== '127.0.0.1' &&
      url.hostname !== '::1' &&
      !url.hostname.endsWith('.localhost');
  } catch {
    return false;
  }
};
const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
export const APP_URL = isProduction
  ? (isPublicHttpsUrl(configuredAppUrl) ? configuredAppUrl : 'https://vouchnodes.com')
  : (configuredAppUrl || 'http://localhost:3000');
const productionApiUrl = 'https://api.vouchnodes.com/api/v1';
const candidateApiUrl = process.env.NEXT_PUBLIC_API_URL;
const configuredApiUrl = isProduction
  ? (
    isPublicHttpsUrl(candidateApiUrl) &&
    (!isPublicHttpsUrl(APP_URL) || new URL(candidateApiUrl).origin !== new URL(APP_URL).origin)
      ? candidateApiUrl
      : productionApiUrl
  )
  : (candidateApiUrl || 'http://127.0.0.1:4000/api/v1');
const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');
export const API_URL = /\/api\/v1$/i.test(normalizedApiUrl)
  ? normalizedApiUrl
  : /\/api$/i.test(normalizedApiUrl)
    ? `${normalizedApiUrl}/v1`
    : `${normalizedApiUrl}/api/v1`;
export const API_ORIGIN = normalizedApiUrl.match(/^https?:\/\/[^/]+/i)?.[0] || '';
export const ADMIN_API_URL = `${API_URL}/admin`;
const configuredWsUrl = process.env.NEXT_PUBLIC_WS_URL;
const normalizeSocketOrigin = (value: string | undefined) => {
  try {
    if (!value) throw new Error('Socket URL is not configured');
    const url = new URL(value);
    const isLocalHost = url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      url.hostname.endsWith('.localhost');

    if (isProduction) {
      if (!['https:', 'wss:'].includes(url.protocol) || isLocalHost) {
        throw new Error('Production Socket.IO URL must use a public HTTPS/WSS origin');
      }
      if (url.origin === new URL(APP_URL).origin) {
        throw new Error('Production Socket.IO URL must use the API origin');
      }
    } else if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
      throw new Error('Unsupported Socket.IO protocol');
    }

    url.protocol = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
    return url.origin;
  } catch {
    if (isProduction) return API_ORIGIN;
    try {
      const localUrl = new URL(value || 'http://127.0.0.1:4000');
      localUrl.protocol = localUrl.protocol === 'wss:' ? 'https:' : localUrl.protocol === 'ws:' ? 'http:' : localUrl.protocol;
      return localUrl.origin;
    } catch {
      return 'http://127.0.0.1:4000';
    }
  }
};
export const WS_URL = normalizeSocketOrigin(configuredWsUrl);
export const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'USDT';
export const SUPPORTED_CURRENCIES = ['USDT', 'BTC', 'ETH', 'LTC', 'BNB'];

export const ORDER_STATUSES = {
  PENDING: { label: 'Pending', color: 'bg-muted text-foreground' },
  AWAITING_PAYMENT: { label: 'Awaiting Payment', color: 'bg-warning text-warning-foreground' },
  PAID: { label: 'Paid', color: 'bg-blue-500 text-white' },
  WAITING_BUYER_CONFIRMATION: { label: 'Waiting Confirmation', color: 'bg-indigo-500 text-white' },
  COMPLETED: { label: 'Completed', color: 'bg-success text-success-foreground' },
  DISPUTED: { label: 'Disputed', color: 'bg-destructive text-destructive-foreground' },
  CANCELLED: { label: 'Cancelled', color: 'bg-secondary text-secondary-foreground' },
  REFUNDED: { label: 'Refunded', color: 'bg-muted text-foreground' },
};

export const ROUTES = {
  home: '/',
  products: '/products',
  login: '/login',
  register: '/register',
  dashboard: '/dashboard',
  seller: '/seller/onboarding',
  admin: '/admin',
  becomeSeller: '/become-a-seller',
};
