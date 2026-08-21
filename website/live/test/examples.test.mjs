import assert from "node:assert/strict";
import test from "node:test";

import { EXAMPLES } from "../examples.mjs";

test("live elliptic examples exercise the production smalljac coefficient path", () => {
  for (const id of ["elliptic-lseries", "complex-plot"]) {
    const example = EXAMPLES.find((entry) => entry.id === id);
    assert.ok(example, `missing ${id} example`);
    assert.match(example.source, /EllipticCurve\(\[1, 2, 3, 4, 999\]\)/);
  }
});

test("live graph examples cover plotting and automorphisms", () => {
  const plot = EXAMPLES.find((entry) => entry.id === "random-graph-plot");
  const automorphisms = EXAMPLES.find(
    (entry) => entry.id === "graph-automorphisms",
  );
  assert.match(plot?.source ?? "", /graphs\.RandomGNP\(30, \.1\)/);
  assert.match(plot?.source ?? "", /g\.plot\(\)/);
  assert.match(automorphisms?.source ?? "", /graphs\.RandomGNP\(20, \.2\)/);
  assert.match(automorphisms?.source ?? "", /g\.automorphism_group\(\)/);
});
