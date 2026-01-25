import http from "http";

try {
  // Load .env for standalone realtime server (safe in dev/prod).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch {
  // Ignore if dotenv is not available or env is already provided.
}
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import { auth } from "../lib/auth";
import {
  type RealtimeEventName,
  type RealtimeEventPayload,
  REALTIME_EVENTS,
} from "../lib/realtime/events";
import {
  getUserWithRolesAndPermissions,
  type UserContext,
} from "../lib/rbac";
import { assertShopAccess } from "../lib/shop-access";

const PORT = Number(process.env.REALTIME_PORT || process.env.PORT || 4001);
const API_SECRET = process.env.REALTIME_API_SECRET;
const REDIS_URL = process.env.REALTIME_REDIS_URL || process.env.REDIS_URL;
const EMIT_WINDOW_MS = Number(process.env.REALTIME_EMIT_WINDOW_MS || 60_000);
const EMIT_MAX = Number(process.env.REALTIME_EMIT_MAX || 120);
const AUDIT_EMITS = process.env.REALTIME_AUDIT_LOG !== "0";
const MAX_BODY_BYTES = 256 * 1024;

const rawOrigins =
  process.env.REALTIME_ALLOWED_ORIGINS ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";
const allowedOrigins = rawOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedEvents = new Set(Object.values(REALTIME_EVENTS));
const shopIdPattern = /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/;

type RateBucket = { count: number; resetAt: number };
const emitBuckets = new Map<string, RateBucket>();

function nowMs() {
  return Date.now();
}

function getClientIp(req: http.IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim() || "unknown";
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp;
  return req.socket.remoteAddress || "unknown";
}

function rateLimitEmit(req: http.IncomingMessage) {
  const ip = getClientIp(req);
  const key = `emit:${ip}`;
  const now = nowMs();
  const windowMs = Number.isFinite(EMIT_WINDOW_MS) ? EMIT_WINDOW_MS : 60_000;
  const max = Number.isFinite(EMIT_MAX) ? EMIT_MAX : 120;
  const bucket = emitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    emitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfter: Math.ceil(windowMs / 1000) };
  }

  bucket.count += 1;
  emitBuckets.set(key, bucket);

  if (bucket.count > max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { limited: true, retryAfter };
  }

  return {
    limited: false,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function shopRoom(shopId: string) {
  return `shop:${shopId}`;
}

function parseBearer(value?: string | string[] | null) {
  if (!value) return null;
  const header = Array.isArray(value) ? value[0] : value;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

async function verifyAccessToken(token: string) {
  const api = (auth as any)?.api;
  if (!api?.verifyJWT) return null;
  const result = await api.verifyJWT({ body: { token } });
  return result?.data?.payload ?? result?.payload ?? null;
}

async function resolveSessionFromCookie(cookieHeader?: string) {
  if (!cookieHeader) return null;
  const api = (auth as any)?.api;
  if (!api?.getSession) return null;
  const result = await api.getSession({
    headers: { cookie: cookieHeader },
  });
  return {
    session: result?.data?.session ?? result?.session ?? null,
    user: result?.data?.user ?? result?.user ?? null,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/emit") {
    const rate = rateLimitEmit(req);
    if (rate.limited) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfter),
      });
      res.end(JSON.stringify({ ok: false, error: "Too many requests" }));
      return;
    }

    const authHeader = parseBearer(req.headers.authorization);
    if (!API_SECRET || authHeader !== API_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > MAX_BODY_BYTES) {
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}") as RealtimeEventPayload;
        if (!parsed?.event || !parsed?.shopId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
          return;
        }

        const event = parsed.event as RealtimeEventName;
        if (!allowedEvents.has(event)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid event" }));
          return;
        }

        if (!shopIdPattern.test(parsed.shopId)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid shopId" }));
          return;
        }

        const payload: RealtimeEventPayload = {
          event,
          shopId: parsed.shopId,
          data: parsed.data,
          at: parsed.at ?? Date.now(),
        };

        io.to(shopRoom(parsed.shopId)).emit(event, payload);
        if (AUDIT_EMITS) {
          console.info("[realtime] emit", {
            event,
            shopId: parsed.shopId,
            ip: getClientIp(req),
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  },
  connectionStateRecovery: {},
});

io.use(async (socket, next) => {
  try {
    const headerToken = parseBearer(
      socket.handshake.headers.authorization as string | undefined
    );
    const authToken = socket.handshake.auth?.token as string | undefined;
    const token = headerToken || authToken;
    let userId: string | undefined;

    if (token) {
      const payload = await verifyAccessToken(token);
      userId =
        (payload?.sub as string | undefined) ||
        (payload?.userId as string | undefined) ||
        (payload?.id as string | undefined);
    }

    if (!userId) {
      const session = await resolveSessionFromCookie(
        socket.handshake.headers.cookie
      );
      userId =
        (session?.session?.userId as string | undefined) ||
        (session?.user?.id as string | undefined);
    }

    if (!userId) {
      return next(new Error("Unauthorized"));
    }

    const user = await getUserWithRolesAndPermissions(userId);
    if (!user) {
      return next(new Error("Unauthorized"));
    }

    socket.data.userId = userId;
    socket.data.user = user;
    return next();
  } catch (error) {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const user = socket.data.user as UserContext;

  socket.on(
    "shop:join",
    async (
      payload: { shopId?: string },
      ack?: (response: { ok: boolean; error?: string }) => void
    ) => {
      const shopId = payload?.shopId;
      if (!shopId) {
        ack?.({ ok: false, error: "shopId required" });
        return;
      }
      try {
        await assertShopAccess(shopId, user);
        await socket.join(shopRoom(shopId));
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: "Unauthorized" });
      }
    }
  );

  socket.on("shop:leave", async (payload: { shopId?: string }) => {
    if (!payload?.shopId) return;
    await socket.leave(shopRoom(payload.shopId));
  });
});

let redisPub: RedisClientType | null = null;
let redisSub: RedisClientType | null = null;

async function configureRedisAdapter() {
  if (!REDIS_URL) return;
  redisPub = createClient({ url: REDIS_URL });
  redisSub = redisPub.duplicate();

  redisPub.on("error", (err) => {
    console.error("[realtime] Redis pub error", err);
  });
  redisSub.on("error", (err) => {
    console.error("[realtime] Redis sub error", err);
  });

  await Promise.all([redisPub.connect(), redisSub.connect()]);
  io.adapter(createAdapter(redisPub, redisSub));
  console.log("[realtime] Redis adapter enabled");
}

async function shutdown(signal: string) {
  console.log(`[realtime] shutting down (${signal})`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([redisPub?.quit(), redisSub?.quit()]);
  process.exit(0);
}

async function start() {
  await configureRedisAdapter();
  server.listen(PORT, () => {
    console.log(`Realtime server listening on :${PORT}`);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((err) => {
  console.error("[realtime] failed to start", err);
  process.exit(1);
});
