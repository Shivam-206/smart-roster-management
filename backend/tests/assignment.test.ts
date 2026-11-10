import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "http";
import { app } from "../src/index.js";
import { prisma } from "../src/prisma.js";
import { installAuthenticatedTestApi } from "./helpers/authenticatedApi.js";

let server: Server;
let baseUrl: string;
let cleanupAuth: (() => Promise<void>) | undefined;
let activeEmployeeId: string;
let inactiveEmployeeId: string;
let activeEmployeeCode: string;
let processId: string;
let secondProcessId: string;
let brandId: string;
let podId: string;
let primaryAssignmentId: string;

const requestAssignment = (body: Record<string, unknown>) =>
  fetch(`${baseUrl}/api/v1/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Employee-process assignment management API", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const brand = await prisma.brand.findFirstOrThrow();
    podId = brand.podId;
    brandId = brand.id;
    const uniqueSuffix = Date.now().toString(36);
    const [process, secondProcess] = await Promise.all([
      prisma.process.create({
        data: {
          code: `AT-${uniqueSuffix}-1`,
          name: "Assignment Test Process",
          brandId,
          calendarType: "CUSTOM",
          defaultMinStaff: 1,
        },
      }),
      prisma.process.create({
        data: {
          code: `AT-${uniqueSuffix}-2`,
          name: "Assignment Test Process 2",
          brandId,
          calendarType: "CUSTOM",
          defaultMinStaff: 1,
        },
      }),
    ]);
    processId = process.id;
    secondProcessId = secondProcess.id;
    activeEmployeeCode = `EMPAT${uniqueSuffix}`;
    const employeeData = {
      employeeCode: activeEmployeeCode,
      name: "Assignment Test Employee",
      email: `assignment-${uniqueSuffix}@example.com`,
      podId,
    };
    const activeEmployee = await prisma.employee.create({ data: employeeData });
    const inactiveEmployee = await prisma.employee.create({
      data: { ...employeeData, employeeCode: `${activeEmployeeCode}I`, email: `assignment-inactive-${uniqueSuffix}@example.com`, isActive: false },
    });
    activeEmployeeId = activeEmployee.id;
    inactiveEmployeeId = inactiveEmployee.id;

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
    cleanupAuth = await installAuthenticatedTestApi(baseUrl, prisma);
  });

  afterAll(async () => {
    const testEmployeeIds = [activeEmployeeId, inactiveEmployeeId].filter(Boolean);
    if (testEmployeeIds.length) {
      await prisma.employeeProcessAssignment.deleteMany({
        where: { employeeId: { in: testEmployeeIds } },
      });
      await prisma.employee.deleteMany({ where: { id: { in: testEmployeeIds } } });
    }
    const testProcessIds = [processId, secondProcessId].filter(Boolean);
    if (testProcessIds.length) {
      await prisma.process.deleteMany({ where: { id: { in: testProcessIds } } });
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await cleanupAuth?.();
    await prisma.$disconnect();
  });

  it("lists assignments with employee, process, brand, and pod details and filters", async () => {
    const createdPrimary = await requestAssignment({
      employeeId: activeEmployeeId,
      processId,
      assignmentType: "PRIMARY",
    });
    expect(createdPrimary.status).toBe(201);
    primaryAssignmentId = (await createdPrimary.json()).data.id;

    const createdSecond = await requestAssignment({
      employeeId: activeEmployeeId,
      processId: secondProcessId,
      assignmentType: "SECONDARY_BACKUP",
    });
    expect(createdSecond.status).toBe(201);

    const response = await fetch(
      `${baseUrl}/api/v1/assignments?employeeId=${activeEmployeeId}&brandId=${brandId}&podId=${podId}`
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].employee.name).toBe("Assignment Test Employee");
    expect(body.data[0].employee.pod.id).toBe(podId);
    expect(body.data[0].process.brand.id).toBe(brandId);
    expect(body.data[0].process.brand.pod.id).toBe(podId);

    const byProcess = await fetch(`${baseUrl}/api/v1/assignments?processId=${processId}`);
    expect((await byProcess.json()).data.some((item: { id: string }) => item.id === primaryAssignmentId)).toBe(true);

    const invalidFilter = await fetch(`${baseUrl}/api/v1/assignments?employeeId=not-a-uuid`);
    expect(invalidFilter.status).toBe(400);
  });

  it("creates assignments, allows multiple processes per employee, and rejects duplicates", async () => {
    const duplicate = await requestAssignment({
      employeeId: activeEmployeeId,
      processId,
      assignmentType: "FLOAT",
    });
    expect(duplicate.status).toBe(409);

    const invalidTier = await requestAssignment({
      employeeId: activeEmployeeId,
      processId,
      assignmentType: "INVALID",
    });
    expect(invalidTier.status).toBe(400);
  });

  it("updates assignment tier and validates unsupported tiers", async () => {
    const response = await fetch(`${baseUrl}/api/v1/assignments/${primaryAssignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentType: "FLOAT" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.assignmentType).toBe("FLOAT");

    const invalidTier = await fetch(`${baseUrl}/api/v1/assignments/${primaryAssignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentType: "INVALID" }),
    });
    expect(invalidTier.status).toBe(400);
  });

  it("rejects missing or inactive employees and invalid entity IDs", async () => {
    const inactive = await requestAssignment({
      employeeId: inactiveEmployeeId,
      processId,
      assignmentType: "PRIMARY",
    });
    expect(inactive.status).toBe(400);
    expect((await inactive.json()).message).toContain("inactive");

    const invalidEmployeeId = await requestAssignment({
      employeeId: "00000000-0000-4000-8000-000000000001",
      processId,
    });
    expect(invalidEmployeeId.status).toBe(400);

    const invalidProcessId = await requestAssignment({
      employeeId: activeEmployeeId,
      processId: "00000000-0000-4000-8000-000000000002",
    });
    expect(invalidProcessId.status).toBe(400);

    const malformedId = await fetch(`${baseUrl}/api/v1/assignments/not-a-uuid`);
    expect(malformedId.status).toBe(400);
  });

  it("deletes an assignment and reports assignments that do not exist", async () => {
    const response = await fetch(`${baseUrl}/api/v1/assignments/${primaryAssignmentId}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect(await prisma.employeeProcessAssignment.findUnique({ where: { id: primaryAssignmentId } })).toBeNull();

    const missing = await fetch(`${baseUrl}/api/v1/assignments/${primaryAssignmentId}`, {
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
  });
});
