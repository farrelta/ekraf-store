import express, { type Express, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fail } from "./store-service.js";

import type { ObjectStorage } from "./object-storage.js";

const filePattern = /^(product-[0-9a-f-]{36}\.webp|qris-[0-9a-f-]{36}\.png)$/;
const directory = () => path.resolve(process.env.MEDIA_STORAGE_DIR ?? "storage/media");
export const imageReference = z.string().max(2048).refine(value => {
  if (value.startsWith("/api/media/")) return filePattern.test(value.slice(11));
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Choose an uploaded image");
export async function validateImageReference(value: string, purpose: "product" | "qris", storage: ObjectStorage) {
  const prefix = value.startsWith("/api/media/") ? "/api/media/" : storage && storage.mediaOrigin + "/";
  if (!prefix || !value.startsWith(prefix)) return;
  const filename = value.slice(prefix.length);
  if (!filePattern.test(filename) || !filename.startsWith(purpose + "-")) fail("Choose an image uploaded for this purpose", 400);
  if (!(storage ? await storage.exists("media", filename) : (await stat(path.join(directory(), filename)).catch(() => null))?.isFile())) fail("The uploaded image is missing. Please upload it again.", 400);
}
export async function productImages(data: { imageKey?: string | null; imageKeys?: string[] }, storage: ObjectStorage) {
  if (data.imageKeys === undefined && data.imageKey === undefined) return {};
  const images = [...new Set(data.imageKeys ?? (data.imageKey ? [data.imageKey] : []))];
  for (const source of images) await validateImageReference(source, "product", storage);
  return { imageKey: images[0] ?? null, imageKeys: images };
}
export function registerImageRoutes(app: Express, admin: RequestHandler, storage: ObjectStorage) {
  const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
  app.post("/api/admin/images", admin, limiter, express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "10mb" }), async (req, res) => {
    const purpose = z.enum(["product", "qris"]).parse(req.get("x-image-purpose"));
    if (!Buffer.isBuffer(req.body) || req.body.length < 12) return fail("Choose a JPG, PNG, or WebP image (up to 10 MB)", 400);
    let output: Buffer;
    try {
      const input = sharp(req.body, { limitInputPixels: 40_000_000, failOn: "warning" });
      const metadata = await input.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
      const image = input.autoOrient().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true });
      output = purpose === "qris" ? await image.png({ compressionLevel: 9 }).toBuffer() : await image.webp({ quality: 85 }).toBuffer();
    } catch { return fail("This image could not be read. Choose a valid, non-animated JPG, PNG, or WebP (up to 40 megapixels).", 400); }
    const filename = `${purpose}-${randomUUID()}.${purpose === "qris" ? "png" : "webp"}`;
    if (storage) {
      await storage.put("media", filename, output, purpose === "qris" ? "image/png" : "image/webp");
    } else {
      await mkdir(directory(), { recursive: true });
      await writeFile(path.join(directory(), filename), output, { flag: "wx" });
    }
    res.status(201).json({ image: { url: storage ? storage.mediaOrigin + "/" + filename : "/api/media/" + filename } });
  });
  app.get("/api/media/:filename", async (req, res) => {
    const filename = String(req.params.filename);
    if (!filePattern.test(filename)) return res.status(404).end();
    if (storage) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.redirect(302, storage.mediaOrigin + "/" + filename);
      return;
    }
    const location = path.join(directory(), filename);
    if (!(await stat(location).catch(() => null))?.isFile()) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.type(filename.endsWith(".png") ? "png" : "webp").sendFile(location);
  });
}
