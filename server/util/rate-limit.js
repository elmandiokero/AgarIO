// Limitadores de tasa simples (token bucket).

export class TokenBucket {
  constructor(ratePerSec, burst, now = Date.now()) {
    this.rate = ratePerSec;
    this.burst = burst;
    this.tokens = burst;
    this.last = now;
  }
  take(n = 1, now = Date.now()) {
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }
}

/** Token buckets por clave (IP, usuario...), con limpieza periódica. */
export class KeyedLimiter {
  constructor(ratePerSec, burst, ttlMs = 10 * 60_000) {
    this.rate = ratePerSec;
    this.burst = burst;
    this.ttl = ttlMs;
    this.map = new Map();
    this.lastSweep = Date.now();
  }
  take(key, n = 1, now = Date.now()) {
    if (now - this.lastSweep > this.ttl) this.sweep(now);
    let b = this.map.get(key);
    if (!b) {
      b = new TokenBucket(this.rate, this.burst, now);
      this.map.set(key, b);
    }
    return b.take(n, now);
  }
  sweep(now = Date.now()) {
    this.lastSweep = now;
    for (const [k, b] of this.map) if (now - b.last > this.ttl) this.map.delete(k);
  }
}
