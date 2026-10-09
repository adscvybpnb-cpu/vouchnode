'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ProductImage } from '../../types/api.types';
import { cn } from '../../lib/utils';

export function ProductGallery({ images }: { images: ProductImage[] }) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (!images || images.length === 0) {
    return <div className="aspect-square bg-muted rounded-xl flex items-center justify-center text-muted-foreground">No Image</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square bg-muted rounded-xl overflow-hidden border border-border">
        <Image
          src={images[activeIdx].url}
          alt="Product"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setActiveIdx(idx)}
              className={cn(
                "w-20 h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all",
                activeIdx === idx ? "border-primary opacity-100" : "border-transparent opacity-60 hover:opacity-100"
              )}
            >
              <img src={img.url} alt="Thumbnail" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
