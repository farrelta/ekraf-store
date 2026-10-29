import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import express, { type ErrorRequestHandler, type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { registerStoreRoutes } from "./store-routes.js";

const config = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE"] }));
app.use(express.json({ limit: "64kb" }));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: false }),
  name: "mipa.sid", secret: config.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const requireUser: express.RequestHandler = (req, res, next) => {
  if (!req.session.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  void prisma.user.findUnique({ where: { id: req.session.userId }, select: { role: true } }).then(user => {
    if (!user) { req.session.destroy(() => {}); res.status(401).json({ error: "Authentication required" }); return; }
    req.session.role = user.role;
    (req as AuthedRequest).userId = req.session.userId;
    (req as AuthedRequest).role = user.role;
    next();
  }).catch(next);
};
const admin: express.RequestHandler = (req, res, next) => requireUser(req, res, error => {
  if (error) return next(error);
  if (req.session.role !== "ADMIN") { res.status(403).json({ error: "Insufficient permission" }); return; }
  next();
});
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => schema.parse(input);
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
app.get("/api/auth/me", asyncRoute(async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { id: true, name: true, email: true, role: true } });
  res.json({ user });
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


const store = registerStoreRoutes(app, prisma, requireUser, admin);
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) });
  if (error?.type === "entity.too.large") return res.status(413).json({ error: "Receipt must be at most 5 MB" });
  if (error?.code === "P2002") return res.status(409).json({ error: "A unique value is already in use" });
  if (error?.code === "P2025") return res.status(404).json({ error: "Record not found" });
  if (error?.code === "P2034") return res.status(409).json({ error: "The record changed while this request was processing; please retry" });
  const status = typeof error?.status === "number" ? error.status : 500;
  if (status >= 500) console.error("request_failed", { name: error?.name, code: error?.code });
  return res.status(status).json({ error: status >= 500 ? "Internal server error" : error.message });
};
app.use(errorHandler);


const server = app.listen(config.API_PORT, () => console.log(`API listening on ${config.API_PORT}`));
let expiring = false;
const expiryTimer = setInterval(() => {
  if (expiring) return;
  expiring = true;
  void store.expire().catch(error => console.error("expiry_worker_failed", { code: error?.code })).finally(() => { expiring = false; });
}, 60_000);
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
