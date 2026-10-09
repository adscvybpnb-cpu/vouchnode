import { Star } from 'lucide-react';
import { formatDate } from '../../lib/format';
import type { Review } from '../../types/api.types';

export function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="p-4 border border-border rounded-lg bg-card">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
            {review.buyerId.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium">Buyer {review.buyerId.slice(-4)}</div>
            <div className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</div>
          </div>
        </div>
        <div className="flex text-warning">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? 'fill-current' : 'text-muted fill-muted'}`} />
          ))}
        </div>
      </div>
      {review.comment && <p className="text-sm text-foreground mt-3">{review.comment}</p>}
    </div>
  );
}
