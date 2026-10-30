'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { API_ORIGIN } from '@/lib/constants';

interface P2PMerchantAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className: string;
  imageClassName?: string;
}

export const P2PMerchantAvatar = memo(function P2PMerchantAvatar({
  name,
  avatarUrl,
  className,
  imageClassName = 'h-full w-full object-cover',
}: P2PMerchantAvatarProps) {
  const rawAvatarUrl = avatarUrl?.trim();
  const resolvedAvatarUrl = rawAvatarUrl
    ? (() => {
        if (/^(data|blob):/i.test(rawAvatarUrl)) return rawAvatarUrl;
        const baseUrl = API_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
        const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(rawAvatarUrl) || rawAvatarUrl.startsWith('//');
        if (!baseUrl && !isAbsoluteUrl) return rawAvatarUrl;
        const url = baseUrl
          ? new URL(rawAvatarUrl, `${baseUrl}/`)
          : new URL(rawAvatarUrl);
        const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':');
        if (url.protocol === 'http:' && baseUrl.startsWith('https://')) {
          if (isIpAddress) {
            return new URL(`${url.pathname}${url.search}${url.hash}`, baseUrl).toString();
          }
          url.protocol = 'https:';
        }
        return url.toString();
      })()
    : null;
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [loadedAvatarUrl, setLoadedAvatarUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (resolvedAvatarUrl && image?.complete && image.naturalWidth > 0) {
      setLoadedAvatarUrl(resolvedAvatarUrl);
    }
  }, [resolvedAvatarUrl]);

  return (
    <div className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 ${className}`}>
      {resolvedAvatarUrl && failedAvatarUrl !== resolvedAvatarUrl ? (
        <img
          src={resolvedAvatarUrl}
          ref={imageRef}
          alt={`${name} avatar`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedAvatarUrl(resolvedAvatarUrl)}
          onError={() => setFailedAvatarUrl(resolvedAvatarUrl)}
          className={`${imageClassName} transition-opacity duration-200 ${loadedAvatarUrl === resolvedAvatarUrl ? 'opacity-100' : 'opacity-0 blur-sm'}`}
        />
      ) : null}
      {(!resolvedAvatarUrl || failedAvatarUrl === resolvedAvatarUrl || loadedAvatarUrl !== resolvedAvatarUrl) && (
        <span className="absolute inset-0 flex items-center justify-center font-bold text-emerald-100">
          {(name.trim().charAt(0) || '?').toUpperCase()}
        </span>
      )}
    </div>
  );
});
