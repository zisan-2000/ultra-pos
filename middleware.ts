import { auth } from "@/lib/auth";

export default auth.middleware;

export const config = {
  matcher: ["/dashboard/:path*"],
};
