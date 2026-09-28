#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} = require("node:fs");
const { extname, join, relative, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const CODE_MANIFEST = join(ROOT, "architecture", "native-code.json");
const AUDIT_MANIFEST = join(ROOT, "architecture", "native-audit.json");
const KERNEL_MANIFEST = join(ROOT, "architecture", "native-kernels.json");
const EXPORT_MANIFEST = join(ROOT, "architecture", "native-exports.json");
const RUST_POLICY_MANIFEST = join(
  ROOT,
  "architecture",
  "rust-math-core-policy.json",
);
const ffiDeclarations = require("../tools/ffi/declarations.cjs");
const ffiBoundaryAudit = require("../tools/ffi/boundary-audit.cjs");
const ffiNativeExportAudit = require("../tools/ffi/native-export-audit.cjs");
const {
  descriptorSelectionReceipts,
} = require("../tools/native-kernel/automatic-selection.cjs");
const {
  checkGeneratedClassification,
} = require("./check-generated-classification.cjs");

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function repositoryPath(value, label) {
  if (
    typeof value !== "string" || value.length === 0 ||
    value.startsWith("/") || value.includes("\\") ||
    value.split("/").includes("..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return value;
}

function requireExactSet(actual, expected, label) {
  if (
    !Array.isArray(actual) || actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    expected.some((value) => !actual.includes(value))
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}`);
  }
}

function sha256File(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function repositoryFiles(root) {
  return execFileSync("git", [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ], {
    cwd: root,
    encoding: "utf8",
  }).split("\0").filter(Boolean).sort();
}

function validateRustEvidenceFreshness(manifest, root) {
  const candidateRoot = manifest.candidate_root;
  const safetyPath = manifest.safety_audit_receipt;
  const safety = readJson(join(root, safetyPath));
  if (safety.schema !== "sagejs.rust-class-group/safety-provenance-audit-v1") {
    throw new Error("Rust safety receipt has an unexpected schema");
  }
  const sourceSuffixes = new Set([".rs", ".c", ".h", ".cc", ".cpp", ".hpp"]);
  const expectedSafetyFiles = repositoryFiles(root)
    .filter((path) => path.startsWith(`${candidateRoot}/`))
    .filter((path) => sourceSuffixes.has(extname(path)))
    .map((path) => path.slice(candidateRoot.length + 1));
  const recordedSafetyFiles = (safety.sourceProvenance || [])
    .map((record) => record.file)
    .sort();
  if (JSON.stringify(expectedSafetyFiles) !== JSON.stringify(recordedSafetyFiles)) {
    throw new Error("Rust safety receipt source inventory is stale");
  }
  for (const record of safety.sourceProvenance) {
    const filename = join(root, candidateRoot, record.file);
    if (record.sha256 !== sha256File(filename)) {
      throw new Error(`Rust safety receipt source hash is stale: ${record.file}`);
    }
  }
  for (const record of safety.dependencyInputs || []) {
    const filename = join(root, candidateRoot, record.file);
    if (!existsSync(filename) || record.sha256 !== sha256File(filename)) {
      throw new Error(`Rust safety receipt dependency hash is stale: ${record.file}`);
    }
  }

  const provenance = readJson(join(root, manifest.provenance.manifest));
  const expectedModules = repositoryFiles(root)
    .filter((path) => path.startsWith(`${candidateRoot}/src/`))
    .filter((path) => path.endsWith(".rs") || path.endsWith(".c"));
  const recordedModules = (provenance.modules || []).map((record) => record.path).sort();
  if (JSON.stringify(expectedModules) !== JSON.stringify(recordedModules)) {
    throw new Error("Rust provenance module inventory is stale");
  }
  for (const record of provenance.modules) {
    if (record.sha256 !== sha256File(join(root, record.path))) {
      throw new Error(`Rust provenance source hash is stale: ${record.path}`);
    }
  }
  const provenanceInputs = [
    provenance.inputs?.cargo_toml,
    provenance.inputs?.cargo_lock,
    provenance.inputs?.build_rs,
    ...(provenance.inputs?.native_dependency_declarations || []),
  ];
  for (const record of provenanceInputs) {
    if (
      record === undefined || !existsSync(join(root, record.path)) ||
      record.sha256 !== sha256File(join(root, record.path))
    ) {
      throw new Error(`Rust provenance input hash is stale: ${record?.path || "missing"}`);
    }
  }
}

function validateReceiptReference(reference, root, label) {
  if (reference === null || typeof reference !== "object" || Array.isArray(reference)) {
    throw new Error(`${label} must be an exact receipt reference`);
  }
  const path = repositoryPath(reference.path, `${label} path`);
  if (!/^[0-9a-f]{64}$/.test(reference.sha256 || "")) {
    throw new Error(`${label} must include a lowercase SHA-256 digest`);
  }
  const filename = join(root, path);
  if (!existsSync(filename)) throw new Error(`${label} is missing: ${path}`);
  if (sha256File(filename) !== reference.sha256) {
    throw new Error(`${label} digest does not match ${path}`);
  }
  return path;
}

function validateSafetyReceiptForFile(reference, root, entryPath, policy) {
  const label = `${entryPath} safety receipt`;
  const path = validateReceiptReference(reference, root, label);
  if (path !== policy.safety_audit_receipt) {
    throw new Error(`${label} must use the declared Rust safety audit`);
  }
  const receipt = readJson(join(root, path));
  if (receipt.schema !== "sagejs.rust-class-group/safety-provenance-audit-v1") {
    throw new Error(`${label} has an unexpected schema`);
  }
  const prefix = `${policy.candidate_root}/`;
  if (!entryPath.startsWith(prefix)) {
    throw new Error(`${label} source is outside the candidate root`);
  }
  const relativePath = entryPath.slice(prefix.length);
  const source = (receipt.sourceProvenance || []).find(
    (record) => record.file === relativePath,
  );
  if (!source || source.sha256 !== sha256File(join(root, entryPath))) {
    throw new Error(`${label} does not bind the current source bytes`);
  }
  const findings = [
    ...(receipt.unsafeItems || []),
    ...(receipt.ffiBoundaries || []),
  ].filter((finding) => finding.file === relativePath);
  if (
    findings.length === 0 ||
    findings.some((finding) => finding.safetyRationale?.present !== true)
  ) {
    throw new Error(`${label} does not document every unsafe and FFI boundary`);
  }
  for (const field of ["unclassifiedSafetyTokens", "unclassifiedFfiTokens"]) {
    if ((receipt[field] || []).some((finding) => finding.file === relativePath)) {
      throw new Error(`${label} retains an unclassified safety-sensitive token`);
    }
  }
  return receipt;
}

function validateDistributionReceipt(reference, root, entryPath, policy) {
  const label = `${entryPath} distribution receipt`;
  const path = validateReceiptReference(reference, root, label);
  const receipt = readJson(join(root, path));
  if (
    receipt.schema !== policy.promotion.distribution_receipt_schema ||
    receipt.status !== "qualified" ||
    !/^[0-9a-f]{64}$/.test(receipt.artifact_sha256 || "") ||
    !/^[0-9a-f]{64}$/.test(receipt.workload_sha256 || "") ||
    typeof receipt.reviewer !== "string" || receipt.reviewer.trim().length < 3
  ) {
    throw new Error(`${label} is not a valid qualified promotion receipt`);
  }
  if (
    receipt.gates === null || typeof receipt.gates !== "object" ||
    Array.isArray(receipt.gates) ||
    Object.keys(receipt.gates).length !== policy.promotion.required_gates.length ||
    policy.promotion.required_gates.some((gate) => receipt.gates[gate] !== "passed")
  ) {
    throw new Error(`${label} does not record every required gate as passed`);
  }
  requireExactSet(
    receipt.platforms,
    policy.platforms.promotion_required,
    `${label} platforms`,
  );
  return receipt;
}

function rustCodeWithoutCommentsOrLiterals(source) {
  const output = [...source];
  let index = 0;
  let blockDepth = 0;
  const blank = (start, end, replacement = "") => {
    for (let position = start; position < end; position += 1) {
      if (source[position] !== "\n") output[position] = " ";
    }
    for (let offset = 0; offset < replacement.length && start + offset < end; offset += 1) {
      output[start + offset] = replacement[offset];
    }
  };
  while (index < source.length) {
    if (blockDepth > 0) {
      if (source.startsWith("/*", index)) {
        blank(index, index + 2);
        blockDepth += 1;
        index += 2;
      } else if (source.startsWith("*/", index)) {
        blank(index, index + 2);
        blockDepth -= 1;
        index += 2;
      } else {
        blank(index, index + 1);
        index += 1;
      }
      continue;
    }
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index);
      blank(index, end < 0 ? source.length : end);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (source.startsWith("/*", index)) {
      blank(index, index + 2);
      blockDepth = 1;
      index += 2;
      continue;
    }
    const raw = source.slice(index).match(/^(?:b)?r(#{0,16})"/);
    if (raw) {
      const delimiter = `"${raw[1]}`;
      const found = source.indexOf(delimiter, index + raw[0].length);
      const end = found < 0 ? source.length : found + delimiter.length;
      blank(index, end, '""');
      index = end;
      continue;
    }
    const stringPrefix = source.startsWith('b"', index) ? 2 :
      source[index] === '"' ? 1 : 0;
    if (stringPrefix > 0) {
      let end = index + stringPrefix;
      let escaped = false;
      while (end < source.length) {
        const character = source[end];
        end += 1;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') break;
      }
      blank(index, end, '""');
      index = end;
      continue;
    }
    const character = source.slice(index).match(/^(?:b)?'(?:\\.|[^\\'\n])'/);
    if (character) {
      blank(index, index + character[0].length);
      index += character[0].length;
      continue;
    }
    index += 1;
  }
  return output.join("");
}

function rustSafetySensitive(source) {
  const code = rustCodeWithoutCommentsOrLiterals(source);
  return /\bunsafe\b/.test(code) || /\bextern\s*""/.test(code) ||
    /#\s*\[\s*(?:unsafe\s*\()?\s*(?:no_mangle|export_name|link_name)\b/.test(code);
}

function validateRustMathCorePolicy(manifest, options = {}) {
  const root = options.root || ROOT;
  if (manifest.schema_version !== 1) {
    throw new Error("unsupported Rust math-core policy schema");
  }
  for (const field of ["decision", "qualification_plan", "candidate_root"]) {
    const path = repositoryPath(manifest[field], `Rust math-core ${field}`);
    if (!existsSync(join(root, path))) {
      throw new Error(`Rust math-core ${field} is missing: ${path}`);
    }
  }
  const safetyReceipt = repositoryPath(
    manifest.safety_audit_receipt,
    "Rust math-core safety audit receipt",
  );
  if (!existsSync(join(root, safetyReceipt))) {
    throw new Error(`Rust math-core safety audit receipt is missing: ${safetyReceipt}`);
  }
  if (
    manifest.backend_id !== "handwritten-rust-math-core" ||
    manifest.status !== "alpha-automatic-dispatch" ||
    manifest.source_model !== "separate-handwritten-implementation" ||
    manifest.automatic_dispatch !==
      "enabled-for-admitted-cubic-and-imaginary-quadratic-alpha"
  ) {
    throw new Error(
      "Rust math core must remain a separate alpha, production-receipt-gated backend",
    );
  }
  const automaticDispatch = manifest.automatic_dispatch_contract || {};
  if (
    automaticDispatch.release_channel !== "alpha" ||
    automaticDispatch.admitted_domain !==
      "absolute-irreducible-cubic-number-fields-accepted-by-public-preparation" ||
    automaticDispatch.proof_false_authority !==
      "exact-relations-conditional-grh" ||
    automaticDispatch.proof_true_authority !==
      "exact-unconditional-after-authenticated-minkowski-suffix" ||
    automaticDispatch.fallback_boundary !==
      "typed-capability-decline-before-publication-only" ||
    automaticDispatch.artifact_binding !==
      "authenticated-host-artifact-sha256" ||
    automaticDispatch.distribution_gate !==
      "existing-release-provenance-safety-and-license-review" ||
    automaticDispatch.production_promotion_receipt_required !== true ||
    automaticDispatch.authorization !==
      "explicit-project-owner-alpha-landing-2026-09-22"
  ) {
    throw new Error(
      "Rust math-core alpha dispatch must retain its admitted domain, proof, fallback, artifact, and production-promotion boundaries",
    );
  }
  const imaginaryDispatch =
    manifest.imaginary_quadratic_automatic_dispatch_contract || {};
  if (
    imaginaryDispatch.release_channel !== "alpha" ||
    imaginaryDispatch.admitted_domain !==
      "negative-fundamental-discriminant-at-most-200000000000-and-at-most-50000-reduced-forms" ||
    imaginaryDispatch.proof_authority !==
      "exact-unconditional-complete-reduced-form-enumeration" ||
    imaginaryDispatch.fallback_boundary !==
      "typed-capability-or-resource-decline-before-publication-only" ||
    imaginaryDispatch.artifact_binding !== "authenticated-host-artifact-sha256" ||
    imaginaryDispatch.distribution_gate !==
      "existing-release-provenance-safety-and-license-review" ||
    imaginaryDispatch.production_promotion_receipt_required !== true ||
    imaginaryDispatch.authorization !==
      "project-owner-public-imaginary-quadratic-goal-2026-09-24"
  ) {
    throw new Error(
      "Rust imaginary-quadratic alpha dispatch must retain its unconditional domain, fallback, artifact, and distribution boundaries",
    );
  }
  const contract = manifest.public_contract || {};
  if (
    contract.semantic_owner !== "ordinary-python" ||
    contract.dynamic_fallback !== "required-when-correct-for-request" ||
    contract.unsupported_behavior !== "explicit-capability-or-resource-status" ||
    contract.silent_proof_or_backend_change !== "prohibited"
  ) {
    throw new Error("Rust math core must preserve the public dynamic fallback contract");
  }
  const provenance = manifest.provenance || {};
  for (const field of [
    "per_source_classification",
    "source_correspondence_required",
    "dependency_source_identity_required",
    "license_metadata_required",
    "distribution_notice_review_required",
  ]) {
    if (provenance[field] !== true) {
      throw new Error(`Rust math-core provenance must require ${field}`);
    }
  }
  if (provenance.pari_source_identity !== "PARI-2.17.4") {
    throw new Error("Rust math-core PARI provenance must remain pinned to 2.17.4");
  }
  const provenanceManifest = repositoryPath(
    provenance.manifest,
    "Rust math-core provenance manifest",
  );
  if (!existsSync(join(root, provenanceManifest))) {
    throw new Error(`Rust math-core provenance manifest is missing: ${provenanceManifest}`);
  }
  const implementation = manifest.implementation || {};
  requireExactSet(
    implementation.required_adapters,
    ["native", "wasm"],
    "Rust math-core required adapters",
  );
  if (
    implementation.host_independent_core !== true ||
    implementation.host_callbacks_after_marshalling !== "prohibited" ||
    implementation.scalar_host_crossings_in_hot_path !== "prohibited" ||
    implementation.public_abi !== "versioned-host-neutral-c-or-equivalent-wasm" ||
    implementation.transactional_complete_result !== true
  ) {
    throw new Error("Rust math core must use one isolated core and a stable complete-result ABI");
  }
  requireExactSet(
    manifest.required_diagnostics,
    [
      "backend",
      "capabilities",
      "artifact-identity",
      "proof-mode",
      "completion-status",
      "fallback-reason",
      "resource-limits",
      "fresh-or-cached",
    ],
    "Rust math-core diagnostics",
  );
  for (const [section, fields] of Object.entries({
    inspectability: [
      "reachable-source-graph",
      "source-provenance",
      "unsafe-inventory",
      "native-and-wasm-dependency-closure",
      "stage-telemetry",
      "reproducible-build-receipt",
      "artifact-hashes-and-sizes",
    ],
    validation: [
      "dynamic-reference-oracle",
      "native-differential",
      "wasm-differential",
      "mathematical-certificate-replay",
      "representative-benchmarks",
      "held-out-corpus",
      "failures-and-timeouts-retained",
    ],
  })) {
    for (const field of fields) {
      if (manifest[section]?.[field] !== true) {
        throw new Error(`Rust math-core ${section} must require ${field}`);
      }
    }
  }
  requireExactSet(
    manifest.platforms?.promotion_required,
    ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64", "browser-wasm"],
    "Rust math-core promotion platforms",
  );
  const windows = manifest.platforms?.windows || {};
  if (
    windows.native_is_first_class !== true ||
    windows.unsupported_dependency_requires_capability_flag !== true ||
    windows.correct_fallback_must_be_tested !== true ||
    windows.wsl_msys2_mingw_user_path !== "prohibited"
  ) {
    throw new Error("Rust math core must retain native Windows capability and fallback gates");
  }
  const promotion = manifest.promotion || {};
  requireExactSet(
    promotion.required_gates,
    ["R0", "W0", "R1", "R2", "R3", "R4", "R5", "independent-review"],
    "Rust math-core promotion gates",
  );
  if (
    promotion.receipt_required !== true ||
    promotion.receipt_binds_exact_artifact !== true ||
    promotion.receipt_binds_admitted_workload !== true ||
    promotion.safety_review_required !== "reviewed" ||
    promotion.provenance_mapping_required !== "complete" ||
    promotion.safety_receipt_promotion_gate_required !== true ||
    promotion.distribution_receipt_schema !==
      "sagejs.rust-math-core/promotion-receipt-v1" ||
    promotion.partial_result_may_claim_production !== false
  ) {
    throw new Error("Rust math-core promotion must remain exact-receipt gated");
  }
  const sourcePolicy = manifest.rust_source_policy || {};
  if (sourcePolicy.qualification_status !== "experimental-qualification") {
    throw new Error("Rust source policy must remain experimental during qualification");
  }
  if (sourcePolicy.experimental_pending_safety_allowed !== true) {
    throw new Error("Rust qualification must state whether pending safety review is allowed");
  }
  for (const [field, values] of Object.entries({
    roles: [
      "mathematical-core",
      "foreign-library-bridge",
      "host-adapter",
      "qualification-harness",
      "generated-binding",
    ],
    provenance_classes: [
      "original-sagejs",
      "behavioral-reimplementation",
      "source-translation",
      "qualification-harness",
      "generated-upstream",
    ],
    distribution_statuses: [
      "qualification-only",
      "review-required-before-distribution",
      "reviewed-for-distribution",
    ],
    safety_review_states: [
      "not-applicable",
      "pending-documentation",
      "reviewed",
    ],
    provenance_mapping_states: ["not-applicable", "pending", "complete"],
  })) {
    requireExactSet(sourcePolicy[field], values, `Rust source-policy ${field}`);
  }
  validateRustEvidenceFreshness(manifest, root);
  return manifest;
}

function trackedNativeExtensions(root = ROOT) {
  const manifest = readJson(join(root, "architecture", "native-code.json"));
  const extensions = manifest.policy?.tracked_extensions;
  if (
    !Array.isArray(extensions) || extensions.length === 0 ||
    extensions.some((extension) =>
      typeof extension !== "string" || !/^\.[a-z0-9]+$/.test(extension)
    ) || new Set(extensions).size !== extensions.length
  ) {
    throw new Error("native-code tracked_extensions must be unique file extensions");
  }
  return [...extensions];
}

function nativeFiles(root = ROOT, extensions = undefined) {
  const tracked = repositoryFiles(root);
  const allowed = new Set(extensions ?? trackedNativeExtensions(root));
  return tracked.filter((filename) => allowed.has(extname(filename))).sort();
}

function sourceFiles(directory, suffix = ".cjs") {
  const result = [];
  if (!existsSync(directory)) return result;
  for (const name of readdirSync(directory)) {
    const filename = join(directory, name);
    if (statSync(filename).isDirectory()) result.push(...sourceFiles(filename, suffix));
    else if (filename.endsWith(suffix)) result.push(filename);
  }
  return result.sort();
}

function validateNativeCode(manifest, options = {}) {
  const root = options.root || ROOT;
  if (manifest.schema_version !== 1) {
    throw new Error("unsupported native-code manifest schema");
  }
  if (manifest.policy?.default !== "reject-unclassified") {
    throw new Error("native-code policy must reject unclassified files");
  }
  if (!manifest.policy?.tracked_extensions?.includes(".rs")) {
    throw new Error("native-code policy must fail closed on tracked Rust source");
  }
  const categories = new Set(manifest.policy.categories || []);
  const statuses = new Set(manifest.policy.review_statuses || []);
  const lanes = new Set(
    readJson(join(root, ".agents", "lanes.json")).lanes.map((lane) => lane.id),
  );
  const rustPolicy = validateRustMathCorePolicy(
    options.rustPolicy || readJson(join(root, "architecture", "rust-math-core-policy.json")),
    { root },
  );
  const rustRoles = new Set(rustPolicy.rust_source_policy.roles);
  const rustProvenance = new Set(rustPolicy.rust_source_policy.provenance_classes);
  const rustDistribution = new Set(
    rustPolicy.rust_source_policy.distribution_statuses,
  );
  const rustSafetyReview = new Set(
    rustPolicy.rust_source_policy.safety_review_states,
  );
  const rustMappingStates = new Set(
    rustPolicy.rust_source_policy.provenance_mapping_states,
  );
  const provenanceManifest = readJson(join(root, rustPolicy.provenance.manifest));
  const provenanceClasses = new Map((provenanceManifest.modules || []).map((module) => [
    module.path,
    {
      classification: {
        original: "original-sagejs",
        behavioral_reimplementation: "behavioral-reimplementation",
        source_translation_adaptation: "source-translation",
      }[module.classification],
      mappingStatus: module.mapping_status,
      mappings: module.mappings,
      missingExplanation: module.missing_mapping_explanation,
    },
  ]));
  const byPath = new Map();
  for (const entry of manifest.files || []) {
    const path = repositoryPath(entry.path, "native-code path");
    if (byPath.has(path)) throw new Error(`duplicate native-code entry: ${path}`);
    if (!categories.has(entry.category)) {
      throw new Error(`${path} has unknown native category ${entry.category}`);
    }
    if (!statuses.has(entry.review_status)) {
      throw new Error(`${path} has unknown review status ${entry.review_status}`);
    }
    if (!lanes.has(entry.lane)) {
      throw new Error(`${path} has unknown owner lane ${entry.lane}`);
    }
    if (typeof entry.rationale !== "string" || entry.rationale.trim().length < 20) {
      throw new Error(`${path} needs a substantive native-code rationale`);
    }
    if (entry.category === "generated-upstream" && entry.review_status !== "generated") {
      throw new Error(`${path} generated code must use generated review status`);
    }
    if (entry.category !== "generated-upstream" && entry.review_status === "generated") {
      throw new Error(`${path} may not use generated review status`);
    }
    if (extname(path) === ".rs") {
      if (!rustRoles.has(entry.rust_role)) {
        throw new Error(`${path} has unknown Rust role ${entry.rust_role}`);
      }
      if (entry.qualification_status !== "experimental-qualification") {
        throw new Error(`${path} must remain explicitly experimental during qualification`);
      }
      if (!rustProvenance.has(entry.provenance_class)) {
        throw new Error(
          `${path} has unknown Rust provenance class ${entry.provenance_class}`,
        );
      }
      if (!rustDistribution.has(entry.distribution_status)) {
        throw new Error(
          `${path} has unknown Rust distribution status ${entry.distribution_status}`,
        );
      }
      if (!rustSafetyReview.has(entry.safety_review)) {
        throw new Error(`${path} has unknown Rust safety-review state ${entry.safety_review}`);
      }
      if (
        typeof entry.safety_rationale !== "string" ||
        entry.safety_rationale.trim().length < 30
      ) {
        throw new Error(`${path} needs an explicit per-file Rust safety rationale`);
      }
      const sensitive = rustSafetySensitive(readFileSync(join(root, path), "utf8"));
      if (sensitive && entry.safety_review === "not-applicable") {
        throw new Error(`${path} contains an unsafe or FFI boundary but claims no safety review`);
      }
      if (entry.safety_review === "pending-documentation") {
        if (!rustPolicy.rust_source_policy.experimental_pending_safety_allowed) {
          throw new Error(`${path} has pending safety work forbidden by Rust policy`);
        }
        if (entry.review_status === "accepted" || entry.review_status === "audited") {
          throw new Error(`${path} cannot be accepted while safety documentation is pending`);
        }
      }
      if (entry.safety_review === "reviewed") {
        validateSafetyReceiptForFile(entry.safety_receipt, root, path, rustPolicy);
      }
      if (!sensitive && entry.safety_review === "pending-documentation") {
        throw new Error(`${path} claims pending safety documentation but has no safety boundary`);
      }
      if (!rustMappingStates.has(entry.provenance_mapping_status)) {
        throw new Error(
          `${path} has unknown provenance mapping state ${entry.provenance_mapping_status}`,
        );
      }
      const candidateSource = [rustPolicy.candidate_root].some((root) =>
        path.startsWith(`${root}/src/`)
      );
      const legacyCandidateSource = (rustPolicy.legacy_candidate_roots || []).some(
        (root) => path.startsWith(`${root}/src/`),
      );
      const qualificationHarness = entry.rust_role === "qualification-harness";
      if (entry.rust_role === "mathematical-core" && (
        entry.category !== "mathematical-algorithm" ||
        (!candidateSource && !legacyCandidateSource)
      )) {
        throw new Error(`${path} mathematical Rust core has an incompatible category or path`);
      }
      if (qualificationHarness && (
        entry.category !== "benchmark-reference" ||
        !(path.includes("/qualification/") || path.includes("/tests/"))
      )) {
        throw new Error(`${path} qualification harness has an incompatible category or path`);
      }
      if (entry.rust_role === "generated-binding" && (
        entry.category !== "generated-upstream" || entry.review_status !== "generated"
      )) {
        throw new Error(`${path} generated Rust binding lacks generated classification`);
      }
      if (candidateSource) {
        const dedicated = provenanceClasses.get(path);
        if (!dedicated || dedicated.classification === undefined) {
          throw new Error(`${path} is missing from the dedicated Rust provenance manifest`);
        }
        if (dedicated.classification !== entry.provenance_class) {
          throw new Error(
            `${path} provenance contradicts the dedicated Rust provenance manifest`,
          );
        }
        if (entry.provenance_class === "source-translation") {
          const complete = dedicated.mappingStatus === "complete" &&
            Array.isArray(dedicated.mappings) && dedicated.mappings.length > 0;
          const pending = dedicated.mappingStatus === "missing" &&
            typeof dedicated.missingExplanation === "string" &&
            dedicated.missingExplanation.trim().length >= 30;
          if (!complete && !pending) {
            throw new Error(`${path} lacks a meaningful translation mapping or rationale`);
          }
          const expectedStatus = complete ? "complete" : "pending";
          if (entry.provenance_mapping_status !== expectedStatus) {
            throw new Error(`${path} provenance mapping status contradicts its source map`);
          }
          if (pending && entry.review_status !== "experimental-pending-review") {
            throw new Error(`${path} cannot be accepted while provenance mapping is pending`);
          }
        } else if (entry.provenance_mapping_status !== "not-applicable") {
          throw new Error(`${path} has a mapping state inconsistent with its provenance class`);
        }
      } else if (
        !legacyCandidateSource &&
        entry.provenance_mapping_status !== "not-applicable"
      ) {
        throw new Error(`${path} has an unsupported provenance mapping claim`);
      }
      if (entry.distribution_status === "reviewed-for-distribution") {
        validateDistributionReceipt(
          entry.distribution_receipt,
          root,
          path,
          rustPolicy,
        );
        const safetyReceipt = validateSafetyReceiptForFile(
          entry.safety_receipt,
          root,
          path,
          rustPolicy,
        );
        if (
          safetyReceipt.summary?.promotionGatePassed !== true ||
          safetyReceipt.claims?.productionQualified !== true
        ) {
          throw new Error(`${path} cannot be distribution-reviewed before safety promotion`);
        }
        if (entry.safety_review !== "reviewed") {
          throw new Error(`${path} cannot be distribution-reviewed without safety review`);
        }
        if (
          entry.provenance_class === "source-translation" &&
          entry.provenance_mapping_status !== "complete"
        ) {
          throw new Error(`${path} cannot be distribution-reviewed without source mapping`);
        }
      }
    }
    if (!existsSync(join(root, path))) throw new Error(`native-code file is missing: ${path}`);
    byPath.set(path, entry);
  }
  const tracked = options.trackedFiles || nativeFiles(
    root,
    manifest.policy.tracked_extensions,
  );
  const missing = tracked.filter((path) => !byPath.has(path));
  const stale = [...byPath.keys()].filter((path) => !tracked.includes(path));
  if (missing.length) {
    throw new Error(`unclassified native files:\n  ${missing.join("\n  ")}`);
  }
  if (stale.length) {
    throw new Error(`native-code entries are not tracked files:\n  ${stale.join("\n  ")}`);
  }
  return {
    entries: [...byPath.values()],
    auditRequired: [...byPath.values()].filter(
      (entry) => entry.review_status === "audit-required",
    ),
    audited: [...byPath.values()].filter(
      (entry) => entry.review_status === "audited",
    ),
  };
}

function validateNativeAudit(manifest, code, options = {}) {
  const root = options.root || ROOT;
  if (manifest.schema_version !== 1) {
    throw new Error("unsupported native-audit manifest schema");
  }
  const decisions = new Set(manifest.policy?.decision_values || []);
  const priorities = new Set(manifest.policy?.priority_values || []);
  const requiredOracles = new Set(manifest.policy?.required_oracles || []);
  const nativeByPath = new Map(code.entries.map((entry) => [entry.path, entry]));
  const byPath = new Map();
  for (const entry of manifest.files || []) {
    const path = repositoryPath(entry.path, "native-audit path");
    if (byPath.has(path)) throw new Error(`duplicate native-audit entry: ${path}`);
    const native = nativeByPath.get(path);
    if (native === undefined) {
      throw new Error(`${path} is audited but has no native-code classification`);
    }
    if (native.review_status !== "audited") {
      throw new Error(`${path} has an audit but review status is ${native.review_status}`);
    }
    if (!decisions.has(entry.decision)) {
      throw new Error(`${path} has unknown audit decision ${entry.decision}`);
    }
    if (!priorities.has(entry.priority)) {
      throw new Error(`${path} has unknown audit priority ${entry.priority}`);
    }
    if (!Array.isArray(entry.responsibilities) ||
        entry.responsibilities.length < 2 ||
        entry.responsibilities.some((value) =>
          typeof value !== "string" || value.trim().length < 10
        )) {
      throw new Error(`${path} needs at least two substantive responsibilities`);
    }
    for (const field of ["rationale", "fallback", "next"]) {
      if (typeof entry[field] !== "string" || entry[field].trim().length < 40) {
        throw new Error(`${path} needs a substantive audit ${field}`);
      }
    }
    const oracles = new Set(entry.oracles || []);
    for (const oracle of requiredOracles) {
      if (!oracles.has(oracle)) throw new Error(`${path} audit is missing ${oracle} oracle`);
    }
    const filename = join(root, path);
    const source = readFileSync(filename);
    const actualLines = source.toString("utf8").match(/\n/g)?.length || 0;
    if (entry.lines !== actualLines || entry.bytes !== source.length) {
      throw new Error(
        `${path} audit metrics are stale: expected ${actualLines} lines/` +
          `${source.length} bytes, got ${entry.lines}/${entry.bytes}`,
      );
    }
    if (entry.pilot !== undefined) {
      const pilot = repositoryPath(entry.pilot, `${path}.pilot`);
      if (!existsSync(join(root, pilot))) throw new Error(`${path} pilot is missing: ${pilot}`);
    }
    byPath.set(path, entry);
  }
  const missing = code.audited
    .map((entry) => entry.path)
    .filter((path) => !byPath.has(path));
  const unresolved = code.auditRequired.map((entry) => entry.path);
  if (missing.length) {
    throw new Error(`audited native files lack audit records:\n  ${missing.join("\n  ")}`);
  }
  if (unresolved.length) {
    throw new Error(`native architecture audit remains unresolved:\n  ${unresolved.join("\n  ")}`);
  }
  return { entries: [...byPath.values()] };
}

function validateKernelRegistry(manifest, options = {}) {
  const root = options.root || ROOT;
  if (manifest.schema_version !== 1) {
    throw new Error("unsupported native-kernel registry schema");
  }
  if (manifest.policy?.implementation !== "source-transparent-typed-python") {
    throw new Error("native kernels must use source-transparent typed Python");
  }
  if (manifest.policy?.fallback !== "same-source") {
    throw new Error("native-kernel policy must require a same-source fallback");
  }
  if (manifest.policy?.host_isolation !== "mandatory-after-marshalling") {
    throw new Error(
      "native-kernel policy must prohibit host callbacks after marshalling",
    );
  }
  const requiredIntrospection = new Set(
    manifest.policy.required_introspection || [],
  );
  for (const command of ["explain", "ir", "emit-c", "emit-core-c", "emit-header"]) {
    if (!requiredIntrospection.has(command)) {
      throw new Error(`native-kernel policy is missing ${command} introspection`);
    }
  }
  const isolationStatuses = new Set(
    manifest.policy.host_isolation_statuses || [],
  );
  if (
    isolationStatuses.size !== 1 ||
    !isolationStatuses.has("certified")
  ) {
    throw new Error(
      "every accepted native-kernel witness must be host-isolation certified",
    );
  }
  const packages = readJson(join(root, "package.json"));
  const requiredOracles = new Set(manifest.policy.required_oracles || []);
  const optionalForeignLibraries = new Set(
    manifest.policy.optional_foreign_libraries || [],
  );
  const compilerSources = sourceFiles(join(root, "tools", "native-kernel"));
  const ids = new Set();
  for (const kernel of manifest.kernels || []) {
    if (!/^[a-z][a-z0-9-]*$/.test(kernel.id || "")) {
      throw new Error(`invalid native-kernel id ${JSON.stringify(kernel.id)}`);
    }
    if (ids.has(kernel.id)) throw new Error(`duplicate native-kernel id ${kernel.id}`);
    ids.add(kernel.id);
    const sourcePath = repositoryPath(kernel.source, `${kernel.id}.source`);
    const filename = join(root, sourcePath);
    if (!existsSync(filename)) throw new Error(`${kernel.id} source is missing: ${sourcePath}`);
    if (kernel.fallback !== "same-source") {
      throw new Error(`${kernel.id} must retain a same-source fallback`);
    }
    if (!isolationStatuses.has(kernel.host_isolation)) {
      throw new Error(
        `${kernel.id} has invalid host-isolation status ${kernel.host_isolation}`,
      );
    }
    if (kernel.host_isolation !== "certified") {
      throw new Error(`${kernel.id} is not host-isolation certified`);
    }
    if (
      kernel.wasm_production !== undefined &&
      typeof kernel.wasm_production !== "boolean"
    ) {
      throw new Error(`${kernel.id} wasm_production must be boolean`);
    }
    if (
      kernel.wasm_production === false &&
      (typeof kernel.wasm_fallback_reason !== "string" ||
        kernel.wasm_fallback_reason.length < 12)
    ) {
      throw new Error(`${kernel.id} needs a substantive Wasm fallback reason`);
    }
    if (!Array.isArray(kernel.functions) || kernel.functions.length === 0) {
      throw new Error(`${kernel.id} must list compiled functions`);
    }
    for (const library of kernel.optional_foreign_libraries || []) {
      if (!optionalForeignLibraries.has(library)) {
        throw new Error(
          `${kernel.id} names unknown optional foreign library ${library}`,
        );
      }
    }
    const oracles = new Set(kernel.oracles || []);
    for (const oracle of requiredOracles) {
      if (!oracles.has(oracle)) throw new Error(`${kernel.id} is missing ${oracle} oracle`);
    }
    if (typeof kernel.semantic_domain !== "string" || kernel.semantic_domain.length < 20) {
      throw new Error(`${kernel.id} needs a semantic-domain description`);
    }
    if (!packages.scripts?.[kernel.benchmark]) {
      throw new Error(`${kernel.id} references unknown benchmark ${kernel.benchmark}`);
    }
    const source = readFileSync(filename, "utf8");
    const automaticSelections = descriptorSelectionReceipts(kernel);
    for (const receipt of Object.values(automaticSelections)) {
      for (const evidence of receipt.evidence) {
        const evidencePath = repositoryPath(
          evidence,
          `${kernel.id}.automatic_selection.evidence`,
        );
        if (!existsSync(join(root, evidencePath))) {
          throw new Error(
            `${kernel.id} selection evidence is missing: ${evidencePath}`,
          );
        }
      }
    }
    for (const name of kernel.functions) {
      const definition = new RegExp(
        `@native\\s*(?:\\r?\\n)+def\\s+${name}\\s*\\(`,
      );
      if (!definition.test(source)) {
        throw new Error(`${kernel.id} does not contain @native function ${name}`);
      }
      const token = new RegExp(`\\b${name}\\b`);
      for (const compilerSource of compilerSources) {
        if (token.test(readFileSync(compilerSource, "utf8"))) {
          throw new Error(
            `${kernel.id} function ${name} appears in compiler source ` +
            `${relative(root, compilerSource)}; name-based substitution is prohibited`,
          );
        }
      }
    }
    const platforms = new Set(kernel.platforms || []);
    for (const platform of [
      "linux-x64", "linux-arm64", "windows-x64", "macos-arm64",
    ]) {
      if (!platforms.has(platform)) {
        throw new Error(`${kernel.id} is missing platform ${platform}`);
      }
    }
  }
  if (ids.size < 3) throw new Error("native-kernel registry needs at least three witnesses");
  return { kernels: manifest.kernels };
}

function run() {
  const reviewClassification = checkGeneratedClassification();
  const rustPolicy = validateRustMathCorePolicy(readJson(RUST_POLICY_MANIFEST));
  const code = validateNativeCode(readJson(CODE_MANIFEST));
  const audit = validateNativeAudit(readJson(AUDIT_MANIFEST), code);
  const kernels = validateKernelRegistry(readJson(KERNEL_MANIFEST));
  const ffi = ffiDeclarations.loadRegistry({ root: ROOT });
  const boundaries = ffiBoundaryAudit.validateBoundarySnapshot(
    readJson(ffiBoundaryAudit.snapshotPath(ROOT)), { root: ROOT },
  );
  const nativeExports = ffiNativeExportAudit.validateNativeExportInventory(
    readJson(EXPORT_MANIFEST), { root: ROOT },
  );
  const generatedFfiModules = new Set();
  for (const declaration of ffi.libraries) {
    for (const generated of
      ffiDeclarations.generatedModulePaths(ROOT, declaration)) {
      generatedFfiModules.add(resolve(generated));
      if (!existsSync(generated) ||
          readFileSync(generated, "utf8") !==
            ffiDeclarations.generatePythonModule(declaration)) {
        throw new Error(
          `generated FFI module is missing or stale: ${relative(ROOT, generated)}`,
        );
      }
    }
  }
  for (const filename of sourceFiles(join(ROOT, "src"), ".py")) {
    if (
      readFileSync(filename, "utf8").includes("_runtime.ffi_call(") &&
      !generatedFfiModules.has(resolve(filename))
    ) {
      throw new Error(
        `raw dynamic FFI call outside a generated safe module: ` +
        `${relative(ROOT, filename)}`,
      );
    }
  }
  console.log(
    `Native architecture is classified: ${code.entries.length} native files, ` +
    `${audit.entries.length} with completed focused audits.`,
  );
  console.log(
    `Rust mathematical backend policy is ${rustPolicy.status}; ` +
    `automatic dispatch remains ${rustPolicy.automatic_dispatch}.`,
  );
  console.log(
    `Source-transparent compiler witness set is valid: ` +
    `${kernels.kernels.length} kernel families.`,
  );
  console.log(
    `Explicit FFI registry is valid: ${ffi.libraries.length} libraries, ` +
    `${ffi.libraries.reduce((sum, item) => sum + item.functions.length, 0)} functions.`,
  );
  console.log(
    `Native boundary ratchet is current: ${boundaries.boundaries.length} ` +
    `classified files and exported interfaces.`,
  );
  console.log(
    `Every N-API export has a symbol-level decision: ` +
    `${nativeExports.exports.length} classified exports.`,
  );
  console.log(
    `Review classification is exact: ${reviewClassification.generated} ` +
    `generated artifacts and ${reviewClassification.authoritative} ` +
    `authoritative tracked paths.`,
  );
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  nativeFiles,
  trackedNativeExtensions,
  validateDistributionReceipt,
  validateNativeAudit,
  validateKernelRegistry,
  validateNativeCode,
  validateRustMathCorePolicy,
  validateRustEvidenceFreshness,
  rustSafetySensitive,
};
