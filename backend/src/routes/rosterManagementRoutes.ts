import { Prisma, RosterConflict } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getProcessScheduleForDate } from "../scheduling.js";

const router = Router();
const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Date must be a valid YYYY-MM-DD date");
const rosterParamsSchema = z.object({ rosterId: idSchema });
const shiftParamsSchema = z.object({ rosterId: idSchema, shiftId: idSchema });
const editSchema = z.object({ employeeId: idSchema });
const fillSchema = z.object({
  shiftDate: dateSchema,
  processId: idSchema,
  employeeId: idSchema,
});
const recommendationQuerySchema = z.object({
  date: dateSchema,
  processId: idSchema,
  shiftId: idSchema.optional(),
  excludeEmployeeId: idSchema.optional(),
});
const conflictQuerySchema = z.object({
  status: z.enum(["active", "resolved", "all"]).default("active"),
});

type Transaction = Prisma.TransactionClient;

class RosterEditError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function isUnavailable(
  employee: {
    weeklyOffs: Array<{ dayOfWeek: number; isStandard: boolean; specificDate: string | null }>;
    leaves: Array<{ startDate: string; endDate: string; leaveType: string; status: string }>;
  },
  date: string,
  isMandatoryHoliday: boolean
): string | null {
  if (isMandatoryHoliday) return "The employee is unavailable on a mandatory public holiday.";
  const leave = employee.leaves.find((item) =>
    item.status !== "REJECTED" && item.startDate <= date && item.endDate >= date
  );
  if (leave) {
    return leave.leaveType === "COMP_OFF"
      ? "The employee has a comp-off on this date."
      : `The employee has ${leave.status.toLowerCase()} ${leave.leaveType.toLowerCase()} leave on this date.`;
  }
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  if (employee.weeklyOffs.some((off) =>
    off.isStandard ? off.dayOfWeek === weekday : off.specificDate === date
  )) {
    return "The employee has a weekly off on this date.";
  }
  return null;
}

async function loadRosterDateContext(
  transaction: Transaction,
  rosterId: string,
  date: string,
  processId: string
) {
  const roster = await transaction.roster.findUnique({
    where: { id: rosterId },
    select: { id: true, monthYear: true },
  });
  if (!roster) throw new RosterEditError(404, "Roster not found.");
  if (!date.startsWith(`${roster.monthYear}-`)) {
    throw new RosterEditError(400, "The selected date is outside this roster month.");
  }
  const [process, holiday] = await Promise.all([
    transaction.process.findUnique({
      where: { id: processId },
      include: {
        brand: { select: { id: true, code: true, name: true, isSingleResource: true } },
        coverageRules: {
          where: {
            OR: [
              { dateOverride: date },
              { dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay() },
            ],
          },
          select: { dateOverride: true, dayOfWeek: true, requiredStaffCount: true },
        },
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                name: true,
                isActive: true,
                weeklyOffs: { select: { dayOfWeek: true, isStandard: true, specificDate: true } },
                leaves: {
                  where: { startDate: { lte: date }, endDate: { gte: date }, status: { not: "REJECTED" } },
                  select: { startDate: true, endDate: true, leaveType: true, status: true },
                },
              },
            },
          },
        },
      },
    }),
    transaction.publicHoliday.findUnique({ where: { date }, select: { isMandatoryOff: true } }),
  ]);
  if (!process) throw new RosterEditError(404, "Process not found.");

  const schedule = getProcessScheduleForDate(
    process.calendarType,
    date,
    holiday?.isMandatoryOff === true,
    process.coverageRules,
    process.defaultMinStaff
  );
  if (!schedule.operates) {
    throw new RosterEditError(409, `Process ${process.code} does not operate on ${date}.`);
  }
  return { roster, process, holiday, schedule };
}

async function validateEmployeeForProcess(
  transaction: Transaction,
  context: Awaited<ReturnType<typeof loadRosterDateContext>>,
  employeeId: string,
  date: string,
  ignoredShiftId?: string
) {
  const assignment = context.process.assignments.find((item) => item.employeeId === employeeId);
  if (!assignment) {
    const employeeExists = await transaction.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employeeExists) throw new RosterEditError(404, "Employee not found.");
    throw new RosterEditError(409, "Employee is not assigned to this process and is not an eligible backup.");
  }
  const employee = assignment.employee;
  if (!employee.isActive) throw new RosterEditError(409, "Inactive employees cannot be assigned.");
  const unavailableReason = isUnavailable(employee, date, context.holiday?.isMandatoryOff === true);
  if (unavailableReason) throw new RosterEditError(409, unavailableReason);

  const existingWork = await transaction.rosterShift.findFirst({
    where: {
      rosterId: context.roster.id,
      shiftDate: date,
      employeeId,
      status: "WORKING",
      ...(ignoredShiftId ? { id: { not: ignoredShiftId } } : {}),
    },
    include: { process: { select: { code: true } } },
  });
  if (existingWork) {
    throw new RosterEditError(
      409,
      `Employee is already assigned to ${existingWork.process?.code || "another process"} on ${date}.`
    );
  }
  return assignment;
}

async function countValidProcessStaff(
  transaction: Transaction,
  context: Awaited<ReturnType<typeof loadRosterDateContext>>,
  date: string
): Promise<number> {
  const shifts = await transaction.rosterShift.findMany({
    where: { rosterId: context.roster.id, shiftDate: date, status: "WORKING" },
    select: { employeeId: true, processId: true },
  });
  const shiftsByEmployee = new Map<string, number>();
  for (const shift of shifts) {
    shiftsByEmployee.set(shift.employeeId, (shiftsByEmployee.get(shift.employeeId) || 0) + 1);
  }
  const assignments = new Map(context.process.assignments.map((item) => [item.employeeId, item]));
  return shifts.filter((shift) => {
    if (shift.processId !== context.process.id || shiftsByEmployee.get(shift.employeeId) !== 1) return false;
    const assignment = assignments.get(shift.employeeId);
    return Boolean(
      assignment?.employee.isActive &&
      !isUnavailable(assignment.employee, date, context.holiday?.isMandatoryOff === true)
    );
  }).length;
}

async function getEligibleReplacements(
  transaction: Transaction,
  rosterId: string,
  date: string,
  processId: string,
  ignoredShiftId?: string,
  excludeEmployeeId?: string
) {
  const context = await loadRosterDateContext(transaction, rosterId, date, processId);
  const occupied = await transaction.rosterShift.findMany({
    where: {
      rosterId,
      shiftDate: date,
      status: "WORKING",
      ...(ignoredShiftId ? { id: { not: ignoredShiftId } } : {}),
    },
    select: { employeeId: true },
  });
  const occupiedIds = new Set(occupied.map((shift) => shift.employeeId));
  const candidates = context.process.assignments
    .filter((assignment) =>
      assignment.employee.isActive &&
      assignment.employeeId !== excludeEmployeeId &&
      !occupiedIds.has(assignment.employeeId) &&
      !isUnavailable(assignment.employee, date, context.holiday?.isMandatoryOff === true)
    )
    .sort((a, b) =>
      ({ PRIMARY: 0, SECONDARY_BACKUP: 1, FLOAT: 2 }[a.assignmentType] -
        { PRIMARY: 0, SECONDARY_BACKUP: 1, FLOAT: 2 }[b.assignmentType]) ||
      a.priorityRank - b.priorityRank ||
      a.employee.employeeCode.localeCompare(b.employee.employeeCode)
    )
    .map((assignment) => ({
      id: assignment.employee.id,
      employeeCode: assignment.employee.employeeCode,
      name: assignment.employee.name,
      assignmentType: assignment.assignmentType,
      priorityRank: assignment.priorityRank,
    }));
  return { context, candidates };
}

type ConflictCandidate = Pick<
  RosterConflict,
  "shiftDate" | "severity" | "category" | "processId" | "employeeId" | "message" | "detailsJson"
>;

function conflictKey(conflict: Pick<ConflictCandidate, "shiftDate" | "category" | "processId" | "employeeId">): string {
  return [conflict.shiftDate, conflict.category, conflict.processId || "", conflict.employeeId || ""].join(":");
}

const REVALIDATED_CATEGORIES = [
  "UNDER_COVERAGE",
  "LEAVE_COLLISION",
  "DOUBLE_BOOKING",
  "UNQUALIFIED_ASSIGNMENT",
  "CALENDAR_INCONSISTENCY",
  "SINGLE_POINT_FAILURE",
] as const;

async function revalidateRoster(transaction: Transaction, rosterId: string, focusDate?: string) {
  const roster = await transaction.roster.findUnique({
    where: { id: rosterId },
    select: { id: true, monthYear: true },
  });
  if (!roster) throw new RosterEditError(404, "Roster not found.");
  const [year, month] = roster.monthYear.split("-").map(Number);
  if (!month || !year || year < 1) throw new RosterEditError(400, "Roster month is invalid.");
  const startDate = `${roster.monthYear}-01`;
  const endDate = `${roster.monthYear}-${new Date(Date.UTC(year, month, 0)).getUTCDate().toString().padStart(2, "0")}`;
  if (focusDate && !focusDate.startsWith(`${roster.monthYear}-`)) {
    throw new RosterEditError(400, "The selected date is outside this roster month.");
  }
  const [shifts, processes, holidays, existingConflicts] = await Promise.all([
    transaction.rosterShift.findMany({
      where: { rosterId, ...(focusDate ? { shiftDate: focusDate } : {}) },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            isActive: true,
            weeklyOffs: { select: { dayOfWeek: true, isStandard: true, specificDate: true } },
            leaves: {
              where: { startDate: { lte: endDate }, endDate: { gte: startDate }, status: { not: "REJECTED" } },
              select: { startDate: true, endDate: true, leaveType: true, status: true },
            },
          },
        },
        process: { select: { id: true, code: true, calendarType: true, defaultMinStaff: true, brand: { select: { id: true, code: true, isSingleResource: true } } } },
      },
      orderBy: [{ shiftDate: "asc" }, { employeeId: "asc" }],
    }),
    transaction.process.findMany({
      include: {
        brand: { select: { id: true, code: true, isSingleResource: true } },
        coverageRules: {
          where: {
            OR: [
              { dateOverride: { gte: startDate, lte: endDate } },
              { dayOfWeek: { not: null } },
            ],
          },
          select: { dateOverride: true, dayOfWeek: true, requiredStaffCount: true },
        },
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                name: true,
                isActive: true,
                weeklyOffs: { select: { dayOfWeek: true, isStandard: true, specificDate: true } },
                leaves: {
                  where: { startDate: { lte: endDate }, endDate: { gte: startDate }, status: { not: "REJECTED" } },
                  select: { startDate: true, endDate: true, leaveType: true, status: true },
                },
              },
            },
          },
        },
      },
    }),
    transaction.publicHoliday.findMany({
      where: focusDate
        ? { date: focusDate }
        : { date: { gte: startDate, lte: endDate } },
      select: { date: true, name: true, isMandatoryOff: true },
    }),
    transaction.rosterConflict.findMany({
      where: {
        rosterId,
        category: { in: [...REVALIDATED_CATEGORIES] },
        ...(focusDate ? { shiftDate: focusDate } : {}),
      },
    }),
  ]);

  const dateSet = new Set(shifts.map((shift) => shift.shiftDate));
  const holidayByDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));
  const shiftByEmployeeDate = new Map<string, typeof shifts>();
  const desired = new Map<string, ConflictCandidate>();
  const attention = new Map<string, { shiftId: string; date: string; processId: string; employeeId: string; reason: string }>();
  const validShiftIds = new Set<string>();

  const addConflict = (conflict: ConflictCandidate) => desired.set(conflictKey(conflict), conflict);
  for (const shift of shifts.filter((item) => item.status === "WORKING")) {
    const key = `${shift.employeeId}:${shift.shiftDate}`;
    const sameDay = shiftByEmployeeDate.get(key) || [];
    sameDay.push(shift);
    shiftByEmployeeDate.set(key, sameDay);
    const process = processes.find((item) => item.id === shift.processId);
    let reason: string | null = null;
    let category: ConflictCandidate["category"] = "LEAVE_COLLISION";

    if (!shift.employee.isActive) {
      category = "UNQUALIFIED_ASSIGNMENT";
      reason = `Inactive employee ${shift.employee.employeeCode} remains assigned to this shift.`;
    } else if (!process) {
      category = "UNQUALIFIED_ASSIGNMENT";
      reason = `Employee ${shift.employee.employeeCode} is assigned to a missing process.`;
    } else if (!process.assignments.some((assignment) => assignment.employeeId === shift.employeeId)) {
      category = "UNQUALIFIED_ASSIGNMENT";
      reason = `${shift.employee.employeeCode} is no longer assigned to ${process.code}.`;
    } else {
      const unavailable = isUnavailable(
        shift.employee,
        shift.shiftDate,
        holidayByDate.get(shift.shiftDate)?.isMandatoryOff === true
      );
      if (unavailable) {
        category = "LEAVE_COLLISION";
        reason = `${shift.employee.employeeCode} is still assigned but unavailable: ${unavailable}`;
      } else {
        const schedule = getProcessScheduleForDate(
          process.calendarType,
          shift.shiftDate,
          holidayByDate.get(shift.shiftDate)?.isMandatoryOff === true,
          process.coverageRules,
          process.defaultMinStaff
        );
        if (!schedule.operates) {
          category = "CALENDAR_INCONSISTENCY";
          reason = `${process.code} no longer operates on ${shift.shiftDate}.`;
        }
      }
    }

    if (reason && process) {
      addConflict({
        shiftDate: shift.shiftDate,
        severity: "HARD_ERROR",
        category,
        processId: process.id,
        employeeId: shift.employeeId,
        message: reason,
        detailsJson: JSON.stringify({ shiftId: shift.id }),
      });
      attention.set(shift.id, {
        shiftId: shift.id,
        date: shift.shiftDate,
        processId: process.id,
        employeeId: shift.employeeId,
        reason,
      });
    } else if (reason) {
      addConflict({
        shiftDate: shift.shiftDate,
        severity: "HARD_ERROR",
        category,
        processId: shift.processId,
        employeeId: shift.employeeId,
        message: reason,
        detailsJson: JSON.stringify({ shiftId: shift.id }),
      });
    } else {
      validShiftIds.add(shift.id);
    }
  }

  for (const sameDayShifts of shiftByEmployeeDate.values()) {
    if (sameDayShifts.length < 2) continue;
    for (const shift of sameDayShifts) {
      validShiftIds.delete(shift.id);
      addConflict({
        shiftDate: shift.shiftDate,
        severity: "HARD_ERROR",
        category: "DOUBLE_BOOKING",
        processId: shift.processId,
        employeeId: shift.employeeId,
        message: `${shift.employee.employeeCode} is assigned to multiple processes on ${shift.shiftDate}.`,
        detailsJson: JSON.stringify({ shiftIds: sameDayShifts.map((item) => item.id) }),
      });
    }
  }

  const allDates = focusDate
    ? [focusDate]
    : Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, index) =>
        `${roster.monthYear}-${(index + 1).toString().padStart(2, "0")}`
      );
  for (const process of processes) {
    for (const date of allDates) {
      const holiday = holidayByDate.get(date);
      const schedule = getProcessScheduleForDate(
        process.calendarType,
        date,
        holiday?.isMandatoryOff === true,
        process.coverageRules,
        process.defaultMinStaff
      );
      if (!schedule.operates) continue;
      dateSet.add(date);
      const assigned = shifts.filter((shift) =>
        shift.shiftDate === date &&
        shift.processId === process.id &&
        shift.status === "WORKING" &&
        validShiftIds.has(shift.id)
      );
      const shortage = Math.max(schedule.requiredStaffCount - assigned.length, 0);
      if (shortage > 0) {
        addConflict({
          shiftDate: date,
          severity: "HARD_ERROR",
          category: "UNDER_COVERAGE",
          processId: process.id,
          employeeId: null,
          message: `${process.code} is short ${shortage} of ${schedule.requiredStaffCount} required staff on ${date}.`,
          detailsJson: JSON.stringify({
            requiredStaffCount: schedule.requiredStaffCount,
            assignedStaffCount: assigned.length,
            unfilledPositions: shortage,
          }),
        });
      }

      const occupiedIds = new Set(shifts
        .filter((shift) => shift.shiftDate === date && shift.status === "WORKING")
        .map((shift) => shift.employeeId));
      const eligible = process.assignments.filter((assignment) =>
        assignment.employee.isActive &&
        !occupiedIds.has(assignment.employeeId) &&
        !isUnavailable(assignment.employee, date, holiday?.isMandatoryOff === true)
      );
      const hasEligiblePrimary = eligible.some((assignment) => assignment.assignmentType === "PRIMARY");
      const hasEligibleBackup = eligible.some((assignment) => assignment.assignmentType === "SECONDARY_BACKUP");
      const singlePointIssues: string[] = [];
      if (shortage > 0 && !hasEligiblePrimary) singlePointIssues.push("NO_PRIMARY");
      if (shortage > 0 && !hasEligibleBackup) singlePointIssues.push("NO_BACKUP");
      if (singlePointIssues.length) {
        addConflict({
          shiftDate: date,
          severity: shortage > 0 && singlePointIssues.includes("NO_BACKUP") ? "HARD_ERROR" : "SOFT_WARNING",
          category: "SINGLE_POINT_FAILURE",
          processId: process.id,
          employeeId: null,
          message: `${singlePointIssues.map((issue) =>
            issue === "NO_PRIMARY"
              ? `No eligible PRIMARY resource is available for ${process.code} on ${date}.`
              : `No eligible SECONDARY_BACKUP resource is available for ${process.code} on ${date}.`
          ).join(" ")}`,
          detailsJson: JSON.stringify({ issues: singlePointIssues, unfilledPositions: shortage }),
        });
      }

      if (shortage > 0) {
        attention.set(`${process.id}:${date}`, {
          shiftId: "",
          date,
          processId: process.id,
          employeeId: "",
          reason: `${shortage} position(s) remain unfilled for ${process.code}.`,
        });
      }
    }
  }

  const managedExisting = existingConflicts.filter((conflict) =>
    REVALIDATED_CATEGORIES.includes(conflict.category as typeof REVALIDATED_CATEGORIES[number])
  );
  const existingByKey = new Map<string, RosterConflict[]>();
  for (const conflict of managedExisting) {
    const key = conflictKey(conflict);
    existingByKey.set(key, [...(existingByKey.get(key) || []), conflict]);
  }
  const activateIds: string[] = [];
  const resolveIds: string[] = [];
  const creates: Array<{ rosterId: string } & ConflictCandidate & { isResolved: boolean }> = [];
  const changed: Array<{ id: string; conflict: ConflictCandidate }> = [];
  for (const [key, conflict] of desired) {
    const matching = existingByKey.get(key) || [];
    const existing = matching.find((item) => !item.isResolved) || matching[0];
    if (!existing) {
      creates.push({ rosterId, ...conflict, isResolved: false });
      continue;
    }
    if (existing.isResolved) activateIds.push(existing.id);
    if (existing.severity !== conflict.severity ||
        existing.message !== conflict.message ||
        existing.detailsJson !== conflict.detailsJson) {
      changed.push({ id: existing.id, conflict });
    }
    for (const duplicate of matching) {
      if (duplicate.id !== existing.id && !duplicate.isResolved) resolveIds.push(duplicate.id);
    }
    existingByKey.delete(key);
  }
  for (const records of existingByKey.values()) {
    resolveIds.push(...records.filter((item) => !item.isResolved).map((item) => item.id));
  }
  if (activateIds.length) {
    await transaction.rosterConflict.updateMany({
      where: { id: { in: activateIds } },
      data: { isResolved: false },
    });
  }
  if (resolveIds.length) {
    await transaction.rosterConflict.updateMany({
      where: { id: { in: resolveIds } },
      data: { isResolved: true },
    });
  }
  if (changed.length) {
    await Promise.all(changed.map(({ id, conflict }) => transaction.rosterConflict.update({
      where: { id },
      data: {
        severity: conflict.severity,
        message: conflict.message,
        detailsJson: conflict.detailsJson,
      },
    })));
  }
  if (creates.length) {
    await transaction.rosterConflict.createMany({ data: creates });
  }

  const recommendations = [...attention.values()].map((item) => {
    const process = processes.find((candidate) => candidate.id === item.processId);
    if (!process) return { ...item, replacements: [] };
    const holiday = holidayByDate.get(item.date);
    const schedule = getProcessScheduleForDate(
      process.calendarType,
      item.date,
      holiday?.isMandatoryOff === true,
      process.coverageRules,
      process.defaultMinStaff
    );
    if (!schedule.operates) return { ...item, replacements: [] };
    const occupied = new Set(shifts
      .filter((shift) =>
        shift.shiftDate === item.date &&
        shift.status === "WORKING" &&
        shift.id !== item.shiftId
      )
      .map((shift) => shift.employeeId));
    const replacements = process.assignments
      .filter((assignment) =>
        assignment.employee.isActive &&
        assignment.employeeId !== item.employeeId &&
        !occupied.has(assignment.employeeId) &&
        !isUnavailable(assignment.employee, item.date, holiday?.isMandatoryOff === true)
      )
      .sort((a, b) =>
        ({ PRIMARY: 0, SECONDARY_BACKUP: 1, FLOAT: 2 }[a.assignmentType] -
          { PRIMARY: 0, SECONDARY_BACKUP: 1, FLOAT: 2 }[b.assignmentType]) ||
        a.priorityRank - b.priorityRank ||
        a.employee.employeeCode.localeCompare(b.employee.employeeCode)
      )
      .map((assignment) => ({
        id: assignment.employee.id,
        employeeCode: assignment.employee.employeeCode,
        name: assignment.employee.name,
        assignmentType: assignment.assignmentType,
        priorityRank: assignment.priorityRank,
      }));
    return { ...item, replacements };
  });
  const updatedConflicts = await transaction.rosterConflict.findMany({
    where: { rosterId, category: { in: [...REVALIDATED_CATEGORIES] } },
    orderBy: [{ isResolved: "asc" }, { shiftDate: "asc" }, { severity: "asc" }],
  });
  const workingShifts = shifts.filter((shift) => shift.status === "WORKING" && validShiftIds.has(shift.id));
  const unfilledPositions = desired.size
    ? [...desired.values()]
        .filter((item) => item.category === "UNDER_COVERAGE")
        .reduce((sum, item) => {
          const parsed = item.detailsJson ? JSON.parse(item.detailsJson) as { unfilledPositions?: number } : {};
          return sum + (parsed.unfilledPositions || 0);
        }, 0)
    : 0;
  return {
    conflicts: updatedConflicts,
    recommendations,
    summary: {
      workingShifts: workingShifts.length,
      activeConflicts: updatedConflicts.filter((item) => !item.isResolved).length,
      resolvedConflicts: updatedConflicts.filter((item) => item.isResolved).length,
      unfilledPositions,
      datesChecked: dateSet.size,
    },
  };
}

function sendError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof RosterEditError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")) {
    res.status(409).json({
      success: false,
      message: "Roster data changed concurrently. Refresh the roster and retry the edit.",
    });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ success: false, message: fallback });
}

router.get("/:rosterId/conflicts", async (req: Request, res: Response): Promise<void> => {
  const params = rosterParamsSchema.safeParse(req.params);
  const query = conflictQuerySchema.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ success: false, message: "Invalid roster conflict filters" });
    return;
  }
  try {
    const roster = await prisma.roster.findUnique({
      where: { id: params.data.rosterId },
      select: { id: true },
    });
    if (!roster) {
      res.status(404).json({ success: false, message: "Roster not found." });
      return;
    }
    const whereStatus = query.data.status === "all" ? {} : { isResolved: query.data.status === "resolved" };
    const conflicts = await prisma.rosterConflict.findMany({
      where: { rosterId: params.data.rosterId, ...whereStatus },
      orderBy: [{ isResolved: "asc" }, { shiftDate: "asc" }, { severity: "asc" }],
    });
    res.json({
      success: true,
      data: conflicts,
      summary: {
        active: conflicts.filter((item) => !item.isResolved).length,
        resolved: conflicts.filter((item) => item.isResolved).length,
      },
    });
  } catch (error) {
    sendError(res, error, "Error fetching roster conflicts");
  }
});

router.get("/:rosterId/replacements", async (req: Request, res: Response): Promise<void> => {
  const params = rosterParamsSchema.safeParse(req.params);
  const query = recommendationQuerySchema.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ success: false, message: "Invalid replacement request" });
    return;
  }
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const { context, candidates } = await getEligibleReplacements(
        transaction,
        params.data.rosterId,
        query.data.date,
        query.data.processId,
        query.data.shiftId,
        query.data.excludeEmployeeId
      );
      if (query.data.shiftId) {
        const shift = await transaction.rosterShift.findFirst({
          where: { id: query.data.shiftId, rosterId: params.data.rosterId, shiftDate: query.data.date, processId: query.data.processId, status: "WORKING" },
          select: { id: true },
          });
        if (!shift) throw new RosterEditError(404, "Working roster assignment not found.");
      }
      const assigned = await countValidProcessStaff(transaction, context, query.data.date);
      return {
        candidates,
        staffing: {
          required: context.schedule.requiredStaffCount,
          assigned,
          unfilled: Math.max(context.schedule.requiredStaffCount - assigned, 0),
        },
      };
    }, { maxWait: 10000, timeout: 30000 });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, "Error finding eligible replacement employees");
  }
});

router.post("/:rosterId/revalidate", async (req: Request, res: Response): Promise<void> => {
  const params = rosterParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ success: false, message: "Invalid roster ID" });
    return;
  }
  try {
    const result = await prisma.$transaction(
      (transaction) => revalidateRoster(transaction, params.data.rosterId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, "Error revalidating roster");
  }
});

router.patch("/:rosterId/shifts/:shiftId", async (req: Request, res: Response): Promise<void> => {
  const params = shiftParamsSchema.safeParse(req.params);
  const body = editSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ success: false, message: "Invalid roster assignment update" });
    return;
  }
  try {
    const shift = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.rosterShift.findFirst({
        where: { id: params.data.shiftId, rosterId: params.data.rosterId, status: "WORKING" },
        select: { id: true, shiftDate: true, employeeId: true, processId: true },
      });
      if (!existing || !existing.processId) throw new RosterEditError(404, "Working roster assignment not found.");
      if (existing.employeeId === body.data.employeeId) throw new RosterEditError(400, "Choose a different employee for replacement.");
      const context = await loadRosterDateContext(transaction, params.data.rosterId, existing.shiftDate, existing.processId);
      const assignment = await validateEmployeeForProcess(
        transaction,
        context,
        body.data.employeeId,
        existing.shiftDate,
        existing.id
      );
      const previousEmployee = await transaction.employee.findUnique({
        where: { id: existing.employeeId },
        select: { employeeCode: true },
      });
      const updated = await transaction.rosterShift.update({
        where: { id: existing.id },
        data: {
          employeeId: body.data.employeeId,
          shiftType: assignment.assignmentType === "SECONDARY_BACKUP" ? "BACKUP_COVERAGE" : "REGULAR",
          isManualOverride: true,
          overrideReason: `Manually replaced ${previousEmployee?.employeeCode || existing.employeeId} on ${new Date().toISOString()}`,
        },
        include: {
          employee: { select: { id: true, employeeCode: true, name: true } },
          process: { select: { id: true, code: true, name: true, brand: { select: { id: true, code: true, name: true } } } },
        },
      });
      await revalidateRoster(transaction, params.data.rosterId, existing.shiftDate);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 });
    res.json({ success: true, data: shift });
  } catch (error) {
    sendError(res, error, "Error updating roster assignment");
  }
});

router.post("/:rosterId/shifts", async (req: Request, res: Response): Promise<void> => {
  const params = rosterParamsSchema.safeParse(req.params);
  const body = fillSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ success: false, message: "Invalid unfilled roster position request" });
    return;
  }
  try {
    const shift = await prisma.$transaction(async (transaction) => {
      const context = await loadRosterDateContext(
        transaction,
        params.data.rosterId,
        body.data.shiftDate,
        body.data.processId
      );
      const assigned = await countValidProcessStaff(transaction, context, body.data.shiftDate);
      if (assigned >= context.schedule.requiredStaffCount) {
        throw new RosterEditError(409, "This process has no unfilled staffing position on the selected date.");
      }
      const assignment = await validateEmployeeForProcess(
        transaction,
        context,
        body.data.employeeId,
        body.data.shiftDate
      );
      const created = await transaction.rosterShift.create({
        data: {
          rosterId: params.data.rosterId,
          shiftDate: body.data.shiftDate,
          employeeId: body.data.employeeId,
          processId: body.data.processId,
          status: "WORKING",
          shiftType: assignment.assignmentType === "SECONDARY_BACKUP" ? "BACKUP_COVERAGE" : "REGULAR",
          isManualOverride: true,
          overrideReason: `Manually filled by manager on ${new Date().toISOString()}`,
        },
        include: {
          employee: { select: { id: true, employeeCode: true, name: true } },
          process: { select: { id: true, code: true, name: true, brand: { select: { id: true, code: true, name: true } } } },
        },
      });
      await revalidateRoster(transaction, params.data.rosterId, body.data.shiftDate);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 });
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    sendError(res, error, "Error filling roster position");
  }
});

router.delete("/:rosterId/shifts/:shiftId", async (req: Request, res: Response): Promise<void> => {
  const params = shiftParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ success: false, message: "Invalid roster assignment ID" });
    return;
  }
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const shift = await transaction.rosterShift.findFirst({
        where: { id: params.data.shiftId, rosterId: params.data.rosterId, status: "WORKING" },
        select: { id: true, shiftDate: true, processId: true },
      });
      if (!shift) throw new RosterEditError(404, "Working roster assignment not found.");
      await transaction.rosterShift.delete({ where: { id: shift.id } });
      const validation = await revalidateRoster(transaction, params.data.rosterId, shift.shiftDate);
      return { removedShiftId: shift.id, conflicts: validation.conflicts, summary: validation.summary };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, "Error removing roster assignment");
  }
});

export default router;
