import { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => null) },
    userSession: {},
  },
  default: {},
}));

import { app } from "../src/index.js";

let server: Server;
let baseUrl: string;

describe("login rate limiting", () => {
  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test HTTP server failed to start");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("limits repeated login attempts", async () => {
    const results: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.test", password: "wrong-password" }),
      });
      results.push(response.status);
    }
    expect(results.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(results[5]).toBe(429);
  });
});
