import { isIP } from 'node:net';
import { config } from '../config';

export function normalizeAvatarUrl(value: string | null | undefined): string | null {
  const rawUrl = value?.trim();
  if (!rawUrl) return null;

  const apiUrl = new URL(config.app.apiUrl);
  const isProduction = config.app.env === 'production';
  const avatarUrl = new URL(rawUrl, `${apiUrl.origin}/`);

  if (!isProduction) return avatarUrl.toString();

  if (isIP(avatarUrl.hostname.replace(/^\[|\]$/g, ''))) {
    return new URL(`${avatarUrl.pathname}${avatarUrl.search}${avatarUrl.hash}`, apiUrl.origin).toString();
  }

  if (avatarUrl.protocol === 'http:') avatarUrl.protocol = 'https:';

  return avatarUrl.toString();
}
