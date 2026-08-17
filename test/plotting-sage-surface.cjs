#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const surface = JSON.parse(
  readFileSync(
    join(root, "docs/sage-compatibility/plotting/sage-surface.json"),
    "utf8",
  ),
);

test("Sage plotting surface is pinned, exhaustive, and internally exact", () => {
  assert.equal(surface.schema_version, 1);
  assert.equal(surface.authority.name, "SageMath");
  assert.equal(surface.authority.version, "10.9.post1");
  assert.equal(surface.summary.modules_2d, 31);
  assert.equal(surface.summary.modules_3d, 18);
  assert.equal(surface.summary.modules, 49);
  assert.equal(surface.modules.length, 49);

  const expectedModules = [
    ...surface.scope.dimensions["2d"],
    ...surface.scope.dimensions["3d"],
  ];
  assert.deepEqual(
    surface.modules.map(({ name }) => name),
    expectedModules,
  );
  assert.equal(new Set(expectedModules).size, expectedModules.length);
  assert.ok(expectedModules.includes("sage.graphs.graph_plot"));
  assert.ok(expectedModules.includes("sage.plot.graphics"));
  assert.ok(expectedModules.includes("sage.plot.plot3d.introduction"));
  assert.ok(expectedModules.includes("sage.plot.plot3d.transform"));

  let functions = 0;
  let classes = 0;
  let methods = 0;
  let unavailableSignatures = 0;
  const qualifiedNames = new Set();
  for (const module of surface.modules) {
    assert.match(module.source.sha256, /^[0-9a-f]{64}$/);
    assert.ok(module.source.size_bytes > 0);
    assert.ok(["source-file", "installed-extension-binary"].includes(
      module.source.sha256_scope,
    ));
    const names = module.symbols.map(({ name }) => name);
    assert.deepEqual(names, names.toSorted());
    assert.equal(new Set(names).size, names.length);
    for (const symbol of module.symbols) {
      assert.ok(!symbol.name.startsWith("_"));
      assert.ok(!qualifiedNames.has(symbol.qualified_name));
      qualifiedNames.add(symbol.qualified_name);
      assert.ok(["class", "function"].includes(symbol.kind));
      unavailableSignatures += Number(symbol.signature === null);
      if (symbol.kind === "function") {
        functions += 1;
        assert.equal(symbol.methods, undefined);
        continue;
      }
      classes += 1;
      const methodNames = symbol.methods.map(({ name }) => name);
      assert.deepEqual(methodNames, methodNames.toSorted());
      assert.equal(new Set(methodNames).size, methodNames.length);
      methods += symbol.methods.length;
      for (const method of symbol.methods) {
        assert.ok(!method.name.startsWith("_"));
        assert.ok(["class", "instance", "static"].includes(method.descriptor));
        unavailableSignatures += Number(method.signature === null);
      }
    }
  }

  assert.deepEqual(surface.summary, {
    modules: 49,
    modules_2d: 31,
    modules_3d: 18,
    functions,
    classes,
    methods,
    unavailable_signatures: unavailableSignatures,
  });
  assert.ok(functions > 100);
  assert.ok(classes > 80);
  assert.ok(methods > 300);
});
