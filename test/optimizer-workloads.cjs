// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  canonicalWorkloadCompilerIdentity,
  cpythonPrimePolynomialOracle,
  findWorkload,
  loadCatalog,
  loadStaticControlInventory,
  machineControlOracle,
  primePolynomialOracle,
  profileSettings,
  requireCurrentBuild,
  workloadKey,
} = require("../tools/optimizer-development/workloads.cjs");
const {
  compilerImplementationIdentity,
} = require("../tools/optimizer-development/identity.cjs");
const {
  optimizerCatalog,
} = require("../dist/tools/python/optimizer/catalog.js");
const {
  validateWorkloadCatalog,
} = require("../tools/optimizer-development/schemas.cjs");
const {
  verifyDocumentIdentity,
} = require("../tools/optimizer-development/common.cjs");
const {
  validateRecords,
  validateTargets,
} = require("../bench/optimizer-workloads/cubic.cjs");
const {
  measureHandwrittenV8,
  program: polynomialProgram,
} = require("../bench/optimizer-workloads/public-prime-polynomial.cjs");
const {
  parseArguments,
} = require("../scripts/optimizer-workload.cjs");

const catalog = loadCatalog(root);
const machineFixture = require("./fixtures/optimizer-development/workloads/machine-oracles.json");
const cubicFixture = require("./fixtures/optimizer-development/workloads/cubic-profile.json");
const staticInventory = require("./fixtures/optimizer-development/workloads/static-control-inventory.json");

test("the workload catalog is immutable, content-addressed, and complete", () => {
  assert.equal(catalog.schema, "sagejs.optimizer-workload-catalog/v1");
  assert.match(catalog.id, /^sha256:[0-9a-f]{64}$/);
  assert.equal(catalog.workloads.length, 14);
  assert.ok(Object.isFrozen(catalog));
  assert.ok(catalog.workloads.every(Object.isFrozen));
  assert.deepEqual(
    new Set(catalog.workloads.map(workloadKey)),
    new Set([
      "bounded-integer",
      "fixed-extension",
      "hyperelliptic-local-reduction",
      "neighbors",
      "number-field-cubic-factor-base",
      "number-field-local-polygons",
      "packed-container",
      "prime-residue-batch",
      "profile",
      "public-modular-fold",
      "public-evaluate",
      "public-prime-polynomial-integral",
      "strict-binary64-array",
      "targets",
    ]),
  );
  const tampered = structuredClone(catalog);
  tampered.workloads[0].title += " changed";
  assert.throws(() => validateWorkloadCatalog(tampered), /is stale/);
});

test("fact-only and candidate-target policies cannot be silently narrowed", () => {
  const packed = findWorkload(catalog, "packed-container");
  assert.equal(packed.class, "microbenchmark");
  assert.deepEqual(packed.input.value.route, {
    evidence: "fact-provider-only",
    expected_pass: null,
    selection: "forbidden",
  });
  const polynomial = findWorkload(catalog, "public-evaluate");
  assert.deepEqual(polynomial.targets, ["generic", "library", "native", "v8", "wasm"]);
  assert.deepEqual(polynomial.modes, ["python", "sage"]);
  assert.ok(polynomial.phases.some((phase) => phase.id === "execute-dynamic"));
  assert.ok(polynomial.phases.some((phase) => phase.id === "execute-v8-lower-bound"));
  const modularFold = findWorkload(catalog, "public-modular-fold");
  assert.equal(modularFold.class, "microbenchmark");
  assert.equal(
    modularFold.input.value.policy.production_eligibility,
    "ineligible-for-dense-list-production-promotion",
  );
  const negative = findWorkload(catalog, "targets");
  assert.deepEqual(negative.targets, ["generic", "native", "v8"]);
  assert.equal(negative.input.value.policy.maximum_javascript_over_native_call_ratio, 1);
  assert.equal(negative.input.value.policy.maximum_javascript_over_native_inclusive_ratio, 1);
  assert.ok(negative.phases.some((phase) => phase.id === "inclusive-javascript"));
  assert.ok(negative.phases.some((phase) => phase.id === "inclusive-native"));
  const hyperelliptic = findWorkload(catalog, "hyperelliptic-local-reduction");
  assert.ok(hyperelliptic.phases.some((phase) =>
    phase.id === "normalization-factor" &&
    phase.label.includes("timed independently")));
  assert.notEqual(
    hyperelliptic.phases.find((phase) => phase.id === "normalization-factor").label,
    hyperelliptic.phases.find((phase) => phase.id === "production").label,
  );
});

test("independent machine and polynomial oracles reproduce pinned outputs", () => {
  for (const control of machineFixture.controls) {
    assert.equal(machineControlOracle(control.mode, control.smokeSize), control.smoke);
    assert.equal(machineControlOracle(control.mode, control.standardSize), control.standard);
    const workload = findWorkload(catalog, control.mode);
    assert.equal(profileSettings(workload, "smoke").size, control.smokeSize);
    assert.equal(profileSettings(workload, "standard").size, control.standardSize);
    assert.equal(new Set(workload.oracles.map((oracle) => oracle.expectedDigest)).size, 1);
  }
  const polynomial = machineFixture.primePolynomial;
  assert.equal(primePolynomialOracle(polynomial.smokeSize), polynomial.smoke);
  assert.equal(primePolynomialOracle(polynomial.standardSize), polynomial.standard);
  assert.equal(cpythonPrimePolynomialOracle(polynomial.standardSize), polynomial.standard);
  assert.equal(
    measureHandwrittenV8(
      { size: polynomial.smokeSize, samples: 1, warmups: 1 },
      polynomial.modulus,
      polynomial.point,
    ).answer,
    polynomial.smoke,
  );
  const source = polynomialProgram(
    { size: polynomial.smokeSize, samples: 1, warmups: 1 },
    polynomial.modulus,
    polynomial.point,
  );
  assert.match(source, /kernel_execution_mode/);
  assert.match(source, /packed_prime_field_polynomial_evaluate/);
});

test("every machine control has immutable CPython-parseable source provenance", () => {
  assert.match(staticInventory.id, /^sha256:[0-9a-f]{64}$/);
  verifyDocumentIdentity("static control inventory", staticInventory);
  for (const control of machineFixture.controls) {
    const workload = findWorkload(catalog, control.mode);
    const sourcePath = workload.input.value.sourcePath;
    const inventory = staticInventory.controls.find((item) => item.selector === control.mode);
    assert.ok(inventory);
    assert.equal(inventory.path, sourcePath);
    const bytes = fs.readFileSync(path.join(root, sourcePath));
    assert.equal(
      require("node:crypto").createHash("sha256").update(bytes).digest("hex"),
      inventory.sha256,
    );
    assert.ok(sourcePath.startsWith("bench/optimizer-workloads/"));
    const result = spawnSync("python3", ["-m", "py_compile", path.join(root, sourcePath)], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("the catalog adapter authenticates the static control inventory", () => {
  assert.deepEqual(loadStaticControlInventory(root), staticInventory);
});

test("dashboard and workload identities share exact compiler implementation dimensions", () => {
  const implementation = compilerImplementationIdentity(root, optimizerCatalog);
  const workloadCompiler = canonicalWorkloadCompilerIdentity(root, {
    frontendMode: "sage",
    optimizationLevel: "O2",
    compilationKind: "workload-test",
  });
  assert.equal(
    workloadCompiler.compilerSourceBundleId,
    implementation.compilerSourceBundle.id,
  );
  assert.equal(workloadCompiler.frontendDigest, implementation.frontendDigest);
  assert.equal(workloadCompiler.catalogDigest, implementation.catalogDigest);
  const dashboardCompiler = canonicalWorkloadCompilerIdentity(root, {
    frontendMode: "sage",
    optimizationLevel: "O2",
    compilationKind: "dashboard-static-census",
  });
  assert.equal(dashboardCompiler.compilerSourceBundleId, workloadCompiler.compilerSourceBundleId);
  assert.equal(dashboardCompiler.frontendDigest, workloadCompiler.frontendDigest);
  assert.equal(dashboardCompiler.catalogDigest, workloadCompiler.catalogDigest);
  assert.notEqual(dashboardCompiler.optionsDigest, workloadCompiler.optionsDigest);
  assert.notEqual(dashboardCompiler.id, workloadCompiler.id);
});

test("the cubic profiler adapter requires exact targets and detached proof evidence", () => {
  const targets = validateTargets(cubicFixture);
  assert.equal(targets.get("javascript").call_nanoseconds / targets.get("native").call_nanoseconds > 20, true);
  validateRecords(cubicFixture);
  const broken = structuredClone(cubicFixture);
  broken.records[0].presentation_sha256 = "not-a-digest";
  assert.throws(() => validateRecords(broken));
});

test("the workload CLI has explicit smoke and dirty-development modes", () => {
  assert.deepEqual(parseArguments(["run", "bounded-integer", "--smoke", "--allow-dirty"]), {
    command: "run",
    id: "bounded-integer",
    profile: "smoke",
    catalog: "architecture/optimizer-workloads.json",
    output: null,
    allowDirty: true,
  });
  assert.throws(() => parseArguments(["run"]), /requires a workload ID/);
});

test("build preflight rejects a stale receipt before any workload starts", () => {
  assert.throws(
    () => requireCurrentBuild(root, {
      allowDirty: true,
      inspector: () => ({ current: false, reason: "deliberately stale" }),
    }),
    /deliberately stale/,
  );
});

test("pinned external fixtures retain their reviewed byte identities", () => {
  const negative = findWorkload(catalog, "targets").input.value.fixture;
  const neighbors = findWorkload(catalog, "neighbors").input.value.fixture;
  const digest = (filename) => require("node:crypto")
    .createHash("sha256").update(fs.readFileSync(path.join(root, filename))).digest("hex");
  assert.equal(digest(negative.path), negative.sha256);
  assert.equal(digest(neighbors.path), neighbors.sha256);
});
