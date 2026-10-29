import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionFulfillment, canTransitionPayment, canViewOrder } from "../dist/order-policy.js";
test("customers see only their own orders and admins can review all orders", () => {
  assert.equal(canViewOrder("CUSTOMER", "a", "a"), true);
  assert.equal(canViewOrder("CUSTOMER", "b", "a"), false);
  assert.equal(canViewOrder("ADMIN", "admin", "a"), true);
  assert.equal(canViewOrder("TREASURER", "other", "a"), false);
});
test("payment transitions support deposits and reject terminal changes", () => {
  assert.equal(canTransitionPayment("PENDING","PARTIALLY_PAID"),true);
  assert.equal(canTransitionPayment("PARTIALLY_PAID","PAID"),true);
  assert.equal(canTransitionPayment("PARTIALLY_PAID","EXPIRED"),false);
  for (const to of ["PAID","CANCELLED","EXPIRED"]) assert.equal(canTransitionPayment("PENDING",to),true);
  for (const from of ["PAID","CANCELLED","EXPIRED"]) assert.equal(canTransitionPayment(from,"PAID"),false);
  assert.equal(canTransitionPayment("PAID","REFUNDED"),false);
});
test("pickup has only processing, ready, and collected transitions", () => {
  assert.equal(canTransitionFulfillment("PROCESSING","READY_FOR_PICKUP"),true);
  assert.equal(canTransitionFulfillment("READY_FOR_PICKUP","COMPLETED"),true);
  assert.equal(canTransitionFulfillment("PROCESSING","SHIPPED"),false);
  assert.equal(canTransitionFulfillment("PENDING","COMPLETED"),false);
});
