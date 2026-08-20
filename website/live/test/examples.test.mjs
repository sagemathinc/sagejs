import assert from "node:assert/strict";
import test from "node:test";

import { EXAMPLES } from "../examples.mjs";

test("live elliptic examples fit the browser coefficient budget", () => {
  for (const id of ["elliptic-lseries", "complex-plot"]) {
    const example = EXAMPLES.find((entry) => entry.id === id);
    assert.ok(example, `missing ${id} example`);
    assert.match(example.source, /EllipticCurve\(\[0, 0, 1, -1, 0\]\)/);
    assert.doesNotMatch(example.source, /EllipticCurve\(\[1, 2, 3, 4, 999\]\)/);
  }
});
