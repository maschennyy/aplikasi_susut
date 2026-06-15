import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import type { ApiErrorBody } from "@/types";

declare module "axios" {
  export interface AxiosRequestConfig {
    skipAuthRedirect?: boolean;
    skipCsrf?: boolean;
    _retry?: boolean;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_STORAGE_KEY = "pln_susut_csrf_token";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/flask-api";
export const FLASK_LOGIN_PATH = process.env.NEXT_PUBLIC_FLASK_LOGIN_PATH || "/flask-login";
export const FLASK_LOGOUT_PATH = process.env.NEXT_PUBLIC_FLASK_LOGOUT_PATH || "/flask-logout";
export const CSRF_REFRESH_PATH = process.env.NEXT_PUBLIC_CSRF_REFRESH_PATH || "/flask-ui/";
export const APP_LOGIN_PATH = process.env.NEXT_PUBLIC_APP_LOGIN_PATH || "/login";

let csrfTokenMemory: string | null = null;
let csrfRequest: Promise<string | null> | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function readStoredCsrfToken() {
  if (!isBrowser()) return null;
  if (csrfTokenMemory) return csrfTokenMemory;
  try {
    csrfTokenMemory = window.localStorage.getItem(CSRF_STORAGE_KEY);
  } catch {
    csrfTokenMemory = null;
  }
  return csrfTokenMemory;
}

function storeCsrfToken(token: string | null) {
  csrfTokenMemory = token;
  if (!isBrowser()) return;
  try {
    if (token) {
      window.localStorage.setItem(CSRF_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(CSRF_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; the in-memory token still works for this tab.
  }
}

function extractCsrfToken(html: string) {
  const metaMatch = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
  if (metaMatch?.[1]) return metaMatch[1];

  const inputMatch = html.match(/<input[^>]+name=["']csrf_token["'][^>]+value=["']([^"']+)["']/i);
  return inputMatch?.[1] || null;
}

async function fetchCsrfToken() {
  if (!isBrowser()) return null;

  const candidates = [CSRF_REFRESH_PATH, FLASK_LOGIN_PATH].filter(Boolean);
  for (const path of candidates) {
    const response = await fetch(path, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "text/html",
      },
    });
    const html = await response.text();
    const token = extractCsrfToken(html);
    if (token) {
      storeCsrfToken(token);
      return token;
    }
  }

  storeCsrfToken(null);
  return null;
}

export async function getCsrfToken(options: { force?: boolean } = {}) {
  if (!options.force) {
    const existing = readStoredCsrfToken();
    if (existing) return existing;
  }

  if (!csrfRequest) {
    csrfRequest = fetchCsrfToken().finally(() => {
      csrfRequest = null;
    });
  }

  return csrfRequest;
}

export function clearCsrfToken() {
  storeCsrfToken(null);
}

function getRedirectTarget() {
  if (!isBrowser()) return APP_LOGIN_PATH;
  const next = `${window.location.pathname}${window.location.search}`;
  return `${APP_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

function isCsrfError(error: AxiosError<ApiErrorBody>) {
  const message = error.response?.data?.error || error.response?.data?.message || "";
  return error.response?.status === 403 && /csrf/i.test(message);
}

function shouldAttachCsrf(config: InternalAxiosRequestConfig) {
  const method = (config.method || "GET").toUpperCase();
  return isBrowser() && !config.skipCsrf && !SAFE_METHODS.has(method);
}

function toAxiosHeaders(headers: unknown) {
  return AxiosHeaders.from(headers as AxiosHeaders | Record<string, string> | undefined);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  config.withCredentials = true;

  if (shouldAttachCsrf(config)) {
    const token = await getCsrfToken();
    if (token) {
      const headers = toAxiosHeaders(config.headers);
      headers.set("X-CSRFToken", token);
      config.headers = headers;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as AxiosRequestConfig | undefined;

    if (config && isCsrfError(error) && !config._retry) {
      config._retry = true;
      const token = await getCsrfToken({ force: true });
      if (token) {
        const headers = toAxiosHeaders(config.headers);
        headers.set("X-CSRFToken", token);
        config.headers = headers;
      }
      return api.request(config);
    }

    if (error.response?.status === 401 && isBrowser() && !config?.skipAuthRedirect) {
      window.location.assign(getRedirectTarget());
    }

    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown, fallback = "Terjadi kesalahan saat memuat data.") {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
