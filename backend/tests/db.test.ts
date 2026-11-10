import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  seedAssignments,
  seedBrands,
  seedEmployees,
  seedLeaves,
  seedPods,
  seedProcesses,
  seedPublicHolidays,
} from "../prisma/seedData.js";

const prisma = new PrismaClient();

describe("Phase 1.5: Neon Live PostgreSQL Database Verification", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should retain the configured employee records", async () => {
    const employees = await prisma.employee.findMany({
      where: { employeeCode: { in: seedEmployees.map((employee) => employee.employeeCode) } },
      select: { employeeCode: true },
    });
    const employeeCodes = new Set(employees.map((employee) => employee.employeeCode));
    for (const expected of seedEmployees) {
      expect(employeeCodes.has(expected.employeeCode)).toBe(true);
    }
  });

  it("should retain the configured operational pods with verified pod leads", async () => {
    const pods = await prisma.pod.findMany({
      where: { code: { in: seedPods.map((pod) => pod.code) } },
      select: {
        code: true,
        name: true,
        lead: { select: { employeeCode: true, isPodLead: true } },
        members: { select: { id: true } },
      },
    });

    const podByCode = new Map(pods.map((pod) => [pod.code, pod]));
    for (const expected of seedPods) {
      const pod = podByCode.get(expected.code);
      expect(pod).toBeDefined();
      if (!pod) continue;
      expect(pod).toMatchObject({
        name: expected.name,
        lead: { employeeCode: expected.leadEmployeeCode, isPodLead: true },
      });
      expect(pod.members.length).toBeGreaterThan(0);
    }
  });

  it("should retain the configured brands and their resource classifications", async () => {
    const brands = await prisma.brand.findMany({
      where: { code: { in: seedBrands.map((brand) => brand.code) } },
      select: {
        code: true,
        name: true,
        isSingleResource: true,
      },
    });

    const brandByCode = new Map(brands.map((brand) => [brand.code, brand]));
    for (const expected of seedBrands) {
      expect(brandByCode.get(expected.code)).toMatchObject({
        name: expected.name,
        isSingleResource: expected.isSingleResource,
      });
    }
  });

  it("should retain the configured process fixtures across the supported calendar types", async () => {
    const processes = await prisma.process.findMany({
      where: { code: { in: seedProcesses.map((process) => process.code) } },
      select: { code: true, name: true, calendarType: true },
    });
    const processByCode = new Map(processes.map((process) => [process.code, process]));
    for (const expected of seedProcesses) {
      expect(processByCode.get(expected.code)).toMatchObject({
        name: expected.name,
        calendarType: expected.calendarType,
      });
    }

    const calendarTypes = new Set(processes.map((p) => p.calendarType));
    expect(calendarTypes.has("ALL_365_DAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_PUBLIC_HOLIDAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS")).toBe(true);
  });

  it("should retain the configured employee-process assignment fixtures", async () => {
    const assignments = await prisma.employeeProcessAssignment.findMany({
      where: {
        OR: seedAssignments.map((assignment) => ({
          employee: { employeeCode: assignment.employeeCode },
          process: { code: assignment.processCode },
        })),
      },
      select: {
        employee: { select: { employeeCode: true } },
        process: { select: { code: true } },
        assignmentType: true,
        priorityRank: true,
      },
    });
    const assignmentKeys = new Set(assignments.map((assignment) =>
      `${assignment.employee.employeeCode}:${assignment.process.code}:${assignment.assignmentType}:${assignment.priorityRank}`
    ));
    for (const expected of seedAssignments) {
      expect(assignmentKeys.has(
        `${expected.employeeCode}:${expected.processCode}:${expected.assignmentType}:${expected.priorityRank}`
      )).toBe(true);
    }
  });

  it("should retain the configured standard weekly offs", async () => {
    const employees = await prisma.employee.findMany({
      where: { employeeCode: { in: seedEmployees.map((employee) => employee.employeeCode) } },
      select: {
        employeeCode: true,
        weeklyOffs: {
          where: { isStandard: true },
          select: { dayOfWeek: true },
        },
      },
    });
    const weeklyOffsByEmployee = new Map(employees.map((employee) => [
      employee.employeeCode,
      new Set(employee.weeklyOffs.map((weeklyOff) => weeklyOff.dayOfWeek)),
    ]));
    for (const expected of seedEmployees) {
      const weeklyOffs = weeklyOffsByEmployee.get(expected.employeeCode);
      for (const dayOfWeek of expected.standardWeeklyOffs) {
        expect(weeklyOffs?.has(dayOfWeek)).toBe(true);
      }
    }
  });

  it("should retain the configured public holidays and approved leave fixtures", async () => {
    const holidays = await prisma.publicHoliday.findMany({
      where: { date: { in: seedPublicHolidays.map((holiday) => holiday.date) } },
      select: { date: true, name: true },
    });
    const holidayByDate = new Map(holidays.map((holiday) => [holiday.date, holiday.name]));
    for (const expected of seedPublicHolidays) {
      expect(holidayByDate.get(expected.date)).toBe(expected.name);
    }

    for (const expected of seedLeaves) {
      const leave = await prisma.employeeLeave.findFirst({
        where: {
          employee: { employeeCode: expected.employeeCode },
          startDate: expected.startDate,
          endDate: expected.endDate,
          leaveType: expected.leaveType,
          status: expected.status,
        },
      });
      expect(leave, `expected leave fixture for ${expected.employeeCode}`).not.toBeNull();
    }
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
