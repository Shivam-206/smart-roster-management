import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

const brandInputSchema = z.object({
  code: z
    .string({ error: "Brand code is required" })
    .trim()
    .min(2, "Brand code must be at least 2 characters")
    .max(20, "Brand code cannot exceed 20 characters")
    .transform((val) => val.toUpperCase()),
  name: z
    .string({ error: "Brand name is required" })
    .trim()
    .min(2, "Brand name must be at least 2 characters")
    .max(100, "Brand name cannot exceed 100 characters"),
  description: z.string().trim().max(500).optional().nullable(),
  podId: z.string({ error: "Pod ID is required" }).uuid("Invalid Pod ID"),
  isSingleResource: z.boolean().default(true),
});

const brandUpdateSchema = brandInputSchema.partial();

// GET /api/v1/brands - List all brands with pod & process counts
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, podId, isSingleResource } = req.query;

    const whereClause: any = {};

    if (podId && typeof podId === "string" && podId !== "ALL") {
      whereClause.podId = podId;
    }

    if (isSingleResource !== undefined) {
      whereClause.isSingleResource = isSingleResource === "true";
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const q = search.trim();
      whereClause.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    const brands = await prisma.brand.findMany({
      where: whereClause,
      include: {
        pod: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        processes: {
          select: {
            id: true,
            code: true,
            name: true,
            calendarType: true,
            defaultMinStaff: true,
            _count: {
              select: { assignments: true },
            },
          },
        },
        _count: {
          select: {
            processes: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    res.json({
      success: true,
      count: brands.length,
      data: brands,
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error fetching brands",
    });
  }
});

// GET /api/v1/brands/:id - Retrieve single brand with full process details
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Brand ID is required" });
      return;
    }

    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        pod: true,
        processes: {
          include: {
            coverageRules: true,
            assignments: {
              include: {
                employee: {
                  select: {
                    id: true,
                    name: true,
                    employeeCode: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!brand) {
      res.status(404).json({
        success: false,
        message: `Brand with ID '${id}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: brand,
    });
  } catch (error) {
    console.error("Error retrieving brand:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error retrieving brand",
    });
  }
});

// POST /api/v1/brands - Create a brand
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = brandInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { code, name, description, podId, isSingleResource } = parsed.data;

    // Check duplicate code
    const existingCode = await prisma.brand.findUnique({ where: { code } });
    if (existingCode) {
      res.status(409).json({
        success: false,
        message: `Brand code '${code}' is already in use`,
      });
      return;
    }

    // Check duplicate name
    const existingName = await prisma.brand.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existingName) {
      res.status(409).json({
        success: false,
        message: `Brand name '${name}' is already in use`,
      });
      return;
    }

    // Check pod exists
    const podExists = await prisma.pod.findUnique({ where: { id: podId } });
    if (!podExists) {
      res.status(400).json({
        success: false,
        message: `Operational Pod with ID '${podId}' does not exist`,
      });
      return;
    }

    const createdBrand = await prisma.brand.create({
      data: {
        code,
        name,
        description: description || null,
        podId,
        isSingleResource,
      },
      include: {
        pod: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: `Brand '${createdBrand.name}' (${createdBrand.code}) created successfully`,
      data: createdBrand,
    });
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error creating brand",
    });
  }
});

// PUT/PATCH /api/v1/brands/:id - Update brand
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdateBrand(req, res);
});

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdateBrand(req, res);
});

async function handleUpdateBrand(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Brand ID is required" });
      return;
    }

    const existingBrand = await prisma.brand.findUnique({ where: { id } });
    if (!existingBrand) {
      res.status(404).json({
        success: false,
        message: `Brand with ID '${id}' not found`,
      });
      return;
    }

    const parsed = brandUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { code, name, description, podId, isSingleResource } = parsed.data;

    // Check code uniqueness
    if (code && code !== existingBrand.code) {
      const codeTaken = await prisma.brand.findUnique({ where: { code } });
      if (codeTaken) {
        res.status(409).json({
          success: false,
          message: `Brand code '${code}' is already in use`,
        });
        return;
      }
    }

    // Check name uniqueness
    if (name && name.toLowerCase() !== existingBrand.name.toLowerCase()) {
      const nameTaken = await prisma.brand.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (nameTaken) {
        res.status(409).json({
          success: false,
          message: `Brand name '${name}' is already in use`,
        });
        return;
      }
    }

    // Check pod existence if provided
    if (podId) {
      const podExists = await prisma.pod.findUnique({ where: { id: podId } });
      if (!podExists) {
        res.status(400).json({
          success: false,
          message: `Operational Pod with ID '${podId}' does not exist`,
        });
        return;
      }
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: {
        code,
        name,
        description: description !== undefined ? description : undefined,
        podId: podId !== undefined ? podId : undefined,
        isSingleResource: isSingleResource !== undefined ? isSingleResource : undefined,
      },
      include: {
        pod: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    res.json({
      success: true,
      message: `Brand '${updated.name}' updated successfully`,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error updating brand",
    });
  }
}

// DELETE /api/v1/brands/:id - Safe deletion of brand
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Brand ID is required" });
      return;
    }

    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        processes: {
          include: {
            assignments: true,
            rosterShifts: true,
          },
        },
      },
    });

    if (!brand) {
      res.status(404).json({
        success: false,
        message: `Brand with ID '${id}' not found`,
      });
      return;
    }

    // Check if any child process has active assignments or shifts
    const totalAssignments = brand.processes.reduce((sum, p) => sum + p.assignments.length, 0);
    const totalShifts = brand.processes.reduce((sum, p) => sum + p.rosterShifts.length, 0);

    if (totalAssignments > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete brand '${brand.name}' because its processes have ${totalAssignments} active employee assignment(s). Remove assignments first.`,
      });
      return;
    }

    if (totalShifts > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete brand '${brand.name}' because its processes are referenced in ${totalShifts} roster shift(s).`,
      });
      return;
    }

    if (brand.processes.length > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete brand '${brand.name}' because it contains ${brand.processes.length} operational process(es). Delete or reassign processes first.`,
      });
      return;
    }

    await prisma.brand.delete({ where: { id } });

    res.json({
      success: true,
      message: `Brand '${brand.name}' (${brand.code}) was safely deleted.`,
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error deleting brand",
    });
  }
});

export default router;
