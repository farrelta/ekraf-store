import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { configureObjectStorage } from "../object-storage.js";

const storage = configureObjectStorage();
if (!storage) throw new Error("Configure R2 before copying uploads");

for (const [kind, directory, pattern] of [
  ["media", process.env.MEDIA_STORAGE_DIR ?? "storage/media", /^(product-[0-9a-f-]{36}\.webp|qris-[0-9a-f-]{36}\.png)$/],
  ["receipt", process.env.RECEIPT_STORAGE_DIR ?? "storage/receipts", /^[0-9a-f-]{36}\.(png|jpg)$/],
] as const) {
  let copied = 0;
  let existing = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    if (await storage.exists(kind, entry.name)) { existing++; continue; }
    const body = await readFile(path.join(directory, entry.name));
    const contentType = entry.name.endsWith(".png") ? "image/png" : entry.name.endsWith(".jpg") ? "image/jpeg" : "image/webp";
    await storage.put(kind, entry.name, body, contentType);
    copied++;
  }
  console.log(kind, { copied, existing });
}
