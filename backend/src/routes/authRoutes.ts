import { Router, Request, Response } from "express";
import { Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  authenticate,
  clearSessionCookie,
  createOpaqueToken,
  hashSessionToken,
  requireAdmin,
  requireCsrf,
  SESSION_DURATION_MS,
  setSessionCookie,
} from "../auth.js";
import { prisma } from "../prisma.js";

const router = Router();
const dummyPasswordHash = bcrypt.hashSync("not-a-real-user-password", 12);
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(72).refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Password must not exceed 72 UTF-8 bytes"
);
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Invalid credentials"
  ),
});
const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  role: z.nativeEnum(UserRole),
});
const statusSchema = z.object({ isActive: z.boolean() });
const userIdSchema = z.string().uuid();
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many login attempts. Try again later." },
});

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

router.post("/login", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Valid email and password are required" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const passwordMatches = await bcrypt.compare(
      parsed.data.password,
      user?.passwordHash || dummyPasswordHash
    );
    if (!user || !user.isActive || !passwordMatches) {
      res.status(401).json({ success: false, message: "Invalid email or password" });
      return;
    }

    const token = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await prisma.userSession.create({
      data: { userId: user.id, tokenHash: hashSessionToken(token), csrfToken, expiresAt },
    });
    setSessionCookie(res, token, expiresAt);
    res.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive },
        csrfToken,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ success: false, message: "Unable to log in" });
  }
});

router.use(authenticate, requireCsrf);

router.get("/me", (req: Request, res: Response): void => {
  res.json({ success: true, data: req.authSession?.user });
});

router.get("/csrf", (req: Request, res: Response): void => {
  res.json({ success: true, data: { csrfToken: req.authSession?.csrfToken } });
});

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.authSession) {
      await prisma.userSession.delete({ where: { id: req.authSession.id } });
    }
    clearSessionCookie(res);
    res.json({ success: true, message: "Logged out" });
  } catch (error) {
    console.error("Logout failed:", error);
    res.status(500).json({ success: false, message: "Unable to log out" });
  }
});

router.get("/users", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ createdAt: "asc" }],
    });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Unable to list users:", error);
    res.status(500).json({ success: false, message: "Unable to list users" });
  }
});

router.post("/users", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
      },
      select: publicUserSelect,
    });
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ success: false, message: "An account with this email already exists" });
      return;
    }
    console.error("Unable to create user:", error);
    res.status(500).json({ success: false, message: "Unable to create user" });
  }
});

router.patch("/users/:id/status", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = userIdSchema.safeParse(req.params.id);
  const parsed = statusSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ success: false, message: "A valid user ID and isActive value are required" });
    return;
  }
  if (id.data === req.authSession?.user.id && !parsed.data.isActive) {
    res.status(409).json({ success: false, message: "You cannot deactivate your own account" });
    return;
  }

  try {
    const user = await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({ where: { id: id.data } });
      if (!target) return null;
      if (target.role === "ADMIN" && target.isActive && !parsed.data.isActive) {
        const activeAdmins = await transaction.user.count({ where: { role: "ADMIN", isActive: true } });
        if (activeAdmins <= 1) {
          throw new Error("LAST_ACTIVE_ADMIN");
        }
      }
      const updated = await transaction.user.update({
        where: { id: id.data },
        data: { isActive: parsed.data.isActive },
        select: publicUserSelect,
      });
      if (!updated.isActive) {
        await transaction.userSession.deleteMany({ where: { userId: updated.id } });
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACTIVE_ADMIN") {
      res.status(409).json({ success: false, message: "At least one active administrator must remain" });
      return;
    }
    console.error("Unable to update user status:", error);
    res.status(500).json({ success: false, message: "Unable to update user status" });
  }
});

export default router;
