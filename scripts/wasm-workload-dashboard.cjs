#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ROUTE_CLASSES = Object.freeze([
  "wasm-library",
  "wasm-compiled-source",
  "portable-orchestration",
  "portable-computation",
]);
const LEGACY_ROUTES = new Set([
  "receipt-backed-wasm-artifact",
  "shared-runtime-js",
  "portable-fallback",
]);
const ROUTE_TARGETS = Object.freeze({
  "receipt-backed-wasm-artifact": "wasm-artifact",
  "shared-runtime-js": "host-runtime-js",
  "portable-fallback": "portable-python",
});
const BROWSER_ENGINES = new Set(["chromium", "firefox", "webkit"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readDocument(filename) {
  const bytes = fs.readFileSync(filename);
  return {
    filename,
    bytes,
    document: JSON.parse(bytes.toString("utf8")),
    sha256: sha256(bytes),
  };
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function checkedString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function checkedCounter(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error(`${label} must be a ${positive ? "positive" : "nonnegative"} safe integer`);
  }
  return value;
}

function validateRequirements(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must contain capability routes`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    if (
      !plainObject(item) || typeof item.id !== "string" || item.id.length === 0 ||
      !LEGACY_ROUTES.has(item.route)
    ) {
      throw new Error(`${label}[${index}] is not an exact reviewed route`);
    }
    if (seen.has(item.id)) throw new Error(`${label} repeats capability ${item.id}`);
    seen.add(item.id);
    return { id: item.id, route: item.route };
  });
}

function validatePolicy(policy) {
  if (!plainObject(policy) || policy.schema !== "sagejs.wasm-workload-policy/v1") {
    throw new Error("unsupported WebAssembly workload policy schema");
  }
  const heavy = policy.heavy_workloads;
  if (
    !plainObject(heavy) || !Array.isArray(heavy.parity_tiers) ||
    heavy.parity_tiers.some((tier) => !["routine", "release"].includes(tier)) ||
    typeof heavy.performance_cases !== "boolean" ||
    !Array.isArray(heavy.required_browser_engines) ||
    heavy.required_browser_engines.length === 0 ||
    heavy.required_browser_engines.some((engine) => !BROWSER_ENGINES.has(engine)) ||
    new Set(heavy.required_browser_engines).size !== heavy.required_browser_engines.length
  ) {
    throw new Error("invalid heavy_workloads policy");
  }
  const trusted = policy.trusted_telemetry;
  if (
    !plainObject(trusted) || trusted.parity_receipt_kind !== "sagejs-browser-wasm-parity" ||
    trusted.parity_schema_version !== 1 ||
    trusted.performance_receipt_schema !== "sagejs.browser-wasm-performance/v2" ||
    trusted.require_matching_workload_identity !== true ||
    trusted.require_private_instrumentation !== true ||
    !["match-if-present", "exact"].includes(trusted.source_revision_policy)
  ) {
    throw new Error("invalid trusted_telemetry policy");
  }
  if (trusted.source_revision_policy === "exact") {
    checkedString(trusted.expected_source_revision, "trusted expected_source_revision");
  }
  if (!Array.isArray(policy.portable_route_reviews)) {
    throw new Error("portable_route_reviews must be an array");
  }
  const keys = new Set();
  for (const [index, review] of policy.portable_route_reviews.entries()) {
    if (
      !plainObject(review) || !/^(parity|performance):[a-z0-9-]+$/.test(review.workload) ||
      typeof review.capability !== "string" || review.capability.length === 0 ||
      !["portable-orchestration", "portable-computation"].includes(review.classification) ||
      typeof review.normal_domain !== "string" || review.normal_domain.length === 0 ||
      review.heavy_policy !== "prohibited" ||
      typeof review.reason !== "string" || review.reason.length === 0
    ) {
      throw new Error(`invalid portable route review ${index}`);
    }
    const key = `${review.workload}\0${review.capability}`;
    if (keys.has(key)) throw new Error(`duplicate portable route review ${key.replace("\0", " / ")}`);
    keys.add(key);
  }
  if (
    policy.default_receipt_directories !== undefined &&
    (!Array.isArray(policy.default_receipt_directories) ||
      policy.default_receipt_directories.some((item) =>
        typeof item !== "string" || item.length === 0 || path.isAbsolute(item) ||
        item.split(/[\\/]/).includes("..")))
  ) {
    throw new Error("default_receipt_directories must contain safe repository-relative paths");
  }
  return policy;
}

function validateCapabilityReport(report) {
  if (
    report?.schema !== "sagejs.wasm-capability-report/v1" ||
    !Array.isArray(report.capabilities) || !plainObject(report.counts)
  ) {
    throw new Error("invalid WebAssembly capability report");
  }
  const result = new Map();
  for (const capability of report.capabilities) {
    checkedString(capability?.id, "capability ID");
    if (result.has(capability.id)) throw new Error(`duplicate capability ${capability.id}`);
    result.set(capability.id, capability);
  }
  return result;
}

function validateKernelCoverage(report) {
  if (
    report?.schema !== "sagejs.wasm-production-kernel-coverage/v1" ||
    !plainObject(report.totals) || !Array.isArray(report.kernels)
  ) {
    throw new Error("invalid WebAssembly production kernel coverage report");
  }
  const result = new Map();
  for (const kernel of report.kernels) {
    checkedString(kernel?.id, "kernel coverage ID");
    if (result.has(kernel.id)) throw new Error(`duplicate kernel coverage ${kernel.id}`);
    result.set(kernel.id, kernel);
  }
  return result;
}

function normalizeWorkloads(corpus, performance, policy) {
  if (corpus?.schema_version !== 2 || !Array.isArray(corpus.cases)) {
    throw new Error("invalid browser Wasm parity corpus");
  }
  if (
    performance?.schema !== "sagejs.browser-wasm-performance-cases/v1" ||
    !Array.isArray(performance.cases)
  ) {
    throw new Error("invalid browser Wasm performance manifest");
  }
  const workloads = [];
  const keys = new Set();
  for (const item of corpus.cases) {
    const key = `parity:${checkedString(item?.id, "parity case ID")}`;
    if (keys.has(key)) throw new Error(`duplicate workload ${key}`);
    keys.add(key);
    checkedString(item.family, `${key} family`);
    checkedString(item.workflow, `${key} public workflow`);
    if (!["routine", "release"].includes(item.tier)) throw new Error(`${key} has invalid tier`);
    workloads.push({
      key,
      source: "parity-corpus",
      id: item.id,
      workflow: item.workflow,
      family: item.family,
      tier: item.tier,
      heavy: policy.heavy_workloads.parity_tiers.includes(item.tier),
      requirements: validateRequirements(item.requires, `${key} requirements`),
    });
  }
  for (const item of performance.cases) {
    const key = `performance:${checkedString(item?.id, "performance case ID")}`;
    if (keys.has(key)) throw new Error(`duplicate workload ${key}`);
    keys.add(key);
    checkedString(item.family, `${key} family`);
    workloads.push({
      key,
      source: "performance-manifest",
      id: item.id,
      workflow: item.id,
      family: item.family,
      tier: "performance",
      heavy: policy.heavy_workloads.performance_cases,
      requirements: validateRequirements(item.requires, `${key} requirements`),
    });
  }
  return workloads;
}

function validatePortableReviews(policy, workloadByKey, capabilityById) {
  for (const review of policy.portable_route_reviews) {
    const workload = workloadByKey.get(review.workload);
    if (!workload) {
      throw new Error(`portable route review names unknown workload ${review.workload}`);
    }
    if (!capabilityById.has(review.capability)) {
      throw new Error(`portable route review names unknown capability ${review.capability}`);
    }
    if (!workload.requirements.some((requirement) =>
      requirement.id === review.capability && requirement.route === "portable-fallback")) {
      throw new Error(
        `portable route review ${review.workload} / ${review.capability} ` +
        "does not match a portable requirement",
      );
    }
  }
}

function normalizeRouteRecord(record, label) {
  if (
    !plainObject(record) || typeof record.capability_id !== "string" ||
    record.capability_id.length === 0 || !LEGACY_ROUTES.has(record.selected_route) ||
    record.execution_target !== ROUTE_TARGETS[record.selected_route]
  ) {
    throw new Error(`${label} is not private evaluator route telemetry`);
  }
  return {
    capability_id: record.capability_id,
    selected_route: record.selected_route,
    execution_target: record.execution_target,
    call_count: checkedCounter(record.call_count, `${label} call_count`, { positive: true }),
    ingress_bytes: checkedCounter(record.ingress_bytes, `${label} ingress_bytes`),
    egress_bytes: checkedCounter(record.egress_bytes, `${label} egress_bytes`),
  };
}

function normalizeRawInstrumentation(instrumentation, label) {
  if (!plainObject(instrumentation) || !Array.isArray(instrumentation.routes)) {
    throw new Error(`${label} has no private evaluator instrumentation`);
  }
  const routes = instrumentation.routes.map((route, index) =>
    normalizeRouteRecord(route, `${label}.routes[${index}]`));
  const crossings = routes.reduce((sum, route) => sum + route.call_count, 0);
  const copied = routes.reduce(
    (sum, route) => sum + route.ingress_bytes + route.egress_bytes,
    0,
  );
  if (instrumentation.boundary_crossings !== crossings || instrumentation.copied_bytes !== copied) {
    throw new Error(`${label} counters do not agree with its private routes`);
  }
  return { routes, boundary_crossings: crossings, copied_bytes: copied };
}

function sortedRoutes(routes) {
  return [...routes].sort((left, right) =>
    left.capability_id.localeCompare(right.capability_id) ||
    left.selected_route.localeCompare(right.selected_route) ||
    left.execution_target.localeCompare(right.execution_target));
}

function aggregateRoutes(samples) {
  const result = new Map();
  for (const sample of samples) {
    for (const route of sample.routes) {
      const key = `${route.capability_id}\0${route.selected_route}\0${route.execution_target}`;
      const current = result.get(key) ?? {
        capability_id: route.capability_id,
        selected_route: route.selected_route,
        execution_target: route.execution_target,
        call_count: 0,
        ingress_bytes: 0,
        egress_bytes: 0,
      };
      current.call_count += route.call_count;
      current.ingress_bytes += route.ingress_bytes;
      current.egress_bytes += route.egress_bytes;
      result.set(key, current);
    }
  }
  return sortedRoutes(result.values());
}

function validateDistribution(distribution, values, label) {
  if (!plainObject(distribution) || !Array.isArray(distribution.samples)) {
    throw new Error(`${label} distribution is absent`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const expected = {
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted.at(-1),
    samples: values,
  };
  if (!sameJson(distribution, expected)) throw new Error(`${label} distribution is inconsistent`);
}

function normalizePerformanceInstrumentation(summary, requirements, label) {
  if (
    !plainObject(summary) || summary.status !== "available" ||
    !Array.isArray(summary.samples) || summary.samples.length === 0 ||
    summary.samples.some((sample) => sample === null)
  ) {
    throw new Error(`${label} lacks complete private evaluator telemetry`);
  }
  const samples = summary.samples.map((sample, index) =>
    normalizeRawInstrumentation(sample, `${label}.samples[${index}]`));
  const aggregate = aggregateRoutes(samples);
  const observed = Array.isArray(summary.observed_routes)
    ? sortedRoutes(summary.observed_routes.map((route, index) =>
      normalizeRouteRecord(route, `${label}.observed_routes[${index}]`)))
    : null;
  if (observed === null || !sameJson(observed, aggregate)) {
    throw new Error(`${label} aggregate routes are inconsistent`);
  }
  validateDistribution(
    summary.boundary_crossings,
    samples.map((sample) => sample.boundary_crossings),
    `${label} boundary_crossings`,
  );
  validateDistribution(
    summary.copied_bytes,
    samples.map((sample) => sample.copied_bytes),
    `${label} copied_bytes`,
  );
  if (!Array.isArray(summary.required_routes) || summary.required_routes.length !== requirements.length) {
    throw new Error(`${label} does not account for every required route`);
  }
  for (const [index, requirement] of requirements.entries()) {
    const record = summary.required_routes[index];
    if (
      record?.capability_id !== requirement.id || record.expected_route !== requirement.route ||
      record.status !== "matched" ||
      !aggregate.some((route) =>
        route.capability_id === requirement.id && route.selected_route === requirement.route)
    ) {
      throw new Error(`${label} did not observe required route ${requirement.id}`);
    }
  }
  return {
    routes: aggregate,
    boundary_crossings: summary.boundary_crossings,
    copied_bytes: summary.copied_bytes,
  };
}

function validateSelectedProvenance(selected, requirements, label) {
  if (!Array.isArray(selected)) throw new Error(`${label} has no selected route provenance`);
  for (const requirement of requirements) {
    const route = selected.find((item) =>
      item?.id === requirement.id && item.route === requirement.route);
    if (!route) throw new Error(`${label} has no provenance for ${requirement.id}`);
    if (requirement.route === "receipt-backed-wasm-artifact") {
      if (
        route.provenance !== "production-artifact-manifest" ||
        !/^[0-9a-f]{64}$/.test(route.artifact_sha256 ?? "") ||
        typeof route.module !== "string" || typeof route.artifact !== "string"
      ) {
        throw new Error(`${label} lacks authenticated artifact provenance for ${requirement.id}`);
      }
    } else if (route.provenance !== "reviewed-public-capability-report") {
      throw new Error(`${label} lacks reviewed route provenance for ${requirement.id}`);
    }
  }
}

function collectJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectJsonFiles(filename));
    else if (entry.isFile() && entry.name.endsWith(".json")) result.push(filename);
  }
  return result.sort();
}

function receiptFiles(root, policy, options) {
  const explicit = options.receiptPaths ?? [];
  const directories = options.receiptDirectories ??
    (policy.default_receipt_directories ?? []).map((item) => path.join(root, item));
  return [...new Set([
    ...explicit.map((item) => path.resolve(item)),
    ...directories.flatMap((item) => collectJsonFiles(path.resolve(item))),
  ])].sort();
}

function storeObservation(observations, ambiguous, workload, engine, value) {
  const key = `${workload}\0${engine}`;
  if (observations.has(key)) {
    observations.delete(key);
    ambiguous.add(key);
    throw new Error(`duplicate trusted telemetry for ${workload} on ${engine}`);
  }
  if (ambiguous.has(key)) throw new Error(`ambiguous telemetry for ${workload} on ${engine}`);
  observations.set(key, value);
}

function receiptRevision(receipt, policy, revisions) {
  const revision = receipt.source_revision;
  if (revision !== null && revision !== undefined) {
    checkedString(revision, "receipt source_revision");
    if (
      policy.trusted_telemetry.source_revision_policy === "exact" &&
      revision !== policy.trusted_telemetry.expected_source_revision
    ) {
      throw new Error(`receipt source revision ${revision} is not the required revision`);
    }
    revisions.add(revision);
    if (
      policy.trusted_telemetry.source_revision_policy === "match-if-present" &&
      revisions.size > 1
    ) {
      throw new Error("route receipts come from different source revisions");
    }
  } else if (policy.trusted_telemetry.source_revision_policy === "exact") {
    throw new Error("route receipt has no exact source revision");
  }
}

function consumeParityReceipt(receipt, context, filename) {
  const { policy, parityIdentity, workloadByKey, observations, ambiguous, revisions } = context;
  if (
    receipt.kind !== policy.trusted_telemetry.parity_receipt_kind ||
    receipt.schema_version !== policy.trusted_telemetry.parity_schema_version
  ) {
    return false;
  }
  if (receipt.corpus_sha256 !== parityIdentity) {
    throw new Error("parity receipt does not match the checked-in corpus identity");
  }
  receiptRevision(receipt, policy, revisions);
  if (!Array.isArray(receipt.engines)) throw new Error("parity receipt has no engine results");
  for (const engine of receipt.engines) {
    if (!BROWSER_ENGINES.has(engine?.engine) || engine.status !== "passed") continue;
    if (!Array.isArray(engine.cases)) throw new Error(`parity ${engine.engine} has no cases`);
    for (const item of engine.cases) {
      const key = `parity:${item?.id}`;
      const workload = workloadByKey.get(key);
      if (!workload) throw new Error(`parity receipt contains unknown workload ${key}`);
      if (
        item.status !== "passed" || item.family !== workload.family ||
        item.workflow !== workload.workflow ||
        !sameJson(item.required_capability_routes, workload.requirements)
      ) {
        throw new Error(`${key} is not a passing identity-matched parity result`);
      }
      validateSelectedProvenance(
        item.selected_capability_routes,
        workload.requirements,
        `${key} selected routes`,
      );
      const instrumentation = normalizeRawInstrumentation(
        item.instrumentation,
        `${key} instrumentation`,
      );
      for (const requirement of workload.requirements) {
        if (!instrumentation.routes.some((route) =>
          route.capability_id === requirement.id && route.selected_route === requirement.route)) {
          throw new Error(`${key} did not privately observe ${requirement.id}`);
        }
      }
      storeObservation(observations, ambiguous, key, engine.engine, {
        receipt: filename,
        routes: instrumentation.routes,
        boundary_crossings: instrumentation.boundary_crossings,
        copied_bytes: instrumentation.copied_bytes,
      });
    }
  }
  return true;
}

function consumePerformanceReceipt(receipt, context, filename) {
  const { policy, performanceIdentity, workloadByKey, observations, ambiguous, revisions } = context;
  if (receipt.schema !== policy.trusted_telemetry.performance_receipt_schema) return false;
  if (receipt.runtime?.kind !== "browser-wasm" || !BROWSER_ENGINES.has(receipt.runtime.engine)) {
    return true;
  }
  if (receipt.workload_identity !== performanceIdentity) {
    throw new Error("performance receipt does not match the checked-in workload identity");
  }
  receiptRevision(receipt, policy, revisions);
  if (!plainObject(receipt.operations)) throw new Error("performance receipt has no operations");
  for (const [id, operation] of Object.entries(receipt.operations)) {
    const key = `performance:${id}`;
    const workload = workloadByKey.get(key);
    if (!workload) throw new Error(`performance receipt contains unknown workload ${key}`);
    if (
      operation?.family !== workload.family ||
      !sameJson(operation.required_capability_routes, workload.requirements)
    ) {
      throw new Error(`${key} does not match the checked-in workload definition`);
    }
    const instrumentation = normalizePerformanceInstrumentation(
      operation.instrumentation?.warm,
      workload.requirements,
      `${key} warm instrumentation`,
    );
    storeObservation(observations, ambiguous, key, receipt.runtime.engine, {
      receipt: filename,
      routes: instrumentation.routes,
      boundary_crossings: instrumentation.boundary_crossings,
      copied_bytes: instrumentation.copied_bytes,
    });
  }
  return true;
}

function capabilityRouteClass(route, capability) {
  if (route === "shared-runtime-js") return "portable-orchestration";
  if (route === "portable-fallback") return "portable-computation";
  return capability?.disposition === "compiled-source" || capability?.id?.startsWith("kernel:")
    ? "wasm-compiled-source"
    : "wasm-library";
}

function portableReview(policy, workload, capability) {
  return policy.portable_route_reviews.find((review) =>
    review.workload === workload && review.capability === capability) ?? null;
}

function classifyRoute(route, workload, capabilityById, policy) {
  const capability = capabilityById.get(route.id ?? route.capability_id);
  let routeClass = capabilityRouteClass(route.route ?? route.selected_route, capability);
  const legacy = route.route ?? route.selected_route;
  const review = legacy === "portable-fallback"
    ? portableReview(policy, workload, route.id ?? route.capability_id)
    : null;
  if (review) routeClass = review.classification;
  return {
    capability_id: route.id ?? route.capability_id,
    legacy_route: legacy,
    route_class: routeClass,
    reviewed: legacy !== "portable-fallback" || review !== null,
    review: review ? {
      normal_domain: review.normal_domain,
      heavy_policy: review.heavy_policy,
      reason: review.reason,
    } : null,
    capability_status: capability?.status ?? "unknown",
    capability_disposition: capability?.disposition ?? "unknown",
  };
}

function requirementIssues(workload, expected, capabilityById, kernelById) {
  const issues = [];
  for (const route of expected) {
    const capability = capabilityById.get(route.capability_id);
    if (!capability) {
      issues.push({ code: "unknown-capability", capability_id: route.capability_id });
      continue;
    }
    if (route.legacy_route === "receipt-backed-wasm-artifact" && capability.status !== "available") {
      issues.push({
        code: "required-wasm-capability-unavailable",
        capability_id: route.capability_id,
        status: capability.status,
      });
    }
    if (route.capability_id.startsWith("kernel:")) {
      const kernel = kernelById.get(route.capability_id.slice("kernel:".length));
      if (!kernel || kernel.status !== "available") {
        issues.push({
          code: "production-kernel-unavailable",
          capability_id: route.capability_id,
          status: kernel?.status ?? "missing",
        });
      }
    }
    if (route.route_class === "portable-computation" && !route.reviewed) {
      issues.push({ code: "unreviewed-portable-computation", capability_id: route.capability_id });
    }
    if (workload.heavy && route.route_class === "portable-computation") {
      issues.push({ code: "portable-computation-on-heavy-workload", capability_id: route.capability_id });
    }
  }
  return issues;
}

function relativeFilename(root, filename) {
  const relative = path.relative(root, filename).split(path.sep).join("/");
  return relative.startsWith("../") ? filename : relative;
}

function buildDashboard(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const inputs = options.inputs ?? {
    policy: readDocument(path.join(root, "architecture", "wasm-workload-policy.json")),
    parity: readDocument(path.join(root, "test", "browser-wasm-parity-corpus.json")),
    capabilities: readDocument(path.join(root, "architecture", "wasm-capabilities-report.json")),
    kernels: readDocument(path.join(root, "packages", "flint-wasm", "release", "production-kernel-coverage.json")),
    performance: readDocument(path.join(root, "bench", "browser-wasm-performance-cases.json")),
  };
  const policy = validatePolicy(inputs.policy.document);
  const capabilityById = validateCapabilityReport(inputs.capabilities.document);
  const kernelById = validateKernelCoverage(inputs.kernels.document);
  const workloads = normalizeWorkloads(
    inputs.parity.document,
    inputs.performance.document,
    policy,
  );
  const workloadByKey = new Map(workloads.map((item) => [item.key, item]));
  validatePortableReviews(policy, workloadByKey, capabilityById);
  const observations = new Map();
  const ambiguous = new Set();
  const rejectedReceipts = [];
  const acceptedReceipts = [];
  const revisions = new Set();
  const contextBase = {
    policy,
    parityIdentity: sha256(JSON.stringify(inputs.parity.document)),
    performanceIdentity: `sha256:${inputs.performance.sha256}`,
    workloadByKey,
  };
  for (const filename of receiptFiles(root, policy, options)) {
    try {
      const input = readDocument(filename);
      // A receipt is transactional: no earlier valid case from the same file
      // survives if a later case is malformed. This prevents a partially
      // edited receipt from laundering a subset of its telemetry.
      const stagedObservations = new Map();
      const stagedAmbiguous = new Set();
      const stagedRevisions = new Set(revisions);
      const stagedContext = {
        ...contextBase,
        observations: stagedObservations,
        ambiguous: stagedAmbiguous,
        revisions: stagedRevisions,
      };
      const accepted = consumeParityReceipt(input.document, stagedContext, filename) ||
        consumePerformanceReceipt(input.document, stagedContext, filename);
      if (!accepted) throw new Error("unsupported route receipt schema");
      const conflicts = [...stagedObservations.keys()].filter((key) =>
        observations.has(key) || ambiguous.has(key));
      if (conflicts.length) {
        for (const key of conflicts) {
          observations.delete(key);
          ambiguous.add(key);
        }
        throw new Error(
          `duplicate trusted telemetry for ${conflicts.map((key) => key.replace("\0", " on ")).join(", ")}`,
        );
      }
      for (const [key, value] of stagedObservations) observations.set(key, value);
      for (const revision of stagedRevisions) revisions.add(revision);
      acceptedReceipts.push({
        path: relativeFilename(root, filename),
        sha256: input.sha256,
      });
    } catch (error) {
      rejectedReceipts.push({
        path: relativeFilename(root, filename),
        reason: String(error.message ?? error),
      });
    }
  }

  const requiredEngines = policy.heavy_workloads.required_browser_engines;
  const results = workloads.map((workload) => {
    const expectedRoutes = workload.requirements.map((route) =>
      classifyRoute(route, workload.key, capabilityById, policy));
    const issues = requirementIssues(workload, expectedRoutes, capabilityById, kernelById);
    const engines = {};
    for (const engine of requiredEngines) {
      const observation = observations.get(`${workload.key}\0${engine}`);
      if (!observation) {
        engines[engine] = {
          status: ambiguous.has(`${workload.key}\0${engine}`) ? "ambiguous" : "missing",
          observed_routes: [],
        };
        if (workload.heavy) {
          issues.push({
            code: "missing-trusted-route-telemetry",
            engine,
          });
        }
        continue;
      }
      const observedRoutes = observation.routes.map((route) => ({
        ...classifyRoute(route, workload.key, capabilityById, policy),
        call_count: route.call_count,
        ingress_bytes: route.ingress_bytes,
        egress_bytes: route.egress_bytes,
      }));
      for (const route of observedRoutes) {
        if (route.route_class === "portable-computation" && !route.reviewed) {
          issues.push({
            code: "unreviewed-portable-computation",
            engine,
            capability_id: route.capability_id,
          });
        }
        if (workload.heavy && route.route_class === "portable-computation") {
          issues.push({
            code: "portable-computation-on-heavy-workload",
            engine,
            capability_id: route.capability_id,
          });
        }
      }
      engines[engine] = {
        status: "trusted",
        receipt: relativeFilename(root, observation.receipt),
        observed_routes: observedRoutes,
        boundary_crossings: observation.boundary_crossings,
        copied_bytes: observation.copied_bytes,
      };
    }
    const uniqueIssues = [...new Map(issues.map((issue) =>
      [JSON.stringify(issue), issue])).values()];
    let status;
    if (workload.heavy) status = uniqueIssues.length === 0 ? "accelerated" : "failed";
    else if (uniqueIssues.some((issue) => issue.code === "unreviewed-portable-computation")) {
      status = "review-required";
    } else if (expectedRoutes.some((route) => route.route_class === "portable-computation")) {
      status = "reviewed-fallback";
    } else if (Object.values(engines).every((engine) => engine.status === "trusted")) {
      status = "accelerated";
    } else status = "unmeasured";
    return {
      id: workload.key,
      public_workflow: workload.workflow,
      family: workload.family,
      tier: workload.tier,
      heavy: workload.heavy,
      status,
      expected_routes: expectedRoutes,
      engines,
      issues: uniqueIssues,
    };
  });

  const familyNames = [...new Set(results.map((item) => item.family))].sort();
  const families = Object.fromEntries(familyNames.map((family) => {
    const items = results.filter((item) => item.family === family);
    return [family, {
      workloads: items.length,
      heavy_workloads: items.filter((item) => item.heavy).length,
      accelerated: items.filter((item) => item.status === "accelerated").length,
      failed: items.filter((item) => item.status === "failed").length,
      reviewed_fallback: items.filter((item) => item.status === "reviewed-fallback").length,
      unmeasured_or_review_required: items.filter((item) =>
        ["unmeasured", "review-required"].includes(item.status)).length,
    }];
  }));
  const expectedClassCounts = Object.fromEntries(ROUTE_CLASSES.map((name) => [name, 0]));
  const observedClassCounts = Object.fromEntries(ROUTE_CLASSES.map((name) => [name, 0]));
  for (const item of results) {
    for (const route of item.expected_routes) expectedClassCounts[route.route_class] += 1;
    for (const engine of Object.values(item.engines)) {
      for (const route of engine.observed_routes) observedClassCounts[route.route_class] += route.call_count;
    }
  }
  const heavy = results.filter((item) => item.heavy);
  const failedHeavy = heavy.filter((item) => item.status === "failed");
  const overallStatus = failedHeavy.length > 0
    ? "failed"
    : results.every((item) => item.status === "accelerated")
      ? "complete"
      : "incomplete";
  return {
    schema: "sagejs.wasm-workload-dashboard/v1",
    status: overallStatus,
    policy_result: {
      heavy_workloads: heavy.length,
      accelerated_heavy_workloads: heavy.length - failedHeavy.length,
      failed_heavy_workloads: failedHeavy.length,
      required_browser_engines: requiredEngines,
      accepted_receipts: acceptedReceipts.length,
      rejected_receipts: rejectedReceipts.length,
    },
    input_receipts: {
      policy: { path: "architecture/wasm-workload-policy.json", sha256: inputs.policy.sha256 },
      parity_corpus: { path: "test/browser-wasm-parity-corpus.json", sha256: inputs.parity.sha256 },
      capability_report: { path: "architecture/wasm-capabilities-report.json", sha256: inputs.capabilities.sha256 },
      kernel_coverage: { path: "packages/flint-wasm/release/production-kernel-coverage.json", sha256: inputs.kernels.sha256 },
      performance_cases: { path: "bench/browser-wasm-performance-cases.json", sha256: inputs.performance.sha256 },
      route_receipts: acceptedReceipts,
      rejected_route_receipts: rejectedReceipts,
      source_revisions: [...revisions].sort(),
    },
    source_inventory: {
      parity_workloads: results.filter((item) => item.id.startsWith("parity:")).length,
      performance_workloads: results.filter((item) => item.id.startsWith("performance:")).length,
      capability_counts: inputs.capabilities.document.counts,
      kernel_coverage_totals: inputs.kernels.document.totals,
    },
    route_classes: {
      expected_requirements: expectedClassCounts,
      observed_calls: observedClassCounts,
    },
    families,
    workloads: results,
  };
}

function markdownDashboard(dashboard) {
  const lines = [
    "# WebAssembly public-workload acceleration dashboard",
    "",
    "> Generated by `scripts/wasm-workload-dashboard.cjs`; do not edit by hand.",
    "",
    `**Policy status:** ${dashboard.status}`,
    "",
    `Heavy workloads: ${dashboard.policy_result.accelerated_heavy_workloads}/${dashboard.policy_result.heavy_workloads} accelerated; ${dashboard.policy_result.failed_heavy_workloads} failed closed.`,
    "",
    `Trusted route receipts: ${dashboard.policy_result.accepted_receipts}; rejected receipts: ${dashboard.policy_result.rejected_receipts}.`,
    "",
    "## Route classes",
    "",
    "| Class | Expected requirements | Observed calls |",
    "| --- | ---: | ---: |",
    ...ROUTE_CLASSES.map((routeClass) =>
      `| \`${routeClass}\` | ${dashboard.route_classes.expected_requirements[routeClass]} | ${dashboard.route_classes.observed_calls[routeClass]} |`),
    "",
    "## Families",
    "",
    "| Family | Workloads | Heavy | Accelerated | Failed | Reviewed fallback | Pending/review |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(dashboard.families).map(([family, value]) =>
      `| ${family} | ${value.workloads} | ${value.heavy_workloads} | ${value.accelerated} | ${value.failed} | ${value.reviewed_fallback} | ${value.unmeasured_or_review_required} |`),
    "",
    "## Workloads",
    "",
    "| Workload | Family | Heavy | Status | Route classes | Blocking issues |",
    "| --- | --- | --- | --- | --- | --- |",
    ...dashboard.workloads.map((workload) => {
      const classes = [...new Set(workload.expected_routes.map((route) => route.route_class))]
        .map((item) => `\`${item}\``).join(", ");
      const issues = workload.issues.map((issue) => {
        const detail = [issue.engine, issue.capability_id].filter(Boolean).join("/");
        return `\`${issue.code}${detail ? `:${detail}` : ""}\``;
      }).join("<br>") || "—";
      return `| \`${workload.id}\` | ${workload.family} | ${workload.heavy ? "yes" : "no"} | ${workload.status} | ${classes} | ${issues} |`;
    }),
    "",
    "## Interpretation",
    "",
    "A capability report says what may be selected; it never proves what ran. A heavy workload is accelerated only when every required browser engine supplies corpus-identity-matched private evaluator telemetry and no substantial portable computation is observed. Missing, malformed, contradictory, user-output-only, or stale telemetry fails closed.",
  ];
  return `${lines.join("\n")}\n`;
}

function argumentValues(argv, name) {
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      if (argv[index + 1] === undefined) throw new Error(`${name} needs a value`);
      result.push(argv[index + 1]);
      index += 1;
    }
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const rootValues = argumentValues(argv, "--root");
  const root = path.resolve(rootValues.at(-1) ?? ROOT);
  const receiptPaths = argumentValues(argv, "--receipt").map((item) => path.resolve(item));
  const directoryValues = argumentValues(argv, "--receipts-dir");
  const options = { root, receiptPaths };
  if (directoryValues.length) {
    options.receiptDirectories = directoryValues.map((item) => path.resolve(item));
  }
  const dashboard = buildDashboard(options);
  const json = `${JSON.stringify(dashboard, null, 2)}\n`;
  const markdown = markdownDashboard(dashboard);
  const jsonPath = path.join(root, "architecture", "wasm-workload-dashboard.json");
  const markdownPath = path.join(root, "architecture", "wasm-workload-dashboard.md");
  if (argv.includes("--write")) {
    fs.writeFileSync(jsonPath, json);
    fs.writeFileSync(markdownPath, markdown);
  } else if (argv.includes("--verify-generated")) {
    if (fs.readFileSync(jsonPath, "utf8") !== json || fs.readFileSync(markdownPath, "utf8") !== markdown) {
      throw new Error("generated WebAssembly workload dashboard is stale; run with --write");
    }
  } else {
    process.stdout.write(json);
  }
  if (
    argv.includes("--check") &&
    dashboard.policy_result.failed_heavy_workloads !== 0
  ) {
    throw new Error(
      `WebAssembly workload acceleration policy is ${dashboard.status}: ` +
      `${dashboard.policy_result.failed_heavy_workloads} heavy workloads failed closed`,
    );
  }
  return dashboard;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  }
}

module.exports = {
  ROUTE_CLASSES,
  buildDashboard,
  main,
  markdownDashboard,
  normalizePerformanceInstrumentation,
  normalizeRawInstrumentation,
  sha256,
  validatePolicy,
};
