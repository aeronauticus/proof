import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rewrite /uploads/* to /api/uploads/* BEFORE static file lookup.
  // Next.js only serves public/ files from build time, so runtime uploads
  // need to be routed to the API handler. "beforeFiles" ensures this rewrite
  // runs before Next.js checks the public/ directory.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/uploads/:path*",
          destination: "/api/uploads/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
