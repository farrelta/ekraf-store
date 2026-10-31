import { existsSync } from "node:fs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import argon2 from "argon2";
import { z } from "zod";

if (existsSync("../.env")) process.loadEnvFile("../.env");
const env = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_EMAIL: z.string().email().transform(value => value.toLowerCase()),
  ADMIN_NAME: z.string().trim().min(2).max(100),
  ADMIN_PASSWORD: z.string().min(12).max(128)
}).parse(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  if (await prisma.user.count({ where: { role: "ADMIN" } }) > 0) {
    throw new Error("An administrator already exists. Use the managed database's audited recovery process.");
  }
  const user = await prisma.user.create({ data: {
    name: env.ADMIN_NAME,
    email: env.ADMIN_EMAIL,
    passwordHash: await argon2.hash(env.ADMIN_PASSWORD, { type: argon2.argon2id }),
    role: "ADMIN"
  }, select: { email: true, role: true } });
  console.log(`Created ${user.role} account for ${user.email}. Remove ADMIN_PASSWORD from the execution environment.`);
} finally {
  await prisma.$disconnect();
  await pool.end();
}
