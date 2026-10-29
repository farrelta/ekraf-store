import express, { type Express, type RequestHandler, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { allocateBatch, expireOrders, fail, move, orderDto, orderInclude, quantities, releaseOrder, total, transaction } from "./store-service.js";
import { canTransitionFulfillment } from "./order-policy.js";

const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { void fn(req, res).catch(next); };
const param = (req: Request, name: string) => String(req.params[name] ?? "");
const text = z.string().trim().min(1).max(160);
const money = z.union([z.string(), z.number()]).transform(String).refine(v => /^\d{1,9}(\.\d{1,2})?$/.test(v) && Number(v) > 0, "Use a positive amount with at most two decimal places");
const image = z.string().url().max(2048).refine(v => v.startsWith("https://"), "Use an HTTPS image URL").nullable().optional();
const variantSchema = z.object({ sku: text, size: text.default("STANDARD"), color: text.default("STANDARD"), price: money, onHand: z.number().int().min(0).max(100000).default(0) });
const productFields = z.object({ name: text, category: text.nullable().optional(), description: z.string().max(5000).default(""), imageKey: image, sellingType: z.enum(["CONTINUOUS", "BATCH"]), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT") });
const productInclude = { variants: { orderBy: { sku: "asc" as const } }, batches: { orderBy: { closesAt: "desc" as const } } };
const receiptDirectory = path.resolve(process.env.RECEIPT_STORAGE_DIR ?? "storage/receipts");
const normalizeVariant = (v: z.output<typeof variantSchema>) => ({ ...v, size: v.size.toUpperCase(), color: v.color.toUpperCase(), price: new Prisma.Decimal(v.price) });

export function registerStoreRoutes(app: Express, db: PrismaClient, auth: RequestHandler, admin: RequestHandler) {
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/api/products", route(async (req, res) => {
    const { search } = z.object({ search: z.string().trim().max(100).optional() }).parse(req.query);
    const products = await db.product.findMany({ where: { status: "PUBLISHED", ...(search ? { name: { contains: search, mode: "insensitive" } } : {}) }, include: { variants: { where: { active: true }, orderBy: { sku: "asc" } }, batches: { where: { status: "OPEN", opensAt: { lte: new Date() }, closesAt: { gt: new Date() } }, orderBy: { closesAt: "asc" } } }, orderBy: { name: "asc" } });
    res.json({ products });
  }));
  app.get("/api/admin/products", admin, route(async (_req, res) => res.json({ products: await db.product.findMany({ include: productInclude, orderBy: { createdAt: "desc" } }) })));
  app.post("/api/admin/products", admin, route(async (req, res) => {
    const { variants, ...data } = productFields.extend({ variants: z.array(variantSchema).min(1).max(100) }).parse(req.body);
    if (data.sellingType === "BATCH" && variants.some(v => v.onHand > 0 || v.size.toUpperCase() === "STANDARD")) fail("Batch products need preset sizes and start with zero ready stock", 400);
    const product = await transaction(db, async tx => {
      const created = await tx.product.create({ data });
      for (const v of variants) {
        const variant = await tx.productVariant.create({ data: { ...normalizeVariant(v), productId: created.id, onHand: 0 } });
        if (v.onHand > 0) await move(tx, { variantId: variant.id, actorId: req.session.userId!, type: "ADJUSTMENT", onHandDelta: v.onHand, reservedDelta: 0, reason: "Initial stock" });
      }
      return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: productInclude });
    });
    res.status(201).json({ product });
  }));
  app.patch("/api/admin/products/:id", admin, route(async (req, res) => {
    const data = productFields.omit({ sellingType: true }).partial().parse(req.body);
    const product = await db.product.update({ where: { id: param(req, "id") }, data, include: productInclude });
    res.json({ product });
  }));
  app.post("/api/admin/products/:id/variants", admin, route(async (req, res) => {
    const data = variantSchema.parse(req.body);
    const variant = await transaction(db, async tx => {
      const product = await tx.product.findUniqueOrThrow({ where: { id: param(req, "id") } });
      if (product.sellingType === "BATCH" && (data.onHand || data.size.toUpperCase() === "STANDARD")) fail("Batch variants need a preset size and zero initial stock", 400);
      const created = await tx.productVariant.create({ data: { ...normalizeVariant(data), productId: product.id, onHand: 0 } });
      if (data.onHand) await move(tx, { variantId: created.id, actorId: req.session.userId!, type: "ADJUSTMENT", onHandDelta: data.onHand, reservedDelta: 0, reason: "Initial stock" });
      return created;
    });
    res.status(201).json({ variant });
  }));
  app.patch("/api/admin/variants/:id", admin, route(async (req, res) => {
    const data = z.object({ price: money.optional(), active: z.boolean().optional() }).parse(req.body);
    res.json({ variant: await db.productVariant.update({ where: { id: param(req, "id") }, data: { ...data, ...(data.price ? { price: new Prisma.Decimal(data.price) } : {}) } }) });
  }));
  app.post("/api/admin/variants/:id/stock", admin, route(async (req, res) => {
    const data = z.object({ onHand: z.number().int().min(0).max(100000), reason: text }).parse(req.body);
    await transaction(db, async tx => {
      const v = await tx.productVariant.findUniqueOrThrow({ where: { id: param(req, "id") }, include: { product: true } });
      if (v.product.sellingType !== "CONTINUOUS") fail("Use batch receipts to receive batch stock", 400);
      if (data.onHand !== v.onHand) await move(tx, { variantId: v.id, actorId: req.session.userId!, type: "ADJUSTMENT", onHandDelta: data.onHand - v.onHand, reservedDelta: 0, reason: data.reason });
    });
    res.json({ message: "Stock updated" });
  }));
  app.get("/api/admin/products/:id/inventory", admin, route(async (req, res) => {
    res.json({ movements: await db.inventoryMovement.findMany({ where: { variant: { productId: param(req, "id") } }, include: { variant: { select: { sku: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) });
  }));
  app.post("/api/admin/batches", admin, route(async (req, res) => {
    const data = z.object({ productId: text, name: text, opensAt: z.iso.datetime(), closesAt: z.iso.datetime(), productionWeeks: z.number().int().min(1).max(52).default(4), announcement: z.string().max(2000).default(""), status: z.enum(["DRAFT", "OPEN"]).default("DRAFT") }).parse(req.body);
    if (new Date(data.opensAt) >= new Date(data.closesAt)) fail("Opening must precede closing", 400);
    const batch = await transaction(db, async tx => {
      const p = await tx.product.findUniqueOrThrow({ where: { id: data.productId } });
      if (p.sellingType !== "BATCH") fail("Choose a batch product", 400);
      return tx.batch.create({ data });
    });
    res.status(201).json({ batch });
  }));
  app.patch("/api/admin/batches/:id", admin, route(async (req, res) => {
    const data = z.object({ status: z.enum(["DRAFT", "OPEN", "CLOSED", "IN_PRODUCTION", "READY", "COMPLETED", "CANCELLED"]).optional(), announcement: z.string().max(2000).optional() }).parse(req.body);
    const batch = await transaction(db, async tx => {
      const current = await tx.batch.findUniqueOrThrow({ where: { id: param(req, "id") } });
      const paths: Record<string, string[]> = { DRAFT: ["OPEN", "CANCELLED"], OPEN: ["CLOSED", "CANCELLED"], CLOSED: ["IN_PRODUCTION", "CANCELLED"], IN_PRODUCTION: ["READY"], READY: ["COMPLETED"] };
      if (data.status && data.status !== current.status && !paths[current.status]?.includes(data.status)) fail("Invalid batch transition");
      if (data.status === "CANCELLED" && await tx.order.count({ where: { batchId: current.id, paymentStatus: { in: ["PAID", "PENDING"] } } })) fail("Resolve existing orders before cancelling a batch");
      if (data.status === "COMPLETED" && await tx.order.count({ where: { batchId: current.id, paymentStatus: "PAID", pickupStatus: { not: "COMPLETED" } } })) fail("Orders still await pickup");
      return tx.batch.update({ where: { id: current.id }, data });
    });
    res.json({ batch });
  }));
  app.post("/api/admin/batches/:id/receive", admin, route(async (req, res) => {
    const data = z.object({ items: z.array(z.object({ variantId: text, quantity: z.number().int().min(1).max(100000) })).min(1).max(100), reason: text }).parse(req.body);
    await transaction(db, async tx => {
      const batch = await tx.batch.findUniqueOrThrow({ where: { id: param(req, "id") } });
      if (!["CLOSED", "IN_PRODUCTION", "READY"].includes(batch.status)) fail("Close the batch before receiving production stock");
      for (const [variantId, quantity] of quantities(data.items)) {
        const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
        if (v.productId !== batch.productId) fail("Variant does not belong to this batch", 400);
        await move(tx, { variantId, batchId: batch.id, actorId: req.session.userId!, type: "RECEIPT", onHandDelta: quantity, reservedDelta: 0, reason: data.reason });
      }
      const orders = await tx.order.findMany({ where: { batchId: batch.id, paymentStatus: "PAID", pickupStatus: "PROCESSING" }, orderBy: { createdAt: "asc" } });
      for (const order of orders) await allocateBatch(tx, order.id);
    });
    res.json({ message: "Batch stock received and allocated to paid orders" });
  }));
  app.get("/api/payment-methods", route(async (_req, res) => res.json({ methods: await db.paymentMethod.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }) })));
  app.get("/api/admin/payment-methods", admin, route(async (_req, res) => res.json({ methods: await db.paymentMethod.findMany({ orderBy: { name: "asc" } }) })));
  const methodSchema = z.object({ name: text, type: z.enum(["QRIS", "BANK_TRANSFER"]), instructions: z.string().max(2000).default(""), qrImageKey: image, bankName: text.nullable().optional(), accountName: text.nullable().optional(), accountNumber: text.nullable().optional(), enabled: z.boolean().default(true) }).superRefine((v, ctx) => {
    if (v.type === "QRIS" ? !v.qrImageKey : !v.bankName || !v.accountName || !v.accountNumber) ctx.addIssue({ code: "custom", message: "Provide the QR image or complete bank details" });
  });
  app.post("/api/admin/payment-methods", admin, route(async (req, res) => {
    const data = methodSchema.parse(req.body);
    res.status(201).json({ method: await db.paymentMethod.create({ data: { ...data, ...(data.type === "QRIS" ? { bankName: null, accountName: null, accountNumber: null } : { qrImageKey: null }) } }) });
  }));
  app.patch("/api/admin/payment-methods/:id", admin, route(async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    res.json({ method: await db.paymentMethod.update({ where: { id: param(req, "id") }, data: { enabled } }) });
  }));
  app.post("/api/orders", auth, route(async (req, res) => {
    const data = z.object({ items: z.array(z.object({ variantId: text, quantity: z.number().int().min(1).max(100), embroideryName: z.string().trim().min(1).max(80).optional() })).min(1).max(30), batchId: text.nullable().optional(), customerName: z.string().trim().min(2).max(100), customerPhone: z.string().trim().min(6).max(30) }).parse(req.body);
    const key = z.string().uuid().parse(req.get("idempotency-key"));
    const create = async () => transaction(db, async tx => {
      const previous = await tx.order.findUnique({ where: { idempotencyKey: key }, include: orderInclude });
      if (previous) { if (previous.userId !== req.session.userId) fail("Checkout key is already used"); return previous; }
      const batch = data.batchId ? await tx.batch.findUniqueOrThrow({ where: { id: data.batchId } }) : null;
      if (batch && (batch.status !== "OPEN" || batch.opensAt > new Date() || batch.closesAt <= new Date())) fail("This batch is not open");
      const lines = [];
      for (const item of data.items) {
        const v = await tx.productVariant.findUniqueOrThrow({ where: { id: item.variantId }, include: { product: true } });
        if (!v.active || v.product.status !== "PUBLISHED") fail("A selected variant is unavailable");
        if (batch ? v.productId !== batch.productId || v.product.sellingType !== "BATCH" : v.product.sellingType !== "CONTINUOUS") fail("Separate continuous products and each batch into different orders", 400);
        if (batch ? !item.embroideryName || v.size === "STANDARD" : !!item.embroideryName) fail("Batch items require a preset size and embroidery name; continuous items have no embroidery", 400);
        lines.push({ variantId: v.id, quantity: item.quantity, embroideryName: item.embroideryName ?? null, itemDescription: `${v.product.name} · ${v.size} / ${v.color} · ${v.sku}`, unitPrice: v.price });
      }
      const order = await tx.order.create({ data: { userId: req.session.userId!, batchId: batch?.id, idempotencyKey: key, customerName: data.customerName, customerPhone: data.customerPhone, expiresAt: new Date(Date.now() + 48 * 3600000), items: { create: lines } } });
      if (!batch) for (const [variantId, quantity] of quantities(lines)) await move(tx, { variantId, orderId: order.id, type: "RESERVATION", onHandDelta: 0, reservedDelta: quantity, reason: "Checkout reservation" });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    });
    try { res.status(201).json({ order: orderDto(await create()) }); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const old = await db.order.findUnique({ where: { idempotencyKey: key }, include: orderInclude });
      if (!old || old.userId !== req.session.userId) throw error;
      res.json({ order: orderDto(old) });
    }
  }));
  app.get("/api/orders", auth, route(async (req, res) => res.json({ orders: (await db.order.findMany({ where: { userId: req.session.userId }, include: orderInclude, orderBy: { createdAt: "desc" }, take: 100 })).map(orderDto) })));
  app.get("/api/admin/orders", admin, route(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
    res.json({ orders: (await db.order.findMany({ where: q ? { OR: [{ id: { contains: q } }, { customerName: { contains: q, mode: "insensitive" } }] } : {}, include: orderInclude, orderBy: { createdAt: "desc" }, take: 100 })).map(orderDto) });
  }));
  app.post("/api/orders/:id/cancel", auth, route(async (req, res) => {
    await transaction(db, async tx => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: param(req, "id") } });
      if (order.userId !== req.session.userId) fail("Order not found", 404);
      await releaseOrder(tx, order.id, "CANCELLED", req.session.userId);
    });
    res.json({ message: "Order cancelled" });
  }));
  app.post("/api/orders/:id/proof", auth, express.raw({ type: ["image/png", "image/jpeg"], limit: "5mb" }), route(async (req, res) => {
    const methodId = text.parse(req.get("x-payment-method"));
    const reference = z.string().trim().max(200).parse(req.get("x-payment-reference") ?? "");
    const buffer: unknown = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return fail("Upload a JPG or PNG receipt", 400);
    const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (!png && !jpg) fail("Invalid receipt image", 400);
    const key = `${randomUUID()}.${png ? "png" : "jpg"}`;
    await mkdir(receiptDirectory, { recursive: true });
    await writeFile(path.join(receiptDirectory, key), buffer, { flag: "wx" });
    try {
      const submission = await transaction(db, async tx => {
        const order = await tx.order.findUniqueOrThrow({ where: { id: param(req, "id") }, include: { items: true } });
        if (order.userId !== req.session.userId) fail("Order not found", 404);
        if (order.paymentStatus !== "PENDING" || order.expiresAt <= new Date()) fail("Payment window is closed");
        const method = await tx.paymentMethod.findUniqueOrThrow({ where: { id: methodId } });
        if (!method.enabled) fail("Payment method is disabled");
        return tx.paymentSubmission.create({ data: { orderId: order.id, paymentMethodId: method.id, methodSnapshot: { name: method.name, type: method.type, instructions: method.instructions, qrImageKey: method.qrImageKey, bankName: method.bankName, accountName: method.accountName, accountNumber: method.accountNumber }, amount: total(order.items), transactionReference: reference || null, proofKey: key } });
      });
      res.status(202).json({ submission: { id: submission.id, status: submission.status } });
    } catch (error) { await unlink(path.join(receiptDirectory, key)).catch(() => {}); throw error; }
  }));
  app.get("/api/payment-submissions/:id/proof", auth, route(async (req, res) => {
    const s = await db.paymentSubmission.findUniqueOrThrow({ where: { id: param(req, "id") }, include: { order: { select: { userId: true } } } });
    if (req.session.role !== "ADMIN" && s.order.userId !== req.session.userId) fail("Receipt not found", 404);
    if (!/^[a-f0-9-]+\.(png|jpg)$/.test(s.proofKey)) fail("Receipt unavailable", 404);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(path.join(receiptDirectory, s.proofKey));
  }));
  app.post("/api/admin/payment-submissions/:id/review", admin, route(async (req, res) => {
    const data = z.object({ action: z.enum(["VERIFIED", "REJECTED"]), reason: z.string().trim().max(1000).default(""), reference: z.string().trim().max(200).default("") }).parse(req.body);
    if (data.action === "REJECTED" ? !data.reason : !data.reference) fail("Provide a rejection reason or verified merchant reference", 400);
    await transaction(db, async tx => {
      const s = await tx.paymentSubmission.findUniqueOrThrow({ where: { id: param(req, "id") }, include: { order: { include: { items: true } } } });
      if (s.status !== "SUBMITTED" || s.order.paymentStatus !== "PENDING") fail("This payment was already reviewed");
      if (!s.amount.equals(total(s.order.items))) fail("Payment amount does not match the complete order total");
      await tx.paymentSubmission.update({ where: { id: s.id }, data: { status: data.action, reviewedBy: req.session.userId, reviewedAt: new Date(), reviewReason: data.reason || null, ...(data.action === "VERIFIED" ? { transactionReference: data.reference } : {}) } });
      if (data.action === "REJECTED") {
        if (s.order.expiresAt <= new Date()) await releaseOrder(tx, s.orderId, "EXPIRED", req.session.userId);
        return;
      }
      if (!s.order.batchId) for (const [variantId, quantity] of quantities(s.order.items)) await move(tx, { variantId, orderId: s.orderId, actorId: req.session.userId!, type: "SALE", onHandDelta: -quantity, reservedDelta: -quantity, reason: "Payment verified" });
      await tx.order.update({ where: { id: s.orderId }, data: { paymentStatus: "PAID", pickupStatus: "PROCESSING" } });
      if (s.order.batchId) await allocateBatch(tx, s.orderId);
    });
    res.json({ message: data.action === "VERIFIED" ? "Payment verified" : "Proof rejected; customer may resubmit before the deadline" });
  }));
  app.patch("/api/admin/orders/:id/pickup", admin, route(async (req, res) => {
    const { status } = z.object({ status: z.enum(["READY_FOR_PICKUP", "COMPLETED"]) }).parse(req.body);
    await transaction(db, async tx => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: param(req, "id") }, include: { items: true } });
      if (order.paymentStatus !== "PAID" || !canTransitionFulfillment(order.pickupStatus, status)) fail("Invalid pickup transition");
      if (order.batchId && status === "READY_FOR_PICKUP") fail("Receive batch stock to make this order ready");
      if (order.batchId && status === "COMPLETED") for (const [variantId, quantity] of quantities(order.items)) await move(tx, { variantId, orderId: order.id, batchId: order.batchId, actorId: req.session.userId!, type: "SALE", onHandDelta: -quantity, reservedDelta: -quantity, reason: "Batch order collected" });
      await tx.order.update({ where: { id: order.id }, data: { pickupStatus: status } });
    });
    res.json({ message: "Pickup status updated" });
  }));
  return { expire: () => expireOrders(db) };
}
