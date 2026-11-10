import { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { prisma } from "../src/prisma.js";
import { installAuthenticatedTestApi } from "./helpers/authenticatedApi.js";

let server: Server;
let baseUrl = "";
let cleanupAuth: (() => Promise<void>) | undefined;
let rosterId = "";
let processId = "";
let competingProcessId = "";
let primaryEmployeeId = "";
let backupEmployeeId = "";
let floatEmployeeId = "";
let unassignedEmployeeId = "";
let publicHolidayId = "";
let monthYear = "";
let year = 2400;
const month = 1;
const day = (number: number) => `${monthYear}-${String(number).padStart(2, "0")}`;

const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api/v1${path}`, init);
const jsonRequest = (path: string, method: string, body?: unknown) =>
  api(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("Manual roster editing and revalidation API", () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (year = 2400; year < 2500; year += 1) {
      monthYear = `${year}-01`;
      if (!(await prisma.roster.findUnique({ where: { monthYear }, select: { id: true } }))) break;
    }
    if (year >= 2500) throw new Error("Could not find an unused roster month for management tests");

    const brand = await prisma.brand.findFirstOrThrow();
    const suffix = Date.now().toString(36);
    const employee = (code: string) => prisma.employee.create({
      data: {
        employeeCode: `${code}${suffix}`.slice(0, 20),
        name: `${code} Roster Test`,
        email: `${code.toLowerCase()}-${suffix}@example.com`,
        isActive: true,
        podId: brand.podId,
        weeklyWorkDays: 7,
        maxConsecutiveDays: 14,
      },
    });
    const [primary, backup, float, unassigned] = await Promise.all([
      employee("RMP"), employee("RMB"), employee("RMF"), employee("RMU"),
    ]);
    primaryEmployeeId = primary.id;
    backupEmployeeId = backup.id;
    floatEmployeeId = float.id;
    unassignedEmployeeId = unassigned.id;

    const process = await prisma.process.create({
      data: {
        code: `RMP-${suffix}`.slice(0, 30),
        name: "Roster Management Test Process",
        brandId: brand.id,
        calendarType: "ALL_365_DAYS",
        defaultMinStaff: 1,
      },
    });
    processId = process.id;
    const competingProcess = await prisma.process.create({
      data: {
        code: `RMC-${suffix}`.slice(0, 30),
        name: "Roster Management Competing Process",
        brandId: brand.id,
        calendarType: "ALL_365_DAYS",
        defaultMinStaff: 1,
      },
    });
    competingProcessId = competingProcess.id;
    await prisma.employeeProcessAssignment.createMany({
      data: [
        { employeeId: primaryEmployeeId, processId, assignmentType: "PRIMARY" },
        { employeeId: backupEmployeeId, processId, assignmentType: "SECONDARY_BACKUP" },
        { employeeId: floatEmployeeId, processId, assignmentType: "FLOAT" },
        { employeeId: floatEmployeeId, processId: competingProcessId, assignmentType: "PRIMARY" },
      ],
    });

    const roster = await prisma.roster.create({ data: { monthYear, status: "DRAFT" } });
    rosterId = roster.id;
    await prisma.rosterShift.createMany({
      data: [
        { rosterId, shiftDate: day(5), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(6), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(6), employeeId: floatEmployeeId, processId: competingProcessId, status: "WORKING" },
        { rosterId, shiftDate: day(7), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(8), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(10), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(11), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(12), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(13), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(14), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(14), employeeId: floatEmployeeId, processId: competingProcessId, status: "WORKING" },
        { rosterId, shiftDate: day(15), employeeId: primaryEmployeeId, processId, status: "WORKING" },
        { rosterId, shiftDate: day(16), employeeId: primaryEmployeeId, processId, status: "WORKING" },
      ],
    });
    await prisma.employeeLeave.create({
      data: {
        employeeId: backupEmployeeId,
        startDate: day(7),
        endDate: day(7),
        leaveType: "ANNUAL",
        status: "APPROVED",
      },
    });
    await prisma.employeeWeeklyOff.create({
      data: {
        employeeId: backupEmployeeId,
        dayOfWeek: new Date(`${day(7)}T00:00:00.000Z`).getUTCDay(),
        isStandard: false,
        specificDate: day(8),
      },
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
    cleanupAuth = await installAuthenticatedTestApi(baseUrl, prisma);
  }, 60000);

  afterAll(async () => {
    if (rosterId) await prisma.roster.deleteMany({ where: { id: rosterId } });
    if (publicHolidayId) await prisma.publicHoliday.deleteMany({ where: { id: publicHolidayId } });
    const employeeIds = [primaryEmployeeId, backupEmployeeId, floatEmployeeId, unassignedEmployeeId].filter(Boolean);
    if (employeeIds.length) {
      await prisma.employeeLeave.deleteMany({ where: { employeeId: { in: employeeIds } } });
      await prisma.employeeWeeklyOff.deleteMany({ where: { employeeId: { in: employeeIds } } });
      await prisma.employeeProcessAssignment.deleteMany({ where: { employeeId: { in: employeeIds } } });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    }
    if (processId || competingProcessId) {
      await prisma.processCoverageRule.deleteMany({ where: { processId: { in: [processId, competingProcessId].filter(Boolean) } } });
      await prisma.process.deleteMany({ where: { id: { in: [processId, competingProcessId].filter(Boolean) } } });
    }
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupAuth?.();
    await prisma.$disconnect();
  });

  it("recommends tier-ranked resources and validates replacement, double-booking, availability, and eligibility", async () => {
    const shifts = await prisma.rosterShift.findMany({
      where: { rosterId, shiftDate: day(5), processId, status: "WORKING" },
      select: { id: true },
    });
    const shiftId = shifts[0].id;
    const suggestions = await api(`/rosters/${rosterId}/replacements?date=${day(5)}&processId=${processId}&shiftId=${shiftId}&excludeEmployeeId=${primaryEmployeeId}`);
    expect(suggestions.status).toBe(200);
    const suggestedEmployees = (await suggestions.json()).data.candidates;
    expect(suggestedEmployees.map((item: { id: string }) => item.id)).toEqual([backupEmployeeId, floatEmployeeId]);

    const replacement = await jsonRequest(`/rosters/${rosterId}/shifts/${shiftId}`, "PATCH", { employeeId: backupEmployeeId });
    expect(replacement.status).toBe(200);
    const replacedShift = (await replacement.json()).data;
    expect(replacedShift.employeeId).toBe(backupEmployeeId);
    expect(replacedShift.shiftType).toBe("BACKUP_COVERAGE");
    expect(replacedShift.isManualOverride).toBe(true);
    await jsonRequest(`/rosters/${rosterId}/shifts/${shiftId}`, "PATCH", { employeeId: primaryEmployeeId });

    const doubleBookedShift = await prisma.rosterShift.findFirstOrThrow({
      where: { rosterId, shiftDate: day(6), processId, status: "WORKING" },
      select: { id: true },
    });
    const doubleBooking = await jsonRequest(`/rosters/${rosterId}/shifts/${doubleBookedShift.id}`, "PATCH", { employeeId: floatEmployeeId });
    expect(doubleBooking.status).toBe(409);
    expect((await doubleBooking.json()).message).toContain("already assigned");
    expect((await prisma.rosterShift.findUniqueOrThrow({ where: { id: doubleBookedShift.id } })).employeeId).toBe(primaryEmployeeId);

    const unavailableShift = await prisma.rosterShift.findFirstOrThrow({
      where: { rosterId, shiftDate: day(7), processId, status: "WORKING" },
      select: { id: true },
    });
    const leaveConflict = await jsonRequest(`/rosters/${rosterId}/shifts/${unavailableShift.id}`, "PATCH", { employeeId: backupEmployeeId });
    expect(leaveConflict.status).toBe(409);
    expect((await leaveConflict.json()).message).toContain("leave");

    const weeklyOffShift = await prisma.rosterShift.findFirstOrThrow({
      where: { rosterId, shiftDate: day(8), processId, status: "WORKING" },
      select: { id: true },
    });
    const weeklyOffConflict = await jsonRequest(`/rosters/${rosterId}/shifts/${weeklyOffShift.id}`, "PATCH", { employeeId: backupEmployeeId });
    expect(weeklyOffConflict.status).toBe(409);
    expect((await weeklyOffConflict.json()).message).toContain("weekly off");

    const notEligible = await jsonRequest(`/rosters/${rosterId}/shifts/${shiftId}`, "PATCH", { employeeId: unassignedEmployeeId });
    expect(notEligible.status).toBe(409);
    expect((await notEligible.json()).message).toContain("not assigned");
    const invalidEmployee = await jsonRequest(`/rosters/${rosterId}/shifts/${shiftId}`, "PATCH", { employeeId: "00000000-0000-4000-8000-000000000001" });
    expect(invalidEmployee.status).toBe(404);
    const invalidRequest = await jsonRequest(`/rosters/${rosterId}/shifts/${shiftId}`, "PATCH", { employeeId: "invalid" });
    expect(invalidRequest.status).toBe(400);
  });

  it("fills open positions, permits removal with a coverage conflict, and preserves conflict resolution history", async () => {
    const options = await api(`/rosters/${rosterId}/replacements?date=${day(9)}&processId=${processId}`);
    expect(options.status).toBe(200);
    expect((await options.json()).data.staffing.unfilled).toBe(1);
    const fill = await jsonRequest(`/rosters/${rosterId}/shifts`, "POST", {
      shiftDate: day(9),
      processId,
      employeeId: primaryEmployeeId,
    });
    expect(fill.status).toBe(201);
    expect((await fill.json()).data.isManualOverride).toBe(true);

    const fullPosition = await jsonRequest(`/rosters/${rosterId}/shifts`, "POST", {
      shiftDate: day(9),
      processId,
      employeeId: backupEmployeeId,
    });
    expect(fullPosition.status).toBe(409);

    const removeTarget = await prisma.rosterShift.findFirstOrThrow({
      where: { rosterId, shiftDate: day(10), processId, status: "WORKING" },
      select: { id: true },
    });
    const removed = await jsonRequest(`/rosters/${rosterId}/shifts/${removeTarget.id}`, "DELETE");
    expect(removed.status).toBe(200);
    const activeConflicts = await api(`/rosters/${rosterId}/conflicts?status=active`);
    const activeData = await activeConflicts.json();
    expect(activeData.data.some((item: { category: string; shiftDate: string; isResolved: boolean }) =>
      item.category === "UNDER_COVERAGE" && item.shiftDate === day(10) && !item.isResolved
    )).toBe(true);

    const refill = await jsonRequest(`/rosters/${rosterId}/shifts`, "POST", {
      shiftDate: day(10),
      processId,
      employeeId: backupEmployeeId,
    });
    expect(refill.status).toBe(201);
    const resolvedConflicts = await api(`/rosters/${rosterId}/conflicts?status=resolved`);
    const resolvedData = await resolvedConflicts.json();
    expect(resolvedData.data.some((item: { category: string; shiftDate: string; isResolved: boolean }) =>
      item.category === "UNDER_COVERAGE" && item.shiftDate === day(10) && item.isResolved
    )).toBe(true);

    const missingRoster = await api("/rosters/00000000-0000-4000-8000-000000000001/conflicts");
    expect(missingRoster.status).toBe(404);
    const invalidRosterId = await api("/rosters/not-a-uuid/conflicts");
    expect(invalidRosterId.status).toBe(400);
  });

  it("rolls back a roster change when a later transaction operation fails", async () => {
    const shift = await prisma.rosterShift.findFirstOrThrow({
      where: { rosterId, shiftDate: day(5), processId, status: "WORKING" },
      select: { id: true, employeeId: true, isManualOverride: true },
    });
    await expect(prisma.$transaction(async (transaction) => {
      await transaction.rosterShift.update({
        where: { id: shift.id },
        data: { employeeId: backupEmployeeId, isManualOverride: true },
      });
      throw new Error("Simulated failure after roster shift update");
    })).rejects.toThrow("Simulated failure");
    const persisted = await prisma.rosterShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(persisted.employeeId).toBe(shift.employeeId);
    expect(persisted.isManualOverride).toBe(shift.isManualOverride);
  });

  it("detects new leave, weekly off, comp-off, inactive employees, and backup availability on revalidation", async () => {
    await prisma.employeeLeave.create({
      data: {
        employeeId: primaryEmployeeId,
        startDate: day(11),
        endDate: day(11),
        leaveType: "ANNUAL",
        status: "APPROVED",
      },
    });
    await prisma.employeeWeeklyOff.create({
      data: {
        employeeId: primaryEmployeeId,
        dayOfWeek: new Date(`${day(12)}T00:00:00.000Z`).getUTCDay(),
        isStandard: false,
        specificDate: day(12),
      },
    });
    await prisma.employeeLeave.create({
      data: {
        employeeId: primaryEmployeeId,
        startDate: day(13),
        endDate: day(13),
        leaveType: "COMP_OFF",
        status: "APPROVED",
      },
    });
    await prisma.employee.update({ where: { id: floatEmployeeId }, data: { isActive: false } });

    const result = await jsonRequest(`/rosters/${rosterId}/revalidate`, "POST");
    expect(result.status).toBe(200);
    const data = (await result.json()).data;
    expect(data.recommendations.some((item: { date: string; replacements: Array<{ id: string }> }) =>
      item.date === day(11) && item.replacements.some((replacement) => replacement.id === backupEmployeeId)
    )).toBe(true);
    expect(data.conflicts.some((item: { category: string; shiftDate: string; employeeId: string }) =>
      item.category === "LEAVE_COLLISION" && item.shiftDate === day(11) && item.employeeId === primaryEmployeeId
    )).toBe(true);
    expect(data.conflicts.some((item: { category: string; shiftDate: string; employeeId: string }) =>
      item.category === "LEAVE_COLLISION" && item.shiftDate === day(12) && item.employeeId === primaryEmployeeId
    )).toBe(true);
    expect(data.conflicts.some((item: { category: string; shiftDate: string; employeeId: string }) =>
      item.category === "LEAVE_COLLISION" && item.shiftDate === day(13) && item.employeeId === primaryEmployeeId
    )).toBe(true);
    expect(data.conflicts.some((item: { category: string; shiftDate: string; employeeId: string }) =>
      item.category === "UNQUALIFIED_ASSIGNMENT" && item.shiftDate === day(14) && item.employeeId === floatEmployeeId
    )).toBe(true);

    const holiday = await prisma.publicHoliday.create({
      data: { date: day(15), name: "Roster revalidation test holiday", isMandatoryOff: true },
    });
    publicHolidayId = holiday.id;
    await prisma.process.update({ where: { id: processId }, data: { calendarType: "CUSTOM" } });
    const calendarCheck = await jsonRequest(`/rosters/${rosterId}/revalidate`, "POST");
    expect(calendarCheck.status).toBe(200);
    const calendarData = (await calendarCheck.json()).data;
    expect(calendarData.conflicts.some((item: { category: string; shiftDate: string }) =>
      item.category === "LEAVE_COLLISION" && item.shiftDate === day(15)
    )).toBe(true);
    expect(calendarData.conflicts.some((item: { category: string; shiftDate: string }) =>
      item.category === "CALENDAR_INCONSISTENCY" && item.shiftDate === day(16)
    )).toBe(true);
    await prisma.process.update({ where: { id: processId }, data: { calendarType: "ALL_365_DAYS" } });

    await prisma.employee.update({ where: { id: floatEmployeeId }, data: { isActive: true } });
    await prisma.employee.update({ where: { id: backupEmployeeId }, data: { isActive: false } });
    await prisma.employeeLeave.create({
      data: {
        employeeId: floatEmployeeId,
        startDate: day(11),
        endDate: day(11),
        leaveType: "SICK",
        status: "APPROVED",
      },
    });
    const noBackup = await jsonRequest(`/rosters/${rosterId}/revalidate`, "POST");
    expect(noBackup.status).toBe(200);
    const noBackupData = (await noBackup.json()).data;
    expect(noBackupData.recommendations.some((item: { date: string; replacements: unknown[] }) =>
      item.date === day(11) && item.replacements.length === 0
    )).toBe(true);
    expect(noBackupData.conflicts.some((item: { category: string; shiftDate: string; detailsJson: string }) =>
      item.category === "SINGLE_POINT_FAILURE" && item.shiftDate === day(11) && item.detailsJson?.includes("NO_BACKUP")
    )).toBe(true);
  });
});
