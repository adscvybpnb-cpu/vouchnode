import { useId } from 'react';

export function VouchNodesLogo({ logoUrl }: { logoUrl?: string }) {
  const gradientId = `logoGrad-${useId().replace(/:/g, '')}`;

  if (logoUrl && !logoUrl.endsWith('favicon.svg')) {
    return <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain" />;
  }

  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="9" fill={`url(#${gradientId})`} />
      <rect x="6" y="12" width="24" height="16" rx="2.5" fill="white" fillOpacity="0.15" />
      <rect x="6" y="12" width="24" height="5" rx="2" fill="white" fillOpacity="0.3" />
      <rect x="16.5" y="12" width="3" height="16" fill="white" fillOpacity="0.5" />
      <rect x="6" y="16.5" width="24" height="2" fill="white" fillOpacity="0.35" />
      <ellipse cx="15" cy="12" rx="4" ry="3.5" transform="rotate(-20 15 12)" fill="white" fillOpacity="0.7" />
      <ellipse cx="21" cy="12" rx="4" ry="3.5" transform="rotate(20 21 12)" fill="white" fillOpacity="0.7" />
      <circle cx="18" cy="12" r="2.5" fill="white" />
      <path d="M20 21l-4 4.5h3l-1 3.5 4-4.5h-3l1-3.5z" fill="#FBBF24" />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
