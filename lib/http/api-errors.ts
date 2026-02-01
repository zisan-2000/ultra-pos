import { NextResponse } from "next/server";

type ApiErrorResponse = {
  status: number;
  body: { error: string };
};

function normalizeMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Internal server error";
}

function mapError(message: string): ApiErrorResponse {
  const normalized = message.toLowerCase();

  if (normalized.includes("not authenticated")) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  if (normalized.includes("not found")) {
    return { status: 404, body: { error: "Not found" } };
  }

  return { status: 500, body: { error: "Internal server error" } };
}

export function apiErrorResponse(error: unknown) {
  const message = normalizeMessage(error);
  const { status, body } = mapError(message);
  return NextResponse.json(body, { status });
}
