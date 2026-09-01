// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  publicNumericalModules,
  validateNumericalBrowserClosure,
} = require("../../../scripts/check-numerical-browser-closure.cjs");

function write(filename, contents = "pass\n") {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-numerical-browser-"));
  for (const name of [
    "sagejs/numerics/__init__.py",
    "sagejs/numerics/roots.py",
    "sagejs/numerics/_internal.py",
    "sagejs/numerics/optimization/__init__.py",
    "sagejs/numerics/optimization/visualization.py",
    "sagejs/numerics/optimization/_core.py",
    "sagejs/numerics/optimization/qualification/oracle.py",
    "sagejs/numerics/frontends/__init__.py",
    "sagejs/numerics/frontends/portable.py",
  ]) write(join(root, "src", "lib", name));
  return root;
}

test("every numerical domain and dynamic public entry point is an explicit root", () => {
  const root = fixture();
  try {
    const expected = [
      "sagejs.numerics",
      "sagejs.numerics.frontends",
      "sagejs.numerics.frontends.portable",
      "sagejs.numerics.optimization",
      "sagejs.numerics.optimization.visualization",
      "sagejs.numerics.roots",
    ];
    assert.deepEqual(publicNumericalModules(root), expected);
    assert.throws(
      () => validateNumericalBrowserClosure({
        repositoryRoot: root,
        manifest: { imports: expected.slice(0, -1) },
      }),
      /sagejs\.numerics\.roots/,
    );
    assert.deepEqual(
      validateNumericalBrowserClosure({
        repositoryRoot: root,
        manifest: { imports: expected },
      }),
      { explicitRoots: expected.length, publicModules: expected.length },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated browser bundles retain and compile every explicit root", () => {
  const root = fixture();
  try {
    const expected = publicNumericalModules(root);
    const completeBundle = {
      roots: { package: [...expected] },
      modules: Object.fromEntries(expected.map((name) => [name, {}])),
    };
    assert.deepEqual(
      validateNumericalBrowserClosure({
        repositoryRoot: root,
        manifest: { imports: expected },
        bundle: completeBundle,
      }),
      { explicitRoots: expected.length, publicModules: expected.length },
    );
    const missingRoot = structuredClone(completeBundle);
    missingRoot.roots.package.pop();
    assert.throws(
      () => validateNumericalBrowserClosure({
        repositoryRoot: root,
        manifest: { imports: expected },
        bundle: missingRoot,
      }),
      /not retained as package roots/,
    );
    const missingModule = structuredClone(completeBundle);
    delete missingModule.modules[expected.at(-1)];
    assert.throws(
      () => validateNumericalBrowserClosure({
        repositoryRoot: root,
        manifest: { imports: expected },
        bundle: missingModule,
      }),
      /not compiled into the lazy bundle/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate browser roots fail closed", () => {
  const root = fixture();
  try {
    const expected = publicNumericalModules(root);
    assert.throws(
      () => validateNumericalBrowserClosure({
        repositoryRoot: root,
        manifest: { imports: [...expected, expected[0]] },
      }),
      /duplicate roots/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
