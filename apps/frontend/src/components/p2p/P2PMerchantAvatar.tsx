'use client';

import { memo, useEffect, useState } from 'react';

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
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  useEffect(() => {
    setFailedAvatarUrl(null);
    setAvatarLoaded(false);
  }, [avatarUrl]);

  return (
    <div className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 ${className}`}>
      {avatarUrl && failedAvatarUrl !== avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${name} avatar`}
          loading="lazy"
          decoding="async"
          onLoad={() => setAvatarLoaded(true)}
          onError={() => setFailedAvatarUrl(avatarUrl)}
          className={`${imageClassName} transition-opacity duration-200 ${avatarLoaded ? 'opacity-100' : 'opacity-0 blur-sm'}`}
        />
      ) : null}
      {(!avatarUrl || failedAvatarUrl === avatarUrl || !avatarLoaded) && (
        <span className="absolute inset-0 flex items-center justify-center font-bold text-emerald-100">
          {(name.trim().charAt(0) || '?').toUpperCase()}
        </span>
      )}
    </div>
  );
});
