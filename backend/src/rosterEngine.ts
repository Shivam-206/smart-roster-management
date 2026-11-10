import { getProcessScheduleForDate, StaffingCalendarRule, SchedulingCalendarType } from "./scheduling.js";

export interface RosterEngineEmployee {
  id: string;
  employeeCode: string;
  name: string;
  isActive: boolean;
  weeklyWorkDays: number;
  maxConsecutiveDays: number;
  weeklyOffs: Array<{
    dayOfWeek: number;
    isStandard: boolean;
    specificDate: string | null;
  }>;
  leaves: Array<{
    startDate: string;
    endDate: string;
    leaveType: string;
    status: string;
  }>;
}

function mondayOf(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
  return value.toISOString().slice(0, 10);
}

export interface RosterEngineAssignment {
  employeeId: string;
  assignmentType: "PRIMARY" | "SECONDARY_BACKUP" | "FLOAT";
  priorityRank: number;
}

export interface RosterEngineProcess {
  id: string;
  code: string;
  name: string;
  calendarType: SchedulingCalendarType;
  defaultMinStaff: number;
  brand: {
    id: string;
    code: string;
    name: string;
    isSingleResource: boolean;
  };
  coverageRules: StaffingCalendarRule[];
  assignments: RosterEngineAssignment[];
}

export interface RosterEngineHoliday {
  date: string;
  name: string;
  isMandatoryOff: boolean;
}

export interface GeneratedRosterShift {
  shiftDate: string;
  employeeId: string;
  processId: string | null;
  status: "WORKING" | "WEEKLY_OFF" | "LEAVE" | "COMP_OFF" | "HOLIDAY";
  shiftType: "REGULAR" | "BACKUP_COVERAGE" | "OVERTIME";
}

export interface GeneratedRosterConflict {
  shiftDate: string;
  severity: "HARD_ERROR" | "SOFT_WARNING";
  category:
    | "UNDER_COVERAGE"
    | "DOUBLE_BOOKING"
    | "LEAVE_COLLISION"
    | "MAX_CONSECUTIVE_DAYS"
    | "UNQUALIFIED_ASSIGNMENT"
    | "CALENDAR_INCONSISTENCY"
    | "SINGLE_POINT_FAILURE"
    | "UNEVEN_WORKLOAD";
  processId: string | null;
  employeeId: string | null;
  message: string;
  detailsJson: string | null;
}

export interface RosterEngineInput {
  month: number;
  year: number;
  employees: RosterEngineEmployee[];
  processes: RosterEngineProcess[];
  holidays: RosterEngineHoliday[];
  priorWorkDates?: Array<{ employeeId: string; shiftDate: string }>;
}

export interface RosterEngineResult {
  shifts: GeneratedRosterShift[];
  conflicts: GeneratedRosterConflict[];
  summary: {
    totalAssignedShifts: number;
    totalScheduleEntries: number;
    totalConflicts: number;
    unfilledPositions: number;
    processDays: number;
  };
}

interface EligibleAssignment {
  assignment: RosterEngineAssignment;
  employee: RosterEngineEmployee;
  tierRank: number;
}

interface AssignmentSlot {
  id: string;
  process: RosterEngineProcess;
  slotNumber: number;
  candidates: EligibleAssignment[];
}

const TIER_RANK: Record<RosterEngineAssignment["assignmentType"], number> = {
  PRIMARY: 0,
  SECONDARY_BACKUP: 1,
  FLOAT: 2,
};

function monthDates(month: number, year: number): string[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, index) =>
    `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${(index + 1).toString().padStart(2, "0")}`
  );
}

function getUnavailableStatus(
  employee: RosterEngineEmployee,
  date: string,
  dayOfWeek: number,
  mandatoryHoliday: RosterEngineHoliday | undefined
): { status: GeneratedRosterShift["status"]; reason: string } | null {
  if (mandatoryHoliday?.isMandatoryOff) {
    return { status: "HOLIDAY", reason: `mandatory public holiday (${mandatoryHoliday.name})` };
  }

  const leave = employee.leaves.find(
    (item) => item.status !== "REJECTED" && item.startDate <= date && item.endDate >= date
  );
  if (leave) {
    return {
      status: leave.leaveType === "COMP_OFF" ? "COMP_OFF" : "LEAVE",
      reason: leave.leaveType === "COMP_OFF" ? "comp-off" : `${leave.status.toLowerCase()} ${leave.leaveType.toLowerCase()} leave`,
    };
  }

  const weeklyOff = employee.weeklyOffs.find((item) =>
    item.isStandard ? item.dayOfWeek === dayOfWeek : item.specificDate === date
  );
  if (weeklyOff) {
    return { status: "WEEKLY_OFF", reason: weeklyOff.isStandard ? "standard weekly off" : "specific-date weekly off" };
  }
  return null;
}

function compareAssignments(a: EligibleAssignment, b: EligibleAssignment): number {
  return a.tierRank - b.tierRank ||
    a.assignment.priorityRank - b.assignment.priorityRank ||
    a.employee.employeeCode.localeCompare(b.employee.employeeCode);
}

function resolveMatching(slots: AssignmentSlot[]): Map<string, EligibleAssignment> {
  const employeeToSlot = new Map<string, string>();
  const slotToAssignment = new Map<string, EligibleAssignment>();
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));

  const placeSlot = (slot: AssignmentSlot, visited: Set<string>): boolean => {
    for (const candidate of slot.candidates) {
      if (visited.has(candidate.employee.id)) continue;
      visited.add(candidate.employee.id);
      const currentSlotId = employeeToSlot.get(candidate.employee.id);
      const currentSlot = currentSlotId ? slotById.get(currentSlotId) : undefined;
      if (!currentSlot || placeSlot(currentSlot, visited)) {
        employeeToSlot.set(candidate.employee.id, slot.id);
        slotToAssignment.set(slot.id, candidate);
        return true;
      }
    }
    return false;
  };

  for (const slot of slots) placeSlot(slot, new Set<string>());
  return slotToAssignment;
}

export function generateMonthlyRoster(input: RosterEngineInput): RosterEngineResult {
  const employees = input.employees.filter((employee) => employee.isActive);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const holidaysByDate = new Map(input.holidays.map((holiday) => [holiday.date, holiday]));
  const shifts: GeneratedRosterShift[] = [];
  const conflicts: GeneratedRosterConflict[] = [];
  let processDays = 0;
  let unfilledPositions = 0;
  const priorDatesByEmployee = new Map<string, Set<string>>();
  for (const prior of input.priorWorkDates || []) {
    const dates = priorDatesByEmployee.get(prior.employeeId) || new Set<string>();
    dates.add(prior.shiftDate);
    priorDatesByEmployee.set(prior.employeeId, dates);
  }
  const workedDaysByWeek = new Map<string, Set<string>>();
  const consecutiveDays = new Map<string, number>();
  const firstDate = monthDates(input.month, input.year)[0];
  const firstWeek = mondayOf(firstDate);
  for (const employee of employees) {
    const priorDates = priorDatesByEmployee.get(employee.id) || new Set<string>();
    const weekDates = [...priorDates].filter((date) => mondayOf(date) === firstWeek);
    workedDaysByWeek.set(`${employee.id}:${firstWeek}`, new Set(weekDates));
    let streak = 0;
    const cursor = new Date(`${firstDate}T00:00:00.000Z`);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (streak < employee.maxConsecutiveDays && priorDates.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    consecutiveDays.set(employee.id, streak);
  }

  for (const date of monthDates(input.month, input.year)) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const holiday = holidaysByDate.get(date);
    const unavailableByEmployee = new Map<string, { status: GeneratedRosterShift["status"]; reason: string }>();
    for (const employee of employees) {
      const unavailable = getUnavailableStatus(employee, date, weekday, holiday);
      if (unavailable) {
        unavailableByEmployee.set(employee.id, unavailable);
        shifts.push({
          shiftDate: date,
          employeeId: employee.id,
          processId: null,
          status: unavailable.status,
          shiftType: "REGULAR",
        });
      }
    }

    const operatingProcesses = input.processes
      .map((process) => ({
        process,
        schedule: getProcessScheduleForDate(
          process.calendarType,
          date,
          holiday?.isMandatoryOff === true,
          process.coverageRules,
          process.defaultMinStaff
        ),
      }))
      .filter(({ schedule }) => schedule.operates);
    processDays += operatingProcesses.length;

    const candidatesByProcess = new Map<string, EligibleAssignment[]>();
    const slots: AssignmentSlot[] = [];

    for (const { process, schedule } of operatingProcesses) {
      const candidates: EligibleAssignment[] = [];
      const primaryAssignments: RosterEngineAssignment[] = [];
      const backupAssignments: RosterEngineAssignment[] = [];
      const weekKey = mondayOf(date);

      for (const assignment of process.assignments) {
        const employee = employeesById.get(assignment.employeeId);
        if (!employee) {
          const knownEmployee = input.employees.find((item) => item.id === assignment.employeeId);
          conflicts.push({
            shiftDate: date,
            severity: "SOFT_WARNING",
            category: "UNQUALIFIED_ASSIGNMENT",
            processId: process.id,
            employeeId: assignment.employeeId,
            message: knownEmployee
              ? `Inactive employee ${knownEmployee.employeeCode} is assigned to ${process.code} and was excluded.`
              : `Assignment to ${process.code} references an unavailable employee record and was excluded.`,
            detailsJson: JSON.stringify({ assignmentType: assignment.assignmentType }),
          });
          continue;
        }
        if (assignment.assignmentType === "PRIMARY") primaryAssignments.push(assignment);
        if (assignment.assignmentType === "SECONDARY_BACKUP") backupAssignments.push(assignment);

        const unavailable = unavailableByEmployee.get(employee.id);
        if (unavailable) {
          conflicts.push({
            shiftDate: date,
            severity: "SOFT_WARNING",
            category: "LEAVE_COLLISION",
            processId: process.id,
            employeeId: employee.id,
            message: `${employee.employeeCode} is assigned to ${process.code} but unavailable due to ${unavailable.reason}.`,
            detailsJson: JSON.stringify({ assignmentType: assignment.assignmentType, unavailableStatus: unavailable.status }),
          });
          continue;
        }
        const workedThisWeek = workedDaysByWeek.get(`${employee.id}:${weekKey}`) || new Set<string>();
        if (workedThisWeek.size >= employee.weeklyWorkDays) {
          conflicts.push({
            shiftDate: date,
            severity: "SOFT_WARNING",
            category: "UNEVEN_WORKLOAD",
            processId: process.id,
            employeeId: employee.id,
            message: `${employee.employeeCode} reached the weekly work-day limit and was excluded from ${process.code} on ${date}.`,
            detailsJson: JSON.stringify({ weeklyWorkDays: employee.weeklyWorkDays, workedDays: workedThisWeek.size }),
          });
          continue;
        }
        if ((consecutiveDays.get(employee.id) || 0) >= employee.maxConsecutiveDays) {
          conflicts.push({
            shiftDate: date,
            severity: "SOFT_WARNING",
            category: "MAX_CONSECUTIVE_DAYS",
            processId: process.id,
            employeeId: employee.id,
            message: `${employee.employeeCode} reached the maximum consecutive work-day limit and was excluded from ${process.code} on ${date}.`,
            detailsJson: JSON.stringify({ maxConsecutiveDays: employee.maxConsecutiveDays }),
          });
          continue;
        }
        candidates.push({ assignment, employee, tierRank: TIER_RANK[assignment.assignmentType] });
      }
      candidates.sort(compareAssignments);
      candidatesByProcess.set(process.id, candidates);

      if (!candidates.some((candidate) => candidate.assignment.assignmentType === "PRIMARY")) {
        conflicts.push({
          shiftDate: date,
          severity: "SOFT_WARNING",
          category: "SINGLE_POINT_FAILURE",
          processId: process.id,
          employeeId: null,
          message: `No available PRIMARY resource is assigned to ${process.code} on ${date}.`,
          detailsJson: JSON.stringify({ primaryAssignmentCount: primaryAssignments.length }),
        });
      }

      const availableBackups = candidates.filter(
        (candidate) => candidate.assignment.assignmentType === "SECONDARY_BACKUP"
      );
      if (process.brand.isSingleResource && availableBackups.length === 0) {
        conflicts.push({
          shiftDate: date,
          severity: "SOFT_WARNING",
          category: "SINGLE_POINT_FAILURE",
          processId: process.id,
          employeeId: null,
          message: `Single-resource process ${process.code} has no available SECONDARY_BACKUP resource on ${date}.`,
          detailsJson: JSON.stringify({
            brandId: process.brand.id,
            brandCode: process.brand.code,
            backupAssignmentCount: backupAssignments.length,
          }),
        });
      }

      const allocatableSlots = Math.min(schedule.requiredStaffCount, employees.length);
      for (let slotNumber = 0; slotNumber < allocatableSlots; slotNumber += 1) {
        slots.push({
          id: `${process.id}:${slotNumber}`,
          process,
          slotNumber,
          candidates,
        });
      }
    }

    slots.sort((a, b) =>
      a.candidates.length - b.candidates.length ||
      a.process.code.localeCompare(b.process.code) ||
      a.slotNumber - b.slotNumber
    );
    const matching = resolveMatching(slots);
    const employeesWithWork = new Set<string>();

    for (const slot of slots) {
      const selected = matching.get(slot.id);
      if (!selected) continue;
      employeesWithWork.add(selected.employee.id);
      shifts.push({
        shiftDate: date,
        employeeId: selected.employee.id,
        processId: slot.process.id,
        status: "WORKING",
        shiftType: selected.assignment.assignmentType === "SECONDARY_BACKUP"
          ? "BACKUP_COVERAGE"
          : "REGULAR",
      });
    }

    for (const employee of employees) {
      const wasAssigned = employeesWithWork.has(employee.id);
      consecutiveDays.set(employee.id, wasAssigned ? (consecutiveDays.get(employee.id) || 0) + 1 : 0);
      if (wasAssigned) {
        const key = `${employee.id}:${mondayOf(date)}`;
        const workedThisWeek = workedDaysByWeek.get(key) || new Set<string>();
        workedThisWeek.add(date);
        workedDaysByWeek.set(key, workedThisWeek);
      }
    }

    for (const { process, schedule } of operatingProcesses) {
      const assignedCount = slots.filter((slot) =>
        slot.process.id === process.id && matching.has(slot.id)
      ).length;
      const unfilled = schedule.requiredStaffCount - assignedCount;
      if (unfilled <= 0) continue;
      unfilledPositions += unfilled;
      conflicts.push({
        shiftDate: date,
        severity: "HARD_ERROR",
        category: "UNDER_COVERAGE",
        processId: process.id,
        employeeId: null,
        message: `${process.code} is short ${unfilled} of ${schedule.requiredStaffCount} required staff on ${date}.`,
        detailsJson: JSON.stringify({
          requiredStaffCount: schedule.requiredStaffCount,
          assignedStaffCount: assignedCount,
          unfilledPositions: unfilled,
        }),
      });

      const candidates = candidatesByProcess.get(process.id) || [];
      const doubleBooked = candidates.filter((candidate) => {
        if (!employeesWithWork.has(candidate.employee.id)) return false;
        const allocation = [...matching.entries()].find(([, item]) => item.employee.id === candidate.employee.id);
        const allocatedProcess = allocation
          ? slots.find((slot) => slot.id === allocation[0])?.process
          : undefined;
        return allocatedProcess?.id !== process.id;
      });
      for (const candidate of doubleBooked) {
        const allocatedSlot = [...matching.entries()].find(([, allocation]) =>
          allocation.employee.id === candidate.employee.id
        );
        const otherProcess = allocatedSlot
          ? slots.find((slot) => slot.id === allocatedSlot[0])?.process
          : undefined;
        conflicts.push({
          shiftDate: date,
          severity: "SOFT_WARNING",
          category: "DOUBLE_BOOKING",
          processId: process.id,
          employeeId: candidate.employee.id,
          message: `${candidate.employee.employeeCode} could not cover ${process.code} because they were allocated to ${otherProcess?.code || "another process"} on the same date.`,
          detailsJson: JSON.stringify({ allocatedProcessId: otherProcess?.id || null }),
        });
      }
    }

    for (const { process, schedule } of operatingProcesses) {
      if (schedule.requiredStaffCount === 0) {
        conflicts.push({
          shiftDate: date,
          severity: "HARD_ERROR",
          category: "CALENDAR_INCONSISTENCY",
          processId: process.id,
          employeeId: null,
          message: `${process.code} is marked to operate on ${date} but has no positive staffing requirement.`,
          detailsJson: null,
        });
      }
    }
  }

  return {
    shifts,
    conflicts,
    summary: {
      totalAssignedShifts: shifts.filter((shift) => shift.status === "WORKING").length,
      totalScheduleEntries: shifts.length,
      totalConflicts: conflicts.length,
      unfilledPositions,
      processDays,
    },
  };
}
