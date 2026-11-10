import { describe, expect, it } from "vitest";
import {
  generateMonthlyRoster,
  RosterEngineEmployee,
  RosterEngineInput,
  RosterEngineProcess,
} from "../src/rosterEngine.js";

const employee = (
  id: string,
  options: Partial<RosterEngineEmployee> = {}
): RosterEngineEmployee => ({
  id,
  employeeCode: id.toUpperCase(),
  name: id,
  isActive: true,
  weeklyWorkDays: 7,
  maxConsecutiveDays: 31,
  weeklyOffs: [],
  leaves: [],
  ...options,
});

const process = (
  id: string,
  assignments: RosterEngineProcess["assignments"],
  options: Partial<RosterEngineProcess> = {}
): RosterEngineProcess => ({
  id,
  code: id.toUpperCase(),
  name: id,
  calendarType: "ALL_365_DAYS",
  defaultMinStaff: 1,
  brand: { id: `brand-${id}`, code: `BR-${id}`, name: `Brand ${id}`, isSingleResource: false },
  coverageRules: [],
  assignments,
  ...options,
});

const assignment = (
  employeeId: string,
  assignmentType: "PRIMARY" | "SECONDARY_BACKUP" | "FLOAT" = "PRIMARY"
) => ({ employeeId, assignmentType, priorityRank: 1 });

const generate = (
  employees: RosterEngineEmployee[],
  processes: RosterEngineProcess[],
  holidays: RosterEngineInput["holidays"] = [],
  priorWorkDates: RosterEngineInput["priorWorkDates"] = []
) => generateMonthlyRoster({ month: 1, year: 2030, employees, processes, holidays, priorWorkDates });

describe("Pure monthly roster scheduling engine", () => {
  it("generates a month of primary working shifts and respects Sunday calendar closures", () => {
    const result = generate(
      [employee("primary", { weeklyWorkDays: 6, weeklyOffs: [{ dayOfWeek: 0, isStandard: true, specificDate: null }] })],
      [process("daily", [assignment("primary")], { calendarType: "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS" })]
    );
    expect(result.summary.processDays).toBe(27);
    expect(result.summary.totalAssignedShifts).toBe(27);
    expect(result.shifts.filter((shift) => shift.status === "WEEKLY_OFF")).toHaveLength(4);
    expect(result.shifts.filter((shift) => shift.status === "WORKING").every((shift) => shift.shiftType === "REGULAR")).toBe(true);
  });

  it("evaluates all public holiday calendars and generates month dates correctly", () => {
    const processes = [
      process("all-days", [], { calendarType: "ALL_365_DAYS" }),
      process("no-holidays", [], { calendarType: "ALL_EXCEPT_PUBLIC_HOLIDAYS" }),
      process("business-days", [], { calendarType: "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS" }),
      process("custom", [], {
        calendarType: "CUSTOM",
        coverageRules: [
          { dateOverride: "2030-01-01", dayOfWeek: null, requiredStaffCount: 3 },
          { dateOverride: null, dayOfWeek: 0, requiredStaffCount: 2 },
        ],
      }),
    ];
    const result = generate([], processes, [{ date: "2030-01-01", name: "Holiday", isMandatoryOff: true }]);
    expect(result.summary.processDays).toBe(31 + 30 + 26 + 5);
    expect(result.conflicts.find((conflict) =>
      conflict.processId === "custom" &&
      conflict.shiftDate === "2030-01-01" &&
      conflict.category === "UNDER_COVERAGE"
    )?.detailsJson).toContain('"requiredStaffCount":3');
    expect(result.conflicts.some((conflict) =>
      conflict.processId === "no-holidays" && conflict.shiftDate === "2030-01-01"
    )).toBe(false);
    expect(result.conflicts.some((conflict) =>
      conflict.processId === "business-days" && conflict.shiftDate === "2030-01-06"
    )).toBe(false);
  });

  it("prioritizes primary assignments and allocates an available secondary backup when primary is off or on leave", () => {
    const result = generate(
      [
        employee("primary", {
          weeklyOffs: [{ dayOfWeek: 2, isStandard: false, specificDate: "2030-01-01" }],
          leaves: [{ startDate: "2030-01-02", endDate: "2030-01-02", leaveType: "ANNUAL", status: "APPROVED" }],
        }),
        employee("backup"),
      ],
      [process("service", [assignment("primary"), assignment("backup", "SECONDARY_BACKUP")], {
        brand: { id: "brand-service", code: "BR-S", name: "Single Resource", isSingleResource: true },
      })]
    );
    expect(result.shifts.find((shift) => shift.shiftDate === "2030-01-01" && shift.status === "WORKING"))
      .toMatchObject({ employeeId: "backup", shiftType: "BACKUP_COVERAGE" });
    expect(result.shifts.find((shift) => shift.shiftDate === "2030-01-02" && shift.status === "WORKING"))
      .toMatchObject({ employeeId: "backup", shiftType: "BACKUP_COVERAGE" });
    expect(result.conflicts.some((conflict) => conflict.shiftDate === "2030-01-01" && conflict.category === "LEAVE_COLLISION")).toBe(true);
  });

  it("excludes leave and comp-off, reports sole-resource absence, and reports unfilled staffing", () => {
    const result = generate(
      [employee("only", {
        leaves: [
          { startDate: "2030-01-01", endDate: "2030-01-01", leaveType: "COMP_OFF", status: "APPROVED" },
          { startDate: "2030-01-02", endDate: "2030-01-02", leaveType: "SICK", status: "PENDING" },
        ],
      })],
      [process("sole", [assignment("only")], { defaultMinStaff: 2 })]
    );
    expect(result.shifts.find((shift) => shift.shiftDate === "2030-01-01" && shift.employeeId === "only")?.status).toBe("COMP_OFF");
    expect(result.shifts.find((shift) => shift.shiftDate === "2030-01-02" && shift.employeeId === "only")?.status).toBe("LEAVE");
    expect(result.conflicts.some((conflict) => conflict.category === "UNDER_COVERAGE" && conflict.shiftDate === "2030-01-01")).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.category === "SINGLE_POINT_FAILURE")).toBe(true);
    expect(result.summary.unfilledPositions).toBeGreaterThan(0);
  });

  it("uses date staffing overrides without changing defaults and schedules CUSTOM calendars only on rules", () => {
    const result = generate(
      [employee("first"), employee("second")],
      [process("custom", [assignment("first"), assignment("second", "FLOAT")], {
        calendarType: "CUSTOM",
        defaultMinStaff: 1,
        coverageRules: [
          { dateOverride: "2030-01-01", dayOfWeek: null, requiredStaffCount: 2 },
          { dateOverride: null, dayOfWeek: 3, requiredStaffCount: 1 },
        ],
      })]
    );
    expect(result.shifts.filter((shift) => shift.shiftDate === "2030-01-01" && shift.status === "WORKING")).toHaveLength(2);
    expect(result.shifts.some((shift) => shift.shiftDate === "2030-01-03" && shift.status === "WORKING")).toBe(false);
    expect(result.shifts.filter((shift) => shift.shiftDate === "2030-01-09" && shift.status === "WORKING")).toHaveLength(1);
  });

  it("uses maximum matching to prevent cross-brand double-booking when an alternative resource exists", () => {
    const result = generate(
      [employee("shared"), employee("alternative")],
      [
        process("process-a", [assignment("shared"), assignment("alternative")]),
        process("process-b", [assignment("shared")]),
      ]
    );
    const day = result.shifts.filter((shift) => shift.shiftDate === "2030-01-01" && shift.status === "WORKING");
    expect(day).toHaveLength(2);
    expect(new Set(day.map((shift) => shift.employeeId)).size).toBe(2);
    expect(result.summary.unfilledPositions).toBe(0);
  });

  it("reports blocked cross-process allocations and never double-books a sole shared employee", () => {
    const result = generate(
      [employee("shared")],
      [process("brand-a", [assignment("shared")]), process("brand-b", [assignment("shared")])]
    );
    const day = result.shifts.filter((shift) => shift.shiftDate === "2030-01-01" && shift.status === "WORKING");
    expect(day).toHaveLength(1);
    expect(result.conflicts.some((conflict) => conflict.category === "DOUBLE_BOOKING" && conflict.shiftDate === "2030-01-01")).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.category === "UNDER_COVERAGE" && conflict.shiftDate === "2030-01-01")).toBe(true);
  });

  it("excludes inactive employees and respects prior work, weekly work-day limits, and max consecutive days", () => {
    const result = generate(
      [
        employee("inactive", { isActive: false }),
        employee("limited", { weeklyWorkDays: 7, maxConsecutiveDays: 1 }),
      ],
      [process("capacity", [assignment("inactive"), assignment("limited")])],
      [],
      [{ employeeId: "limited", shiftDate: "2029-12-31" }]
    );
    expect(result.shifts.some((shift) => shift.employeeId === "inactive" && shift.status === "WORKING")).toBe(false);
    expect(result.conflicts.some((conflict) => conflict.category === "UNQUALIFIED_ASSIGNMENT")).toBe(true);
    expect(result.conflicts.some((conflict) =>
      conflict.category === "MAX_CONSECUTIVE_DAYS" && conflict.shiftDate === "2030-01-01"
    )).toBe(true);
  });
});
