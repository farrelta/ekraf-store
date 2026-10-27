import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionFulfillment, canTransitionPayment, canViewOrder } from "../dist/order-policy.js";

test("customers can only view their own orders while staff can review them", () => {
  assert.equal(canViewOrder("CUSTOMER", "customer-a", "customer-a"), true);
  assert.equal(canViewOrder("CUSTOMER", "customer-b", "customer-a"), false);
  assert.equal(canViewOrder("TREASURER", "treasurer", "customer-a"), true);
});

test("payment decisions reject invalid and terminal transitions", () => {
  assert.equal(canTransitionPayment("PENDING", "PAID"), true);
  assert.equal(canTransitionPayment("PENDING", "REJECTED"), true);
  assert.equal(canTransitionPayment("PENDING", "REFUNDED"), false);
  assert.equal(canTransitionPayment("REJECTED", "PAID"), false);
  assert.equal(canTransitionPayment("PAID", "REFUNDED"), true);
  assert.equal(canTransitionPayment("EXPIRED", "PAID"), false);
});

test("fulfillment can advance only along the supported path", () => {
  assert.equal(canTransitionFulfillment("PROCESSING", "READY_FOR_PICKUP"), true);
  assert.equal(canTransitionFulfillment("PROCESSING", "SHIPPED"), true);
  assert.equal(canTransitionFulfillment("READY_FOR_PICKUP", "COMPLETED"), true);
  assert.equal(canTransitionFulfillment("PENDING", "COMPLETED"), false);
  assert.equal(canTransitionFulfillment("SHIPPED", "READY_FOR_PICKUP"), false);
});
