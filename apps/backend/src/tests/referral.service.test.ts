import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateReferralCommission } from '../services/referral.service';

describe('referral commission calculation', () => {
  it('caps the 1% reward at 20% of the platform fee', () => {
    const commission = calculateReferralCommission(
      new Prisma.Decimal('100'),
      new Prisma.Decimal('2.5'),
    );
    expect(commission.toString()).toBe('0.5');
  });

  it('uses 1% when that amount is below the platform-fee cap', () => {
    const commission = calculateReferralCommission(
      new Prisma.Decimal('100'),
      new Prisma.Decimal('10'),
    );
    expect(commission.toString()).toBe('1');
  });

  it('does not issue a commission when there is no platform fee', () => {
    const commission = calculateReferralCommission(
      new Prisma.Decimal('100'),
      new Prisma.Decimal('0'),
    );
    expect(commission.toString()).toBe('0');
  });

  it('applies configured commission and platform-fee cap percentages', () => {
    const commission = calculateReferralCommission(
      new Prisma.Decimal('100'),
      new Prisma.Decimal('5'),
      new Prisma.Decimal('0.025'),
      new Prisma.Decimal('0.1'),
    );
    expect(commission.toString()).toBe('0.5');
  });
});
