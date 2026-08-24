"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SAGEJS = path.join(ROOT, "bin", "sagejs");
const POLICY_MODULE = path.join(
  ROOT,
  "tools",
  "math-dispatch",
  "hyperelliptic-auto-receipt-policy.cjs",
);
const {
  PLATFORMS,
  POLICY_SCHEMA,
  RUNTIME_GLOBAL,
  RUNTIME_SCHEMA,
  SOURCE_BUNDLE_ALGORITHM,
  createAutoReceiptPolicyRuntime,
  generateSourceBundle,
  installAutoReceiptPolicyRuntime,
  readJson,
  verifyPolicy,
} = require(POLICY_MODULE);

const COMMIT = "d".repeat(40);
const FINGERPRINT = "a".repeat(64);

function enabledEmptyPolicy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-hyp-dispatch-"));
  fs.mkdirSync(path.join(root, "source"));
  fs.writeFileSync(path.join(root, "source", "kernel.py"), "def kernel(x):\n    return x\n");
  const generated = generateSourceBundle(root, ["source/kernel.py"]);
  const policy = {
    schema: POLICY_SCHEMA,
    enabled: true,
    required_platforms: [...PLATFORMS],
    source_bundle_contract: {
      algorithm: SOURCE_BUNDLE_ALGORITHM,
      paths: ["source/kernel.py"],
    },
    source_bundle: { ...generated, source_commit: COMMIT },
    entries: [],
  };
  const filename = path.join(root, "policy.json");
  fs.writeFileSync(filename, `${JSON.stringify(policy, null, 2)}\n`);
  return { root, filename, policy };
}

function decide(runtime, overrides = {}) {
  return runtime.decide(
    overrides.backend ?? "prime-cantor",
    overrides.operation ?? "add",
    overrides.fingerprint ?? FINGERPRINT,
    overrides.domainId ?? "prime-cantor-odd-v1",
    overrides.genus ?? 2,
    overrides.fieldKind ?? "prime-field",
    overrides.modelKind ?? "odd-degree-one-infinity",
    overrides.hKind ?? "zero",
    overrides.prime ?? 1009,
    overrides.intervalStart ?? 1009,
    overrides.intervalStop ?? 1009,
    overrides.batchItems ?? 1,
    overrides.scalarBits ?? 0,
    overrides.resourceBytes ?? 352,
  );
}

function preload(item, mode) {
  const filename = path.join(item.root, `preload-${mode}.cjs`);
  fs.writeFileSync(
    filename,
    String.raw`"use strict";
const policyApi = require(${JSON.stringify(POLICY_MODULE)});
const mode = process.env.SAGEJS_TEST_RECEIPT_POLICY_MODE;
let policy;
let options;
if (mode === "enabled") {
  policy = policyApi.readJson(process.env.SAGEJS_TEST_RECEIPT_POLICY_FILE);
  options = {
    root: process.env.SAGEJS_TEST_RECEIPT_POLICY_ROOT,
    sourceCommit: ${JSON.stringify(COMMIT)},
  };
} else {
  policy = policyApi.readJson(${JSON.stringify(
    path.join(ROOT, "architecture", "hyperelliptic-auto-receipt-policy.json"),
  )});
  options = { root: ${JSON.stringify(ROOT)} };
}
const verified = policyApi.verifyPolicy(policy, options);
policyApi.installAutoReceiptPolicyRuntime(verified, {
  target: globalThis,
  platform: "linux-x64",
});
`,
  );
  return filename;
}

function runSage(source, environment = {}) {
  const result = spawnSync(SAGEJS, [], {
    cwd: ROOT,
    encoding: "utf8",
    input: source,
    timeout: 180_000,
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function parseSageJson(output) {
  const lines = output.split("\n").filter((line) => line.trim() !== "");
  return JSON.parse(lines.at(-1));
}

const selectorWitness = String.raw`
from sagejs.hyperelliptic_curves.auto_receipt_policy import auto_receipt_decision
import sagejs.hyperelliptic_curves.frobenius as frobenius
from sagejs.hyperelliptic_curves.jacobian_kummer_native import (
    Genus2PrimeKummerContext,
    genus2_kummer_double_batch,
)
from sagejs.hyperelliptic_curves.jacobian import HyperellipticJacobian
from sagejs.hyperelliptic_curves.jacobian_native import PreparedJacobianArithmetic
from sagejs.native import is_compiled
import json

decision = auto_receipt_decision(
    algorithm="auto",
    backend="prime-cantor",
    operation="add",
    fingerprint="${FINGERPRINT}",
    domain_id="prime-cantor-odd-v1",
    genus=2,
    field_kind="prime-field",
    model_kind="odd-degree-one-infinity",
    h_kind="zero",
    prime=1009,
    interval_start=1009,
    interval_stop=1009,
    batch_items=1,
    resource_bytes=352,
)

prepared = PreparedJacobianArithmetic.__new__(PreparedJacobianArithmetic)
prepared._algorithm = "auto"
prepared._native_available = True
prepared._domain_reason = "supported"
prepared.prime = 1009
prepared.model_fingerprint = "${FINGERPRINT}"
prepared.genus = 2
prepared.model_kind = "odd-degree-one-infinity"
prepared._h_kind = "zero"
prepared_selected = prepared._selection(
    "auto", operation="add", batch_items=1, resource_bytes=352
)
explicit_selected = prepared._selection(
    "native", operation="add", batch_items=1, resource_bytes=352
)

class FakePolynomial:
    def __init__(self, coefficients):
        self._coefficients = coefficients
    def degree(self):
        return len(self._coefficients) - 1
    def list(self):
        return list(self._coefficients)

class FakeRationalBase:
    _kind = "QQ"

class FakeCurve:
    def __init__(self):
        self._f = FakePolynomial([1, -1, 0, 0, 0, 1])
        self._h = FakePolynomial([0])
    def hyperelliptic_polynomials(self):
        return self._f, self._h
    def base_ring(self):
        return FakeRationalBase()
    def genus(self):
        return 2

class FakePrimeBase:
    _kind = "GF"
    def characteristic(self):
        return 1009

class FakePrimeCurve(FakeCurve):
    def base_ring(self):
        return FakePrimeBase()

class FakeJacobian:
    def __init__(self):
        self._curve = FakePrimeCurve()
        self._group_structure_diagnostics_cache = None
    def order(self):
        return 5
    def random_elements(self, count=1, max_attempts=20):
        return []

rational_curve = FakeCurve()
original_smalljac = frobenius._rational_smalljac_supported
original_rforest = frobenius._rational_rforest_supported
original_capabilities = frobenius._smalljac_capabilities
original_prime_bound = frobenius._smalljac_prime_bound
frobenius._rational_smalljac_supported = lambda curve, start, stop: True
frobenius._rational_rforest_supported = lambda curve, start, stop: False
frobenius._smalljac_capabilities = lambda: {"available": True}
frobenius._smalljac_prime_bound = lambda: 2**52
try:
    rational_auto = frobenius._select_rational_algorithm(
        rational_curve, "auto", 3, 101, batch_items=50, resource_bytes=3456
    )
    rational_explicit = frobenius._select_rational_algorithm(
        rational_curve, "smalljac", 3, 101
    )
finally:
    frobenius._rational_smalljac_supported = original_smalljac
    frobenius._rational_rforest_supported = original_rforest
    frobenius._smalljac_capabilities = original_capabilities
    frobenius._smalljac_prime_bound = original_prime_bound

original_group_support = frobenius.smalljac_supports_group_structure
original_group_invariants = frobenius.smalljac_group_invariants
frobenius.smalljac_supports_group_structure = lambda curve: True
frobenius.smalljac_group_invariants = lambda curve: (5,)
try:
    group_auto_jacobian = FakeJacobian()
    HyperellipticJacobian.group_structure(
        group_auto_jacobian,
        factorization=[(5, 1)],
        algorithm="auto",
    )
    group_auto = group_auto_jacobian._group_structure_diagnostics_cache["algorithm"]
    group_explicit_jacobian = FakeJacobian()
    HyperellipticJacobian.group_structure(
        group_explicit_jacobian,
        factorization=[(5, 1)],
        algorithm="smalljac",
    )
    group_explicit = group_explicit_jacobian._group_structure_diagnostics_cache[
        "algorithm"
    ]
finally:
    frobenius.smalljac_supports_group_structure = original_group_support
    frobenius.smalljac_group_invariants = original_group_invariants

kummer = Genus2PrimeKummerContext(
    1009,
    [1, 1, 0, 0, 0, 1],
    algorithm="auto",
)
kummer_policy = kummer.capability()["receipt_policy"]
kummer_selected = is_compiled(kummer._kernel(
    genus2_kummer_double_batch,
    "double",
    batch_items=1,
    resource_bytes=1472,
))
original_kummer_algorithm = kummer._algorithm
kummer._algorithm = "native"
explicit_kummer_policy = kummer._receipt_decision(
    "double",
    batch_items=1,
    resource_bytes=1472,
)
kummer._algorithm = original_kummer_algorithm
reference_kummer = Genus2PrimeKummerContext(
    1009,
    [1, 1, 0, 0, 0, 1],
    algorithm="reference",
)
kummer_input = [[0, 0, 0, 1], [1, 2, 3, 4]]
kummer_exact = (
    kummer.double_batch(kummer_input)
    == reference_kummer.double_batch(kummer_input)
)
print(json.dumps({
    "decision": decision.to_dict(),
    "prepared": prepared_selected,
    "explicit": explicit_selected,
    "rational_auto": rational_auto,
    "rational_explicit": rational_explicit,
    "kummer": kummer_policy,
    "kummer_compiled": is_compiled(genus2_kummer_double_batch),
    "kummer_selected": kummer_selected,
    "explicit_kummer": explicit_kummer_policy.to_dict(),
    "kummer_exact": kummer_exact,
    "group_auto": group_auto,
    "group_explicit": group_explicit,
}))
`;

test("verified runtime objects are immutable and fail closed without an entry", (context) => {
  const item = enabledEmptyPolicy();
  context.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const verified = verifyPolicy(item.policy, {
    root: item.root,
    sourceCommit: COMMIT,
  });
  const runtime = createAutoReceiptPolicyRuntime(verified, { platform: "linux-x64" });
  assert(Object.isFrozen(runtime));
  assert.equal(runtime.schema, RUNTIME_SCHEMA);
  assert.deepEqual(decide(runtime), {
    schema: RUNTIME_SCHEMA,
    policy_enabled: true,
    selected: false,
    reason: "unreceipted-fallback",
    entry_id: null,
    backend: "prime-cantor",
    operation: "add",
  });
  assert.equal(decide(runtime, { prime: 1009n }).reason, "unreceipted-fallback");
  assert.throws(
    () => decide(runtime, { prime: BigInt(Number.MAX_SAFE_INTEGER) + 1n }),
    /must fit a nonnegative JavaScript safe integer/,
  );
  const target = {};
  assert.equal(
    installAutoReceiptPolicyRuntime(verified, { target, platform: "linux-x64" }),
    target[RUNTIME_GLOBAL],
  );
  assert.equal(Object.getOwnPropertyDescriptor(target, RUNTIME_GLOBAL).writable, false);
  assert.throws(
    () => installAutoReceiptPolicyRuntime(verified, { target, platform: "linux-x64" }),
    /already installed/,
  );
  assert.throws(
    () => createAutoReceiptPolicyRuntime(Object.freeze({ enabled: true })),
    /verified immutable policy/,
  );
});

test("an enabled empty policy gates auto while explicit accelerators remain collectable", (context) => {
  const item = enabledEmptyPolicy();
  context.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const output = runSage(selectorWitness, {
    SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: item.filename,
    SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_ROOT: item.root,
  });
  const observed = parseSageJson(output);
  assert.equal(observed.decision.allowed, false);
  assert.equal(observed.decision.reason, "unreceipted-fallback");
  assert.deepEqual(observed.prepared, ["reference", "unreceipted-fallback"]);
  assert.deepEqual(observed.explicit, ["native", "explicit-native-receipt-collection"]);
  assert.equal(observed.rational_auto, "exhaustive");
  assert.equal(observed.rational_explicit, "smalljac");
  assert.equal(observed.kummer.allowed, false);
  assert.equal(observed.kummer.reason, "unreceipted-fallback");
  assert.equal(observed.kummer_selected, false);
  assert.equal(observed.explicit_kummer.allowed, true);
  assert.equal(observed.explicit_kummer.reason, "explicit-native-receipt-collection");
  assert.equal(observed.kummer_exact, true);
  assert.equal(observed.group_auto, "squarefree-order");
  assert.equal(observed.group_explicit, "smalljac");
});

test("absent and verified disabled policies preserve development auto selection", (context) => {
  const item = enabledEmptyPolicy();
  context.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const absent = parseSageJson(runSage(selectorWitness, {
    SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
  }));
  assert.equal(absent.decision.allowed, true);
  assert.equal(absent.decision.reason, "development-auto-policy-absent");
  assert.equal(absent.prepared[0], "native");
  assert.equal(absent.rational_auto, "smalljac");
  assert.equal(absent.kummer_selected, absent.kummer_compiled);
  assert.equal(absent.group_auto, "smalljac");

  const disabled = parseSageJson(runSage(selectorWitness));
  assert.equal(disabled.decision.allowed, true);
  assert.equal(disabled.decision.reason, "policy-disabled");
  assert.equal(disabled.prepared[0], "native");
  assert.equal(disabled.rational_auto, "smalljac");
  assert.equal(disabled.kummer_selected, disabled.kummer_compiled);
  assert.equal(disabled.group_auto, "smalljac");
});

test("the isolated task runtime installs the checked policy before callables", (context) => {
  const item = enabledEmptyPolicy();
  context.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const taskEvaluator = path.join(ROOT, "dist", "tools", "task-evaluator.js");
  const source = String.raw`
const { createTaskEvaluator } = require(${JSON.stringify(taskEvaluator)});
const evaluator = createTaskEvaluator({ mode: "sage", onOutput() {} });
const provider = globalThis[${JSON.stringify(RUNTIME_GLOBAL)}];
const result = provider.decide(
  "prime-cantor", "add", ${JSON.stringify(FINGERPRINT)},
  "prime-cantor-odd-v1", 2, "prime-field", "odd-degree-one-infinity",
  "zero", 1009, 1009, 1009, 1, 0, 352,
);
process.stdout.write(result.reason + "\n");
evaluator.close();
`;
  const result = spawnSync(process.execPath, ["-e", source], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
    env: {
      ...process.env,
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: item.filename,
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_ROOT: item.root,
    },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "unreceipted-fallback");
});

test("trusted startup rejects a provider installed before Sage.js", (context) => {
  const item = enabledEmptyPolicy();
  context.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const preloadFile = preload(item, "enabled");
  const result = spawnSync(SAGEJS, [], {
    cwd: ROOT,
    encoding: "utf8",
    input: "print(1)\n",
    timeout: 180_000,
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preloadFile}`.trim(),
      SAGEJS_TEST_RECEIPT_POLICY_MODE: "enabled",
      SAGEJS_TEST_RECEIPT_POLICY_FILE: item.filename,
      SAGEJS_TEST_RECEIPT_POLICY_ROOT: item.root,
    },
  });
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existed before trusted startup/);
});

test("the candidate remains disabled and binds the selector/provider source", () => {
  const candidate = readJson(
    path.join(ROOT, "architecture", "hyperelliptic-auto-receipt-policy.json"),
  );
  assert.equal(candidate.enabled, false);
  assert.deepEqual(candidate.entries, []);
  assert(candidate.source_bundle_contract.paths.includes(
    "src/lib/sagejs/hyperelliptic_curves/auto_receipt_policy.py",
  ));
  assert(candidate.source_bundle_contract.paths.includes(
    "tools/math-dispatch/hyperelliptic-auto-receipt-loader.cjs",
  ));
  assert(candidate.source_bundle_contract.paths.includes(
    "tools/math-dispatch/hyperelliptic-auto-receipt-policy.cjs",
  ));
  assert(candidate.source_bundle_contract.paths.includes("tools/runtime-bootstrap.ts"));
});

test("the portable provider enforces the same model and workload envelope", async () => {
  const module = await import(pathToFileURL(path.join(
    ROOT,
    "packages",
    "flint-wasm",
    "auto-receipt-policy.mjs",
  )));
  const policy = {
    enabled: true,
    source_bundle: { sha256: "b".repeat(64) },
    entries: [{
      id: "portable-cantor-add",
      enabled: true,
      backend: "prime-cantor",
      operation: "add",
      platforms: [...PLATFORMS],
      source_bundle_sha256: "b".repeat(64),
      model: { kind: "exact-fingerprint", fingerprints: [FINGERPRINT] },
      envelope: {
        prime_min: 1009,
        prime_max: 1009,
        interval_start_min: 1009,
        interval_stop_max: 1009,
        interval_span_max: 1,
        batch_items_min: 1,
        batch_items_max: 64,
        scalar_bits_max: 0,
        resource_bytes_max: 4096,
      },
    }],
  };
  const runtime = module.createBrowserAutoReceiptPolicyRuntime(policy);
  assert.equal(decide(runtime).selected, true);
  assert.equal(decide(runtime).entry_id, "portable-cantor-add");
  assert.equal(decide(runtime, { batchItems: 65 }).selected, false);
  assert.equal(decide(runtime, { fingerprint: "c".repeat(64) }).selected, false);
  const disabled = module.createBrowserAutoReceiptPolicyRuntime({
    enabled: false,
    source_bundle: null,
    entries: [],
  });
  assert.equal(decide(disabled).reason, "policy-disabled");
});
