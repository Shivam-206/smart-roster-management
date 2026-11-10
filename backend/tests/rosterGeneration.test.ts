import { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { prisma } from "../src/prisma.js";
import { installAuthenticatedTestApi } from "./helpers/authenticatedApi.js";

let server: Server;
let baseUrl: string;
let cleanupAuth: (() => Promise<void>) | undefined;
let employeeId = "";
let processId = "";
let brandId = "";
let podId = "";
let rosterId = "";
let holidayId = "";
let compOffId = "";
let month = 1;
let year = 2200;
let monthYear = "";
let firstDate = "";
let secondDate = "";
let thirdDate = "";
let fourthDate = "";

const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api/v1${path}`, init);
const postJson = (path: string, body: unknown) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("Monthly roster generation API", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const brand = await prisma.brand.findFirstOrThrow();
    brandId = brand.id;
    podId = brand.podId;
    for (year = 2200; year < 2300; year += 1) {
      for (month = 1; month <= 12; month += 1) {
        monthYear = `${year}-${month.toString().padStart(2, "0")}`;
        const existing = await prisma.roster.findUnique({ where: { monthYear }, select: { id: true } });
        if (!existing) break;
      }
      if (month <= 12 && !(await prisma.roster.findUnique({ where: { monthYear }, select: { id: true } }))) break;
    }
    if (year >= 2300) throw new Error("Could not find an unused roster month for the API test");

    const suffix = Date.now().toString(36);
    const employee = await prisma.employee.create({
      data: {
        employeeCode: `EMPR${suffix}`,
        name: "Roster API Test Employee",
        email: `roster-api-${suffix}@example.com`,
        isActive: true,
        podId,
        weeklyWorkDays: 7,
        maxConsecutiveDays: 14,
      },
    });
    employeeId = employee.id;
    const process = await prisma.process.create({
      data: {
        code: `PRC-RG-${suffix}`.slice(0, 30),
        name: "Roster API Test Process",
        brandId: brand.id,
        calendarType: "ALL_365_DAYS",
        defaultMinStaff: 1,
      },
    });
    processId = process.id;
    await prisma.employeeProcessAssignment.create({
      data: { employeeId, processId, assignmentType: "PRIMARY" },
    });
    const datePart = (day: number) => `${monthYear}-${day.toString().padStart(2, "0")}`;
    firstDate = datePart(1);
    secondDate = datePart(2);
    thirdDate = datePart(3);
    fourthDate = datePart(4);
    const compOff = await prisma.employeeLeave.create({
      data: {
        employeeId,
        startDate: firstDate,
        endDate: firstDate,
        leaveType: "COMP_OFF",
        status: "APPROVED",
      },
    });
    compOffId = compOff.id;
    await prisma.employeeWeeklyOff.create({
      data: { employeeId, dayOfWeek: 1, isStandard: false, specificDate: thirdDate },
    });
    await prisma.employeeLeave.create({
      data: {
        employeeId,
        startDate: fourthDate,
        endDate: fourthDate,
        leaveType: "ANNUAL",
        status: "APPROVED",
      },
    });
    const holiday = await prisma.publicHoliday.create({
      data: { date: secondDate, name: "Roster API Test Holiday", isMandatoryOff: true },
    });
    holidayId = holiday.id;
    await prisma.processCoverageRule.create({
      data: { processId, dateOverride: firstDate, requiredStaffCount: 2 },
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
    cleanupAuth = await installAuthenticatedTestApi(baseUrl, prisma);
  });

  afterAll(async () => {
    if (rosterId) await prisma.roster.deleteMany({ where: { id: rosterId } });
    if (holidayId) await prisma.publicHoliday.deleteMany({ where: { id: holidayId } });
    if (employeeId) await prisma.employeeLeave.deleteMany({ where: { employeeId } });
    if (processId) {
      await prisma.processCoverageRule.deleteMany({ where: { processId } });
      await prisma.employeeProcessAssignment.deleteMany({ where: { processId } });
      await prisma.process.deleteMany({ where: { id: processId } });
    }
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupAuth?.();
    await prisma.$disconnect();
  });

  it("validates month/year, persists generated shifts and conflicts atomically, and rejects duplicate month generation", async () => {
    const invalidMonth = await postJson("/rosters/generate", { month: 13, year });
    expect(invalidMonth.status).toBe(400);
    const invalidYear = await postJson("/rosters/generate", { month, year: 1899 });
    expect(invalidYear.status).toBe(400);
    const invalidTypes = await postJson("/rosters/generate", { month: "1", year: "2200" });
    expect(invalidTypes.status).toBe(400);

    const response = await postJson("/rosters/generate", { month, year });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.monthYear).toBe(monthYear);
    expect(body.data.status).toBe("DRAFT");
    expect(body.data.summary.totalScheduleEntries).toBe(body.data.shifts.length);
    expect(body.data.summary.totalConflicts).toBe(body.data.conflicts.length);
    expect(body.data.summary.totalAssignedShifts).toBeGreaterThan(0);
    expect(body.data.summary.unfilledPositions).toBeGreaterThan(0);
    rosterId = body.data.id;

    const employeeFirstDay = body.data.shifts.find(
      (shift: { employeeId: string; shiftDate: string }) =>
        shift.employeeId === employeeId && shift.shiftDate === firstDate
    );
    expect(employeeFirstDay?.status).toBe("COMP_OFF");
    const employeeHoliday = body.data.shifts.find(
      (shift: { employeeId: string; shiftDate: string }) =>
        shift.employeeId === employeeId && shift.shiftDate === secondDate
    );
    expect(employeeHoliday?.status).toBe("HOLIDAY");

    const [persistedRoster, persistedShifts, persistedConflicts] = await Promise.all([
      prisma.roster.findUnique({ where: { id: rosterId } }),
      prisma.rosterShift.count({ where: { rosterId } }),
      prisma.rosterConflict.count({ where: { rosterId } }),
    ]);
    expect(persistedRoster?.monthYear).toBe(monthYear);
    expect(persistedShifts).toBe(body.data.shifts.length);
    expect(persistedConflicts).toBe(body.data.conflicts.length);

    const duplicate = await postJson("/rosters/generate", { month, year });
    expect(duplicate.status).toBe(409);
    expect(await prisma.roster.count({ where: { monthYear } })).toBe(1);
  });

  it("returns saved roster data for company, pod, brand, process, and employee views with validated filters", async () => {
    const companyResponse = await api(`/rosters?month=${month}&year=${year}`);
    expect(companyResponse.status).toBe(200);
    const company = (await companyResponse.json()).data;
    expect(company.roster.monthYear).toBe(monthYear);
    expect(company.employees.some((employee: { id: string }) => employee.id === employeeId)).toBe(true);
    expect(company.shifts.some((shift: { status: string }) => shift.status === "WORKING")).toBe(true);
    expect(company.shifts.some((shift: { status: string }) => shift.status === "COMP_OFF")).toBe(true);
    expect(company.shifts.some((shift: { status: string }) => shift.status === "HOLIDAY")).toBe(true);
    expect(company.shifts.some((shift: { status: string }) => shift.status === "WEEKLY_OFF")).toBe(true);
    expect(company.shifts.some((shift: { status: string }) => shift.status === "LEAVE")).toBe(true);
    expect(company.conflicts.length).toBeGreaterThan(0);

    const podResponse = await api(`/rosters?month=${month}&year=${year}&podId=${podId}`);
    expect(podResponse.status).toBe(200);
    const podView = (await podResponse.json()).data;
    expect(podView.employees.length).toBeGreaterThan(0);
    expect(podView.employees.every((employee: { pod: { id: string } | null }) => employee.pod?.id === podId)).toBe(true);
    expect(podView.shifts.every((shift: { employee: { pod: { id: string } | null } }) => shift.employee.pod?.id === podId)).toBe(true);

    const brandResponse = await api(`/rosters?month=${month}&year=${year}&brandId=${brandId}`);
    expect(brandResponse.status).toBe(200);
    const brandView = (await brandResponse.json()).data;
    expect(brandView.processes.every((process: { brand: { id: string } }) => process.brand.id === brandId)).toBe(true);
    expect(brandView.shifts.every((shift: { process: { brand: { id: string } } | null }) => shift.process?.brand.id === brandId)).toBe(true);
    expect(brandView.staffingBasis).toContain("current process");

    const processResponse = await api(`/rosters?month=${month}&year=${year}&processId=${processId}`);
    expect(processResponse.status).toBe(200);
    const processView = (await processResponse.json()).data;
    expect(processView.shifts.every((shift: { processId: string | null }) => shift.processId === processId)).toBe(true);
    expect(processView.processStaffing.some((item: { date: string; requiredStaffCount: number }) =>
      item.date === firstDate && item.requiredStaffCount === 2
    )).toBe(true);
    expect(processView.summary.unfilledPositions).toBeGreaterThan(0);

    const employeeResponse = await api(`/rosters?month=${month}&year=${year}&employeeId=${employeeId}`);
    expect(employeeResponse.status).toBe(200);
    const employeeView = (await employeeResponse.json()).data;
    expect(employeeView.employees).toHaveLength(1);
    expect(employeeView.employees[0].id).toBe(employeeId);
    expect(employeeView.shifts.every((shift: { employeeId: string }) => shift.employeeId === employeeId)).toBe(true);

    const malformedId = await api(`/rosters?month=${month}&year=${year}&podId=not-a-uuid`);
    expect(malformedId.status).toBe(400);
    const unknownId = await api(`/rosters?month=${month}&year=${year}&employeeId=00000000-0000-4000-8000-000000000001`);
    expect(unknownId.status).toBe(404);
    const missingRoster = await api("/rosters?month=12&year=9999");
    expect(missingRoster.status).toBe(404);
  });

  it("rolls back a roster header when a related shift write fails inside a Prisma transaction", async () => {
    const rollbackMonthYear = `rollback-${monthYear}-${Date.now()}`;
    await expect(prisma.$transaction(async (transaction) => {
      const roster = await transaction.roster.create({
        data: { monthYear: rollbackMonthYear, status: "DRAFT" },
      });
      await transaction.rosterShift.create({
        data: {
          rosterId: roster.id,
          shiftDate: firstDate,
          employeeId: "00000000-0000-4000-8000-000000000001",
          processId: null,
          status: "WORKING",
        },
      });
    })).rejects.toThrow();
    expect(await prisma.roster.findUnique({ where: { monthYear: rollbackMonthYear } })).toBeNull();
  });
});
