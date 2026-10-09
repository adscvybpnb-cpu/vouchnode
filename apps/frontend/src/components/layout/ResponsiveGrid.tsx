import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
};

export function ResponsiveGrid({ children, columns = 3, className, ...props }: ResponsiveGridProps) {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  }[columns];

  return (
    <div
      className={cn('grid w-full min-w-0 grid-cols-1 gap-4 overflow-hidden', columnClasses, className)}
      {...props}
    >
      {children}
    </div>
  );
}
