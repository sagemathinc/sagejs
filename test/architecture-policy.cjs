// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const test = require("node:test");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const {
  nativeFiles,
  trackedNativeExtensions,
  validateDistributionReceipt,
  validateNativeAudit,
  validateKernelRegistry,
  validateNativeCode,
  validateRustMathCorePolicy,
  validateRustEvidenceFreshness,
  rustSafetySensitive,
} = require("../scripts/check-native-architecture.cjs");
const { rustAbiBoundaries } = require("../tools/ffi/boundary-audit.cjs");

const root = resolve(__dirname, "..");
const codeManifest = JSON.parse(readFileSync(
  join(root, "architecture", "native-code.json"),
  "utf8",
));
const kernelManifest = JSON.parse(readFileSync(
  join(root, "architecture", "native-kernels.json"),
  "utf8",
));
const auditManifest = JSON.parse(readFileSync(
  join(root, "architecture", "native-audit.json"),
  "utf8",
));
const rustPolicyManifest = JSON.parse(readFileSync(
  join(root, "architecture", "rust-math-core-policy.json"),
  "utf8",
));
const boundaryManifest = JSON.parse(readFileSync(
  join(root, "architecture", "native-boundaries.json"),
  "utf8",
));

test("every tracked native file has an architectural classification", () => {
  const result = validateNativeCode(codeManifest);
  assert.deepEqual(
    trackedNativeExtensions(root),
    codeManifest.policy.tracked_extensions,
  );
  assert.deepEqual(
    nativeFiles(root),
    nativeFiles(root, codeManifest.policy.tracked_extensions),
  );
  assert.equal(result.entries.length, nativeFiles().length);
  assert.ok(result.audited.some((entry) =>
    entry.path === "packages/flint/src/p1.c"
  ));
});

test("focused native audits are complete and metric-checked", () => {
  const code = validateNativeCode(codeManifest);
  const result = validateNativeAudit(auditManifest, code);
  assert.equal(result.entries.length, code.audited.length);
  assert.equal(code.auditRequired.length, 0);
  assert.equal(
    result.entries.find((entry) => entry.path === "packages/flint/src/p1.c")
      .decision,
    "typed-remediation-pilot",
  );
  const stale = structuredClone(auditManifest);
  stale.files[0].bytes += 1;
  assert.throws(() => validateNativeAudit(stale, code), /metrics are stale/);
});

test("unclassified and stale native files fail closed", () => {
  const tracked = nativeFiles();
  const missing = structuredClone(codeManifest);
  missing.files = missing.files.filter((entry) => entry.path !== tracked[0]);
  assert.throws(
    () => validateNativeCode(missing, { trackedFiles: tracked }),
    /unclassified native files/,
  );
  const stale = structuredClone(codeManifest);
  stale.files.push({
    path: "missing.c",
    category: "host-adapter",
    review_status: "accepted",
    lane: "integration",
    rationale: "A deliberately missing source used by this validation test.",
  });
  assert.throws(() => validateNativeCode(stale), /native-code file is missing/);
});

test("the handwritten Rust backend has scoped alpha dispatch and remains production-receipt-gated", () => {
  const policy = validateRustMathCorePolicy(rustPolicyManifest);
  assert.equal(policy.status, "alpha-automatic-dispatch");
  assert.equal(
    policy.automatic_dispatch,
    "enabled-for-admitted-cubic-and-imaginary-quadratic-alpha",
  );
  assert.equal(policy.automatic_dispatch_contract.release_channel, "alpha");
  assert.equal(
    policy.automatic_dispatch_contract.fallback_boundary,
    "typed-capability-decline-before-publication-only",
  );
  assert.equal(
    policy.automatic_dispatch_contract.production_promotion_receipt_required,
    true,
  );
  assert.equal(
    policy.automatic_dispatch_contract.distribution_gate,
    "existing-release-provenance-safety-and-license-review",
  );
  assert.equal(
    policy.imaginary_quadratic_automatic_dispatch_contract.proof_authority,
    "exact-unconditional-complete-reduced-form-enumeration",
  );
  assert.equal(
    policy.imaginary_quadratic_automatic_dispatch_contract.fallback_boundary,
    "typed-capability-or-resource-decline-before-publication-only",
  );
  assert.equal(
    policy.imaginary_quadratic_automatic_dispatch_contract.distribution_gate,
    "existing-release-provenance-safety-and-license-review",
  );
  assert.deepEqual(policy.implementation.required_adapters, ["native", "wasm"]);
  assert.ok(policy.required_diagnostics.includes("proof-mode"));
  assert.ok(policy.platforms.promotion_required.includes("windows-x64"));

  const promotedWithoutReceipt = structuredClone(rustPolicyManifest);
  promotedWithoutReceipt.status = "production";
  assert.throws(
    () => validateRustMathCorePolicy(promotedWithoutReceipt),
    /separate alpha, production-receipt-gated backend/,
  );

  const widenedAlpha = structuredClone(rustPolicyManifest);
  widenedAlpha.automatic_dispatch_contract.admitted_domain = "all-number-fields";
  assert.throws(
    () => validateRustMathCorePolicy(widenedAlpha),
    /alpha dispatch must retain its admitted domain/,
  );

  const widenedQuadratic = structuredClone(rustPolicyManifest);
  widenedQuadratic.imaginary_quadratic_automatic_dispatch_contract.admitted_domain =
    "all-quadratic-fields";
  assert.throws(
    () => validateRustMathCorePolicy(widenedQuadratic),
    /imaginary-quadratic alpha dispatch must retain/,
  );

  const missingQuadraticGate = structuredClone(rustPolicyManifest);
  delete missingQuadraticGate.imaginary_quadratic_automatic_dispatch_contract
    .distribution_gate;
  assert.throws(
    () => validateRustMathCorePolicy(missingQuadraticGate),
    /imaginary-quadratic alpha dispatch must retain/,
  );

  const missingWasm = structuredClone(rustPolicyManifest);
  missingWasm.implementation.required_adapters = ["native"];
  assert.throws(
    () => validateRustMathCorePolicy(missingWasm),
    /required adapters/,
  );

  const missingFallback = structuredClone(rustPolicyManifest);
  delete missingFallback.public_contract.dynamic_fallback;
  assert.throws(
    () => validateRustMathCorePolicy(missingFallback),
    /dynamic fallback contract/,
  );
});

test("tracked Rust sources need explicit role, provenance, and distribution state", () => {
  const rustEntry = codeManifest.files.find((entry) => entry.path.endsWith(".rs"));
  assert.ok(rustEntry, "the qualification core must have classified Rust source");
  const missingRole = structuredClone(codeManifest);
  delete missingRole.files.find((entry) => entry.path === rustEntry.path).rust_role;
  assert.throws(() => validateNativeCode(missingRole), /unknown Rust role/);

  const accidentallyPromoted = structuredClone(codeManifest);
  accidentallyPromoted.files.find(
    (entry) => entry.path === rustEntry.path
  ).qualification_status = "production";
  assert.throws(
    () => validateNativeCode(accidentallyPromoted),
    /explicitly experimental/,
  );

  const ignoresRust = structuredClone(codeManifest);
  ignoresRust.policy.tracked_extensions = ignoresRust.policy.tracked_extensions.filter(
    (extension) => extension !== ".rs",
  );
  ignoresRust.files = ignoresRust.files.filter((entry) => !entry.path.endsWith(".rs"));
  assert.throws(
    () => validateNativeCode(ignoresRust),
    /fail closed on tracked Rust source/,
  );
});

test("native discovery includes untracked source but excludes ignored build output", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-discovery-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: temporary });
    writeFileSync(join(temporary, "tracked.rs"), "fn tracked() {}\n");
    execFileSync("git", ["add", "tracked.rs"], { cwd: temporary });
    writeFileSync(join(temporary, "untracked.rs"), "fn untracked() {}\n");
    mkdirSync(join(temporary, "target"));
    writeFileSync(join(temporary, "target", "generated.rs"), "fn generated() {}\n");
    writeFileSync(join(temporary, ".gitignore"), "/target/\n");
    assert.deepEqual(
      nativeFiles(temporary, [".rs"]),
      ["tracked.rs", "untracked.rs"],
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("Rust safety discovery ignores prose but catches unsafe and ABI syntax", () => {
  assert.equal(rustSafetySensitive('// unsafe extern "C"\nfn safe() {}\n'), false);
  assert.equal(rustSafetySensitive('const NOTE: &str = r#"unsafe extern "C""#;\n'), false);
  assert.equal(rustSafetySensitive("unsafe { core::ptr::read(pointer) };\n"), true);
  assert.equal(rustSafetySensitive('unsafe extern "C" { fn imported(); }\n'), true);
  assert.equal(
    rustSafetySensitive('#[unsafe(no_mangle)] pub extern "C" fn exported() {}\n'),
    true,
  );
});

test("declared Rust safety and provenance evidence rejects source drift", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rust-evidence-"));
  const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  try {
    execFileSync("git", ["init", "-q"], { cwd: temporary });
    mkdirSync(join(temporary, "core", "src"), { recursive: true });
    mkdirSync(join(temporary, "evidence"));
    for (const [path, source] of [
      ["core/src/lib.rs", "fn exact() {}\n"],
      ["core/Cargo.toml", "[package]\nname='exact'\n"],
      ["core/Cargo.lock", "# exact\n"],
      ["core/build.rs", "fn main() {}\n"],
      ["dependency.txt", "pinned\n"],
    ]) writeFileSync(join(temporary, path), source);
    const record = (path) => ({ path, sha256: digest(join(temporary, path)) });
    writeFileSync(join(temporary, "evidence", "safety.json"), JSON.stringify({
      schema: "sagejs.rust-class-group/safety-provenance-audit-v1",
      sourceProvenance: [
        {
          file: "build.rs",
          sha256: digest(join(temporary, "core/build.rs")),
        },
        {
          file: "src/lib.rs",
          sha256: digest(join(temporary, "core/src/lib.rs")),
        },
      ],
      dependencyInputs: [],
    }));
    writeFileSync(join(temporary, "evidence", "provenance.json"), JSON.stringify({
      modules: [{
        path: "core/src/lib.rs",
        sha256: digest(join(temporary, "core/src/lib.rs")),
      }],
      inputs: {
        cargo_toml: record("core/Cargo.toml"),
        cargo_lock: record("core/Cargo.lock"),
        build_rs: record("core/build.rs"),
        native_dependency_declarations: [record("dependency.txt")],
      },
    }));
    const policy = {
      candidate_root: "core",
      safety_audit_receipt: "evidence/safety.json",
      provenance: { manifest: "evidence/provenance.json" },
    };
    validateRustEvidenceFreshness(policy, temporary);
    writeFileSync(join(temporary, "core/src/lib.rs"), "fn drifted() {}\n");
    assert.throws(
      () => validateRustEvidenceFreshness(policy, temporary),
      /safety receipt source hash is stale/,
    );
    writeFileSync(join(temporary, "core/src/lib.rs"), "fn exact() {}\n");
    writeFileSync(join(temporary, "dependency.txt"), "drifted\n");
    assert.throws(
      () => validateRustEvidenceFreshness(policy, temporary),
      /provenance input hash is stale/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("a Rust distribution receipt cannot omit a promotion gate", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rust-promotion-"));
  try {
    const gates = Object.fromEntries(
      rustPolicyManifest.promotion.required_gates.map((gate) => [gate, "passed"]),
    );
    delete gates.W0;
    const path = "incomplete.json";
    writeFileSync(join(temporary, path), JSON.stringify({
      schema: "sagejs.rust-math-core/promotion-receipt-v1",
      status: "qualified",
      artifact_sha256: "a".repeat(64),
      workload_sha256: "b".repeat(64),
      reviewer: "independent-reviewer",
      platforms: rustPolicyManifest.platforms.promotion_required,
      gates,
    }));
    const reference = {
      path,
      sha256: createHash("sha256").update(
        readFileSync(join(temporary, path)),
      ).digest("hex"),
    };
    assert.throws(
      () => validateDistributionReceipt(
        reference,
        temporary,
        "core/src/lib.rs",
        rustPolicyManifest,
      ),
      /does not record every required gate as passed/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("Rust cross-field classifications fail closed", () => {
  const tracked = codeManifest.files.map((entry) => entry.path);
  const pending = codeManifest.files.find((entry) =>
    entry.path.endsWith(".rs") && entry.safety_review === "pending-documentation"
  );
  assert.ok(pending);
  const acceptedUnsafe = structuredClone(codeManifest);
  acceptedUnsafe.files.find((entry) => entry.path === pending.path).review_status =
    "accepted";
  assert.throws(
    () => validateNativeCode(acceptedUnsafe, { trackedFiles: tracked }),
    /cannot be accepted while safety documentation is pending/,
  );

  const mathematical = codeManifest.files.find((entry) =>
    entry.rust_role === "mathematical-core" &&
    entry.path.startsWith(`${rustPolicyManifest.candidate_root}/src/`)
  );
  const disguised = structuredClone(codeManifest);
  disguised.files.find((entry) => entry.path === mathematical.path).category =
    "benchmark-reference";
  assert.throws(
    () => validateNativeCode(disguised, { trackedFiles: tracked }),
    /mathematical Rust core has an incompatible category or path/,
  );

  const contradicted = structuredClone(codeManifest);
  contradicted.files.find((entry) => entry.path === mathematical.path)
    .provenance_class = "generated-upstream";
  assert.throws(
    () => validateNativeCode(contradicted, { trackedFiles: tracked }),
    /provenance contradicts the dedicated Rust provenance manifest/,
  );

  const translated = codeManifest.files.find((entry) =>
    entry.provenance_class === "source-translation" &&
    entry.path.startsWith(`${rustPolicyManifest.candidate_root}/src/`)
  );
  const missingMapping = structuredClone(codeManifest);
  missingMapping.files.find((entry) => entry.path === translated.path)
    .provenance_mapping_status = "not-applicable";
  assert.throws(
    () => validateNativeCode(missingMapping, { trackedFiles: tracked }),
    /mapping status contradicts its source map/,
  );

  const fakeGenerated = structuredClone(codeManifest);
  const fakeGeneratedEntry = fakeGenerated.files.find(
    (entry) => entry.path === mathematical.path,
  );
  fakeGeneratedEntry.rust_role = "generated-binding";
  assert.throws(
    () => validateNativeCode(fakeGenerated, { trackedFiles: tracked }),
    /generated Rust binding lacks generated classification/,
  );

  const falselyReviewed = structuredClone(codeManifest);
  const safe = falselyReviewed.files.find((entry) =>
    entry.path.endsWith(".rs") && entry.safety_review === "not-applicable"
  );
  safe.distribution_status = "reviewed-for-distribution";
  assert.throws(
    () => validateNativeCode(falselyReviewed, { trackedFiles: tracked }),
    /distribution receipt/,
  );

  const fakeReceipt = structuredClone(codeManifest);
  const fakeReceiptEntry = fakeReceipt.files.find(
    (entry) => entry.path === pending.path,
  );
  const unrelatedReceiptPath = "architecture/rust-math-core-policy.json";
  fakeReceiptEntry.safety_review = "reviewed";
  fakeReceiptEntry.review_status = "accepted";
  fakeReceiptEntry.safety_receipt = {
    path: unrelatedReceiptPath,
    sha256: createHash("sha256").update(
      readFileSync(join(root, unrelatedReceiptPath)),
    ).digest("hex"),
  };
  assert.throws(
    () => validateNativeCode(fakeReceipt, { trackedFiles: tracked }),
    /must use the declared Rust safety audit/,
  );
});

test("Rust ABI inventory covers exports, imports, link names, and statics", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rust-abi-"));
  try {
    writeFileSync(join(temporary, "Cargo.toml"), '[package]\nname="fixture"\n');
    writeFileSync(
      join(temporary, "fixture.rs"),
      '// #[no_mangle] pub extern "C" fn fake() {}\n' +
      'const GHOST: &str = r###"#[no_mangle] pub extern "C" fn ghost() {}"###;\n' +
      'const BYTE_GHOST: &[u8] = br###"unsafe extern "C" { fn byte_ghost(); }"###;\n' +
      'const ORDINARY_GHOST: &str = "#[no_mangle] pub extern \\"C\\" fn ordinary_ghost() {}";\n' +
      'const QUOTE: char = \'"\';\n' +
      '#[unsafe(no_mangle)] pub extern "C" fn visible() {}\n' +
      '#[unsafe(export_name = "renamed")] pub extern "C" fn local() {}\n' +
      'unsafe extern "C" {\n' +
      '  #[link_name = "real_import"] fn logical();\n' +
      '  static mut STATE: i32;\n' +
      '}\n',
    );
    const boundaries = rustAbiBoundaries(temporary, ["fixture.rs"]);
    assert.deepEqual(
      boundaries.map((entry) => [entry.kind, entry.linked_symbol || entry.export]).sort(),
      [
        ["rust-abi-export", "renamed"],
        ["rust-abi-export", "visible"],
        ["rust-abi-import", "STATE"],
        ["rust-abi-import", "real_import"],
      ],
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("the current Rust qualification ABI is symbol-inventoried", () => {
  const exports = boundaryManifest.boundaries.filter(
    (entry) => entry.kind === "rust-abi-export",
  );
  const imports = boundaryManifest.boundaries.filter(
    (entry) => entry.kind === "rust-abi-import",
  );
  assert.equal(exports.length, boundaryManifest.counts["rust-abi-export"]);
  assert.equal(imports.length, boundaryManifest.counts["rust-abi-import"]);
  assert.ok(exports.length >= 30);
  assert.ok(imports.length >= 56);
  assert.ok(exports.some((entry) =>
    entry.export === "sagejs_class_group_context_step"
  ));
  assert.ok(imports.some((entry) =>
    entry.linked_symbol === "sagejs_rust_flint_compact_cubic_regulator"
  ));
});

test("compiler witnesses retain same-source fallbacks and avoid name substitution", () => {
  const result = validateKernelRegistry(kernelManifest);
  assert.ok(result.kernels.length >= 3);
  assert.ok(result.kernels.every((kernel) =>
    kernel.host_isolation === "certified"
  ));
  const changed = structuredClone(kernelManifest);
  changed.kernels[0].fallback = "replacement";
  assert.throws(
    () => validateKernelRegistry(changed),
    /same-source fallback/,
  );
  const migration = structuredClone(kernelManifest);
  migration.policy.host_isolation_statuses.push("migration-required");
  migration.kernels[0].host_isolation = "migration-required";
  assert.throws(
    () => validateKernelRegistry(migration),
    /host-isolation certified/,
  );
});
