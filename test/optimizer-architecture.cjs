// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "../tools/python/optimizer");

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) :
      entry.isFile() && entry.name.endsWith(".ts") ? [filename] : [];
  });
}

function relative(filename) {
  return path.relative(root, filename).replaceAll(path.sep, "/");
}

function imports(filename) {
  const source = fs.readFileSync(filename, "utf8");
  return [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)]
    .map((match) => match[1]);
}

test("optimizer extension layers have one-way dependencies", () => {
  const violations = [];
  for (const filename of files(root)) {
    const name = relative(filename);
    for (const specifier of imports(filename)) {
      if (specifier.includes("/passes/") && name !== "catalog.ts") {
        violations.push(`${name} imports pass implementation ${specifier}`);
      }
      if (name.startsWith("analyses/") &&
          !specifier.startsWith("../ir/") &&
          !specifier.startsWith("../analyses/")) {
        violations.push(`${name} has non-analysis dependency ${specifier}`);
      }
      if (name.startsWith("canonicalize/") &&
          /(passes|domains|targets|verifier)/.test(specifier)) {
        violations.push(`${name} depends on later layer ${specifier}`);
      }
      if (name.startsWith("targets/") &&
          /(passes|canonicalize|domains)/.test(specifier)) {
        violations.push(`${name} depends on semantic layer ${specifier}`);
      }
      if (name === "verifier.ts" &&
          /(analyses|canonicalize|passes)/.test(specifier)) {
        violations.push(`${name} reuses transformation logic ${specifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("the immutable catalog is the only pass composition point", () => {
  const { optimizerCatalog } = require(
    "../dist/tools/python/optimizer/catalog.js",
  );
  assert.equal(Object.isFrozen(optimizerCatalog), true);
  assert.equal(Object.isFrozen(optimizerCatalog.plugins), true);
  assert.deepEqual(
    optimizerCatalog.plugins.map((plugin) => [
      plugin.domainId,
      plugin.priority,
      plugin.claimSemantics,
    ]),
    [
      ["strict-binary64", 200, "exclusive"],
      ["closed-ring", 100, "exclusive"],
    ],
  );
  for (const plugin of optimizerCatalog.plugins) {
    assert.equal(Object.isFrozen(plugin), true);
    assert.equal(plugin.id, plugin.pass.id);
  }
});

test("every registered lowering has one verifier and one Python emitter", () => {
  const loweringSource = fs.readFileSync(
    path.join(root, "lowerings.ts"),
    "utf8",
  );
  const catalogSource = fs.readFileSync(path.join(root, "catalog.ts"), "utf8");
  const dispatcherSource = fs.readFileSync(
    path.join(__dirname, "../src/output/optimizer/dispatcher.py"),
    "utf8",
  );
  const verifierCatalogSource = fs.readFileSync(
    path.join(root, "verifiers/catalog.ts"),
    "utf8",
  );
  const registered = [...loweringSource.matchAll(/\bid:\s*"(v8\.[^"]+)"/g)]
    .map((match) => match[1]).sort();
  const owned = [...catalogSource.matchAll(/"(v8\.[^"]+)"/g)]
    .map((match) => match[1]).sort();
  const emitted = [...dispatcherSource.matchAll(/^\s*"(v8\.[^"]+)":/gm)]
    .map((match) => match[1]).sort();
  assert.deepEqual(registered, [
    "v8.closed-ring-loop.v1",
    "v8.strict-float-loop.v1",
  ]);
  assert.deepEqual(owned, registered);
  assert.deepEqual(emitted, registered);
  for (const kind of ["closed-ring-region", "strict-float-region"]) {
    assert.equal(
      verifierCatalogSource.match(new RegExp(`"${kind}"`, "g"))?.length,
      1,
      `${kind} must belong to exactly one verifier plugin`,
    );
  }
});
