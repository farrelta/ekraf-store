import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { fail, orderDto, orderInclude } from "./store-service.js";

const id = (req: Request) => String(req.params.id ?? "");
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).default(""),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export function dateRange(
  from?: string,
  to?: string,
  monthDefault = false,
  now = new Date(),
) {
  const today = new Date(now.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 10);
  const first = monthDefault ? today.slice(0, 7) + "-01" : undefined;
  const start = from ?? first,
    last = to ?? (monthDefault ? today : undefined);
  for (const value of [start, last])
    if (
      value &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
    )
      fail("Invalid calendar date", 400);
  const lower = start ? new Date(start + "T00:00:00+07:00") : undefined;
  const upper = last
    ? new Date(new Date(last + "T00:00:00+07:00").getTime() + 86400000)
    : undefined;
  if (lower && upper && lower >= upper)
    fail("Start date must not follow end date", 400);
  if (lower && upper && upper.getTime() - lower.getTime() > 366 * 86400000)
    fail("Choose at most 366 days", 400);
  return { lower, upper, from: start, to: last };
}
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
const csv = (
  res: Response,
  name: string,
  headers: string[],
  rows: unknown[][],
) => {
  res.type("text/csv; charset=utf-8").attachment(name);
  res.send(
    "\uFEFF" +
      [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"),
  );
};
const dates = (column: Prisma.Sql, r: ReturnType<typeof dateRange>) =>
  Prisma.sql`${r.lower ? Prisma.sql`AND ${column} >= ${r.lower}` : Prisma.empty} ${r.upper ? Prisma.sql`AND ${column} < ${r.upper}` : Prisma.empty}`;
const pagination = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  pageCount: Math.ceil(total / pageSize),
});
const productInclude = {
  variants: { orderBy: { sku: "asc" as const } },
  batches: { orderBy: { closesAt: "asc" as const } },
};
const publicInclude = () => ({
  variants: { where: { active: true }, orderBy: { sku: "asc" as const } },
  batches: {
    where: {
      status: "OPEN" as const,
      opensAt: { lte: new Date() },
      closesAt: { gt: new Date() },
    },
    orderBy: { closesAt: "asc" as const },
  },
});
const productDto = (
  p: Prisma.ProductGetPayload<{ include: typeof productInclude }>,
) => {
  const variants = p.variants.filter((v) => v.active);
  return {
    ...p,
    fromPrice: variants.length
      ? Prisma.Decimal.min(...variants.map((v) => v.price)).toFixed(2)
      : null,
    availableStock: variants.reduce((n, v) => n + v.onHand - v.reserved, 0),
  };
};

export function registerQueryRoutes(
  app: Express,
  db: PrismaClient,
  auth: RequestHandler,
  admin: RequestHandler,
) {
  const products = (isAdmin: boolean, exportCsv = false): RequestHandler =>
    async (req, res) => {
      const q = pageSchema
        .extend({
          search: z.string().trim().max(100).optional(),
          type: z.enum(["CONTINUOUS", "BATCH"]).optional(),
          status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
          category: z.string().max(160).optional(),
          sort: z
            .enum(["featured", "price_asc", "price_desc", "newest", "name"])
            .default("featured"),
          stock: z.enum(["low", "sold_out"]).optional(),
        })
        .parse(req.query);
      const r = dateRange(q.from, q.to, isAdmin),
        search = q.search ?? q.q;
      const base = Prisma.sql`WHERE true ${!isAdmin ? Prisma.sql`AND p.status='PUBLISHED'` : Prisma.empty} ${dates(Prisma.sql`p.created_at`, r)}`;
      const where = Prisma.sql`${base} ${search ? Prisma.sql`AND p.name ILIKE ${"%" + search + "%"}` : Prisma.empty} ${q.type ? Prisma.sql`AND p.selling_type::text=${q.type}` : Prisma.empty} ${q.status && isAdmin ? Prisma.sql`AND p.status::text=${q.status}` : Prisma.empty} ${q.category ? Prisma.sql`AND p.category=${q.category}` : Prisma.empty} ${q.stock ? Prisma.sql`AND p.selling_type='CONTINUOUS' AND stock.available ${q.stock === "low" ? Prisma.sql`BETWEEN 1 AND 5` : Prisma.sql`=0`}` : Prisma.empty}`;
      const join = Prisma.sql`LEFT JOIN LATERAL(SELECT MIN(price) AS price,COALESCE(SUM(on_hand-reserved),0) AS available FROM product_variants WHERE product_id=p.id AND active) stock ON true`;
      const sort =
        q.sort === "price_asc"
          ? Prisma.sql`stock.price ASC NULLS LAST,p.id`
          : q.sort === "price_desc"
            ? Prisma.sql`stock.price DESC NULLS LAST,p.id`
            : q.sort === "newest"
              ? Prisma.sql`p.created_at DESC,p.id`
              : q.sort === "name"
                ? Prisma.sql`p.name,p.id`
                : Prisma.sql`p.featured DESC,p.name,p.id`;
      const counts = await db.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS total FROM products p ${join} ${where}`,
      );
      const rows = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT p.id FROM products p ${join} ${where} ORDER BY ${sort} ${exportCsv ? Prisma.empty : Prisma.sql`LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`}`,
      );
      const found = await db.product.findMany({
        where: { id: { in: rows.map((x) => x.id) } },
        include: isAdmin ? productInclude : publicInclude(),
      });
      const mapped = new Map(found.map((p) => [p.id, productDto(p)]));
      const data = rows.map((x) => mapped.get(x.id)!);
      if (exportCsv)
        return csv(
          res,
          "ekraf-products.csv",
          [
            "Product",
            "Category",
            "Type",
            "Status",
            "Price from",
            "Available stock",
          ],
          data.map((p) => [
            p.name,
            p.category,
            p.sellingType,
            p.status,
            p.fromPrice,
            p.availableStock,
          ]),
        );
      const [summary] = await db.$queryRaw<any[]>(
        Prisma.sql`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE p.status='PUBLISHED')::int AS published,COUNT(*) FILTER(WHERE p.status='DRAFT')::int AS drafts,COUNT(*) FILTER(WHERE p.status='ARCHIVED')::int AS archived,COUNT(*) FILTER(WHERE p.selling_type='CONTINUOUS' AND stock.available BETWEEN 1 AND 5)::int AS "lowStock",COUNT(*) FILTER(WHERE p.selling_type='CONTINUOUS' AND stock.available=0)::int AS "soldOut",COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM batches b WHERE b.product_id=p.id AND b.status='OPEN' AND b.closes_at>now() AND b.closes_at<=now()+interval '3 days'))::int AS "closingSoon" FROM products p ${join} ${base}`,
      );
      const categories = await db.product.findMany({
        where: !isAdmin
          ? { status: "PUBLISHED", category: { not: null } }
          : { category: { not: null } },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      });
      res.json({
        range: { from: r.from, to: r.to },
        products: data,
        pagination: pagination(q.page, q.pageSize, counts[0]?.total ?? 0),
        summary,
        categories: categories.map((x) => x.category),
      });
    };
  app.get("/api/products", products(false));
  app.get("/api/admin/products/export", admin, products(true, true));
  app.get("/api/admin/products", admin, products(true));
  app.get(
    "/api/cart/variants",
    async (req, res) => {
      const ids = z
        .string()
        .max(5000)
        .parse(req.query.ids)
        .split(",")
        .filter(Boolean);
      if (ids.length > 30)
        return fail("A bag can contain at most 30 different variants", 400);
      res.json({
        variants: await db.productVariant.findMany({
          where: {
            id: { in: ids },
            active: true,
            product: { status: "PUBLISHED" },
          },
          include: { product: { include: publicInclude() } },
        }),
      });
    },
  );
  app.get(
    "/api/products/:id",
    async (req, res) => {
      const p = await db.product.findFirst({
        where: { id: id(req), status: "PUBLISHED" },
        include: publicInclude(),
      });
      if (!p) return fail("Product not found", 404);
      res.json({ product: productDto(p) });
    },
  );
  app.get(
    "/api/admin/products/:id",
    admin,
    async (req,res) => {
      const p=await db.product.findUniqueOrThrow({where:{id:id(req)},include:productInclude});
      const referenced=await db.orderItem.groupBy({by:['variantId'],where:{variant:{productId:p.id}}});
      const ids=new Set(referenced.map(item=>item.variantId));
      res.json({product:{...productDto(p),variants:p.variants.map(v=>({...v,hasOrderHistory:ids.has(v.id)}))}});
    },
  );

  const batchList = (isAdmin: boolean): RequestHandler =>
    async (req, res) => {
      const q = pageSchema
          .extend({
            status: z
              .enum([
                "DRAFT",
                "OPEN",
                "CLOSED",
                "IN_PRODUCTION",
                "READY",
                "COMPLETED",
                "CANCELLED",
              ])
              .optional(),
          })
          .parse(req.query),
        r = dateRange(q.from, q.to, isAdmin);
      const base: Prisma.BatchWhereInput = {
        ...(r.lower || r.upper
          ? { createdAt: { gte: r.lower, lt: r.upper } }
          : {}),
        ...(!isAdmin
          ? {
              product: { status: "PUBLISHED" },
              status: "OPEN",
              opensAt: { lte: new Date() },
              closesAt: { gt: new Date() },
            }
          : {}),
      };
      const where: Prisma.BatchWhereInput = {
        ...base,
        ...(q.status && isAdmin ? { status: q.status } : {}),
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: "insensitive" } },
                { product: { name: { contains: q.q, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const [batches, count, all, open, closingSoon, completed] =
        await Promise.all([
          db.batch.findMany({
            where,
            include: {
              product: { include: productInclude },
              _count: { select: { items: true } },
            },
            orderBy: { closesAt: "desc" },
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          db.batch.count({ where }),
          db.batch.count({ where: base }),
          db.batch.count({
            where: {
              ...base,
              status: "OPEN",
              opensAt: { lte: new Date() },
              closesAt: { gt: new Date() },
            },
          }),
          db.batch.count({
            where: {
              ...base,
              status: "OPEN",
              closesAt: {
                gt: new Date(),
                lte: new Date(Date.now() + 3 * 86400000),
              },
            },
          }),
          db.batch.count({ where: { ...base, status: "COMPLETED" } }),
        ]);
      const ids = batches.map((b) => b.id);
      const stats = ids.length
        ? await db.$queryRaw<any[]>(
            Prisma.sql`SELECT batch_id AS id,COUNT(DISTINCT order_id)::int AS orders,SUM(quantity)::int AS units,COALESCE(SUM(unit_price*quantity),0)::text AS value FROM order_items i JOIN orders o ON o.id=i.order_id WHERE batch_id IN (${Prisma.join(ids)}) AND o.payment_status NOT IN ('CANCELLED','EXPIRED') GROUP BY batch_id`,
          )
        : [];
      res.json({
        range: { from: r.from, to: r.to },
        batches: batches.map((b) => ({
          ...b,
          product: productDto(b.product),
          stats: stats.find((x) => x.id === b.id) ?? {
            orders: 0,
            units: 0,
            value: "0",
          },
        })),
        pagination: pagination(q.page, q.pageSize, count),
        summary: { total: all, open, closingSoon, completed },
      });
    };
  app.get("/api/batches", batchList(false));
  app.get("/api/admin/batches", admin, batchList(true));
  const batchDetail = (isAdmin: boolean): RequestHandler =>
    async (req, res) => {
      const b = await db.batch.findFirst({
        where: {
          id: id(req),
          ...(!isAdmin ? { product: { status: "PUBLISHED" } } : {}),
        },
        include: {
          product: { include: isAdmin ? productInclude : publicInclude() },
        },
      });
      if (!b) return fail("Batch not found", 404);
      res.json({ batch: { ...b, product: productDto(b.product) } });
    };
  app.get("/api/batches/:id", batchDetail(false));
  app.get("/api/admin/batches/:id", admin, batchDetail(true));

  const orderList = (isAdmin: boolean): RequestHandler =>
    async (req, res) => {
      const q = pageSchema
          .extend({
            payment: z
              .enum([
                "PENDING",
                "PARTIALLY_PAID",
                "PAID",
                "EXPIRED",
                "CANCELLED",
              ])
              .optional(),
            pickup: z
              .enum([
                "PENDING",
                "PROCESSING",
                "READY_FOR_PICKUP",
                "COMPLETED",
                "CANCELLED",
              ])
              .optional(),
            awaiting: z.enum(["true"]).optional(),
            userId: z.string().optional(),
          })
          .parse(req.query),
        r = dateRange(q.from, q.to, isAdmin);
      const base: Prisma.OrderWhereInput = {
        ...(!isAdmin
          ? { userId: req.session.userId }
          : q.userId
            ? { userId: q.userId }
            : {}),
        ...(r.lower || r.upper
          ? { createdAt: { gte: r.lower, lt: r.upper } }
          : {}),
      };
      const where: Prisma.OrderWhereInput = {
        ...base,
        ...(q.payment ? { paymentStatus: q.payment } : {}),
        ...(q.pickup ? { items: { some: { pickupStatus: q.pickup } } } : {}),
        ...(q.awaiting
          ? { paymentSubmissions: { some: { status: "SUBMITTED" } } }
          : {}),
        ...(q.q
          ? {
              OR: [
                { id: { contains: q.q, mode: "insensitive" } },
                { customerName: { contains: q.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [orders, count, all, pending, processing, ready] =
        await Promise.all([
          db.order.findMany({
            where,
            include: orderInclude,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          db.order.count({ where }),
          db.order.count({ where: base }),
          db.order.count({
            where: {
              ...base,
              paymentSubmissions: { some: { status: "SUBMITTED" } },
            },
          }),
          db.order.count({
            where: { ...base, items: { some: { pickupStatus: "PROCESSING" } } },
          }),
          db.order.count({
            where: {
              ...base,
              items: { some: { pickupStatus: "READY_FOR_PICKUP" } },
            },
          }),
        ]);
      res.json({
        range: { from: r.from, to: r.to },
        orders: orders.map(orderDto),
        pagination: pagination(q.page, q.pageSize, count),
        summary: { total: all, pending, processing, ready },
      });
    };
  app.get("/api/orders", auth, orderList(false));
  app.get("/api/admin/orders", admin, orderList(true));
  const orderDetail = (isAdmin: boolean): RequestHandler =>
    async (req, res) => {
      const o = await db.order.findFirst({
        where: {
          id: id(req),
          ...(!isAdmin ? { userId: req.session.userId } : {}),
        },
        include: orderInclude,
      });
      if (!o) return fail("Order not found", 404);
      res.json({ order: orderDto(o) });
    };
  app.get("/api/orders/:id", auth, orderDetail(false));
  app.get("/api/admin/orders/:id", admin, orderDetail(true));

  app.get(
    "/api/admin/payment-submissions",
    admin,
    async (req, res) => {
      const q = pageSchema
          .extend({
            status: z.enum(["SUBMITTED", "VERIFIED", "REJECTED"]).optional(),
            phase: z.enum(["INITIAL", "BALANCE"]).optional(),
          })
          .parse(req.query),
        r = dateRange(q.from, q.to, true);
      const base: Prisma.PaymentSubmissionWhereInput = {
        ...(r.lower || r.upper
          ? { submittedAt: { gte: r.lower, lt: r.upper } }
          : {}),
      };
      const where: Prisma.PaymentSubmissionWhereInput = {
        ...base,
        ...(q.status ? { status: q.status } : {}),
        ...(q.phase ? { phase: q.phase } : {}),
        ...(q.q
          ? {
              order: {
                OR: [
                  { id: { contains: q.q, mode: "insensitive" } },
                  { customerName: { contains: q.q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      };
      const [rows, count, pending, approved, rejected] = await Promise.all([
        db.paymentSubmission.findMany({
          where,
          include: {
            order: { select: { customerName: true, customerPhone: true } },
            reviewer: { select: { name: true } },
          },
          orderBy: { submittedAt: "desc" },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        db.paymentSubmission.count({ where }),
        db.paymentSubmission.count({ where: { ...base, status: "SUBMITTED" } }),
        db.paymentSubmission.count({ where: { ...base, status: "VERIFIED" } }),
        db.paymentSubmission.count({ where: { ...base, status: "REJECTED" } }),
      ]);
      res.json({
        range: { from: r.from, to: r.to },
        submissions: rows.map(({ proofKey: _key, ...s }) => s),
        pagination: pagination(q.page, q.pageSize, count),
        summary: { pending, approved, rejected },
      });
    },
  );
  app.get(
    "/api/admin/payment-submissions/:id",
    admin,
    async (req, res) => {
      const s = await db.paymentSubmission.findUniqueOrThrow({
        where: { id: id(req) },
        include: {
          order: { include: orderInclude },
          reviewer: { select: { name: true } },
        },
      });
      const { proofKey: _key, order, ...submission } = s;
      res.json({ submission, order: orderDto(order) });
    },
  );

  const customerCte = Prisma.sql`WITH ot AS(SELECT order_id,SUM(unit_price*quantity) AS value FROM order_items GROUP BY order_id), os AS(SELECT o.user_id,COUNT(*)::int AS orders,COUNT(*) FILTER(WHERE payment_status IN ('PAID','PARTIALLY_PAID'))::int AS paid_orders,COALESCE(SUM(ot.value) FILTER(WHERE payment_status IN ('PAID','PARTIALLY_PAID')),0) AS confirmed_value,MAX(o.created_at) AS last_order,BOOL_OR(EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.batch_id IS NOT NULL) AND payment_status IN ('PAID','PARTIALLY_PAID')) AS batch_buyer FROM orders o JOIN ot ON ot.order_id=o.id GROUP BY o.user_id), spent AS(SELECT o.user_id,SUM(s.amount) AS paid FROM payment_submissions s JOIN orders o ON o.id=s.order_id WHERE s.status='VERIFIED' GROUP BY o.user_id)`;
  const customerSelect = Prisma.sql`SELECT u.id,u.name,u.email,u.created_at AS "createdAt",COALESCE(os.orders,0)::int AS orders,COALESCE(os.paid_orders,0)::int AS "paidOrders",COALESCE(spent.paid,0)::text AS "totalSpent",os.last_order AS "lastOrder" FROM users u LEFT JOIN os ON os.user_id=u.id LEFT JOIN spent ON spent.user_id=u.id`;
  const customers = (exportCsv = false): RequestHandler =>
    async (req, res) => {
      const q = pageSchema
          .extend({
            segment: z.enum(["all", "repeat", "batch"]).default("all"),
          })
          .parse(req.query),
        r = dateRange(q.from, q.to, true);
      const base = Prisma.sql`WHERE u.role='CUSTOMER' ${dates(Prisma.sql`u.created_at`, r)}`;
      const where = Prisma.sql`${base} ${q.q ? Prisma.sql`AND (u.name ILIKE ${"%" + q.q + "%"} OR u.email ILIKE ${"%" + q.q + "%"})` : Prisma.empty} ${q.segment === "repeat" ? Prisma.sql`AND os.paid_orders>=2` : q.segment === "batch" ? Prisma.sql`AND os.batch_buyer` : Prisma.empty}`;
      const count = await db.$queryRaw<any[]>(
        Prisma.sql`${customerCte} SELECT COUNT(*)::int AS total FROM users u LEFT JOIN os ON os.user_id=u.id ${where}`,
      );
      const rows = await db.$queryRaw<any[]>(
        Prisma.sql`${customerCte} ${customerSelect} ${where} ORDER BY u.created_at DESC,u.id ${exportCsv ? Prisma.empty : Prisma.sql`LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`}`,
      );
      if (exportCsv)
        return csv(
          res,
          "ekraf-customers.csv",
          [
            "Name",
            "Email",
            "Orders",
            "Verified spending",
            "Last order",
            "Joined",
          ],
          rows.map((x) => [
            x.name,
            x.email,
            x.orders,
            x.totalSpent,
            x.lastOrder?.toISOString(),
            x.createdAt.toISOString(),
          ]),
        );
      const month = dateRange(undefined, undefined, true);
      const [summary] = await db.$queryRaw<any[]>(
        Prisma.sql`${customerCte} SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE u.created_at>=${month.lower!} AND u.created_at<${month.upper!})::int AS "newThisMonth",COUNT(*) FILTER(WHERE os.paid_orders>=2)::int AS repeat,CASE WHEN SUM(os.paid_orders)>0 THEN SUM(os.confirmed_value)/SUM(os.paid_orders) ELSE 0 END::text AS "averageOrder" FROM users u LEFT JOIN os ON os.user_id=u.id ${base}`,
      );
      res.json({
        range: { from: r.from, to: r.to },
        customers: rows,
        pagination: pagination(q.page, q.pageSize, count[0]?.total ?? 0),
        summary,
      });
    };
  app.get("/api/admin/customers/export", admin, customers(true));
  app.get("/api/admin/customers", admin, customers());
  app.get(
    "/api/admin/customers/:id",
    admin,
    async (req, res) => {
      const rows = await db.$queryRaw<any[]>(
        Prisma.sql`${customerCte} ${customerSelect} WHERE u.role='CUSTOMER' AND u.id=${id(req)}`,
      );
      if (!rows[0]) return fail("Customer not found", 404);
      res.json({ customer: rows[0] });
    },
  );

  app.get(
    "/api/admin/dashboard",
    admin,
    async (req, res) => {
      const q = pageSchema.parse(req.query),
        r = dateRange(q.from, q.to, true),
        lower = r.lower!,
        upper = r.upper!,
        duration = upper.getTime() - lower.getTime(),
        previous = new Date(lower.getTime() - duration);
      const [money] = await db.$queryRaw<any[]>(
        Prisma.sql`SELECT COALESCE(SUM(amount) FILTER(WHERE reviewed_at>=${lower}),0)::text AS received,COALESCE(SUM(amount) FILTER(WHERE reviewed_at<${lower}),0)::text AS previous FROM payment_submissions WHERE status='VERIFIED' AND reviewed_at>=${previous} AND reviewed_at<${upper}`,
      );
      const series = await db.$queryRaw<any[]>(
        Prisma.sql`WITH days AS(SELECT generate_series(${r.from!}::date,${r.to!}::date,'1 day'::interval)::date AS day), payments AS(SELECT ((reviewed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS day,SUM(amount) AS amount FROM payment_submissions WHERE status='VERIFIED' AND reviewed_at>=${lower} AND reviewed_at<${upper} GROUP BY 1) SELECT days.day::text AS date,COALESCE(payments.amount,0)::text AS amount FROM days LEFT JOIN payments USING(day) ORDER BY days.day`,
      );
      const [orders, pending, active, closing, low, recent, outstanding] =
        await Promise.all([
          db.order.count({ where: { createdAt: { gte: lower, lt: upper } } }),
          db.paymentSubmission.count({ where: { status: "SUBMITTED" } }),
          db.batch.count({
            where: {
              status: "OPEN",
              opensAt: { lte: new Date() },
              closesAt: { gt: new Date() },
            },
          }),
          db.batch.findMany({
            where: {
              status: "OPEN",
              closesAt: {
                gt: new Date(),
                lte: new Date(Date.now() + 3 * 86400000),
              },
            },
            include: { product: { select: { name: true } } },
            orderBy: { closesAt: "asc" },
            take: 5,
          }),
          db.$queryRaw<any[]>(
            Prisma.sql`SELECT COUNT(*)::int AS count FROM products p WHERE p.selling_type='CONTINUOUS' AND p.status='PUBLISHED' AND (SELECT COALESCE(SUM(on_hand-reserved),0) FROM product_variants v WHERE v.product_id=p.id AND v.active) BETWEEN 1 AND 5`,
          ),
          db.order.findMany({
            where: { createdAt: { gte: lower, lt: upper } },
            include: orderInclude,
            orderBy: { createdAt: "desc" },
            take: 5,
          }),
          db.$queryRaw<any[]>(
            Prisma.sql`WITH totals AS(SELECT order_id,SUM(unit_price*quantity) AS amount FROM order_items GROUP BY order_id),paid AS(SELECT order_id,SUM(amount) AS amount FROM payment_submissions WHERE status='VERIFIED' GROUP BY order_id) SELECT COALESCE(SUM(t.amount-COALESCE(p.amount,0)),0)::text AS amount FROM orders o JOIN totals t ON t.order_id=o.id LEFT JOIN paid p ON p.order_id=o.id WHERE o.payment_status='PARTIALLY_PAID' ${dates(Prisma.sql`o.created_at`, r)}`,
          ),
        ]);
      const closingCount = await db.batch.count({
        where: {
          status: "OPEN",
          closesAt: {
            gt: new Date(),
            lte: new Date(Date.now() + 3 * 86400000),
          },
        },
      });
      const prior = new Prisma.Decimal(money.previous),
        received = new Prisma.Decimal(money.received);
      res.json({
        range: { from: r.from, to: r.to },
        received: money.received,
        previous: money.previous,
        changePercent: prior.isZero()
          ? null
          : received
              .sub(prior)
              .div(prior)
              .mul(100)
              .toDecimalPlaces(1)
              .toNumber(),
        orders,
        pending,
        activeBatches: active,
        closing,
        closingCount,
        lowStock: low[0]?.count ?? 0,
        outstanding: outstanding[0]?.amount ?? "0",
        series,
        recentOrders: recent.map(orderDto),
      });
    },
  );
}
