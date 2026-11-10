import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "http";
import { app } from "../src/index.js";
import { prisma } from "../src/prisma.js";
import { installAuthenticatedTestApi } from "./helpers/authenticatedApi.js";

let server: Server;
let baseUrl: string;
let cleanupAuth: (() => Promise<void>) | undefined;

describe("Phase 2C: Brand & Process Management CRUD API End-to-End Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
    // Clean up any test records from prior interrupted runs
    await prisma.processCoverageRule.deleteMany({
      where: { process: { code: { startsWith: "PRC-TEST" } } },
    });
    await prisma.process.deleteMany({
      where: { code: { startsWith: "PRC-TEST" } },
    });
    await prisma.brand.deleteMany({
      where: { code: { startsWith: "BRD-TEST" } },
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
    cleanupAuth = await installAuthenticatedTestApi(baseUrl, prisma);
  });

  afterAll(async () => {
    // Final cleanup of test records
    await prisma.processCoverageRule.deleteMany({
      where: { process: { code: { startsWith: "PRC-TEST" } } },
    });
    await prisma.process.deleteMany({
      where: { code: { startsWith: "PRC-TEST" } },
    });
    await prisma.brand.deleteMany({
      where: { code: { startsWith: "BRD-TEST" } },
    });

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await cleanupAuth?.();
    await prisma.$disconnect();
  });

  // Brands Tests
  it("GET /api/v1/brands - should return all 14 seeded brands with pod info", async () => {
    const res = await fetch(`${baseUrl}/api/v1/brands`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(14);

    const aurora = body.data.find((b: any) => b.code === "BRD-AUR");
    expect(aurora).toBeDefined();
    expect(aurora.isSingleResource).toBe(true);
    expect(aurora.pod).toBeDefined();
    expect(aurora.processes.length).toBeGreaterThan(0);
  });

  it("GET /api/v1/brands/:id - should return single brand with full process details", async () => {
    const seeded = await prisma.brand.findFirstOrThrow({
      where: { code: "BRD-NEX" },
    });

    const res = await fetch(`${baseUrl}/api/v1/brands/${seeded.id}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(seeded.id);
    expect(body.data.isSingleResource).toBe(false); // multi-resource
    expect(body.data.processes.length).toBeGreaterThanOrEqual(2);
  });

  it("POST /api/v1/brands - should validate required fields and reject duplicate code", async () => {
    // 1. Missing fields
    const resEmpty = await fetch(`${baseUrl}/api/v1/brands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(resEmpty.status).toBe(400);

    // 2. Duplicate code
    const pod = await prisma.pod.findFirstOrThrow();
    const resDup = await fetch(`${baseUrl}/api/v1/brands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "BRD-AUR", // already exists
        name: "Aurora Duplicate",
        podId: pod.id,
      }),
    });
    expect(resDup.status).toBe(409);
    const bodyDup = await resDup.json();
    expect(bodyDup.message).toContain("already in use");
  });

  it("POST /api/v1/brands - should create a brand successfully", async () => {
    const pod = await prisma.pod.findFirstOrThrow();

    const res = await fetch(`${baseUrl}/api/v1/brands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "BRD-TEST",
        name: "Test Brand Incubator",
        description: "Special incubator brand for automated test validation.",
        podId: pod.id,
        isSingleResource: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("BRD-TEST");

    // Verify in database
    const inDb = await prisma.brand.findUnique({ where: { code: "BRD-TEST" } });
    expect(inDb).not.toBeNull();
  });

  it("PUT /api/v1/brands/:id - should update brand details", async () => {
    const brand = await prisma.brand.findUniqueOrThrow({ where: { code: "BRD-TEST" } });

    const res = await fetch(`${baseUrl}/api/v1/brands/${brand.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brand Incubator Updated",
        isSingleResource: false,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Test Brand Incubator Updated");
    expect(body.data.isSingleResource).toBe(false);
  });

  it("DELETE /api/v1/brands/:id - should protect brands with active processes from deletion", async () => {
    const brandWithProcesses = await prisma.brand.findFirstOrThrow({
      where: { code: "BRD-AUR" },
    });

    const res = await fetch(`${baseUrl}/api/v1/brands/${brandWithProcesses.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("active employee assignment");
  });

  // Processes Tests
  it("GET /api/v1/processes - should return all 16 seeded processes covering 3 calendar models", async () => {
    const res = await fetch(`${baseUrl}/api/v1/processes`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(16);

    const calendarTypes = new Set(body.data.map((p: any) => p.calendarType));
    expect(calendarTypes.has("ALL_365_DAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_PUBLIC_HOLIDAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS")).toBe(true);
  });

  it("POST /api/v1/processes - should create a process under brand with calendar validation", async () => {
    const testBrand = await prisma.brand.findUniqueOrThrow({ where: { code: "BRD-TEST" } });

    const res = await fetch(`${baseUrl}/api/v1/processes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "PRC-TEST-01",
        name: "Test Processing Queue",
        brandId: testBrand.id,
        calendarType: "ALL_365_DAYS",
        defaultMinStaff: 2,
        description: "Continuous daily queue handling test.",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("PRC-TEST-01");
    expect(body.data.calendarType).toBe("ALL_365_DAYS");
    expect(body.data.defaultMinStaff).toBe(2);

    // Verify in database
    const inDb = await prisma.process.findUnique({ where: { code: "PRC-TEST-01" } });
    expect(inDb).not.toBeNull();
  });

  it("PUT /api/v1/processes/:id - should update process calendar and min staffing", async () => {
    const proc = await prisma.process.findUniqueOrThrow({ where: { code: "PRC-TEST-01" } });

    const res = await fetch(`${baseUrl}/api/v1/processes/${proc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendarType: "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS",
        defaultMinStaff: 3,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.calendarType).toBe("ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS");
    expect(body.data.defaultMinStaff).toBe(3);
  });

  it("DELETE /api/v1/processes/:id - should protect processes with active assignments from deletion", async () => {
    const procWithAssignments = await prisma.process.findFirstOrThrow({
      where: { code: "PRC-AUR-OPS" },
    });

    const res = await fetch(`${baseUrl}/api/v1/processes/${procWithAssignments.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("assigned employee(s)");
  });

  it("DELETE /api/v1/processes/:id and brand - should safely delete unassigned test records", async () => {
    const testProc = await prisma.process.findUniqueOrThrow({ where: { code: "PRC-TEST-01" } });
    const testBrand = await prisma.brand.findUniqueOrThrow({ where: { code: "BRD-TEST" } });

    // 1. Delete test process
    const resProc = await fetch(`${baseUrl}/api/v1/processes/${testProc.id}`, {
      method: "DELETE",
    });
    expect(resProc.status).toBe(200);

    const inDbProc = await prisma.process.findUnique({ where: { id: testProc.id } });
    expect(inDbProc).toBeNull();

    // 2. Delete test brand now that process is gone
    const resBrand = await fetch(`${baseUrl}/api/v1/brands/${testBrand.id}`, {
      method: "DELETE",
    });
    expect(resBrand.status).toBe(200);

    const inDbBrand = await prisma.brand.findUnique({ where: { id: testBrand.id } });
    expect(inDbBrand).toBeNull();
  });
});
