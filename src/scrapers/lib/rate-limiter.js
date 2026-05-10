export class RateLimiter {
  constructor(requestsPerSecond) {
    this.intervalMs = 1000 / requestsPerSecond;
    this.lastRequest = 0;
  }

  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.intervalMs) {
      await new Promise(r => setTimeout(r, this.intervalMs - elapsed));
    }
    this.lastRequest = Date.now();
  }
}
