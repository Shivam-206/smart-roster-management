import { Server } from "http";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  sessions: new Map<string, Record<string, unknown>>(),
  nextId: 0,
}));

vi.mock("../src/prisma.js", () => {
  const user = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) =>
      [...state.users.values()].find((item) =>
        ("email" in where && item.email === where.email) || ("id" in where && item.id === where.id)
      ) || null
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, string> }) =>
      [...state.users.values()].find((item) =>
        item.role === where.role && (!("isActive" in where) || item.isActive === where.isActive)
      ) || null
    ),
    findMany: vi.fn(async ({ select }: { select: Record<string, boolean> }) =>
      [...state.users.values()].map((item) =>
        Object.fromEntries(Object.entries(select).filter(([, include]) => include).map(([key]) => [key, item[key]]))
      )
    ),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      [...state.users.values()].filter((item) =>
        item.role === where.role && item.isActive === where.isActive
      ).length
    ),
    create: vi.fn(async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const created = {
        id: `00000000-0000-4000-8000-${String(++state.nextId).padStart(12, "0")}`,
        isActive: true,
        createdAt: new Date(),
        ...data,
      };
      state.users.set(created.id as string, created);
      return select
        ? Object.fromEntries(Object.entries(select).filter(([, include]) => include).map(([key]) => [key, created[key]]))
        : created;
    }),
    update: vi.fn(async ({ where, data, select }: {
      where: Record<string, string>;
      data: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      const updated = { ...state.users.get(where.id)!, ...data };
      state.users.set(where.id, updated);
      return select
        ? Object.fromEntries(Object.entries(select).filter(([, include]) => include).map(([key]) => [key, updated[key]]))
        : updated;
    }),
  };
  const userSession = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const created = { id: `session-${++state.nextId}`, ...data };
      state.sessions.set(created.tokenHash as string, created);
      return created;
    }),
    findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) => {
      const session = state.sessions.get(where.tokenHash);
      if (!session) return null;
      return {
        ...session,
        user: [...state.users.values()].find((candidate) => candidate.id === session.userId),
      };
    }),
    delete: vi.fn(async ({ where }: { where: Record<string, string> }) => {
      const entry = [...state.sessions.entries()].find(([, session]) => session.id === where.id);
      if (entry) state.sessions.delete(entry[0]);
      return entry?.[1];
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, string> }) => {
      for (const [hash, session] of state.sessions) {
        if (session.userId === where.userId) state.sessions.delete(hash);
      }
      return { count: 0 };
    }),
  };
  const mockPrisma = {
    user,
    userSession,
    employee: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (callback: (transaction: typeof mockPrisma) => unknown) => callback(mockPrisma)),
  };
  return { prisma: mockPrisma, default: mockPrisma };
});

import { app } from "../src/index.js";
import { loginLimiter } from "../src/routes/authRoutes.js";

let server: Server;
let baseUrl: string;
let adminId: string;
let managerId: string;
const adminPassword = "correct-horse-admin-pass";
const managerPassword = "correct-horse-manager";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

async function signIn(email: string, password: string): Promise<{ cookie: string; csrfToken: string }> {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await response.json();
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    csrfToken: json.data.csrfToken,
  };
}

describe("application authentication and authorization", () => {
  beforeAll(async () => {
    const adminHash = await bcrypt.hash(adminPassword, 4);
    const managerHash = await bcrypt.hash(managerPassword, 4);
    adminId = "00000000-0000-4000-8000-000000000001";
    managerId = "00000000-0000-4000-8000-000000000002";
    state.users.set(adminId, {
      id: adminId, name: "Test Administrator", email: "admin@example.test",
      passwordHash: adminHash, role: "ADMIN", isActive: true, createdAt: new Date(),
    });
    state.users.set(managerId, {
      id: managerId, name: "Test Manager", email: "manager@example.test",
      passwordHash: managerHash, role: "MANAGER", isActive: true, createdAt: new Date(),
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test HTTP server failed to start");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    state.sessions.clear();
    loginLimiter.resetKey("127.0.0.1");
    loginLimiter.resetKey("::ffff:127.0.0.1");
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("allows health checks publicly and protects every application API group from direct unauthenticated calls", async () => {
    expect((await request("/api/health")).status).toBe(200);
    const requests: Array<{ path: string; method: string }> = [
      { path: "/api/v1/employees", method: "GET" },
      { path: "/api/v1/pods", method: "GET" },
      { path: "/api/v1/brands", method: "GET" },
      { path: "/api/v1/processes", method: "GET" },
      { path: "/api/v1/assignments", method: "GET" },
      { path: "/api/v1/availability/weekly-offs", method: "GET" },
      { path: "/api/v1/holidays", method: "GET" },
      { path: "/api/v1/rosters?month=1&year=2200", method: "GET" },
      { path: "/api/v1/rosters/generate", method: "POST" },
      { path: "/api/v1/rosters/00000000-0000-4000-8000-000000000001/revalidate", method: "POST" },
    ];
    for (const { path, method } of requests) {
      const response = await request(path, { method });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it("supports login, generic credential errors, missing credentials, and credential privacy", async () => {
    const missing = await request("/api/v1/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);

    for (const email of ["unknown@example.test", "manager@example.test"]) {
      const response = await request("/api/v1/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "wrong-password" }),
      });
      expect(response.status).toBe(401);
      expect((await response.json()).message).toBe("Invalid email or password");
    }

    const login = await request("/api/v1/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ADMIN@example.test", password: adminPassword }),
    });
    expect(login.status).toBe(200);
    const json = await login.json();
    expect(json.data.user).not.toHaveProperty("passwordHash");
    expect(json.data).toHaveProperty("csrfToken");
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=Lax");

    const previousNodeEnv = process.env.NODE_ENV;
    const previousSameSite = process.env.AUTH_COOKIE_SAME_SITE;
    try {
      process.env.NODE_ENV = "production";
      process.env.AUTH_COOKIE_SAME_SITE = "none";
      const secureLogin = await request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.test", password: adminPassword }),
      });
      expect(secureLogin.headers.get("set-cookie")).toContain("Secure");
      expect(secureLogin.headers.get("set-cookie")).toContain("SameSite=None");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSameSite === undefined) delete process.env.AUTH_COOKIE_SAME_SITE;
      else process.env.AUTH_COOKIE_SAME_SITE = previousSameSite;
    }
  });

  it("authenticates and expires server-side sessions, and supports logout", async () => {
    const session = await signIn("admin@example.test", adminPassword);
    const current = await request("/api/v1/auth/me", { headers: { Cookie: session.cookie } });
    expect(current.status).toBe(200);
    expect((await current.json()).data.role).toBe("ADMIN");

    const sessionEntry = [...state.sessions.entries()][0];
    sessionEntry[1].expiresAt = new Date(Date.now() - 1000);
    const expired = await request("/api/v1/auth/me", { headers: { Cookie: session.cookie } });
    expect(expired.status).toBe(401);

    const active = await signIn("admin@example.test", adminPassword);
    const loggedOut = await request("/api/v1/auth/logout", {
      method: "POST",
      headers: { Cookie: active.cookie, "X-CSRF-Token": active.csrfToken },
    });
    expect(loggedOut.status).toBe(200);
    expect((await request("/api/v1/auth/me", { headers: { Cookie: active.cookie } })).status).toBe(401);
  });

  it("allows manager application access but rejects administrator-only actions", async () => {
    const manager = await signIn("manager@example.test", managerPassword);
    const employees = await request("/api/v1/employees", { headers: { Cookie: manager.cookie } });
    expect(employees.status).toBe(200);

    const users = await request("/api/v1/auth/users", { headers: { Cookie: manager.cookie } });
    expect(users.status).toBe(403);
    const createUser = await request("/api/v1/auth/users", {
      method: "POST",
      headers: { Cookie: manager.cookie, "X-CSRF-Token": manager.csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Another Manager", email: "new@example.test",
        password: "new-secure-password", role: "MANAGER",
      }),
    });
    expect(createUser.status).toBe(403);

    const admin = await signIn("admin@example.test", adminPassword);
    const adminUsers = await request("/api/v1/auth/users", { headers: { Cookie: admin.cookie } });
    expect(adminUsers.status).toBe(200);
    const invalidMasterData = await request("/api/v1/employees", {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(invalidMasterData.status).toBe(400);
    const blockedCsrf = await request("/api/v1/auth/users", { method: "POST", headers: { Cookie: admin.cookie } });
    expect(blockedCsrf.status).toBe(403);
  });

  it("allows administrators to create/deactivate accounts and protects the last active administrator", async () => {
    const admin = await signIn("admin@example.test", adminPassword);
    const createdResponse = await request("/api/v1/auth/users", {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "New Manager",
        email: "new-manager@example.test",
        password: "new-manager-password",
        role: "MANAGER",
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()).data;
    expect(created).not.toHaveProperty("passwordHash");
    const createdRecord = state.users.get(created.id)!;
    expect(createdRecord.passwordHash).not.toBe("new-manager-password");
    expect(await bcrypt.compare("new-manager-password", createdRecord.passwordHash as string)).toBe(true);
    const newUserSession = await signIn("new-manager@example.test", "new-manager-password");

    const deactivated = await request(`/api/v1/auth/users/${created.id}/status`, {
      method: "PATCH",
      headers: {
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive: false }),
    });
    expect((await deactivated.json()).data.isActive).toBe(false);
    expect((await request("/api/v1/auth/me", { headers: { Cookie: newUserSession.cookie } })).status).toBe(401);

    const lastAdmin = await request(`/api/v1/auth/users/${adminId}/status`, {
      method: "PATCH",
      headers: {
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive: false }),
    });
    expect(lastAdmin.status).toBe(409);
  });
});
