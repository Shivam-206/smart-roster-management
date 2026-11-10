import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma.js";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
  name: z.string().trim().min(2).max(100),
});

async function bootstrapAdmin(): Promise<void> {
  const parsed = credentialsSchema.safeParse({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    name: process.env.BOOTSTRAP_ADMIN_NAME || "System Administrator",
  });
  if (!parsed.success) {
    throw new Error("Set valid BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters).");
  }

  const result = await prisma.$transaction(async (transaction) => {
    const existingAdmin = await transaction.user.findFirst({ where: { role: "ADMIN" } });
    if (existingAdmin) return "exists";
    const existingEmail = await transaction.user.findUnique({ where: { email: parsed.data.email } });
    if (existingEmail) {
      throw new Error("The bootstrap email already belongs to a non-administrator account.");
    }

    await transaction.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        role: "ADMIN",
      },
    });
    return "created";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result === "exists") {
    console.log("An administrator already exists; bootstrap made no changes.");
    return;
  }
  console.log("Initial administrator created.");
}

bootstrapAdmin()
  .catch((error: unknown) => {
    console.error("Administrator bootstrap failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
