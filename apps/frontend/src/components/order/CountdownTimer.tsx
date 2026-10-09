'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Clock } from 'lucide-react';

interface CountdownTimerProps {
  serverDeadline: string; // ISO 8601 string from backend
  onExpire?: () => void;
  className?: string;
}

export function CountdownTimer({ serverDeadline, onExpire, className }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const deadlineTime = new Date(serverDeadline).getTime();

    const calculateTimeLeft = () => {
      const now = Date.now();
      const difference = deadlineTime - now;

      if (difference <= 0) {
        setIsExpired(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        onExpire?.();
        return;
      }

      setTimeLeft({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      });
    };

    calculateTimeLeft();
    const timerId = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timerId);
  }, [serverDeadline, onExpire]);

  if (!timeLeft) return <div className="animate-pulse h-6 w-24 bg-muted rounded"></div>;

  // Change color to warning/danger as time runs out (less than 1 hour = warning, less than 15 mins = danger)
  const totalMinutesLeft = timeLeft.days * 24 * 60 + timeLeft.hours * 60 + timeLeft.minutes;
  let colorClass = "text-success";
  if (totalMinutesLeft < 60) colorClass = "text-warning";
  if (totalMinutesLeft < 15) colorClass = "text-destructive";
  if (isExpired) colorClass = "text-destructive opacity-80";

  return (
    <div className={cn("flex items-center gap-1.5 font-mono font-medium", colorClass, className)}>
      <Clock className="w-4 h-4" />
      {isExpired ? (
        <span>EXPIRED</span>
      ) : (
        <span>
          {timeLeft.days > 0 && `${timeLeft.days}d `}
          {String(timeLeft.hours).padStart(2, '0')}:
          {String(timeLeft.minutes).padStart(2, '0')}:
          {String(timeLeft.seconds).padStart(2, '0')}
        </span>
      )}
    </div>
  );
}
