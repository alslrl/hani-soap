import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const config: NextConfig = {
  distDir: process.env.HANI_BUILD_DIR || ".next",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  devIndicators: false,
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./data/demo/patients.seed.json", "./data/demo/demo.schema.json", "./data/*_출처기록.json"],
    "/api/**/*": ["./data/**/*.jsonl", "./data/**/*.txt"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self)" },
    ] }];
  },
};
export default withWorkflow(config);
