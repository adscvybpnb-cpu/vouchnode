import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateReferralCommission } from '../services/referral.service';

describe('referral commission calculation', () => {
  it('credits half of the platform fee regardless of order value', () => {
    const commission = calculateReferralCommission(
      new Prisma.Decimal('2.5'),
    );
    expect(commission.toString()).toBe('1.25');
  });

  it('calculates half of larger platform fees at the same flat share', () => {
    const commission = calculateReferralCommission(
      new Prisma.Decimal('10'),
    );
    expect(commission.toString()).toBe('5');
  });

  it('does not issue a commission when there is no platform fee', () => {
    const commission = calculateReferralCommission(
      new Prisma.Decimal('0'),
    );
    expect(commission.toString()).toBe('0');
  });
});
