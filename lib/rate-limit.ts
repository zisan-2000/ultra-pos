import { createClient } from "redis";

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
const cleanupIntervalMs = 5 * 60_000;
let lastCleanupAt = 0;

type RedisClient = ReturnType<typeof createClient>;

type RedisGlobal = {
  rateLimitRedis?: RedisClient;
  rateLimitRedisPromise?: Promise<RedisClient | null>;
};

const globalForRedis = globalThis as unknown as RedisGlobal;
let redisWarningLogged = false;

const REDIS_URL =
  process.env.RATE_LIMIT_REDIS_URL ||
  process.env.REDIS_URL ||
  process.env.REALTIME_REDIS_URL;

function getClientKey(req: Request, prefix = "rl"): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",").map((s) => s.trim())[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

function cleanupBuckets(now: number) {
  if (now - lastCleanupAt < cleanupIntervalMs) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

async function getRedisClient(): Promise<RedisClient | null> {
  if (!REDIS_URL) return null;

  if (globalForRedis.rateLimitRedis) {
    return globalForRedis.rateLimitRedis;
  }

  if (!globalForRedis.rateLimitRedisPromise) {
    globalForRedis.rateLimitRedisPromise = (async () => {
      try {
        const client = createClient({ url: REDIS_URL });
        client.on("error", (err) => {
          if (!redisWarningLogged) {
            redisWarningLogged = true;
            console.warn("[rate-limit] Redis error, falling back to memory", err);
          }
        });
        await client.connect();
        globalForRedis.rateLimitRedis = client;
        return client;
      } catch (err) {
        if (!redisWarningLogged) {
          redisWarningLogged = true;
          console.warn("[rate-limit] Redis unavailable, using memory", err);
        }
        return null;
      }
    })();
  }

  return globalForRedis.rateLimitRedisPromise;
}

export async function rateLimit(
  req: Request,
  { windowMs, max, keyPrefix }: RateLimitOptions,
) {
  const key = getClientKey(req, keyPrefix);
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  const redis = await getRedisClient();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSec);
      }

      let ttl = await redis.ttl(key);
      if (ttl <= 0) {
        await redis.expire(key, windowSec);
        ttl = windowSec;
      }

      return {
        limited: count > max,
        headers: { "Retry-After": String(Math.max(1, ttl)) },
      };
    } catch (err) {
      if (!redisWarningLogged) {
        redisWarningLogged = true;
        console.warn("[rate-limit] Redis failure, using memory", err);
      }
    }
  }

  const now = Date.now();
  cleanupBuckets(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      limited: false,
      headers: { "Retry-After": String(windowSec) },
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      limited: true,
      headers: { "Retry-After": String(retryAfterSec) },
    };
  }

  return {
    limited: false,
    headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) },
  };
}
