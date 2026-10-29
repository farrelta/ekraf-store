import { Prisma, PrismaClient } from "./generated/prisma/client.js";
export const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
export const orderInclude = { items: { include: { batch: true } }, paymentSubmissions: { orderBy: { submittedAt: "desc" as const } } } satisfies Prisma.OrderInclude;
export type StoredOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export const total = (items: { unitPrice: Prisma.Decimal; quantity: number }[]) => items.reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));
export function paymentSummary(order: { initialAmount: Prisma.Decimal; items: { unitPrice: Prisma.Decimal; quantity: number }[]; paymentSubmissions: { status: string; amount: Prisma.Decimal }[] }) {
  const amount = total(order.items);
  const paid = order.paymentSubmissions.filter(s => s.status === "VERIFIED").reduce((sum,s) => sum.add(s.amount), new Prisma.Decimal(0));
  const remaining = Prisma.Decimal.max(0, amount.sub(paid));
  const phase = paid.isZero() ? "INITIAL" as const : "BALANCE" as const;
  return { total: amount.toFixed(2), paidAmount: paid.toFixed(2), remainingBalance: remaining.toFixed(2), amountDue: (phase === "INITIAL" ? order.initialAmount : remaining).toFixed(2), phase };
}
export function orderDto(order: StoredOrder) {
  const { userId: _owner, idempotencyKey: _key, paymentSubmissions, ...data } = order;
  const pickupStatus = order.items.every(i => i.pickupStatus === "COMPLETED") ? "COMPLETED" : order.items.every(i => i.pickupStatus === "CANCELLED") ? "CANCELLED" : order.items.some(i => i.pickupStatus === "READY_FOR_PICKUP") ? "READY_FOR_PICKUP" : order.items.some(i => i.pickupStatus === "PROCESSING") ? "PROCESSING" : "PENDING";
  return { ...data, initialAmount: order.initialAmount.toFixed(2), ...paymentSummary(order), pickupStatus, paymentSubmissions: paymentSubmissions.map(({ proofKey: _proof, ...s }) => s) };
}
export async function transaction<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) { if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error; }
  }
}
export async function move(tx: Prisma.TransactionClient, data: {
  variantId: string; orderId?: string; orderItemId?: string; batchId?: string; actorId?: string;
  type: "RESERVATION" | "RELEASE" | "RECEIPT" | "SALE" | "RETURN" | "ADJUSTMENT";
  onHandDelta: number; reservedDelta: number; reason: string;
}) {
  const v = await tx.productVariant.findUniqueOrThrow({ where: { id: data.variantId } });
  if (v.onHand + data.onHandDelta < 0 || v.reserved + data.reservedDelta < 0 || v.reserved + data.reservedDelta > v.onHand + data.onHandDelta) fail("Insufficient available stock");
  await tx.productVariant.update({ where: { id: v.id }, data: { onHand: { increment: data.onHandDelta }, reserved: { increment: data.reservedDelta } } });
  await tx.inventoryMovement.create({ data: { ...data, variantSku: v.sku } });
}
export function quantities(items: { variantId: string; quantity: number }[]) {
  const grouped = new Map<string, number>();
  for (const i of items) grouped.set(i.variantId, (grouped.get(i.variantId) ?? 0) + i.quantity);
  return [...grouped].sort(([a], [b]) => a.localeCompare(b));
}
export async function allocateBatch(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (!["PAID","PARTIALLY_PAID"].includes(order.paymentStatus)) return;
  for (const item of order.items.filter(i => i.batchId && i.pickupStatus === "PROCESSING")) {
    const received = await tx.inventoryMovement.aggregate({ where: { batchId: item.batchId, variantId: item.variantId }, _sum: { onHandDelta: true, reservedDelta: true } });
    if ((received._sum.onHandDelta ?? 0) - (received._sum.reservedDelta ?? 0) < item.quantity) continue;
    await move(tx, { variantId: item.variantId, orderId, orderItemId: item.id, batchId: item.batchId!, type: "RESERVATION", onHandDelta: 0, reservedDelta: item.quantity, reason: "Allocate received batch stock" });
    await tx.orderItem.update({ where: { id: item.id }, data: { pickupStatus: "READY_FOR_PICKUP" } });
  }
}
export async function releaseOrder(tx: Prisma.TransactionClient, orderId: string, state: "CANCELLED" | "EXPIRED", actorId?: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (order.paymentStatus !== "PENDING") fail("Only unpaid orders can be cancelled or expired");
  if (await tx.paymentSubmission.count({ where: { orderId, status: "SUBMITTED" } })) fail("Payment proof is awaiting review");
  for (const item of order.items.filter(i => !i.batchId)) await move(tx, { variantId: item.variantId, orderId, orderItemId: item.id, actorId, type: "RELEASE", onHandDelta: 0, reservedDelta: -item.quantity, reason: state });
  await tx.orderItem.updateMany({ where: { orderId }, data: { pickupStatus: "CANCELLED" } });
  await tx.order.update({ where: { id: orderId }, data: { paymentStatus: state } });
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
