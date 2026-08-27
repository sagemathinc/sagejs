import assert from "node:assert/strict";
import test from "node:test";

import { EXAMPLES } from "../examples.mjs";

test("live elliptic examples exercise the production smalljac coefficient path", () => {
  for (const id of ["elliptic-lseries", "complex-plot"]) {
    const example = EXAMPLES.find((entry) => entry.id === id);
    assert.ok(example, `missing ${id} example`);
    assert.match(example.source, /EllipticCurve\(\[1, 2, 3, 4, 999\]\)/);
  }
  const plot = EXAMPLES.find((entry) => entry.id === "complex-plot");
  assert.match(plot?.source ?? "", /plot_points=50/);
  assert.doesNotMatch(plot?.source ?? "", /plot_points=100/);
});

test("live polyglot examples exercise every public browser frontend", () => {
  const expected = new Map([
    ["python-language", "python"],
    ["magma-language", "magma"],
    ["mathematica-language", "mathematica"],
    ["matlab-language", "matlab"],
    ["maple-language", "maple"],
    ["macaulay2-language", "macaulay2"],
  ]);
  for (const [id, language] of expected) {
    const example = EXAMPLES.find((entry) => entry.id === id);
    assert.ok(example, `missing ${id} example`);
    assert.match(example.source, new RegExp(`^%%${language}\\n`));
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

test("live NumPy example combines vectorization, FFT, and linear algebra", () => {
  const example = EXAMPLES.find(
    (entry) => entry.id === "numpy-signal-recovery",
  );
  assert.ok(example, "missing NumPy signal-recovery example");
  assert.match(example.source, /np\.random\.normal/);
  assert.match(example.source, /np\.fft\.rfft/);
  assert.match(example.source, /np\.linalg\.solve/);
  assert.match(example.source, /np\.matmul/);
});
