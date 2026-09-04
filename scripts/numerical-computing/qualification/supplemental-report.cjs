"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentDigestPath,
  contentId,
  digestBundle,
  digestPath,
  parseJsonText,
  pretty,
  readJson,
  repositoryPath,
  sha256,
} = require("../common.cjs");
const {
  REPORT_SCHEMA,
  validateCapabilityManifest,
  validateCorpus,
  validateMatrixPolicy,
} = require("../contracts.cjs");
const { verifyReceipt } = require("../receipt.cjs");
const { buildReport } = require("../report.cjs");
const { renderMatrix } = require("./render-matrix.cjs");
const {
  createBinding: createBrowserExecutableBinding,
  validateBinding: validateBrowserExecutableBinding,
} = require("./browser-executable.cjs");
const {
  CATALOG_PATH: SCIPY_ORACLE_CATALOG_PATH,
  validateBinding: validateScipyOracleBinding,
  validateCatalog: validateScipyOracleCatalog,
} = require("./scipy-oracle.cjs");
const {
  PROFILES: SOAK_PROFILES,
  THRESHOLDS: SOAK_THRESHOLDS,
  analyseSession: analyseSoakSession,
  theilSenSlope: soakTheilSenSlope,
} = require("./run-soak.cjs");

const TEMPLATE_SCHEMA = "sagejs.numerical-qualification-supplemental-template/v1";
const REPORT_SCHEMA_SUPPLEMENTAL = "sagejs.numerical-qualification-supplemental-report/v1";
const RELEASE_GATE_SCHEMA = "sagejs.numerical-qualification-release-gate/v1";
const BROWSER_MEMORY_MINIMUM_DELTA = 32 * 1024 * 1024;
const EVIDENCE_SCHEMAS = new Set([
  "sagejs.numerical-native-sanitizer-evidence/v1",
  "sagejs.numerical-wasm-destructive-evidence/v1",
  "sagejs.numerical-browser-memory-evidence/v1",
  "sagejs.numerical-structural-performance-evidence/v1",
  "sagejs.numerical-soak-evidence/v1",
]);
const repositoryRoot = path.resolve(__dirname, "..", "..", "..");
const FULL_RUNTIME_TEMPLATE_PATH = path.join(
  repositoryRoot,
  "bench/numerical-computing/qualification/matrix/full-runtime.template.json",
);
const SUPPLEMENTAL_TEMPLATE_PATH = path.join(
  repositoryRoot,
  "bench/numerical-computing/qualification/matrix/supplemental-evidence.template.json",
);
const PRODUCT_CORPUS_PATH = path.join(
  repositoryRoot,
  "bench/numerical-computing/qualification/product.corpus.json",
);
const NODE_CAPABILITY_SPEC_PATH = path.join(
  repositoryRoot,
  "bench/numerical-computing/qualification/capabilities/node-capability-spec.json",
);

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function verifyContentId(value, label) {
  assertObject(value, label);
  if (typeof value.id !== "string") throw new Error(`${label} lacks a content ID`);
  const { id, ...core } = value;
  const expected = contentId(core);
  if (id !== expected) throw new Error(`${label} content ID mismatch`);
  return value;
}

function readBoundJson(filename, label) {
  const relative = path.isAbsolute(filename) ? path.relative(repositoryRoot, filename) : filename;
  const resolved = repositoryPath(repositoryRoot, relative, label);
  const status = fs.lstatSync(resolved.absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic-link file`);
  }
  const bytes = fs.readFileSync(resolved.absolute);
  return {
    path: resolved.relative,
    sha256: sha256(bytes),
    bytes: bytes.length,
    value: parseJsonText(bytes.toString("utf8"), label),
  };
}

function canonicalTemplate(filename, label) {
  return readBoundJson(filename, label);
}

function requireCanonicalRecord(record, filename, label) {
  const expected = canonicalTemplate(filename, label);
  if (record.path !== expected.path ||
      record.sha256 !== expected.sha256 ||
      canonicalJson(record.value) !== canonicalJson(expected.value)) {
    throw new Error(`${label} does not bind the source-current checked-in canonical template`);
  }
  return expected;
}

function authenticateRepositoryBinding(binding, label, {
  expectedPath = null,
  requireContent = false,
} = {}) {
  assertObject(binding, label);
  if (typeof binding.path !== "string" || path.isAbsolute(binding.path) ||
      /^[A-Za-z]:[\\/]/.test(binding.path) || binding.path.startsWith("\\\\")) {
    throw new Error(`${label} path must be repository-relative on every platform`);
  }
  if (expectedPath !== null && binding.path !== expectedPath) {
    throw new Error(`${label} does not bind ${expectedPath}`);
  }
  const current = digestPath(repositoryRoot, binding.path, label);
  for (const field of ["path", "sha256", "bytes", "files"]) {
    if (binding[field] !== current[field]) {
      throw new Error(`${label} does not match source-current repository bytes`);
    }
  }
  if (requireContent || Object.hasOwn(binding, "content_sha256")) {
    const content = contentDigestPath(repositoryRoot, binding.path, `${label} content`);
    if (binding.content_sha256 !== content) {
      throw new Error(`${label} content digest does not match source-current bytes`);
    }
  }
  return current;
}

function validateExternalExecutableBinding(binding, label) {
  assertObject(binding, label);
  const portableAbsolute = typeof binding.path === "string" && (
    binding.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(binding.path) ||
    binding.path.startsWith("\\\\")
  );
  if (!portableAbsolute || !/^[0-9a-f]{64}$/.test(binding.sha256 ?? "") ||
      !Number.isSafeInteger(binding.bytes) || binding.bytes <= 0 ||
      typeof binding.version !== "string" || binding.version.length === 0) {
    throw new Error(`${label} has an invalid producer-authenticated identity`);
  }
  return binding;
}

function authenticateCollector(evidence, expectedPath, label) {
  authenticateRepositoryBinding(evidence.collector, `${label} collector`, { expectedPath });
}

function validateTemplate(value) {
  assertObject(value, "supplemental template");
  if (value.schema !== TEMPLATE_SCHEMA || typeof value.id !== "string" ||
      !Array.isArray(value.requirements) || value.requirements.length === 0) {
    throw new Error("invalid supplemental template");
  }
  const seen = new Set();
  for (const requirement of value.requirements) {
    assertObject(requirement, "supplemental requirement");
    if (typeof requirement.id !== "string" || seen.has(requirement.id)) {
      throw new Error(`invalid or duplicate supplemental requirement ${requirement.id}`);
    }
    seen.add(requirement.id);
    if (requirement.status !== "pending") {
      throw new Error(`supplemental template ${requirement.id} must remain pending before collection`);
    }
    if (!Array.isArray(requirement.required_evidence) ||
        requirement.required_evidence.length === 0 ||
        new Set(requirement.required_evidence).size !== requirement.required_evidence.length) {
      throw new Error(`supplemental requirement ${requirement.id} has invalid evidence tokens`);
    }
  }
  return value;
}

function verifyRepository(value, candidate, label) {
  if (value?.commit !== candidate) {
    throw new Error(`${label} was collected at ${value?.commit ?? "unknown"}, expected ${candidate}`);
  }
  if (value.clean !== true) throw new Error(`${label} was not collected from a clean checkout`);
}

function sanitizerClaims(evidence) {
  authenticateCollector(
    evidence,
    "scripts/numerical-computing/qualification/run-native-sanitizers.cjs",
    "native sanitizer evidence",
  );
  validateExternalExecutableBinding(evidence.compiler, "native sanitizer compiler");
  const result = [];
  const components = new Map((evidence.components ?? []).map((item) => [item.id, item]));
  if (components.size !== 2 || !components.has("cminpack") || !components.has("nlopt")) {
    throw new Error("native sanitizer evidence must contain exactly cminpack and nlopt");
  }
  for (const component of evidence.components ?? []) {
    const requirement = component.id === "cminpack"
      ? "cminpack-native-sanitizers"
      : component.id === "nlopt" ? "nlopt-native-sanitizers" : null;
    if (requirement === null) continue;
    if (component.status !== "passed" || !component.artifact?.sha256 ||
        !component.artifact?.content_sha256 ||
        !component.source_closure_sha256 || !component.build_report?.sha256 ||
        !component.harness?.sha256) {
      throw new Error(`${requirement} lacks source/artifact-bound passing component evidence`);
    }
    const expected = component.id === "cminpack" ? {
      lock: "packages/flint-wasm/numerical/sources/cminpack-lock.json",
      report: "packages/flint-wasm/numerical/build/build-report.json",
      harness: "bench/numerical-computing/qualification/native-sanitizers/cminpack-component-harness.c",
    } : {
      lock: "src/lib/sagejs/numerics/optimization/backends/nlopt/source-lock.json",
      report: "src/lib/sagejs/numerics/optimization/backends/nlopt/build/build-report.json",
      harness: "bench/numerical-computing/qualification/native-sanitizers/nlopt-component-harness.c",
    };
    authenticateRepositoryBinding(component.lock, `${requirement} source lock`, {
      expectedPath: expected.lock,
    });
    authenticateRepositoryBinding(component.build_report, `${requirement} build report`, {
      expectedPath: expected.report,
    });
    const buildReportValue = readJson(path.join(repositoryRoot, expected.report));
    if (component.source_closure_sha256 !== buildReportValue.source_closure?.sha256 ||
        component.artifact.content_sha256 !== buildReportValue.artifact?.sha256) {
      throw new Error(`${requirement} does not match its authenticated build report`);
    }
    authenticateRepositoryBinding(component.harness, `${requirement} harness`, {
      expectedPath: expected.harness,
    });
    authenticateRepositoryBinding(component.artifact, `${requirement} Wasm artifact`, {
      requireContent: true,
    });
    for (const source of component.source_files ?? []) {
      if (typeof source.path !== "string" || !source.path.startsWith("<repository>/")) {
        throw new Error(`${requirement} source file is not repository normalized`);
      }
      const relative = source.path.slice("<repository>/".length);
      const resolved = repositoryPath(repositoryRoot, relative, `${requirement} source file`);
      const bytes = fs.readFileSync(resolved.absolute);
      if (source.sha256 !== sha256(bytes) || source.bytes !== bytes.length) {
        throw new Error(`${requirement} source file does not match source-current bytes`);
      }
    }
    const runs = new Map((component.runs ?? []).map((item) => [item.sanitizer, item]));
    if (runs.size !== 3) throw new Error(`${requirement} has duplicate or extra sanitizer runs`);
    for (const sanitizer of ["address", "undefined", "leak"]) {
      const run = runs.get(sanitizer);
      if (run?.status !== "passed" || !run.executable_sha256 ||
          run.execute?.status !== 0 || run.execute?.signal !== null) {
        throw new Error(`${requirement} lacks passing ${sanitizer} evidence`);
      }
    }
    result.push({ requirement, tokens: ["address", "undefined", "leak"] });
  }
  return result;
}

function destructiveClaims(evidence) {
  const tokens = [
    "allocation-failure", "corrupt-region", "runner-build-report-artifact-mismatch",
    "harness-input-artifact-mismatch", "product-malformed-artifact-fail-closed",
    "post-failure-recovery",
  ];
  if (evidence.status !== "passed" || evidence.scope?.source_and_artifact_bound !== true ||
      evidence.scope?.host_output_independently_validated !== true ||
      evidence.execution?.status !== 0 || evidence.execution?.signal !== null ||
      !evidence.tool?.sha256 || !evidence.harness?.sha256 ||
      !Array.isArray(evidence.artifacts) || evidence.artifacts.length !== 2 ||
      !Array.isArray(evidence.runtime_artifacts) || evidence.runtime_artifacts.length !== 4) {
    throw new Error("destructive Wasm evidence lacks authenticated execution bindings");
  }
  authenticateCollector(
    evidence,
    "scripts/numerical-computing/qualification/run-wasm-destructive.cjs",
    "destructive Wasm evidence",
  );
  validateExternalExecutableBinding(evidence.tool, "destructive Wasm Node executable");
  authenticateRepositoryBinding(
    evidence.harness,
    "destructive Wasm harness",
    { expectedPath: "bench/numerical-computing/qualification/wasm-destructive/destructive-faults.mjs" },
  );
  const expectedReports = {
    cminpack: "packages/flint-wasm/numerical/build/build-report.json",
    nlopt: "src/lib/sagejs/numerics/optimization/backends/nlopt/build/build-report.json",
  };
  for (const [name, expectedPath] of Object.entries(expectedReports)) {
    authenticateRepositoryBinding(evidence.build_reports?.[name], `${name} destructive build report`, {
      expectedPath,
    });
    const report = readJson(path.join(repositoryRoot, expectedPath));
    if (evidence.source_closures?.[name] !== report.source_closure?.sha256) {
      throw new Error(`${name} destructive source closure differs from its build report`);
    }
  }
  const expectedModules = new Map([
    ["cminpack-host", "packages/flint-wasm/numerical/index.mjs"],
    ["nlopt-host", "src/lib/sagejs/numerics/optimization/backends/nlopt/index.mjs"],
    ["browser-runtime-loader", "packages/flint-wasm/evaluator.mjs"],
  ]);
  if (evidence.modules?.length !== expectedModules.size) {
    throw new Error("destructive Wasm evidence has missing or extra host modules");
  }
  for (const module of evidence.modules) {
    const expectedPath = expectedModules.get(module.name);
    if (expectedPath === undefined) throw new Error(`unexpected destructive host module ${module.name}`);
    authenticateRepositoryBinding(module, `destructive host module ${module.name}`, { expectedPath });
    expectedModules.delete(module.name);
  }
  for (const artifact of evidence.artifacts) {
    if (!artifact.sha256 || !artifact.content_sha256 || !artifact.path ||
        !Number.isSafeInteger(artifact.bytes)) {
      throw new Error("destructive Wasm evidence lacks framed and raw artifact bindings");
    }
    authenticateRepositoryBinding(artifact, `destructive source artifact ${artifact.name}`, {
      requireContent: true,
    });
  }
  for (const artifact of evidence.runtime_artifacts) {
    if (!artifact.name || !artifact.component || !artifact.path || !artifact.sha256 ||
        !artifact.content_sha256 || !Number.isSafeInteger(artifact.bytes)) {
      throw new Error("destructive Wasm evidence lacks exact runtime-copy bindings");
    }
    authenticateRepositoryBinding(artifact, `destructive runtime artifact ${artifact.name}`, {
      requireContent: true,
    });
  }
  for (const token of tokens) {
    if (evidence.checks?.[token]?.status !== "passed") {
      throw new Error(`destructive Wasm evidence lacks ${token}`);
    }
  }
  return [{ requirement: "numerical-wasm-destructive-faults", tokens }];
}

function browserClaims(evidence) {
  authenticateCollector(
    evidence,
    "scripts/numerical-computing/qualification/run-browser-memory.cjs",
    "browser memory evidence",
  );
  validateExternalExecutableBinding(evidence.browser_executable, "measured browser executable");
  if (evidence.status !== "passed" || evidence.scope?.claim !==
      "collector-authenticated-real-browser-process-tree-memory" ||
      evidence.memory?.measurement_scope !== "process_tree" ||
      evidence.memory?.authenticated_by !== "qualification-collector" ||
      evidence.memory?.measurement_method !== "linux-procfs-process-tree-sampled-v1" ||
      evidence.memory?.sample_interval_ms !== 5 ||
      !Number.isSafeInteger(evidence.memory?.baseline_peak_bytes) ||
      !Number.isSafeInteger(evidence.memory?.pressure_peak_bytes) ||
      !Number.isSafeInteger(evidence.memory?.delta_bytes) ||
      evidence.memory.delta_bytes !==
        evidence.memory.pressure_peak_bytes - evidence.memory.baseline_peak_bytes ||
      evidence.memory.delta_bytes < BROWSER_MEMORY_MINIMUM_DELTA ||
      evidence.memory.minimum_delta_bytes < BROWSER_MEMORY_MINIMUM_DELTA ||
      evidence.memory.worker_replacement_passed !== true ||
      evidence.corpus?.snapshot?.id !== "sagejs-numerical-browser-memory-v1" ||
      !evidence.corpus?.sha256 || !evidence.source_bundle?.sha256 ||
      !evidence.adapter?.sha256 || !evidence.receipt?.id || !evidence.receipt?.sha256) {
    throw new Error("browser memory evidence lacks authenticated process-tree receipt binding");
  }
  const subject = evidence.subject;
  let token;
  if (subject?.kind === "browser" && subject.name === "playwright-browser" &&
      ["chromium", "firefox", "webkit"].includes(subject.engine)) {
    token = subject.engine;
  } else if (subject?.kind === "worker" && subject.name === "sagejs-browser-worker" &&
      subject.engine === "chromium") {
    token = "worker-replacement";
  } else {
    throw new Error("browser memory evidence has an unsupported subject/engine identity");
  }
  if (evidence.browser_executable.version !== subject.version) {
    throw new Error("browser executable version differs from the measured subject version");
  }
  authenticateRepositoryBinding(evidence.receipt, "browser memory receipt");
  const receiptBytes = fs.readFileSync(
    repositoryPath(repositoryRoot, evidence.receipt.path, "browser memory receipt").absolute,
  );
  const receipt = verifyReceipt(
    parseJsonText(receiptBytes.toString("utf8"), "browser memory receipt"),
    { root: repositoryRoot, requireClean: true },
  ).receipt;
  if (receipt.id !== evidence.receipt.id || receipt.repository.commit !== evidence.repository.commit ||
      canonicalJson(receipt.runtime.subject) !== canonicalJson(subject) ||
      canonicalJson(receipt.corpus) !== canonicalJson(evidence.corpus) ||
      canonicalJson(receipt.source_bundle) !== canonicalJson(evidence.source_bundle) ||
      canonicalJson(receipt.adapter) !== canonicalJson(evidence.adapter) ||
      canonicalJson(receipt.artifacts) !== canonicalJson(evidence.artifacts)) {
    throw new Error("browser memory evidence does not reproduce its authenticated receipt");
  }
  const caseRecord = (id) => {
    const matches = receipt.cases.filter((item) => item.case_id === id && item.status === "passed");
    if (matches.length !== 1) throw new Error(`browser memory receipt lacks exact ${id}`);
    return matches[0];
  };
  const baseline = caseRecord("p8-browser-memory-baseline").metrics.peak_memory;
  const pressure = caseRecord("p8-browser-memory-pressure").metrics.peak_memory;
  caseRecord("p8-browser-worker-replacement");
  if (baseline.bytes !== evidence.memory.baseline_peak_bytes ||
      pressure.bytes !== evidence.memory.pressure_peak_bytes ||
      pressure.measurement_method !== evidence.memory.measurement_method ||
      pressure.measurement_scope !== evidence.memory.measurement_scope ||
      pressure.authenticated_by !== evidence.memory.authenticated_by ||
      pressure.sample_interval_ms !== evidence.memory.sample_interval_ms) {
    throw new Error("browser memory summary differs from its authenticated receipt samples");
  }
  return [{ requirement: "browser-process-tree-memory", tokens: [token] }];
}

function structuralPerformanceClaims(evidence) {
  const tokens = [
    "package-graph-lazy-ownership",
    "sea-startup-budgets",
    "browser-artifact-payload-and-pack-topology",
    "numerical-trace-presentation-payload",
    "wasm-production-resource-closure",
  ];
  if (evidence.status !== "passed" || evidence.scope?.claim !==
      "source-current-authoritative-structural-and-performance-gates" ||
      !evidence.tool?.sha256 || !Array.isArray(evidence.gates) ||
      evidence.gates.length !== tokens.length) {
    throw new Error("structural performance evidence lacks authenticated gate bindings");
  }
  authenticateCollector(
    evidence,
    "scripts/numerical-computing/qualification/run-structural-performance.cjs",
    "structural performance evidence",
  );
  validateExternalExecutableBinding(evidence.tool, "structural performance Node executable");
  const expectedGates = new Map([
    ["package-graph-lazy-ownership", {
      arguments: ["scripts/check-package-graph.cjs"],
      bindings: ["scripts/check-package-graph.cjs", "architecture/package-graph.json"],
      artifacts: [],
    }],
    ["sea-startup-budgets", {
      arguments: ["scripts/check-startup-budget.cjs", "--sea"],
      bindings: ["scripts/check-startup-budget.cjs", "architecture/package-graph.json"],
      artifacts: ["build/sea/sagejs"],
    }],
    ["browser-artifact-payload-and-pack-topology", {
      arguments: [
        "packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs",
        "--dist", "packages/flint-wasm/dist", "--budget", "bench/browser-wasm-budget.json",
        "--require-baseline", "--output", "<temporary-report>",
      ],
      bindings: [
        "packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs",
        "bench/browser-wasm-budget.json",
      ],
      artifacts: ["packages/flint-wasm/dist"],
    }],
    ["numerical-trace-presentation-payload", {
      arguments: [
        "--test", "test/numerics/gallery/root-gallery.test.cjs",
        "test/numerics/gallery/cross-domain-gallery.test.cjs",
      ],
      bindings: [
        "test/numerics/gallery/root-gallery.test.cjs",
        "test/numerics/gallery/cross-domain-gallery.test.cjs",
        "website/numerical-computing/gallery-manifest.json",
        "docs/numerical-computing/gallery/evidence.json",
      ],
      artifacts: [],
    }],
    ["wasm-production-resource-closure", {
      arguments: ["--test", "test/wasm-production-resource-closure.cjs"],
      bindings: [
        "test/wasm-production-resource-closure.cjs", "architecture/native-kernels.json",
        "packages/wasm-toolchain/lock.json",
        "tools/sea-entry.ts",
        "bench/numerical-computing/qualification/package-adapter.cjs",
        "test/numerics/evidence/qualification-campaign.cjs",
        "test/numerics/evidence/qualification-supplemental.cjs",
      ],
      artifacts: [],
    }],
  ]);
  const gates = new Map(evidence.gates.map((gate) => [gate.id, gate]));
  if (gates.size !== tokens.length) {
    throw new Error("structural performance evidence has duplicate or extra gates");
  }
  for (const token of tokens) {
    const gate = gates.get(token);
    const expected = expectedGates.get(token);
    if (gate?.status !== "passed" || gate.command !== "<node>" ||
        gate.status_code !== 0 || gate.signal !== null ||
        !Number.isFinite(gate.elapsed_ms) || gate.elapsed_ms < 0 ||
        !Array.isArray(gate.bindings) || gate.bindings.length === 0 ||
        gate.bindings.some((binding) => !binding.path || !binding.sha256)) {
      throw new Error(`structural performance evidence lacks passing bound ${token}`);
    }
    if (canonicalJson(gate.arguments) !== canonicalJson(expected.arguments) ||
        !sameArray(gate.bindings.map((item) => item.path), expected.bindings) ||
        !sameArray((gate.artifacts ?? []).map((item) => item.path), expected.artifacts)) {
      throw new Error(`structural performance evidence substitutes ${token} inputs`);
    }
    for (const binding of gate.bindings) {
      authenticateRepositoryBinding(binding, `${token} input ${binding.path}`, {
        expectedPath: binding.path,
      });
    }
    for (const artifact of gate.artifacts ?? []) {
      authenticateRepositoryBinding(artifact, `${token} artifact ${artifact.path}`, {
        expectedPath: artifact.path,
        requireContent: true,
      });
    }
  }
  const startup = gates.get("sea-startup-budgets");
  if (startup.artifacts?.length !== 1 || !startup.artifacts[0].content_sha256) {
    throw new Error("SEA startup evidence does not bind the measured executable");
  }
  const browser = gates.get("browser-artifact-payload-and-pack-topology");
  if (browser.artifacts?.length !== 1 || !browser.artifacts[0].sha256 ||
      !browser.report?.sha256 ||
      !/^sha256:[0-9a-f]{64}$/.test(browser.report?.artifact_identity ?? "")) {
    throw new Error("browser payload evidence does not bind the inspected distribution/report");
  }
  return [{ requirement: "startup-package-payload-closure", tokens }];
}

function numericalSoakClaims(evidence) {
  authenticateCollector(
    evidence,
    "scripts/numerical-computing/qualification/run-soak.cjs",
    "numerical soak evidence",
  );
  validateExternalExecutableBinding(evidence.tool, "numerical soak Node executable");
  authenticateRepositoryBinding(evidence.harness, "numerical soak harness", {
    expectedPath: "bench/numerical-computing/qualification/soak/session.cjs",
  });
  assertObject(evidence.artifact, "numerical soak artifact");
  if (evidence.artifact.path !== "dist" ||
      !/^[0-9a-f]{64}$/.test(evidence.artifact.sha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(evidence.artifact.content_sha256 ?? "") ||
      !Number.isSafeInteger(evidence.artifact.bytes) || evidence.artifact.bytes <= 0 ||
      !Number.isSafeInteger(evidence.artifact.files) || evidence.artifact.files <= 0) {
    throw new Error("numerical soak artifact has an invalid producer-authenticated identity");
  }
  const platform = evidence.platform?.id;
  if (!["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"].includes(platform)) {
    throw new Error(`numerical soak has unsupported platform ${platform}`);
  }
  const configuration = evidence.configuration;
  const totals = evidence.totals;
  const thresholds = evidence.thresholds;
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const domains = [
    "root", "integration", "linear-solve", "scalar-optimization",
    "explicit-ode", "fft", "descriptive-statistics",
  ];
  if (evidence.status !== "passed" || evidence.profile !== "release" ||
      canonicalJson(configuration) !== canonicalJson(SOAK_PROFILES.release) ||
      canonicalJson(thresholds) !== canonicalJson(SOAK_THRESHOLDS) ||
      evidence.scope?.claim !== "source-bound-repeated-fresh-process-numerical-soak" ||
      evidence.scope?.fresh_process_per_session !== true ||
      evidence.scope?.cancellation_and_recovery_per_session !== true ||
      evidence.scope?.garbage_collected_memory_samples !== true ||
      evidence.scope?.routine_ci !== false || evidence.scope?.bounded !== true ||
      canonicalJson(evidence.scope?.representative_domains) !== canonicalJson(domains) ||
      configuration?.sessions < 12 || configuration?.minimum_total_elapsed_ms < 180_000 ||
      configuration?.minimum_total_operations < 5_376 ||
      configuration?.session_timeout_ms > 240_000 ||
      !Number.isSafeInteger(totals?.sessions) || !finite(totals?.elapsed_ms) ||
      !Number.isSafeInteger(totals?.operations) || !Number.isSafeInteger(totals?.failures) ||
      !finite(totals?.maximum_error) || !finite(totals?.parent_heap_slope_bytes_per_session) ||
      !finite(totals?.parent_heap_growth_bytes) ||
      totals?.sessions !== configuration.sessions || totals?.elapsed_ms < 180_000 ||
      totals?.operations < 5_376 || totals?.failures !== 0 ||
      totals?.maximum_error > thresholds?.maximum_numerical_error ||
      totals?.parent_heap_slope_bytes_per_session >
        thresholds?.maximum_parent_heap_slope_bytes_per_session ||
      totals?.parent_heap_growth_bytes > thresholds?.maximum_parent_heap_growth_bytes ||
      !Array.isArray(evidence.sessions) || evidence.sessions.length !== totals.sessions ||
      !Array.isArray(evidence.parent_memory_samples) ||
      evidence.parent_memory_samples.length !== totals.sessions + 1) {
    throw new Error("numerical soak evidence does not satisfy the release campaign envelope");
  }
  for (let index = 0; index < evidence.parent_memory_samples.length; index += 1) {
    const sample = evidence.parent_memory_samples[index];
    if (sample?.session !== index || !Number.isSafeInteger(sample.heap_used_bytes)) {
      throw new Error("numerical soak collector memory samples are invalid");
    }
  }
  const parentStable = evidence.parent_memory_samples.slice(
    Math.floor(evidence.parent_memory_samples.length / 2),
  );
  const recomputedParentSlope = soakTheilSenSlope(
    parentStable, "session", "heap_used_bytes",
  );
  const recomputedParentGrowth = evidence.parent_memory_samples.at(-1).heap_used_bytes -
    evidence.parent_memory_samples[0].heap_used_bytes;
  if (totals.parent_heap_slope_bytes_per_session !== recomputedParentSlope ||
      totals.parent_heap_growth_bytes !== recomputedParentGrowth) {
    throw new Error("numerical soak collector memory analysis is not reproducible");
  }
  for (let index = 0; index < evidence.sessions.length; index += 1) {
    const session = evidence.sessions[index];
    let recomputedMemory;
    try {
      recomputedMemory = analyseSoakSession({
        status: "passed",
        memory_samples: session?.memory_samples,
      });
    } catch {
      throw new Error(`numerical soak session ${index} has invalid memory samples`);
    }
    if (session.session !== index || !finite(session.elapsed_ms) ||
        !Number.isSafeInteger(session.blocks) || session.blocks < 1 ||
        !Number.isSafeInteger(session.cycles) || session.cycles < 1 ||
        !Number.isSafeInteger(session.operations) ||
        !Number.isSafeInteger(session.failures) || !finite(session.maximum_error) ||
        !finite(session.memory?.heap_slope_bytes_per_operation) ||
        !finite(session.memory?.rss_slope_bytes_per_operation) ||
        !finite(session.memory?.heap_growth_bytes) || !finite(session.memory?.rss_growth_bytes) ||
        !Number.isSafeInteger(session.memory?.peak_rss_bytes) ||
        canonicalJson(session.memory) !== canonicalJson(recomputedMemory) ||
        session.elapsed_ms < configuration.minimum_session_elapsed_ms ||
        session.operations < configuration.minimum_session_operations || session.failures !== 0 ||
        session.blocks + 1 !== session.memory_samples.length ||
        session.cycles !== session.blocks * configuration.cycles_per_block ||
        session.operations !== session.cycles * 7 || session.maximum_error < 0 ||
        session.maximum_error > thresholds.maximum_numerical_error ||
        session.recovery?.budget_status !== "maximum_evaluations" ||
        !Number.isSafeInteger(session.recovery?.budget_evaluations) ||
        session.recovery?.budget_evaluations < 0 ||
        session.recovery?.budget_evaluations > 1 ||
        session.recovery?.cancelled_status !== "cancelled" ||
        session.recovery?.cancelled_evaluations !== 0 ||
        session.recovery?.callback_status !== "callback_error" ||
        session.recovery?.callback_evaluations !== 1 ||
        session.recovery?.recovered !== true || session.recovery?.recovery_residual > 1e-12 ||
        session.memory?.heap_slope_bytes_per_operation >
          thresholds.maximum_heap_slope_bytes_per_operation ||
        session.memory?.rss_slope_bytes_per_operation >
          thresholds.maximum_rss_slope_bytes_per_operation ||
        session.memory?.heap_growth_bytes >
          thresholds.maximum_heap_growth_bytes_per_session ||
        session.memory?.rss_growth_bytes >
          thresholds.maximum_rss_growth_bytes_per_session ||
        session.memory?.peak_rss_bytes > thresholds.maximum_session_peak_rss_bytes) {
      throw new Error(`numerical soak session ${index} violates its recorded release threshold`);
    }
  }
  const sessionElapsed = evidence.sessions.reduce((sum, item) => sum + item.elapsed_ms, 0);
  const sessionOperations = evidence.sessions.reduce((sum, item) => sum + item.operations, 0);
  const sessionFailures = evidence.sessions.reduce((sum, item) => sum + item.failures, 0);
  const sessionMaximumError = Math.max(...evidence.sessions.map((item) => item.maximum_error));
  if (totals.elapsed_ms !== sessionElapsed || totals.operations !== sessionOperations ||
      totals.failures !== sessionFailures || totals.maximum_error !== sessionMaximumError) {
    throw new Error("numerical soak aggregate work is not reproducible from its sessions");
  }
  return [{ requirement: "four-platform-numerical-soak", tokens: [platform] }];
}

function verifyEvidence(value, candidate) {
  verifyContentId(value, "supplemental evidence");
  if (!EVIDENCE_SCHEMAS.has(value.schema)) {
    throw new Error(`unsupported supplemental evidence schema ${value.schema}`);
  }
  verifyRepository(value.repository, candidate, `supplemental evidence ${value.id}`);
  if (value.schema !== "sagejs.numerical-soak-evidence/v1" &&
      value.platform?.id !== "linux-x64") {
    throw new Error(`supplemental evidence ${value.id} must be measured on linux-x64`);
  }
  let claims;
  if (value.schema === "sagejs.numerical-native-sanitizer-evidence/v1") {
    claims = sanitizerClaims(value);
  } else if (value.schema === "sagejs.numerical-wasm-destructive-evidence/v1") {
    claims = destructiveClaims(value);
  } else if (value.schema === "sagejs.numerical-browser-memory-evidence/v1") {
    claims = browserClaims(value);
  } else if (value.schema === "sagejs.numerical-structural-performance-evidence/v1") {
    claims = structuralPerformanceClaims(value);
  } else {
    claims = numericalSoakClaims(value);
  }
  if (claims.length === 0) throw new Error(`supplemental evidence ${value.id} makes no claim`);
  return { evidence: value, claims };
}

function buildArtifactCoherence(verified, release) {
  const bySchema = new Map();
  for (const record of verified) {
    const records = bySchema.get(record.evidence.schema) ?? [];
    records.push(record.evidence);
    bySchema.set(record.evidence.schema, records);
  }
  const requiredSchemas = [
    "sagejs.numerical-native-sanitizer-evidence/v1",
    "sagejs.numerical-wasm-destructive-evidence/v1",
    "sagejs.numerical-structural-performance-evidence/v1",
  ];
  const reasons = [];
  for (const schema of requiredSchemas) {
    const count = bySchema.get(schema)?.length ?? 0;
    if (count !== 1) reasons.push(`${schema} requires exactly one record; found ${count}`);
  }
  if (reasons.length !== 0) {
    return {
      status: release ? "failed" : "pending",
      reasons,
      component_content_sha256: null,
      runtime_artifacts: [],
      linux_sea: null,
      browser_distribution: null,
    };
  }
  const sanitizer = bySchema.get(requiredSchemas[0])[0];
  const destructive = bySchema.get(requiredSchemas[1])[0];
  const structural = bySchema.get(requiredSchemas[2])[0];
  const sourceArtifacts = new Map(
    destructive.artifacts.map((artifact) => [artifact.name.replace(/-wasm$/, ""), artifact]),
  );
  const sanitizerComponents = new Map(
    sanitizer.components.map((component) => [component.id, component]),
  );
  for (const component of ["cminpack", "nlopt"]) {
    const source = sourceArtifacts.get(component);
    const sanitized = sanitizerComponents.get(component);
    if (source?.content_sha256 !== sanitized?.artifact?.content_sha256) {
      reasons.push(`${component} sanitizer bytes differ from destructive Wasm source bytes`);
    }
  }
  const runtimeNames = new Set([
    "node-cminpack-wasm", "node-nlopt-wasm",
    "browser-cminpack-wasm", "browser-nlopt-wasm",
  ]);
  for (const artifact of destructive.runtime_artifacts) {
    if (!runtimeNames.delete(artifact.name)) {
      reasons.push(`unexpected or duplicate destructive runtime artifact ${artifact.name}`);
      continue;
    }
    if (artifact.content_sha256 !== sourceArtifacts.get(artifact.component)?.content_sha256) {
      reasons.push(`${artifact.name} differs from its destructive source artifact`);
    }
  }
  for (const name of runtimeNames) reasons.push(`missing destructive runtime artifact ${name}`);
  const structuralGates = new Map(structural.gates.map((gate) => [gate.id, gate]));
  const seaArtifact = structuralGates.get("sea-startup-budgets")?.artifacts?.[0] ?? null;
  const browserArtifact = structuralGates.get(
    "browser-artifact-payload-and-pack-topology",
  )?.artifacts?.[0] ?? null;
  if (!seaArtifact?.sha256 || !seaArtifact?.content_sha256) {
    reasons.push("structural performance evidence lacks the measured Linux SEA binding");
  }
  if (!browserArtifact?.sha256 || !browserArtifact?.content_sha256) {
    reasons.push("structural performance evidence lacks the inspected browser distribution binding");
  }
  return {
    status: reasons.length === 0 ? "passed" : "failed",
    reasons,
    component_content_sha256: Object.fromEntries(
      [...sourceArtifacts].map(([name, artifact]) => [name, artifact.content_sha256]),
    ),
    runtime_artifacts: destructive.runtime_artifacts.map((artifact) => ({
      name: artifact.name,
      path: artifact.path,
      sha256: artifact.sha256,
      content_sha256: artifact.content_sha256,
    })),
    linux_sea: seaArtifact === null ? null : {
      path: seaArtifact.path,
      sha256: seaArtifact.sha256,
      content_sha256: seaArtifact.content_sha256,
    },
    browser_distribution: browserArtifact === null ? null : {
      path: browserArtifact.path,
      sha256: browserArtifact.sha256,
      content_sha256: browserArtifact.content_sha256,
    },
  };
}

function buildSupplementalReport(templateValue, evidenceRecords, { candidate, release }) {
  const template = validateTemplate(templateValue);
  if (release) {
    const canonical = canonicalTemplate(
      SUPPLEMENTAL_TEMPLATE_PATH, "canonical supplemental template",
    ).value;
    if (canonicalJson(template) !== canonicalJson(canonical)) {
      throw new Error("release mode requires the source-current canonical supplemental template");
    }
  }
  if (!/^[0-9a-f]{40,64}$/.test(candidate)) throw new Error("candidate must be a git object ID");
  const verified = evidenceRecords.map((record) => ({
    ...record,
    ...verifyEvidence(record.value, candidate),
  }));
  const rows = template.requirements.map((requirement) => {
    const tokenEvidence = new Map(requirement.required_evidence.map((token) => [token, []]));
    for (const record of verified) {
      for (const claim of record.claims.filter((item) => item.requirement === requirement.id)) {
        for (const token of claim.tokens) {
          if (!tokenEvidence.has(token)) {
            throw new Error(`evidence ${record.evidence.id} claims unexpected ${requirement.id}/${token}`);
          }
          tokenEvidence.get(token).push(record);
        }
      }
    }
    const reasons = [];
    const bindings = [];
    for (const [token, records] of tokenEvidence) {
      if (records.length === 0) reasons.push(`missing required evidence ${token}`);
      if (records.length > 1) reasons.push(`ambiguous required evidence ${token}: ${records.length} records`);
      if (records.length === 1) bindings.push({
        token,
        path: records[0].path,
        sha256: records[0].sha256,
        id: records[0].evidence.id,
        schema: records[0].evidence.schema,
      });
    }
    return {
      requirement_id: requirement.id,
      status: reasons.length === 0 ? "passed" : release ? "failed" : "pending",
      reasons,
      evidence: bindings.sort((left, right) => left.token.localeCompare(right.token)),
    };
  });
  const artifactCoherence = buildArtifactCoherence(verified, release);
  const usedIds = new Set(rows.flatMap((row) => row.evidence.map((item) => item.id)));
  const core = {
    schema: REPORT_SCHEMA_SUPPLEMENTAL,
    candidate,
    mode: release ? "release" : "development",
    template: {
      id: template.id,
      sha256: sha256(canonicalJson(template)),
      required_rows: template.requirements.length,
    },
    status: rows.every((row) => row.status === "passed") &&
      artifactCoherence.status === "passed"
      ? "passed"
      : release ? "failed" : "pending",
    rows,
    artifact_coherence: artifactCoherence,
    unmatched_evidence_ids: verified
      .filter((record) => !usedIds.has(record.evidence.id))
      .map((record) => record.evidence.id)
      .sort(),
  };
  return { ...core, id: contentId(core) };
}

function sorted(value) {
  return [...value].sort();
}

function sameArray(left, right) {
  return canonicalJson(sorted(left)) === canonicalJson(sorted(right));
}

function validateFullRuntimeTemplate(value) {
  assertObject(value, "full-runtime template");
  if (value.schema !== "sagejs.numerical-qualification-matrix-template/v1" ||
      value.id !== "sagejs-numerical-product-full-runtime" || value.require_clean !== true ||
      !Array.isArray(value.rows) || value.rows.length !== 16 ||
      !Array.isArray(value.required_program_phases) || value.required_program_phases.length !== 9 ||
      !Array.isArray(value.required_case_layers) || value.required_case_layers.length !== 7 ||
      !Array.isArray(value.required_capabilities) || value.required_capabilities.length === 0) {
    throw new Error("release gate requires the canonical 16-row full-runtime template");
  }
  if (new Set(value.rows.map((row) => row.id)).size !== 16) {
    throw new Error("full-runtime template has duplicate rows");
  }
  const canonical = canonicalTemplate(
    FULL_RUNTIME_TEMPLATE_PATH, "canonical full-runtime template",
  ).value;
  if (canonicalJson(value) !== canonicalJson(canonical)) {
    throw new Error("release gate requires the source-current canonical full-runtime template");
  }
  return value;
}

function verifyCompiledPolicy(policyValue, templateValue, manifestRecords) {
  const template = validateFullRuntimeTemplate(templateValue);
  const policy = validateMatrixPolicy(policyValue);
  if (policy.id !== template.id || policy.require_clean !== true || policy.rows.length !== 16) {
    throw new Error("compiled policy is not the canonical full-runtime policy");
  }
  const policyRows = new Map(policy.rows.map((row) => [row.id, row]));
  const corpusBinding = digestPath(
    repositoryRoot,
    path.relative(repositoryRoot, PRODUCT_CORPUS_PATH),
    "canonical product corpus",
  );
  const corpus = validateCorpus(readJson(PRODUCT_CORPUS_PATH));
  const sourceBundle = digestBundle(
    repositoryRoot, corpus.source_paths, "canonical product source paths",
  );
  const backend = readJson(NODE_CAPABILITY_SPEC_PATH).backend;
  if (!(manifestRecords instanceof Map) || manifestRecords.size !== template.rows.length) {
    throw new Error(`release gate requires exactly ${template.rows.length} capability manifests`);
  }
  const manifests = new Map();
  for (const expected of template.rows) {
    const record = manifestRecords.get(expected.id);
    if (record === undefined) throw new Error(`release gate lacks manifest ${expected.id}`);
    manifests.set(expected.id, validateCapabilityManifest(record.value, corpus));
  }
  const rebuiltPolicy = renderMatrix(template, corpus, manifests);
  if (canonicalJson(rebuiltPolicy) !== canonicalJson(policy)) {
    throw new Error("compiled policy does not reproduce from its authenticated capability manifests");
  }
  for (const expected of template.rows) {
    const row = policyRows.get(expected.id);
    if (row === undefined) throw new Error(`compiled policy omits ${expected.id}`);
    if (row.match.platform !== expected.platform || row.match.subject_kind !== expected.subject.kind ||
        row.match.subject_name !== expected.subject.name ||
        row.match.subject_engine !== expected.subject.engine ||
        row.required_memory_scope !== expected.required_memory_scope) {
      throw new Error(`compiled policy substitutes the subject envelope for ${expected.id}`);
    }
    if (row.match.corpus_id !== corpus.id ||
        row.match.corpus_sha256 !== corpusBinding.sha256 ||
        row.match.source_bundle_sha256 !== sourceBundle.sha256 ||
        row.match.backend_id !== backend.id || row.match.backend_version !== backend.version) {
      throw new Error(`compiled policy does not bind source-current campaign inputs for ${expected.id}`);
    }
    if (!sameArray(row.required_program_phases, template.required_program_phases) ||
        !sameArray(row.required_case_layers, template.required_case_layers) ||
        !sameArray(row.required_capabilities, template.required_capabilities)) {
      throw new Error(`compiled policy weakens required coverage for ${expected.id}`);
    }
  }
  if (new Set(policy.rows.map((row) => row.match.corpus_sha256)).size !== 1 ||
      new Set(policy.rows.map((row) => row.match.source_bundle_sha256)).size !== 1) {
    throw new Error("compiled policy rows do not share one corpus and source closure");
  }
  return policy;
}

function verifyMatrixReport(value, candidate, policy, template, receiptRecords) {
  validateFullRuntimeTemplate(template);
  verifyContentId(value, "matrix report");
  if (value.schema !== REPORT_SCHEMA) throw new Error("matrix report has the wrong schema");
  if (value.status !== "passed") throw new Error("matrix report is not passing");
  if (value.policy?.id !== policy.id ||
      value.policy?.sha256 !== sha256(canonicalJson(policy)) ||
      value.policy?.required_rows !== policy.rows.length ||
      !Array.isArray(value.rows) || value.rows.length !== policy.rows.length) {
    throw new Error("matrix report does not bind the exact compiled full-runtime policy");
  }
  const required = new Set(policy.rows.map((row) => row.id));
  for (const row of value.rows) {
    if (!required.delete(row.row_id)) throw new Error(`matrix report has foreign row ${row.row_id}`);
    if (row.status !== "passed" || row.receipt?.repository_commit !== candidate) {
      throw new Error(`matrix row ${row.row_id} is not bound to candidate ${candidate}`);
    }
  }
  if (required.size !== 0) throw new Error(`matrix report omits ${[...required].join(", ")}`);
  if (!Array.isArray(receiptRecords) || receiptRecords.length !== policy.rows.length) {
    throw new Error(`release gate requires exactly ${policy.rows.length} matrix receipt files`);
  }
  const receiptIds = new Set();
  for (const record of receiptRecords) {
    const receipt = verifyReceipt(record.value, {
      historical: true,
      requireClean: true,
    }).receipt;
    if (receipt.repository.commit !== candidate) {
      throw new Error(`matrix receipt ${receipt.id} is not bound to candidate ${candidate}`);
    }
    addUniqueReceiptId(receiptIds, receipt.id);
  }
  const rebuilt = buildReport(policy, receiptRecords);
  if (canonicalJson(rebuilt) !== canonicalJson(value)) {
    throw new Error("matrix report does not reproduce from its authenticated receipt files");
  }
  return value;
}

function addUniqueReceiptId(receiptIds, receiptId) {
  if (receiptIds.has(receiptId)) throw new Error(`duplicate matrix receipt ${receiptId}`);
  receiptIds.add(receiptId);
}

function verifyMatrixBrowserSubjectCoherence(
  matrix, supplementalEvidenceRecords, matrixReceiptRecords,
) {
  const expectedKeys = new Set([
    "browser:chromium", "browser:firefox", "browser:webkit", "worker:chromium",
  ]);
  const memorySubjects = new Map();
  for (const record of supplementalEvidenceRecords) {
    if (record.value?.schema !== "sagejs.numerical-browser-memory-evidence/v1") continue;
    const subject = record.value.subject;
    const key = `${subject?.kind}:${subject?.engine}`;
    if (!expectedKeys.has(key)) {
      throw new Error(`supplemental browser memory has unexpected subject ${key}`);
    }
    if (memorySubjects.has(key)) {
      throw new Error(`supplemental browser memory duplicates subject ${key}`);
    }
    memorySubjects.set(key, {
      subject,
      executable: record.value.browser_executable,
    });
  }
  if (memorySubjects.size !== expectedKeys.size) {
    const missing = [...expectedKeys].filter((key) => !memorySubjects.has(key));
    throw new Error(`supplemental browser memory lacks exact subjects: ${missing.join(", ")}`);
  }

  const matrixSubjects = new Map();
  for (const row of matrix.rows) {
    const subject = row.receipt?.subject;
    if (!["browser", "worker"].includes(subject?.kind)) continue;
    const key = `${subject.kind}:${subject.engine}`;
    if (!expectedKeys.has(key) || matrixSubjects.has(key)) {
      throw new Error(`full-runtime matrix substitutes browser subject ${key}`);
    }
    matrixSubjects.set(key, subject);
  }
  if (matrixSubjects.size !== expectedKeys.size) {
    const missing = [...expectedKeys].filter((key) => !matrixSubjects.has(key));
    throw new Error(`full-runtime matrix lacks exact browser subjects: ${missing.join(", ")}`);
  }
  for (const key of expectedKeys) {
    if (canonicalJson(matrixSubjects.get(key)) !==
        canonicalJson(memorySubjects.get(key).subject)) {
      throw new Error(
        `supplemental browser memory subject ${key} differs from its full-runtime receipt`,
      );
    }
  }

  const receiptBindings = new Map();
  for (const record of matrixReceiptRecords) {
    const receipt = record.value;
    const subject = receipt.runtime?.subject;
    if (!["browser", "worker"].includes(subject?.kind)) continue;
    const key = `${subject.kind}:${subject.engine}`;
    if (!expectedKeys.has(key) || receiptBindings.has(key)) {
      throw new Error(`matrix receipt substitutes browser executable subject ${key}`);
    }
    const artifacts = receipt.artifacts?.filter(
      (artifact) => artifact.name === "browser-executable-binding",
    );
    if (artifacts?.length !== 1) {
      throw new Error(`matrix receipt ${key} lacks one browser executable binding`);
    }
    const artifact = artifacts[0];
    const supplementalExecutable = memorySubjects.get(key)?.executable;
    const binding = createBrowserExecutableBinding(subject, supplementalExecutable);
    validateBrowserExecutableBinding(binding, subject, { authenticate: false });
    const serialized = pretty(binding);
    if (artifact.content_sha256 !== sha256(serialized) ||
        artifact.bytes !== Buffer.byteLength(serialized) || artifact.files !== 1) {
      throw new Error(
        `browser executable ${key} differs from its full-runtime receipt binding content`,
      );
    }
    receiptBindings.set(key, binding.executable);
  }
  if (receiptBindings.size !== expectedKeys.size) {
    const missing = [...expectedKeys].filter((key) => !receiptBindings.has(key));
    throw new Error(`matrix receipts lack exact browser executable bindings: ${missing.join(", ")}`);
  }
  for (const key of expectedKeys) {
    if (canonicalJson(receiptBindings.get(key)) !==
        canonicalJson(memorySubjects.get(key).executable)) {
      throw new Error(
        `supplemental browser executable ${key} differs from its full-runtime receipt binding`,
      );
    }
  }
  return true;
}

function verifyMatrixArtifactCoherence(matrix, supplemental) {
  const coherence = supplemental.artifact_coherence;
  if (coherence?.status !== "passed" || coherence.reasons?.length !== 0) {
    throw new Error("supplemental artifact coherence is not passing");
  }
  const componentDigests = coherence.component_content_sha256;
  const npmRootDigests = new Set();
  for (const row of matrix.rows) {
    const artifacts = new Map(
      (row.bindings?.artifacts ?? []).map((artifact) => [artifact.name, artifact]),
    );
    for (const [name, component] of [
      ["cminpack-wasm", "cminpack"], ["nlopt-wasm", "nlopt"],
    ]) {
      const artifact = artifacts.get(name);
      if (!artifact?.content_sha256 ||
          artifact.content_sha256 !== componentDigests?.[component]) {
        throw new Error(`${row.row_id} ${name} differs from supplemental source closure`);
      }
    }
    if (["browser", "worker"].includes(row.receipt.subject.kind)) {
      if (artifacts.get("browser-dist")?.content_sha256 !==
          coherence.browser_distribution?.content_sha256) {
        throw new Error(`${row.row_id} browser distribution differs from payload evidence`);
      }
    }
    if (row.receipt.subject.kind === "npm") {
      const roots = row.bindings?.artifacts?.filter(
        (artifact) => artifact.name === "npm-root-tarball",
      );
      if (roots?.length !== 1 || !/^[0-9a-f]{64}$/.test(roots[0].content_sha256 ?? "")) {
        throw new Error(`${row.row_id} lacks one content-bound public npm root tarball`);
      }
      npmRootDigests.add(roots[0].content_sha256);
    }
    if (row.row_id === "linux-x64-sea" &&
        artifacts.get("sea-executable")?.content_sha256 !==
          coherence.linux_sea?.content_sha256) {
      throw new Error("linux-x64 SEA differs from startup evidence");
    }
  }
  if (npmRootDigests.size !== 1) {
    throw new Error("full-runtime npm rows do not bind one identical public root tarball");
  }
  return { npmRootContentSha256: [...npmRootDigests][0] };
}

function compactReceiptRowId(receipt) {
  const platform = receipt.platform?.id;
  const subject = receipt.runtime?.subject;
  if (subject?.kind === "browser") return `${platform}-browser-${subject.engine}`;
  if (subject?.kind === "worker") return `${platform}-browser-worker`;
  return `${platform}-${subject?.kind}`;
}

function supplementalEvidenceIdentity(record) {
  const value = record.value;
  switch (value.schema) {
    case "sagejs.numerical-native-sanitizer-evidence/v1":
      return { category: "native-sanitizers", schema: value.schema };
    case "sagejs.numerical-wasm-destructive-evidence/v1":
      return { category: "wasm-destructive", schema: value.schema };
    case "sagejs.numerical-structural-performance-evidence/v1":
      return { category: "structural-performance", schema: value.schema };
    case "sagejs.numerical-browser-memory-evidence/v1": {
      const subject = value.subject;
      const suffix = subject?.kind === "worker" ? "worker" : subject?.engine;
      return { category: `browser-memory-${suffix}`, schema: value.schema };
    }
    case "sagejs.numerical-soak-evidence/v1":
      return { category: `numerical-soak-${value.platform?.id}`, schema: value.schema };
    default:
      throw new Error(`release gate cannot compact foreign evidence schema ${value.schema}`);
  }
}

function verifyMatrixSoakArtifactCoherence(supplementalEvidenceRecords, matrixReceiptRecords) {
  const soakArtifacts = new Map();
  for (const record of supplementalEvidenceRecords) {
    if (record.value?.schema !== "sagejs.numerical-soak-evidence/v1") continue;
    const platform = record.value.platform?.id;
    if (soakArtifacts.has(platform)) {
      throw new Error(`supplemental numerical soak duplicates ${platform}`);
    }
    soakArtifacts.set(platform, record.value.artifact);
  }
  const nodeArtifacts = new Map();
  for (const record of matrixReceiptRecords) {
    const receipt = record.value;
    if (receipt.runtime?.subject?.kind !== "node") continue;
    const platform = receipt.platform?.id;
    const artifacts = receipt.artifacts?.filter((item) => item.name === "sagejs-dist");
    if (artifacts?.length !== 1 || nodeArtifacts.has(platform)) {
      throw new Error(`matrix receipts lack one unique Node dist artifact for ${platform}`);
    }
    nodeArtifacts.set(platform, artifacts[0]);
  }
  const platforms = ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"];
  for (const platform of platforms) {
    const soak = soakArtifacts.get(platform);
    const node = nodeArtifacts.get(platform);
    if (soak === undefined || node === undefined) {
      throw new Error(`numerical soak/Node artifact binding lacks ${platform}`);
    }
    const fields = ["path", "sha256", "content_sha256", "bytes", "files"];
    if (fields.some((field) => soak[field] !== node[field])) {
      throw new Error(`${platform} numerical soak exercised a different dist than its Node row`);
    }
  }
  if (soakArtifacts.size !== platforms.length || nodeArtifacts.size !== platforms.length) {
    throw new Error("numerical soak/Node artifact coherence has foreign platform evidence");
  }
  return true;
}

function verifyMatrixScipyOracleCoherence(matrixReceiptRecords, {
  expectedCatalog = null,
} = {}) {
  const sourceCatalog = expectedCatalog ?? validateScipyOracleCatalog(
    readJson(path.join(repositoryRoot, SCIPY_ORACLE_CATALOG_PATH)),
  );
  const byPlatform = new Map();
  const catalogIds = new Set();
  for (const record of matrixReceiptRecords) {
    const receipt = record.value;
    const platformId = receipt.platform?.id;
    const subject = receipt.runtime?.subject;
    if (typeof platformId !== "string" || subject === undefined) {
      throw new Error("matrix receipt lacks platform or runtime subject for SciPy oracle binding");
    }
    const artifacts = receipt.artifacts?.filter(
      (artifact) => artifact.name === "scipy-oracle-binding",
    );
    if (artifacts?.length !== 1) {
      throw new Error(`matrix receipt ${platformId}/${subject.kind} lacks one SciPy oracle binding`);
    }
    const artifact = artifacts[0];
    authenticateRepositoryBinding(
      artifact,
      `matrix receipt ${platformId}/${subject.kind} SciPy oracle binding`,
      { requireContent: true },
    );
    const resolved = repositoryPath(
      repositoryRoot, artifact.path, "matrix SciPy oracle binding snapshot",
    );
    const binding = validateScipyOracleBinding(
      parseJsonText(fs.readFileSync(resolved.absolute, "utf8"), "matrix SciPy oracle binding"),
      { authenticate: false },
    );
    if (binding.platform !== platformId) {
      throw new Error(
        `matrix receipt ${platformId}/${subject.kind} uses SciPy oracle for ${binding.platform}`,
      );
    }
    if (canonicalJson(binding.catalog.snapshot) !== canonicalJson(sourceCatalog)) {
      throw new Error(
        `matrix receipt ${platformId}/${subject.kind} SciPy catalog is not source-current`,
      );
    }
    catalogIds.add(binding.catalog.snapshot.id);
    const previous = byPlatform.get(platformId);
    if (previous !== undefined && canonicalJson(previous.binding) !== canonicalJson(binding)) {
      throw new Error(`matrix receipts substitute different SciPy oracles on ${platformId}`);
    }
    byPlatform.set(platformId, {
      binding,
      subjects: [...(previous?.subjects ?? []), {
        kind: subject.kind,
        name: subject.name,
        version: subject.version,
        engine: subject.engine,
      }],
    });
  }
  const expectedPlatforms = ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"];
  if (catalogIds.size !== 1 || byPlatform.size !== expectedPlatforms.length ||
      expectedPlatforms.some((platformId) => !byPlatform.has(platformId))) {
    throw new Error("full-runtime matrix lacks one source-current SciPy oracle per platform");
  }
  const expectedSubjectCounts = new Map([
    ["linux-x64", 7], ["linux-arm64", 3], ["macos-arm64", 3], ["windows-x64", 3],
  ]);
  for (const [platformId, record] of byPlatform) {
    if (record.subjects.length !== expectedSubjectCounts.get(platformId)) {
      throw new Error(`full-runtime matrix has wrong SciPy oracle subject count on ${platformId}`);
    }
  }
  return {
    catalog_id: [...catalogIds][0],
    platform_bindings: expectedPlatforms.map((platformId) => ({
      platform: platformId,
      binding_id: byPlatform.get(platformId).binding.id,
      subjects: byPlatform.get(platformId).subjects
        .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
    })),
  };
}

function buildReleaseGate({
  candidate, matrixReportRecord, matrixPolicyRecord, matrixTemplateRecord, matrixReceiptRecords,
  matrixManifestRecords, supplementalTemplateRecord, supplementalEvidenceRecords,
  supplementalReport,
}) {
  requireCanonicalRecord(
    supplementalTemplateRecord, SUPPLEMENTAL_TEMPLATE_PATH, "supplemental template",
  );
  const rebuiltSupplemental = buildSupplementalReport(
    supplementalTemplateRecord.value,
    supplementalEvidenceRecords,
    { candidate, release: true },
  );
  if (canonicalJson(rebuiltSupplemental) !== canonicalJson(supplementalReport)) {
    throw new Error(
      "supplemental report does not reproduce from its authenticated evidence files",
    );
  }
  requireCanonicalRecord(
    matrixTemplateRecord, FULL_RUNTIME_TEMPLATE_PATH, "full-runtime matrix template",
  );
  const policy = verifyCompiledPolicy(
    matrixPolicyRecord.value,
    matrixTemplateRecord.value,
    matrixManifestRecords,
  );
  const matrix = verifyMatrixReport(
    matrixReportRecord.value, candidate, policy, matrixTemplateRecord.value,
    matrixReceiptRecords,
  );
  verifyMatrixBrowserSubjectCoherence(
    matrix, supplementalEvidenceRecords, matrixReceiptRecords,
  );
  verifyMatrixSoakArtifactCoherence(supplementalEvidenceRecords, matrixReceiptRecords);
  verifyContentId(supplementalReport, "supplemental report");
  if (supplementalReport.schema !== REPORT_SCHEMA_SUPPLEMENTAL ||
      supplementalReport.mode !== "release" || supplementalReport.candidate !== candidate ||
      supplementalReport.status !== "passed") {
    throw new Error("supplemental report is not a passing release report for the candidate");
  }
  const matrixArtifactCoherence = verifyMatrixArtifactCoherence(matrix, supplementalReport);
  const scipyOracleCoherence = verifyMatrixScipyOracleCoherence(matrixReceiptRecords);
  const core = {
    schema: RELEASE_GATE_SCHEMA,
    candidate,
    status: "passed",
    matrix_report: {
      path: matrixReportRecord.path,
      sha256: matrixReportRecord.sha256,
      id: matrix.id,
    },
    matrix_receipts: matrixReceiptRecords.map((record) => ({
      row_id: compactReceiptRowId(record.value),
      path: record.path,
      sha256: record.sha256,
      id: record.value.id,
    })).sort((left, right) => left.row_id.localeCompare(right.row_id)),
    capability_manifests: [...matrixManifestRecords].map(([rowId, record]) => ({
      row_id: rowId,
      path: record.path,
      sha256: record.sha256,
      id: record.value.id,
    })).sort((left, right) => left.row_id.localeCompare(right.row_id)),
    matrix_policy: {
      path: matrixPolicyRecord.path,
      sha256: matrixPolicyRecord.sha256,
      id: policy.id,
      rows: policy.rows.length,
    },
    matrix_template: {
      path: matrixTemplateRecord.path,
      sha256: matrixTemplateRecord.sha256,
      id: matrixTemplateRecord.value.id,
      rows: matrixTemplateRecord.value.rows.length,
    },
    supplemental_report: {
      id: supplementalReport.id,
      template_sha256: supplementalReport.template.sha256,
      rows: supplementalReport.rows.length,
      requirement_ids: supplementalReport.rows.map((row) => row.requirement_id).sort(),
    },
    supplemental_evidence: supplementalEvidenceRecords.map((record) => ({
      ...supplementalEvidenceIdentity(record),
      path: record.path,
      sha256: record.sha256,
      id: record.value.id,
    })).sort((left, right) => left.category.localeCompare(right.category)),
    artifact_coherence: {
      cminpack_content_sha256:
        supplementalReport.artifact_coherence.component_content_sha256.cminpack,
      nlopt_content_sha256:
        supplementalReport.artifact_coherence.component_content_sha256.nlopt,
      linux_sea_content_sha256:
        supplementalReport.artifact_coherence.linux_sea.content_sha256,
      browser_distribution_content_sha256:
        supplementalReport.artifact_coherence.browser_distribution.content_sha256,
      public_npm_root_content_sha256: matrixArtifactCoherence.npmRootContentSha256,
    },
    scipy_oracle_coherence: scipyOracleCoherence,
  };
  return { ...core, id: contentId(core) };
}

module.exports = {
  FULL_RUNTIME_TEMPLATE_PATH,
  RELEASE_GATE_SCHEMA,
  REPORT_SCHEMA_SUPPLEMENTAL,
  SUPPLEMENTAL_TEMPLATE_PATH,
  TEMPLATE_SCHEMA,
  buildReleaseGate,
  buildSupplementalReport,
  readBoundJson,
  validateTemplate,
  validateFullRuntimeTemplate,
  verifyContentId,
  verifyEvidence,
  verifyCompiledPolicy,
  verifyMatrixReport,
  verifyMatrixArtifactCoherence,
  verifyMatrixBrowserSubjectCoherence,
  verifyMatrixScipyOracleCoherence,
  verifyMatrixSoakArtifactCoherence,
  qualificationInternals: { addUniqueReceiptId, validateExternalExecutableBinding },
};
