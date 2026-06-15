export type Role = "admin" | "operator" | "viewer" | "auditor";

export type User = {
  id: number;
  username: string;
  nama_lengkap: string | null;
  email: string | null;
  role: Role;
  aktif: boolean;
  last_login_at: string | null;
};

export type ApiResponse<T> = T & {
  error?: string;
  message?: string;
};

export type ApiErrorBody = {
  error?: string;
  message?: string;
  errors?: unknown;
  blockers?: string[];
};

export type SidebarStats = {
  gi_aktif: number;
  alert_count: number;
};
