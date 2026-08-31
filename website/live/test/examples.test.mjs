import assert from "node:assert/strict";
import test from "node:test";

import { EXAMPLES } from "../examples.mjs";

test("live interact examples cover sliders and editable Sage expressions", () => {
  const slider = EXAMPLES.find(
    (entry) => entry.id === "interactive-symbolic-plot",
  );
  const expression = EXAMPLES.find(
    (entry) => entry.id === "interactive-function-explorer",
  );
  assert.match(slider?.source ?? "", /power=slider/);
  assert.match(expression?.source ?? "", /input_box\('x\^3 - 2\*x'/);
  assert.match(expression?.source ?? "", /f\.derivative\(x\)/);
});

test("the core widget gallery covers linked, output, error, and binary controls", () => {
  const gallery = EXAMPLES.find(
    (entry) => entry.id === "ipywidgets-core-gallery",
  );
  assert.match(gallery?.source ?? "", /widgets\.jslink/);
  assert.match(gallery?.source ?? "", /widgets\.Output/);
  assert.match(gallery?.source ?? "", /raise ValueError\('deliberate widget error'\)/);
  assert.match(gallery?.source ?? "", /widgets\.FileUpload/);
  assert.match(gallery?.source ?? "", /\.tobytes\(\)/);
});

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

test("Cape Man example composes and transforms 3D surfaces", () => {
  const example = EXAMPLES.find((entry) => entry.id === "cape-man");
  assert.ok(example, "missing Cape Man example");
  assert.match(example.source, /S = sphere/);
  assert.match(example.source, /P = plot3d/);
  assert.match(example.source, /P\.scale\(\.2\)/);
  assert.match(example.source, /S\.translate\(1, 0, 0\)/);
  assert.match(example.source, /aspect_ratio=\[1, 1, 1\]/);
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
