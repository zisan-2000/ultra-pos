type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix?: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getClientKey(req: Request, prefix = "rl"): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",").map((s) => s.trim())[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

export function rateLimit(
  req: Request,
  { windowMs, max, keyPrefix }: RateLimitOptions,
) {
  const key = getClientKey(req, keyPrefix);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      limited: false,
      headers: { "Retry-After": Math.ceil(windowMs / 1000).toString() },
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      limited: true,
      headers: { "Retry-After": retryAfterSec.toString() },
    };
  }

  return {
    limited: false,
    headers: { "Retry-After": Math.ceil((bucket.resetAt - now) / 1000).toString() },
  };
}
