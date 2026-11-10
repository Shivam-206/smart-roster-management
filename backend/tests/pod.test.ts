import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "http";
import { app } from "../src/index.js";
import { prisma } from "../src/prisma.js";
import { installAuthenticatedTestApi } from "./helpers/authenticatedApi.js";

let server: Server;
let baseUrl: string;
let cleanupAuth: (() => Promise<void>) | undefined;

describe("Phase 2B: Pod Management CRUD API End-to-End Tests", () => {
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

  it("GET /api/v1/pods - should return all 4 seeded operational pods with leads and counts", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pods`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(4);

    const ecomPod = body.data.find((p: any) => p.code === "POD-ECOM");
    expect(ecomPod).toBeDefined();
    expect(ecomPod.name).toContain("E-Commerce");
    expect(ecomPod.lead).toBeDefined();
    expect(ecomPod.lead.employeeCode).toBe("EMP001");
    expect(ecomPod._count.members).toBeGreaterThan(0);
    expect(ecomPod._count.brands).toBeGreaterThan(0);
  });

  it("GET /api/v1/pods/:id - should return single pod with full member list and brands", async () => {
    const seeded = await prisma.pod.findFirstOrThrow({
      where: { code: "POD-FIN" },
    });

    const res = await fetch(`${baseUrl}/api/v1/pods/${seeded.id}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(seeded.id);
    expect(body.data.code).toBe("POD-FIN");
    expect(body.data.lead.employeeCode).toBe("EMP009");
    expect(body.data.members.length).toBeGreaterThan(0);
    expect(body.data.brands.length).toBeGreaterThan(0);
  });

  it("POST /api/v1/pods - should validate required fields and formats", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // missing code and name
        description: "Test description",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Validation failed");
    expect(body.errors.code).toBeDefined();
    expect(body.errors.name).toBeDefined();
  });

  it("POST /api/v1/pods - should reject duplicate pod code and duplicate pod name", async () => {
    // 1. Duplicate code
    const resCode = await fetch(`${baseUrl}/api/v1/pods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "POD-ECOM", // already exists
        name: "Unique New Pod Name",
      }),
    });

    expect(resCode.status).toBe(409);
    const bodyCode = await resCode.json();
    expect(bodyCode.success).toBe(false);
    expect(bodyCode.message).toContain("already in use");

    // 2. Duplicate name
    const resName = await fetch(`${baseUrl}/api/v1/pods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "POD-UNIQUE-XYZ",
        name: "E-Commerce & Retail Ops Pod", // already exists
      }),
    });

    expect(resName.status).toBe(409);
    const bodyName = await resName.json();
    expect(bodyName.success).toBe(false);
    expect(bodyName.message).toContain("already in use");
  });

  it("POST /api/v1/pods - should reject candidate lead who already leads another pod", async () => {
    // EMP001 leads POD-ECOM
    const leadEmp = await prisma.employee.findFirstOrThrow({
      where: { employeeCode: "EMP001" },
    });

    const res = await fetch(`${baseUrl}/api/v1/pods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "POD-NEW-CONFLICT",
        name: "Conflict Pod Attempt",
        leadEmployeeId: leadEmp.id,
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("already the designated Pod Lead");
  });

  it("POST /api/v1/pods - should create an empty pod successfully", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "POD-TEST",
        name: "Strategic Special Projects Pod",
        description: "Temporary pod for high-priority operational incubations.",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("POD-TEST");

    // Verify in database
    const inDb = await prisma.pod.findUnique({
      where: { code: "POD-TEST" },
    });
    expect(inDb).not.toBeNull();
  });

  it("PUT /api/v1/pods/:id - should update pod name, description and lead", async () => {
    const pod = await prisma.pod.findUniqueOrThrow({
      where: { code: "POD-TEST" },
    });

    // Select an employee who is not currently a pod lead
    const availableAssociate = await prisma.employee.findFirstOrThrow({
      where: { isPodLead: false, leadingPod: null },
    });

    const updateRes = await fetch(`${baseUrl}/api/v1/pods/${pod.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Strategic Incubations Pod",
        description: "Updated mission statement.",
        leadEmployeeId: availableAssociate.id,
      }),
    });

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Strategic Incubations Pod");
    expect(body.data.lead.id).toBe(availableAssociate.id);

    // Verify lead employee in database was updated to isPodLead = true and assigned to this pod
    const updatedLead = await prisma.employee.findUniqueOrThrow({
      where: { id: availableAssociate.id },
    });
    expect(updatedLead.isPodLead).toBe(true);
    expect(updatedLead.podId).toBe(pod.id);
  });

  it("PUT /api/v1/pods/:id/members - should transfer employees into pod", async () => {
    const targetPod = await prisma.pod.findUniqueOrThrow({
      where: { code: "POD-TEST" },
    });

    // Find an associate to move
    const memberToMove = await prisma.employee.findFirstOrThrow({
      where: {
        isPodLead: false,
        id: { not: targetPod.leadEmployeeId || "" },
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/pods/${targetPod.id}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeIds: [memberToMove.id],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("Successfully transferred");

    // Verify member in database
    const inDb = await prisma.employee.findUniqueOrThrow({
      where: { id: memberToMove.id },
    });
    expect(inDb.podId).toBe(targetPod.id);
  });

  it("DELETE /api/v1/pods/:id - should protect pods with members or brands from deletion", async () => {
    // 1. Pod with members
    const podWithMembers = await prisma.pod.findFirstOrThrow({
      where: { code: "POD-ECOM" },
    });

    const resMembers = await fetch(`${baseUrl}/api/v1/pods/${podWithMembers.id}`, {
      method: "DELETE",
    });
    expect(resMembers.status).toBe(400);
    const bodyMembers = await resMembers.json();
    expect(bodyMembers.success).toBe(false);
    expect(bodyMembers.message).toContain("assigned employee(s)");
  });

  it("DELETE /api/v1/pods/:id - should safely delete empty pod after members are reassigned", async () => {
    const testPod = await prisma.pod.findUniqueOrThrow({
      where: { code: "POD-TEST" },
      include: { members: true },
    });

    const destinationPod = await prisma.pod.findFirstOrThrow({
      where: { code: "POD-ECOM" },
    });

    // Move any members out of the test pod first
    if (testPod.members.length > 0) {
      await prisma.employee.updateMany({
        where: { podId: testPod.id },
        data: { podId: destinationPod.id, isPodLead: false },
      });
    }

    // Clear lead reference
    await prisma.pod.update({
      where: { id: testPod.id },
      data: { leadEmployeeId: null },
    });

    const deleteRes = await fetch(`${baseUrl}/api/v1/pods/${testPod.id}`, {
      method: "DELETE",
    });

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("safely deleted");

    // Verify deletion from database
    const inDb = await prisma.pod.findUnique({
      where: { id: testPod.id },
    });
    expect(inDb).toBeNull();
  });
});
