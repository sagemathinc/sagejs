"use strict";

const unit = [
  "test/test-manifest.test.cjs",
  "test/completer.cjs",
  "test/module-cache.cjs",
  "test/typed-math-lowering.cjs",
  "test/runtime-intrinsics.cjs",
  "test/baselib-boundaries.cjs",
  "test/documentation.cjs",
  "test/magma.cjs",
  "test/foreign-languages.cjs",
];

const integration = [
  "test/cli-smoke.cjs",
  "test/time-module.cjs",
  "test/numpy-module.cjs",
  "test/kernel.cjs",
  "test/graphics.cjs",
  "test/graphics3d.cjs",
  "test/graphics-export.cjs",
  "test/approximate-polynomial.cjs",
  "test/padics.cjs",
  "test/groups.cjs",
  "test/dirichlet.cjs",
  "test/modular.cjs",
  "test/modular-symbols.cjs",
  "test/elliptic-curves.cjs",
  "test/number-fields.cjs",
  "test/polynomial-ideals.cjs",
  "test/symbolic.cjs",
  "test/algebraic-numbers.cjs",
  "test/spectral-linear-algebra.cjs",
  "test/polyglot.cjs",
];

// Tests which exercise the compiler/runtime without requiring the optional
// native mathematics addon.  This tier is useful during platform bring-up;
// unit remains the complete fast developer tier once the addon is available.
const portable = unit.filter(
  (filename) =>
    filename !== "test/foreign-languages.cjs" &&
    filename !== "test/magma.cjs",
);

module.exports = {
  portable,
  unit,
  integration,
  all: [...unit, ...integration],
};
