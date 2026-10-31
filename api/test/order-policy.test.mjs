import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionFulfillment } from "../dist/order-policy.js";
test("pickup has only processing, ready, and collected transitions", () => {
  assert.equal(canTransitionFulfillment("PROCESSING","READY_FOR_PICKUP"),true);
  assert.equal(canTransitionFulfillment("READY_FOR_PICKUP","COMPLETED"),true);
  assert.equal(canTransitionFulfillment("PROCESSING","SHIPPED"),false);
  assert.equal(canTransitionFulfillment("PENDING","COMPLETED"),false);
});
