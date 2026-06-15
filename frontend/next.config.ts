import type { NextConfig } from "next";

const flaskBaseUrl = process.env.FLASK_API_BASE_URL || "http://localhost:5000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/flask-api/:path*",
        destination: `${flaskBaseUrl}/api/:path*`,
      },
      {
        source: "/flask-login",
        destination: `${flaskBaseUrl}/login`,
      },
      {
        source: "/flask-logout",
        destination: `${flaskBaseUrl}/logout`,
      },
    ];
  },
};

export default nextConfig;
