const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
let csrfToken: string | null = null;

export function cacheCsrfToken(token: string | null): void {
  csrfToken = token;
}

function urlFor(input: RequestInfo | URL): string {
  return typeof input === "string" ? `${apiBaseUrl}${input}` : input.toString();
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = urlFor(input);
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const isLogin = url.includes("/api/v1/auth/login");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !isLogin) {
    if (!csrfToken) {
      const csrfResponse = await fetch(`${apiBaseUrl}/api/v1/auth/csrf`, { credentials: "include" });
      if (!csrfResponse.ok) {
        window.dispatchEvent(new Event("auth:expired"));
        throw new Error("Your session has expired. Please sign in again.");
      }
      const csrfJson = await csrfResponse.json();
      csrfToken = csrfJson.data.csrfToken;
    }
    headers.set("X-CSRF-Token", csrfToken || "");
  }

  const response = await fetch(url, { ...init, headers, credentials: "include" });
  if (response.status === 401 && !url.includes("/api/v1/auth/login")) {
    csrfToken = null;
    window.dispatchEvent(new Event("auth:expired"));
  }
  return response;
}
