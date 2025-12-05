import { auth } from "@/lib/auth";

// BetterAuth expects both GET and POST routed through the same handler.
export const GET = auth.handler;
export const POST = auth.handler;
