/**
 * ImagineAI — Lightweight Sliding-Window Per-IP Rate Limiter
 * Protects endpoints from automated burst abuse without requiring user accounts.
 */

function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function createRateLimiter({ windowMs = 60000, maxRequests = 15 } = {}) {
  const hits = new Map();

  function check(req) {
    const ip = getClientIp(req);
    const now = Date.now();
    const cutoff = now - windowMs;

    let timestamps = hits.get(ip) || [];
    timestamps = timestamps.filter((ts) => ts > cutoff);

    if (timestamps.length >= maxRequests) {
      hits.set(ip, timestamps);
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds
      };
    }

    timestamps.push(now);
    hits.set(ip, timestamps);

    // Occasional cleanup to prevent unbounded memory growth
    if (hits.size > 1000) {
      for (const [key, list] of hits.entries()) {
        if (!list.some((ts) => ts > cutoff)) {
          hits.delete(key);
        }
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - timestamps.length),
      retryAfterSeconds: 0
    };
  }

  function reset() {
    hits.clear();
  }

  return { check, reset };
}

module.exports = { createRateLimiter, getClientIp };
