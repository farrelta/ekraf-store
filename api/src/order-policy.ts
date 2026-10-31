export type FulfillmentState = "PENDING" | "PROCESSING" | "READY_FOR_PICKUP" | "COMPLETED" | "CANCELLED";
export function canTransitionFulfillment(from: FulfillmentState, to: FulfillmentState): boolean {
  return (from === "PROCESSING" && to === "READY_FOR_PICKUP") || (from === "READY_FOR_PICKUP" && to === "COMPLETED");
}
