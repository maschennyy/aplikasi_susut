import type { NextConfig } from "next";

const LOCAL_FLASK_BASE_URL = "http://127.0.0.1:5000";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function resolveFlaskBaseUrl() {
  const configuredUrl = process.env.FLASK_API_BASE_URL?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

  if (!configuredUrl) {
    if (isProduction) {
      throw new Error(
        "FLASK_API_BASE_URL wajib diisi saat build production. " +
          "Gunakan URL publik backend Flask, misalnya https://api.example.com.",
      );
    }

    return LOCAL_FLASK_BASE_URL;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error(
      "FLASK_API_BASE_URL harus berupa URL absolut yang valid, " +
        "misalnya http://127.0.0.1:5000 atau https://api.example.com.",
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error("FLASK_API_BASE_URL hanya mendukung protokol http atau https.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("FLASK_API_BASE_URL tidak boleh memuat username atau password.");
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error("FLASK_API_BASE_URL tidak boleh memuat query string atau fragment.");
  }

  if (parsedUrl.pathname !== "/") {
    throw new Error(
      "FLASK_API_BASE_URL harus berupa origin backend tanpa path tambahan. " +
        "Gunakan https://api.example.com, bukan https://api.example.com/api.",
    );
  }

  if (isVercelProduction && LOOPBACK_HOSTNAMES.has(parsedUrl.hostname)) {
    throw new Error(
      "FLASK_API_BASE_URL pada Vercel production tidak boleh mengarah ke localhost. " +
        "Gunakan URL publik deployment backend Flask.",
    );
  }

  return parsedUrl.origin;
}

const flaskBaseUrl = resolveFlaskBaseUrl();

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
