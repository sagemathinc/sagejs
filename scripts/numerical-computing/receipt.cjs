"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  PLATFORM_IDS,
  array,
  canonicalJson,
  collectorIdentity,
  contentId,
  digestBundle,
  digestPath,
  exactKeys,
  fail,
  finiteNumber,
  isObject,
  nonemptyString,
  platformIdentity,
  pretty,
  readJson,
  repositoryIdentity,
  repositoryPath,
  safeInteger,
  sha256,
  summary,
  validateContentId,
  validateJsonValue,
  validateSha256,
} = require("./common.cjs");
const {
  ADAPTER_PROTOCOL,
  RECEIPT_SCHEMA,
  createCapabilityManifest,
  validateAdapterInitialization,
  validateCapabilityManifest,
  validateCorpus,
  validateObservation,
} = require("./contracts.cjs");

const MAX_OBSERVATION_BYTES = 16 * 1024 * 1024;

function elapsedMilliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function parseArtifactSpecifications(root, specifications) {
  const bindings = array(
    "artifacts", specifications,
    (label, specification) => {
      const separator = specification.indexOf("=");
      if (separator <= 0 || separator === specification.length - 1) {
        fail(label, "must be NAME=REPOSITORY_PATH");
      }
      const name = nonemptyString(`${label}.name`, specification.slice(0, separator));
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
        fail(`${label}.name`, "contains unsupported characters");
      }
      const binding = digestPath(root, specification.slice(separator + 1), `${label}.path`);
      return { name, ...binding };
    },
    { minimum: 1, uniqueBy: (item) => item.name },
  );
  return bindings.sort((left, right) => left.name.localeCompare(right.name));
}

function inputBindings({ root, corpusPath, adapterPath, artifactSpecifications }) {
  const corpusBinding = digestPath(root, corpusPath, "corpus path");
  const corpus = validateCorpus(readJson(path.join(root, corpusBinding.path)));
  const sourceBundle = digestBundle(root, corpus.source_paths, "corpus.source_paths");
  const adapter = digestPath(root, adapterPath, "adapter path");
  const artifacts = parseArtifactSpecifications(root, artifactSpecifications);
  return { corpusBinding, corpus, sourceBundle, adapter, artifacts };
}

function bindCapabilityDraft({
  root,
  corpusPath,
  adapterPath,
  artifactSpecifications,
  draftPath,
}) {
  const inputs = inputBindings({ root, corpusPath, adapterPath, artifactSpecifications });
  const draft = readJson(repositoryPath(root, draftPath, "capability draft path").absolute);
  return createCapabilityManifest(draft, {
    corpus_sha256: inputs.corpusBinding.sha256,
    source_bundle_sha256: inputs.sourceBundle.sha256,
    adapter_sha256: inputs.adapter.sha256,
    artifacts: inputs.artifacts.map(({ name, sha256: digest }) => ({ name, sha256: digest })),
  }, inputs.corpus);
}

function assertManifestBindings(manifest, inputs) {
  const expected = {
    corpus_sha256: inputs.corpusBinding.sha256,
    source_bundle_sha256: inputs.sourceBundle.sha256,
    adapter_sha256: inputs.adapter.sha256,
    artifacts: inputs.artifacts.map(({ name, sha256: digest }) => ({ name, sha256: digest })),
  };
  if (canonicalJson(manifest.bindings) !== canonicalJson(expected)) {
    fail("capability manifest.bindings", "do not match the current corpus, source, adapter, and artifacts");
  }
}

function resolvePointer(document, pointer, label) {
  let current = document;
  for (const raw of pointer.slice(1).split("/")) {
    const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) fail(label, `missing JSON pointer ${pointer}`);
      const index = Number(token);
      if (index >= current.length) fail(label, `missing JSON pointer ${pointer}`);
      current = current[index];
    } else if (isObject(current) && Object.hasOwn(current, token)) {
      current = current[token];
    } else {
      fail(label, `missing JSON pointer ${pointer}`);
    }
  }
  return current;
}

function operandValue(observation, operand, label) {
  return Object.hasOwn(operand, "literal")
    ? operand.literal
    : resolvePointer(observation, operand.pointer, label);
}

function evaluateCheck(check, observation) {
  let actual = null;
  let expected = null;
  let passed;
  const details = {};
  try {
    actual = resolvePointer(observation, check.actual, `check ${check.id}`);
    if (check.kind === "finite") {
      passed = typeof actual === "number" && Number.isFinite(actual);
    } else {
      expected = operandValue(observation, check.expected, `check ${check.id}.expected`);
      if (check.kind === "deep-equal") {
        passed = canonicalJson(actual) === canonicalJson(expected);
      } else if (check.kind === "approximate") {
        if (typeof actual !== "number" || !Number.isFinite(actual) ||
            typeof expected !== "number" || !Number.isFinite(expected)) {
          passed = false;
        } else {
          const absoluteError = Math.abs(actual - expected);
          const limit = check.absolute_tolerance +
            check.relative_tolerance * Math.max(Math.abs(actual), Math.abs(expected));
          details.absolute_error = absoluteError;
          details.limit = limit;
          passed = absoluteError <= limit;
        }
      } else if (check.kind === "less-than-or-equal") {
        passed = typeof actual === "number" && Number.isFinite(actual) &&
          typeof expected === "number" && Number.isFinite(expected) && actual <= expected;
      } else if (check.kind === "greater-than-or-equal") {
        passed = typeof actual === "number" && Number.isFinite(actual) &&
          typeof expected === "number" && Number.isFinite(expected) && actual >= expected;
      } else {
        fail(`check ${check.id}`, `unsupported check kind ${check.kind}`);
      }
    }
  } catch (error) {
    passed = false;
    details.evaluation_error_sha256 = sha256(String(error?.message ?? error));
  }
  return {
    id: check.id,
    kind: check.kind,
    status: passed ? "passed" : "failed",
    actual_sha256: sha256(canonicalJson(actual)),
    expected_sha256: expected === null ? null : sha256(canonicalJson(expected)),
    details,
  };
}

function evaluateObservation(caseContract, observation) {
  const normalized = validateObservation(observation);
  const encoded = canonicalJson(normalized);
  if (Buffer.byteLength(encoded) > MAX_OBSERVATION_BYTES) {
    fail(`case ${caseContract.id}`, `observation exceeds ${MAX_OBSERVATION_BYTES} bytes`);
  }
  const failurePassed = normalized.outcome.kind === caseContract.expected.outcome &&
    normalized.outcome.code === caseContract.expected.failure_code;
  const checks = caseContract.checks.map((check) => ({
    evidence: check.evidence,
    result: evaluateCheck(check, normalized),
  }));
  const correctness = checks.filter((item) => item.evidence === "correctness")
    .map((item) => item.result);
  const validation = checks.filter((item) => item.evidence === "validation")
    .map((item) => item.result);
  const aggregate = (items) => items.every((item) => item.status === "passed")
    ? "passed"
    : "failed";
  const evidence = {
    failure: {
      status: failurePassed ? "passed" : "failed",
      expected_outcome: caseContract.expected.outcome,
      expected_code: caseContract.expected.failure_code,
      observed_outcome: normalized.outcome.kind,
      observed_code: normalized.outcome.code,
    },
    correctness: { status: aggregate(correctness), checks: correctness },
    validation: { status: aggregate(validation), checks: validation },
  };
  return {
    observation: normalized,
    evidence,
    status: [evidence.failure.status, evidence.correctness.status, evidence.validation.status]
      .every((item) => item === "passed") ? "passed" : "failed",
  };
}

function adapterExceptionObservation(error) {
  const message = String(error?.message ?? error);
  return {
    outcome: { kind: "failure", code: "qualification.adapter-exception" },
    values: {
      harness_error: {
        name: typeof error?.name === "string" ? error.name : "Error",
        message_sha256: sha256(message),
        stack_sha256: sha256(String(error?.stack ?? message)),
      },
    },
    metrics: { phases_ms: {}, counters: {} },
  };
}

function maxRssBytes() {
  if (typeof process.resourceUsage !== "function") return null;
  const value = process.resourceUsage().maxRSS;
  return Number.isFinite(value) && value > 0 ? value * 1024 : null;
}

async function measuredSample(adapter, caseContract, kind, index) {
  const rssBefore = process.memoryUsage().rss;
  let sampledPeak = rssBefore;
  const sampler = setInterval(() => {
    sampledPeak = Math.max(sampledPeak, process.memoryUsage().rss);
  }, 5);
  sampler.unref();
  const started = process.hrtime.bigint();
  let observation;
  try {
    observation = await adapter.runCase({
      id: caseContract.id,
      program_phase: caseContract.program_phase,
      layer: caseContract.layer,
      workload_tier: caseContract.workload_tier,
      campaign: caseContract.campaign,
      input: caseContract.input,
      sample_kind: kind,
      sample_index: index,
    });
  } catch (error) {
    observation = adapterExceptionObservation(error);
  } finally {
    clearInterval(sampler);
  }
  const wall = elapsedMilliseconds(started);
  const rssAfter = process.memoryUsage().rss;
  sampledPeak = Math.max(sampledPeak, rssAfter);
  let evaluated;
  try {
    evaluated = evaluateObservation(caseContract, observation);
  } catch (error) {
    evaluated = evaluateObservation(caseContract, adapterExceptionObservation(error));
  }
  return {
    ...evaluated,
    metrics: {
      wall_ms: wall,
      rss_before_bytes: rssBefore,
      rss_after_bytes: rssAfter,
      rss_peak_sampled_bytes: sampledPeak,
      process_max_rss_bytes: maxRssBytes(),
      memory_method: "process.memoryUsage.rss sampled at boundaries and 5ms async intervals",
    },
  };
}

function capabilityEvidence(caseContract, manifest, initialization) {
  const byId = new Map(manifest.capabilities.map((item) => [item.id, item]));
  const observed = new Set(initialization.capability_ids);
  return caseContract.required_capabilities.map((id) => {
    const capability = byId.get(id);
    const status = capability !== undefined && capability.status === "available" &&
      capability.case_ids.includes(caseContract.id) && observed.has(id)
      ? "passed"
      : "failed";
    return {
      id,
      status,
      manifest_status: capability?.status ?? "missing",
      case_covered: capability?.case_ids.includes(caseContract.id) ?? false,
      adapter_observed: observed.has(id),
      reason: capability?.reason ?? (capability === undefined ? "missing from manifest" : null),
      envelope: capability?.envelope ?? null,
    };
  });
}

function caseMetrics(samples) {
  const phases = new Map();
  for (const sample of samples) {
    for (const [name, value] of Object.entries(sample.observation.metrics.phases_ms)) {
      if (!phases.has(name)) phases.set(name, []);
      phases.get(name).push(value);
    }
  }
  return {
    wall_ms: samples.length === 0 ? null : summary(samples.map((item) => item.metrics.wall_ms)),
    rss_peak_sampled_bytes: samples.length === 0
      ? null
      : Math.max(...samples.map((item) => item.metrics.rss_peak_sampled_bytes)),
    process_max_rss_bytes: samples.length === 0
      ? null
      : Math.max(...samples.map((item) => item.metrics.process_max_rss_bytes ?? 0)) || null,
    adapter_phases_ms: Object.fromEntries([...phases.entries()].sort().map(
      ([name, values]) => [name, summary(values)],
    )),
  };
}

async function collectCase(adapter, caseContract, manifest, initialization) {
  const capabilities = capabilityEvidence(caseContract, manifest, initialization);
  if (capabilities.some((item) => item.status !== "passed")) {
    return {
      case_id: caseContract.id,
      contract_sha256: sha256(canonicalJson(caseContract)),
      program_phase: caseContract.program_phase,
      layer: caseContract.layer,
      workload_tier: caseContract.workload_tier,
      campaign: caseContract.campaign,
      status: "failed",
      failure_reason: "missing-capability-evidence",
      capability_evidence: capabilities,
      warmup: [],
      samples: [],
      metrics: caseMetrics([]),
    };
  }
  const warmup = [];
  for (let index = 0; index < caseContract.measurement.warmup; index += 1) {
    warmup.push(await measuredSample(adapter, caseContract, "warmup", index));
  }
  const samples = [];
  for (let index = 0; index < caseContract.measurement.samples; index += 1) {
    samples.push(await measuredSample(adapter, caseContract, "measurement", index));
  }
  const comparable = [...warmup, ...samples].map((item) => canonicalJson({
    outcome: item.observation.outcome,
    values: item.observation.values,
  }));
  const deterministic = new Set(comparable).size <= 1;
  const passed = [...warmup, ...samples].every((item) => item.status === "passed") && deterministic;
  return {
    case_id: caseContract.id,
    contract_sha256: sha256(canonicalJson(caseContract)),
    program_phase: caseContract.program_phase,
    layer: caseContract.layer,
    workload_tier: caseContract.workload_tier,
    campaign: caseContract.campaign,
    status: passed ? "passed" : "failed",
    failure_reason: passed ? null : deterministic ? "case-evidence-failed" : "nondeterministic-observation",
    capability_evidence: capabilities,
    warmup,
    samples,
    metrics: caseMetrics(samples),
  };
}

function payloadMetrics(inputs, capabilityBinding) {
  return {
    corpus_bytes: inputs.corpusBinding.bytes,
    adapter_bytes: inputs.adapter.bytes,
    capability_manifest_bytes: capabilityBinding.bytes,
    artifact_installed_bytes: inputs.artifacts.reduce((total, item) => total + item.bytes, 0),
    artifacts: inputs.artifacts.map(({ name, path: artifactPath, bytes, files, sha256: digest }) => ({
      name,
      path: artifactPath,
      bytes,
      files,
      sha256: digest,
    })),
  };
}

function attachReceiptIdentity(core) {
  return { ...core, id: contentId(core) };
}

function loadAdapter(root, adapterPath) {
  const absolute = repositoryPath(root, adapterPath, "adapter path").absolute;
  delete require.cache[require.resolve(absolute)];
  const adapter = require(absolute);
  if (adapter?.protocol !== ADAPTER_PROTOCOL || typeof adapter.initialize !== "function" ||
      typeof adapter.runCase !== "function" ||
      (adapter.close !== undefined && typeof adapter.close !== "function")) {
    fail("adapter", `must implement ${ADAPTER_PROTOCOL} initialize/runCase and optional close`);
  }
  return adapter;
}

async function collectReceipt({
  root,
  corpusPath,
  adapterPath,
  capabilityPath,
  artifactSpecifications,
  processEntryTime = process.hrtime.bigint(),
}) {
  const collectionStarted = process.hrtime.bigint();
  const inputs = inputBindings({ root, corpusPath, adapterPath, artifactSpecifications });
  const capabilityBinding = digestPath(root, capabilityPath, "capability manifest path");
  const manifest = validateCapabilityManifest(
    readJson(path.join(root, capabilityBinding.path)), inputs.corpus,
  );
  assertManifestBindings(manifest, inputs);

  const loadStarted = process.hrtime.bigint();
  const adapter = loadAdapter(root, inputs.adapter.path);
  const adapterLoadMs = elapsedMilliseconds(loadStarted);
  const initializeStarted = process.hrtime.bigint();
  const initialization = validateAdapterInitialization(await adapter.initialize({
    root,
    backend: manifest.backend,
    subject: manifest.subject,
    artifacts: inputs.artifacts.map((item) => ({
      name: item.name,
      path: path.join(root, item.path),
      sha256: item.sha256,
      bytes: item.bytes,
    })),
    capabilities: manifest.capabilities,
  }));
  const initializeMs = elapsedMilliseconds(initializeStarted);
  if (canonicalJson(initialization.subject) !== canonicalJson(manifest.subject)) {
    fail("adapter initialization.subject", "does not match the capability manifest");
  }
  const knownCapabilities = new Set(manifest.capabilities.map((item) => item.id));
  for (const id of initialization.capability_ids) {
    if (!knownCapabilities.has(id)) fail("adapter initialization.capability_ids", `unknown ${id}`);
  }

  const cases = [];
  try {
    for (const caseContract of inputs.corpus.cases) {
      cases.push(await collectCase(adapter, caseContract, manifest, initialization));
    }
  } finally {
    if (typeof adapter.close === "function") await adapter.close();
  }
  const status = cases.every((item) => item.status === "passed") ? "passed" : "failed";
  const core = {
    schema: RECEIPT_SCHEMA,
    authority: "local-host-collector",
    collected_at: new Date().toISOString(),
    status,
    repository: repositoryIdentity(root),
    corpus: {
      path: inputs.corpusBinding.path,
      sha256: inputs.corpusBinding.sha256,
      bytes: inputs.corpusBinding.bytes,
      files: inputs.corpusBinding.files,
      snapshot: inputs.corpus,
    },
    source_bundle: inputs.sourceBundle,
    adapter: inputs.adapter,
    artifacts: inputs.artifacts,
    capability_manifest: {
      path: capabilityBinding.path,
      sha256: capabilityBinding.sha256,
      bytes: capabilityBinding.bytes,
      files: capabilityBinding.files,
      snapshot: manifest,
    },
    platform: platformIdentity(),
    runtime: {
      collector: collectorIdentity(),
      subject: initialization.subject,
      observed_capability_ids: initialization.capability_ids,
    },
    metrics: {
      startup: {
        process_entry_to_ready_ms: elapsedMilliseconds(processEntryTime),
        adapter_load_ms: adapterLoadMs,
        adapter_initialize_ms: initializeMs,
      },
      total_wall_ms: elapsedMilliseconds(collectionStarted),
      payload: payloadMetrics(inputs, capabilityBinding),
    },
    cases,
  };
  return attachReceiptIdentity(core);
}

function validateMetricSummary(label, value) {
  exactKeys(label, value, ["samples", "minimum", "median", "maximum"]);
  const expected = summary(array(
    `${label}.samples`, value.samples,
    (itemLabel, item) => finiteNumber(itemLabel, item, 0),
    { minimum: 1 },
  ));
  if (canonicalJson(expected) !== canonicalJson(value)) fail(label, "summary is stale");
  return expected;
}

function validateSample(label, value, caseContract) {
  exactKeys(label, value, ["observation", "evidence", "status", "metrics"]);
  const expected = evaluateObservation(caseContract, value.observation);
  if (canonicalJson(expected.evidence) !== canonicalJson(value.evidence) ||
      expected.status !== value.status) {
    fail(label, "stored correctness/failure/validation evidence is stale");
  }
  exactKeys(`${label}.metrics`, value.metrics, [
    "wall_ms", "rss_before_bytes", "rss_after_bytes", "rss_peak_sampled_bytes",
    "process_max_rss_bytes", "memory_method",
  ]);
  finiteNumber(`${label}.metrics.wall_ms`, value.metrics.wall_ms, 0);
  for (const name of ["rss_before_bytes", "rss_after_bytes", "rss_peak_sampled_bytes"]) {
    safeInteger(`${label}.metrics.${name}`, value.metrics[name], 0);
  }
  if (value.metrics.process_max_rss_bytes !== null) {
    safeInteger(`${label}.metrics.process_max_rss_bytes`, value.metrics.process_max_rss_bytes, 0);
  }
  nonemptyString(`${label}.metrics.memory_method`, value.metrics.memory_method);
  return value;
}

function validateCaseReceipt(value, caseContract, manifest, initialization) {
  const label = `receipt case ${caseContract.id}`;
  exactKeys(label, value, [
    "case_id", "contract_sha256", "program_phase", "layer", "workload_tier", "campaign",
    "status", "failure_reason", "capability_evidence", "warmup", "samples", "metrics",
  ]);
  if (value.case_id !== caseContract.id || value.program_phase !== caseContract.program_phase ||
      value.layer !== caseContract.layer || value.workload_tier !== caseContract.workload_tier ||
      canonicalJson(value.campaign) !== canonicalJson(caseContract.campaign)) {
    fail(label, "does not match its corpus contract");
  }
  const contractDigest = sha256(canonicalJson(caseContract));
  if (value.contract_sha256 !== contractDigest) fail(`${label}.contract_sha256`, "is stale");
  const expectedCapabilities = capabilityEvidence(caseContract, manifest, initialization);
  if (canonicalJson(value.capability_evidence) !== canonicalJson(expectedCapabilities)) {
    fail(`${label}.capability_evidence`, "is stale");
  }
  const missingCapability = expectedCapabilities.some((item) => item.status !== "passed");
  const warmup = array(`${label}.warmup`, value.warmup,
    (itemLabel, item) => validateSample(itemLabel, item, caseContract));
  const samples = array(`${label}.samples`, value.samples,
    (itemLabel, item) => validateSample(itemLabel, item, caseContract));
  if (missingCapability) {
    if (warmup.length !== 0 || samples.length !== 0 || value.status !== "failed" ||
        value.failure_reason !== "missing-capability-evidence") {
      fail(label, "missing capability evidence must fail without execution");
    }
  } else {
    if (warmup.length !== caseContract.measurement.warmup ||
        samples.length !== caseContract.measurement.samples) {
      fail(label, "sample counts do not match the corpus contract");
    }
    const comparable = [...warmup, ...samples].map((item) => canonicalJson({
      outcome: item.observation.outcome,
      values: item.observation.values,
    }));
    const deterministic = new Set(comparable).size <= 1;
    const passed = [...warmup, ...samples].every((item) => item.status === "passed") && deterministic;
    const reason = passed ? null : deterministic ? "case-evidence-failed" : "nondeterministic-observation";
    if (value.status !== (passed ? "passed" : "failed") || value.failure_reason !== reason) {
      fail(label, "aggregate status is stale");
    }
  }
  exactKeys(`${label}.metrics`, value.metrics, [
    "wall_ms", "rss_peak_sampled_bytes", "process_max_rss_bytes", "adapter_phases_ms",
  ]);
  const expectedMetrics = caseMetrics(samples);
  if (canonicalJson(expectedMetrics) !== canonicalJson(value.metrics)) {
    fail(`${label}.metrics`, "aggregate metrics are stale");
  }
  return value;
}

function receiptCore(receipt) {
  const core = { ...receipt };
  delete core.id;
  return core;
}

function validateReceipt(receipt) {
  exactKeys("receipt", receipt, [
    "schema", "authority", "collected_at", "status", "repository", "corpus",
    "source_bundle", "adapter", "artifacts", "capability_manifest", "platform", "runtime",
    "metrics", "cases", "id",
  ]);
  if (receipt.schema !== RECEIPT_SCHEMA) fail("receipt.schema", `must be ${RECEIPT_SCHEMA}`);
  if (receipt.authority !== "local-host-collector") fail("receipt.authority", "is unsupported");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.collected_at) ||
      !Number.isFinite(Date.parse(receipt.collected_at))) {
    fail("receipt.collected_at", "must be an ISO-8601 UTC timestamp");
  }
  validateContentId("receipt.id", receipt.id);
  const expectedId = contentId(receiptCore(receipt));
  if (receipt.id !== expectedId) fail("receipt.id", `is stale; expected ${expectedId}`);

  exactKeys("receipt.corpus", receipt.corpus, ["path", "sha256", "bytes", "files", "snapshot"]);
  nonemptyString("receipt.corpus.path", receipt.corpus.path);
  validateSha256("receipt.corpus.sha256", receipt.corpus.sha256);
  safeInteger("receipt.corpus.bytes", receipt.corpus.bytes, 0);
  safeInteger("receipt.corpus.files", receipt.corpus.files, 1);
  const corpus = validateCorpus(receipt.corpus.snapshot);
  exactKeys("receipt.capability_manifest", receipt.capability_manifest, [
    "path", "sha256", "bytes", "files", "snapshot",
  ]);
  nonemptyString("receipt.capability_manifest.path", receipt.capability_manifest.path);
  validateSha256("receipt.capability_manifest.sha256", receipt.capability_manifest.sha256);
  safeInteger("receipt.capability_manifest.bytes", receipt.capability_manifest.bytes, 0);
  safeInteger("receipt.capability_manifest.files", receipt.capability_manifest.files, 1);
  const manifest = validateCapabilityManifest(receipt.capability_manifest.snapshot, corpus);

  exactKeys("receipt.runtime", receipt.runtime, ["collector", "subject", "observed_capability_ids"]);
  const initialization = validateAdapterInitialization({
    subject: receipt.runtime.subject,
    capability_ids: receipt.runtime.observed_capability_ids,
  });
  if (canonicalJson(initialization.subject) !== canonicalJson(manifest.subject)) {
    fail("receipt.runtime.subject", "does not match the capability manifest");
  }
  const knownCapabilities = new Set(manifest.capabilities.map((item) => item.id));
  for (const id of initialization.capability_ids) {
    if (!knownCapabilities.has(id)) fail("receipt.runtime.observed_capability_ids", `unknown ${id}`);
  }

  const caseMap = new Map(receipt.cases.map((item) => [item.case_id, item]));
  if (caseMap.size !== receipt.cases.length || caseMap.size !== corpus.cases.length) {
    fail("receipt.cases", "must contain every corpus case exactly once");
  }
  for (const caseContract of corpus.cases) {
    if (!caseMap.has(caseContract.id)) fail("receipt.cases", `missing ${caseContract.id}`);
    validateCaseReceipt(caseMap.get(caseContract.id), caseContract, manifest, initialization);
  }
  const status = receipt.cases.every((item) => item.status === "passed") ? "passed" : "failed";
  if (receipt.status !== status) fail("receipt.status", "is stale");

  exactKeys("receipt.repository", receipt.repository, ["commit", "tree", "clean", "status_sha256"]);
  if (typeof receipt.repository.commit !== "string" ||
      !/^[0-9a-f]{40,64}$/.test(receipt.repository.commit) ||
      typeof receipt.repository.tree !== "string" ||
      !/^[0-9a-f]{40,64}$/.test(receipt.repository.tree)) {
    fail("receipt.repository", "contains an invalid Git object identity");
  }
  if (typeof receipt.repository.clean !== "boolean") fail("receipt.repository.clean", "must be boolean");
  validateSha256("receipt.repository.status_sha256", receipt.repository.status_sha256);
  if (receipt.repository.clean && receipt.repository.status_sha256 !== sha256(Buffer.alloc(0))) {
    fail("receipt.repository.status_sha256", "clean checkout must hash an empty status");
  }
  function validatePathBinding(label, value, named = false) {
    exactKeys(label, value, named
      ? ["name", "path", "sha256", "bytes", "files"]
      : ["path", "sha256", "bytes", "files"]);
    if (named) nonemptyString(`${label}.name`, value.name);
    nonemptyString(`${label}.path`, value.path);
    validateSha256(`${label}.sha256`, value.sha256);
    safeInteger(`${label}.bytes`, value.bytes, 0);
    safeInteger(`${label}.files`, value.files, 0);
    return value;
  }
  validatePathBinding("receipt.adapter", receipt.adapter);
  exactKeys("receipt.source_bundle", receipt.source_bundle, ["paths", "entries", "sha256"]);
  const sourcePaths = array(
    "receipt.source_bundle.paths", receipt.source_bundle.paths,
    (label, item) => nonemptyString(label, item),
    { minimum: 1, uniqueBy: (item) => item },
  );
  const sourceEntries = array(
    "receipt.source_bundle.entries", receipt.source_bundle.entries,
    (label, item) => validatePathBinding(label, item),
    { minimum: 1, uniqueBy: (item) => item.path },
  );
  if (canonicalJson(sourcePaths) !== canonicalJson(sourceEntries.map((item) => item.path)) ||
      receipt.source_bundle.sha256 !== sha256(canonicalJson(sourceEntries))) {
    fail("receipt.source_bundle", "paths or framed entry digest are stale");
  }
  validateSha256("receipt.source_bundle.sha256", receipt.source_bundle.sha256);
  const artifacts = array(
    "receipt.artifacts", receipt.artifacts,
    (label, item) => validatePathBinding(label, item, true),
    { minimum: 1, uniqueBy: (item) => item.name },
  );
  assertManifestBindings(manifest, {
    corpusBinding: receipt.corpus,
    sourceBundle: receipt.source_bundle,
    adapter: receipt.adapter,
    artifacts,
  });
  exactKeys("receipt.platform", receipt.platform, [
    "id", "os_platform", "architecture", "os_type", "os_release", "endianness", "cpu",
    "logical_cpus", "total_memory_bytes", "machine_id",
  ]);
  for (const name of ["id", "os_platform", "architecture", "os_type", "os_release", "endianness", "cpu"]) {
    nonemptyString(`receipt.platform.${name}`, receipt.platform[name]);
  }
  if (PLATFORM_IDS[`${receipt.platform.os_platform}-${receipt.platform.architecture}`] !==
      receipt.platform.id) {
    fail("receipt.platform.id", "does not match os_platform and architecture");
  }
  if (!["BE", "LE"].includes(receipt.platform.endianness)) {
    fail("receipt.platform.endianness", "must be BE or LE");
  }
  safeInteger("receipt.platform.logical_cpus", receipt.platform.logical_cpus, 1);
  safeInteger("receipt.platform.total_memory_bytes", receipt.platform.total_memory_bytes, 1);
  validateContentId("receipt.platform.machine_id", receipt.platform.machine_id);
  const platformFacts = { ...receipt.platform };
  delete platformFacts.machine_id;
  if (receipt.platform.machine_id !== contentId(platformFacts)) {
    fail("receipt.platform.machine_id", "is stale");
  }
  exactKeys("receipt.runtime.collector", receipt.runtime.collector, [
    "kind", "name", "version", "node", "v8", "modules_abi",
  ]);
  if (receipt.runtime.collector.kind !== "node") fail("receipt.runtime.collector.kind", "must be node");
  for (const name of ["name", "version", "node", "v8"]) {
    nonemptyString(`receipt.runtime.collector.${name}`, receipt.runtime.collector[name]);
  }
  if (receipt.runtime.collector.modules_abi !== null) {
    nonemptyString("receipt.runtime.collector.modules_abi", receipt.runtime.collector.modules_abi);
  }
  exactKeys("receipt.metrics", receipt.metrics, ["startup", "total_wall_ms", "payload"]);
  exactKeys("receipt.metrics.startup", receipt.metrics.startup, [
    "process_entry_to_ready_ms", "adapter_load_ms", "adapter_initialize_ms",
  ]);
  for (const name of Object.keys(receipt.metrics.startup)) {
    finiteNumber(`receipt.metrics.startup.${name}`, receipt.metrics.startup[name], 0);
  }
  finiteNumber("receipt.metrics.total_wall_ms", receipt.metrics.total_wall_ms, 0);
  exactKeys("receipt.metrics.payload", receipt.metrics.payload, [
    "corpus_bytes", "adapter_bytes", "capability_manifest_bytes", "artifact_installed_bytes",
    "artifacts",
  ]);
  for (const name of [
    "corpus_bytes", "adapter_bytes", "capability_manifest_bytes", "artifact_installed_bytes",
  ]) {
    safeInteger(`receipt.metrics.payload.${name}`, receipt.metrics.payload[name], 0);
  }
  const payloadArtifacts = array(
    "receipt.metrics.payload.artifacts", receipt.metrics.payload.artifacts,
    (label, item) => validatePathBinding(label, item, true),
    { minimum: 1, uniqueBy: (item) => item.name },
  );
  if (canonicalJson(payloadArtifacts) !== canonicalJson(artifacts)) {
    fail("receipt.metrics.payload.artifacts", "do not match receipt artifacts");
  }
  if (receipt.metrics.payload.corpus_bytes !== receipt.corpus.bytes ||
      receipt.metrics.payload.adapter_bytes !== receipt.adapter.bytes ||
      receipt.metrics.payload.capability_manifest_bytes !== receipt.capability_manifest.bytes ||
      receipt.metrics.payload.artifact_installed_bytes !==
        artifacts.reduce((total, item) => total + item.bytes, 0)) {
    fail("receipt.metrics.payload", "byte totals are stale");
  }
  return receipt;
}

function assertCurrentBinding(receipt, root, requireClean) {
  const corpusBinding = digestPath(root, receipt.corpus.path, "receipt corpus path");
  if (canonicalJson(corpusBinding) !== canonicalJson({
    path: receipt.corpus.path,
    sha256: receipt.corpus.sha256,
    bytes: receipt.corpus.bytes,
    files: receipt.corpus.files,
  }) ||
      canonicalJson(validateCorpus(readJson(path.join(root, corpusBinding.path)))) !==
      canonicalJson(receipt.corpus.snapshot)) {
    fail("receipt.corpus", "does not match the current corpus");
  }
  const sourceBundle = digestBundle(root, receipt.source_bundle.paths, "receipt source paths");
  if (canonicalJson(sourceBundle) !== canonicalJson(receipt.source_bundle)) {
    fail("receipt.source_bundle", "does not match current source bytes");
  }
  const adapter = digestPath(root, receipt.adapter.path, "receipt adapter path");
  if (canonicalJson(adapter) !== canonicalJson(receipt.adapter)) {
    fail("receipt.adapter", "does not match the current adapter");
  }
  const artifacts = receipt.artifacts.map((item) => ({
    name: item.name,
    ...digestPath(root, item.path, `receipt artifact ${item.name}`),
  }));
  if (canonicalJson(artifacts) !== canonicalJson(receipt.artifacts)) {
    fail("receipt.artifacts", "do not match current artifact bytes");
  }
  const capabilityBinding = digestPath(
    root, receipt.capability_manifest.path, "receipt capability manifest path",
  );
  if (canonicalJson(capabilityBinding) !== canonicalJson({
    path: receipt.capability_manifest.path,
    sha256: receipt.capability_manifest.sha256,
    bytes: receipt.capability_manifest.bytes,
    files: receipt.capability_manifest.files,
  }) ||
      canonicalJson(validateCapabilityManifest(
        readJson(path.join(root, capabilityBinding.path)), receipt.corpus.snapshot,
      )) !== canonicalJson(receipt.capability_manifest.snapshot)) {
    fail("receipt.capability_manifest", "does not match the current manifest");
  }
  const repository = repositoryIdentity(root);
  if (repository.commit !== receipt.repository.commit || repository.tree !== receipt.repository.tree) {
    fail("receipt.repository", "does not match the current commit and tree");
  }
  if (requireClean && (!repository.clean || !receipt.repository.clean)) {
    fail("receipt.repository", "clean evidence is required");
  }
  if (canonicalJson(platformIdentity()) !== canonicalJson(receipt.platform)) {
    fail("receipt.platform", "does not describe this measured host");
  }
  if (canonicalJson(collectorIdentity()) !== canonicalJson(receipt.runtime.collector)) {
    fail("receipt.runtime.collector", "does not describe this collector runtime");
  }
}

function verifyReceipt(receipt, { root = null, historical = false, requireClean = false } = {}) {
  const normalized = validateReceipt(receipt);
  if (!historical) {
    if (root === null) fail("verification", "current verification requires a repository root");
    assertCurrentBinding(normalized, root, requireClean);
  } else if (requireClean && !normalized.repository.clean) {
    fail("receipt.repository", "historical receipt is not clean");
  }
  return {
    valid: true,
    mode: historical ? "historical-content-integrity" : "current-binding",
    receipt: normalized,
  };
}

function writeImmutableJson(filename, value) {
  const destination = path.resolve(filename);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) fail("output", `receipt already exists: ${destination}`);
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, pretty(value), { flag: "wx" });
    fs.renameSync(temporary, destination);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

module.exports = {
  MAX_OBSERVATION_BYTES,
  assertCurrentBinding,
  bindCapabilityDraft,
  collectReceipt,
  evaluateCheck,
  evaluateObservation,
  inputBindings,
  parseArtifactSpecifications,
  receiptCore,
  validateMetricSummary,
  validateReceipt,
  verifyReceipt,
  writeImmutableJson,
};
