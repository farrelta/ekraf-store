import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import express, { type ErrorRequestHandler, type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./generated/prisma/client.js";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { canTransitionFulfillment, canTransitionPayment } from "./order-policy.js";

const config = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PAYMENT_INSTRUCTIONS: z.string().default("Contact the treasurer for current payment instructions."),
  ALLOW_ADMIN_BOOTSTRAP: z.string().default("false"),
  ADMIN_BOOTSTRAP_TOKEN: z.string().optional()
}).parse(process.env);

const pool = new Pool({ connectionString: config.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const app = express();
const PgStore = pgSession(session);

declare module "express-session" { interface SessionData { userId?: string; role?: string; csrfToken?: string } }
type AuthedRequest = Request & { userId?: string; role?: string };
const asyncRoute = (fn: (req: AuthedRequest, res: express.Response) => Promise<unknown>) =>
  (req: Request, res: express.Response, next: express.NextFunction) =>
    Promise.resolve(fn(req as AuthedRequest, res)).catch(next);

app.set("trust proxy", config.NODE_ENV === "production" ? 1 : false);
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE"] }));
app.use(express.json({ limit: "64kb" }));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: false }),
  name: "mipa.sid", secret: config.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const requireUser = (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
  if (!req.session.userId) return res.status(401).json({ error: "Authentication required" });
  req.userId = req.session.userId; req.role = req.session.role; next();
};
const allowRoles = (...roles: string[]) => (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
  if (!req.session.userId) return res.status(401).json({ error: "Authentication required" });
  if (!roles.includes(req.session.role ?? "")) return res.status(403).json({ error: "Insufficient permission" });
  req.userId = req.session.userId; req.role = req.session.role; next();
};
const admin = allowRoles("ADMIN");
const staff = allowRoles("ADMIN", "TREASURER");
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => schema.parse(input);
const routeParam = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};
const stripOrder = <T extends { id: string; userId: string; idempotencyKey: string | null; items?: { id: string; orderId: string; productId?: string | null }[] }>(order: T) => {
  const { id: _id, userId: _userId, idempotencyKey: _key, ...safe } = order;
  return { ...safe, ...(order.items ? { items: order.items.map(item => { const { id: _itemId, orderId: _orderId, productId: _productId, ...safeItem } = item; return safeItem; }) } : {}) };
};

app.get("/api/health", asyncRoute(async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ok" }); }
  catch { res.status(503).json({ status: "unavailable" }); }
}));
app.get("/api/csrf", (req, res) => {
  req.session.csrfToken ??= randomBytes(24).toString("hex");
  res.setHeader("Cache-Control", "no-store");
  res.json({ token: req.session.csrfToken });
});
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && origin !== config.FRONTEND_ORIGIN) return res.status(403).json({ error: "Invalid origin" });
  const supplied = req.get("x-csrf-token") ?? "";
  const expected = req.session.csrfToken ?? "";
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).json({ error: "Invalid CSRF token" });
  next();
});

const accountSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(128) });
app.post("/api/auth/register", authLimiter, asyncRoute(async (req, res) => {
  const input = parse(accountSchema, req.body);
  const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) }, select: { id: true, name: true, email: true, role: true } });
  await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = user.id; req.session.role = user.role;
  res.status(201).json({ user });
}));
app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
  const input = parse(z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1).max(128) }), req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await argon2.verify(user.passwordHash, input.password))) return res.status(401).json({ error: "Invalid email or password" });
  await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = user.id; req.session.role = user.role;
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));
app.post("/api/auth/logout", requireUser, asyncRoute(async (req, res) => {
  await new Promise<void>((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
  res.clearCookie("mipa.sid"); res.status(204).end();
}));
app.get("/api/auth/me", requireUser, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true, role: true } });
  res.json({ user });
}));

app.get("/api/payment-instructions", (_req, res) => res.json({ instructions: config.PAYMENT_INSTRUCTIONS }));
app.get("/api/products", asyncRoute(async (req, res) => {
  const query = z.object({ categoryId: z.string().optional(), search: z.string().trim().max(100).optional() }).parse(req.query);
  const products = await prisma.product.findMany({ where: { active: true, ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}) }, include: { category: true }, orderBy: { name: "asc" } });
  res.json({ products });
}));
app.get("/api/products/:id", asyncRoute(async (req, res) => {
  const product = await prisma.product.findFirst({ where: { id: routeParam(req, "id"), active: true }, include: { category: true } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ product });
}));
app.get("/api/categories", asyncRoute(async (_req, res) => res.json({ categories: await prisma.category.findMany({ orderBy: { name: "asc" } }) })));
app.get("/api/admin/products", admin, asyncRoute(async (_req, res) => {
  const products = await prisma.product.findMany({ include: { category: true }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  res.json({ products });
}));
app.get("/api/admin/products/:id/inventory", admin, asyncRoute(async (req, res) => {
  const productId = routeParam(req, "id");
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  const movements = await prisma.inventoryMovement.findMany({ where: { productId }, include: { order: { select: { publicId: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ productName: product.name, movements });
}));

const productSchema = z.object({ name: z.string().trim().min(1).max(160), description: z.string().max(5000).default(""), imageUrl: z.string().url().max(2048).refine(url => url.startsWith("https://"), "Product image URLs must use HTTPS").nullable().optional(), price: z.coerce.number().positive().max(999999999).refine(n => Number.isFinite(n) && Math.round(n * 100) === n * 100, "Use at most two decimal places"), stock: z.number().int().min(0).max(100000), categoryId: z.string().nullable().optional(), active: z.boolean().default(true) });
app.post("/api/admin/products", admin, asyncRoute(async (req, res) => {
  const data = parse(productSchema, req.body);
  const product = await prisma.$transaction(async tx => {
    const item = await tx.product.create({ data: { ...data, price: new Prisma.Decimal(data.price) } });
    await tx.inventoryMovement.create({ data: { productId: item.id, actorId: req.userId!, type: "ADJUSTMENT", quantity: data.stock, reason: "Initial stock" } });
    await tx.auditLog.create({ data: { actorId: req.userId!, action: "PRODUCT_CREATED", entity: "Product", entityId: item.id } });
    return item;
  });
  res.status(201).json({ product });
}));
app.patch("/api/admin/products/:id", admin, asyncRoute(async (req, res) => {
  const data = parse(productSchema.partial().extend({ stockAdjustmentReason: z.string().trim().min(1).max(500).optional() }), req.body);
  const product = await prisma.$transaction(async tx => {
    const existing = await tx.product.findUniqueOrThrow({ where: { id: routeParam(req, "id") } });
    const { stockAdjustmentReason, ...productData } = data;
    const updated = await tx.product.update({ where: { id: existing.id }, data: { ...productData, ...(data.price !== undefined ? { price: new Prisma.Decimal(data.price) } : {}) } });
    if (data.stock !== undefined && data.stock !== existing.stock) {
      if (!stockAdjustmentReason) throw Object.assign(new Error("A reason is required when changing stock"), { status: 400 });
      await tx.inventoryMovement.create({ data: { productId: existing.id, actorId: req.userId!, type: "ADJUSTMENT", quantity: data.stock - existing.stock, reason: stockAdjustmentReason } });
    }
    await tx.auditLog.create({ data: { actorId: req.userId!, action: "PRODUCT_UPDATED", entity: "Product", entityId: existing.id } });
    return updated;
  });
  res.json({ product });
}));

const orderSchema = z.object({ items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(100) })).min(1).max(30), customerName: z.string().trim().min(2).max(100), customerPhone: z.string().trim().min(6).max(30), fulfillmentMethod: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"), fulfillmentNotes: z.string().trim().max(1000).default("") });
app.post("/api/orders", requireUser, asyncRoute(async (req, res) => {
  const data = parse(orderSchema, req.body);
  const key = req.get("idempotency-key");
  if (!key || !z.string().uuid().safeParse(key).success) return res.status(400).json({ error: "A UUID Idempotency-Key header is required" });
  const previous = await prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
  if (previous) return previous.userId === req.userId ? res.status(200).json({ order: stripOrder(previous) }) : res.status(409).json({ error: "Idempotency key already used" });
  const quantities = new Map<string, number>();
  for (const item of data.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  try {
    const order = await prisma.$transaction(async tx => {
      const entries = [] as { id: string; productName: string; price: Prisma.Decimal; quantity: number }[];
      for (const [productId, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
        const product = await tx.product.findFirst({ where: { id: productId, active: true } });
        if (!product) throw Object.assign(new Error("A selected product is unavailable"), { status: 409 });
        const reserved = await tx.product.updateMany({ where: { id: productId, active: true, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
        if (reserved.count !== 1) throw Object.assign(new Error(`${product.name} does not have enough stock`), { status: 409 });
        entries.push({ id: product.id, productName: product.name, price: product.price, quantity });
      }
      const total = entries.reduce((sum, item) => sum.add(item.price.mul(item.quantity)), new Prisma.Decimal(0));
      const created = await tx.order.create({ data: { userId: req.userId!, idempotencyKey: key, total, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), customerName: data.customerName, customerPhone: data.customerPhone, fulfillmentMethod: data.fulfillmentMethod, fulfillmentNotes: data.fulfillmentNotes, items: { create: entries.map(e => ({ productId: e.id, productName: e.productName, unitPrice: e.price, quantity: e.quantity, lineTotal: e.price.mul(e.quantity) })) } }, include: { items: true } });
      for (const item of entries) await tx.inventoryMovement.create({ data: { productId: item.id, orderId: created.id, type: "ORDER_RESERVATION", quantity: -item.quantity, reason: `Order ${created.publicId}` } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ order: stripOrder(order) });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") return res.status(409).json({ error: "Stock or order changed while checkout was processing; please review your bag and try again" });
    if ((error as { code?: string }).code === "P2002") {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
      if (existing && existing.userId === req.userId) return res.status(200).json({ order: stripOrder(existing) });
    }
    throw error;
  }
}));

app.get("/api/orders", requireUser, asyncRoute(async (req, res) => {
  const orders = await prisma.order.findMany({ where: { userId: req.userId }, include: { items: true, paymentEvents: { select: { action: true, reason: true, reference: true, createdAt: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ orders: orders.map(stripOrder) });
}));
app.post("/api/orders/:publicId/cancel", requireUser, asyncRoute(async (req, res) => {
  const order = await prisma.$transaction(async tx => {
    const current = await tx.order.findFirst({ where: { publicId: routeParam(req, "publicId"), userId: req.userId }, include: { items: true } });
    if (!current || current.paymentStatus !== "PENDING" || current.fulfillmentStatus !== "PENDING") throw Object.assign(new Error("Pending order not found"), { status: 404 });
    const changed = await tx.order.updateMany({ where: { id: current.id, paymentStatus: "PENDING", fulfillmentStatus: "PENDING" }, data: { paymentStatus: "EXPIRED", fulfillmentStatus: "CANCELLED" } });
    if (!changed.count) throw Object.assign(new Error("Order has already changed"), { status: 409 });
    for (const item of current.items) if (item.productId) {
      await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      await tx.inventoryMovement.create({ data: { productId: item.productId, orderId: current.id, type: "CANCELLATION_RESTOCK", quantity: item.quantity, reason: `Customer cancelled ${current.publicId}` } });
    }
    await tx.paymentEvent.create({ data: { orderId: current.id, actorId: req.userId!, action: "CANCELLED", amount: current.total, reason: "Customer cancelled before payment" } });
    await tx.auditLog.create({ data: { actorId: req.userId!, action: "ORDER_CANCELLED", entity: "Order", entityId: current.id } });
    return tx.order.findUnique({ where: { id: current.id }, include: { items: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  res.json({ order: order ? stripOrder(order) : null });
}));
app.get("/api/orders/:publicId", requireUser, asyncRoute(async (req, res) => {
  const where = req.role === "ADMIN" || req.role === "TREASURER" ? { publicId: routeParam(req, "publicId") } : { publicId: routeParam(req, "publicId"), userId: req.userId };
  const order = await prisma.order.findFirst({ where, include: { items: true, paymentEvents: { select: { action: true, reason: true, reference: true, createdAt: true } } } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order: stripOrder(order) });
}));

app.post("/api/orders/:publicId/payment-reference", requireUser, asyncRoute(async (req, res) => {
  const data = parse(z.object({ reference: z.string().trim().max(200).default("") }), req.body);
  const order = await prisma.order.findFirst({ where: { publicId: routeParam(req, "publicId"), userId: req.userId, paymentStatus: "PENDING", expiresAt: { gt: new Date() } } });
  if (!order) return res.status(404).json({ error: "Pending order not found" });
  await prisma.paymentEvent.create({ data: { orderId: order.id, actorId: req.userId!, action: "REFERENCE_SUBMITTED", reference: data.reference, amount: order.total, reason: "Customer submitted reference; payment not verified" } });
  res.status(202).json({ message: "Reference recorded for staff review. This does not confirm payment." });
}));

app.get("/api/admin/orders", staff, asyncRoute(async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
  const orders = await prisma.order.findMany({ where: q ? { OR: [{ publicId: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }] } : {}, include: { items: true, paymentEvents: { include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } }, user: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ orders: orders.map(stripOrder) });
}));
app.post("/api/admin/orders/:publicId/payment", staff, asyncRoute(async (req, res) => {
  const data = parse(z.object({ action: z.enum(["PAID", "REJECTED", "REFUNDED"]), reason: z.string().trim().max(1000).default(""), reference: z.string().trim().max(200).default("") }), req.body);
  if ((data.action === "REJECTED" || data.action === "REFUNDED") && !data.reason) return res.status(400).json({ error: "A reason is required" });
  if (data.action === "PAID" && !data.reference) return res.status(400).json({ error: "The verified bank or merchant transaction reference is required" });
  const order = await prisma.$transaction(async tx => {
    const current = await tx.order.findUnique({ where: { publicId: routeParam(req, "publicId") }, include: { items: true } });
    if (!current) throw Object.assign(new Error("Order not found"), { status: 404 });
    if (current.paymentStatus === "PENDING" && current.expiresAt <= new Date()) throw Object.assign(new Error("Payment window has expired; inventory release is processing"), { status: 409 });
    if (!canTransitionPayment(current.paymentStatus, data.action)) throw Object.assign(new Error("Payment state cannot make this transition"), { status: 409 });
    const transition = await tx.order.updateMany({
      where: { id: current.id, paymentStatus: current.paymentStatus },
      data: { paymentStatus: data.action, ...(data.action === "PAID" ? { fulfillmentStatus: "PROCESSING" } : data.action === "REJECTED" ? { fulfillmentStatus: "CANCELLED" } : {}) }
    });
    if (!transition.count) throw Object.assign(new Error("Payment state changed while this decision was processing"), { status: 409 });
    const updated = await tx.order.findUniqueOrThrow({ where: { id: current.id } });
    if (data.action === "REJECTED") for (const item of current.items) if (item.productId) {
      await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      await tx.inventoryMovement.create({ data: { productId: item.productId, orderId: current.id, type: "CANCELLATION_RESTOCK", quantity: item.quantity, reason: `Payment rejected for ${current.publicId}` } });
    }
    await tx.paymentEvent.create({ data: { orderId: current.id, actorId: req.userId!, action: data.action, reason: data.reason, reference: data.reference, amount: current.total } });
    await tx.auditLog.create({ data: { actorId: req.userId!, action: `PAYMENT_${data.action}`, entity: "Order", entityId: current.id } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  res.json({ order });
}));
app.patch("/api/admin/orders/:publicId/fulfillment", admin, asyncRoute(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["PROCESSING", "READY_FOR_PICKUP", "SHIPPED", "COMPLETED", "CANCELLED"]) }), req.body);
  const updated = await prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { publicId: routeParam(req, "publicId") }, include: { items: true } });
    if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });
    if (order.paymentStatus !== "PAID" || !canTransitionFulfillment(order.fulfillmentStatus, status)) throw Object.assign(new Error("Invalid fulfillment transition"), { status: 409 });
    const result = await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: status } });
    await tx.auditLog.create({ data: { actorId: req.userId!, action: `FULFILLMENT_${status}`, entity: "Order", entityId: order.id } });
    return result;
  });
  res.json({ order: updated });
}));

app.post("/api/admin/bootstrap", authLimiter, asyncRoute(async (req, res) => {
  if (config.ALLOW_ADMIN_BOOTSTRAP !== "true" || !config.ADMIN_BOOTSTRAP_TOKEN || config.NODE_ENV === "production") return res.status(404).json({ error: "Not found" });
  const supplied = req.get("x-bootstrap-token") ?? "";
  const expected = Buffer.from(config.ADMIN_BOOTSTRAP_TOKEN); const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(403).json({ error: "Invalid bootstrap token" });
  if (await prisma.user.count({ where: { role: "ADMIN" } })) return res.status(409).json({ error: "An administrator already exists" });
  const input = parse(accountSchema, req.body);
  const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }), role: "ADMIN" }, select: { id: true, name: true, email: true, role: true } });
  res.status(201).json({ user });
}));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) });
  if (error?.code === "P2002") return res.status(409).json({ error: "A unique value is already in use" });
  if (error?.code === "P2025") return res.status(404).json({ error: "Record not found" });
  if (error?.code === "P2034") return res.status(409).json({ error: "The record changed while this request was processing; please retry" });
  const status = typeof error?.status === "number" ? error.status : 500;
  if (status >= 500) console.error("request_failed", { name: error?.name, code: error?.code });
  return res.status(status).json({ error: status >= 500 ? "Internal server error" : error.message });
};
app.use(errorHandler);

const server = app.listen(config.API_PORT, () => console.log(`API listening on ${config.API_PORT}`));
const expirePendingOrders = async () => {
  const expired = await prisma.order.findMany({ where: { paymentStatus: "PENDING", fulfillmentStatus: "PENDING", expiresAt: { lt: new Date() } }, include: { items: true }, take: 50 });
  for (const order of expired) {
    try {
      await prisma.$transaction(async tx => {
        const changed = await tx.order.updateMany({ where: { id: order.id, paymentStatus: "PENDING", fulfillmentStatus: "PENDING", expiresAt: { lt: new Date() } }, data: { paymentStatus: "EXPIRED", fulfillmentStatus: "CANCELLED" } });
        if (!changed.count) return;
        await tx.paymentEvent.create({ data: { orderId: order.id, actorId: null, action: "EXPIRED", amount: order.total, reason: "Payment window elapsed" } });
        await tx.auditLog.create({ data: { actorId: null, action: "ORDER_EXPIRED", entity: "Order", entityId: order.id } });
        for (const item of order.items) if (item.productId) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
          await tx.inventoryMovement.create({ data: { productId: item.productId, orderId: order.id, type: "CANCELLATION_RESTOCK", quantity: item.quantity, reason: `Payment expired for ${order.publicId}` } });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { console.error("order_expiration_failed", { order: order.publicId, code: (error as { code?: string }).code }); }
  }
};
const expiryTimer = setInterval(() => void expirePendingOrders().catch(error => console.error("expiry_worker_failed", { code: error?.code })), 60_000);
expiryTimer.unref();
let shuttingDown = false;
const stop = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(expiryTimer);
  server.close(() => { void prisma.$disconnect().finally(() => pool.end()); });
  server.closeIdleConnections();
};
process.on("SIGTERM", stop); process.on("SIGINT", stop);
