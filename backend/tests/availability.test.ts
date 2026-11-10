import { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { prisma } from "../src/prisma.js";
import { installAuthenticatedTestApi } from "./helpers/authenticatedApi.js";

let server: Server;
let baseUrl: string;
let cleanupAuth: (() => Promise<void>) | undefined;
let employeeId: string;
let employeeCode: string;
let processId: string;
let holidayDate: string;
let weeklyOffId: string;
let leaveId: string;
let compOffId: string;
let holidayId: string;
let dateRuleId: string;
let weekdayRuleId: string;

const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api/v1${path}`, init);
const postJson = (path: string, body: unknown) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("Phase 4 employee availability, holidays, and scheduling rules", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const pod = await prisma.pod.findFirstOrThrow();
    const brand = await prisma.brand.findFirstOrThrow();
    const suffix = Date.now().toString(36);
    employeeCode = `EMPAV${suffix}`;
    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        name: "Availability Test Employee",
        email: `availability-${suffix}@example.com`,
        podId: pod.id,
      },
    });
    employeeId = employee.id;
    const process = await prisma.process.create({
      data: {
        code: `PRC-AV-${suffix}`.slice(0, 30),
        name: "Availability Test Process",
        brandId: brand.id,
        calendarType: "CUSTOM",
        defaultMinStaff: 2,
      },
    });
    processId = process.id;
    holidayDate = "2030-01-07";
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
    if (employeeId) {
      await prisma.employeeWeeklyOff.deleteMany({ where: { employeeId } });
      await prisma.employeeLeave.deleteMany({ where: { employeeId } });
    }
    if (processId) {
      await prisma.processCoverageRule.deleteMany({ where: { processId } });
      await prisma.process.deleteMany({ where: { id: processId } });
    }
    if (holidayId) await prisma.publicHoliday.deleteMany({ where: { id: holidayId } });
    if (employeeId) await prisma.employee.deleteMany({ where: { id: employeeId } });
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupAuth?.();
    await prisma.$disconnect();
  });

  it("creates, filters, updates, rejects duplicates, and deletes weekly offs", async () => {
    const invalid = await postJson("/availability/weekly-offs", {
      employeeId: "not-an-id",
      dayOfWeek: 7,
    });
    expect(invalid.status).toBe(400);

    const invalidEmployee = await postJson("/availability/weekly-offs", {
      employeeId: "00000000-0000-4000-8000-000000000001",
      dayOfWeek: 1,
    });
    expect(invalidEmployee.status).toBe(400);

    const created = await postJson("/availability/weekly-offs", {
      employeeId,
      dayOfWeek: 2,
      isStandard: true,
    });
    expect(created.status).toBe(201);
    weeklyOffId = (await created.json()).data.id;

    const duplicate = await postJson("/availability/weekly-offs", {
      employeeId,
      dayOfWeek: 2,
      isStandard: true,
    });
    expect(duplicate.status).toBe(409);

    const filtered = await api(`/availability/weekly-offs?employeeId=${employeeId}&date=2030-01-08`);
    expect((await filtered.json()).data.some((item: { id: string }) => item.id === weeklyOffId)).toBe(true);

    const update = await api(`/availability/weekly-offs/${weeklyOffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: 3 }),
    });
    expect(update.status).toBe(200);
    expect((await update.json()).data.dayOfWeek).toBe(3);

    const deleted = await api(`/availability/weekly-offs/${weeklyOffId}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    weeklyOffId = "";
  });

  it("creates date-range leave, rejects invalid and overlapping ranges, and manages comp-off", async () => {
    const invalidEmployee = await postJson("/availability/leaves", {
      employeeId: "00000000-0000-4000-8000-000000000001",
      startDate: "2030-01-01",
      endDate: "2030-01-02",
      leaveType: "ANNUAL",
    });
    expect(invalidEmployee.status).toBe(400);

    const invalidRange = await postJson("/availability/leaves", {
      employeeId,
      startDate: "2030-02-05",
      endDate: "2030-02-01",
      leaveType: "ANNUAL",
    });
    expect(invalidRange.status).toBe(400);

    const invalidDate = await postJson("/availability/leaves", {
      employeeId,
      startDate: "2030-02-30",
      endDate: "2030-03-01",
      leaveType: "ANNUAL",
    });
    expect(invalidDate.status).toBe(400);

    const created = await postJson("/availability/leaves", {
      employeeId,
      startDate: "2030-02-01",
      endDate: "2030-02-03",
      leaveType: "ANNUAL",
      status: "APPROVED",
    });
    expect(created.status).toBe(201);
    leaveId = (await created.json()).data.id;

    const overlap = await postJson("/availability/leaves", {
      employeeId,
      startDate: "2030-02-03",
      endDate: "2030-02-06",
      leaveType: "SICK",
    });
    expect(overlap.status).toBe(409);

    const compOff = await postJson("/availability/leaves", {
      employeeId,
      startDate: "2030-03-01",
      endDate: "2030-03-01",
      leaveType: "COMP_OFF",
    });
    expect(compOff.status).toBe(201);
    compOffId = (await compOff.json()).data.id;

    const invalidCompOffRange = await postJson("/availability/leaves", {
      employeeId,
      startDate: "2030-03-02",
      endDate: "2030-03-03",
      leaveType: "COMP_OFF",
    });
    expect(invalidCompOffRange.status).toBe(400);

    const filtered = await api(`/availability/leaves?employeeId=${employeeId}&startDate=2030-02-02&endDate=2030-02-04`);
    expect((await filtered.json()).data.some((item: { id: string }) => item.id === leaveId)).toBe(true);

    const updated = await api(`/availability/leaves/${leaveId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.status).toBe("REJECTED");

    expect((await api(`/availability/leaves/${leaveId}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(`/availability/leaves/${compOffId}`, { method: "DELETE" })).status).toBe(200);
    leaveId = "";
    compOffId = "";
  });

  it("creates, searches, filters, updates, rejects duplicate dates, and deletes holidays", async () => {
    const invalidDate = await postJson("/holidays", {
      date: "2030-02-30",
      name: "Invalid Date Holiday",
    });
    expect(invalidDate.status).toBe(400);

    const created = await postJson("/holidays", {
      date: holidayDate,
      name: "Availability Test Holiday",
      isMandatoryOff: true,
    });
    expect(created.status).toBe(201);
    holidayId = (await created.json()).data.id;

    const duplicate = await postJson("/holidays", {
      date: holidayDate,
      name: "Duplicate Holiday",
    });
    expect(duplicate.status).toBe(409);

    const filtered = await api("/holidays?year=2030&search=Availability%20Test");
    expect((await filtered.json()).data.some((item: { id: string }) => item.id === holidayId)).toBe(true);

    const updated = await api(`/holidays/${holidayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Availability Holiday Updated" }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.name).toBe("Availability Holiday Updated");

    expect((await api(`/holidays/${holidayId}`, { method: "DELETE" })).status).toBe(200);
    holidayId = "";
  });

  it("evaluates all calendar types and applies date/weekday staffing overrides without changing defaults", async () => {
    const invalidProcess = await postJson("/processes/00000000-0000-4000-8000-000000000001/coverage-rules", {
      dayOfWeek: 1,
      requiredStaffCount: 2,
    });
    expect(invalidProcess.status).toBe(404);
    const invalidEvaluationDate = await api(`/processes/${processId}/calendar?date=2030-02-30`);
    expect(invalidEvaluationDate.status).toBe(400);

    const addRule = await postJson(`/processes/${processId}/coverage-rules`, {
      dateOverride: holidayDate,
      requiredStaffCount: 4,
      note: "date override test",
    });
    expect(addRule.status).toBe(201);
    dateRuleId = (await addRule.json()).data.id;

    const addWeekdayRule = await postJson(`/processes/${processId}/coverage-rules`, {
      dayOfWeek: 1,
      requiredStaffCount: 3,
    });
    expect(addWeekdayRule.status).toBe(201);
    weekdayRuleId = (await addWeekdayRule.json()).data.id;

    const duplicateRule = await postJson(`/processes/${processId}/coverage-rules`, {
      dateOverride: holidayDate,
      requiredStaffCount: 5,
    });
    expect(duplicateRule.status).toBe(409);

    const invalidRule = await postJson(`/processes/${processId}/coverage-rules`, {
      dayOfWeek: 7,
      requiredStaffCount: 0,
    });
    expect(invalidRule.status).toBe(400);

    const customOpen = await api(`/processes/${processId}/calendar?date=${holidayDate}`);
    expect((await customOpen.json()).data).toMatchObject({ operates: true, requiredStaffCount: 4 });
    const customClosed = await api(`/processes/${processId}/calendar?date=2030-01-08`);
    expect((await customClosed.json()).data).toMatchObject({ operates: false, requiredStaffCount: 2 });

    const calendarHoliday = await prisma.publicHoliday.create({
      data: { date: holidayDate, name: "Calendar Test Holiday", isMandatoryOff: true },
    });
    holidayId = calendarHoliday.id;
    const allDays = await api(`/processes/${processId}`);
    const processData = (await allDays.json()).data;
    expect(processData.defaultMinStaff).toBe(2);

    await api(`/processes/${processId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarType: "ALL_365_DAYS" }),
    });
    expect((await (await api(`/processes/${processId}/calendar?date=${holidayDate}`)).json()).data.operates).toBe(true);

    await api(`/processes/${processId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarType: "ALL_EXCEPT_PUBLIC_HOLIDAYS" }),
    });
    expect((await (await api(`/processes/${processId}/calendar?date=${holidayDate}`)).json()).data.operates).toBe(false);
    expect((await (await api(`/processes/${processId}/calendar?date=2030-01-08`)).json()).data.operates).toBe(true);

    await api(`/processes/${processId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarType: "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS" }),
    });
    expect((await (await api(`/processes/${processId}/calendar?date=${holidayDate}`)).json()).data.operates).toBe(false);
    expect((await (await api(`/processes/${processId}/calendar?date=2030-01-06`)).json()).data.operates).toBe(false);
    expect((await (await api(`/processes/${processId}/calendar?date=2030-01-08`)).json()).data.operates).toBe(true);

    const rules = await api(`/processes/${processId}/coverage-rules`);
    expect((await rules.json()).data).toHaveLength(2);
    const updateRule = await api(`/processes/coverage-rules/${dateRuleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requiredStaffCount: 5 }),
    });
    expect(updateRule.status).toBe(200);
    expect((await updateRule.json()).data.requiredStaffCount).toBe(5);

    const defaultUpdate = await api(`/processes/${processId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultMinStaff: 6 }),
    });
    expect(defaultUpdate.status).toBe(200);
    expect((await defaultUpdate.json()).data.defaultMinStaff).toBe(6);

    expect((await api(`/processes/coverage-rules/${dateRuleId}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(`/processes/coverage-rules/${weekdayRuleId}`, { method: "DELETE" })).status).toBe(200);
    dateRuleId = "";
    weekdayRuleId = "";
  });
});
