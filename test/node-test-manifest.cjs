"use strict";

const unit = [
  "test/test-manifest.test.cjs",
  "test/completer.cjs",
  "test/cowasm-landscape.cjs",
  "test/module-cache.cjs",
  "test/runtime-cache.cjs",
  "test/startup-budget.cjs",
  "test/typed-math-lowering.cjs",
  "test/runtime-intrinsics.cjs",
  "test/lint-authoritative.cjs",
  "test/baselib-boundaries.cjs",
  "test/documentation.cjs",
  "test/magma.cjs",
  "test/foreign-languages.cjs",
  "test/python-syntax-frontend.cjs",
  "test/python-cst-lowerer.cjs",
  "test/browser-compiler-frontend.cjs",
  "test/parallel-development.cjs",
  "test/package-graph.cjs",
  "test/architecture-policy.cjs",
  "test/pnpm-invocation.cjs",
  "test/website.cjs",
  "test/audit-gaps.cjs",
];

const integration = [
  "test/coverage-python-stdlib.cjs",
  "test/coverage-graphics3d.cjs",
  "test/coverage-graphs.cjs",
  "test/native-launcher.cjs",
  "test/cli-smoke.cjs",
  "test/math-module.cjs",
  "test/datetime-module.cjs",
  "test/calendar-module.cjs",
  "test/time-module.cjs",
  "test/os-module.cjs",
  "test/file-io.cjs",
  "test/stdlib-data.cjs",
  "test/stdlib-filesystem.cjs",
  "test/subprocess-module.cjs",
  "test/network-modules.cjs",
  "test/stdlib-utilities.cjs",
  "test/sqlite3.cjs",
  "test/javascript-module.cjs",
  "test/python-packages.cjs",
  "test/python-float-identity.cjs",
  "test/python-runtime-hotpaths.cjs",
  "test/random-module.cjs",
  "test/pickle-module.cjs",
  "test/array-module.cjs",
  "test/operator-module.cjs",
  "test/multiprocessing-module.cjs",
  "test/serialization.cjs",
  "test/numpy-module.cjs",
  "test/kernel.cjs",
  "test/dashboard-examples.cjs",
  "test/jupyter-kernelspec.cjs",
  "test/graphics.cjs",
  "test/graphics3d.cjs",
  "test/graphics-export.cjs",
  "test/approximate-polynomial.cjs",
  "test/padics.cjs",
  "test/groups.cjs",
  "test/graphs.cjs",
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
