import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

const podInputSchema = z.object({
  code: z
    .string({ required_error: "Pod code is required" })
    .trim()
    .min(2, "Pod code must be at least 2 characters")
    .max(20, "Pod code cannot exceed 20 characters")
    .transform((val) => val.toUpperCase()),
  name: z
    .string({ required_error: "Pod name is required" })
    .trim()
    .min(2, "Pod name must be at least 2 characters")
    .max(100, "Pod name cannot exceed 100 characters"),
  description: z.string().trim().max(500).optional().nullable(),
  leadEmployeeId: z.string().uuid("Invalid Employee ID for Pod Lead").optional().nullable(),
});

const podUpdateSchema = podInputSchema.partial();

// GET /api/v1/pods - List all pods with lead and stats
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { search } = req.query;

    const whereClause: any = {};
    if (search && typeof search === "string" && search.trim() !== "") {
      const q = search.trim();
      whereClause.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    const pods = await prisma.pod.findMany({
      where: whereClause,
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            role: true,
          },
        },
        _count: {
          select: {
            members: true,
            brands: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    res.json({
      success: true,
      count: pods.length,
      data: pods,
    });
  } catch (error) {
    console.error("Error fetching pods:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error fetching pods",
    });
  }
});

// GET /api/v1/pods/:id - Retrieve single pod with full member roster and brands
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Pod ID is required" });
      return;
    }

    const pod = await prisma.pod.findUnique({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            role: true,
          },
        },
        members: {
          select: {
            id: true,
            employeeCode: true,
            name: true,
            email: true,
            role: true,
            isPodLead: true,
            contractType: true,
            weeklyWorkDays: true,
          },
          orderBy: { employeeCode: "asc" },
        },
        brands: {
          select: {
            id: true,
            code: true,
            name: true,
            isSingleResource: true,
            _count: {
              select: { processes: true },
            },
          },
          orderBy: { code: "asc" },
        },
        _count: {
          select: {
            members: true,
            brands: true,
          },
        },
      },
    });

    if (!pod) {
      res.status(404).json({
        success: false,
        message: `Pod with ID '${id}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: pod,
    });
  } catch (error) {
    console.error("Error retrieving pod:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error retrieving pod",
    });
  }
});

// POST /api/v1/pods - Create a new pod
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = podInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { code, name, description, leadEmployeeId } = parsed.data;

    // Check duplicate code
    const existingCode = await prisma.pod.findUnique({
      where: { code },
    });
    if (existingCode) {
      res.status(409).json({
        success: false,
        message: `Pod code '${code}' is already in use`,
      });
      return;
    }

    // Check duplicate name
    const existingName = await prisma.pod.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existingName) {
      res.status(409).json({
        success: false,
        message: `Pod name '${name}' is already in use`,
      });
      return;
    }

    // If lead is specified, validate lead employee
    if (leadEmployeeId) {
      const candidate = await prisma.employee.findUnique({
        where: { id: leadEmployeeId },
        include: { leadingPod: true },
      });

      if (!candidate) {
        res.status(400).json({
          success: false,
          message: `Lead employee with ID '${leadEmployeeId}' does not exist`,
        });
        return;
      }

      if (candidate.leadingPod) {
        res.status(409).json({
          success: false,
          message: `Employee '${candidate.name}' is already the designated Pod Lead for '${candidate.leadingPod.name}' (${candidate.leadingPod.code})`,
        });
        return;
      }
    }

    // Create pod in transaction
    const createdPod = await prisma.$transaction(async (tx) => {
      const pod = await tx.pod.create({
        data: {
          code,
          name,
          description: description || null,
          leadEmployeeId: leadEmployeeId || null,
        },
      });

      if (leadEmployeeId) {
        // Ensure new lead is a member of this pod and marked isPodLead
        await tx.employee.update({
          where: { id: leadEmployeeId },
          data: {
            podId: pod.id,
            isPodLead: true,
          },
        });
      }

      return tx.pod.findUniqueOrThrow({
        where: { id: pod.id },
        include: {
          lead: true,
          _count: { select: { members: true, brands: true } },
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json({
      success: true,
      message: `Pod '${createdPod.name}' (${createdPod.code}) created successfully`,
      data: createdPod,
    });
  } catch (error) {
    console.error("Error creating pod:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error creating pod",
    });
  }
});

// PUT/PATCH /api/v1/pods/:id - Update pod details and lead
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdatePod(req, res);
});

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdatePod(req, res);
});

async function handleUpdatePod(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Pod ID is required" });
      return;
    }

    const existingPod = await prisma.pod.findUnique({
      where: { id },
      include: { lead: true },
    });

    if (!existingPod) {
      res.status(404).json({
        success: false,
        message: `Pod with ID '${id}' not found`,
      });
      return;
    }

    const parsed = podUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { code, name, description, leadEmployeeId } = parsed.data;

    // Check code uniqueness
    if (code && code !== existingPod.code) {
      const codeTaken = await prisma.pod.findUnique({ where: { code } });
      if (codeTaken) {
        res.status(409).json({
          success: false,
          message: `Pod code '${code}' is already in use`,
        });
        return;
      }
    }

    // Check name uniqueness
    if (name && name.toLowerCase() !== existingPod.name.toLowerCase()) {
      const nameTaken = await prisma.pod.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (nameTaken) {
        res.status(409).json({
          success: false,
          message: `Pod name '${name}' is already in use`,
        });
        return;
      }
    }

    // Validate new lead if changing
    const isChangingLead = leadEmployeeId !== undefined && leadEmployeeId !== existingPod.leadEmployeeId;

    if (isChangingLead && leadEmployeeId) {
      const newLead = await prisma.employee.findUnique({
        where: { id: leadEmployeeId },
        include: { leadingPod: true },
      });

      if (!newLead) {
        res.status(400).json({
          success: false,
          message: `Employee with ID '${leadEmployeeId}' does not exist`,
        });
        return;
      }

      // Check if new lead already leads a different pod
      if (newLead.leadingPod && newLead.leadingPod.id !== id) {
        res.status(409).json({
          success: false,
          message: `Employee '${newLead.name}' is already the designated Pod Lead for '${newLead.leadingPod.name}' (${newLead.leadingPod.code})`,
        });
        return;
      }
    }

    // Execute update in transaction
    const updatedPod = await prisma.$transaction(async (tx) => {
      // If changing lead, handle previous lead flag
      if (isChangingLead) {
        if (existingPod.leadEmployeeId) {
          await tx.employee.update({
            where: { id: existingPod.leadEmployeeId },
            data: { isPodLead: false },
          });
        }

        if (leadEmployeeId) {
          await tx.employee.update({
            where: { id: leadEmployeeId },
            data: {
              isPodLead: true,
              podId: id, // ensure lead belongs to this pod
            },
          });
        }
      }

      return tx.pod.update({
        where: { id },
        data: {
          code,
          name,
          description: description !== undefined ? description : undefined,
          leadEmployeeId: leadEmployeeId !== undefined ? leadEmployeeId : undefined,
        },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              email: true,
              role: true,
            },
          },
          _count: {
            select: {
              members: true,
              brands: true,
            },
          },
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.json({
      success: true,
      message: `Pod '${updatedPod.name}' updated successfully`,
      data: updatedPod,
    });
  } catch (error) {
    console.error("Error updating pod:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error updating pod",
    });
  }
}

// PUT /api/v1/pods/:id/members - Move / transfer employees into this pod
router.put("/:id/members", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { employeeIds } = req.body;

    if (!id) {
      res.status(400).json({ success: false, message: "Pod ID is required" });
      return;
    }

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "employeeIds must be a non-empty array of employee IDs",
      });
      return;
    }

    const pod = await prisma.pod.findUnique({ where: { id } });
    if (!pod) {
      res.status(404).json({ success: false, message: `Pod with ID '${id}' not found` });
      return;
    }

    // Reassign employees to this pod
    const result = await prisma.employee.updateMany({
      where: { id: { in: employeeIds } },
      data: { podId: id },
    });

    res.json({
      success: true,
      message: `Successfully transferred ${result.count} employee(s) to pod '${pod.name}'.`,
    });
  } catch (error) {
    console.error("Error transferring employees:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error transferring employees",
    });
  }
});

// DELETE /api/v1/pods/:id - Safe deletion of pod
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Pod ID is required" });
      return;
    }

    const pod = await prisma.pod.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            members: true,
            brands: true,
          },
        },
      },
    });

    if (!pod) {
      res.status(404).json({
        success: false,
        message: `Pod with ID '${id}' not found`,
      });
      return;
    }

    // Safety check 1: Reject if pod still contains employees
    if (pod._count.members > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete pod '${pod.name}' because it currently contains ${pod._count.members} assigned employee(s). Move or reassign members to another pod first.`,
      });
      return;
    }

    // Safety check 2: Reject if pod has assigned brands
    if (pod._count.brands > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete pod '${pod.name}' because it manages ${pod._count.brands} brand(s). Reassign brands first.`,
      });
      return;
    }

    // Safe deletion in transaction
    await prisma.$transaction(async (tx) => {
      // Clear lead if any
      if (pod.leadEmployeeId) {
        await tx.employee.update({
          where: { id: pod.leadEmployeeId },
          data: { isPodLead: false },
        });
      }

      await tx.pod.delete({ where: { id } });
    }, { maxWait: 10000, timeout: 20000 });

    res.json({
      success: true,
      message: `Pod '${pod.name}' (${pod.code}) was safely deleted.`,
    });
  } catch (error) {
    console.error("Error deleting pod:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error deleting pod",
    });
  }
});

export default router;
