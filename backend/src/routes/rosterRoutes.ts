import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { generateMonthlyRoster } from "../rosterEngine.js";
import { getProcessScheduleForDate } from "../scheduling.js";
import rosterManagementRoutes from "./rosterManagementRoutes.js";

const router = Router();

const generationSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1900).max(9999),
});

const rosterViewQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(9999),
  podId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  processId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
});

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = rosterViewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid roster view filters",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { month, year, podId, brandId, processId, employeeId } = parsed.data;
  const monthYear = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;

  try {
    const roster = await prisma.roster.findUnique({
      where: { monthYear },
      include: {
        shifts: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                name: true,
                pod: { select: { id: true, code: true, name: true } },
              },
            },
            process: {
              select: {
                id: true,
                code: true,
                name: true,
                brand: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    podId: true,
                    pod: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ shiftDate: "asc" }, { employee: { employeeCode: "asc" } }],
        },
        conflicts: { orderBy: [{ shiftDate: "asc" }, { severity: "asc" }] },
      },
    });

    if (!roster) {
      res.status(404).json({ success: false, message: `No roster exists for ${monthYear}` });
      return;
    }

    const [selectedEmployee, selectedPod, selectedBrand, selectedProcess] = await Promise.all([
      employeeId ? prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }) : null,
      podId ? prisma.pod.findUnique({ where: { id: podId }, select: { id: true } }) : null,
      brandId ? prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } }) : null,
      processId ? prisma.process.findUnique({ where: { id: processId }, select: { id: true } }) : null,
    ]);

    if ((employeeId && !selectedEmployee) || (podId && !selectedPod) ||
        (brandId && !selectedBrand) || (processId && !selectedProcess)) {
      res.status(404).json({ success: false, message: "One or more roster filters reference missing records" });
      return;
    }

    const startDate = `${monthYear}-01`;
    const endDate = `${monthYear}-${new Date(Date.UTC(year, month, 0)).getUTCDate().toString().padStart(2, "0")}`;
    const [employees, processes, holidays] = await Promise.all([
      prisma.employee.findMany({
        where: {
          OR: [
            { rosterShifts: { some: { rosterId: roster.id } } },
            { isActive: true },
            ...(employeeId ? [{ id: employeeId }] : []),
          ],
        },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          pod: { select: { id: true, code: true, name: true } },
        },
        orderBy: { employeeCode: "asc" },
      }),
      prisma.process.findMany({
        where: {
          ...(processId ? { id: processId } : {}),
          ...(brandId ? { brandId } : {}),
          ...(podId ? { brand: { podId } } : {}),
        },
        select: {
          id: true,
          code: true,
          name: true,
          calendarType: true,
          defaultMinStaff: true,
          brand: { select: { id: true, code: true, name: true, podId: true } },
          coverageRules: {
            where: {
              OR: [
                { dateOverride: { gte: startDate, lte: endDate } },
                { dayOfWeek: { not: null } },
              ],
            },
            select: { dateOverride: true, dayOfWeek: true, requiredStaffCount: true },
          },
        },
        orderBy: { code: "asc" },
      }),
      prisma.publicHoliday.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { date: true, isMandatoryOff: true },
      }),
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const processById = new Map(processes.map((process) => [process.id, process]));
    const matchesFilters = (shift: typeof roster.shifts[number]) =>
      (!employeeId || shift.employeeId === employeeId) &&
      (!podId || shift.employee.pod?.id === podId) &&
      (!brandId || shift.process?.brand.id === brandId) &&
      (!processId || shift.processId === processId);
    const shifts = roster.shifts.filter(matchesFilters);
    const filteredEmployees = employees.filter((employee) =>
      (!employeeId || employee.id === employeeId) &&
      (!podId || employee.pod?.id === podId) &&
      (!brandId || shifts.some((shift) => shift.employeeId === employee.id)) &&
      (!processId || shifts.some((shift) => shift.employeeId === employee.id))
    );
    const conflicts = roster.conflicts.filter((conflict) =>
      (!employeeId || conflict.employeeId === employeeId) &&
      (!podId ||
        employeeById.get(conflict.employeeId || "")?.pod?.id === podId ||
        processById.get(conflict.processId || "")?.brand.podId === podId) &&
      (!brandId || processById.get(conflict.processId || "")?.brand.id === brandId) &&
      (!processId || conflict.processId === processId)
    ).map((conflict) => ({
      ...conflict,
      process: processById.get(conflict.processId || "")
        ? {
            id: conflict.processId,
            code: processById.get(conflict.processId || "")!.code,
            name: processById.get(conflict.processId || "")!.name,
            brand: processById.get(conflict.processId || "")!.brand,
          }
        : null,
      employee: employeeById.get(conflict.employeeId || "") || null,
    }));

    const dates = Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, index) =>
      `${monthYear}-${(index + 1).toString().padStart(2, "0")}`
    );
    const holidayByDate = new Map(holidays.map((holiday) => [holiday.date, holiday.isMandatoryOff]));
    const includeStaffing = Boolean(brandId || processId);
    const processStaffing = includeStaffing
      ? processes.flatMap((process) => dates.flatMap((date) => {
          const schedule = getProcessScheduleForDate(
            process.calendarType,
            date,
            holidayByDate.get(date) || false,
            process.coverageRules,
            process.defaultMinStaff
          );
          if (!schedule.operates) return [];
          const savedAssignedCount = roster.shifts.filter((shift) =>
            shift.shiftDate === date && shift.processId === process.id && shift.status === "WORKING"
          ).length;
          const activeCoverageConflict = roster.conflicts.find((conflict) =>
            !conflict.isResolved &&
            conflict.category === "UNDER_COVERAGE" &&
            conflict.processId === process.id &&
            conflict.shiftDate === date
          );
          let actualStaffCount = savedAssignedCount;
          if (activeCoverageConflict?.detailsJson) {
            const details = JSON.parse(activeCoverageConflict.detailsJson) as { assignedStaffCount?: number };
            if (Number.isInteger(details.assignedStaffCount) && details.assignedStaffCount! >= 0) {
              actualStaffCount = details.assignedStaffCount!;
            }
          }
          return [{
            date,
            processId: process.id,
            processCode: process.code,
            processName: process.name,
            brand: process.brand,
            requiredStaffCount: schedule.requiredStaffCount,
            actualStaffCount,
            unfilledPositions: Math.max(schedule.requiredStaffCount - actualStaffCount, 0),
          }];
        }))
      : [];

    res.json({
      success: true,
      data: {
        roster: {
          id: roster.id,
          monthYear: roster.monthYear,
          status: roster.status,
          generatedAt: roster.generatedAt,
        },
        employees: filteredEmployees,
        processes,
        shifts,
        conflicts,
        staffingBasis: includeStaffing
          ? "Staffing is calculated from current process and holiday rules; rules are not snapshotted with the roster."
          : null,
        processStaffing,
        summary: {
          workingShifts: shifts.filter((shift) => shift.status === "WORKING").length,
          weeklyOffs: shifts.filter((shift) => shift.status === "WEEKLY_OFF").length,
          leaves: shifts.filter((shift) => shift.status === "LEAVE").length,
          compOffs: shifts.filter((shift) => shift.status === "COMP_OFF").length,
          holidays: shifts.filter((shift) => shift.status === "HOLIDAY").length,
          conflicts: conflicts.length,
          unfilledPositions: processStaffing.reduce((total, item) => total + item.unfilledPositions, 0),
        },
      },
    });
  } catch (error) {
    console.error("Error reading monthly roster:", error);
    res.status(500).json({ success: false, message: "Internal server error reading monthly roster" });
  }
});

router.post("/generate", async (req: Request, res: Response): Promise<void> => {
  const parsed = generationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { month, year } = parsed.data;
  const monthYear = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;

  try {
    const existing = await prisma.roster.findUnique({ where: { monthYear }, select: { id: true } });
    if (existing) {
      res.status(409).json({
        success: false,
        message: `A roster already exists for ${monthYear}`,
      });
      return;
    }

    const startDate = `${monthYear}-01`;
    const endDate = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${new Date(Date.UTC(year, month, 0)).getUTCDate().toString().padStart(2, "0")}`;

    const [employees, processes, holidays] = await Promise.all([
      prisma.employee.findMany({
        select: {
          id: true,
          employeeCode: true,
          name: true,
          isActive: true,
          weeklyWorkDays: true,
          maxConsecutiveDays: true,
          weeklyOffs: {
            select: { dayOfWeek: true, isStandard: true, specificDate: true },
          },
          leaves: {
            where: {
              status: { not: "REJECTED" },
              startDate: { lte: endDate },
              endDate: { gte: startDate },
            },
            select: { startDate: true, endDate: true, leaveType: true, status: true },
          },
        },
      }),
      prisma.process.findMany({
        include: {
          brand: {
            select: { id: true, code: true, name: true, isSingleResource: true },
          },
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
            select: { employeeId: true, assignmentType: true, priorityRank: true },
          },
        },
        orderBy: { code: "asc" },
      }),
      prisma.publicHoliday.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { date: true, name: true, isMandatoryOff: true },
      }),
    ]);
    const firstMonthDate = new Date(Date.UTC(year, month - 1, 1));
    firstMonthDate.setUTCDate(firstMonthDate.getUTCDate() - 14);
    const priorStartDate = firstMonthDate.toISOString().slice(0, 10);
    const priorWorkDates = await prisma.rosterShift.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        status: "WORKING",
        shiftDate: { gte: priorStartDate, lt: startDate },
      },
      select: { employeeId: true, shiftDate: true },
    });

    const generated = generateMonthlyRoster({
      month,
      year,
      employees,
      processes,
      holidays,
      priorWorkDates,
    });

    const roster = await prisma.$transaction(async (transaction) => {
      const created = await transaction.roster.create({
        data: { monthYear, status: "DRAFT" },
      });

      if (generated.shifts.length) {
        await transaction.rosterShift.createMany({
          data: generated.shifts.map((shift) => ({
            ...shift,
            rosterId: created.id,
          })),
        });
      }

      if (generated.conflicts.length) {
        await transaction.rosterConflict.createMany({
          data: generated.conflicts.map((conflict) => ({
            ...conflict,
            rosterId: created.id,
          })),
        });
      }

      return transaction.roster.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          shifts: {
            include: {
              employee: { select: { id: true, employeeCode: true, name: true } },
              process: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  brand: { select: { id: true, code: true, name: true } },
                },
              },
            },
            orderBy: [{ shiftDate: "asc" }, { employee: { employeeCode: "asc" } }],
          },
          conflicts: {
            orderBy: [{ shiftDate: "asc" }, { severity: "asc" }],
          },
        },
      });
    }, { maxWait: 10000, timeout: 60000 });

    res.status(201).json({
      success: true,
      message: `Roster generated for ${monthYear}`,
      data: {
        ...roster,
        conflicts: roster.conflicts.map((conflict) => ({
          ...conflict,
          process: processes.find((process) => process.id === conflict.processId)
            ? {
                id: conflict.processId,
                code: processes.find((process) => process.id === conflict.processId)?.code,
                name: processes.find((process) => process.id === conflict.processId)?.name,
              }
            : null,
          employee: employees.find((employee) => employee.id === conflict.employeeId)
            ? {
                id: conflict.employeeId,
                employeeCode: employees.find((employee) => employee.id === conflict.employeeId)?.employeeCode,
                name: employees.find((employee) => employee.id === conflict.employeeId)?.name,
              }
            : null,
        })),
        summary: generated.summary,
      },
    });
  } catch (error) {
    console.error("Error generating monthly roster:", error);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({
        success: false,
        message: `A roster already exists for ${monthYear}`,
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: "Internal server error generating monthly roster",
    });
  }
});

router.use(rosterManagementRoutes);

export default router;
