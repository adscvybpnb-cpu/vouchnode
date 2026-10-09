'use client';

import { useState, useEffect } from 'react';
import { getTimeRemaining } from '../lib/format';

export function useCountdown(deadline: string | null) {
  const [timeLeft, setTimeLeft] = useState(() => 
    deadline ? getTimeRemaining(deadline) : { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  );

  useEffect(() => {
    if (!deadline) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
      return;
    }

    const timer = setInterval(() => {
      const remaining = getTimeRemaining(deadline);
      setTimeLeft(remaining);
      if (remaining.expired) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  let urgency: 'normal' | 'warning' | 'critical' = 'normal';
  if (!timeLeft.expired) {
    const totalMinutes = timeLeft.days * 24 * 60 + timeLeft.hours * 60 + timeLeft.minutes;
    if (totalMinutes < 15) urgency = 'critical';
    else if (totalMinutes < 60) urgency = 'warning';
  }

  return { ...timeLeft, urgency };
}
