import test from "node:test";
import assert from "node:assert/strict";
import { money } from "../src/features/store/types.ts";

const display = value => money(value).replace(/\s/g, " ");
test("IDR prices retain their cents using Indonesian separators", () => {
  assert.equal(display("12001.01"), "Rp 12.001,01");
  assert.equal(display(12001.1), "Rp 12.001,10");
  assert.equal(display("12001.99"), "Rp 12.001,99");
  assert.equal(display(12001.01 * 3), "Rp 36.003,03");
});
test("whole rupiah amounts keep the existing compact format", () => {
  assert.equal(display("12001.00"), "Rp 12.001");
  assert.equal(display(85000), "Rp 85.000");
  assert.equal(display(0), "Rp 0");
});
