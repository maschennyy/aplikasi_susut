"use client";

export {
  getCurrentUser,
  loginWithPassword,
  logout,
  useAuth,
} from "@/lib/auth";
export type {
  AuthState,
  AuthState as UseAuthResult,
  LoginPayload,
  UseAuthOptions,
} from "@/lib/auth";
