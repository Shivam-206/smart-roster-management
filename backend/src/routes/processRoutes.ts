import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

const processInputSchema = z.object({
  code: z
    .string({ required_error: "Process code is required" })
    .trim()
    .min(2, "Process code must be at least 2 characters")
    .max(30, "Process code cannot exceed 30 characters")
    .transform((val) => val.toUpperCase()),
  name: z
    .string({ required_error: "Process name is required" })
    .trim()
    .min(2, "Process name must be at least 2 characters")
    .max(120, "Process name cannot exceed 120 characters"),
  brandId: z.string({ required_error: "Brand ID is required" }).uuid("Invalid Brand ID"),
  calendarType: z.enum(
    [
      "ALL_365_DAYS",
      "ALL_EXCEPT_PUBLIC_HOLIDAYS",
      "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS",
      "CUSTOM",
    ],
    { required_error: "Calendar type is required" }
  ),
  defaultMinStaff: z.number().int().min(1, "Minimum staffing must be at least 1").default(1),
  description: z.string().trim().max(500).optional().nullable(),
});

const processUpdateSchema = processInputSchema.partial();

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
