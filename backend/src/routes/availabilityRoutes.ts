import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid YYYY-MM-DD date");
const idSchema = z.string().uuid();

const weeklyOffBaseSchema = z.object({
  employeeId: idSchema,
  dayOfWeek: z.number().int().min(0).max(6),
  isStandard: z.boolean().default(true),
  specificDate: dateSchema.nullable().optional(),
});
const weeklyOffSchema = weeklyOffBaseSchema.superRefine((value, context) => {
  if (value.isStandard && value.specificDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["specificDate"], message: "Standard weekly offs cannot have a specific date" });
  }
  if (!value.isStandard && !value.specificDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["specificDate"], message: "A specific date is required for a one-time weekly off" });
  }
});
const weeklyOffUpdateSchema = weeklyOffBaseSchema.omit({ employeeId: true }).partial();

const leaveBaseSchema = z.object({
  employeeId: idSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  leaveType: z.enum(["ANNUAL", "SICK", "CASUAL", "COMP_OFF"]).default("ANNUAL"),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("APPROVED"),
  reason: z.string().trim().max(500).nullable().optional(),
});
const leaveSchema = leaveBaseSchema.superRefine((value, context) => {
  if (value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must be on or after start date" });
  }
  if (value.leaveType === "COMP_OFF" && value.startDate !== value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Comp-off must be a single day" });
  }
});
const leaveUpdateSchema = leaveBaseSchema.omit({ employeeId: true }).partial();

function validationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: error.flatten().fieldErrors,
  });
}

async function employeeExists(employeeId: string): Promise<boolean> {
  return Boolean(await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }));
}

router.get("/weekly-offs", async (req: Request, res: Response): Promise<void> => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const dateResult = req.query.date === undefined ? undefined : dateSchema.safeParse(req.query.date);
    if (employeeId && !idSchema.safeParse(employeeId).success) {
      res.status(400).json({ success: false, message: "Invalid Employee ID" });
      return;
    }
    if (dateResult && !dateResult.success) {
      validationError(res, dateResult.error);
      return;
    }
    const date = dateResult?.success ? dateResult.data : undefined;
    const weeklyOffs = await prisma.employeeWeeklyOff.findMany({
      where: {
        employeeId,
        ...(date ? {
          OR: [
            { isStandard: true, dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay() },
            { isStandard: false, specificDate: date },
          ],
        } : {}),
      },
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
      orderBy: [{ employee: { employeeCode: "asc" } }, { dayOfWeek: "asc" }],
    });
    res.json({ success: true, count: weeklyOffs.length, data: weeklyOffs });
  } catch (error) {
    console.error("Error fetching weekly offs:", error);
    res.status(500).json({ success: false, message: "Internal server error fetching weekly offs" });
  }
});

router.post("/weekly-offs", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = weeklyOffSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = parsed.data;
    if (!(await employeeExists(data.employeeId))) {
      res.status(400).json({ success: false, message: `Employee with ID '${data.employeeId}' does not exist` });
      return;
    }
    const duplicate = await prisma.employeeWeeklyOff.findFirst({
      where: data.isStandard
        ? { employeeId: data.employeeId, dayOfWeek: data.dayOfWeek, isStandard: true }
        : { employeeId: data.employeeId, specificDate: data.specificDate },
    });
    if (duplicate) {
      res.status(409).json({ success: false, message: "A conflicting weekly off already exists for this employee and date/day" });
      return;
    }
    const created = await prisma.employeeWeeklyOff.create({
      data,
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("Error creating weekly off:", error);
    res.status(500).json({ success: false, message: "Internal server error creating weekly off" });
  }
});

router.patch("/weekly-offs/:id", async (req: Request, res: Response): Promise<void> => {
  await updateWeeklyOff(req, res);
});
router.put("/weekly-offs/:id", async (req: Request, res: Response): Promise<void> => {
  await updateWeeklyOff(req, res);
});

async function updateWeeklyOff(req: Request, res: Response): Promise<void> {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, message: "Invalid weekly-off ID" });
      return;
    }
    const parsed = weeklyOffUpdateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ success: false, message: "At least one field is required" });
      return;
    }
    const existing = await prisma.employeeWeeklyOff.findUnique({ where: { id: id.data } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Weekly off not found" });
      return;
    }
    const data = { ...existing, ...parsed.data };
    const normalized = weeklyOffSchema.safeParse({
      employeeId: existing.employeeId,
      dayOfWeek: data.dayOfWeek,
      isStandard: data.isStandard,
      specificDate: data.specificDate,
    });
    if (!normalized.success) return validationError(res, normalized.error);
    const duplicate = await prisma.employeeWeeklyOff.findFirst({
      where: {
        id: { not: id.data },
        ...(normalized.data.isStandard
          ? { employeeId: existing.employeeId, dayOfWeek: normalized.data.dayOfWeek, isStandard: true }
          : { employeeId: existing.employeeId, specificDate: normalized.data.specificDate }),
      },
    });
    if (duplicate) {
      res.status(409).json({ success: false, message: "A conflicting weekly off already exists for this employee and date/day" });
      return;
    }
    const updated = await prisma.employeeWeeklyOff.update({
      where: { id: id.data },
      data: normalized.data,
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating weekly off:", error);
    res.status(500).json({ success: false, message: "Internal server error updating weekly off" });
  }
}

router.delete("/weekly-offs/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, message: "Invalid weekly-off ID" });
      return;
    }
    const existing = await prisma.employeeWeeklyOff.findUnique({ where: { id: id.data } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Weekly off not found" });
      return;
    }
    await prisma.employeeWeeklyOff.delete({ where: { id: id.data } });
    res.json({ success: true, message: "Weekly off deleted" });
  } catch (error) {
    console.error("Error deleting weekly off:", error);
    res.status(500).json({ success: false, message: "Internal server error deleting weekly off" });
  }
});

router.get("/leaves", async (req: Request, res: Response): Promise<void> => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const startDate = req.query.startDate === undefined ? undefined : dateSchema.safeParse(req.query.startDate);
    const endDate = req.query.endDate === undefined ? undefined : dateSchema.safeParse(req.query.endDate);
    if (employeeId && !idSchema.safeParse(employeeId).success) {
      res.status(400).json({ success: false, message: "Invalid Employee ID" });
      return;
    }
    if (startDate && !startDate.success) return validationError(res, startDate.error);
    if (endDate && !endDate.success) return validationError(res, endDate.error);
    const start = startDate?.success ? startDate.data : undefined;
    const end = endDate?.success ? endDate.data : undefined;
    if (start && end && start > end) {
      res.status(400).json({ success: false, message: "startDate must be on or before endDate" });
      return;
    }
    const leaves = await prisma.employeeLeave.findMany({
      where: {
        employeeId,
        ...(start || end ? {
          ...(start ? { endDate: { gte: start } } : {}),
          ...(end ? { startDate: { lte: end } } : {}),
        } : {}),
      },
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
      orderBy: [{ startDate: "desc" }, { employee: { employeeCode: "asc" } }],
    });
    res.json({ success: true, count: leaves.length, data: leaves });
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ success: false, message: "Internal server error fetching leaves" });
  }
});

router.post("/leaves", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = leaveSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = parsed.data;
    if (!(await employeeExists(data.employeeId))) {
      res.status(400).json({ success: false, message: `Employee with ID '${data.employeeId}' does not exist` });
      return;
    }
    if (data.status !== "REJECTED") {
      const conflict = await prisma.employeeLeave.findFirst({
        where: {
          employeeId: data.employeeId,
          status: { not: "REJECTED" },
          startDate: { lte: data.endDate },
          endDate: { gte: data.startDate },
        },
      });
      if (conflict) {
        res.status(409).json({ success: false, message: "This leave overlaps an existing pending or approved leave" });
        return;
      }
    }
    const created = await prisma.employeeLeave.create({
      data,
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("Error creating leave:", error);
    res.status(500).json({ success: false, message: "Internal server error creating leave" });
  }
});

router.patch("/leaves/:id", async (req: Request, res: Response): Promise<void> => {
  await updateLeave(req, res);
});
router.put("/leaves/:id", async (req: Request, res: Response): Promise<void> => {
  await updateLeave(req, res);
});

async function updateLeave(req: Request, res: Response): Promise<void> {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, message: "Invalid leave ID" });
      return;
    }
    const parsed = leaveUpdateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ success: false, message: "At least one field is required" });
      return;
    }
    const existing = await prisma.employeeLeave.findUnique({ where: { id: id.data } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Leave not found" });
      return;
    }
    const merged = leaveSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) return validationError(res, merged.error);
    if (merged.data.status !== "REJECTED") {
      const conflict = await prisma.employeeLeave.findFirst({
        where: {
          id: { not: id.data },
          employeeId: existing.employeeId,
          status: { not: "REJECTED" },
          startDate: { lte: merged.data.endDate },
          endDate: { gte: merged.data.startDate },
        },
      });
      if (conflict) {
        res.status(409).json({ success: false, message: "This leave overlaps an existing pending or approved leave" });
        return;
      }
    }
    const updated = await prisma.employeeLeave.update({
      where: { id: id.data },
      data: parsed.data,
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating leave:", error);
    res.status(500).json({ success: false, message: "Internal server error updating leave" });
  }
}

router.delete("/leaves/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, message: "Invalid leave ID" });
      return;
    }
    const existing = await prisma.employeeLeave.findUnique({ where: { id: id.data } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Leave not found" });
      return;
    }
    await prisma.employeeLeave.delete({ where: { id: id.data } });
    res.json({ success: true, message: "Leave deleted" });
  } catch (error) {
    console.error("Error deleting leave:", error);
    res.status(500).json({ success: false, message: "Internal server error deleting leave" });
  }
});

export default router;
