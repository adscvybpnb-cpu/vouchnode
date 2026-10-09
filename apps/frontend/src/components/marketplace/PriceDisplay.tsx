export function PriceDisplay({
  originalPrice,
  currentPrice,
  currency = 'USD',
}: {
  originalPrice?: number;
  currentPrice?: number;
  currency?: string;
}) {
  const hasOriginal = typeof originalPrice === 'number' && originalPrice > 0;
  const finalCurrent = typeof currentPrice === 'number' ? currentPrice : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-3xl font-bold text-white">{currency} {finalCurrent.toFixed(2)}</span>
      {hasOriginal && originalPrice !== finalCurrent && (
        <span className="text-lg text-slate-400 line-through">{currency} {originalPrice.toFixed(2)}</span>
      )}
    </div>
  );
}