export type RoleName = "CUSTOMER" | "ADMIN" | "TREASURER";
export type PaymentState = "PENDING" | "PAID" | "REJECTED" | "REFUNDED" | "EXPIRED";
export type FulfillmentState = "PENDING" | "PROCESSING" | "READY_FOR_PICKUP" | "SHIPPED" | "COMPLETED" | "CANCELLED";

export function canViewOrder(role: RoleName, viewerId: string, ownerId: string): boolean {
  return role !== "CUSTOMER" || viewerId === ownerId;
}

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return (from === "PENDING" && (to === "PAID" || to === "REJECTED" || to === "EXPIRED")) ||
    (from === "PAID" && to === "REFUNDED");
}

export function canTransitionFulfillment(from: FulfillmentState, to: FulfillmentState): boolean {
  const allowed: Partial<Record<FulfillmentState, FulfillmentState[]>> = {
    PROCESSING: ["READY_FOR_PICKUP", "SHIPPED"],
    READY_FOR_PICKUP: ["COMPLETED"],
    SHIPPED: ["COMPLETED"]
  };
  return allowed[from]?.includes(to) ?? false;
}
