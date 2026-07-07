import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";


const nextConfig: NextConfig = {
  // Pin the workspace root — a stray package-lock.json in the home dir makes Next.js guess wrong
  turbopack: { root: __dirname },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
