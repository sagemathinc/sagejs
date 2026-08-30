"use strict";

const {
  array,
  attachIdentity,
  boolean,
  contentId,
  deepFreeze,
  digest,
  documentIdentity,
  enumeration,
  exactKeys,
  finiteNumber,
  identifier,
  nonemptyString,
  record,
  repositoryPath,
  safeInteger,
  stableName,
  stringArray,
  validateJsonValue,
} = require("../optimizer-development/common.cjs");
const { validateRange } = require("../optimizer-development/identity.cjs");
const { validateCategoryDetails } = require("./category-contracts.cjs");

const SCHEMAS = deepFreeze({
  epoch: "sagejs.optimization-epoch/v2",
  workload: "sagejs.optimization-workload/v2",
  observation: "sagejs.optimization-observation/v2",
  subject: "sagejs.optimization-subject/v2",
  opportunity: "sagejs.optimization-opportunity/v2",
  intervention: "sagejs.optimization-intervention/v2",
  dossier: "sagejs.optimization-dossier/v2",
  campaign: "sagejs.optimization-campaign/v2",
  promotion: "sagejs.optimization-promotion/v2",
  outcome: "sagejs.optimization-outcome/v2",
});

const SUBJECT_SCOPES = Object.freeze([
  "public-call",
  "reviewed-phase",
  "source-region",
  "runtime-component",
  "representation-lifetime",
  "foreign-boundary",
  "cache-lifecycle",
  "algorithmic-operation",
]);
const INTERVENTION_CATEGORIES = Object.freeze([
  "algorithm",
  "library-route",
  "representation",
  "runtime",
  "boundary",
  "cache",
  "source",
  "compiler",
]);
const OBSERVATION_CHANNELS = Object.freeze([
  "wall-time",
  "phase-time",
  "source-position-ticks",
  "function-samples",
  "runtime-route-events",
  "boundary-counts",
  "copied-bytes",
  "allocations",
  "resource-lifetime",
  "compile-lifecycle",
  "cache-lifecycle",
  "output-semantics",
]);
const CONSERVED_CHANNELS = new Set([
  "source-position-ticks",
  "function-samples",
  "runtime-route-events",
]);
const DISPOSITIONS = Object.freeze([
  "accepted",
  "rejected",
  "investigate",
  "already-optimized",
  "superseded",
  "historical",
]);
const DECISIONS = Object.freeze(["select", "investigate", "reject", "already-optimized"]);
const PLATFORMS = Object.freeze([
  "linux-x64",
  "linux-arm64",
  "windows-x64",
  "macos-arm64",
]);
const BROWSERS = Object.freeze(["chromium", "firefox", "webkit"]);

function fail(label, message) {
  throw new Error(`optimization engine ${label}: ${message}`);
}

function finish(label, value, normalized) {
  contentId(`${label}.id`, value.id);
  const expected = documentIdentity(normalized);
  if (value.id !== expected) fail(`${label}.id`, `is stale; expected ${expected}`);
  return deepFreeze(normalized);
}

function schemaHeader(label, value, schema, keys) {
  exactKeys(label, value, ["schema", "id", ...keys]);
  if (value.schema !== schema) fail(`${label}.schema`, `unknown schema ${value.schema}`);
}

function nullableContentId(label, value) {
  return value === null ? null : contentId(label, value);
}

function nullableDigest(label, value) {
  return value === null ? null : digest(label, value);
}

function gitObject(label, value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    fail(label, "must be a lowercase 40-character Git object identity");
  }
  return value;
}

function isoTimestamp(label, value) {
  nonemptyString(label, value);
  if (new Date(value).toISOString() !== value) fail(label, "must be a canonical ISO timestamp");
  return value;
}

function validateAuthority(label, value) {
  exactKeys(label, value, ["kind", "producer", "validatedInputIds"]);
  return {
    kind: enumeration(`${label}.kind`, value.kind, [
      "reviewed-contract",
      "trusted-integration",
      "validated-input-set",
      "observation-only",
      "historical-fixture",
    ]),
    producer: stableName(`${label}.producer`, value.producer),
    validatedInputIds: array(
      `${label}.validatedInputIds`, value.validatedInputIds,
      (itemLabel, item) => contentId(itemLabel, item),
      { uniqueBy: (item) => item, sortedBy: (item) => item },
    ),
  };
}

function validateBinding(label, value) {
  exactKeys(label, value, ["epochId", "state", "predecessorIds"]);
  return {
    epochId: contentId(`${label}.epochId`, value.epochId),
    state: enumeration(`${label}.state`, value.state, [
      "current",
      "predecessor-compatible",
      "historical",
      "invalid",
    ]),
    predecessorIds: array(
      `${label}.predecessorIds`, value.predecessorIds,
      (itemLabel, item) => contentId(itemLabel, item),
      { uniqueBy: (item) => item, sortedBy: (item) => item },
    ),
  };
}

function validateReferenceIds(label, value, options = {}) {
  return array(label, value, (itemLabel, item) => contentId(itemLabel, item), {
    minimum: options.minimum,
    uniqueBy: (item) => item,
    sortedBy: (item) => item,
  });
}

function validateEpoch(value) {
  const label = "optimization epoch";
  schemaHeader(label, value, SCHEMAS.epoch, [
    "authority",
    "revision",
    "build",
    "catalogId",
    "workloadIds",
    "runtime",
    "components",
    "profiler",
    "reasonRegistryId",
    "schemaRegistryId",
    "producer",
  ]);
  exactKeys(`${label}.revision`, value.revision, [
    "commit", "tree", "clean", "repositorySourceClosureId",
  ]);
  const revision = {
    commit: gitObject(`${label}.revision.commit`, value.revision.commit),
    tree: gitObject(`${label}.revision.tree`, value.revision.tree),
    clean: boolean(`${label}.revision.clean`, value.revision.clean),
    repositorySourceClosureId: contentId(
      `${label}.revision.repositorySourceClosureId`,
      value.revision.repositorySourceClosureId,
    ),
  };
  if (!revision.clean) fail(`${label}.revision.clean`, "promotable epochs must be clean");
  exactKeys(`${label}.build`, value.build, [
    "receiptPath", "receiptDigest", "outputManifestId", "outputDigest", "sourceClosureId",
  ]);
  const build = {
    receiptPath: repositoryPath(`${label}.build.receiptPath`, value.build.receiptPath),
    receiptDigest: digest(`${label}.build.receiptDigest`, value.build.receiptDigest),
    outputManifestId: contentId(
      `${label}.build.outputManifestId`, value.build.outputManifestId,
    ),
    outputDigest: digest(`${label}.build.outputDigest`, value.build.outputDigest),
    sourceClosureId: contentId(`${label}.build.sourceClosureId`, value.build.sourceClosureId),
  };
  if (build.sourceClosureId !== revision.repositorySourceClosureId) {
    fail(`${label}.build.sourceClosureId`, "must equal the repository source closure");
  }
  const components = array(`${label}.components`, value.components, (itemLabel, item) => {
    exactKeys(itemLabel, item, ["kind", "id", "digest"]);
    return {
      kind: enumeration(`${itemLabel}.kind`, item.kind, [
        "compiler-implementation", "compiler-options", "native-artifact", "wasm-artifact",
        "dashboard", "profile-protocol", "workload-catalog",
      ]),
      id: contentId(`${itemLabel}.id`, item.id),
      digest: digest(`${itemLabel}.digest`, item.digest),
    };
  }, {
    uniqueBy: (item) => `${item.kind}:${item.id}`,
    sortedBy: (item) => `${item.kind}:${item.id}`,
  });
  exactKeys(`${label}.runtime`, value.runtime, [
    "node", "engine", "operatingSystem", "architecture", "capabilities",
  ]);
  const runtime = {
    node: nonemptyString(`${label}.runtime.node`, value.runtime.node),
    engine: nonemptyString(`${label}.runtime.engine`, value.runtime.engine),
    operatingSystem: stableName(
      `${label}.runtime.operatingSystem`, value.runtime.operatingSystem,
    ),
    architecture: stableName(`${label}.runtime.architecture`, value.runtime.architecture),
    capabilities: stringArray(`${label}.runtime.capabilities`, value.runtime.capabilities, {
      identifiers: true,
    }),
  };
  exactKeys(`${label}.profiler`, value.profiler, ["protocolId", "calibrationId"]);
  const profiler = {
    protocolId: contentId(`${label}.profiler.protocolId`, value.profiler.protocolId),
    calibrationId: contentId(`${label}.profiler.calibrationId`, value.profiler.calibrationId),
  };
  exactKeys(`${label}.producer`, value.producer, ["implementationId", "argv"]);
  const producer = {
    implementationId: contentId(
      `${label}.producer.implementationId`, value.producer.implementationId,
    ),
    argv: stringArray(`${label}.producer.argv`, value.producer.argv, {
      sorted: false, unique: false, minimum: 1,
    }),
  };
  return finish(label, value, {
    schema: SCHEMAS.epoch,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    revision,
    build,
    catalogId: contentId(`${label}.catalogId`, value.catalogId),
    workloadIds: validateReferenceIds(`${label}.workloadIds`, value.workloadIds, {
      minimum: 1,
    }),
    runtime,
    components,
    profiler,
    reasonRegistryId: contentId(`${label}.reasonRegistryId`, value.reasonRegistryId),
    schemaRegistryId: contentId(`${label}.schemaRegistryId`, value.schemaRegistryId),
    producer,
  });
}

function validateSubjectLocator(label, scope, value) {
  record(label, value);
  if (scope === "public-call") {
    exactKeys(label, value, [
      "workloadId", "entryPath", "publicName", "mode", "outputBoundary",
    ]);
    return {
      workloadId: contentId(`${label}.workloadId`, value.workloadId),
      entryPath: repositoryPath(`${label}.entryPath`, value.entryPath),
      publicName: stableName(`${label}.publicName`, value.publicName),
      mode: enumeration(`${label}.mode`, value.mode, ["sage", "python", "browser"]),
      outputBoundary: nonemptyString(`${label}.outputBoundary`, value.outputBoundary),
    };
  }
  if (scope === "reviewed-phase") {
    exactKeys(label, value, ["workloadId", "phaseId"]);
    return {
      workloadId: contentId(`${label}.workloadId`, value.workloadId),
      phaseId: identifier(`${label}.phaseId`, value.phaseId),
    };
  }
  if (scope === "source-region") {
    exactKeys(label, value, [
      "path", "sourceUnitId", "functionId", "regionId", "range",
    ]);
    return {
      path: repositoryPath(`${label}.path`, value.path),
      sourceUnitId: contentId(`${label}.sourceUnitId`, value.sourceUnitId),
      functionId: contentId(`${label}.functionId`, value.functionId),
      regionId: contentId(`${label}.regionId`, value.regionId),
      range: validateRange(`${label}.range`, value.range),
    };
  }
  if (scope === "runtime-component") {
    exactKeys(label, value, ["componentId", "operation"]);
    return {
      componentId: stableName(`${label}.componentId`, value.componentId),
      operation: nonemptyString(`${label}.operation`, value.operation),
    };
  }
  if (scope === "representation-lifetime") {
    exactKeys(label, value, ["owner", "construction", "lastConsumer"]);
    return {
      owner: stableName(`${label}.owner`, value.owner),
      construction: nonemptyString(`${label}.construction`, value.construction),
      lastConsumer: nonemptyString(`${label}.lastConsumer`, value.lastConsumer),
    };
  }
  if (scope === "foreign-boundary") {
    exactKeys(label, value, ["boundaryId", "direction", "operation"]);
    return {
      boundaryId: stableName(`${label}.boundaryId`, value.boundaryId),
      direction: enumeration(`${label}.direction`, value.direction, [
        "host-to-foreign", "foreign-to-host", "bidirectional",
      ]),
      operation: nonemptyString(`${label}.operation`, value.operation),
    };
  }
  if (scope === "cache-lifecycle") {
    exactKeys(label, value, ["cacheId", "states"]);
    return {
      cacheId: stableName(`${label}.cacheId`, value.cacheId),
      states: stringArray(`${label}.states`, value.states, {
        minimum: 2, identifiers: true,
      }),
    };
  }
  if (scope === "algorithmic-operation") {
    exactKeys(label, value, ["operationId", "domain"]);
    return {
      operationId: stableName(`${label}.operationId`, value.operationId),
      domain: nonemptyString(`${label}.domain`, value.domain),
    };
  }
  fail(label, `unsupported subject scope ${scope}`);
}

function contextMap(context, field) {
  const value = context?.[field];
  if (!value) return null;
  if (value instanceof Map) return value;
  if (Array.isArray(value)) return new Map(value.map((item) => [item.id, item]));
  return new Map(Object.entries(value));
}

function rangeContains(outer, inner) {
  const before = outer.start.line < inner.start.line ||
    (outer.start.line === inner.start.line && outer.start.column <= inner.start.column);
  const after = outer.end.line > inner.end.line ||
    (outer.end.line === inner.end.line && outer.end.column >= inner.end.column);
  return before && after;
}

function validateSubjectRelation(label, relation, subject, context) {
  exactKeys(label, relation, ["kind", "subjectId"]);
  const normalized = {
    kind: enumeration(`${label}.kind`, relation.kind, [
      "contained-by", "caused-by", "consumes", "produces",
    ]),
    subjectId: contentId(`${label}.subjectId`, relation.subjectId),
  };
  if (normalized.subjectId === subject.id) fail(label, "cannot cite the subject itself");
  const subjects = contextMap(context, "subjects");
  if (!subjects) return normalized;
  const target = subjects.get(normalized.subjectId);
  if (!target) fail(label, `unknown related subject ${normalized.subjectId}`);
  const parent = validateSubject(target);
  if (parent.binding.epochId !== subject.binding.epochId) {
    fail(label, "cannot relate subjects from different evidence epochs");
  }
  if (normalized.kind === "contained-by") {
    const phaseInCall = subject.scope === "reviewed-phase" && parent.scope === "public-call" &&
      subject.locator.workloadId === parent.locator.workloadId;
    const regionInRegion = subject.scope === "source-region" && parent.scope === "source-region" &&
      subject.locator.path === parent.locator.path &&
      subject.locator.sourceUnitId === parent.locator.sourceUnitId &&
      subject.locator.functionId === parent.locator.functionId &&
      rangeContains(parent.locator.range, subject.locator.range);
    if (!phaseInCall && !regionInRegion) {
      fail(label, "does not prove exact phase/public or source-range containment");
    }
  }
  return normalized;
}

function validateSubject(value, context = {}) {
  const label = "optimization subject";
  schemaHeader(label, value, SCHEMAS.subject, [
    "authority", "binding", "name", "scope", "locator", "relations",
  ]);
  const scope = enumeration(`${label}.scope`, value.scope, SUBJECT_SCOPES);
  const partial = {
    schema: SCHEMAS.subject,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    name: nonemptyString(`${label}.name`, value.name),
    scope,
    locator: validateSubjectLocator(`${label}.locator`, scope, value.locator),
  };
  const workloads = contextMap(context, "workloads");
  if (workloads && (scope === "public-call" || scope === "reviewed-phase")) {
    const workload = workloads.get(partial.locator.workloadId);
    if (!workload) fail(`${label}.locator.workloadId`, "is not a validated workload");
    const checked = validateWorkload(workload);
    if (scope === "public-call") {
      const entry = checked.publicEntry;
      if (entry.path !== partial.locator.entryPath || entry.name !== partial.locator.publicName ||
          entry.mode !== partial.locator.mode ||
          entry.outputBoundary !== partial.locator.outputBoundary) {
        fail(`${label}.locator`, "does not match the reviewed workload public boundary");
      }
    } else if (!checked.phases.some((phase) => phase.id === partial.locator.phaseId)) {
      fail(`${label}.locator.phaseId`, "is not a reviewed workload phase");
    }
  }
  const relations = array(`${label}.relations`, value.relations,
    (itemLabel, item) => validateSubjectRelation(itemLabel, item, partial, context), {
      uniqueBy: (item) => `${item.kind}:${item.subjectId}`,
      sortedBy: (item) => `${item.kind}:${item.subjectId}`,
    });
  return finish(label, value, { ...partial, relations });
}

function validateSubjectSet(values, context = {}) {
  const subjects = array("optimization subject set", values,
    (label, value) => validateSubject(value), {
      minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id,
    });
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const epochs = new Set(subjects.map((subject) => subject.binding.epochId));
  if (epochs.size !== 1) fail("optimization subject set", "must belong to one epoch");
  for (const subject of subjects) {
    validateSubject(subject, { ...context, subjects: byId });
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(subjectId) {
    if (visiting.has(subjectId)) fail("optimization subject set", "contains a relation cycle");
    if (visited.has(subjectId)) return;
    visiting.add(subjectId);
    for (const relation of byId.get(subjectId).relations) visit(relation.subjectId);
    visiting.delete(subjectId);
    visited.add(subjectId);
  }
  for (const subject of subjects) visit(subject.id);
  return deepFreeze(subjects);
}

function validateWorkload(value, context = {}) {
  const label = "optimization workload";
  schemaHeader(label, value, SCHEMAS.workload, [
    "authority", "sourceClosureId", "title", "owner", "role", "publicEntry",
    "runner", "corpus", "oracles", "phases", "protocol", "platforms",
    "browsers", "instrumentation", "materiality",
  ]);
  exactKeys(`${label}.publicEntry`, value.publicEntry, [
    "path", "name", "mode", "outputBoundary",
  ]);
  const publicEntry = {
    path: repositoryPath(`${label}.publicEntry.path`, value.publicEntry.path),
    name: stableName(`${label}.publicEntry.name`, value.publicEntry.name),
    mode: enumeration(`${label}.publicEntry.mode`, value.publicEntry.mode, [
      "sage", "python", "browser",
    ]),
    outputBoundary: nonemptyString(
      `${label}.publicEntry.outputBoundary`, value.publicEntry.outputBoundary,
    ),
  };
  exactKeys(`${label}.runner`, value.runner, ["path", "argv", "environment"]);
  const runner = {
    path: repositoryPath(`${label}.runner.path`, value.runner.path),
    argv: stringArray(`${label}.runner.argv`, value.runner.argv, {
      sorted: false, unique: false,
    }),
    environment: stringArray(`${label}.runner.environment`, value.runner.environment),
  };
  exactKeys(`${label}.corpus`, value.corpus, ["id", "digest", "provenance"]);
  const corpus = {
    id: identifier(`${label}.corpus.id`, value.corpus.id),
    digest: digest(`${label}.corpus.digest`, value.corpus.digest),
    provenance: nonemptyString(`${label}.corpus.provenance`, value.corpus.provenance),
  };
  const oracles = array(`${label}.oracles`, value.oracles, (itemLabel, item) => {
    exactKeys(itemLabel, item, ["id", "kind", "digest", "provenance"]);
    return {
      id: identifier(`${itemLabel}.id`, item.id),
      kind: enumeration(`${itemLabel}.kind`, item.kind, [
        "cpython", "sage", "pari", "library", "invariant", "digest",
      ]),
      digest: digest(`${itemLabel}.digest`, item.digest),
      provenance: nonemptyString(`${itemLabel}.provenance`, item.provenance),
    };
  }, { minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id });
  const phases = array(`${label}.phases`, value.phases, (itemLabel, item) => {
    exactKeys(itemLabel, item, ["id", "label", "parentId", "timing", "mayOverlap"]);
    return {
      id: identifier(`${itemLabel}.id`, item.id),
      label: nonemptyString(`${itemLabel}.label`, item.label),
      parentId: item.parentId === null ? null : identifier(`${itemLabel}.parentId`, item.parentId),
      timing: enumeration(`${itemLabel}.timing`, item.timing, ["inclusive", "exclusive"]),
      mayOverlap: boolean(`${itemLabel}.mayOverlap`, item.mayOverlap),
    };
  }, { minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id });
  const phaseIds = new Set(phases.map((phase) => phase.id));
  for (const phase of phases) {
    if (phase.parentId !== null && !phaseIds.has(phase.parentId)) {
      fail(`${label}.phases`, `unknown parent phase ${phase.parentId}`);
    }
    if (phase.parentId === phase.id) fail(`${label}.phases`, "phase cannot parent itself");
  }
  exactKeys(`${label}.protocol`, value.protocol, [
    "warmupRuns", "repetitions", "timeoutMilliseconds", "reset", "preparation",
  ]);
  const protocol = {
    warmupRuns: safeInteger(`${label}.protocol.warmupRuns`, value.protocol.warmupRuns),
    repetitions: safeInteger(`${label}.protocol.repetitions`, value.protocol.repetitions, 1),
    timeoutMilliseconds: safeInteger(
      `${label}.protocol.timeoutMilliseconds`, value.protocol.timeoutMilliseconds, 1,
    ),
    reset: enumeration(`${label}.protocol.reset`, value.protocol.reset, [
      "none", "evaluator", "process", "browser-context",
    ]),
    preparation: enumeration(`${label}.protocol.preparation`, value.protocol.preparation, [
      "cold", "warm-prepared", "warm-prepared-sealed",
    ]),
  };
  exactKeys(`${label}.materiality`, value.materiality, [
    "minimumWorstPairFraction", "minimumPairs",
  ]);
  const materiality = {
    minimumWorstPairFraction: finiteNumber(
      `${label}.materiality.minimumWorstPairFraction`,
      value.materiality.minimumWorstPairFraction, 0, 1,
    ),
    minimumPairs: safeInteger(`${label}.materiality.minimumPairs`, value.materiality.minimumPairs, 1),
  };
  return finish(label, value, {
    schema: SCHEMAS.workload,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    sourceClosureId: contentId(`${label}.sourceClosureId`, value.sourceClosureId),
    title: nonemptyString(`${label}.title`, value.title),
    owner: identifier(`${label}.owner`, value.owner),
    role: enumeration(`${label}.role`, value.role, [
      "representative", "held-out", "control", "adversarial",
    ]),
    publicEntry,
    runner,
    corpus,
    oracles,
    phases,
    protocol,
    platforms: array(`${label}.platforms`, value.platforms,
      (itemLabel, item) => enumeration(itemLabel, item, PLATFORMS), {
        minimum: 1, uniqueBy: (item) => item, sortedBy: (item) => item,
      }),
    browsers: array(`${label}.browsers`, value.browsers,
      (itemLabel, item) => enumeration(itemLabel, item, BROWSERS), {
        uniqueBy: (item) => item, sortedBy: (item) => item,
      }),
    instrumentation: stringArray(`${label}.instrumentation`, value.instrumentation, {
      identifiers: true,
    }),
    materiality,
  });
}

function validateMeasurement(label, channel, value) {
  exactKeys(label, value, [
    "unit", "samples", "total", "attributed", "ambiguous", "unmatched", "stale",
  ]);
  const unit = enumeration(`${label}.unit`, value.unit, [
    "microseconds", "ticks", "samples", "events", "calls", "bytes", "allocations",
    "resources", "count",
  ]);
  const samples = array(`${label}.samples`, value.samples,
    (itemLabel, item) => finiteNumber(itemLabel, item, 0), { minimum: 1 });
  const total = finiteNumber(`${label}.total`, value.total, 0);
  const attributed = finiteNumber(`${label}.attributed`, value.attributed, 0);
  const ambiguous = finiteNumber(`${label}.ambiguous`, value.ambiguous, 0);
  const unmatched = finiteNumber(`${label}.unmatched`, value.unmatched, 0);
  const stale = finiteNumber(`${label}.stale`, value.stale, 0);
  if (CONSERVED_CHANNELS.has(channel) &&
      total !== attributed + ambiguous + unmatched + stale) {
    fail(label, "independent attribution channels do not conserve to total");
  }
  if ((channel === "wall-time" || channel === "phase-time") && unit !== "microseconds") {
    fail(`${label}.unit`, "timing observations must use microseconds");
  }
  if ((channel === "wall-time" || channel === "phase-time") &&
      total !== samples.reduce((sum, sample) => sum + sample, 0)) {
    fail(label, "timing total must equal the sum of raw samples");
  }
  return { unit, samples, total, attributed, ambiguous, unmatched, stale };
}

function validateObservation(value, context = {}) {
  const label = "optimization observation";
  schemaHeader(label, value, SCHEMAS.observation, [
    "authority", "binding", "subjectId", "workloadId", "channel", "scope",
    "measurement", "costBoundary", "oracle", "provenance", "details",
  ]);
  const channel = enumeration(`${label}.channel`, value.channel, OBSERVATION_CHANNELS);
  exactKeys(`${label}.scope`, value.scope, [
    "kind", "subjectId", "phaseId", "parentObservationId", "mutuallyExclusiveGroup",
  ]);
  const scope = {
    kind: enumeration(`${label}.scope.kind`, value.scope.kind, [
      "complete-public", "reviewed-phase", "subject-local", "causal-child",
    ]),
    subjectId: contentId(`${label}.scope.subjectId`, value.scope.subjectId),
    phaseId: value.scope.phaseId === null
      ? null : identifier(`${label}.scope.phaseId`, value.scope.phaseId),
    parentObservationId: nullableContentId(
      `${label}.scope.parentObservationId`, value.scope.parentObservationId,
    ),
    mutuallyExclusiveGroup: value.scope.mutuallyExclusiveGroup === null
      ? null : identifier(
        `${label}.scope.mutuallyExclusiveGroup`, value.scope.mutuallyExclusiveGroup,
      ),
  };
  const subjectId = contentId(`${label}.subjectId`, value.subjectId);
  if (scope.subjectId !== subjectId && scope.kind !== "causal-child") {
    fail(`${label}.scope.subjectId`, "may differ only for an explicit causal-child scope");
  }
  exactKeys(`${label}.costBoundary`, value.costBoundary, ["included", "excluded"]);
  const costBoundary = {
    included: stringArray(`${label}.costBoundary.included`, value.costBoundary.included, {
      minimum: 1,
    }),
    excluded: stringArray(`${label}.costBoundary.excluded`, value.costBoundary.excluded),
  };
  exactKeys(`${label}.oracle`, value.oracle, [
    "status", "outputDigest", "exceptionDigest",
  ]);
  const oracle = {
    status: enumeration(`${label}.oracle.status`, value.oracle.status, [
      "pass", "fail", "not-applicable",
    ]),
    outputDigest: nullableDigest(`${label}.oracle.outputDigest`, value.oracle.outputDigest),
    exceptionDigest: nullableDigest(
      `${label}.oracle.exceptionDigest`, value.oracle.exceptionDigest,
    ),
  };
  if (oracle.status === "pass" && oracle.outputDigest === null && oracle.exceptionDigest === null) {
    fail(`${label}.oracle`, "a passing observation must bind output or exception evidence");
  }
  exactKeys(`${label}.provenance`, value.provenance, [
    "producerCommand", "artifactDigest", "recordedAt",
  ]);
  const provenance = {
    producerCommand: nonemptyString(
      `${label}.provenance.producerCommand`, value.provenance.producerCommand,
    ),
    artifactDigest: digest(
      `${label}.provenance.artifactDigest`, value.provenance.artifactDigest,
    ),
    recordedAt: isoTimestamp(`${label}.provenance.recordedAt`, value.provenance.recordedAt),
  };
  const subjects = contextMap(context, "subjects");
  if (subjects && !subjects.has(subjectId)) fail(`${label}.subjectId`, "is not validated");
  const workloadId = nullableContentId(`${label}.workloadId`, value.workloadId);
  const workloads = contextMap(context, "workloads");
  if (workloadId && workloads && !workloads.has(workloadId)) {
    fail(`${label}.workloadId`, "is not validated");
  }
  return finish(label, value, {
    schema: SCHEMAS.observation,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    subjectId,
    workloadId,
    channel,
    scope,
    measurement: validateMeasurement(`${label}.measurement`, channel, value.measurement),
    costBoundary,
    oracle,
    provenance,
    details: validateJsonValue(`${label}.details`, value.details),
  });
}

function validateObservationSet(values, context = {}) {
  const observations = array("optimization observation set", values,
    (label, value) => validateObservation(value, context), {
      minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id,
    });
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  for (const observation of observations) {
    const parentId = observation.scope.parentObservationId;
    if (parentId === null) continue;
    const parent = byId.get(parentId);
    if (!parent) fail("optimization observation set", `unknown parent ${parentId}`);
    if (parent.binding.epochId !== observation.binding.epochId ||
        parent.workloadId !== observation.workloadId || parent.channel !== observation.channel ||
        parent.measurement.unit !== observation.measurement.unit ||
        parent.measurement.samples.length !== observation.measurement.samples.length) {
      fail("optimization observation set", "parent/child observations are incomparable");
    }
    if (observation.channel === "wall-time" || observation.channel === "phase-time") {
      for (let index = 0; index < observation.measurement.samples.length; index += 1) {
        if (observation.measurement.samples[index] > parent.measurement.samples[index]) {
          fail("optimization observation set", "child timing exceeds its parent run");
        }
      }
    }
  }
  const groups = new Map();
  for (const observation of observations) {
    if (observation.scope.parentObservationId === null ||
        observation.scope.mutuallyExclusiveGroup === null) continue;
    const key = `${observation.scope.parentObservationId}:` +
      observation.scope.mutuallyExclusiveGroup;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(observation);
  }
  for (const siblings of groups.values()) {
    const parent = byId.get(siblings[0].scope.parentObservationId);
    for (let index = 0; index < parent.measurement.samples.length; index += 1) {
      const claimed = siblings.reduce(
        (sum, child) => sum + child.measurement.samples[index], 0,
      );
      if (claimed > parent.measurement.samples[index]) {
        fail("optimization observation set", "mutually exclusive children exceed parent timing");
      }
    }
  }
  return deepFreeze(observations);
}

function validateFallback(label, value) {
  exactKeys(label, value, ["kind", "entry", "rollback"]);
  return {
    kind: enumeration(`${label}.kind`, value.kind, [
      "same-source", "guarded-source", "library-fallback", "rollback", "not-applicable",
    ]),
    entry: nonemptyString(`${label}.entry`, value.entry),
    rollback: nonemptyString(`${label}.rollback`, value.rollback),
  };
}

function validateMatureCapability(label, value) {
  exactKeys(label, value, ["status", "capabilityIds", "auditEvidenceIds"]);
  return {
    status: enumeration(`${label}.status`, value.status, [
      "available", "unavailable", "not-duplicate", "incomplete", "not-applicable",
    ]),
    capabilityIds: validateReferenceIds(`${label}.capabilityIds`, value.capabilityIds),
    auditEvidenceIds: validateReferenceIds(
      `${label}.auditEvidenceIds`, value.auditEvidenceIds,
    ),
  };
}

function validateSpecificContract(label, category, value) {
  record(label, value);
  if (category === "algorithm") {
    exactKeys(label, value, [
      "specificationId", "proofKind", "crossoverEvidenceId", "generalityCorpusId",
    ]);
    return {
      specificationId: contentId(`${label}.specificationId`, value.specificationId),
      proofKind: enumeration(`${label}.proofKind`, value.proofKind, [
        "formal", "exhaustive-bounded", "differential-with-domain-proof",
      ]),
      crossoverEvidenceId: contentId(
        `${label}.crossoverEvidenceId`, value.crossoverEvidenceId,
      ),
      generalityCorpusId: contentId(`${label}.generalityCorpusId`, value.generalityCorpusId),
    };
  }
  if (category === "library-route") {
    exactKeys(label, value, [
      "capability", "version", "artifactId", "declarationId", "availability",
    ]);
    return {
      capability: stableName(`${label}.capability`, value.capability),
      version: nonemptyString(`${label}.version`, value.version),
      artifactId: contentId(`${label}.artifactId`, value.artifactId),
      declarationId: contentId(`${label}.declarationId`, value.declarationId),
      availability: enumeration(`${label}.availability`, value.availability, [
        "required", "optional-with-fallback", "host-only-with-fallback",
      ]),
    };
  }
  if (category === "representation") {
    exactKeys(label, value, ["ownerId", "lifetimeStart", "lifetimeEnd", "escapePolicy"]);
    return {
      ownerId: stableName(`${label}.ownerId`, value.ownerId),
      lifetimeStart: nonemptyString(`${label}.lifetimeStart`, value.lifetimeStart),
      lifetimeEnd: nonemptyString(`${label}.lifetimeEnd`, value.lifetimeEnd),
      escapePolicy: enumeration(`${label}.escapePolicy`, value.escapePolicy, [
        "no-escape", "sealed-publication", "owned-transfer",
      ]),
    };
  }
  if (category === "runtime") {
    exactKeys(label, value, [
      "componentId", "reach", "compatibilityAuditId", "codeSizeBudgetBytes",
    ]);
    return {
      componentId: stableName(`${label}.componentId`, value.componentId),
      reach: enumeration(`${label}.reach`, value.reach, ["local", "runtime-wide"]),
      compatibilityAuditId: contentId(
        `${label}.compatibilityAuditId`, value.compatibilityAuditId,
      ),
      codeSizeBudgetBytes: safeInteger(
        `${label}.codeSizeBudgetBytes`, value.codeSizeBudgetBytes,
      ),
    };
  }
  if (category === "boundary") {
    exactKeys(label, value, [
      "boundaryId", "beforeCrossings", "afterCrossings", "beforeBytes", "afterBytes",
      "residency",
    ]);
    return {
      boundaryId: stableName(`${label}.boundaryId`, value.boundaryId),
      beforeCrossings: safeInteger(`${label}.beforeCrossings`, value.beforeCrossings),
      afterCrossings: safeInteger(`${label}.afterCrossings`, value.afterCrossings),
      beforeBytes: safeInteger(`${label}.beforeBytes`, value.beforeBytes),
      afterBytes: safeInteger(`${label}.afterBytes`, value.afterBytes),
      residency: enumeration(`${label}.residency`, value.residency, [
        "per-call", "batched", "resident",
      ]),
    };
  }
  if (category === "cache") {
    exactKeys(label, value, [
      "cacheId", "keySchemaId", "states", "invalidationEvidenceId", "cleanupPolicy",
    ]);
    return {
      cacheId: stableName(`${label}.cacheId`, value.cacheId),
      keySchemaId: contentId(`${label}.keySchemaId`, value.keySchemaId),
      states: stringArray(`${label}.states`, value.states, {
        minimum: 2, identifiers: true,
      }),
      invalidationEvidenceId: contentId(
        `${label}.invalidationEvidenceId`, value.invalidationEvidenceId,
      ),
      cleanupPolicy: nonemptyString(`${label}.cleanupPolicy`, value.cleanupPolicy),
    };
  }
  if (category === "source") {
    exactKeys(label, value, ["sourcePaths", "semanticsAuditId", "readabilityReviewId"]);
    return {
      sourcePaths: array(`${label}.sourcePaths`, value.sourcePaths,
        (itemLabel, item) => repositoryPath(itemLabel, item), {
          minimum: 1, uniqueBy: (item) => item, sortedBy: (item) => item,
        }),
      semanticsAuditId: contentId(`${label}.semanticsAuditId`, value.semanticsAuditId),
      readabilityReviewId: contentId(
        `${label}.readabilityReviewId`, value.readabilityReviewId,
      ),
    };
  }
  if (category === "compiler") {
    exactKeys(label, value, [
      "decisionId", "passId", "loweringId", "irId", "verifierId",
      "compileBudgetMicros", "emittedBytes",
    ]);
    return {
      decisionId: contentId(`${label}.decisionId`, value.decisionId),
      passId: stableName(`${label}.passId`, value.passId),
      loweringId: stableName(`${label}.loweringId`, value.loweringId),
      irId: contentId(`${label}.irId`, value.irId),
      verifierId: stableName(`${label}.verifierId`, value.verifierId),
      compileBudgetMicros: safeInteger(`${label}.compileBudgetMicros`, value.compileBudgetMicros),
      emittedBytes: safeInteger(`${label}.emittedBytes`, value.emittedBytes),
    };
  }
  fail(label, `unknown intervention category ${category}`);
}

function validateIntervention(value, context = {}) {
  const label = "optimization intervention";
  schemaHeader(label, value, SCHEMAS.intervention, [
    "authority", "binding", "subjectId", "category", "owner", "mechanism",
    "changedComponents", "sourceRelationship", "evidenceBoundary", "fallback",
    "costTransfer", "matureCapability", "semanticObligations",
    "architectureObligations", "platformObligations", "rejectionConditions",
    "alternativeDispositions", "specific",
  ]);
  const category = enumeration(
    `${label}.category`, value.category, INTERVENTION_CATEGORIES,
  );
  exactKeys(`${label}.costTransfer`, value.costTransfer, ["removes", "adds"]);
  const costTransfer = {
    removes: stringArray(`${label}.costTransfer.removes`, value.costTransfer.removes),
    adds: stringArray(`${label}.costTransfer.adds`, value.costTransfer.adds),
  };
  const alternatives = array(
    `${label}.alternativeDispositions`, value.alternativeDispositions,
    (itemLabel, item) => {
      exactKeys(itemLabel, item, ["category", "disposition", "reason"]);
      const alternative = enumeration(
        `${itemLabel}.category`, item.category, INTERVENTION_CATEGORIES,
      );
      if (alternative === category) fail(itemLabel, "must describe a different category");
      return {
        category: alternative,
        disposition: enumeration(`${itemLabel}.disposition`, item.disposition, [
          "inferior", "unavailable", "duplicate", "not-causal", "investigate",
        ]),
        reason: nonemptyString(`${itemLabel}.reason`, item.reason),
      };
    }, {
      minimum: 7,
      uniqueBy: (item) => item.category,
      sortedBy: (item) => item.category,
    },
  );
  if (alternatives.length !== INTERVENTION_CATEGORIES.length - 1) {
    fail(`${label}.alternativeDispositions`, "must adjudicate every other category");
  }
  const sourceRelationship = enumeration(
    `${label}.sourceRelationship`, value.sourceRelationship,
    ["source-transparent", "source-changing", "not-applicable"],
  );
  const evidenceBoundary = enumeration(
    `${label}.evidenceBoundary`, value.evidenceBoundary,
    ["complete-public-call", "reviewed-phase", "system-boundary"],
  );
  const fallback = validateFallback(`${label}.fallback`, value.fallback);
  if (category === "compiler") {
    if (sourceRelationship !== "source-transparent") {
      fail(`${label}.sourceRelationship`, "compiler work must be source-transparent");
    }
    if (fallback.kind !== "same-source") {
      fail(`${label}.fallback.kind`, "compiler work requires an untouched same-source fallback");
    }
    if (evidenceBoundary !== "complete-public-call") {
      fail(`${label}.evidenceBoundary`, "compiler promotion requires the public boundary");
    }
  }
  const subjectId = contentId(`${label}.subjectId`, value.subjectId);
  const subjects = contextMap(context, "subjects");
  if (subjects && !subjects.has(subjectId)) fail(`${label}.subjectId`, "is not validated");
  return finish(label, value, {
    schema: SCHEMAS.intervention,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    subjectId,
    category,
    owner: identifier(`${label}.owner`, value.owner),
    mechanism: nonemptyString(`${label}.mechanism`, value.mechanism),
    changedComponents: stringArray(`${label}.changedComponents`, value.changedComponents, {
      minimum: 1,
    }),
    sourceRelationship,
    evidenceBoundary,
    fallback,
    costTransfer,
    matureCapability: validateMatureCapability(
      `${label}.matureCapability`, value.matureCapability,
    ),
    semanticObligations: stringArray(
      `${label}.semanticObligations`, value.semanticObligations, { minimum: 1 },
    ),
    architectureObligations: stringArray(
      `${label}.architectureObligations`, value.architectureObligations, { minimum: 1 },
    ),
    platformObligations: stringArray(
      `${label}.platformObligations`, value.platformObligations, { minimum: 1 },
    ),
    rejectionConditions: stringArray(
      `${label}.rejectionConditions`, value.rejectionConditions, { minimum: 1 },
    ),
    alternativeDispositions: alternatives,
    specific: validateCategoryDetails(`${label}.specific`, category, value.specific),
  });
}

function validateOpportunity(value, context = {}) {
  const label = "optimization opportunity";
  schemaHeader(label, value, SCHEMAS.opportunity, [
    "authority", "binding", "subjectId", "observationIds", "classifications",
    "interventionIds", "losingEvidenceIds", "unresolvedObligations", "decision",
  ]);
  const classifications = array(
    `${label}.classifications`, value.classifications,
    (itemLabel, item) => {
      exactKeys(itemLabel, item, ["kind", "observationIds", "explanation"]);
      return {
        kind: enumeration(`${itemLabel}.kind`, item.kind, [
          "algorithmic", "library-capability", "representation-cost", "runtime-cost",
          "boundary-cost", "cache-cost", "source-cost", "compiler-region",
          "unattributed", "mixed",
        ]),
        observationIds: validateReferenceIds(
          `${itemLabel}.observationIds`, item.observationIds, { minimum: 1 },
        ),
        explanation: nonemptyString(`${itemLabel}.explanation`, item.explanation),
      };
    }, { minimum: 1, uniqueBy: (item) => item.kind, sortedBy: (item) => item.kind },
  );
  const interventionIds = validateReferenceIds(
    `${label}.interventionIds`, value.interventionIds,
  );
  exactKeys(`${label}.decision`, value.decision, [
    "status", "selectedInterventionId", "reasons",
  ]);
  const decision = {
    status: enumeration(`${label}.decision.status`, value.decision.status, DECISIONS),
    selectedInterventionId: nullableContentId(
      `${label}.decision.selectedInterventionId`, value.decision.selectedInterventionId,
    ),
    reasons: stringArray(`${label}.decision.reasons`, value.decision.reasons, {
      minimum: 1,
    }),
  };
  if ((decision.status === "select") !== (decision.selectedInterventionId !== null)) {
    fail(`${label}.decision`, "only select may name exactly one intervention");
  }
  if (decision.selectedInterventionId !== null &&
      !interventionIds.includes(decision.selectedInterventionId)) {
    fail(`${label}.decision.selectedInterventionId`, "is not a proposed intervention");
  }
  const subjectId = contentId(`${label}.subjectId`, value.subjectId);
  const observationIds = validateReferenceIds(
    `${label}.observationIds`, value.observationIds, { minimum: 1 },
  );
  const observations = contextMap(context, "observations");
  if (observations) {
    for (const id of observationIds) {
      const observation = observations.get(id);
      if (!observation) fail(`${label}.observationIds`, `unknown observation ${id}`);
      if (validateObservation(observation).subjectId !== subjectId) {
        fail(`${label}.observationIds`, `observation ${id} belongs to another subject`);
      }
    }
  }
  const interventions = contextMap(context, "interventions");
  if (interventions) {
    for (const id of interventionIds) {
      const intervention = interventions.get(id);
      if (!intervention) fail(`${label}.interventionIds`, `unknown intervention ${id}`);
      if (validateIntervention(intervention).subjectId !== subjectId) {
        fail(`${label}.interventionIds`, `intervention ${id} belongs to another subject`);
      }
    }
  }
  return finish(label, value, {
    schema: SCHEMAS.opportunity,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    subjectId,
    observationIds,
    classifications,
    interventionIds,
    losingEvidenceIds: validateReferenceIds(
      `${label}.losingEvidenceIds`, value.losingEvidenceIds,
    ),
    unresolvedObligations: stringArray(
      `${label}.unresolvedObligations`, value.unresolvedObligations,
    ),
    decision,
  });
}

const DOSSIER_EVIDENCE_KEYS = Object.freeze({
  algorithm: ["specificationId", "proofEvidenceIds", "crossoverEvidenceIds"],
  "library-route": ["capabilityEvidenceIds", "conversionPlanId", "resourceEvidenceIds"],
  representation: ["ownershipGraphId", "lifetimeEvidenceIds", "resourceEvidenceIds"],
  runtime: ["componentEvidenceIds", "compatibilityEvidenceIds", "budgetEvidenceIds"],
  boundary: ["crossingEvidenceIds", "ownershipPlanId", "platformEvidenceIds"],
  cache: ["stateTransitionEvidenceIds", "keyEvidenceIds", "churnEvidenceIds"],
  source: ["replacementSourceIds", "differentialEvidenceIds", "reviewEvidenceIds"],
  compiler: ["decisionId", "irId", "verifierEvidenceIds", "routeEvidenceIds"],
});

function validateDossierEvidence(label, category, value) {
  const keys = DOSSIER_EVIDENCE_KEYS[category];
  exactKeys(label, value, keys);
  const result = {};
  for (const key of keys) {
    result[key] = key.endsWith("Ids")
      ? validateReferenceIds(`${label}.${key}`, value[key], { minimum: 1 })
      : contentId(`${label}.${key}`, value[key]);
  }
  return result;
}

function validateDossier(value, context = {}) {
  const label = "optimization dossier";
  schemaHeader(label, value, SCHEMAS.dossier, [
    "authority", "binding", "opportunityId", "subjectId", "interventionId",
    "category", "observationIds", "evidence", "measurementBoundary",
    "fallbackPlan", "promotionRequirements",
  ]);
  const category = enumeration(`${label}.category`, value.category, INTERVENTION_CATEGORIES);
  const interventionId = contentId(`${label}.interventionId`, value.interventionId);
  const interventions = contextMap(context, "interventions");
  if (interventions) {
    const intervention = interventions.get(interventionId);
    if (!intervention || validateIntervention(intervention).category !== category) {
      fail(`${label}.interventionId`, "does not resolve to the dossier category");
    }
  }
  exactKeys(`${label}.fallbackPlan`, value.fallbackPlan, ["entry", "rollback", "tests"]);
  const fallbackPlan = {
    entry: nonemptyString(`${label}.fallbackPlan.entry`, value.fallbackPlan.entry),
    rollback: nonemptyString(`${label}.fallbackPlan.rollback`, value.fallbackPlan.rollback),
    tests: stringArray(`${label}.fallbackPlan.tests`, value.fallbackPlan.tests, { minimum: 1 }),
  };
  return finish(label, value, {
    schema: SCHEMAS.dossier,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    opportunityId: contentId(`${label}.opportunityId`, value.opportunityId),
    subjectId: contentId(`${label}.subjectId`, value.subjectId),
    interventionId,
    category,
    observationIds: validateReferenceIds(
      `${label}.observationIds`, value.observationIds, { minimum: 1 },
    ),
    evidence: validateDossierEvidence(`${label}.evidence`, category, value.evidence),
    measurementBoundary: stringArray(
      `${label}.measurementBoundary`, value.measurementBoundary, { minimum: 1 },
    ),
    fallbackPlan,
    promotionRequirements: stringArray(
      `${label}.promotionRequirements`, value.promotionRequirements, { minimum: 1 },
    ),
  });
}

function validateCampaign(value, context = {}) {
  const label = "optimization campaign";
  schemaHeader(label, value, SCHEMAS.campaign, [
    "authority", "binding", "dossierId", "interventionId", "category", "state",
    "lanes", "requiredEvidenceIds", "representativeWorkloadIds", "heldOutWorkloadIds",
  ]);
  const category = enumeration(`${label}.category`, value.category, INTERVENTION_CATEGORIES);
  const lanes = array(`${label}.lanes`, value.lanes, (itemLabel, item) => {
    exactKeys(itemLabel, item, ["id", "role", "claims"]);
    return {
      id: identifier(`${itemLabel}.id`, item.id),
      role: enumeration(`${itemLabel}.role`, item.role, [
        "semantic-proof", "implementation", "oracle", "workload", "platform", "integration",
      ]),
      claims: array(`${itemLabel}.claims`, item.claims,
        (claimLabel, claim) => repositoryPath(claimLabel, claim), {
          minimum: 1, uniqueBy: (claim) => claim, sortedBy: (claim) => claim,
        }),
    };
  }, { minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id });
  const interventionId = contentId(`${label}.interventionId`, value.interventionId);
  const interventions = contextMap(context, "interventions");
  if (interventions) {
    const intervention = interventions.get(interventionId);
    if (!intervention || validateIntervention(intervention).category !== category) {
      fail(`${label}.interventionId`, "does not match the campaign category");
    }
  }
  return finish(label, value, {
    schema: SCHEMAS.campaign,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    dossierId: contentId(`${label}.dossierId`, value.dossierId),
    interventionId,
    category,
    state: enumeration(`${label}.state`, value.state, [
      "proposed", "active", "review", "complete",
    ]),
    lanes,
    requiredEvidenceIds: validateReferenceIds(
      `${label}.requiredEvidenceIds`, value.requiredEvidenceIds, { minimum: 1 },
    ),
    representativeWorkloadIds: validateReferenceIds(
      `${label}.representativeWorkloadIds`, value.representativeWorkloadIds, { minimum: 1 },
    ),
    heldOutWorkloadIds: validateReferenceIds(
      `${label}.heldOutWorkloadIds`, value.heldOutWorkloadIds, { minimum: 1 },
    ),
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validateComparison(label, value) {
  exactKeys(label, value, [
    "role", "workloadId", "pairs", "baselineMedian", "candidateMedian",
    "worstPairFraction", "allPositive",
  ]);
  const pairs = array(`${label}.pairs`, value.pairs, (itemLabel, item) => {
    exactKeys(itemLabel, item, [
      "order", "baselineMicroseconds", "candidateMicroseconds",
      "baselineOutputDigest", "candidateOutputDigest",
    ]);
    const baseline = finiteNumber(
      `${itemLabel}.baselineMicroseconds`, item.baselineMicroseconds, Number.MIN_VALUE,
    );
    const candidate = finiteNumber(
      `${itemLabel}.candidateMicroseconds`, item.candidateMicroseconds, 0,
    );
    const baselineOutputDigest = digest(
      `${itemLabel}.baselineOutputDigest`, item.baselineOutputDigest,
    );
    const candidateOutputDigest = digest(
      `${itemLabel}.candidateOutputDigest`, item.candidateOutputDigest,
    );
    if (baselineOutputDigest !== candidateOutputDigest) {
      fail(itemLabel, "baseline and candidate outputs differ");
    }
    return {
      order: enumeration(`${itemLabel}.order`, item.order, ["ABBA", "BAAB"]),
      baselineMicroseconds: baseline,
      candidateMicroseconds: candidate,
      baselineOutputDigest,
      candidateOutputDigest,
    };
  }, { minimum: 1 });
  const baselineMedian = median(pairs.map((pair) => pair.baselineMicroseconds));
  const candidateMedian = median(pairs.map((pair) => pair.candidateMicroseconds));
  const fractions = pairs.map((pair) =>
    (pair.baselineMicroseconds - pair.candidateMicroseconds) / pair.baselineMicroseconds);
  const worstPairFraction = Math.min(...fractions);
  const allPositive = fractions.every((fraction) => fraction > 0);
  if (value.baselineMedian !== baselineMedian || value.candidateMedian !== candidateMedian ||
      value.worstPairFraction !== worstPairFraction || value.allPositive !== allPositive) {
    fail(label, "paired summary is not independently reproducible from raw pairs");
  }
  return {
    role: enumeration(`${label}.role`, value.role, ["representative", "held-out"]),
    workloadId: contentId(`${label}.workloadId`, value.workloadId),
    pairs,
    baselineMedian,
    candidateMedian,
    worstPairFraction,
    allPositive,
  };
}

function validatePromotion(value, context = {}) {
  const label = "optimization promotion";
  schemaHeader(label, value, SCHEMAS.promotion, [
    "authority", "binding", "campaignId", "interventionId", "category", "decision",
    "comparisons", "equivalence", "fallbackEvidenceIds", "resourceEvidenceIds",
    "negativeEvidenceIds", "platforms", "browsers", "candidateRevision",
  ]);
  const comparisons = array(`${label}.comparisons`, value.comparisons,
    validateComparison, {
      minimum: 2,
      uniqueBy: (item) => `${item.role}:${item.workloadId}`,
      sortedBy: (item) => `${item.role}:${item.workloadId}`,
    });
  exactKeys(`${label}.equivalence`, value.equivalence, [
    "outputs", "exceptions", "interruptions", "mutation", "publication",
  ]);
  const equivalence = {
    outputs: boolean(`${label}.equivalence.outputs`, value.equivalence.outputs),
    exceptions: boolean(`${label}.equivalence.exceptions`, value.equivalence.exceptions),
    interruptions: boolean(
      `${label}.equivalence.interruptions`, value.equivalence.interruptions,
    ),
    mutation: boolean(`${label}.equivalence.mutation`, value.equivalence.mutation),
    publication: boolean(`${label}.equivalence.publication`, value.equivalence.publication),
  };
  exactKeys(`${label}.candidateRevision`, value.candidateRevision, [
    "commit", "tree", "clean", "buildArtifactId",
  ]);
  const candidateRevision = {
    commit: gitObject(`${label}.candidateRevision.commit`, value.candidateRevision.commit),
    tree: gitObject(`${label}.candidateRevision.tree`, value.candidateRevision.tree),
    clean: boolean(`${label}.candidateRevision.clean`, value.candidateRevision.clean),
    buildArtifactId: contentId(
      `${label}.candidateRevision.buildArtifactId`, value.candidateRevision.buildArtifactId,
    ),
  };
  const decision = enumeration(`${label}.decision`, value.decision, [
    "accepted", "rejected", "investigate", "already-optimized",
  ]);
  if (decision === "accepted") {
    if (!candidateRevision.clean) fail(`${label}.candidateRevision.clean`, "must be clean");
    if (!Object.values(equivalence).every(Boolean)) {
      fail(`${label}.equivalence`, "all semantic channels must pass for acceptance");
    }
    for (const comparison of comparisons) {
      if (comparison.pairs.length < 11 || !comparison.allPositive ||
          comparison.worstPairFraction < 0.1) {
        fail(`${label}.comparisons`, "accepted promotion does not clear the 11-pair 10% gate");
      }
    }
    if (!comparisons.some((comparison) => comparison.role === "representative") ||
        !comparisons.some((comparison) => comparison.role === "held-out")) {
      fail(`${label}.comparisons`, "accepted promotion needs representative and held-out evidence");
    }
  }
  return finish(label, value, {
    schema: SCHEMAS.promotion,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    campaignId: contentId(`${label}.campaignId`, value.campaignId),
    interventionId: contentId(`${label}.interventionId`, value.interventionId),
    category: enumeration(`${label}.category`, value.category, INTERVENTION_CATEGORIES),
    decision,
    comparisons,
    equivalence,
    fallbackEvidenceIds: validateReferenceIds(
      `${label}.fallbackEvidenceIds`, value.fallbackEvidenceIds, { minimum: 1 },
    ),
    resourceEvidenceIds: validateReferenceIds(
      `${label}.resourceEvidenceIds`, value.resourceEvidenceIds, { minimum: 1 },
    ),
    negativeEvidenceIds: validateReferenceIds(
      `${label}.negativeEvidenceIds`, value.negativeEvidenceIds, { minimum: 1 },
    ),
    platforms: array(`${label}.platforms`, value.platforms,
      (itemLabel, item) => enumeration(itemLabel, item, PLATFORMS), {
        minimum: 1, uniqueBy: (item) => item, sortedBy: (item) => item,
      }),
    browsers: array(`${label}.browsers`, value.browsers,
      (itemLabel, item) => enumeration(itemLabel, item, BROWSERS), {
        uniqueBy: (item) => item, sortedBy: (item) => item,
      }),
    candidateRevision,
  });
}

function validateOutcome(value) {
  const label = "optimization outcome";
  schemaHeader(label, value, SCHEMAS.outcome, [
    "authority", "binding", "subjectId", "opportunityId", "interventionId",
    "campaignId", "promotionId", "disposition", "evidenceIds", "reasons",
    "supersedesIds", "regressionState",
  ]);
  const disposition = enumeration(`${label}.disposition`, value.disposition, DISPOSITIONS);
  const promotionId = nullableContentId(`${label}.promotionId`, value.promotionId);
  if (disposition === "accepted" && promotionId === null) {
    fail(`${label}.promotionId`, "accepted outcomes require promotion authority");
  }
  return finish(label, value, {
    schema: SCHEMAS.outcome,
    id: value.id,
    authority: validateAuthority(`${label}.authority`, value.authority),
    binding: validateBinding(`${label}.binding`, value.binding),
    subjectId: contentId(`${label}.subjectId`, value.subjectId),
    opportunityId: contentId(`${label}.opportunityId`, value.opportunityId),
    interventionId: nullableContentId(`${label}.interventionId`, value.interventionId),
    campaignId: nullableContentId(`${label}.campaignId`, value.campaignId),
    promotionId,
    disposition,
    evidenceIds: validateReferenceIds(`${label}.evidenceIds`, value.evidenceIds, {
      minimum: 1,
    }),
    reasons: stringArray(`${label}.reasons`, value.reasons, { minimum: 1 }),
    supersedesIds: validateReferenceIds(`${label}.supersedesIds`, value.supersedesIds),
    regressionState: enumeration(`${label}.regressionState`, value.regressionState, [
      "current", "passing", "regressed", "not-applicable",
    ]),
  });
}

function validateBySchema(value, context = {}) {
  record("optimization document", value);
  const validators = {
    [SCHEMAS.epoch]: validateEpoch,
    [SCHEMAS.workload]: validateWorkload,
    [SCHEMAS.observation]: validateObservation,
    [SCHEMAS.subject]: validateSubject,
    [SCHEMAS.opportunity]: validateOpportunity,
    [SCHEMAS.intervention]: validateIntervention,
    [SCHEMAS.dossier]: validateDossier,
    [SCHEMAS.campaign]: validateCampaign,
    [SCHEMAS.promotion]: validatePromotion,
    [SCHEMAS.outcome]: validateOutcome,
  };
  const validator = validators[value.schema];
  if (!validator) fail("document.schema", `unknown schema ${value.schema}`);
  return validator(value, context);
}

function createDocument(kind, payload, context = {}) {
  const schema = SCHEMAS[kind];
  if (!schema) fail("document kind", `unknown kind ${kind}`);
  const document = attachIdentity(schema, payload);
  return validateBySchema(document, context);
}

module.exports = Object.freeze({
  BROWSERS,
  DECISIONS,
  DISPOSITIONS,
  INTERVENTION_CATEGORIES,
  OBSERVATION_CHANNELS,
  PLATFORMS,
  SCHEMAS,
  SUBJECT_SCOPES,
  createDocument,
  median,
  validateAuthority,
  validateBinding,
  validateBySchema,
  validateCampaign,
  validateDossier,
  validateEpoch,
  validateIntervention,
  validateObservation,
  validateObservationSet,
  validateOpportunity,
  validateOutcome,
  validatePromotion,
  validateSubject,
  validateSubjectSet,
  validateWorkload,
});
