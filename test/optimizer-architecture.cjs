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
      const resolved = specifier.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier))
        : specifier;
      if (specifier.includes("/passes/") && name !== "catalog.ts") {
        violations.push(`${name} imports pass implementation ${specifier}`);
      }
      if (name.startsWith("analyses/") &&
          !resolved.startsWith("analyses/") &&
          !resolved.startsWith("ir/") &&
          resolved !== "types") {
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
      ["bounded-exact-integer", 300, "exclusive"],
      ["strict-binary64-array", 250, "exclusive"],
      ["strict-binary64", 200, "exclusive"],
      ["prime-residue-modular-batch", 150, "exclusive"],
      ["fixed-extension", 125, "exclusive"],
      ["closed-ring", 100, "exclusive"],
    ],
  );
  for (const plugin of optimizerCatalog.plugins) {
    assert.equal(Object.isFrozen(plugin), true);
    assert.equal(plugin.id, plugin.pass.id);
  }
});

test("diagnostic plugins may report rejected candidates without fake lowerings", () => {
  const { createOptimizerCatalog } = require(
    "../dist/tools/python/optimizer/catalog.js",
  );
  const pass = Object.freeze({
    id: "math.diagnostic-test.v1",
    inputSchema: "sagejs.optimizing-mathematics/v1",
    factsConsumed: [],
    factsProduced: [],
    factsInvalidated: [],
    preserves: [],
    acceptedLevel: "sage-semantic",
    producedLevel: "target",
    guardsIntroduced: [],
    supportedTargets: ["generic"],
    verifier: "verifyOptimizationDecision/v1",
    compilationCostBudget: 1,
    codeSizeBudget: 0,
    requiredEvidence: [],
    run() {},
  });
  const catalog = createOptimizerCatalog([{
    id: pass.id,
    domainId: "diagnostic-test",
    priority: 1,
    claimSemantics: "exclusive",
    loweringIds: [],
    pass,
  }]);
  assert.equal(catalog.plugins[0].loweringIds.length, 0);
});

test("target-neutral fact providers cannot masquerade as executable lowerings", () => {
  const { optimizerFactProviderCatalog } = require(
    "../dist/tools/python/optimizer/fact-provider-catalog.js",
  );
  assert.equal(Object.isFrozen(optimizerFactProviderCatalog), true);
  assert.equal(Object.isFrozen(optimizerFactProviderCatalog.plugins), true);
  assert.deepEqual(
    optimizerFactProviderCatalog.plugins.map((plugin) => [
      plugin.id,
      plugin.domainId,
      plugin.priority,
      plugin.publicMutableStorage,
    ]),
    [[
      "math.packed-machine-container-facts.v1",
      "packed-machine-container",
      400,
      false,
    ]],
  );
  const [provider] = optimizerFactProviderCatalog.plugins;
  assert.equal(Object.isFrozen(provider), true);
  assert.equal(Object.isFrozen(provider.factsProduced), true);
  assert.equal(Object.isFrozen(provider.supportedConsumers), true);
  assert.equal(Object.hasOwn(provider, "loweringIds"), false);
  assert.equal(Object.hasOwn(provider, "pass"), false);
  for (const fact of provider.factsProduced) {
    assert.equal(optimizerFactProviderCatalog.factOwners[fact], provider.id);
  }
});

test("every registered lowering has one verifier and one Python emitter", () => {
  const { optimizerLoweringContracts } = require(
    "../dist/tools/python/optimizer/lowerings.js",
  );
  const { optimizerCatalog } = require(
    "../dist/tools/python/optimizer/catalog.js",
  );
  const { internalPlanVerifierCatalog } = require(
    "../dist/tools/python/optimizer/verifiers/catalog.js",
  );
  const dispatcherSource = fs.readFileSync(
    path.join(__dirname, "../src/output/optimizer/dispatcher.py"),
    "utf8",
  );
  const contracts = optimizerLoweringContracts();
  const fixedExtension = contracts.find(
    (contract) => contract.id === "v8.fixed-extension-loop.v1",
  );
  assert.deepEqual(fixedExtension.targetKinds, ["v8", "adaptive"]);
  const registered = contracts.map((contract) => contract.id).sort();
  const owned = optimizerCatalog.plugins
    .flatMap((plugin) => plugin.loweringIds).sort();
  const emitted = [...dispatcherSource.matchAll(/^\s*"([^"]+\.v1)":/gm)]
    .map((match) => match[1]).sort();
  assert.deepEqual(registered, [
    "v8.bounded-integer-loop.v1",
    "v8.closed-ring-loop.v1",
    "v8.fixed-extension-loop.v1",
    "v8.modular-batch-loop.v1",
    "v8.strict-float-array-loop.v1",
    "v8.strict-float-loop.v1",
  ]);
  assert.deepEqual(owned, registered);
  assert.deepEqual(emitted, registered);
  for (const { internalKind: kind } of contracts) {
    assert.equal(
      internalPlanVerifierCatalog.plugins.filter((plugin) =>
        plugin.internalKinds.includes(kind)
      ).length,
      1,
      `${kind} must belong to exactly one verifier plugin`,
    );
  }
});

test("explicit-domain rejection evidence is declared by its pass", () => {
  const { optimizerCatalog } = require(
    "../dist/tools/python/optimizer/catalog.js",
  );
  const modular = optimizerCatalog.plugins.find(
    (plugin) => plugin.id === "math.modular-batch-region.v1",
  );
  assert.ok(modular);
  assert.ok(modular.pass.factsProduced.includes("explicit-domain-contract"));
});
