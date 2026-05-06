const OFFLINE_ALLOWED_PREFIXES = [
  "/offline",
  "/login",
  "/dashboard/sales",
  "/dashboard/products",
  "/dashboard/expenses",
  "/dashboard/cash",
  "/dashboard/due",
];

export function isOfflineCapableRoute(path: string) {
  if (!path) return false;
  return OFFLINE_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}
