import { createHmac, randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const IMPERSONATION_RESTORE_COOKIE = "sf_imp_restore";
const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60 * 2;

type RequestCookieMap = Record<string, string>;

export type ImpersonationRestorePayload = {
  originalSessionToken: string;
  actorUserId: string;
  createdAt: string;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function getSigningSecret() {
  return process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "impersonation-secret";
}

function signValue(value: string) {
  return createHmac("sha256", getSigningSecret()).update(value).digest("hex");
}

export function encodeImpersonationRestoreCookie(payload: ImpersonationRestorePayload) {
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(json);
  const signature = signValue(encoded);
  return `${encoded}.${signature}`;
}

export function decodeImpersonationRestoreCookie(
  raw?: string | null,
): ImpersonationRestorePayload | null {
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  if (signValue(encoded) !== signature) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as ImpersonationRestorePayload;
    if (!parsed?.originalSessionToken || !parsed?.actorUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string): RequestCookieMap {
  const out: RequestCookieMap = {};
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[name] = value;
  }
  return out;
}

export async function getAuthCookieDefinitions() {
  const ctx = await auth.$context;
  return ctx.authCookies;
}

function expandCookieNames(name: string) {
  if (name.startsWith("__Secure-")) {
    return [name, name.replace(/^__Secure-/, "")];
  }
  return [name, `__Secure-${name}`];
}

export async function getSessionTokenFromCookieHeader(cookieHeader: string) {
  const cookies = parseCookieHeader(cookieHeader);
  const authCookies = await getAuthCookieDefinitions();
  const primaryName = authCookies?.sessionToken?.name;
  if (!primaryName) return null;
  for (const candidate of expandCookieNames(primaryName)) {
    const value = cookies[candidate];
    if (value) return value;
  }
  return null;
}

export async function getCurrentSessionRecordFromCookieHeader(cookieHeader: string) {
  const token = await getSessionTokenFromCookieHeader(cookieHeader);
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      userId: true,
      expiresAt: true,
      impersonatedBy: true,
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}

export function buildDomainVariants(host: string) {
  const variants: Array<string | undefined> = [undefined];
  const normalized = host.split(":")[0];
  if (normalized && !normalized.includes("localhost") && normalized.includes(".")) {
    variants.push(normalized);
    variants.push(`.${normalized}`);
  }
  return variants;
}

export function resolveProto(host: string, forwardedProto?: string | null, baseURL?: string | null) {
  return (
    forwardedProto ||
    (baseURL?.startsWith("https://") ? "https" : "http") ||
    (host.includes("localhost") ? "http" : "https")
  );
}

export async function setSessionTokenCookie(options: {
  cookieStore: any;
  host: string;
  proto: string;
  token: string;
  expiresAt?: Date;
}) {
  const { cookieStore, host, proto, token, expiresAt } = options;
  const authCookies = await getAuthCookieDefinitions();
  const sessionCookie = authCookies?.sessionToken;
  if (!sessionCookie) {
    throw new Error("Session cookie definition not available");
  }
  const attrs = (sessionCookie.attributes ?? {}) as Record<string, unknown>;
  const sameSite =
    typeof attrs.sameSite === "string"
      ? (attrs.sameSite.toLowerCase() as "lax" | "strict" | "none")
      : attrs.sameSite === true
        ? "lax"
        : undefined;
  const secure =
    typeof attrs.secure === "boolean"
      ? attrs.secure
      : proto === "https" || sessionCookie.name.startsWith("__Secure-");
  const domainVariants = buildDomainVariants(host);
  const names = expandCookieNames(sessionCookie.name);
  for (const name of names) {
    for (const domain of domainVariants) {
      cookieStore.set(name, token, {
        ...(domain ? { domain } : {}),
        ...(sameSite ? { sameSite } : {}),
        httpOnly: true,
        secure: secure || name.startsWith("__Secure-"),
        path: "/",
        ...(expiresAt ? { expires: expiresAt } : { maxAge: IMPERSONATION_MAX_AGE_SECONDS }),
      });
    }
  }
}

export async function clearSessionTokenCookie(options: {
  cookieStore: any;
  host: string;
  proto: string;
}) {
  const { cookieStore, host, proto } = options;
  const authCookies = await getAuthCookieDefinitions();
  const sessionCookie = authCookies?.sessionToken;
  if (!sessionCookie) return;
  const attrs = (sessionCookie.attributes ?? {}) as Record<string, unknown>;
  const sameSite =
    typeof attrs.sameSite === "string"
      ? (attrs.sameSite.toLowerCase() as "lax" | "strict" | "none")
      : attrs.sameSite === true
        ? "lax"
        : undefined;
  const secure =
    typeof attrs.secure === "boolean"
      ? attrs.secure
      : proto === "https" || sessionCookie.name.startsWith("__Secure-");
  for (const name of expandCookieNames(sessionCookie.name)) {
    for (const domain of buildDomainVariants(host)) {
      cookieStore.set(name, "", {
        ...(domain ? { domain } : {}),
        ...(sameSite ? { sameSite } : {}),
        httpOnly: true,
        secure: secure || name.startsWith("__Secure-"),
        path: "/",
        maxAge: 0,
      });
    }
  }
}

export async function clearAuthCacheCookies(options: {
  cookieStore: any;
  host: string;
  proto: string;
}) {
  const { cookieStore, host, proto } = options;
  const authCookies = await getAuthCookieDefinitions();
  const defs = [
    authCookies?.sessionData,
    authCookies?.accountData,
    authCookies?.dontRememberToken,
  ].filter(Boolean);
  const domainVariants = buildDomainVariants(host);
  for (const def of defs) {
    const attrs = (def!.attributes ?? {}) as Record<string, unknown>;
    const sameSite =
      typeof attrs.sameSite === "string"
        ? (attrs.sameSite.toLowerCase() as "lax" | "strict" | "none")
        : attrs.sameSite === true
          ? "lax"
          : undefined;
    const secure =
      typeof attrs.secure === "boolean"
        ? attrs.secure
        : proto === "https" || def!.name.startsWith("__Secure-");
    for (const name of expandCookieNames(def!.name)) {
      for (const domain of domainVariants) {
        cookieStore.set(name, "", {
          ...(domain ? { domain } : {}),
          ...(sameSite ? { sameSite } : {}),
          httpOnly: true,
          secure: secure || name.startsWith("__Secure-"),
          path: "/",
          maxAge: 0,
        });
      }
    }
  }
}

export function setRestoreCookie(options: {
  cookieStore: any;
  host: string;
  proto: string;
  payload: ImpersonationRestorePayload;
}) {
  const { cookieStore, host, proto, payload } = options;
  const domainVariants = buildDomainVariants(host);
  const value = encodeImpersonationRestoreCookie(payload);
  for (const domain of domainVariants) {
    cookieStore.set(IMPERSONATION_RESTORE_COOKIE, value, {
      ...(domain ? { domain } : {}),
      httpOnly: true,
      secure: proto === "https",
      sameSite: "lax",
      path: "/",
      maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    });
  }
}

export function clearRestoreCookie(options: {
  cookieStore: any;
  host: string;
  proto: string;
}) {
  const { cookieStore, host, proto } = options;
  const domainVariants = buildDomainVariants(host);
  for (const domain of domainVariants) {
    cookieStore.set(IMPERSONATION_RESTORE_COOKIE, "", {
      ...(domain ? { domain } : {}),
      httpOnly: true,
      secure: proto === "https",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export function createImpersonationSessionToken() {
  return randomBytes(32).toString("hex");
}
