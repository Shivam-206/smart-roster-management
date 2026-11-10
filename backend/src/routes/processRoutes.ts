import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getProcessScheduleForDate } from "../scheduling.js";

const router = Router();

const processInputSchema = z.object({
  code: z
    .string({ error: "Process code is required" })
    .trim()
    .min(2, "Process code must be at least 2 characters")
    .max(30, "Process code cannot exceed 30 characters")
    .transform((val) => val.toUpperCase()),
  name: z
    .string({ error: "Process name is required" })
    .trim()
    .min(2, "Process name must be at least 2 characters")
    .max(120, "Process name cannot exceed 120 characters"),
  brandId: z.string({ error: "Brand ID is required" }).uuid("Invalid Brand ID"),
  calendarType: z.enum(
    [
      "ALL_365_DAYS",
      "ALL_EXCEPT_PUBLIC_HOLIDAYS",
      "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS",
      "CUSTOM",
    ],
    { error: "Calendar type is required" }
  ),
  defaultMinStaff: z.number().int().min(1, "Minimum staffing must be at least 1").default(1),
  description: z.string().trim().max(500).optional().nullable(),
});

const processUpdateSchema = processInputSchema.partial();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid YYYY-MM-DD date");
const coverageRuleBaseSchema = z.object({
  dateOverride: dateSchema.nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  requiredStaffCount: z.number().int().min(1, "Required staff must be a positive integer"),
  note: z.string().trim().max(500).nullable().optional(),
});
const coverageRuleSchema = coverageRuleBaseSchema.superRefine((value, context) => {
  const hasDate = Boolean(value.dateOverride);
  const hasDay = value.dayOfWeek !== undefined && value.dayOfWeek !== null;
  if (hasDate === hasDay) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateOverride"],
      message: "Specify exactly one of dateOverride or dayOfWeek",
    });
  }
});
const coverageRuleUpdateSchema = coverageRuleBaseSchema.partial();
const idSchema = z.string().uuid();

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: error.flatten().fieldErrors,
  });
}

router.get("/:id/calendar", async (req: Request, res: Response): Promise<void> => {
  try {
    const processId = idSchema.safeParse(req.params.id);
    const date = dateSchema.safeParse(req.query.date);
    if (!processId.success) {
      res.status(400).json({ success: false, message: "Invalid Process ID" });
      return;
    }
    if (!date.success) {
      sendValidationError(res, date.error);
      return;
    }
    const processItem = await prisma.process.findUnique({
      where: { id: processId.data },
      include: { coverageRules: true },
    });
    if (!processItem) {
      res.status(404).json({ success: false, message: "Process not found" });
      return;
    }
    const holiday = await prisma.publicHoliday.findUnique({
      where: { date: date.data },
      select: { isMandatoryOff: true },
    });
    const schedule = getProcessScheduleForDate(
      processItem.calendarType,
      date.data,
      holiday?.isMandatoryOff === true,
      processItem.coverageRules,
      processItem.defaultMinStaff
    );
    res.json({
      success: true,
      data: {
        processId: processItem.id,
        date: date.data,
        calendarType: processItem.calendarType,
        ...schedule,
      },
    });
  } catch (error) {
    console.error("Error evaluating process calendar:", error);
    res.status(500).json({ success: false, message: "Internal server error evaluating process calendar" });
  }
});

router.get("/:id/coverage-rules", async (req: Request, res: Response): Promise<void> => {
  try {
    const processId = idSchema.safeParse(req.params.id);
    if (!processId.success) {
      res.status(400).json({ success: false, message: "Invalid Process ID" });
      return;
    }
    const exists = await prisma.process.findUnique({ where: { id: processId.data }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ success: false, message: "Process not found" });
      return;
    }
    const rules = await prisma.processCoverageRule.findMany({
      where: { processId: processId.data },
      orderBy: [{ dateOverride: "asc" }, { dayOfWeek: "asc" }],
    });
    res.json({ success: true, count: rules.length, data: rules });
  } catch (error) {
    console.error("Error fetching process coverage rules:", error);
    res.status(500).json({ success: false, message: "Internal server error fetching coverage rules" });
  }
});

router.post("/:id/coverage-rules", async (req: Request, res: Response): Promise<void> => {
  try {
    const processId = idSchema.safeParse(req.params.id);
    if (!processId.success) {
      res.status(400).json({ success: false, message: "Invalid Process ID" });
      return;
    }
    const parsed = coverageRuleSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const exists = await prisma.process.findUnique({ where: { id: processId.data }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ success: false, message: "Process not found" });
      return;
    }
    const duplicate = await prisma.processCoverageRule.findFirst({
      where: parsed.data.dateOverride
        ? { processId: processId.data, dateOverride: parsed.data.dateOverride }
        : { processId: processId.data, dayOfWeek: parsed.data.dayOfWeek },
    });
    if (duplicate) {
      res.status(409).json({ success: false, message: "A staffing rule already exists for this date or weekday" });
      return;
    }
    const created = await prisma.processCoverageRule.create({
      data: { ...parsed.data, processId: processId.data },
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("Error creating process coverage rule:", error);
    res.status(500).json({ success: false, message: "Internal server error creating coverage rule" });
  }
});

router.patch("/coverage-rules/:ruleId", async (req: Request, res: Response): Promise<void> => {
  await updateCoverageRule(req, res);
});
router.put("/coverage-rules/:ruleId", async (req: Request, res: Response): Promise<void> => {
  await updateCoverageRule(req, res);
});

async function updateCoverageRule(req: Request, res: Response): Promise<void> {
  try {
    const ruleId = idSchema.safeParse(req.params.ruleId);
    if (!ruleId.success) {
      res.status(400).json({ success: false, message: "Invalid coverage rule ID" });
      return;
    }
    const parsed = coverageRuleUpdateSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ success: false, message: "At least one field is required" });
      return;
    }
    const existing = await prisma.processCoverageRule.findUnique({ where: { id: ruleId.data } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Coverage rule not found" });
      return;
    }
    const merged = coverageRuleSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) return sendValidationError(res, merged.error);
    const duplicate = await prisma.processCoverageRule.findFirst({
      where: {
        id: { not: ruleId.data },
        processId: existing.processId,
        ...(merged.data.dateOverride
          ? { dateOverride: merged.data.dateOverride }
          : { dayOfWeek: merged.data.dayOfWeek }),
      },
    });
    if (duplicate) {
      res.status(409).json({ success: false, message: "A staffing rule already exists for this date or weekday" });
      return;
    }
    const updated = await prisma.processCoverageRule.update({
      where: { id: ruleId.data },
      data: parsed.data,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating process coverage rule:", error);
    res.status(500).json({ success: false, message: "Internal server error updating coverage rule" });
  }
}

router.delete("/coverage-rules/:ruleId", async (req: Request, res: Response): Promise<void> => {
  try {
    const ruleId = idSchema.safeParse(req.params.ruleId);
    if (!ruleId.success) {
      res.status(400).json({ success: false, message: "Invalid coverage rule ID" });
      return;
    }
    const exists = await prisma.processCoverageRule.findUnique({ where: { id: ruleId.data }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ success: false, message: "Coverage rule not found" });
      return;
    }
    await prisma.processCoverageRule.delete({ where: { id: ruleId.data } });
    res.json({ success: true, message: "Coverage rule deleted" });
  } catch (error) {
    console.error("Error deleting process coverage rule:", error);
    res.status(500).json({ success: false, message: "Internal server error deleting coverage rule" });
  }
});

// GET /api/v1/processes - List all processes with brand and stats
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, brandId, calendarType } = req.query;

    const whereClause: any = {};

    if (brandId && typeof brandId === "string" && brandId !== "ALL") {
      whereClause.brandId = brandId;
    }

    if (calendarType && typeof calendarType === "string" && calendarType !== "ALL") {
      whereClause.calendarType = calendarType;
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const q = search.trim();
      whereClause.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    const processes = await prisma.process.findMany({
      where: whereClause,
      include: {
        brand: {
          select: {
            id: true,
            code: true,
            name: true,
            isSingleResource: true,
            pod: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            assignments: true,
            coverageRules: true,
            rosterShifts: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    res.json({
      success: true,
      count: processes.length,
      data: processes,
    });
  } catch (error) {
    console.error("Error fetching processes:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error fetching processes",
    });
  }
});

// GET /api/v1/processes/:id - Retrieve single process with full details
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Process ID is required" });
      return;
    }

    const processItem = await prisma.process.findUnique({
      where: { id },
      include: {
        brand: {
          include: {
            pod: true,
          },
        },
        coverageRules: true,
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                employeeCode: true,
                email: true,
                role: true,
                isPodLead: true,
              },
            },
          },
          orderBy: { priorityRank: "asc" },
        },
        _count: {
          select: {
            assignments: true,
            coverageRules: true,
            rosterShifts: true,
          },
        },
      },
    });

    if (!processItem) {
      res.status(404).json({
        success: false,
        message: `Process with ID '${id}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: processItem,
    });
  } catch (error) {
    console.error("Error retrieving process:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error retrieving process",
    });
  }
});

// POST /api/v1/processes - Create process under a brand
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = processInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { code, name, brandId, calendarType, defaultMinStaff, description } = parsed.data;

    // Check duplicate code
    const existingCode = await prisma.process.findUnique({ where: { code } });
    if (existingCode) {
      res.status(409).json({
        success: false,
        message: `Process code '${code}' is already in use`,
      });
      return;
    }

    // Check brand exists
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      res.status(400).json({
        success: false,
        message: `Brand with ID '${brandId}' does not exist`,
      });
      return;
    }

    const createdProcess = await prisma.process.create({
      data: {
        code,
        name,
        brandId,
        calendarType,
        defaultMinStaff,
        description: description || null,
      },
      include: {
        brand: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: `Process '${createdProcess.name}' (${createdProcess.code}) created successfully`,
      data: createdProcess,
    });
  } catch (error) {
    console.error("Error creating process:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error creating process",
    });
  }
});

// PUT/PATCH /api/v1/processes/:id - Update process
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdateProcess(req, res);
});

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdateProcess(req, res);
});

async function handleUpdateProcess(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Process ID is required" });
      return;
    }

    const existingProcess = await prisma.process.findUnique({ where: { id } });
    if (!existingProcess) {
      res.status(404).json({
        success: false,
        message: `Process with ID '${id}' not found`,
      });
      return;
    }

    const parsed = processUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { code, name, brandId, calendarType, defaultMinStaff, description } = parsed.data;

    // Check code uniqueness
    if (code && code !== existingProcess.code) {
      const codeTaken = await prisma.process.findUnique({ where: { code } });
      if (codeTaken) {
        res.status(409).json({
          success: false,
          message: `Process code '${code}' is already in use`,
        });
        return;
      }
    }

    // Check brand existence if changing
    if (brandId && brandId !== existingProcess.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        res.status(400).json({
          success: false,
          message: `Brand with ID '${brandId}' does not exist`,
        });
        return;
      }
    }

    const updated = await prisma.process.update({
      where: { id },
      data: {
        code,
        name,
        brandId: brandId !== undefined ? brandId : undefined,
        calendarType: calendarType !== undefined ? calendarType : undefined,
        defaultMinStaff: defaultMinStaff !== undefined ? defaultMinStaff : undefined,
        description: description !== undefined ? description : undefined,
      },
      include: {
        brand: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    res.json({
      success: true,
      message: `Process '${updated.name}' updated successfully`,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating process:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error updating process",
    });
  }
}

// DELETE /api/v1/processes/:id - Safe deletion of process
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Process ID is required" });
      return;
    }

    const processItem = await prisma.process.findUnique({
      where: { id },
      include: {
        assignments: true,
        rosterShifts: true,
        coverageRules: true,
      },
    });

    if (!processItem) {
      res.status(404).json({
        success: false,
        message: `Process with ID '${id}' not found`,
      });
      return;
    }

    // Check active assignments
    if (processItem.assignments.length > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete process '${processItem.name}' because it has ${processItem.assignments.length} assigned employee(s). Unassign employees first.`,
      });
      return;
    }

    // Check roster shifts
    if (processItem.rosterShifts.length > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete process '${processItem.name}' because it is referenced in ${processItem.rosterShifts.length} roster shift(s).`,
      });
      return;
    }

    // Delete coverage rules and process in transaction
    await prisma.$transaction(async (tx) => {
      await tx.processCoverageRule.deleteMany({ where: { processId: id } });
      await tx.process.delete({ where: { id } });
    }, { maxWait: 10000, timeout: 20000 });

    res.json({
      success: true,
      message: `Process '${processItem.name}' (${processItem.code}) was safely deleted.`,
    });
  } catch (error) {
    console.error("Error deleting process:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error deleting process",
    });
  }
});

export default router;
