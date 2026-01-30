import { createHash } from "crypto";
import { NextResponse } from "next/server";

type EtagOptions = {
  cacheControl?: string;
  vary?: string;
  status?: number;
};

const normalizeTag = (value: string) =>
  value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");

const matchesEtag = (ifNoneMatch: string | null, etag: string) => {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const target = normalizeTag(etag);
  return ifNoneMatch
    .split(",")
    .map((tag) => normalizeTag(tag))
    .some((tag) => tag === target);
};

export function jsonWithEtag(
  req: Request,
  body: unknown,
  options: EtagOptions = {}
) {
  const json = JSON.stringify(body) ?? "null";
  const etag = `"${createHash("sha1").update(json).digest("hex")}"`;
  const headers = new Headers();

  headers.set("ETag", etag);
  if (options.cacheControl) {
    headers.set("Cache-Control", options.cacheControl);
  }
  headers.set("Vary", options.vary ?? "Authorization, Cookie");

  const ifNoneMatch = req.headers.get("if-none-match");
  if (matchesEtag(ifNoneMatch, etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  headers.set("Content-Type", "application/json; charset=utf-8");
  return new NextResponse(json, {
    status: options.status ?? 200,
    headers,
  });
}
