export type RoleName = "CUSTOMER" | "ADMIN";
export type PaymentState = "PENDING" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "EXPIRED";
export type FulfillmentState = "PENDING" | "PROCESSING" | "READY_FOR_PICKUP" | "COMPLETED" | "CANCELLED";
export function canViewOrder(role: RoleName, viewerId: string, ownerId: string): boolean {
  return role === "ADMIN" || viewerId === ownerId;
}
export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return from === "PENDING" && ["PAID", "PARTIALLY_PAID", "CANCELLED", "EXPIRED"].includes(to) || from === "PARTIALLY_PAID" && to === "PAID";
}
export function canTransitionFulfillment(from: FulfillmentState, to: FulfillmentState): boolean {
  return (from === "PROCESSING" && to === "READY_FOR_PICKUP") || (from === "READY_FOR_PICKUP" && to === "COMPLETED");
}
