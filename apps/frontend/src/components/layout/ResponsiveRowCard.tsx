import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ResponsiveRowCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function ResponsiveRowCard({ children, className, ...props }: ResponsiveRowCardProps) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col items-stretch gap-2 overflow-hidden p-3 sm:gap-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
