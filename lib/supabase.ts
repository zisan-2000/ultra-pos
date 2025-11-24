import { createBrowserClient } from "@supabase/ssr";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function createServerClientForRoute(cookies: any) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookies.set(name, value, options);
          } catch (e) {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookies.set(name, "", options);
          } catch (e) {}
        },
      },
    }
  );
}
