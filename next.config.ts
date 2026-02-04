import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next-build",
  experimental: {},
};

export default withBundleAnalyzer(nextConfig);
