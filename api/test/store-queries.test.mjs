import test from "node:test";
import assert from "node:assert/strict";
import { dateRange, csvCell, pageSchema } from "../dist/store-queries.js";
test("Jakarta day ranges include both calendar days and default across UTC midnight", () => {
  const r = dateRange("2026-10-01", "2026-10-02");
  assert.equal(r.lower.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(r.upper.toISOString(), "2026-10-02T17:00:00.000Z");
  const d = dateRange(
    undefined,
    undefined,
    true,
    new Date("2026-10-31T18:00:00Z"),
  );
  assert.equal(d.from, "2026-11-01");
  assert.equal(d.to, "2026-11-01");
  assert.throws(() => dateRange("2026-02-30", "2026-03-02"));
  assert.throws(() => dateRange("2026-10-05", "2026-10-01"));
  assert.throws(() => dateRange("2020-01-01", "2026-01-01"));
});
test("CSV escapes formulas, separators, quotes and newlines", () => {
  assert.equal(csvCell(" =1+1"), '"\' =1+1"');
  assert.equal(csvCell("@SUM(A1)"), '"\'@SUM(A1)"');
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell(null), '""');
});
test("list pagination defaults to 20 and caps requests at 100", () => {
  assert.deepEqual(pageSchema.parse({}).pageSize, 20);
  assert.throws(() => pageSchema.parse({ pageSize: 101 }));
  assert.throws(() => pageSchema.parse({ page: 0 }));
});
