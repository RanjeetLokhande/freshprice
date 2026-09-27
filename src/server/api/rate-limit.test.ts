import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
  it('allows up to the limit per window, then reports retry-after, then resets', () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    const rule = { limit: 3, windowMs: 10_000 };

    expect([rl.hit('u1', rule), rl.hit('u1', rule), rl.hit('u1', rule)]).toEqual([null, null, null]);
    t = 4_000;
    expect(rl.hit('u1', rule)).toBe(6); // 6 s until the window resets
    expect(rl.hit('u2', rule)).toBeNull(); // other keys are independent
    t = 10_000;
    expect(rl.hit('u1', rule)).toBeNull();
  });
});
