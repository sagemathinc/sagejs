"use strict";

const {
  PLATFORM_IDS,
  array,
  boolean,
  canonicalJson,
  contentId,
  enumeration,
  exactKeys,
  fail,
  finiteNumber,
  isObject,
  nonemptyString,
  safeInteger,
  validateContentId,
  validateJsonValue,
  validateSha256,
} = require("./common.cjs");

const CORPUS_SCHEMA = "sagejs.numerical-qualification-corpus/v1";
const CAPABILITY_SCHEMA = "sagejs.numerical-capability-manifest/v1";
const RECEIPT_SCHEMA = "sagejs.numerical-qualification-run-receipt/v1";
const POLICY_SCHEMA = "sagejs.numerical-qualification-matrix-policy/v1";
const REPORT_SCHEMA = "sagejs.numerical-qualification-matrix-report/v1";
const ADAPTER_PROTOCOL = "sagejs.numerical-qualification-adapter/v1";

const PROGRAM_PHASES = Object.freeze([
  "P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8",
]);
const CASE_LAYERS = Object.freeze([
  "definition-identity",
  "independent-residual",
  "differential-oracle",
  "conditioned-stress",
  "failure-semantics",
  "fuzz",
  "metamorphic",
]);
const CAMPAIGN_KINDS = Object.freeze([
  "fixed",
  "deterministic-fuzz",
  "metamorphic",
  "fault-injection",
  "long-duration",
]);
const WORKLOAD_TIERS = Object.freeze([
  "instant-classroom",
  "interactive-exploration",
  "substantial-local",
  "out-of-scope",
]);
const SUBJECT_KINDS = Object.freeze(["node", "sea", "browser", "worker", "other"]);
const CHECK_KINDS = Object.freeze([
  "deep-equal",
  "approximate",
  "finite",
  "less-than-or-equal",
  "greater-than-or-equal",
]);

function validatePointer(label, value) {
  nonemptyString(label, value);
  if (!value.startsWith("/") || /~(?![01])/.test(value)) {
    fail(label, "must be an RFC 6901 JSON pointer beginning with '/'");
  }
  return value;
}

function validateOperand(label, value) {
  if (!isObject(value)) fail(label, "must be an object");
  const keys = Object.keys(value);
  if (keys.length !== 1 || !["literal", "pointer"].includes(keys[0])) {
    fail(label, "must contain exactly one of literal or pointer");
  }
  if (keys[0] === "pointer") return { pointer: validatePointer(`${label}.pointer`, value.pointer) };
  validateJsonValue(`${label}.literal`, value.literal);
  return { literal: value.literal };
}

function validateCheck(label, value) {
  if (!isObject(value)) fail(label, "must be an object");
  const kind = enumeration(`${label}.kind`, value.kind, CHECK_KINDS);
  const required = ["id", "evidence", "kind", "actual"];
  const optional = [];
  if (["deep-equal", "less-than-or-equal", "greater-than-or-equal"].includes(kind)) {
    required.push("expected");
  } else if (kind === "approximate") {
    required.push("expected", "absolute_tolerance", "relative_tolerance");
  }
  exactKeys(label, value, required, optional);
  const result = {
    id: nonemptyString(`${label}.id`, value.id),
    evidence: enumeration(`${label}.evidence`, value.evidence, ["correctness", "validation"]),
    kind,
    actual: validatePointer(`${label}.actual`, value.actual),
  };
  if (value.expected !== undefined) result.expected = validateOperand(`${label}.expected`, value.expected);
  if (kind === "approximate") {
    result.absolute_tolerance = finiteNumber(
      `${label}.absolute_tolerance`, value.absolute_tolerance, 0,
    );
    result.relative_tolerance = finiteNumber(
      `${label}.relative_tolerance`, value.relative_tolerance, 0,
    );
  }
  return result;
}

function validateCampaign(label, value, layer) {
  exactKeys(label, value, ["kind", "seed", "trials", "evidence_check_ids"]);
  const kind = enumeration(`${label}.kind`, value.kind, CAMPAIGN_KINDS);
  const seed = value.seed === null ? null : nonemptyString(`${label}.seed`, value.seed);
  const trials = safeInteger(`${label}.trials`, value.trials, 1);
  const evidenceCheckIds = array(
    `${label}.evidence_check_ids`, value.evidence_check_ids,
    (itemLabel, item) => nonemptyString(itemLabel, item),
    { minimum: kind === "fixed" ? 0 : 1, uniqueBy: (item) => item },
  ).sort();
  if (kind === "deterministic-fuzz") {
    if (layer !== "fuzz") fail(label, "deterministic-fuzz requires the fuzz layer");
    if (seed === null || trials < 2) {
      fail(label, "deterministic-fuzz requires a nonempty seed and at least two trials");
    }
  } else if (layer === "fuzz") {
    fail(label, "the fuzz layer requires a deterministic-fuzz campaign");
  }
  if (kind === "metamorphic") {
    if (layer !== "metamorphic") fail(label, "metamorphic requires the metamorphic layer");
    if (trials < 2) fail(label, "metamorphic requires at least two trials");
  } else if (layer === "metamorphic") {
    fail(label, "the metamorphic layer requires a metamorphic campaign");
  }
  if (kind === "fault-injection" && layer !== "failure-semantics") {
    fail(label, "fault-injection requires the failure-semantics layer");
  }
  return { kind, seed, trials, evidence_check_ids: evidenceCheckIds };
}

function validateCase(label, value) {
  exactKeys(label, value, [
    "id", "description", "program_phase", "layer", "workload_tier", "campaign", "input",
    "required_capabilities", "expected", "checks", "measurement",
  ]);
  const programPhase = enumeration(`${label}.program_phase`, value.program_phase, PROGRAM_PHASES);
  const layer = enumeration(`${label}.layer`, value.layer, CASE_LAYERS);
  const expected = value.expected;
  exactKeys(`${label}.expected`, expected, ["outcome", "failure_code"]);
  const outcome = enumeration(`${label}.expected.outcome`, expected.outcome, ["success", "failure"]);
  let failureCode = expected.failure_code;
  if (outcome === "success") {
    if (failureCode !== null) fail(`${label}.expected.failure_code`, "must be null for success");
  } else {
    failureCode = nonemptyString(`${label}.expected.failure_code`, failureCode);
    if (failureCode.startsWith("qualification.")) {
      fail(`${label}.expected.failure_code`, "qualification.* codes are reserved for harness failures");
    }
  }
  exactKeys(`${label}.measurement`, value.measurement, ["warmup", "samples"]);
  const checks = array(`${label}.checks`, value.checks, validateCheck, {
    minimum: 2,
    uniqueBy: (item) => item.id,
  });
  for (const evidence of ["correctness", "validation"]) {
    if (!checks.some((check) => check.evidence === evidence)) {
      fail(`${label}.checks`, `must contain ${evidence} evidence`);
    }
  }
  const campaign = validateCampaign(`${label}.campaign`, value.campaign, layer);
  const checkById = new Map(checks.map((check) => [check.id, check]));
  for (const id of campaign.evidence_check_ids) {
    const check = checkById.get(id);
    if (check === undefined) fail(`${label}.campaign.evidence_check_ids`, `unknown check ${id}`);
    if (check.evidence !== "validation") {
      fail(`${label}.campaign.evidence_check_ids`, `${id} must be validation evidence`);
    }
  }
  validateJsonValue(`${label}.input`, value.input);
  return {
    id: nonemptyString(`${label}.id`, value.id),
    description: nonemptyString(`${label}.description`, value.description),
    program_phase: programPhase,
    layer,
    workload_tier: enumeration(`${label}.workload_tier`, value.workload_tier, WORKLOAD_TIERS),
    campaign,
    input: value.input,
    required_capabilities: array(
      `${label}.required_capabilities`, value.required_capabilities,
      (itemLabel, item) => nonemptyString(itemLabel, item),
      { minimum: 1, uniqueBy: (item) => item },
    ).sort(),
    expected: { outcome, failure_code: failureCode },
    checks,
    measurement: {
      warmup: safeInteger(`${label}.measurement.warmup`, value.measurement.warmup, 0),
      samples: safeInteger(`${label}.measurement.samples`, value.measurement.samples, 1),
    },
  };
}

function validateCorpus(value) {
  exactKeys("corpus", value, [
    "schema", "id", "version", "domain", "description", "program_phases", "source_paths",
    "cases",
  ]);
  if (value.schema !== CORPUS_SCHEMA) fail("corpus.schema", `must be ${CORPUS_SCHEMA}`);
  const cases = array("corpus.cases", value.cases, validateCase, {
    minimum: 1,
    uniqueBy: (item) => item.id,
  });
  const programPhases = array(
    "corpus.program_phases", value.program_phases,
    (label, item) => enumeration(label, item, PROGRAM_PHASES),
    { minimum: 1, uniqueBy: (item) => item },
  ).sort();
  const phaseSet = new Set(programPhases);
  const usedPhases = new Set();
  for (const item of cases) {
    if (!phaseSet.has(item.program_phase)) {
      fail("corpus.cases", `case ${item.id} uses undeclared program phase ${item.program_phase}`);
    }
    usedPhases.add(item.program_phase);
  }
  for (const phase of programPhases) {
    if (!usedPhases.has(phase)) fail("corpus.program_phases", `declared phase ${phase} has no case`);
  }
  return {
    schema: CORPUS_SCHEMA,
    id: nonemptyString("corpus.id", value.id),
    version: safeInteger("corpus.version", value.version, 1),
    domain: nonemptyString("corpus.domain", value.domain),
    description: nonemptyString("corpus.description", value.description),
    program_phases: programPhases,
    source_paths: array(
      "corpus.source_paths", value.source_paths,
      (label, item) => nonemptyString(label, item),
      { minimum: 1, uniqueBy: (item) => item },
    ).sort(),
    cases,
  };
}

function validateSubject(label, value) {
  exactKeys(label, value, ["kind", "name", "version", "engine"]);
  const kind = enumeration(`${label}.kind`, value.kind, SUBJECT_KINDS);
  const engine = value.engine === null ? null : nonemptyString(`${label}.engine`, value.engine);
  if (kind === "browser" && engine === null) fail(`${label}.engine`, "is required for a browser");
  if (kind !== "browser" && engine !== null) fail(`${label}.engine`, "must be null outside a browser");
  return {
    kind,
    name: nonemptyString(`${label}.name`, value.name),
    version: nonemptyString(`${label}.version`, value.version),
    engine,
  };
}

function validateBackend(label, value) {
  exactKeys(label, value, ["id", "version"]);
  return {
    id: nonemptyString(`${label}.id`, value.id),
    version: nonemptyString(`${label}.version`, value.version),
  };
}

function validateArtifactBinding(label, value) {
  exactKeys(label, value, ["name", "sha256"]);
  return {
    name: nonemptyString(`${label}.name`, value.name),
    sha256: validateSha256(`${label}.sha256`, value.sha256),
  };
}

function validateCapability(label, value, caseIds = null) {
  exactKeys(label, value, ["id", "status", "reason", "case_ids", "envelope"]);
  const status = enumeration(`${label}.status`, value.status, ["available", "unavailable"]);
  const reason = value.reason === null ? null : nonemptyString(`${label}.reason`, value.reason);
  if (status === "available" && reason !== null) fail(`${label}.reason`, "must be null when available");
  if (status === "unavailable" && reason === null) fail(`${label}.reason`, "is required when unavailable");
  const ids = array(
    `${label}.case_ids`, value.case_ids,
    (itemLabel, item) => nonemptyString(itemLabel, item),
    { minimum: status === "available" ? 1 : 0, uniqueBy: (item) => item },
  ).sort();
  if (caseIds !== null) {
    for (const id of ids) if (!caseIds.has(id)) fail(`${label}.case_ids`, `unknown corpus case ${id}`);
  }
  if (value.envelope !== null && !isObject(value.envelope)) fail(`${label}.envelope`, "must be an object or null");
  validateJsonValue(`${label}.envelope`, value.envelope);
  return {
    id: nonemptyString(`${label}.id`, value.id),
    status,
    reason,
    case_ids: ids,
    envelope: value.envelope,
  };
}

function validateCapabilityDraft(value, corpus = null) {
  exactKeys("capability draft", value, ["schema", "backend", "subject", "capabilities"]);
  if (value.schema !== CAPABILITY_SCHEMA) {
    fail("capability draft.schema", `must be ${CAPABILITY_SCHEMA}`);
  }
  const caseIds = corpus === null ? null : new Set(corpus.cases.map((item) => item.id));
  return {
    schema: CAPABILITY_SCHEMA,
    backend: validateBackend("capability draft.backend", value.backend),
    subject: validateSubject("capability draft.subject", value.subject),
    capabilities: array(
      "capability draft.capabilities", value.capabilities,
      (label, item) => validateCapability(label, item, caseIds),
      { minimum: 1, uniqueBy: (item) => item.id },
    ),
  };
}

function createCapabilityManifest(draft, bindings, corpus = null) {
  const normalized = validateCapabilityDraft(draft, corpus);
  exactKeys("capability bindings", bindings, [
    "corpus_sha256", "source_bundle_sha256", "adapter_sha256", "artifacts",
  ]);
  const core = {
    schema: CAPABILITY_SCHEMA,
    backend: normalized.backend,
    subject: normalized.subject,
    bindings: {
      corpus_sha256: validateSha256("capability bindings.corpus_sha256", bindings.corpus_sha256),
      source_bundle_sha256: validateSha256(
        "capability bindings.source_bundle_sha256", bindings.source_bundle_sha256,
      ),
      adapter_sha256: validateSha256("capability bindings.adapter_sha256", bindings.adapter_sha256),
      artifacts: array(
        "capability bindings.artifacts", bindings.artifacts, validateArtifactBinding,
        { minimum: 1, uniqueBy: (item) => item.name },
      ).sort((left, right) => left.name.localeCompare(right.name)),
    },
    capabilities: normalized.capabilities,
  };
  return { ...core, id: contentId(core) };
}

function validateCapabilityManifest(value, corpus = null) {
  exactKeys("capability manifest", value, [
    "schema", "backend", "subject", "bindings", "capabilities", "id",
  ]);
  const draft = validateCapabilityDraft({
    schema: value.schema,
    backend: value.backend,
    subject: value.subject,
    capabilities: value.capabilities,
  }, corpus);
  const expected = createCapabilityManifest(draft, value.bindings, corpus);
  validateContentId("capability manifest.id", value.id);
  if (value.id !== expected.id) fail("capability manifest.id", `is stale; expected ${expected.id}`);
  return expected;
}

function validateOutcome(label, value) {
  exactKeys(label, value, ["kind", "code"]);
  const kind = enumeration(`${label}.kind`, value.kind, ["success", "failure"]);
  const code = value.code === null ? null : nonemptyString(`${label}.code`, value.code);
  if (kind === "success" && code !== null) fail(`${label}.code`, "must be null for success");
  if (kind === "failure" && code === null) fail(`${label}.code`, "is required for failure");
  return { kind, code };
}

function validateMetricMap(label, value, numberValidator) {
  if (!isObject(value)) fail(label, "must be an object");
  const result = {};
  for (const key of Object.keys(value).sort()) {
    nonemptyString(`${label} key`, key);
    result[key] = numberValidator(`${label}.${key}`, value[key]);
  }
  return result;
}

function validateObservation(value, label = "adapter observation") {
  exactKeys(label, value, ["outcome", "values", "metrics"]);
  if (!isObject(value.values)) fail(`${label}.values`, "must be an object");
  validateJsonValue(`${label}.values`, value.values);
  exactKeys(`${label}.metrics`, value.metrics, ["phases_ms", "counters"]);
  return {
    outcome: validateOutcome(`${label}.outcome`, value.outcome),
    values: value.values,
    metrics: {
      phases_ms: validateMetricMap(
        `${label}.metrics.phases_ms`, value.metrics.phases_ms,
        (itemLabel, item) => finiteNumber(itemLabel, item, 0),
      ),
      counters: validateMetricMap(
        `${label}.metrics.counters`, value.metrics.counters,
        (itemLabel, item) => safeInteger(itemLabel, item, 0),
      ),
    },
  };
}

function validateAdapterInitialization(value) {
  exactKeys("adapter initialization", value, ["subject", "capability_ids"]);
  return {
    subject: validateSubject("adapter initialization.subject", value.subject),
    capability_ids: array(
      "adapter initialization.capability_ids", value.capability_ids,
      (label, item) => nonemptyString(label, item),
      { uniqueBy: (item) => item },
    ).sort(),
  };
}

function validatePolicyMatch(label, value) {
  exactKeys(label, value, [
    "corpus_id", "corpus_sha256", "source_bundle_sha256", "capability_manifest_id",
    "backend_id", "backend_version", "platform", "subject_kind", "subject_name",
    "subject_version", "subject_engine",
  ]);
  const kind = enumeration(`${label}.subject_kind`, value.subject_kind, SUBJECT_KINDS);
  const engine = value.subject_engine === null
    ? null
    : nonemptyString(`${label}.subject_engine`, value.subject_engine);
  if (kind === "browser" && engine === null) fail(`${label}.subject_engine`, "is required for a browser");
  if (kind !== "browser" && engine !== null) fail(`${label}.subject_engine`, "must be null outside a browser");
  return {
    corpus_id: nonemptyString(`${label}.corpus_id`, value.corpus_id),
    corpus_sha256: validateSha256(`${label}.corpus_sha256`, value.corpus_sha256),
    source_bundle_sha256: validateSha256(
      `${label}.source_bundle_sha256`, value.source_bundle_sha256,
    ),
    capability_manifest_id: validateContentId(
      `${label}.capability_manifest_id`, value.capability_manifest_id,
    ),
    backend_id: nonemptyString(`${label}.backend_id`, value.backend_id),
    backend_version: nonemptyString(`${label}.backend_version`, value.backend_version),
    platform: enumeration(`${label}.platform`, value.platform, Object.values(PLATFORM_IDS)),
    subject_kind: kind,
    subject_name: nonemptyString(`${label}.subject_name`, value.subject_name),
    subject_version: nonemptyString(`${label}.subject_version`, value.subject_version),
    subject_engine: engine,
  };
}

function validateMatrixPolicy(value) {
  exactKeys("matrix policy", value, ["schema", "id", "description", "require_clean", "rows"]);
  if (value.schema !== POLICY_SCHEMA) fail("matrix policy.schema", `must be ${POLICY_SCHEMA}`);
  const rows = array("matrix policy.rows", value.rows, (label, row) => {
    exactKeys(label, row, [
      "id", "match", "required_program_phases", "required_case_layers",
      "required_capabilities", "required_artifacts",
    ]);
    return {
      id: nonemptyString(`${label}.id`, row.id),
      match: validatePolicyMatch(`${label}.match`, row.match),
      required_program_phases: array(
        `${label}.required_program_phases`, row.required_program_phases,
        (itemLabel, item) => enumeration(itemLabel, item, PROGRAM_PHASES),
        { minimum: 1, uniqueBy: (item) => item },
      ).sort(),
      required_case_layers: array(
        `${label}.required_case_layers`, row.required_case_layers,
        (itemLabel, item) => enumeration(itemLabel, item, CASE_LAYERS),
        { minimum: 1, uniqueBy: (item) => item },
      ).sort(),
      required_capabilities: array(
        `${label}.required_capabilities`, row.required_capabilities,
        (itemLabel, item) => nonemptyString(itemLabel, item),
        { uniqueBy: (item) => item },
      ).sort(),
      required_artifacts: array(`${label}.required_artifacts`, row.required_artifacts,
        validateArtifactBinding, { minimum: 1, uniqueBy: (item) => item.name })
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }, { minimum: 1, uniqueBy: (item) => item.id });
  const matches = new Set();
  for (const row of rows) {
    const key = canonicalJson(row.match);
    if (matches.has(key)) fail("matrix policy.rows", `duplicate match envelope at ${row.id}`);
    matches.add(key);
  }
  return {
    schema: POLICY_SCHEMA,
    id: nonemptyString("matrix policy.id", value.id),
    description: nonemptyString("matrix policy.description", value.description),
    require_clean: boolean("matrix policy.require_clean", value.require_clean),
    rows,
  };
}

module.exports = {
  ADAPTER_PROTOCOL,
  CAPABILITY_SCHEMA,
  CAMPAIGN_KINDS,
  CASE_LAYERS,
  CHECK_KINDS,
  CORPUS_SCHEMA,
  POLICY_SCHEMA,
  PROGRAM_PHASES,
  RECEIPT_SCHEMA,
  REPORT_SCHEMA,
  SUBJECT_KINDS,
  WORKLOAD_TIERS,
  createCapabilityManifest,
  validateAdapterInitialization,
  validateCapabilityDraft,
  validateCapabilityManifest,
  validateCorpus,
  validateMatrixPolicy,
  validateObservation,
  validateOutcome,
  validatePointer,
  validateSubject,
};
