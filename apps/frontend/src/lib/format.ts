export function formatAmount(amount: number | string, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const code = (currency || 'USD').toUpperCase();

  if (['USD', 'USDT', 'USDC'].includes(code)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(num);
  }

  if (['BTC', 'ETH', 'BNB', 'SOL', 'LTC', 'TRX', 'BCH', 'GRAM'].includes(code)) {
    const decimals = code === 'BTC' || code === 'ETH' || code === 'LTC' || code === 'BCH' ? 6 : 4;
    return `${code} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: decimals })}`;
  }

  return `${code} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'relative' = 'short'): string {
  const d = new Date(date);
  if (format === 'long') {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(d);
  }
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export function getTimeRemaining(deadline: string): { days: number; hours: number; minutes: number; seconds: number; expired: boolean } {
  const total = Date.parse(deadline) - Date.now();
  if (total <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  
  return { days, hours, minutes, seconds, expired: false };
}

export function calculateDiscount(original: number, current: number): number {
  if (original <= 0 || current >= original) return 0;
  return Math.round(((original - current) / original) * 100);
}

export function formatOrderNumber(orderNumber: string): string {
  return `#${orderNumber.toUpperCase().slice(-8)}`;
}
