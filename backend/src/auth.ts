import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma.js";

export const SESSION_COOKIE = "smart_roster_session";
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

declare global {
  namespace Express {
    interface Request {
      authSession?: {
        id: string;
        csrfToken: string;
        expiresAt: Date;
        user: {
          id: string;
          name: string;
          email: string;
          role: "ADMIN" | "MANAGER";
          isActive: boolean;
        };
      };
    }
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function getCookieValue(header: string | undefined, cookieName: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === cookieName) return valueParts.join("=");
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const sameSite = process.env.AUTH_COOKIE_SAME_SITE === "none" ? "none" : "lax";
  const secure = process.env.NODE_ENV === "production" || sameSite === "none";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/v1",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  const sameSite = process.env.AUTH_COOKIE_SAME_SITE === "none" ? "none" : "lax";
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: "/api/v1",
  });
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getCookieValue(req.headers.cookie, SESSION_COOKIE);
  if (!token) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  try {
    const session = await prisma.userSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
      clearSessionCookie(res);
      res.status(401).json({ success: false, message: "Session expired or invalid" });
      return;
    }

    req.authSession = {
      id: session.id,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      user: session.user,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const supplied = req.get("X-CSRF-Token") || "";
  const expected = req.authSession?.csrfToken || "";
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (!supplied || suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)) {
    res.status(403).json({ success: false, message: "CSRF token is missing or invalid" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.authSession?.user.role !== "ADMIN") {
    res.status(403).json({ success: false, message: "Administrator access required" });
    return;
  }
  next();
}
