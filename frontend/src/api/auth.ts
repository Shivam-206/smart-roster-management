import { apiFetch, cacheCsrfToken } from "./client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER";
  isActive: boolean;
}

async function responseJson<T>(response: Response): Promise<T> {
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Authentication request failed");
  return json.data;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await apiFetch("/api/v1/auth/me");
  if (response.status === 401) return null;
  const data = await responseJson<{ user?: AuthUser } | AuthUser>(response);
  return "user" in data ? data.user || null : data as AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await responseJson<{ user: AuthUser; csrfToken: string }>(response);
  cacheCsrfToken(data.csrfToken);
  return data.user;
}

export async function logout(): Promise<void> {
  const response = await apiFetch("/api/v1/auth/logout", { method: "POST" });
  await responseJson(response);
  cacheCsrfToken(null);
}

export interface ManagedUser extends AuthUser {
  createdAt: string;
}

export async function fetchUsers(): Promise<ManagedUser[]> {
  const response = await apiFetch("/api/v1/auth/users");
  return responseJson(response);
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MANAGER";
}): Promise<ManagedUser> {
  const response = await apiFetch("/api/v1/auth/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return responseJson(response);
}

export async function setUserActive(id: string, isActive: boolean): Promise<ManagedUser> {
  const response = await apiFetch(`/api/v1/auth/users/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  return responseJson(response);
}
