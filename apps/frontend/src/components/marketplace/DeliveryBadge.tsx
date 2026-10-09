export function DeliveryBadge({ type }: { type?: 'INSTANT' | 'MANUAL' | string }) {
  const isInstant = type === 'INSTANT';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        isInstant
          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      }`}
    >
      <span className="text-sm">{isInstant ? '⚡' : '⏱️'}</span>
      <span>{isInstant ? 'Automatic Delivery' : 'Manual Delivery'}</span>
    </div>
  );
}