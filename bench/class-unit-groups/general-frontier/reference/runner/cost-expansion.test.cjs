"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { select } = require("./prepare-cost-expansion.cjs");
const records = Array.from({ length: 40 }, (_, i) => ({
  label: `8.0.${i + 1}.1`, degree: 8, signature: [0, 4],
  discriminant_absolute: i < 20 ? "1000000000000000000000000000000000000" : "1000000000000",
  coefficients: [String(i), "1"],
}));
const review = (status, ms) => ({ schema: "sagejs.general-frontier-cost-screen-review.v1",
  qualification_evidence: false, rows: [{ label: records[0].label,
    reviewed_status: status, elapsed_milliseconds: ms, receipt_sha256: "a".repeat(64) }] });

test("cost expansion retains censored strata but ignores Sage.js and class answers", () => {
  const a = select({ records }, [review("ok", 1000)]);
  assert.equal(a.selected.length, 12);
  assert.ok(a.selected.every((r) => r.discriminant_absolute === records[0].discriminant_absolute));
  assert.ok(a.selected.every((r) => r.label !== records[0].label));
  const b = select({ records: records.toReversed().map((r) => ({ ...r,
    sagejs_success: false, class_number: "999999" })) }, [review("timeout")]);
  assert.deepEqual(a.selected.map((r) => r.label), b.selected.map((r) => r.label));
  assert.equal(select({ records }, [review("ok", 999)]).selected.length, 0);
  assert.equal(select({ records }, [review("error")]).selected.length, 0);
});

test("cost expansion rejects malformed provenance and invalid budgets", () => {
  assert.throws(() => select({ records }, [review("ok", NaN)]));
  assert.throws(() => select({ records }, [review("new-status")]));
  assert.throws(() => select({ records }, [review("ok", 1000)], 17));
  assert.throws(() => select({ records }, [{ ...review("ok", 1000), qualification_evidence: true }]));
  const bad = review("ok", 1000); bad.rows[0].label = "unknown";
  assert.throws(() => select({ records }, [bad]));
  assert.throws(() => select({ records: [...records, records[0]] }, []));
});
