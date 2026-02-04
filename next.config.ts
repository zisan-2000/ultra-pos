import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const resolvedDistDir =
  process.env.NEXT_DIST_DIR ||
  (process.env.VERCEL ? ".next" : ".next-build");

const nextConfig: NextConfig = {
  distDir: resolvedDistDir,
  experimental: {},
};

export default withBundleAnalyzer(nextConfig);
