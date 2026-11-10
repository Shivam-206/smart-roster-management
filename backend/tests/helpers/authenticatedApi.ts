import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

export async function installAuthenticatedTestApi(baseUrl: string, prisma: PrismaClient): Promise<() => Promise<void>> {
  const originalFetch = globalThis.fetch;
  const email = `auth-test-${randomUUID()}@example.test`;
  const password = "test-only-authentication-password";
  const user = await prisma.user.create({
    data: {
      name: "API Integration Test Administrator",
      email,
      passwordHash: await bcrypt.hash(password, 4),
      role: "ADMIN",
    },
  });
  const login = await originalFetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    await prisma.user.delete({ where: { id: user.id } });
    throw new Error(`Could not authenticate integration-test client (${login.status})`);
  }
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  const loginJson = await login.json();
  const csrfToken = loginJson.data.csrfToken as string;
  if (!cookie || !csrfToken) {
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    throw new Error("Authentication response was missing test session metadata");
  }

  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.startsWith(`${baseUrl}/api/v1/`) || url.includes("/api/v1/auth/login")) {
      return originalFetch(input, init);
    }
    const headers = new Headers(init.headers);
    headers.set("Cookie", cookie);
    if (!["GET", "HEAD", "OPTIONS"].includes((init.method || "GET").toUpperCase())) {
      headers.set("X-CSRF-Token", csrfToken);
    }
    return originalFetch(input, { ...init, headers });
  };

  return async () => {
    globalThis.fetch = originalFetch;
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  };
}
