import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Phase 1.5: Neon Live PostgreSQL Database Verification", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should have exactly 32 employees in PostgreSQL", async () => {
    const count = await prisma.employee.count();
    expect(count).toBe(32);
  });

  it("should have exactly 4 operational pods with verified pod leads", async () => {
    const pods = await prisma.pod.findMany({
      include: {
        lead: true,
        members: true,
      },
    });

    expect(pods.length).toBe(4);
    for (const pod of pods) {
      expect(pod.leadEmployeeId).not.toBeNull();
      expect(pod.lead).toBeDefined();
      expect(pod.lead?.isPodLead).toBe(true);
      expect(pod.members.length).toBeGreaterThan(0);
    }
  });

  it("should have exactly 14 brands with 11 single-resource (~80%) and 3 multi-resource", async () => {
    const brands = await prisma.brand.findMany({
      include: {
        processes: {
          include: {
            assignments: {
              include: {
                employee: true,
              },
            },
          },
        },
      },
    });

    expect(brands.length).toBe(14);

    const singleResourceBrands = brands.filter((b) => b.isSingleResource);
    const multiResourceBrands = brands.filter((b) => !b.isSingleResource);

    expect(singleResourceBrands.length).toBe(11);
    expect(multiResourceBrands.length).toBe(3);

    const ratio = singleResourceBrands.length / brands.length;
    expect(ratio).toBeCloseTo(0.7857, 2);

    // Verify each single-resource brand has exactly 1 distinct primary employee
    for (const brand of singleResourceBrands) {
      const primaryEmployeeIds = new Set<string>();
      const backupEmployeeIds = new Set<string>();

      for (const proc of brand.processes) {
        for (const assign of proc.assignments) {
          if (assign.assignmentType === "PRIMARY") {
            primaryEmployeeIds.add(assign.employeeId);
          } else {
            backupEmployeeIds.add(assign.employeeId);
          }
        }
      }

      expect(primaryEmployeeIds.size).toBe(1);
      // Contingency backup check: Must have at least one contingency resource
      expect(backupEmployeeIds.size).toBeGreaterThanOrEqual(1);
    }

    // Verify multi-resource brands have 2-3 primary employees
    for (const brand of multiResourceBrands) {
      const primaryEmployeeIds = new Set<string>();
      for (const proc of brand.processes) {
        for (const assign of proc.assignments) {
          if (assign.assignmentType === "PRIMARY") {
            primaryEmployeeIds.add(assign.employeeId);
          }
        }
      }
      expect(primaryEmployeeIds.size).toBeGreaterThanOrEqual(2);
      expect(primaryEmployeeIds.size).toBeLessThanOrEqual(3);
    }
  });

  it("should have exactly 16 processes covering all 3 calendar types", async () => {
    const processes = await prisma.process.findMany();
    expect(processes.length).toBe(16);

    const calendarTypes = new Set(processes.map((p) => p.calendarType));
    expect(calendarTypes.has("ALL_365_DAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_PUBLIC_HOLIDAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS")).toBe(true);
  });

  it("should have 38 process assignments stored correctly", async () => {
    const count = await prisma.employeeProcessAssignment.count();
    expect(count).toBe(38);
  });

  it("should have 64 weekly off records (2 offs per employee for 32 employees)", async () => {
    const count = await prisma.employeeWeeklyOff.count();
    expect(count).toBe(64);
  });

  it("should have 6 public holidays and 4 approved leaves in database", async () => {
    const holidayCount = await prisma.publicHoliday.count();
    const leaveCount = await prisma.employeeLeave.count();

    expect(holidayCount).toBe(6);
    expect(leaveCount).toBe(4);
  });

  it("should verify RosterShift supports non-working entries with null processId", async () => {
    // Create a temporary test roster
    const testRoster = await prisma.roster.create({
      data: {
        monthYear: "9999-12",
        status: "DRAFT",
      },
    });

    const firstEmployee = await prisma.employee.findFirstOrThrow();

    // Insert a non-working shift (WEEKLY_OFF with null processId)
    const offShift = await prisma.rosterShift.create({
      data: {
        rosterId: testRoster.id,
        shiftDate: "9999-12-01",
        employeeId: firstEmployee.id,
        status: "WEEKLY_OFF",
        processId: null,
      },
    });

    expect(offShift.status).toBe("WEEKLY_OFF");
    expect(offShift.processId).toBeNull();

    // Clean up test records
    await prisma.rosterShift.delete({ where: { id: offShift.id } });
    await prisma.roster.delete({ where: { id: testRoster.id } });
  });
});
