import { Prisma, PrismaClient } from "./generated/prisma/client.js";

export const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
export const orderInclude = { items: true, paymentSubmissions: { orderBy: { submittedAt: "desc" as const } }, batch: true } satisfies Prisma.OrderInclude;
export type StoredOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export const total = (items: { unitPrice: Prisma.Decimal; quantity: number }[]) => items.reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));
export function orderDto(order: StoredOrder) {
  const { userId: _owner, idempotencyKey: _key, paymentSubmissions, ...data } = order;
  return { ...data, total: total(order.items).toFixed(2), paymentSubmissions: paymentSubmissions.map(({ proofKey: _proof, ...submission }) => submission) };
}
export async function transaction<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) { if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error; }
  }
}
export async function move(tx: Prisma.TransactionClient, data: {
  variantId: string; orderId?: string; batchId?: string; actorId?: string;
  type: "RESERVATION" | "RELEASE" | "RECEIPT" | "SALE" | "RETURN" | "ADJUSTMENT";
  onHandDelta: number; reservedDelta: number; reason: string;
}) {
  const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: data.variantId } });
  if (variant.onHand + data.onHandDelta < 0 || variant.reserved + data.reservedDelta < 0 || variant.reserved + data.reservedDelta > variant.onHand + data.onHandDelta) fail("Insufficient available stock");
  await tx.productVariant.update({ where: { id: variant.id }, data: { onHand: { increment: data.onHandDelta }, reserved: { increment: data.reservedDelta } } });
  await tx.inventoryMovement.create({ data });
}
export function quantities(items: { variantId: string; quantity: number }[]) {
  const grouped = new Map<string, number>();
  for (const item of items) grouped.set(item.variantId, (grouped.get(item.variantId) ?? 0) + item.quantity);
  return [...grouped].sort(([a], [b]) => a.localeCompare(b));
}
export async function allocateBatch(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (!order.batchId || order.paymentStatus !== "PAID" || order.pickupStatus !== "PROCESSING") return;
  const needs: { variantId: string; quantity: number }[] = [];
  for (const [variantId, quantity] of quantities(order.items)) {
    const held = await tx.inventoryMovement.aggregate({ where: { orderId, variantId }, _sum: { reservedDelta: true } });
    const needed = quantity - (held._sum.reservedDelta ?? 0);
    if (needed <= 0) continue;
    const received = await tx.inventoryMovement.aggregate({ where: { batchId: order.batchId, variantId }, _sum: { onHandDelta: true, reservedDelta: true } });
    if ((received._sum.onHandDelta ?? 0) - (received._sum.reservedDelta ?? 0) < needed) return;
    needs.push({ variantId, quantity: needed });
  }
  for (const item of needs) await move(tx, { variantId: item.variantId, orderId, batchId: order.batchId, type: "RESERVATION", onHandDelta: 0, reservedDelta: item.quantity, reason: "Allocate received batch stock" });
  await tx.order.update({ where: { id: orderId }, data: { pickupStatus: "READY_FOR_PICKUP" } });
}
export async function releaseOrder(tx: Prisma.TransactionClient, orderId: string, state: "CANCELLED" | "EXPIRED", actorId?: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (order.paymentStatus !== "PENDING") fail("Only unpaid orders can be cancelled or expired");
  const pending = await tx.paymentSubmission.count({ where: { orderId, status: "SUBMITTED" } });
  if (pending) fail("Payment proof is awaiting review");
  if (!order.batchId) for (const [variantId, quantity] of quantities(order.items)) await move(tx, { variantId, orderId, actorId, type: "RELEASE", onHandDelta: 0, reservedDelta: -quantity, reason: state });
  await tx.order.update({ where: { id: orderId }, data: { paymentStatus: state, pickupStatus: "CANCELLED" } });
}
export async function expireOrders(db: PrismaClient) {
  const expired = await db.order.findMany({ where: { paymentStatus: "PENDING", expiresAt: { lte: new Date() }, paymentSubmissions: { none: { status: "SUBMITTED" } } }, select: { id: true }, take: 100 });
  for (const order of expired) await transaction(db, async tx => {
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (current.paymentStatus !== "PENDING" || current.expiresAt > new Date()) return;
    if (await tx.paymentSubmission.count({ where: { orderId: order.id, status: "SUBMITTED" } })) return;
    await releaseOrder(tx, order.id, "EXPIRED");
  });
}
