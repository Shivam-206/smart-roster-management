import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

const assignmentInputSchema = z.object({
  employeeId: z
    .string({ error: "Employee ID is required" })
    .uuid("Invalid Employee ID"),
  processId: z
    .string({ error: "Process ID is required" })
    .uuid("Invalid Process ID"),
  assignmentType: z
    .enum(["PRIMARY", "SECONDARY_BACKUP", "FLOAT"], {
      error: "Assignment tier is required",
    })
    .default("PRIMARY"),
  priorityRank: z.number().int().min(1).max(10).default(1),
});

const assignmentUpdateSchema = z.object({
  assignmentType: z.enum(["PRIMARY", "SECONDARY_BACKUP", "FLOAT"]).optional(),
  priorityRank: z.number().int().min(1).max(10).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one assignment field is required");

const assignmentFiltersSchema = z.object({
  employeeId: z.union([z.literal("ALL"), z.string().uuid()]).optional(),
  processId: z.union([z.literal("ALL"), z.string().uuid()]).optional(),
  brandId: z.union([z.literal("ALL"), z.string().uuid()]).optional(),
  podId: z.union([z.literal("ALL"), z.string().uuid()]).optional(),
  assignmentType: z.union([
    z.literal("ALL"),
    z.enum(["PRIMARY", "SECONDARY_BACKUP", "FLOAT"]),
  ]).optional(),
  search: z.string().optional(),
});

const assignmentIdSchema = z.string().uuid("Invalid Assignment ID");

// GET /api/v1/assignments - List assignments with employee, process, brand & pod details
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsedFilters = assignmentFiltersSchema.safeParse(req.query);
    if (!parsedFilters.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsedFilters.error.flatten().fieldErrors,
      });
      return;
    }

    const { employeeId, processId, brandId, podId, assignmentType, search } = parsedFilters.data;

    const whereClause: any = {};

    if (employeeId && typeof employeeId === "string" && employeeId !== "ALL") {
      whereClause.employeeId = employeeId;
    }

    if (processId && typeof processId === "string" && processId !== "ALL") {
      whereClause.processId = processId;
    }

    if (assignmentType && typeof assignmentType === "string" && assignmentType !== "ALL") {
      whereClause.assignmentType = assignmentType;
    }

    if (brandId && typeof brandId === "string" && brandId !== "ALL") {
      whereClause.process = {
        ...(whereClause.process || {}),
        brandId: brandId,
      };
    }

    if (podId && typeof podId === "string" && podId !== "ALL") {
      whereClause.employee = {
        ...(whereClause.employee || {}),
        podId: podId,
      };
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const q = search.trim();
      whereClause.OR = [
        { employee: { name: { contains: q, mode: "insensitive" } } },
        { employee: { employeeCode: { contains: q, mode: "insensitive" } } },
        { process: { name: { contains: q, mode: "insensitive" } } },
        { process: { code: { contains: q, mode: "insensitive" } } },
        { process: { brand: { name: { contains: q, mode: "insensitive" } } } },
        { process: { brand: { code: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const assignments = await prisma.employeeProcessAssignment.findMany({
      where: whereClause,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            role: true,
            isPodLead: true,
            podId: true,
            pod: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        process: {
          select: {
            id: true,
            code: true,
            name: true,
            calendarType: true,
            defaultMinStaff: true,
            brandId: true,
            brand: {
              select: {
                id: true,
                code: true,
                name: true,
                isSingleResource: true,
                podId: true,
                pod: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { process: { code: "asc" } },
        { priorityRank: "asc" },
        { assignmentType: "asc" },
      ],
    });

    res.json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error fetching assignments",
    });
  }
});

// GET /api/v1/assignments/:id - Single assignment details
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsedId = assignmentIdSchema.safeParse(id);
    if (!parsedId.success) {
      res.status(400).json({ success: false, message: "Invalid Assignment ID" });
      return;
    }

    const assignment = await prisma.employeeProcessAssignment.findUnique({
      where: { id: parsedId.data },
      include: {
        employee: {
          include: {
            pod: true,
            weeklyOffs: true,
          },
        },
        process: {
          include: {
            brand: {
              include: { pod: true },
            },
            coverageRules: true,
          },
        },
      },
    });

    if (!assignment) {
      res.status(404).json({
        success: false,
        message: `Assignment with ID '${id}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    console.error("Error retrieving assignment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error retrieving assignment",
    });
  }
});

// POST /api/v1/assignments - Assign employee to a process
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = assignmentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { employeeId, processId, assignmentType, priorityRank } = parsed.data;

    // Validate employee exists and is active
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      res.status(400).json({
        success: false,
        message: `Employee with ID '${employeeId}' does not exist`,
      });
      return;
    }
    if (!employee.isActive) {
      res.status(400).json({
        success: false,
        message: `Cannot assign inactive employee '${employee.name}' (${employee.employeeCode})`,
      });
      return;
    }

    // Validate process exists
    const processItem = await prisma.process.findUnique({
      where: { id: processId },
      include: { brand: true },
    });
    if (!processItem) {
      res.status(400).json({
        success: false,
        message: `Process with ID '${processId}' does not exist`,
      });
      return;
    }

    // Check duplicate assignment
    const existing = await prisma.employeeProcessAssignment.findUnique({
      where: {
        employeeId_processId: {
          employeeId,
          processId,
        },
      },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        message: `Employee '${employee.name}' is already assigned to process '${processItem.name}' as ${existing.assignmentType}`,
      });
      return;
    }

    const createdAssignment = await prisma.employeeProcessAssignment.create({
      data: {
        employeeId,
        processId,
        assignmentType,
        priorityRank,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            role: true,
            isPodLead: true,
            pod: { select: { id: true, code: true, name: true } },
          },
        },
        process: {
          select: {
            id: true,
            code: true,
            name: true,
            calendarType: true,
            defaultMinStaff: true,
            brand: { select: { id: true, code: true, name: true, isSingleResource: true } },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: `Assigned '${employee.name}' to '${processItem.name}' (${assignmentType})`,
      data: createdAssignment,
    });
  } catch (error) {
    console.error("Error creating assignment:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message: "This employee is already assigned to this process",
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: "Internal server error creating assignment",
    });
  }
});

// PUT/PATCH /api/v1/assignments/:id - Update assignment tier or rank
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdateAssignment(req, res);
});

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdateAssignment(req, res);
});

async function handleUpdateAssignment(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsedId = assignmentIdSchema.safeParse(id);
    if (!parsedId.success) {
      res.status(400).json({ success: false, message: "Invalid Assignment ID" });
      return;
    }

    const existing = await prisma.employeeProcessAssignment.findUnique({
      where: { id: parsedId.data },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: `Assignment with ID '${id}' not found`,
      });
      return;
    }

    const parsed = assignmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { assignmentType, priorityRank } = parsed.data;

    const updated = await prisma.employeeProcessAssignment.update({
      where: { id },
      data: {
        assignmentType: assignmentType !== undefined ? assignmentType : undefined,
        priorityRank: priorityRank !== undefined ? priorityRank : undefined,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            role: true,
            isPodLead: true,
            pod: { select: { id: true, code: true, name: true } },
          },
        },
        process: {
          select: {
            id: true,
            code: true,
            name: true,
            calendarType: true,
            defaultMinStaff: true,
            brand: { select: { id: true, code: true, name: true, isSingleResource: true } },
          },
        },
      },
    });

    res.json({
      success: true,
      message: `Assignment updated to ${updated.assignmentType} (Rank ${updated.priorityRank})`,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating assignment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error updating assignment",
    });
  }
}

// DELETE /api/v1/assignments/:id - Remove an assignment safely
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsedId = assignmentIdSchema.safeParse(id);
    if (!parsedId.success) {
      res.status(400).json({ success: false, message: "Invalid Assignment ID" });
      return;
    }

    const assignment = await prisma.employeeProcessAssignment.findUnique({
      where: { id: parsedId.data },
      include: {
        employee: true,
        process: true,
      },
    });

    if (!assignment) {
      res.status(404).json({
        success: false,
        message: `Assignment with ID '${id}' not found`,
      });
      return;
    }

    // Dependency check: Are there active roster shifts referencing this employee and process?
    const rosterShiftsCount = await prisma.rosterShift.count({
      where: {
        employeeId: assignment.employeeId,
        processId: assignment.processId,
      },
    });

    if (rosterShiftsCount > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot remove assignment: employee '${assignment.employee.name}' is scheduled in ${rosterShiftsCount} roster shift(s) on process '${assignment.process.name}'. Clear roster shifts first.`,
      });
      return;
    }

    await prisma.employeeProcessAssignment.delete({ where: { id: parsedId.data } });

    res.json({
      success: true,
      message: `Assignment for '${assignment.employee.name}' on '${assignment.process.code}' was safely removed.`,
    });
  } catch (error) {
    console.error("Error removing assignment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error removing assignment",
    });
  }
});

export default router;
