import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/scrapers/lib/rate-limiter.js';

describe('RateLimiter', () => {
  it('resolves immediately on first call', async () => {
    const limiter = new RateLimiter(10);
    const start = Date.now();
    await limiter.wait();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('waits at least interval ms between calls', async () => {
    const limiter = new RateLimiter(5); // 200ms interval
    await limiter.wait();
    const start = Date.now();
    await limiter.wait();
    expect(Date.now() - start).toBeGreaterThanOrEqual(180);
  });
});
