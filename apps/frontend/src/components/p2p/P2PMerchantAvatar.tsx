'use client';

import { useState } from 'react';

interface P2PMerchantAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className: string;
  imageClassName?: string;
}

export function P2PMerchantAvatar({
  name,
  avatarUrl,
  className,
  imageClassName = 'h-full w-full object-cover',
}: P2PMerchantAvatarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`}>
      {avatarUrl && failedAvatarUrl !== avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${name} avatar`}
          onError={() => setFailedAvatarUrl(avatarUrl)}
          className={imageClassName}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-400 to-cyan-500 font-bold text-slate-950">
          {(name.trim().charAt(0) || '?').toUpperCase()}
        </span>
      )}
    </div>
  );
}
