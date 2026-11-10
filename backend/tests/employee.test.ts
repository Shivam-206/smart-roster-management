import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "http";
import { app } from "../src/index.js";
import { prisma } from "../src/prisma.js";
import { installAuthenticatedTestApi } from "./helpers/authenticatedApi.js";

let server: Server;
let baseUrl: string;
let cleanupAuth: (() => Promise<void>) | undefined;

describe("Phase 2A: Employee CRUD API End-to-End Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
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
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await cleanupAuth?.();
    await prisma.$disconnect();
  });

  it("GET /api/v1/employees - should return all 32 seeded employees with pod info", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(32);

    const first = body.data[0];
    expect(first.employeeCode).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.email).toBeDefined();
    expect(first.pod).toBeDefined();
    expect(first.weeklyOffs).toBeDefined();
  });

  it("GET /api/v1/employees?search=... - should filter employees by name or code", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees?search=EMP001`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(body.data[0].employeeCode).toBe("EMP001");
    expect(body.data[0].name).toBe("Aarav Sharma");
  });

  it("GET /api/v1/employees/:id - should return single employee with full relations", async () => {
    const seeded = await prisma.employee.findFirstOrThrow({
      where: { employeeCode: "EMP001" },
    });

    const res = await fetch(`${baseUrl}/api/v1/employees/${seeded.id}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(seeded.id);
    expect(body.data.employeeCode).toBe("EMP001");
    expect(body.data.isPodLead).toBe(true);
    expect(body.data.pod).toBeDefined();
    expect(body.data.weeklyOffs.length).toBeGreaterThan(0);
  });

  it("POST /api/v1/employees - should validate required fields and formats", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // missing employeeCode and name
        email: "not-an-email",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Validation failed");
    expect(body.errors).toBeDefined();
  });

  it("POST /api/v1/employees - should reject duplicate employeeCode and duplicate email", async () => {
    // 1. Try duplicate code
    const resCode = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeCode: "EMP001", // already belongs to Aarav
        name: "Duplicate Code Tester",
        email: "unique.new.email@datastraw-ops.com",
      }),
    });

    expect(resCode.status).toBe(409);
    const bodyCode = await resCode.json();
    expect(bodyCode.success).toBe(false);
    expect(bodyCode.message).toContain("already in use");

    // 2. Try duplicate email
    const resEmail = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeCode: "EMP999",
        name: "Duplicate Email Tester",
        email: "aarav.sharma@datastraw-ops.com", // already belongs to Aarav
      }),
    });

    expect(resEmail.status).toBe(409);
    const bodyEmail = await resEmail.json();
    expect(bodyEmail.success).toBe(false);
    expect(bodyEmail.message).toContain("already registered");
  });

  it("POST /api/v1/employees - should create a new employee and verify persistence in Neon DB", async () => {
    const pod = await prisma.pod.findFirstOrThrow();

    const newEmpPayload = {
      employeeCode: "EMP-TEST01",
      name: "Jordan Sparks",
      email: "jordan.sparks@datastraw-ops.com",
      role: "OPERATIONS_ASSOCIATE",
      podId: pod.id,
      contractType: "FULL_TIME",
      weeklyWorkDays: 5,
      maxConsecutiveDays: 6,
      weeklyOffs: [0, 6],
    };

    const res = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEmpPayload),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.employeeCode).toBe("EMP-TEST01");
    expect(body.data.weeklyOffs.length).toBe(2);

    // Verify in database directly
    const inDb = await prisma.employee.findUnique({
      where: { employeeCode: "EMP-TEST01" },
      include: { weeklyOffs: true },
    });
    expect(inDb).not.toBeNull();
    expect(inDb?.name).toBe("Jordan Sparks");
    expect(inDb?.weeklyOffs.length).toBe(2);
  });

  it("PUT /api/v1/employees/:id - should update employee fields", async () => {
    const emp = await prisma.employee.findUniqueOrThrow({
      where: { employeeCode: "EMP-TEST01" },
    });

    const updateRes = await fetch(`${baseUrl}/api/v1/employees/${emp.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jordan Sparks-Updated",
        role: "SENIOR_OPERATOR",
      }),
    });

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Jordan Sparks-Updated");
    expect(body.data.role).toBe("SENIOR_OPERATOR");

    // Verify in database
    const inDb = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(inDb?.name).toBe("Jordan Sparks-Updated");
    expect(inDb?.role).toBe("SENIOR_OPERATOR");
  });

  it("DELETE /api/v1/employees/:id - should protect referenced employees from accidental deletion", async () => {
    // 1. Pod Lead protection
    const podLead = await prisma.employee.findFirstOrThrow({
      where: { employeeCode: "EMP001" },
    });

    const resLead = await fetch(`${baseUrl}/api/v1/employees/${podLead.id}`, {
      method: "DELETE",
    });
    expect(resLead.status).toBe(400);
    const bodyLead = await resLead.json();
    expect(bodyLead.success).toBe(false);
    expect(bodyLead.message).toContain("Pod Lead");

    // 2. Active assignment protection
    const assignedEmp = await prisma.employee.findFirstOrThrow({
      where: { employeeCode: "EMP002" },
    });
    const resAssign = await fetch(`${baseUrl}/api/v1/employees/${assignedEmp.id}`, {
      method: "DELETE",
    });
    expect(resAssign.status).toBe(400);
    const bodyAssign = await resAssign.json();
    expect(bodyAssign.success).toBe(false);
    expect(bodyAssign.message).toContain("active process assignment");
  });

  it("DELETE /api/v1/employees/:id - should safely delete unreferenced test employee", async () => {
    const testEmp = await prisma.employee.findUniqueOrThrow({
      where: { employeeCode: "EMP-TEST01" },
    });

    const deleteRes = await fetch(`${baseUrl}/api/v1/employees/${testEmp.id}`, {
      method: "DELETE",
    });

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("safely deleted");

    // Verify removal from database
    const inDb = await prisma.employee.findUnique({
      where: { id: testEmp.id },
    });
    expect(inDb).toBeNull();
  });
});
