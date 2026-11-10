import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a valid YYYY-MM-DD date");
const holidaySchema = z.object({
  date: dateSchema,
  name: z.string().trim().min(2).max(120),
  isMandatoryOff: z.boolean().default(true),
  description: z.string().trim().max(500).nullable().optional(),
});
const holidayUpdateSchema = holidaySchema.partial();
const idSchema = z.string().uuid();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const year = typeof req.query.year === "string" ? req.query.year : undefined;
    const from = req.query.from === undefined ? undefined : dateSchema.safeParse(req.query.from);
    const to = req.query.to === undefined ? undefined : dateSchema.safeParse(req.query.to);
    if (year && !/^\d{4}$/.test(year)) {
      res.status(400).json({ success: false, message: "Year must be YYYY" });
      return;
    }
    if (from && !from.success) {
      res.status(400).json({ success: false, message: "Invalid from date" });
      return;
    }
    if (to && !to.success) {
      res.status(400).json({ success: false, message: "Invalid to date" });
      return;
    }
    const fromDate = from?.success ? from.data : undefined;
    const toDate = to?.success ? to.data : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      res.status(400).json({ success: false, message: "from must be on or before to" });
      return;
    }
    const lowerBounds = [year ? `${year}-01-01` : undefined, fromDate].filter(
      (value): value is string => value !== undefined
    );
    const upperBounds = [year ? `${year}-12-31` : undefined, toDate].filter(
      (value): value is string => value !== undefined
    );
    const dateFilter = {
      ...(lowerBounds.length ? { gte: lowerBounds.sort().at(-1) } : {}),
      ...(upperBounds.length ? { lte: upperBounds.sort()[0] } : {}),
    };
    const holidays = await prisma.publicHoliday.findMany({
      where: {
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { date: "asc" },
    });
    res.json({ success: true, count: holidays.length, data: holidays });
  } catch (error) {
    console.error("Error fetching public holidays:", error);
    res.status(500).json({ success: false, message: "Internal server error fetching public holidays" });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = holidaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const duplicate = await prisma.publicHoliday.findUnique({ where: { date: parsed.data.date } });
    if (duplicate) {
      res.status(409).json({ success: false, message: `A public holiday already exists on ${parsed.data.date}` });
      return;
    }
    const holiday = await prisma.publicHoliday.create({ data: parsed.data });
    res.status(201).json({ success: true, data: holiday });
  } catch (error) {
    console.error("Error creating public holiday:", error);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ success: false, message: "A public holiday already exists on this date" });
      return;
    }
    res.status(500).json({ success: false, message: "Internal server error creating public holiday" });
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  await updateHoliday(req, res);
});
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  await updateHoliday(req, res);
});

async function updateHoliday(req: Request, res: Response): Promise<void> {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, message: "Invalid holiday ID" });
      return;
    }
    const parsed = holidayUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      return;
    }
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ success: false, message: "At least one field is required" });
      return;
    }
    const existing = await prisma.publicHoliday.findUnique({ where: { id: id.data } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Public holiday not found" });
      return;
    }
    const updated = await prisma.publicHoliday.update({ where: { id: id.data }, data: parsed.data });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating public holiday:", error);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ success: false, message: "A public holiday already exists on this date" });
      return;
    }
    res.status(500).json({ success: false, message: "Internal server error updating public holiday" });
  }
}

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, message: "Invalid holiday ID" });
      return;
    }
    const holiday = await prisma.publicHoliday.findUnique({ where: { id: id.data } });
    if (!holiday) {
      res.status(404).json({ success: false, message: "Public holiday not found" });
      return;
    }
    await prisma.publicHoliday.delete({ where: { id: id.data } });
    res.json({ success: true, message: "Public holiday deleted" });
  } catch (error) {
    console.error("Error deleting public holiday:", error);
    res.status(500).json({ success: false, message: "Internal server error deleting public holiday" });
  }
});

export default router;
