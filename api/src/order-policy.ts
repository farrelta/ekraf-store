export type RoleName = "CUSTOMER" | "ADMIN";
export type PaymentState = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";
export type FulfillmentState = "PENDING" | "PROCESSING" | "READY_FOR_PICKUP" | "COMPLETED" | "CANCELLED";
export function canViewOrder(role: RoleName, viewerId: string, ownerId: string): boolean {
  return role === "ADMIN" || viewerId === ownerId;
}
export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return from === "PENDING" && ["PAID", "CANCELLED", "EXPIRED"].includes(to);
}
export function canTransitionFulfillment(from: FulfillmentState, to: FulfillmentState): boolean {
  return (from === "PROCESSING" && to === "READY_FOR_PICKUP") || (from === "READY_FOR_PICKUP" && to === "COMPLETED");
}
