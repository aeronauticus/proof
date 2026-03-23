import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rewrite /uploads/* to /api/uploads/* so that existing DB paths
  // (stored as /uploads/category/file) are served by the API route handler
  // instead of Next.js static file serving (which only serves build-time files).
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "/api/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
