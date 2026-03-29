const OFFLINE_ALLOWED_PREFIXES = [
  "/offline",
  "/login",
  "/dashboard/sales",
  "/dashboard/products",
  "/dashboard/expenses",
  "/dashboard/cash",
  "/dashboard/due",
  "/owner/dashboard",
  "/admin/dashboard",
  "/agent/dashboard",
  "/super-admin/dashboard",
];

export function isOfflineCapableRoute(path: string) {
  if (!path) return false;
  if (path === "/dashboard") return true;
  return OFFLINE_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

