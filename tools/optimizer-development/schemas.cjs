"use strict";

const {
  array,
  attachIdentity,
  boolean,
  canonicalJson,
  contentId,
  deepFreeze,
  digest,
  documentIdentity,
  enumeration,
  exactKeys,
  finiteNumber,
  identifier,
  nonemptyString,
  optionalString,
  record,
  repositoryPath,
  safeInteger,
  sha256,
  stableName,
  stringArray,
  validateJsonValue,
} = require("./common.cjs");
const {
  compilerIdentity,
  validateRange,
  validateSourceBundle,
} = require("./identity.cjs");
const {
  DEFAULT_REASON_REGISTRY,
  validateReason,
  validateReasons,
} = require("./reason-codes.cjs");

const SCHEMAS = deepFreeze({
  workload: "sagejs.optimizer-workload/v1",
  workloadCatalog: "sagejs.optimizer-workload-catalog/v1",
  profile: "sagejs.optimizer-profile-receipt/v1",
  overlay: "sagejs.optimizer-hotness-overlay/v1",
  dossier: "sagejs.optimizer-dossier/v1",
  campaign: "sagejs.optimizer-campaign/v1",
  promotion: "sagejs.optimizer-promotion-receipt/v1",
});

const TARGETS = ["v8", "wasm", "native", "library", "generic"];
const PLATFORMS = ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"];
const MODES = ["sage", "python", "browser"];

function fail(label, message) {
  throw new Error(`optimizer evidence ${label}: ${message}`);
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

function validateReference(label, value) {
  exactKeys(label, value, ["id"]);
  return { id: contentId(`${label}.id`, value.id) };
}

function validateSource(label, value) {
  exactKeys(label, value, ["path", "range", "sourceUnitId", "functionId", "regionId"]);
  return {
    path: repositoryPath(`${label}.path`, value.path),
    range: validateRange(`${label}.range`, value.range),
    sourceUnitId: contentId(`${label}.sourceUnitId`, value.sourceUnitId),
    functionId: contentId(`${label}.functionId`, value.functionId),
    regionId: contentId(`${label}.regionId`, value.regionId),
  };
}

function validateDistribution(label, value) {
  exactKeys(label, value, ["unit", "samples", "minimum", "median", "maximum"]);
  if (value.unit !== "microseconds") fail(`${label}.unit`, "must be microseconds");
  const samples = array(`${label}.samples`, value.samples,
    (sampleLabel, sample) => safeInteger(sampleLabel, sample), { minimum: 1 });
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  const minimum = safeInteger(`${label}.minimum`, value.minimum);
  const maximum = safeInteger(`${label}.maximum`, value.maximum);
  finiteNumber(`${label}.median`, value.median, 0);
  if (minimum !== sorted[0] || maximum !== sorted[sorted.length - 1] || value.median !== median) {
    fail(label, "summary does not match raw ordered samples");
  }
  return { unit: "microseconds", samples, minimum, median, maximum };
}

function validateCounterSet(label, value) {
  exactKeys(label, value,
    ["boundaryCrossings", "copiedBytes", "materializations", "allocations"]);
  return {
    boundaryCrossings: safeInteger(`${label}.boundaryCrossings`, value.boundaryCrossings),
    copiedBytes: safeInteger(`${label}.copiedBytes`, value.copiedBytes),
    materializations: safeInteger(`${label}.materializations`, value.materializations),
    allocations: safeInteger(`${label}.allocations`, value.allocations),
  };
}

function validateCompiler(label, value) {
  exactKeys(label, value, [
    "schema", "id", "irSchema", "compilerSourceBundleId", "frontendDigest", "catalogDigest",
    "optionsDigest",
  ]);
  if (value.schema !== "sagejs.optimizer-compiler-identity/v1") {
    fail(`${label}.schema`, `unknown schema ${value.schema}`);
  }
  const expected = compilerIdentity({
    irSchema: value.irSchema,
    compilerSourceBundleId: value.compilerSourceBundleId,
    frontendDigest: value.frontendDigest,
    catalogDigest: value.catalogDigest,
    optionsDigest: value.optionsDigest,
  });
  if (value.id !== expected.id) fail(`${label}.id`, `is stale; expected ${expected.id}`);
  return expected;
}

function validateArtifact(label, value) {
  exactKeys(label, value, ["schema", "id", "kind", "receiptDigest"]);
  if (value.schema !== "sagejs.optimizer-artifact/v1") {
    fail(`${label}.schema`, `unknown schema ${value.schema}`);
  }
  const expected = attachIdentity("sagejs.optimizer-artifact/v1", {
    kind: enumeration(`${label}.kind`, value.kind,
      ["node-source", "node-build", "browser-production"]),
    receiptDigest: digest(`${label}.receiptDigest`, value.receiptDigest),
  });
  if (value.id !== expected.id) fail(`${label}.id`, `is stale; expected ${expected.id}`);
  return expected;
}

function validateReasonList(label, value, registry) {
  return validateReasons(value, registry, label);
}

function validateWorkload(value) {
  const label = "workload";
  schemaHeader(label, value, SCHEMAS.workload, [
    "title", "class", "owner", "runner", "input", "corpus", "oracles", "phases",
    "protocol", "capabilities", "targets", "modes", "platforms",
  ]);
  exactKeys(`${label}.runner`, value.runner, ["kind", "path", "argv", "environment"]);
  const runner = {
    kind: enumeration(`${label}.runner.kind`, value.runner.kind,
      ["node-script", "sagejs-script", "python-script", "browser-harness", "fixture"]),
    path: repositoryPath(`${label}.runner.path`, value.runner.path),
    argv: stringArray(`${label}.runner.argv`, value.runner.argv,
      { sorted: false, unique: false }),
    environment: stringArray(`${label}.runner.environment`, value.runner.environment),
  };
  exactKeys(`${label}.input`, value.input, ["kind", "digest", "seed", "value"]);
  const input = {
    kind: enumeration(`${label}.input.kind`, value.input.kind,
      ["inline-json", "fixture", "deterministic-generator"]),
    digest: digest(`${label}.input.digest`, value.input.digest),
    seed: value.input.seed === null ? null : safeInteger(`${label}.input.seed`, value.input.seed),
    value: value.input.value,
  };
  // Canonical identity validation rejects non-JSON input values.
  documentIdentity({ schema: "sagejs.optimizer-input-probe/v1", value: input.value });
  exactKeys(`${label}.corpus`, value.corpus, ["id", "digest"]);
  const corpus = {
    id: identifier(`${label}.corpus.id`, value.corpus.id),
    digest: digest(`${label}.corpus.digest`, value.corpus.digest),
  };
  const oracles = array(`${label}.oracles`, value.oracles, (oracleLabel, oracle) => {
    exactKeys(oracleLabel, oracle, ["id", "kind", "runnerPath", "expectedDigest"]);
    return {
      id: identifier(`${oracleLabel}.id`, oracle.id),
      kind: enumeration(`${oracleLabel}.kind`, oracle.kind,
        ["digest", "cpython", "sage", "pari", "invariant"]),
      runnerPath: oracle.runnerPath === null
        ? null : repositoryPath(`${oracleLabel}.runnerPath`, oracle.runnerPath),
      expectedDigest: digest(`${oracleLabel}.expectedDigest`, oracle.expectedDigest),
    };
  }, { minimum: 1, uniqueBy: (oracle) => oracle.id, sortedBy: (oracle) => oracle.id });
  const phases = array(`${label}.phases`, value.phases, (phaseLabel, phase) => {
    exactKeys(phaseLabel, phase, ["id", "label"]);
    return {
      id: identifier(`${phaseLabel}.id`, phase.id),
      label: nonemptyString(`${phaseLabel}.label`, phase.label),
    };
  }, { minimum: 1, uniqueBy: (phase) => phase.id, sortedBy: (phase) => phase.id });
  exactKeys(`${label}.protocol`, value.protocol,
    ["warmupRuns", "repetitions", "timeoutMilliseconds", "reset"]);
  const protocol = {
    warmupRuns: safeInteger(`${label}.protocol.warmupRuns`, value.protocol.warmupRuns),
    repetitions: safeInteger(`${label}.protocol.repetitions`, value.protocol.repetitions, 1),
    timeoutMilliseconds: safeInteger(
      `${label}.protocol.timeoutMilliseconds`, value.protocol.timeoutMilliseconds, 1,
    ),
    reset: enumeration(`${label}.protocol.reset`, value.protocol.reset,
      ["none", "evaluator", "process", "browser-context"]),
  };
  const normalized = {
    schema: value.schema,
    id: value.id,
    title: nonemptyString(`${label}.title`, value.title),
    class: enumeration(`${label}.class`, value.class,
      ["positive-control", "negative-control", "microbenchmark", "representative", "held-out"]),
    owner: nonemptyString(`${label}.owner`, value.owner),
    runner,
    input,
    corpus,
    oracles,
    phases,
    protocol,
    capabilities: stringArray(`${label}.capabilities`, value.capabilities, { identifiers: true }),
    targets: stringArray(`${label}.targets`, value.targets, { minimum: 1 }).map((target, index) =>
      enumeration(`${label}.targets[${index}]`, target, TARGETS)),
    modes: stringArray(`${label}.modes`, value.modes, { minimum: 1 }).map((mode, index) =>
      enumeration(`${label}.modes[${index}]`, mode, MODES)),
    platforms: stringArray(`${label}.platforms`, value.platforms, { minimum: 1 }).map(
      (platform, index) => enumeration(`${label}.platforms[${index}]`, platform, PLATFORMS),
    ),
  };
  return finish(label, value, normalized);
}

function validateWorkloadCatalog(value) {
  const label = "workload catalog";
  schemaHeader(label, value, SCHEMAS.workloadCatalog, ["workloads"]);
  const workloads = array(`${label}.workloads`, value.workloads,
    (workloadLabel, workload) => validateWorkload(workload), {
      minimum: 1,
      uniqueBy: (workload) => workload.id,
      sortedBy: (workload) => workload.id,
    });
  return finish(label, value, { schema: value.schema, id: value.id, workloads });
}

function validateProfileReceipt(value, context = {}) {
  const label = "profile";
  const registry = context.reasonRegistry || DEFAULT_REASON_REGISTRY;
  schemaHeader(label, value, SCHEMAS.profile, [
    "authority", "workload", "sourceBundle", "compiler", "artifact", "host", "capability",
    "configuration", "outcome", "output", "compilation", "execution", "phases",
    "sampling", "optimizer", "runtime", "counters", "resources", "overhead",
  ]);
  const authority = enumeration(`${label}.authority`, value.authority, [
    "host-collector-with-private-evaluator-evidence",
    "host-workload-runner-phase-only",
  ]);
  const workload = validateReference(`${label}.workload`, value.workload);
  const sourceBundle = validateSourceBundle(`${label}.sourceBundle`, value.sourceBundle);
  const compiler = validateCompiler(`${label}.compiler`, value.compiler);
  const artifact = validateArtifact(`${label}.artifact`, value.artifact);
  exactKeys(`${label}.host`, value.host, [
    "platform", "architecture", "runtime", "runtimeVersion", "engine", "engineVersion",
  ]);
  const host = {
    platform: nonemptyString(`${label}.host.platform`, value.host.platform),
    architecture: nonemptyString(`${label}.host.architecture`, value.host.architecture),
    runtime: enumeration(`${label}.host.runtime`, value.host.runtime,
      ["node", "browser"]),
    runtimeVersion: nonemptyString(`${label}.host.runtimeVersion`, value.host.runtimeVersion),
    engine: enumeration(`${label}.host.engine`, value.host.engine,
      ["v8", "chromium", "firefox", "webkit"]),
    engineVersion: nonemptyString(`${label}.host.engineVersion`, value.host.engineVersion),
  };
  exactKeys(`${label}.capability`, value.capability, ["runtime", "sourceSampling"]);
  const capability = {
    runtime: enumeration(`${label}.capability.runtime`, value.capability.runtime,
      ["node", "browser"]),
    sourceSampling: enumeration(`${label}.capability.sourceSampling`,
      value.capability.sourceSampling, ["inspector-position-ticks", "unavailable"]),
  };
  if ((host.runtime === "node") !== (capability.runtime === "node")) {
    fail(`${label}.capability.runtime`, "does not match the host runtime");
  }
  exactKeys(`${label}.configuration`, value.configuration,
    ["target", "mode", "capabilities", "environmentDigest"]);
  const configuration = {
    target: enumeration(`${label}.configuration.target`, value.configuration.target, TARGETS),
    mode: enumeration(`${label}.configuration.mode`, value.configuration.mode, MODES),
    capabilities: stringArray(`${label}.configuration.capabilities`,
      value.configuration.capabilities, { identifiers: true }),
    environmentDigest: digest(
      `${label}.configuration.environmentDigest`, value.configuration.environmentDigest,
    ),
  };
  exactKeys(`${label}.outcome`, value.outcome, ["status", "error"]);
  const outcome = {
    status: enumeration(`${label}.outcome.status`, value.outcome.status,
      ["success", "error", "timeout", "interrupted"]),
    error: optionalString(`${label}.outcome.error`, value.outcome.error),
  };
  if ((outcome.status === "success") !== (outcome.error === null)) {
    fail(`${label}.outcome`, "success requires null error and failure requires an error message");
  }
  exactKeys(`${label}.output`, value.output, ["digest", "oracleResults"]);
  const output = {
    digest: nullableDigest(`${label}.output.digest`, value.output.digest),
    oracleResults: array(`${label}.output.oracleResults`, value.output.oracleResults,
      (oracleLabel, oracle) => {
        exactKeys(oracleLabel, oracle, ["id", "status", "digest"]);
        return {
          id: identifier(`${oracleLabel}.id`, oracle.id),
          status: enumeration(`${oracleLabel}.status`, oracle.status,
            ["pass", "fail", "unavailable"]),
          digest: nullableDigest(`${oracleLabel}.digest`, oracle.digest),
        };
      }, { minimum: 1, uniqueBy: (oracle) => oracle.id, sortedBy: (oracle) => oracle.id }),
  };
  if (outcome.status === "success" && output.digest === null) {
    fail(`${label}.output.digest`, "successful execution requires an output digest");
  }
  exactKeys(`${label}.execution`, value.execution, ["cold", "warm"]);
  const execution = {
    cold: validateDistribution(`${label}.execution.cold`, value.execution.cold),
    warm: validateDistribution(`${label}.execution.warm`, value.execution.warm),
  };
  const phases = array(`${label}.phases`, value.phases, (phaseLabel, phase) => {
    exactKeys(phaseLabel, phase, ["id", "cold", "warm"]);
    return {
      id: identifier(`${phaseLabel}.id`, phase.id),
      cold: validateDistribution(`${phaseLabel}.cold`, phase.cold),
      warm: validateDistribution(`${phaseLabel}.warm`, phase.warm),
    };
  }, { uniqueBy: (phase) => phase.id, sortedBy: (phase) => phase.id });
  const samplingKeys = [
    "kind", "intervalMicroseconds", "rawProfileDigest", "timeDeltaMicroseconds", "scripts",
    "mapBindings", "functionSampleCounts", "functionSamples", "positionTickCounts", "positionTicks",
  ];
  if (value.sampling.kind === "v8-cpu") samplingKeys.push("protocol");
  exactKeys(`${label}.sampling`, value.sampling, samplingKeys);
  function mapping(mappingLabel, input, includeRegion) {
    exactKeys(mappingLabel, input, ["status", "candidates"]);
    const status = enumeration(`${mappingLabel}.status`, input.status,
      ["attributed", "ambiguous", "unmatched"]);
    const keys = includeRegion
      ? ["sourceUnitId", "functionId", "regionId", "path", "range", "confidence"]
      : ["sourceUnitId", "functionId", "path", "range", "confidence"];
    const candidates = array(`${mappingLabel}.candidates`, input.candidates,
      (candidateLabel, candidate) => {
        exactKeys(candidateLabel, candidate, keys);
        return {
          sourceUnitId: contentId(`${candidateLabel}.sourceUnitId`, candidate.sourceUnitId),
          functionId: contentId(`${candidateLabel}.functionId`, candidate.functionId),
          ...(includeRegion
            ? { regionId: contentId(`${candidateLabel}.regionId`, candidate.regionId) }
            : {}),
          path: repositoryPath(`${candidateLabel}.path`, candidate.path),
          range: validateRange(`${candidateLabel}.range`, candidate.range),
          confidence: finiteNumber(`${candidateLabel}.confidence`, candidate.confidence, 0, 1),
        };
      }, { uniqueBy: (candidate) => includeRegion ? candidate.regionId : candidate.functionId });
    if ((status === "attributed" && candidates.length !== 1) ||
        (status === "ambiguous" && candidates.length < 2) ||
        (status === "unmatched" && candidates.length !== 0)) {
      fail(mappingLabel, "candidate count does not match mapping status");
    }
    return { status, candidates };
  }
  const functionSamples = array(`${label}.sampling.functionSamples`,
    value.sampling.functionSamples, (sampleLabel, sample) => {
      exactKeys(sampleLabel, sample, ["nodeId", "samples", "generated", "mapping"]);
      exactKeys(`${sampleLabel}.generated`, sample.generated,
        ["scriptId", "url", "functionName", "line", "column"]);
      return {
        nodeId: safeInteger(`${sampleLabel}.nodeId`, sample.nodeId, 1),
        samples: safeInteger(`${sampleLabel}.samples`, sample.samples, 1),
        generated: {
          scriptId: nonemptyString(`${sampleLabel}.generated.scriptId`, sample.generated.scriptId),
          url: nonemptyString(`${sampleLabel}.generated.url`, sample.generated.url),
          functionName: nonemptyString(
            `${sampleLabel}.generated.functionName`, sample.generated.functionName,
          ),
          // The collector normalizes V8's zero-based call-frame position to one-based lines.
          line: safeInteger(`${sampleLabel}.generated.line`, sample.generated.line, 1),
          column: safeInteger(`${sampleLabel}.generated.column`, sample.generated.column),
        },
        mapping: mapping(`${sampleLabel}.mapping`, sample.mapping, false),
      };
    }, { uniqueBy: (sample) => sample.nodeId, sortedBy: (sample) => String(sample.nodeId).padStart(16, "0") });
  const positionTicks = array(`${label}.sampling.positionTicks`, value.sampling.positionTicks,
    (tickLabel, tick) => {
      exactKeys(tickLabel, tick,
        ["nodeId", "scriptId", "line", "ticks", "mapping"]);
      return {
        nodeId: safeInteger(`${tickLabel}.nodeId`, tick.nodeId, 1),
        scriptId: nonemptyString(`${tickLabel}.scriptId`, tick.scriptId),
        // V8 positionTicks.line is already one-based.
        line: safeInteger(`${tickLabel}.line`, tick.line, 1),
        ticks: safeInteger(`${tickLabel}.ticks`, tick.ticks, 1),
        mapping: mapping(`${tickLabel}.mapping`, tick.mapping, true),
      };
    });
  function counts(countLabel, input, observations, quantity) {
    exactKeys(countLabel, input, ["total", "attributed", "ambiguous", "unmatched"]);
    const expected = { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 };
    for (const observation of observations) {
      expected.total += observation[quantity];
      expected[observation.mapping.status] += observation[quantity];
    }
    for (const key of Object.keys(expected)) {
      safeInteger(`${countLabel}.${key}`, input[key]);
      if (input[key] !== expected[key]) fail(`${countLabel}.${key}`, `must be ${expected[key]}`);
    }
    return expected;
  }
  const samplingKind = enumeration(`${label}.sampling.kind`, value.sampling.kind,
    ["none", "v8-cpu", "node-allocation", "phase-only"]);
  const samplingScripts = array(`${label}.sampling.scripts`, value.sampling.scripts,
    (scriptLabel, script) => {
      exactKeys(scriptLabel, script, [
        "url", "sha256", "bytes", "authenticatedScriptIds", "rejectedSameUrlScriptIds",
      ]);
      return {
        url: nonemptyString(`${scriptLabel}.url`, script.url),
        sha256: digest(`${scriptLabel}.sha256`, script.sha256),
        bytes: safeInteger(`${scriptLabel}.bytes`, script.bytes),
        authenticatedScriptIds: stringArray(`${scriptLabel}.authenticatedScriptIds`,
          script.authenticatedScriptIds, { minimum: 1 }),
        rejectedSameUrlScriptIds: stringArray(`${scriptLabel}.rejectedSameUrlScriptIds`,
          script.rejectedSameUrlScriptIds),
      };
    }, { uniqueBy: (script) => script.url, sortedBy: (script) => script.url });
  const samplingMapBindings = array(`${label}.sampling.mapBindings`,
    value.sampling.mapBindings, (bindingLabel, binding) => {
      exactKeys(bindingLabel, binding,
        ["schema", "digest", "sourceUnitId", "generatedSha256"]);
      if (binding.schema !== "sagejs.optimizer-profile-map/v1") {
        fail(`${bindingLabel}.schema`, `unknown schema ${binding.schema}`);
      }
      return {
        schema: binding.schema,
        digest: digest(`${bindingLabel}.digest`, binding.digest),
        sourceUnitId: contentId(`${bindingLabel}.sourceUnitId`, binding.sourceUnitId),
        generatedSha256: digest(`${bindingLabel}.generatedSha256`, binding.generatedSha256),
      };
    }, { uniqueBy: (binding) => `${binding.sourceUnitId}:${binding.generatedSha256}` });
  let samplingProtocol;
  if (samplingKind === "v8-cpu") {
    exactKeys(`${label}.sampling.protocol`, value.sampling.protocol, [
      "scope", "preparationMicroseconds", "warmupRuns", "repetitions",
      "declaredArtifactCount", "authenticatedArtifactCount", "lateArtifactCount",
      "closureDigest",
    ]);
    const scope = enumeration(`${label}.sampling.protocol.scope`,
      value.sampling.protocol.scope, [
        "cold-generated-javascript-load-and-execution",
        "cold-generated-javascript-and-current-source-lazy-modules",
        "warm-prepared-sealed-generated-javascript-execution",
      ]);
    samplingProtocol = {
      scope,
      preparationMicroseconds: safeInteger(
        `${label}.sampling.protocol.preparationMicroseconds`,
        value.sampling.protocol.preparationMicroseconds,
      ),
      warmupRuns: safeInteger(
        `${label}.sampling.protocol.warmupRuns`, value.sampling.protocol.warmupRuns,
      ),
      repetitions: safeInteger(
        `${label}.sampling.protocol.repetitions`, value.sampling.protocol.repetitions, 1,
      ),
      declaredArtifactCount: safeInteger(
        `${label}.sampling.protocol.declaredArtifactCount`,
        value.sampling.protocol.declaredArtifactCount, 1,
      ),
      authenticatedArtifactCount: safeInteger(
        `${label}.sampling.protocol.authenticatedArtifactCount`,
        value.sampling.protocol.authenticatedArtifactCount, 1,
      ),
      lateArtifactCount: safeInteger(
        `${label}.sampling.protocol.lateArtifactCount`,
        value.sampling.protocol.lateArtifactCount,
      ),
      closureDigest: digest(
        `${label}.sampling.protocol.closureDigest`,
        value.sampling.protocol.closureDigest,
      ),
    };
    if (samplingProtocol.declaredArtifactCount !== samplingScripts.length ||
        samplingProtocol.authenticatedArtifactCount !== samplingScripts.length) {
      fail(`${label}.sampling.protocol`,
        "artifact counts must equal the authenticated script closure");
    }
    if (samplingProtocol.lateArtifactCount !== 0) {
      fail(`${label}.sampling.protocol.lateArtifactCount`,
        "must be zero for an authenticated profile receipt");
    }
    const expectedClosureDigest = sha256(canonicalJson({
      scripts: samplingScripts,
      mapBindings: samplingMapBindings,
    }));
    if (samplingProtocol.closureDigest !== expectedClosureDigest) {
      fail(`${label}.sampling.protocol.closureDigest`,
        `is stale; expected ${expectedClosureDigest}`);
    }
    const warm = scope === "warm-prepared-sealed-generated-javascript-execution";
    if (warm !== (samplingProtocol.warmupRuns >= 1) ||
        (!warm && (samplingProtocol.preparationMicroseconds !== 0 ||
          samplingProtocol.warmupRuns !== 0 ||
          samplingProtocol.repetitions !== 1))) {
      fail(`${label}.sampling.protocol`,
        "warm scope requires preparation and warmup; cold scope requires one unprepared run");
    }
  }
  const sampling = {
    kind: samplingKind,
    intervalMicroseconds: safeInteger(
      `${label}.sampling.intervalMicroseconds`, value.sampling.intervalMicroseconds,
    ),
    rawProfileDigest: nullableDigest(
      `${label}.sampling.rawProfileDigest`, value.sampling.rawProfileDigest,
    ),
    timeDeltaMicroseconds: safeInteger(
      `${label}.sampling.timeDeltaMicroseconds`, value.sampling.timeDeltaMicroseconds,
    ),
    scripts: samplingScripts,
    mapBindings: samplingMapBindings,
    ...(samplingProtocol === undefined ? {} : { protocol: samplingProtocol }),
    functionSampleCounts: counts(`${label}.sampling.functionSampleCounts`,
      value.sampling.functionSampleCounts, functionSamples, "samples"),
    functionSamples,
    positionTickCounts: counts(`${label}.sampling.positionTickCounts`,
      value.sampling.positionTickCounts, positionTicks, "ticks"),
    positionTicks,
  };
  if (sampling.kind === "v8-cpu" && sampling.rawProfileDigest === null) {
    fail(`${label}.sampling.rawProfileDigest`, "V8 CPU profiles require their raw profile digest");
  }
  const authenticatedScripts = new Map();
  const rejectedScripts = new Set();
  for (const script of sampling.scripts) {
    for (const scriptId of script.authenticatedScriptIds) {
      if (authenticatedScripts.has(scriptId) || rejectedScripts.has(scriptId)) {
        fail(`${label}.sampling.scripts`, `scriptId ${scriptId} is authenticated by multiple sources`);
      }
      authenticatedScripts.set(scriptId, script);
    }
    for (const scriptId of script.rejectedSameUrlScriptIds) {
      if (authenticatedScripts.has(scriptId) || rejectedScripts.has(scriptId)) {
        fail(`${label}.sampling.scripts`, `scriptId ${scriptId} is both authenticated and rejected`);
      }
      rejectedScripts.add(scriptId);
    }
  }
  for (const sample of sampling.functionSamples) {
    const script = authenticatedScripts.get(sample.generated.scriptId);
    if (sample.mapping.status !== "unmatched" && !script) {
      fail(`${label}.sampling.functionSamples`,
        `mapped scriptId ${sample.generated.scriptId} has no authenticated source bytes`);
    }
    if (rejectedScripts.has(sample.generated.scriptId) && sample.mapping.status !== "unmatched") {
      fail(`${label}.sampling.functionSamples`,
        `rejected scriptId ${sample.generated.scriptId} cannot carry a source mapping`);
    }
    if (script && sample.generated.url !== script.url) {
      fail(`${label}.sampling.functionSamples`,
        `scriptId ${sample.generated.scriptId} does not match generated URL`);
    }
  }
  for (const tick of sampling.positionTicks) {
    if (tick.mapping.status !== "unmatched" && !authenticatedScripts.has(tick.scriptId)) {
      fail(`${label}.sampling.positionTicks`,
        `mapped scriptId ${tick.scriptId} has no authenticated source bytes`);
    }
    if (rejectedScripts.has(tick.scriptId) && tick.mapping.status !== "unmatched") {
      fail(`${label}.sampling.positionTicks`,
        `rejected scriptId ${tick.scriptId} cannot carry a source mapping`);
    }
  }
  exactKeys(`${label}.optimizer`, value.optimizer, ["reportDigest", "regions"]);
  const optimizer = {
    reportDigest: digest(`${label}.optimizer.reportDigest`, value.optimizer.reportDigest),
    regions: array(`${label}.optimizer.regions`, value.optimizer.regions,
      (regionLabel, region) => {
        exactKeys(regionLabel, region,
          ["regionId", "decisionId", "legacyDecisionId", "passId", "selected", "reasons"]);
        return {
          regionId: contentId(`${regionLabel}.regionId`, region.regionId),
          decisionId: contentId(`${regionLabel}.decisionId`, region.decisionId),
          legacyDecisionId: optionalString(`${regionLabel}.legacyDecisionId`, region.legacyDecisionId),
          passId: stableName(`${regionLabel}.passId`, region.passId),
          selected: boolean(`${regionLabel}.selected`, region.selected),
          reasons: validateReasonList(`${regionLabel}.reasons`, region.reasons, registry),
        };
      }, { uniqueBy: (region) => region.decisionId, sortedBy: (region) => region.decisionId }),
  };
  exactKeys(`${label}.runtime`, value.runtime,
    ["authority", "routeEventCounts", "routeEvents"]);
  const routeEvents = array(`${label}.runtime.routeEvents`, value.runtime.routeEvents,
    (eventLabel, event) => {
      exactKeys(eventLabel, event,
        ["optimizerRegionId", "regionKind", "outcome", "count", "reason", "mapping"]);
      exactKeys(`${eventLabel}.mapping`, event.mapping, ["status", "candidates"]);
      const status = enumeration(`${eventLabel}.mapping.status`, event.mapping.status,
        ["attributed", "ambiguous", "unmatched"]);
      const candidates = array(`${eventLabel}.mapping.candidates`, event.mapping.candidates,
        (candidateLabel, candidate) => {
          exactKeys(candidateLabel, candidate, ["sourceUnitId", "functionId", "regionId"]);
          return {
            sourceUnitId: contentId(`${candidateLabel}.sourceUnitId`, candidate.sourceUnitId),
            functionId: contentId(`${candidateLabel}.functionId`, candidate.functionId),
            regionId: contentId(`${candidateLabel}.regionId`, candidate.regionId),
          };
        }, { uniqueBy: (candidate) => candidate.regionId });
      if ((status === "attributed" && candidates.length !== 1) ||
          (status === "ambiguous" && candidates.length < 2) ||
          (status === "unmatched" && candidates.length !== 0)) {
        fail(`${eventLabel}.mapping`, "candidate count does not match mapping status");
      }
      const outcome = enumeration(`${eventLabel}.outcome`, event.outcome, [
        "selected-static-entry", "guarded-fast", "guarded-fallback", "zero-trip",
        "completed", "error",
      ]);
      const reason = event.reason === null
        ? null : validateReason(event.reason, registry, `${eventLabel}.reason`);
      const guardedFailure = outcome === "guarded-fallback" || outcome === "error";
      if (guardedFailure !== (reason !== null)) {
        fail(`${eventLabel}.reason`,
          "is required exactly for guarded fallback or guard-error outcomes");
      }
      if (reason !== null && reason.code !== "telemetry.guard-failure") {
        fail(`${eventLabel}.reason.code`,
          "must be telemetry.guard-failure for guarded fallback or guard-error outcomes");
      }
      return {
        optimizerRegionId: nonemptyString(
          `${eventLabel}.optimizerRegionId`, event.optimizerRegionId,
        ),
        regionKind: stableName(`${eventLabel}.regionKind`, event.regionKind),
        outcome,
        count: safeInteger(`${eventLabel}.count`, event.count, 1),
        reason,
        mapping: { status, candidates },
      };
    });
  const routeCounts = (() => {
    exactKeys(`${label}.runtime.routeEventCounts`, value.runtime.routeEventCounts,
      ["total", "attributed", "ambiguous", "unmatched"]);
    const expected = { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 };
    for (const event of routeEvents) {
      expected.total += event.count;
      expected[event.mapping.status] += event.count;
    }
    for (const key of Object.keys(expected)) {
      safeInteger(`${label}.runtime.routeEventCounts.${key}`, value.runtime.routeEventCounts[key]);
      if (value.runtime.routeEventCounts[key] !== expected[key]) {
        fail(`${label}.runtime.routeEventCounts.${key}`, `must be ${expected[key]}`);
      }
    }
    return expected;
  })();
  const runtime = {
    authority: enumeration(`${label}.runtime.authority`, value.runtime.authority,
      ["private-evaluator-closure", "unavailable"]),
    routeEventCounts: routeCounts,
    routeEvents,
  };
  exactKeys(`${label}.resources`, value.resources, ["liveBefore", "liveAfter", "highWater"]);
  const resources = {
    liveBefore: safeInteger(`${label}.resources.liveBefore`, value.resources.liveBefore),
    liveAfter: safeInteger(`${label}.resources.liveAfter`, value.resources.liveAfter),
    highWater: safeInteger(`${label}.resources.highWater`, value.resources.highWater),
  };
  if (resources.highWater < resources.liveBefore || resources.highWater < resources.liveAfter) {
    fail(`${label}.resources.highWater`, "must be at least both live snapshots");
  }
  exactKeys(`${label}.overhead`, value.overhead, [
    "method", "samplingIntervalMicroseconds", "baselineRunsMicroseconds",
    "instrumentedRunsMicroseconds", "medianRatio", "reviewedMaximumRatio", "status",
  ]);
  const overheadBaseline = array(`${label}.overhead.baselineRunsMicroseconds`,
    value.overhead.baselineRunsMicroseconds,
    (sampleLabel, sample) => safeInteger(sampleLabel, sample, 1), { minimum: 3 });
  const overheadInstrumented = array(`${label}.overhead.instrumentedRunsMicroseconds`,
    value.overhead.instrumentedRunsMicroseconds,
    (sampleLabel, sample) => safeInteger(sampleLabel, sample, 1), { minimum: 3 });
  const median = (samples) => {
    const sorted = [...samples].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const expectedOverheadRatio = median(overheadInstrumented) / median(overheadBaseline);
  const overheadRatio = finiteNumber(`${label}.overhead.medianRatio`, value.overhead.medianRatio, 0);
  if (Math.abs(overheadRatio - expectedOverheadRatio) > Number.EPSILON * 8) {
    fail(`${label}.overhead.medianRatio`, `must be ${expectedOverheadRatio}`);
  }
  const overheadMaximum = finiteNumber(`${label}.overhead.reviewedMaximumRatio`,
    value.overhead.reviewedMaximumRatio, 1);
  const expectedOverheadStatus = overheadRatio <= overheadMaximum ? "pass" : "fail";
  if (value.overhead.status !== "unreviewed" && value.overhead.status !== expectedOverheadStatus) {
    fail(`${label}.overhead.status`, `must be ${expectedOverheadStatus} or unreviewed`);
  }
  const normalized = {
    schema: value.schema,
    id: value.id,
    authority,
    workload,
    sourceBundle,
    compiler,
    artifact,
    host,
    capability,
    configuration,
    outcome,
    output,
    compilation: validateDistribution(`${label}.compilation`, value.compilation),
    execution,
    phases,
    sampling,
    optimizer,
    runtime,
    counters: validateCounterSet(`${label}.counters`, value.counters),
    resources,
    overhead: {
      method: enumeration(`${label}.overhead.method`, value.overhead.method,
        ["paired-alternating"]),
      samplingIntervalMicroseconds: safeInteger(
        `${label}.overhead.samplingIntervalMicroseconds`,
        value.overhead.samplingIntervalMicroseconds,
      ),
      baselineRunsMicroseconds: overheadBaseline,
      instrumentedRunsMicroseconds: overheadInstrumented,
      medianRatio: overheadRatio,
      reviewedMaximumRatio: overheadMaximum,
      status: enumeration(`${label}.overhead.status`, value.overhead.status,
        ["pass", "fail", "unreviewed"]),
    },
  };
  if (authority === "host-workload-runner-phase-only") {
    if (sampling.kind !== "phase-only" || runtime.authority !== "unavailable" ||
        runtime.routeEventCounts.total !== 0) {
      fail(label, "phase-only authority cannot claim sampling or private runtime routes");
    }
  } else if (runtime.authority !== "private-evaluator-closure") {
    fail(`${label}.runtime.authority`, "private evaluator evidence requires its closure authority");
  }
  if (context.workloadId && workload.id !== context.workloadId) {
    fail(`${label}.workload.id`, "does not match the required workload");
  }
  for (const [field, actual] of [
    ["sourceBundleId", sourceBundle.id],
    ["compilerId", compiler.id],
    ["artifactId", artifact.id],
  ]) {
    if (context[field] && context[field] !== actual) fail(`${label}.${field}`, "is stale");
  }
  return finish(label, value, normalized);
}

function validateStaticDecision(label, value, registry) {
  exactKeys(label, value, ["decisionId", "passId", "status", "reasons"]);
  return {
    decisionId: contentId(`${label}.decisionId`, value.decisionId),
    passId: stableName(`${label}.passId`, value.passId),
    status: enumeration(`${label}.status`, value.status, ["selected", "rejected", "observed"]),
    reasons: validateReasonList(`${label}.reasons`, value.reasons, registry),
  };
}

function validateHotnessOverlay(value, context = {}) {
  const label = "overlay";
  const registry = context.reasonRegistry || DEFAULT_REASON_REGISTRY;
  schemaHeader(label, value, SCHEMAS.overlay,
    ["dashboard", "profiles", "opportunities", "joinPolicy", "regions", "unmatched", "summary"]);
  exactKeys(`${label}.dashboard`, value.dashboard,
    ["id", "digest", "sourceBundleId", "compilerId"]);
  const dashboard = {
    id: contentId(`${label}.dashboard.id`, value.dashboard.id),
    digest: digest(`${label}.dashboard.digest`, value.dashboard.digest),
    sourceBundleId: contentId(`${label}.dashboard.sourceBundleId`, value.dashboard.sourceBundleId),
    compilerId: contentId(`${label}.dashboard.compilerId`, value.dashboard.compilerId),
  };
  const profiles = array(`${label}.profiles`, value.profiles, (profileLabel, profile) => {
    exactKeys(profileLabel, profile, ["id", "workloadId", "status"]);
    return {
      id: contentId(`${profileLabel}.id`, profile.id),
      workloadId: contentId(`${profileLabel}.workloadId`, profile.workloadId),
      status: enumeration(`${profileLabel}.status`, profile.status, ["current", "historical"]),
    };
  }, { minimum: 1, uniqueBy: (profile) => profile.id, sortedBy: (profile) => profile.id });
  const opportunities = array(`${label}.opportunities`, value.opportunities,
    (opportunityLabel, opportunity) => {
      exactKeys(opportunityLabel, opportunity, [
        "id", "regionId", "workloadId", "decisionId", "passId", "status",
        "candidateScope", "hotChildRegionIds", "attributionProfileId",
      ]);
      return {
        id: contentId(`${opportunityLabel}.id`, opportunity.id),
        regionId: contentId(`${opportunityLabel}.regionId`, opportunity.regionId),
        workloadId: contentId(`${opportunityLabel}.workloadId`, opportunity.workloadId),
        decisionId: contentId(`${opportunityLabel}.decisionId`, opportunity.decisionId),
        passId: stableName(`${opportunityLabel}.passId`, opportunity.passId),
        status: enumeration(`${opportunityLabel}.status`, opportunity.status,
          ["eligible", "inconclusive", "rejected"]),
        candidateScope: enumeration(`${opportunityLabel}.candidateScope`,
          opportunity.candidateScope, ["fused-outer-region", "inner-loop-only"]),
        hotChildRegionIds: array(`${opportunityLabel}.hotChildRegionIds`,
          opportunity.hotChildRegionIds,
          (itemLabel, item) => contentId(itemLabel, item), {
            uniqueBy: (item) => item,
            sortedBy: (item) => item,
          }),
        attributionProfileId: contentId(`${opportunityLabel}.attributionProfileId`,
          opportunity.attributionProfileId),
      };
    }, { uniqueBy: (opportunity) => opportunity.id,
      sortedBy: (opportunity) => opportunity.id });
  exactKeys(`${label}.joinPolicy`, value.joinPolicy,
    ["minimumCoverage", "staleProfiles", "ambiguity"]);
  const joinPolicy = {
    minimumCoverage: finiteNumber(
      `${label}.joinPolicy.minimumCoverage`, value.joinPolicy.minimumCoverage, 0, 1,
    ),
    staleProfiles: enumeration(`${label}.joinPolicy.staleProfiles`, value.joinPolicy.staleProfiles,
      ["historical-only"]),
    ambiguity: enumeration(`${label}.joinPolicy.ambiguity`, value.joinPolicy.ambiguity,
      ["fail-closed"]),
  };
  const profileIds = new Set(profiles.map((profile) => profile.id));
  for (const [index, opportunity] of opportunities.entries()) {
    const profile = profiles.find((item) => item.id === opportunity.attributionProfileId);
    if (!profile) {
      fail(`${label}.opportunities[${index}].attributionProfileId`,
        "is not in overlay profiles");
    }
    if (profile.workloadId !== opportunity.workloadId) {
      fail(`${label}.opportunities[${index}].attributionProfileId`,
        "does not belong to the opportunity workload");
    }
    if (opportunity.candidateScope === "fused-outer-region" &&
      opportunity.hotChildRegionIds.length === 0) {
      fail(`${label}.opportunities[${index}].hotChildRegionIds`,
        "a fused scope requires an exact hot child");
    }
    if (opportunity.candidateScope === "inner-loop-only" &&
      opportunity.hotChildRegionIds.length !== 0) {
      fail(`${label}.opportunities[${index}].hotChildRegionIds`,
        "an inner-loop scope cannot cite hot children");
    }
  }
  const regions = array(`${label}.regions`, value.regions, (regionLabel, region) => {
    exactKeys(regionLabel, region, [
      "source", "loopId", "staticDecisions", "opportunityEvidenceIds",
      "opportunityDecisionIds",
      "observations", "runtimeRoutes",
      "classification", "recommendedAction", "eligibility", "ranking", "removableFraction",
    ]);
    const source = validateSource(`${regionLabel}.source`, region.source);
    const observations = array(`${regionLabel}.observations`, region.observations,
      (observationLabel, observation) => {
        exactKeys(observationLabel, observation, [
          "profileId", "workloadId", "entryCount", "inclusiveSamples", "exclusiveSamples",
          "wallFraction", "confidence",
        ]);
        const profileId = contentId(`${observationLabel}.profileId`, observation.profileId);
        if (!profileIds.has(profileId)) fail(`${observationLabel}.profileId`, "is not in overlay profiles");
        return {
          profileId,
          workloadId: contentId(`${observationLabel}.workloadId`, observation.workloadId),
          entryCount: safeInteger(`${observationLabel}.entryCount`, observation.entryCount),
          inclusiveSamples: safeInteger(`${observationLabel}.inclusiveSamples`, observation.inclusiveSamples),
          exclusiveSamples: safeInteger(`${observationLabel}.exclusiveSamples`, observation.exclusiveSamples),
          wallFraction: finiteNumber(`${observationLabel}.wallFraction`, observation.wallFraction, 0, 1),
          confidence: finiteNumber(`${observationLabel}.confidence`, observation.confidence, 0, 1),
        };
      }, { uniqueBy: (observation) => `${observation.profileId}:${observation.workloadId}` });
    const runtimeRoutes = array(`${regionLabel}.runtimeRoutes`, region.runtimeRoutes,
      (routeLabel, route) => {
        exactKeys(routeLabel, route,
          ["profileId", "target", "optimizedEntries", "fallbackEntries", "errorEntries"]);
        const profileId = contentId(`${routeLabel}.profileId`, route.profileId);
        if (!profileIds.has(profileId)) fail(`${routeLabel}.profileId`, "is not in overlay profiles");
        return {
          profileId,
          target: enumeration(`${routeLabel}.target`, route.target, TARGETS),
          optimizedEntries: safeInteger(`${routeLabel}.optimizedEntries`, route.optimizedEntries),
          fallbackEntries: safeInteger(`${routeLabel}.fallbackEntries`, route.fallbackEntries),
          errorEntries: safeInteger(`${routeLabel}.errorEntries`, route.errorEntries),
        };
      }, { uniqueBy: (route) => `${route.profileId}:${route.target}` });
    exactKeys(`${regionLabel}.eligibility`, region.eligibility, ["status", "reasons"]);
    const eligibility = {
      status: enumeration(`${regionLabel}.eligibility.status`, region.eligibility.status,
        ["eligible", "ineligible", "stale", "ambiguous"]),
      reasons: validateReasonList(`${regionLabel}.eligibility.reasons`,
        region.eligibility.reasons, registry),
    };
    if ((eligibility.status === "eligible") !== (eligibility.reasons.length === 0)) {
      fail(`${regionLabel}.eligibility`,
        "eligible regions require no reasons and every ineligible state requires a stable reason");
    }
    exactKeys(`${regionLabel}.ranking`, region.ranking, [
      "removableWallLower", "affectedWorkloads", "nearMissDistance", "generality",
      "existingComponents", "semanticRisk", "compilationCost", "evidenceQuality",
    ]);
    const ranking = Object.fromEntries(Object.entries(region.ranking).map(([key, item]) =>
      [key, finiteNumber(`${regionLabel}.ranking.${key}`, item, 0)]));
    exactKeys(`${regionLabel}.removableFraction`, region.removableFraction, ["lower", "upper"]);
    const removableFraction = {
      lower: finiteNumber(`${regionLabel}.removableFraction.lower`,
        region.removableFraction.lower, 0, 1),
      upper: finiteNumber(`${regionLabel}.removableFraction.upper`,
        region.removableFraction.upper, 0, 1),
    };
    if (removableFraction.lower > removableFraction.upper) {
      fail(`${regionLabel}.removableFraction`, "lower must not exceed upper");
    }
    const staticDecisions = array(`${regionLabel}.staticDecisions`, region.staticDecisions,
      (decisionLabel, decision) => validateStaticDecision(decisionLabel, decision, registry),
      { uniqueBy: (decision) => decision.decisionId,
        sortedBy: (decision) => decision.decisionId });
    const regionOpportunities = opportunities.filter((opportunity) =>
      opportunity.regionId === source.regionId);
    const opportunityEvidenceIds = stringArray(
      `${regionLabel}.opportunityEvidenceIds`, region.opportunityEvidenceIds,
    ).map((item, index) => {
      const id = contentId(`${regionLabel}.opportunityEvidenceIds[${index}]`, item);
      if (!regionOpportunities.some((opportunity) => opportunity.id === id)) {
        fail(`${regionLabel}.opportunityEvidenceIds[${index}]`,
          "is not an overlay opportunity for this region");
      }
      return id;
    });
    const opportunityDecisionIds = stringArray(
      `${regionLabel}.opportunityDecisionIds`, region.opportunityDecisionIds,
    ).map((item, index) => {
      const id = contentId(`${regionLabel}.opportunityDecisionIds[${index}]`, item);
      const matches = regionOpportunities.filter((opportunity) =>
        opportunity.decisionId === id);
      if (matches.length === 0 || !staticDecisions.some((decision) =>
        decision.decisionId === id &&
        matches.some((opportunity) => opportunity.passId === decision.passId))) {
        fail(`${regionLabel}.opportunityDecisionIds[${index}]`,
          "is not an exact current static decision bound by an opportunity for this region");
      }
      return id;
    });
    if (opportunityEvidenceIds.length !== regionOpportunities.length ||
      opportunityDecisionIds.length !== new Set(
        regionOpportunities.map((opportunity) => opportunity.decisionId),
      ).size) {
      fail(regionLabel, "must retain every opportunity and reviewed compiler decision for its region");
    }
    return {
      source,
      loopId: contentId(`${regionLabel}.loopId`, region.loopId),
      staticDecisions,
      opportunityEvidenceIds,
      opportunityDecisionIds,
      observations,
      runtimeRoutes,
      classification: enumeration(`${regionLabel}.classification`, region.classification, [
        "algorithmic", "repeated-proof-state", "representation", "dynamic-dispatch-coercion",
        "boundary-dominated", "allocation-materialization", "compiler-rejection",
        "target-mismatch", "cold-startup-dominated", "unknown",
      ]),
      recommendedAction: enumeration(`${regionLabel}.recommendedAction`,
        region.recommendedAction, [
          "already-optimized", "reject", "investigate", "algorithm-work", "compiler-campaign",
        ]),
      eligibility,
      ranking,
      removableFraction,
    };
  }, { uniqueBy: (region) => region.source.regionId, sortedBy: (region) => region.source.regionId });
  const unmatched = array(`${label}.unmatched`, value.unmatched, (itemLabel, item) => {
    exactKeys(itemLabel, item, ["profileId", "reason", "count"]);
    const profileId = contentId(`${itemLabel}.profileId`, item.profileId);
    if (!profileIds.has(profileId)) fail(`${itemLabel}.profileId`, "is not in overlay profiles");
    return {
      profileId,
      reason: validateReason(item.reason, registry, `${itemLabel}.reason`),
      count: safeInteger(`${itemLabel}.count`, item.count, 1),
    };
  });
  exactKeys(`${label}.summary`, value.summary,
    ["currentProfiles", "historicalProfiles", "eligibleRegions", "staleRegions", "ambiguousRegions"]);
  const expectedSummary = {
    currentProfiles: profiles.filter((profile) => profile.status === "current").length,
    historicalProfiles: profiles.filter((profile) => profile.status === "historical").length,
    eligibleRegions: regions.filter((region) => region.eligibility.status === "eligible").length,
    staleRegions: regions.filter((region) => region.eligibility.status === "stale").length,
    ambiguousRegions: regions.filter((region) => region.eligibility.status === "ambiguous").length,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    safeInteger(`${label}.summary.${key}`, value.summary[key]);
    if (value.summary[key] !== expected) fail(`${label}.summary.${key}`, `must be ${expected}`);
  }
  const normalized = {
    schema: value.schema, id: value.id, dashboard, profiles, opportunities, joinPolicy, regions,
    unmatched, summary: expectedSummary,
  };
  if (context.dashboardId && dashboard.id !== context.dashboardId) {
    fail(`${label}.dashboard.id`, "does not match current dashboard");
  }
  return finish(label, value, normalized);
}

function validateFact(label, value) {
  exactKeys(label, value, ["kind", "authority", "evidence"]);
  return {
    kind: nonemptyString(`${label}.kind`, value.kind),
    authority: enumeration(`${label}.authority`, value.authority,
      ["static", "runtime-guard", "contract", "observation"]),
    evidence: nonemptyString(`${label}.evidence`, value.evidence),
  };
}

function validateDossier(value, context = {}) {
  const label = "dossier";
  const registry = context.reasonRegistry || DEFAULT_REASON_REGISTRY;
  schemaHeader(label, value, SCHEMAS.dossier, [
    "status", "classification", "recommendedAction", "source", "evidence", "excerpt",
    "currentIr", "facts", "rejections",
    "costs", "candidates", "unresolvedProofs", "suggestedContract", "witness", "oracles",
    "adversarialObligations", "benchmarkObligations", "generality", "negativeEvidence",
    "claims", "integration", "promotionCriteria",
  ]);
  const source = validateSource(`${label}.source`, value.source);
  exactKeys(`${label}.evidence`, value.evidence,
    ["dashboardId", "overlayId", "profileIds", "opportunityEvidenceIds"]);
  const evidence = {
    dashboardId: contentId(`${label}.evidence.dashboardId`, value.evidence.dashboardId),
    overlayId: contentId(`${label}.evidence.overlayId`, value.evidence.overlayId),
    profileIds: stringArray(`${label}.evidence.profileIds`, value.evidence.profileIds,
      { minimum: 1 }).map((item, index) => contentId(`${label}.evidence.profileIds[${index}]`, item)),
    opportunityEvidenceIds: stringArray(`${label}.evidence.opportunityEvidenceIds`,
      value.evidence.opportunityEvidenceIds).map((item, index) =>
      contentId(`${label}.evidence.opportunityEvidenceIds[${index}]`, item)),
  };
  exactKeys(`${label}.excerpt`, value.excerpt, ["text", "digest"]);
  const excerpt = {
    text: nonemptyString(`${label}.excerpt.text`, value.excerpt.text),
    digest: digest(`${label}.excerpt.digest`, value.excerpt.digest),
  };
  if (excerpt.digest !== sha256(excerpt.text)) {
    fail(`${label}.excerpt.digest`, "does not match excerpt text");
  }
  exactKeys(`${label}.currentIr`, value.currentIr, [
    "reportDigest", "program", "decisionId", "legacyDecisionId", "passId", "selected", "decision",
  ]);
  const program = validateJsonValue(`${label}.currentIr.program`, value.currentIr.program);
  const decisionIr = validateJsonValue(`${label}.currentIr.decision`, value.currentIr.decision);
  record(`${label}.currentIr.program`, program);
  record(`${label}.currentIr.decision`, decisionIr);
  if (program.schema !== "sagejs.optimizing-mathematics/v1" || !Array.isArray(program.regions)) {
    fail(`${label}.currentIr.program`, "must be a complete optimizing-mathematics/v1 program");
  }
  const currentIr = {
    reportDigest: digest(`${label}.currentIr.reportDigest`, value.currentIr.reportDigest),
    program,
    decisionId: contentId(`${label}.currentIr.decisionId`, value.currentIr.decisionId),
    legacyDecisionId: nonemptyString(
      `${label}.currentIr.legacyDecisionId`, value.currentIr.legacyDecisionId,
    ),
    passId: stableName(`${label}.currentIr.passId`, value.currentIr.passId),
    selected: boolean(`${label}.currentIr.selected`, value.currentIr.selected),
    decision: decisionIr,
  };
  if (currentIr.reportDigest !== sha256(canonicalJson(program))) {
    fail(`${label}.currentIr.reportDigest`, "does not match the complete optimizer program");
  }
  const matchingIr = program.regions.filter((region) =>
    region && typeof region === "object" && region.id === currentIr.legacyDecisionId);
  if (matchingIr.length !== 1 || canonicalJson(matchingIr[0]) !== canonicalJson(decisionIr)) {
    fail(`${label}.currentIr.decision`, "must exactly match one region in the complete optimizer program");
  }
  if (decisionIr.passId !== currentIr.passId || decisionIr.selected !== currentIr.selected) {
    fail(`${label}.currentIr`, "copied pass and selection do not match the optimizer decision");
  }
  exactKeys(`${label}.facts`, value.facts, ["proven", "guarded", "unknown", "invalidated"]);
  const facts = Object.fromEntries(Object.entries(value.facts).map(([key, items]) => [
    key,
    array(`${label}.facts.${key}`, items, validateFact,
      { uniqueBy: (fact) => `${fact.kind}:${fact.authority}` }),
  ]));
  const rejections = validateReasonList(`${label}.rejections`, value.rejections, registry);
  exactKeys(`${label}.costs`, value.costs,
    ["estimated", "observed", "dominant"]);
  const costs = {
    estimated: validateCounterSet(`${label}.costs.estimated`, value.costs.estimated),
    observed: validateCounterSet(`${label}.costs.observed`, value.costs.observed),
    dominant: enumeration(`${label}.costs.dominant`, value.costs.dominant,
      ["arithmetic", "conversion", "boundary", "copy", "allocation", "materialization", "unknown"]),
  };
  const candidates = array(`${label}.candidates`, value.candidates, (candidateLabel, candidate) => {
    exactKeys(candidateLabel, candidate,
      ["id", "target", "representation", "status", "reason", "inclusiveEvidence"]);
    return {
      id: identifier(`${candidateLabel}.id`, candidate.id),
      target: enumeration(`${candidateLabel}.target`, candidate.target, TARGETS),
      representation: nonemptyString(`${candidateLabel}.representation`, candidate.representation),
      status: enumeration(`${candidateLabel}.status`, candidate.status,
        ["selected", "available", "runtime-gated", "rejected", "unmeasured"]),
      reason: candidate.reason === null
        ? null : validateReason(candidate.reason, registry, `${candidateLabel}.reason`),
      inclusiveEvidence: optionalString(
        `${candidateLabel}.inclusiveEvidence`, candidate.inclusiveEvidence,
      ),
    };
  }, { minimum: 1, uniqueBy: (candidate) => candidate.id, sortedBy: (candidate) => candidate.id });
  exactKeys(`${label}.suggestedContract`, value.suggestedContract,
    ["requiredPassId", "coverage", "target", "guardFailure"]);
  const suggestedContract = {
    requiredPassId: stableName(
      `${label}.suggestedContract.requiredPassId`, value.suggestedContract.requiredPassId,
    ),
    coverage: enumeration(`${label}.suggestedContract.coverage`, value.suggestedContract.coverage,
      ["at-least-one", "all-loops"]),
    target: enumeration(`${label}.suggestedContract.target`, value.suggestedContract.target,
      ["auto", ...TARGETS]),
    guardFailure: enumeration(
      `${label}.suggestedContract.guardFailure`, value.suggestedContract.guardFailure,
      ["fallback", "error"],
    ),
  };
  exactKeys(`${label}.witness`, value.witness, ["path", "digest"]);
  exactKeys(`${label}.integration`, value.integration, ["sharedFiles", "owner"]);
  exactKeys(`${label}.promotionCriteria`, value.promotionCriteria,
    ["minimumEndToEndImprovement", "minimumPhaseImprovement", "maximumRegression"]);
  const normalized = {
    schema: value.schema,
    id: value.id,
    status: enumeration(`${label}.status`, value.status,
      ["draft", "measured", "approved", "rejected", "stale"]),
    classification: enumeration(`${label}.classification`, value.classification, [
      "algorithmic", "repeated-proof-state", "representation", "dynamic-dispatch-coercion",
      "boundary-dominated", "allocation-materialization", "compiler-rejection",
      "target-mismatch", "cold-startup-dominated", "unknown",
    ]),
    recommendedAction: enumeration(`${label}.recommendedAction`, value.recommendedAction, [
      "already-optimized", "reject", "investigate", "algorithm-work", "compiler-campaign",
    ]),
    source,
    evidence,
    excerpt,
    currentIr,
    facts,
    rejections,
    costs,
    candidates,
    unresolvedProofs: stringArray(`${label}.unresolvedProofs`, value.unresolvedProofs),
    suggestedContract,
    witness: {
      path: repositoryPath(`${label}.witness.path`, value.witness.path),
      digest: digest(`${label}.witness.digest`, value.witness.digest),
    },
    oracles: stringArray(`${label}.oracles`, value.oracles, { minimum: 1 }),
    adversarialObligations: stringArray(`${label}.adversarialObligations`,
      value.adversarialObligations),
    benchmarkObligations: stringArray(`${label}.benchmarkObligations`,
      value.benchmarkObligations, { minimum: 1 }),
    generality: stringArray(`${label}.generality`, value.generality, { minimum: 1 }),
    negativeEvidence: stringArray(`${label}.negativeEvidence`, value.negativeEvidence),
    claims: stringArray(`${label}.claims`, value.claims, { minimum: 1 }).map(
      (claim, index) => repositoryPath(`${label}.claims[${index}]`, claim),
    ),
    integration: {
      sharedFiles: stringArray(`${label}.integration.sharedFiles`,
        value.integration.sharedFiles).map((file, index) =>
          repositoryPath(`${label}.integration.sharedFiles[${index}]`, file)),
      owner: nonemptyString(`${label}.integration.owner`, value.integration.owner),
    },
    promotionCriteria: {
      minimumEndToEndImprovement: finiteNumber(
        `${label}.promotionCriteria.minimumEndToEndImprovement`,
        value.promotionCriteria.minimumEndToEndImprovement, 0, 1,
      ),
      minimumPhaseImprovement: finiteNumber(
        `${label}.promotionCriteria.minimumPhaseImprovement`,
        value.promotionCriteria.minimumPhaseImprovement, 0, 1,
      ),
      maximumRegression: finiteNumber(`${label}.promotionCriteria.maximumRegression`,
        value.promotionCriteria.maximumRegression, 0, 1),
    },
  };
  if (context.overlayId && evidence.overlayId !== context.overlayId) {
    fail(`${label}.evidence.overlayId`, "does not match the verified overlay");
  }
  if (context.compilerDecision) {
    const expected = context.compilerDecision;
    for (const field of ["decisionId", "passId", "selected"]) {
      if (currentIr[field] !== expected[field]) {
        fail(`${label}.currentIr.${field}`, "does not match verified compiler IR");
      }
    }
  }
  return finish(label, value, normalized);
}

function validateCampaign(value, context = {}) {
  const label = "campaign";
  schemaHeader(label, value, SCHEMAS.campaign, [
    "status", "baseCommit", "dossier", "hypothesis", "selectionEvidence", "interfaces",
    "targets", "lanes", "dependencies", "oracles", "acceptance", "platforms", "evidencePolicy",
  ]);
  if (!/^[0-9a-f]{40}$/.test(value.baseCommit)) fail(`${label}.baseCommit`, "must be a Git commit");
  const dossier = validateReference(`${label}.dossier`, value.dossier);
  const interfaces = array(`${label}.interfaces`, value.interfaces, (interfaceLabel, item) => {
    exactKeys(interfaceLabel, item, ["name", "schema", "digest", "owner"]);
    return {
      name: identifier(`${interfaceLabel}.name`, item.name),
      schema: nonemptyString(`${interfaceLabel}.schema`, item.schema),
      digest: digest(`${interfaceLabel}.digest`, item.digest),
      owner: identifier(`${interfaceLabel}.owner`, item.owner),
    };
  }, { minimum: 1, uniqueBy: (item) => item.name, sortedBy: (item) => item.name });
  const lanes = array(`${label}.lanes`, value.lanes, (laneLabel, lane) => {
    exactKeys(laneLabel, lane,
      ["id", "role", "claims", "dependencies", "task", "deliverables"]);
    exactKeys(`${laneLabel}.task`, lane.task,
      ["id", "branch", "contractPath", "parallelNewArgs"]);
    return {
      id: identifier(`${laneLabel}.id`, lane.id),
      role: enumeration(`${laneLabel}.role`, lane.role, [
        "workload", "semantic-proof", "representation", "target", "verifier",
        "differential-evidence", "integration",
      ]),
      claims: stringArray(`${laneLabel}.claims`, lane.claims, { minimum: 1 }).map(
        (claim, index) => repositoryPath(`${laneLabel}.claims[${index}]`, claim),
      ),
      dependencies: stringArray(`${laneLabel}.dependencies`, lane.dependencies,
        { identifiers: true }),
      task: {
        id: identifier(`${laneLabel}.task.id`, lane.task.id),
        branch: nonemptyString(`${laneLabel}.task.branch`, lane.task.branch),
        contractPath: repositoryPath(`${laneLabel}.task.contractPath`, lane.task.contractPath),
        parallelNewArgs: stringArray(`${laneLabel}.task.parallelNewArgs`,
          lane.task.parallelNewArgs, { sorted: false, unique: false }),
      },
      deliverables: stringArray(`${laneLabel}.deliverables`, lane.deliverables, { minimum: 1 }),
    };
  }, { minimum: 1, uniqueBy: (lane) => lane.id, sortedBy: (lane) => lane.id });
  const laneIds = new Set(lanes.map((lane) => lane.id));
  const claims = new Map();
  for (const lane of lanes) {
    for (const claim of lane.claims) {
      if (claims.has(claim)) fail(`${label}.lanes`, `claim ${claim} is shared by ${claims.get(claim)} and ${lane.id}`);
      claims.set(claim, lane.id);
    }
    for (const dependency of lane.dependencies) {
      if (!laneIds.has(dependency)) fail(`${label}.lanes.${lane.id}.dependencies`, `unknown lane ${dependency}`);
      if (dependency === lane.id) fail(`${label}.lanes.${lane.id}.dependencies`, "cannot depend on itself");
    }
  }
  exactKeys(`${label}.acceptance`, value.acceptance,
    ["minimumEndToEndImprovement", "minimumPhaseImprovement", "maximumRegression", "requiredConsumers"]);
  exactKeys(`${label}.evidencePolicy`, value.evidencePolicy, ["id", "digest"]);
  const normalized = {
    schema: value.schema,
    id: value.id,
    status: enumeration(`${label}.status`, value.status,
      ["proposed", "approved", "active", "review", "accepted", "rejected"]),
    baseCommit: value.baseCommit,
    dossier,
    hypothesis: nonemptyString(`${label}.hypothesis`, value.hypothesis),
    selectionEvidence: stringArray(`${label}.selectionEvidence`, value.selectionEvidence,
      { minimum: 1 }),
    interfaces,
    targets: stringArray(`${label}.targets`, value.targets, { minimum: 1 }).map(
      (target, index) => enumeration(`${label}.targets[${index}]`, target, TARGETS),
    ),
    lanes,
    dependencies: stringArray(`${label}.dependencies`, value.dependencies),
    oracles: stringArray(`${label}.oracles`, value.oracles, { minimum: 1 }),
    acceptance: {
      minimumEndToEndImprovement: finiteNumber(
        `${label}.acceptance.minimumEndToEndImprovement`,
        value.acceptance.minimumEndToEndImprovement, 0, 1,
      ),
      minimumPhaseImprovement: finiteNumber(
        `${label}.acceptance.minimumPhaseImprovement`,
        value.acceptance.minimumPhaseImprovement, 0, 1,
      ),
      maximumRegression: finiteNumber(`${label}.acceptance.maximumRegression`,
        value.acceptance.maximumRegression, 0, 1),
      requiredConsumers: safeInteger(
        `${label}.acceptance.requiredConsumers`, value.acceptance.requiredConsumers, 1,
      ),
    },
    platforms: stringArray(`${label}.platforms`, value.platforms, { minimum: 1 }).map(
      (platform, index) => enumeration(`${label}.platforms[${index}]`, platform, PLATFORMS),
    ),
    evidencePolicy: {
      id: identifier(`${label}.evidencePolicy.id`, value.evidencePolicy.id),
      digest: digest(`${label}.evidencePolicy.digest`, value.evidencePolicy.digest),
    },
  };
  if (context.dossierId && dossier.id !== context.dossierId) {
    fail(`${label}.dossier.id`, "does not match the approved dossier");
  }
  return finish(label, value, normalized);
}

function medianNumber(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deterministicRandom(seedDigest) {
  let state = BigInt(`0x${seedDigest.slice(0, 16)}`) || 1n;
  const mask = (1n << 64n) - 1n;
  return (limit) => {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= mask;
    return Number(state % BigInt(limit));
  };
}

function computeComparisonStatistics(pairs, policy, salt) {
  const ratios = pairs.map((pair) => pair.baseline / pair.candidate);
  const medianSpeedup = medianNumber(ratios);
  const randomIndex = deterministicRandom(sha256(`${policy.bootstrapSeedDigest}:${salt}`));
  const bootstrap = [];
  for (let iteration = 0; iteration < policy.bootstrapResamples; iteration += 1) {
    const sample = [];
    for (let index = 0; index < ratios.length; index += 1) {
      sample.push(ratios[randomIndex(ratios.length)]);
    }
    bootstrap.push(medianNumber(sample));
  }
  bootstrap.sort((left, right) => left - right);
  const tail = (1 - policy.confidence) / 2;
  const lowerIndex = Math.max(0, Math.floor(tail * bootstrap.length));
  const upperIndex = Math.min(bootstrap.length - 1,
    Math.ceil((1 - tail) * bootstrap.length) - 1);
  return {
    medianSpeedup,
    confidenceLower: bootstrap[lowerIndex],
    confidenceUpper: bootstrap[upperIndex],
  };
}

function validateComparison(label, value, policy, seedSalt = label) {
  exactKeys(label, value, [
    "unit", "pairs", "method", "medianSpeedup", "confidenceLower", "confidenceUpper",
    "inclusive",
  ]);
  const unit = enumeration(`${label}.unit`, value.unit, ["microseconds", "nanoseconds"]);
  const pairs = array(`${label}.pairs`, value.pairs, (pairLabel, pair) => {
    exactKeys(pairLabel, pair, ["order", "baseline", "candidate"]);
    return {
      order: enumeration(`${pairLabel}.order`, pair.order, ["AB", "BA"]),
      baseline: safeInteger(`${pairLabel}.baseline`, pair.baseline, 1),
      candidate: safeInteger(`${pairLabel}.candidate`, pair.candidate, 1),
    };
  }, { minimum: policy.minPairs });
  const pattern = ["AB", "BA", "BA", "AB"];
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].order !== pattern[index % pattern.length]) {
      fail(`${label}.pairs[${index}].order`, `must follow repeating ABBA pairing (${pattern[index % 4]})`);
    }
  }
  const expected = computeComparisonStatistics(pairs, policy, seedSalt);
  for (const key of Object.keys(expected)) {
    const actual = finiteNumber(`${label}.${key}`, value[key], 0);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(expected[key])) * 16;
    if (Math.abs(actual - expected[key]) > tolerance) {
      fail(`${label}.${key}`, `does not match paired bootstrap; expected ${expected[key]}`);
    }
  }
  return {
    unit,
    method: enumeration(`${label}.method`, value.method,
      ["paired-bootstrap-median-speedup-v1"]),
    pairs,
    ...expected,
    inclusive: boolean(`${label}.inclusive`, value.inclusive),
  };
}

function validateStatusEvidence(label, value, allowed = ["pass", "fail", "unavailable"]) {
  exactKeys(label, value, ["id", "status", "evidenceId"]);
  return {
    id: identifier(`${label}.id`, value.id),
    status: enumeration(`${label}.status`, value.status, allowed),
    evidenceId: contentId(`${label}.evidenceId`, value.evidenceId),
  };
}

function promotionDecision(document, bindings = {
  checkout: "missing", build: "missing", artifact: "missing", evidence: "missing", browsers: [],
}) {
  const reasons = [];
  let inconclusive = false;
  let rejected = false;
  const reject = (reason) => {
    reasons.push(reason);
    rejected = true;
  };
  const unknown = (reason) => {
    reasons.push(reason);
    inconclusive = true;
  };
  for (const name of ["checkout", "build", "artifact", "evidence"]) {
    const state = bindings[name] ?? "missing";
    if (state === "missing") unknown(`binding.${name}-unverified`);
    if (state === "mismatch") reject(`binding.${name}-mismatch`);
  }
  if (!document.candidate.clean) reject("promotion.candidate-dirty");
  for (const item of [...document.correctness, ...document.adversarial]) {
    if (item.status === "fail") reject(`promotion.failed-evidence.${item.id}`);
    if (item.status === "unavailable") unknown(`promotion.unavailable-evidence.${item.id}`);
  }
  for (const route of document.routes) {
    if (route.status === "unavailable") {
      unknown(`promotion.route-unavailable.${route.id}`);
    } else if (route.status !== "pass" || !route.runtimeAuthenticated ||
        route.o0Selected || !route.o2Selected || route.guardFallback !== "pass") {
      reject(`promotion.route-failed.${route.id}`);
    }
  }
  const exceptionKeys = new Set(document.baselineExceptions.map((item) =>
    [item.test, item.platform, item.fingerprint, item.id].join("\u0000")));
  const usedExceptions = new Set();
  for (const platform of document.platforms) {
    if (platform.availability === "unavailable") unknown(`promotion.platform-unavailable.${platform.id}`);
    for (const failure of platform.failures) {
      const key = [failure.test, platform.id, failure.fingerprint, failure.exceptionId].join("\u0000");
      if (failure.exceptionId !== null && exceptionKeys.has(key)) usedExceptions.add(key);
      else reject(`promotion.new-platform-failure.${platform.id}.${failure.test}`);
    }
  }
  for (const key of exceptionKeys) {
    if (!usedExceptions.has(key)) reject("promotion.unused-baseline-exception");
  }
  for (const browser of document.browsers) {
    if (browser.availability === "unavailable") {
      unknown(`promotion.browser-unavailable.${browser.engine}`);
    }
    if (!bindings.browsers.includes(browser.engine)) {
      unknown(`binding.browser-unverified.${browser.engine}`);
    }
  }
  for (const resource of document.resources) {
    for (const ceiling of resource.ceilings) {
      if (ceiling.observed !== null && ceiling.observed > ceiling.limit) {
        reject(`promotion.resource-ceiling.${resource.id}.${ceiling.metric}`);
      }
      if (ceiling.observed === null) {
        unknown(`promotion.resource-unavailable.${resource.id}.${ceiling.metric}`);
      }
    }
  }
  for (const neighbor of document.neighboring) {
    const permittedSpeedup = 1 / (1 + document.policy.maximumRegression);
    if (neighbor.comparison.confidenceUpper < permittedSpeedup) {
      reject(`promotion.neighbor-regression.${neighbor.workloadId}`);
    } else if (neighbor.comparison.confidenceLower < permittedSpeedup) {
      unknown(`promotion.neighbor-inconclusive.${neighbor.workloadId}`);
    }
  }
  const losingByTarget = new Map(document.losingCandidates.map((item) => [item.target, item]));
  for (const target of document.policy.requiredTargets) {
    const candidate = losingByTarget.get(target);
    if (!candidate) reject(`promotion.missing-losing-candidate.${target}`);
    else if (candidate.status !== "measured-slower") {
      unknown(`promotion.losing-candidate-inconclusive.${target}`);
    }
  }
  const e2e = document.performance.endToEnd;
  const endToEndThreshold = 1 / (1 - document.policy.minimumEndToEndImprovement);
  const direct = document.performance.endToEnd.inclusive &&
    e2e.confidenceLower > 1 && e2e.medianSpeedup >= endToEndThreshold;
  let phase = false;
  if (document.performance.phase !== null) {
    const phaseStats = document.performance.phase.comparison;
    phase = phaseStats.inclusive &&
      phaseStats.confidenceLower > 1 &&
      phaseStats.medianSpeedup >= 1 / (1 - document.policy.minimumPhaseImprovement) &&
      document.performance.phase.share >= document.policy.minimumPhaseShare &&
      e2e.confidenceLower > 1 &&
      e2e.medianSpeedup >= 1 / (1 - document.policy.minimumPhaseEndToEndImprovement) &&
      document.performance.phase.heldOutConsumers.length >= document.policy.requiredConsumers;
  }
  if (!direct && !phase) unknown("promotion.performance-inconclusive");
  const uniqueReasons = [...new Set(reasons)].sort();
  return deepFreeze({
    status: rejected ? "rejected" : inconclusive ? "inconclusive" : "accepted",
    reasons: uniqueReasons,
    statistics: {
      endToEndMedianSpeedup: e2e.medianSpeedup,
      endToEndConfidenceLower: e2e.confidenceLower,
      endToEndConfidenceUpper: e2e.confidenceUpper,
      phaseMedianSpeedup: document.performance.phase?.comparison.medianSpeedup ?? null,
    },
  });
}

function validatePromotionReceipt(value, context = {}) {
  const label = "promotion";
  schemaHeader(label, value, SCHEMAS.promotion, [
    "authority", "campaign", "policy", "baseline", "candidate", "build", "artifact",
    "workloads", "correctness", "compilerDelta", "routes", "performance", "costs", "resources",
    "platforms", "baselineExceptions", "browsers", "dashboardDelta", "adversarial",
    "neighboring", "losingCandidates", "decision",
  ]);
  if (value.authority !== "promotion-validator") fail(`${label}.authority`, "must be promotion-validator");
  const campaign = validateReference(`${label}.campaign`, value.campaign);
  exactKeys(`${label}.policy`, value.policy, [
    "id", "digest", "minPairs", "bootstrapResamples", "confidence", "bootstrapSeedDigest",
    "minimumEndToEndImprovement", "minimumPhaseImprovement", "minimumPhaseShare",
    "minimumPhaseEndToEndImprovement", "requiredConsumers", "maximumRegression",
    "requiredTargets", "requiredPlatforms", "requiredBrowsers",
  ]);
  const policy = {
    id: identifier(`${label}.policy.id`, value.policy.id),
    digest: digest(`${label}.policy.digest`, value.policy.digest),
    minPairs: safeInteger(`${label}.policy.minPairs`, value.policy.minPairs, 11),
    bootstrapResamples: safeInteger(`${label}.policy.bootstrapResamples`,
      value.policy.bootstrapResamples, 1000),
    confidence: finiteNumber(`${label}.policy.confidence`, value.policy.confidence, 0.95, 0.9999),
    bootstrapSeedDigest: digest(`${label}.policy.bootstrapSeedDigest`,
      value.policy.bootstrapSeedDigest),
    minimumEndToEndImprovement: finiteNumber(
      `${label}.policy.minimumEndToEndImprovement`, value.policy.minimumEndToEndImprovement, 0.1, 1,
    ),
    minimumPhaseImprovement: finiteNumber(
      `${label}.policy.minimumPhaseImprovement`, value.policy.minimumPhaseImprovement, 0.5, 1,
    ),
    minimumPhaseShare: finiteNumber(
      `${label}.policy.minimumPhaseShare`, value.policy.minimumPhaseShare, 0.1, 1,
    ),
    minimumPhaseEndToEndImprovement: finiteNumber(
      `${label}.policy.minimumPhaseEndToEndImprovement`,
      value.policy.minimumPhaseEndToEndImprovement, 0.05, 1,
    ),
    requiredConsumers: safeInteger(`${label}.policy.requiredConsumers`,
      value.policy.requiredConsumers, 2),
    maximumRegression: finiteNumber(`${label}.policy.maximumRegression`,
      value.policy.maximumRegression, 0, 1),
    requiredTargets: stringArray(`${label}.policy.requiredTargets`, value.policy.requiredTargets,
      { minimum: 1 }).map((target, index) =>
        enumeration(`${label}.policy.requiredTargets[${index}]`, target, TARGETS)),
    requiredPlatforms: stringArray(`${label}.policy.requiredPlatforms`,
      value.policy.requiredPlatforms, { minimum: 1 }).map((platform, index) =>
        enumeration(`${label}.policy.requiredPlatforms[${index}]`, platform, PLATFORMS)),
    requiredBrowsers: stringArray(`${label}.policy.requiredBrowsers`,
      value.policy.requiredBrowsers, { minimum: 1 }).map((engine, index) =>
        enumeration(`${label}.policy.requiredBrowsers[${index}]`, engine,
          ["chromium", "firefox", "webkit"])),
  };
  if (policy.maximumRegression > 0.03) {
    fail(`${label}.policy.maximumRegression`, "must not exceed the reviewed 3% pilot ceiling");
  }
  for (const field of [
    "minimumEndToEndImprovement", "minimumPhaseImprovement",
    "minimumPhaseEndToEndImprovement",
  ]) {
    if (policy[field] >= 1) fail(`${label}.policy.${field}`, "must be less than one");
  }
  if (JSON.stringify(policy.requiredBrowsers) !== JSON.stringify(["chromium", "firefox", "webkit"])) {
    fail(`${label}.policy.requiredBrowsers`, "must require Chromium, Firefox, and WebKit");
  }
  function revision(revisionLabel, item) {
    exactKeys(revisionLabel, item, [
      "commit", "tree", "sourceBundleId", "workspaceId", "clean", "compilerId", "artifactId",
      "profileIds",
    ]);
    if (!/^[0-9a-f]{40}$/.test(item.commit)) fail(`${revisionLabel}.commit`, "must be a Git commit");
    if (!/^[0-9a-f]{40}$/.test(item.tree)) fail(`${revisionLabel}.tree`, "must be a Git tree");
    return {
      commit: item.commit,
      tree: item.tree,
      sourceBundleId: contentId(`${revisionLabel}.sourceBundleId`, item.sourceBundleId),
      workspaceId: digest(`${revisionLabel}.workspaceId`, item.workspaceId),
      clean: boolean(`${revisionLabel}.clean`, item.clean),
      compilerId: contentId(`${revisionLabel}.compilerId`, item.compilerId),
      artifactId: contentId(`${revisionLabel}.artifactId`, item.artifactId),
      profileIds: stringArray(`${revisionLabel}.profileIds`, item.profileIds,
        { minimum: 1 }).map((id, index) => contentId(`${revisionLabel}.profileIds[${index}]`, id)),
    };
  }
  const baseline = revision(`${label}.baseline`, value.baseline);
  const candidate = revision(`${label}.candidate`, value.candidate);
  if (baseline.commit === candidate.commit) fail(label, "baseline and candidate commits must differ");
  exactKeys(`${label}.build`, value.build,
    ["workspaceId", "receiptDigest", "outputsDigest"]);
  const build = {
    workspaceId: digest(`${label}.build.workspaceId`, value.build.workspaceId),
    receiptDigest: digest(`${label}.build.receiptDigest`, value.build.receiptDigest),
    outputsDigest: digest(`${label}.build.outputsDigest`, value.build.outputsDigest),
  };
  if (build.workspaceId !== candidate.workspaceId) {
    fail(`${label}.build.workspaceId`, "does not match candidate workspace");
  }
  exactKeys(`${label}.artifact`, value.artifact,
    ["kind", "id", "sourceCommit", "sourceClosureId", "manifestDigest", "receiptDigest"]);
  const artifact = {
    kind: enumeration(`${label}.artifact.kind`, value.artifact.kind,
      ["node-source", "node-build", "browser-production"]),
    id: contentId(`${label}.artifact.id`, value.artifact.id),
    sourceCommit: nonemptyString(`${label}.artifact.sourceCommit`, value.artifact.sourceCommit),
    sourceClosureId: contentId(`${label}.artifact.sourceClosureId`, value.artifact.sourceClosureId),
    manifestDigest: digest(`${label}.artifact.manifestDigest`, value.artifact.manifestDigest),
    receiptDigest: digest(`${label}.artifact.receiptDigest`, value.artifact.receiptDigest),
  };
  if (!/^[0-9a-f]{40}$/.test(artifact.sourceCommit)) {
    fail(`${label}.artifact.sourceCommit`, "must be a Git commit");
  }
  if (artifact.id !== candidate.artifactId) {
    fail(`${label}.artifact.id`, "does not match candidate artifact");
  }
  if (artifact.sourceCommit !== candidate.commit) {
    fail(`${label}.artifact.sourceCommit`, "does not match candidate commit");
  }
  const workloads = stringArray(`${label}.workloads`, value.workloads, { minimum: 1 }).map(
    (id, index) => contentId(`${label}.workloads[${index}]`, id));
  const correctness = array(`${label}.correctness`, value.correctness, validateStatusEvidence,
    { minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id });
  exactKeys(`${label}.compilerDelta`, value.compilerDelta,
    ["beforeDecisionIds", "afterDecisionIds", "resolvedReasons", "introducedReasons"]);
  const compilerDelta = {
    beforeDecisionIds: stringArray(`${label}.compilerDelta.beforeDecisionIds`,
      value.compilerDelta.beforeDecisionIds).map((id, index) =>
        contentId(`${label}.compilerDelta.beforeDecisionIds[${index}]`, id)),
    afterDecisionIds: stringArray(`${label}.compilerDelta.afterDecisionIds`,
      value.compilerDelta.afterDecisionIds).map((id, index) =>
        contentId(`${label}.compilerDelta.afterDecisionIds[${index}]`, id)),
    resolvedReasons: validateReasonList(`${label}.compilerDelta.resolvedReasons`,
      value.compilerDelta.resolvedReasons, context.reasonRegistry || DEFAULT_REASON_REGISTRY),
    introducedReasons: validateReasonList(`${label}.compilerDelta.introducedReasons`,
      value.compilerDelta.introducedReasons, context.reasonRegistry || DEFAULT_REASON_REGISTRY),
  };
  const routes = array(`${label}.routes`, value.routes, (routeLabel, route) => {
    exactKeys(routeLabel, route, [
      "id", "status", "evidenceId", "passId", "lowering", "representation", "target",
      "fallbackId", "runtimeAuthenticated", "o0Selected", "o2Selected", "guardFallback",
    ]);
    return {
      id: identifier(`${routeLabel}.id`, route.id),
      status: enumeration(`${routeLabel}.status`, route.status, ["pass", "fail", "unavailable"]),
      evidenceId: contentId(`${routeLabel}.evidenceId`, route.evidenceId),
      passId: stableName(`${routeLabel}.passId`, route.passId),
      lowering: stableName(`${routeLabel}.lowering`, route.lowering),
      representation: nonemptyString(`${routeLabel}.representation`, route.representation),
      target: enumeration(`${routeLabel}.target`, route.target, TARGETS),
      fallbackId: nonemptyString(`${routeLabel}.fallbackId`, route.fallbackId),
      runtimeAuthenticated: boolean(`${routeLabel}.runtimeAuthenticated`, route.runtimeAuthenticated),
      o0Selected: boolean(`${routeLabel}.o0Selected`, route.o0Selected),
      o2Selected: boolean(`${routeLabel}.o2Selected`, route.o2Selected),
      guardFallback: enumeration(`${routeLabel}.guardFallback`, route.guardFallback,
        ["pass", "fail", "not-exercised"]),
    };
  }, { minimum: 1, uniqueBy: (route) => route.id, sortedBy: (route) => route.id });
  exactKeys(`${label}.performance`, value.performance,
    ["endToEnd", "phase"]);
  const performance = {
    endToEnd: validateComparison(`${label}.performance.endToEnd`,
      value.performance.endToEnd, policy, `${campaign.id}:${workloads.join(",")}:end-to-end`),
    phase: null,
  };
  if (value.performance.phase !== null) {
    exactKeys(`${label}.performance.phase`, value.performance.phase,
      ["id", "share", "comparison", "heldOutConsumers"]);
    performance.phase = {
      id: identifier(`${label}.performance.phase.id`, value.performance.phase.id),
      share: finiteNumber(`${label}.performance.phase.share`, value.performance.phase.share, 0, 1),
      comparison: validateComparison(`${label}.performance.phase.comparison`,
        value.performance.phase.comparison, policy,
        `${campaign.id}:${workloads.join(",")}:phase:${value.performance.phase.id}`),
      heldOutConsumers: stringArray(`${label}.performance.phase.heldOutConsumers`,
        value.performance.phase.heldOutConsumers).map((id, index) =>
          contentId(`${label}.performance.phase.heldOutConsumers[${index}]`, id)),
    };
  }
  exactKeys(`${label}.costs`, value.costs, ["baseline", "candidate"]);
  const costs = {
    baseline: validateCounterSet(`${label}.costs.baseline`, value.costs.baseline),
    candidate: validateCounterSet(`${label}.costs.candidate`, value.costs.candidate),
  };
  const resources = array(`${label}.resources`, value.resources, (resourceLabel, resource) => {
    exactKeys(resourceLabel, resource, ["id", "evidenceId", "ceilings"]);
    return {
      id: identifier(`${resourceLabel}.id`, resource.id),
      evidenceId: contentId(`${resourceLabel}.evidenceId`, resource.evidenceId),
      ceilings: array(`${resourceLabel}.ceilings`, resource.ceilings,
      (ceilingLabel, ceiling) => {
        exactKeys(ceilingLabel, ceiling, ["metric", "unit", "limit", "observed"]);
        const observed = ceiling.observed === null ? null
          : safeInteger(`${ceilingLabel}.observed`, ceiling.observed);
        const limit = safeInteger(`${ceilingLabel}.limit`, ceiling.limit);
        return {
          metric: identifier(`${ceilingLabel}.metric`, ceiling.metric),
          unit: enumeration(`${ceilingLabel}.unit`, ceiling.unit,
            ["bytes", "count", "milliseconds"]),
          limit,
          observed,
        };
      }, { minimum: 1, uniqueBy: (ceiling) => ceiling.metric, sortedBy: (ceiling) => ceiling.metric }),
    };
  }, { minimum: 1, uniqueBy: (resource) => resource.id, sortedBy: (resource) => resource.id });
  function failure(failureLabel, item) {
    exactKeys(failureLabel, item, ["test", "fingerprint", "exceptionId"]);
    return {
      test: nonemptyString(`${failureLabel}.test`, item.test),
      fingerprint: digest(`${failureLabel}.fingerprint`, item.fingerprint),
      exceptionId: item.exceptionId === null ? null
        : identifier(`${failureLabel}.exceptionId`, item.exceptionId),
    };
  }
  const platforms = array(`${label}.platforms`, value.platforms, (platformLabel, platform) => {
    exactKeys(platformLabel, platform, ["id", "availability", "evidenceId", "failures"]);
    const platformId = enumeration(`${platformLabel}.id`, platform.id, PLATFORMS);
    const failures = array(`${platformLabel}.failures`, platform.failures, failure);
    const availability = enumeration(`${platformLabel}.availability`, platform.availability,
      ["available", "unavailable"]);
    if (availability === "unavailable" && failures.length > 0) {
      fail(platformLabel, "an unavailable platform cannot report executed failures");
    }
    return {
      id: platformId,
      availability,
      evidenceId: contentId(`${platformLabel}.evidenceId`, platform.evidenceId),
      failures,
    };
  }, { minimum: 1, uniqueBy: (platform) => platform.id,
    sortedBy: (platform) => platform.id });
  const baselineExceptions = array(`${label}.baselineExceptions`, value.baselineExceptions,
    (exceptionLabel, item) => {
      exactKeys(exceptionLabel, item, ["id", "issue", "test", "platform", "fingerprint"]);
      if (!/^https:\/\/github\.com\/sagemathinc\/sagejs\/issues\/[1-9][0-9]*$/.test(item.issue)) {
        fail(`${exceptionLabel}.issue`, "must be an exact Sage.js GitHub issue URL");
      }
      return {
        id: identifier(`${exceptionLabel}.id`, item.id),
        issue: item.issue,
        test: nonemptyString(`${exceptionLabel}.test`, item.test),
        platform: enumeration(`${exceptionLabel}.platform`, item.platform, PLATFORMS),
        fingerprint: digest(`${exceptionLabel}.fingerprint`, item.fingerprint),
      };
    }, { uniqueBy: (item) => item.id, sortedBy: (item) => item.id });
  const browsers = array(`${label}.browsers`, value.browsers, (browserLabel, browser) => {
    exactKeys(browserLabel, browser, ["engine", "availability", "receiptId"]);
    return {
      engine: enumeration(`${browserLabel}.engine`, browser.engine,
        ["chromium", "firefox", "webkit"]),
      availability: enumeration(`${browserLabel}.availability`, browser.availability,
        ["available", "unavailable"]),
      receiptId: contentId(`${browserLabel}.receiptId`, browser.receiptId),
    };
  }, { minimum: 1, uniqueBy: (browser) => browser.engine, sortedBy: (browser) => browser.engine });
  exactKeys(`${label}.dashboardDelta`, value.dashboardDelta,
    ["beforeId", "afterId", "resolvedRegions", "introducedRegions"]);
  const dashboardDelta = {
    beforeId: contentId(`${label}.dashboardDelta.beforeId`, value.dashboardDelta.beforeId),
    afterId: contentId(`${label}.dashboardDelta.afterId`, value.dashboardDelta.afterId),
    resolvedRegions: stringArray(`${label}.dashboardDelta.resolvedRegions`,
      value.dashboardDelta.resolvedRegions).map((id, index) =>
        contentId(`${label}.dashboardDelta.resolvedRegions[${index}]`, id)),
    introducedRegions: stringArray(`${label}.dashboardDelta.introducedRegions`,
      value.dashboardDelta.introducedRegions).map((id, index) =>
        contentId(`${label}.dashboardDelta.introducedRegions[${index}]`, id)),
  };
  const adversarial = array(`${label}.adversarial`, value.adversarial, validateStatusEvidence,
    { minimum: 1, uniqueBy: (item) => item.id, sortedBy: (item) => item.id });
  const neighboring = array(`${label}.neighboring`, value.neighboring, (itemLabel, item) => {
    exactKeys(itemLabel, item, ["workloadId", "comparison"]);
    return {
      workloadId: contentId(`${itemLabel}.workloadId`, item.workloadId),
      comparison: validateComparison(`${itemLabel}.comparison`, item.comparison, policy,
        `${campaign.id}:neighbor:${item.workloadId}`),
    };
  }, { minimum: 1, uniqueBy: (item) => item.workloadId, sortedBy: (item) => item.workloadId });
  const losingCandidates = array(`${label}.losingCandidates`, value.losingCandidates,
    (candidateLabel, item) => {
      exactKeys(candidateLabel, item, ["target", "status", "evidenceId", "reason"]);
      return {
        target: enumeration(`${candidateLabel}.target`, item.target, TARGETS),
        status: enumeration(`${candidateLabel}.status`, item.status,
          ["measured-slower", "unavailable", "inconclusive"]),
        evidenceId: contentId(`${candidateLabel}.evidenceId`, item.evidenceId),
        reason: nonemptyString(`${candidateLabel}.reason`, item.reason),
      };
    }, { uniqueBy: (item) => item.target, sortedBy: (item) => item.target });
  const normalizedCore = {
    schema: value.schema, id: value.id, authority: value.authority, campaign, policy, baseline,
    candidate, build, artifact, workloads, correctness, compilerDelta, routes,
    performance, costs, resources, platforms, baselineExceptions, browsers, dashboardDelta,
    adversarial, neighboring, losingCandidates,
  };
  for (const required of policy.requiredPlatforms) {
    if (!platforms.some((item) => item.id === required)) {
      fail(`${label}.platforms`, `missing required platform ${required}`);
    }
  }
  for (const required of policy.requiredBrowsers) {
    if (!browsers.some((item) => item.engine === required)) {
      fail(`${label}.browsers`, `missing required browser ${required}`);
    }
  }
  function bindingState(contextLabel, current, actual, fields) {
    if (current === undefined) return "missing";
    exactKeys(contextLabel, current, fields);
    return fields.every((field) =>
      canonicalJson(current[field]) === canonicalJson(actual[field])) ? "verified" : "mismatch";
  }
  const bindings = {
    checkout: bindingState("promotion context.currentCheckout", context.currentCheckout,
      candidate, [
        "commit", "tree", "sourceBundleId", "workspaceId", "clean", "compilerId", "artifactId",
        "profileIds",
      ]),
    build: bindingState("promotion context.currentBuild", context.currentBuild,
      build, ["workspaceId", "receiptDigest", "outputsDigest"]),
    artifact: bindingState("promotion context.currentArtifact", context.currentArtifact,
      artifact, ["id", "sourceCommit", "sourceClosureId", "manifestDigest", "receiptDigest"]),
    browsers: browsers.filter((browser) =>
      Array.isArray(context.validatedBrowserReceiptIds) &&
      context.validatedBrowserReceiptIds.includes(browser.receiptId)).map((browser) => browser.engine),
  };
  if (context.validatedInputs === undefined) {
    bindings.evidence = "missing";
  } else {
    const inputFields = [
      "campaignIds", "sourceBundleIds", "compilerIds", "artifactIds",
      "profileIds", "workloadIds", "correctnessEvidenceIds", "adversarialEvidenceIds",
      "routeEvidenceIds", "resourceEvidenceIds", "platformEvidenceIds",
      "neighboringWorkloadIds", "losingCandidateEvidenceIds", "dashboardIds",
      "compilerDecisionIds",
    ];
    exactKeys("promotion context.validatedInputs", context.validatedInputs, inputFields);
    const validated = Object.fromEntries(inputFields.map((field) => [field, new Set(
      stringArray(`promotion context.validatedInputs.${field}`, context.validatedInputs[field])
        .map((id, index) => contentId(
          `promotion context.validatedInputs.${field}[${index}]`, id,
        )),
    )]));
    const cited = {
      campaignIds: [campaign.id],
      sourceBundleIds: [baseline.sourceBundleId, candidate.sourceBundleId],
      compilerIds: [baseline.compilerId, candidate.compilerId],
      artifactIds: [baseline.artifactId, candidate.artifactId],
      profileIds: [...baseline.profileIds, ...candidate.profileIds],
      workloadIds: [
        ...workloads,
        ...(performance.phase?.heldOutConsumers ?? []),
      ],
      correctnessEvidenceIds: correctness.map((item) => item.evidenceId),
      adversarialEvidenceIds: adversarial.map((item) => item.evidenceId),
      routeEvidenceIds: routes.map((item) => item.evidenceId),
      resourceEvidenceIds: resources.map((item) => item.evidenceId),
      platformEvidenceIds: platforms.map((item) => item.evidenceId),
      neighboringWorkloadIds: neighboring.map((item) => item.workloadId),
      losingCandidateEvidenceIds: losingCandidates.map((item) => item.evidenceId),
      dashboardIds: [dashboardDelta.beforeId, dashboardDelta.afterId],
      compilerDecisionIds: [
        ...compilerDelta.beforeDecisionIds,
        ...compilerDelta.afterDecisionIds,
      ],
    };
    bindings.evidence = Object.entries(cited).every(([field, ids]) =>
      ids.every((id) => validated[field].has(id))) ? "verified" : "mismatch";
  }
  const expectedDecision = promotionDecision(normalizedCore, bindings);
  exactKeys(`${label}.decision`, value.decision, ["status", "reasons", "statistics"]);
  const suppliedDecision = {
    status: enumeration(`${label}.decision.status`, value.decision.status,
      ["accepted", "rejected", "inconclusive"]),
    reasons: stringArray(`${label}.decision.reasons`, value.decision.reasons),
    statistics: validateJsonValue(`${label}.decision.statistics`, value.decision.statistics),
  };
  if (canonicalJson(suppliedDecision) !== canonicalJson(expectedDecision)) {
    fail(`${label}.decision`,
      `does not match the independently recomputed decision ${canonicalJson(expectedDecision)}`);
  }
  if (context.campaignId && campaign.id !== context.campaignId) {
    fail(`${label}.campaign.id`, "does not match the reviewed campaign");
  }
  return finish(label, value, { ...normalizedCore, decision: expectedDecision });
}

function validateBySchema(value, context = {}) {
  record("evidence document", value);
  const validators = {
    [SCHEMAS.workload]: validateWorkload,
    [SCHEMAS.workloadCatalog]: validateWorkloadCatalog,
    [SCHEMAS.profile]: validateProfileReceipt,
    [SCHEMAS.overlay]: validateHotnessOverlay,
    [SCHEMAS.dossier]: validateDossier,
    [SCHEMAS.campaign]: validateCampaign,
    [SCHEMAS.promotion]: validatePromotionReceipt,
  };
  const validator = validators[value.schema];
  if (!validator) fail("document.schema", `unknown schema ${value.schema}`);
  return validator(value, context);
}

module.exports = {
  MODES,
  PLATFORMS,
  SCHEMAS,
  TARGETS,
  computeComparisonStatistics,
  promotionDecision,
  validateArtifact,
  validateBySchema,
  validateCampaign,
  validateDossier,
  validateHotnessOverlay,
  validateProfileReceipt,
  validatePromotionReceipt,
  validateWorkload,
  validateWorkloadCatalog,
};
