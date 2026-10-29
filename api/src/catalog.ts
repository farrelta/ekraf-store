import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "./generated/prisma/client.js";

export const catalogOptions = {
  categories: ["T-shirt", "Faculty Jacket", "Work Shirt", "Hoodie", "Tote Bag", "Accessories", "Other"],
  sizes: ["STANDARD", "XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  colors: ["Black", "White", "Forest Green", "Navy", "Gray", "Maroon"]
};
export const normalizeOption = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase() || "STANDARD";
export const optionSchema = z.string().trim().max(160).transform(normalizeOption).default("STANDARD");
export const generateSku = () => `EKR-${randomBytes(6).toString("hex").toUpperCase()}`;

function isSkuConflict(error: unknown) {
  const e = error as { code?: string; meta?: { target?: unknown } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.length === 1 && target[0] === "sku" : target === "sku" || target === "product_variants_sku_key";
}

// Retry the entire creation transaction: PostgreSQL cannot reuse an aborted one.
// Explicit-SKU and size/color conflicts must not be retried as random collisions.
export async function createWithSkus<V extends { sku?: string }, T>(
  db: Pick<PrismaClient, "productVariant">,
  variants: V[],
  create: (assigned: (V & { sku: string })[]) => Promise<T>,
  generate = generateSku
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const assigned = variants.map(v => ({ ...v, sku: v.sku ?? generate() }));
    try { return await create(assigned); }
    catch (error) {
      if (attempt >= 3 || !isSkuConflict(error)) throw error;
      const generated = assigned.filter((_, index) => variants[index]?.sku === undefined).map(v => v.sku);
      if (!generated.length) throw error;
      const repeated = generated.some(sku => assigned.filter(v => v.sku === sku).length > 1);
      if (!repeated && !await db.productVariant.findFirst({ where: { sku: { in: generated } }, select: { id: true } })) throw error;
    }
  }
}
