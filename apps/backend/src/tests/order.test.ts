import { describe, it, expect } from 'vitest';
import { canTransition } from '../state-machines/order.state-machine';

describe('Order State Machine', () => {
  it('should allow valid transitions', () => {
    expect(canTransition('CREATED', 'PAYMENT_PENDING')).toBe(true);
    expect(canTransition('PAYMENT_PENDING', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'DELIVERED')).toBe(true);
    expect(canTransition('WAITING_BUYER_CONFIRMATION', 'COMPLETED')).toBe(true);
    expect(canTransition('DISPUTE_OPEN', 'WAITING_BUYER_CONFIRMATION')).toBe(true);
    expect(canTransition('DISPUTED_WAITING_SELLER', 'WAITING_BUYER_CONFIRMATION')).toBe(true);
    expect(canTransition('DISPUTED_WAITING_BUYER', 'WAITING_BUYER_CONFIRMATION')).toBe(true);
  });

  it('should deny invalid transitions', () => {
    expect(canTransition('CREATED', 'PAID')).toBe(false);
    expect(canTransition('COMPLETED', 'REFUNDED')).toBe(false);
    expect(canTransition('CANCELLED', 'PAID')).toBe(false);
    expect(canTransition('ESCALATED_TO_ADMIN', 'WAITING_BUYER_CONFIRMATION')).toBe(false);
  });
});
