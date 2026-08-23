// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { checkGenerated, loadRegistry } = require("../tools/math-dispatch/registry.cjs");
const {
  validateFamilyDocument,
  validateProfileDocument,
} = require("../tools/math-dispatch/schema.cjs");
const { parseDispatchSource } = require("../tools/math-dispatch/source-declarations.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = resolve(__dirname, "..");

test("CPython parses every dispatch authority", () => {
  const result = require("node:child_process").spawnSync(pythonExecutable(), [
    "-m", "py_compile",
    join(root, "dispatch", "matrix.dispatch.py"),
    join(root, "dispatch", "profiles", "portable.dispatch.py"),
  ], { encoding: "utf8" });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test("checked-in authority lowers to current deterministic JSON", async () => {
  const registry = await loadRegistry({ root });
  assert.deepEqual([...registry.families.keys()], ["dense-prime-matrix"]);
  assert.deepEqual(registry.profiles.map((item) => item.document.id), ["portable"]);
  assert.ok(registry.identity.profile_set_fingerprint.match(/^[a-f0-9]{64}$/));
  assert.ok(checkGenerated(registry).every((item) => item.matches));
});

test("lowering is independent of absolute directory", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-dispatch-copy-"));
  try {
    cpSync(join(root, "dispatch"), join(temporary, "dispatch"), { recursive: true });
    const original = await parseDispatchSource(join(root, "dispatch", "matrix.dispatch.py"), { root });
    const copy = await parseDispatchSource(join(temporary, "dispatch", "matrix.dispatch.py"), { root: temporary });
    assert.equal(copy.text, original.text);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("parser rejects execution, aliases, and unknown constructor fields", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-dispatch-invalid-"));
  try {
    const filename = join(temporary, "invalid.dispatch.py");
    writeFileSync(filename, [
      "from sagejs.dispatch import DispatchFamily as Family",
      "VALUE = open('/tmp/not-executed')",
      "",
    ].join("\n"));
    await assert.rejects(parseDispatchSource(filename, { root: temporary }), /may not be aliased/);
    writeFileSync(filename, [
      "from sagejs.dispatch import DispatchFamily",
      "VALUE = DispatchFamily(id='x', schema=1, generation=1, features={}, capabilities=[], representations=[], operations=[], surprise=True)",
      "",
    ].join("\n"));
    await assert.rejects(parseDispatchSource(filename, { root: temporary }), /unknown keyword surprise/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("static dictionaries cannot inject inherited profile identity", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-dispatch-prototype-"));
  try {
    const filename = join(temporary, "evil.dispatch.py");
    writeFileSync(filename, [
      "from sagejs.dispatch import DispatchProfile",
      "PROFILE = DispatchProfile(",
      "    id='evil', schema=1, generation=1, kind='checked',",
      "    match={'__proto__': {'os': 'linux', 'arch': 'x64'}},",
      "    declarations={}, evidence=[], operations=[],",
      ")",
      "",
    ].join("\n"));
    const parsed = await parseDispatchSource(filename, { root: temporary });
    assert.equal(Object.getPrototypeOf(parsed.document.match), null);
    assert.equal(Object.hasOwn(parsed.document.match, "__proto__"), true);
    assert.equal(parsed.document.match.os, undefined);
    assert.match(parsed.text, /"__proto__"/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("declaration expressions are statically typed and predicates are boolean", async () => {
  const registry = await loadRegistry({ root });
  const family = structuredClone(registry.families.get("dense-prime-matrix").document);
  family.capabilities[0].requires = {
    op: "add",
    left: { op: "feature", name: "canonical_output", source: family.source },
    right: { op: "integer", value: "1", source: family.source },
    source: family.source,
  };
  assert.throws(() => validateFamilyDocument(family), /arithmetic operands.*boolean and integer/);

  const nonPredicate = structuredClone(registry.families.get("dense-prime-matrix").document);
  nonPredicate.operations[0].algorithms[0].when = {
    op: "feature", name: "rows", source: nonPredicate.source,
  };
  assert.throws(() => validateFamilyDocument(nonPredicate), /\.when must be boolean, not uint64/);

  const incompatible = structuredClone(registry.families.get("dense-prime-matrix").document);
  incompatible.operations[0].algorithms[0].when = {
    op: "compare",
    operator: "eq",
    left: { op: "feature", name: "canonical_output", source: incompatible.source },
    right: { op: "integer", value: "1", source: incompatible.source },
    source: incompatible.source,
  };
  assert.throws(() => validateFamilyDocument(incompatible), /equality operands are incompatible/);
});

test("operations declare every feature reachable from family and profile predicates", async () => {
  const registry = await loadRegistry({ root });
  const family = structuredClone(registry.families.get("dense-prime-matrix").document);
  const multiply = family.operations.find((operation) => operation.id === "multiply");
  const flint = multiply.algorithms.find((algorithm) => algorithm.id === "flint");
  flint.when = {
    op: "compare",
    operator: "ge",
    left: { op: "feature", name: "rows", source: family.source },
    right: { op: "integer", value: "1", source: family.source },
    source: family.source,
  };
  assert.throws(() => validateFamilyDocument(family),
    /multiply\.flint\.when references feature rows.*multiply\.features/);

  const profile = structuredClone(registry.profiles[0].document);
  const profiledMultiply = profile.operations.find((operation) => operation.operation === "multiply");
  profiledMultiply.rules[0].when = {
    op: "compare",
    operator: "ge",
    left: { op: "feature", name: "rows", source: profile.source },
    right: { op: "integer", value: "1", source: profile.source },
    source: profile.source,
  };
  assert.throws(() => validateProfileDocument(profile, registry.families),
    /multiply\..*\.when references feature rows.*multiply\.features/);
});

test("stale generated JSON fails closed", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-dispatch-stale-"));
  try {
    cpSync(join(root, "dispatch"), join(temporary, "dispatch"), { recursive: true });
    const generated = join(temporary, "dispatch", "generated", "matrix.dispatch.json");
    writeFileSync(generated, readFileSync(generated, "utf8").replace("dense-prime-matrix", "stale"));
    const registry = await loadRegistry({ root: temporary });
    assert.throws(() => checkGenerated(registry), /stale mathematical dispatch JSON/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
