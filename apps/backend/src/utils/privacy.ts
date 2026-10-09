export function maskUsername(username: string | null | undefined): string {
  const value = (username || 'Buyer').trim();
  const visibleLength = Math.min(4, Math.max(3, value.length));
  return `${value.slice(0, visibleLength)}***`;
}
