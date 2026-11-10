import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

const employeeInputSchema = z.object({
  employeeCode: z
    .string({ error: "Employee code is required" })
    .trim()
    .min(2, "Employee code must be at least 2 characters")
    .max(20, "Employee code cannot exceed 20 characters")
    .transform((val) => val.toUpperCase()),
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  email: z
    .string({ error: "Email is required" })
    .trim()
    .email("Invalid email address")
    .toLowerCase(),
  role: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .default("OPERATIONS_ASSOCIATE"),
  isPodLead: z.boolean().default(false),
  podId: z.string().uuid("Invalid Pod ID").nullable().optional(),
  contractType: z
    .enum(["FULL_TIME", "CONTRACT"])
    .default("FULL_TIME"),
  weeklyWorkDays: z.number().int().min(1).max(7).default(5),
  maxConsecutiveDays: z.number().int().min(1).max(14).default(6),
  weeklyOffs: z.array(z.number().int().min(0).max(6)).optional(),
});

const employeeUpdateSchema = employeeInputSchema.partial();

// GET /api/v1/employees - List all employees with pod information & filters
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, podId, isPodLead, role } = req.query;

    const whereClause: any = {
      isActive: true,
    };

    if (podId && typeof podId === "string" && podId !== "ALL") {
      whereClause.podId = podId;
    }

    if (isPodLead !== undefined) {
      whereClause.isPodLead = isPodLead === "true";
    }

    if (role && typeof role === "string") {
      whereClause.role = role;
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const q = search.trim();
      whereClause.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { employeeCode: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where: whereClause,
      include: {
        pod: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        leadingPod: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        weeklyOffs: {
          select: {
            dayOfWeek: true,
            isStandard: true,
          },
        },
        _count: {
          select: {
            assignments: true,
            leaves: true,
            rosterShifts: true,
          },
        },
      },
      orderBy: { employeeCode: "asc" },
    });

    res.json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error fetching employees",
    });
  }
});

// GET /api/v1/employees/:id - Retrieve single employee with full relations
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Employee ID is required" });
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        pod: true,
        leadingPod: true,
        weeklyOffs: true,
        assignments: {
          include: {
            process: {
              include: {
                brand: true,
              },
            },
          },
        },
        leaves: {
          orderBy: { startDate: "desc" },
          take: 5,
        },
      },
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: `Employee with ID '${id}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    console.error("Error retrieving employee:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error retrieving employee",
    });
  }
});

// POST /api/v1/employees - Create an employee
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = employeeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const {
      employeeCode,
      name,
      email,
      role,
      isPodLead,
      podId,
      contractType,
      weeklyWorkDays,
      maxConsecutiveDays,
      weeklyOffs,
    } = parsed.data;

    // Check duplicate employee code
    const existingCode = await prisma.employee.findUnique({
      where: { employeeCode },
    });
    if (existingCode) {
      res.status(409).json({
        success: false,
        message: `Employee code '${employeeCode}' is already in use`,
      });
      return;
    }

    // Check duplicate email
    const existingEmail = await prisma.employee.findUnique({
      where: { email },
    });
    if (existingEmail) {
      res.status(409).json({
        success: false,
        message: `Email address '${email}' is already registered`,
      });
      return;
    }

    // Check pod exists if podId provided
    if (podId) {
      const podExists = await prisma.pod.findUnique({
        where: { id: podId },
      });
      if (!podExists) {
        res.status(400).json({
          success: false,
          message: `Operational Pod with ID '${podId}' does not exist`,
        });
        return;
      }
    }

    // Default weekly offs (default: Sunday [0] and Saturday [6] for 5-day work week)
    const offsToAssign = weeklyOffs && weeklyOffs.length > 0 ? weeklyOffs : [0, 6];

    const createdEmployee = await prisma.employee.create({
      data: {
        employeeCode,
        name,
        email,
        role,
        isPodLead,
        podId: podId || null,
        contractType,
        weeklyWorkDays,
        maxConsecutiveDays,
        weeklyOffs: {
          create: offsToAssign.map((day) => ({
            dayOfWeek: day,
            isStandard: true,
          })),
        },
      },
      include: {
        pod: {
          select: { id: true, code: true, name: true },
        },
        weeklyOffs: true,
      },
    });

    res.status(201).json({
      success: true,
      message: `Employee '${createdEmployee.name}' created successfully`,
      data: createdEmployee,
    });
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error creating employee",
    });
  }
});

// PUT/PATCH /api/v1/employees/:id - Update an employee
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdate(req, res);
});

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  await handleUpdate(req, res);
});

async function handleUpdate(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Employee ID is required" });
      return;
    }

    const existingEmployee = await prisma.employee.findUnique({
      where: { id },
      include: { weeklyOffs: true },
    });

    if (!existingEmployee) {
      res.status(404).json({
        success: false,
        message: `Employee with ID '${id}' not found`,
      });
      return;
    }

    const parsed = employeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const {
      employeeCode,
      name,
      email,
      role,
      isPodLead,
      podId,
      contractType,
      weeklyWorkDays,
      maxConsecutiveDays,
      weeklyOffs,
    } = parsed.data;

    // Check code uniqueness if changing
    if (employeeCode && employeeCode !== existingEmployee.employeeCode) {
      const codeTaken = await prisma.employee.findUnique({
        where: { employeeCode },
      });
      if (codeTaken) {
        res.status(409).json({
          success: false,
          message: `Employee code '${employeeCode}' is already in use`,
        });
        return;
      }
    }

    // Check email uniqueness if changing
    if (email && email !== existingEmployee.email) {
      const emailTaken = await prisma.employee.findUnique({
        where: { email },
      });
      if (emailTaken) {
        res.status(409).json({
          success: false,
          message: `Email address '${email}' is already registered`,
        });
        return;
      }
    }

    // Check pod existence if provided
    if (podId !== undefined && podId !== null) {
      const podExists = await prisma.pod.findUnique({
        where: { id: podId },
      });
      if (!podExists) {
        res.status(400).json({
          success: false,
          message: `Operational Pod with ID '${podId}' does not exist`,
        });
        return;
      }
    }

    // Transaction to update employee and optional weekly offs
    const updated = await prisma.$transaction(async (tx) => {
      if (weeklyOffs && Array.isArray(weeklyOffs)) {
        await tx.employeeWeeklyOff.deleteMany({
          where: { employeeId: id },
        });
        await tx.employeeWeeklyOff.createMany({
          data: weeklyOffs.map((d) => ({
            employeeId: id,
            dayOfWeek: d,
            isStandard: true,
          })),
        });
      }

      return tx.employee.update({
        where: { id },
        data: {
          employeeCode,
          name,
          email,
          role,
          isPodLead,
          podId: podId !== undefined ? podId : undefined,
          contractType,
          weeklyWorkDays,
          maxConsecutiveDays,
        },
        include: {
          pod: {
            select: { id: true, code: true, name: true },
          },
          leadingPod: {
            select: { id: true, code: true, name: true },
          },
          weeklyOffs: true,
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.json({
      success: true,
      message: `Employee '${updated.name}' updated successfully`,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error updating employee",
    });
  }
}

// DELETE /api/v1/employees/:id - Safe deletion of employee
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, message: "Employee ID is required" });
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        leadingPod: true,
        assignments: true,
        rosterShifts: true,
        leaves: true,
      },
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: `Employee with ID '${id}' not found`,
      });
      return;
    }

    // Safety check 1: Is this employee a Pod Lead?
    if (employee.leadingPod) {
      res.status(400).json({
        success: false,
        message: `Cannot delete employee '${employee.name}' because they are the designated Pod Lead for '${employee.leadingPod.name}'. Reassign the pod lead first.`,
      });
      return;
    }

    // Safety check 2: Active process assignments
    if (employee.assignments.length > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete employee '${employee.name}' because they have ${employee.assignments.length} active process assignment(s). Remove assignments first.`,
      });
      return;
    }

    // Safety check 3: Roster shifts scheduled
    if (employee.rosterShifts.length > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete employee '${employee.name}' because they are referenced in ${employee.rosterShifts.length} roster shift(s).`,
      });
      return;
    }

    // Safety check 4: Leave records
    if (employee.leaves.length > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete employee '${employee.name}' because they have ${employee.leaves.length} associated leave record(s).`,
      });
      return;
    }

    // Safe to delete: remove weekly offs first then employee
    await prisma.$transaction(async (tx) => {
      await tx.employeeWeeklyOff.deleteMany({
        where: { employeeId: id },
      });
      await tx.employee.delete({
        where: { id },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.json({
      success: true,
      message: `Employee '${employee.name}' (${employee.employeeCode}) was safely deleted.`,
    });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error deleting employee",
    });
  }
});

export default router;
