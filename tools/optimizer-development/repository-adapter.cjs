"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  attachIdentity,
  canonicalJson,
  sha256,
} = require("./common.cjs");
const {
  canonicalCompilerIdentity,
  compilerImplementationsCompatible,
  sourceUnitIdentity,
} = require("./identity.cjs");
const {
  DEFAULT_REASON_REGISTRY,
  normalizeLegacyReason,
  validateReason,
} = require("./reason-codes.cjs");
const {
  validateCampaign,
  validateDossier,
  validateHotnessOverlay,
  validateProfileReceipt,
} = require("./schemas.cjs");
const {
  validateOpportunityEvidence: validateReviewedOpportunityEvidence,
} = require("./opportunity-evidence.cjs");

const ROOT = path.resolve(__dirname, "../..");
const DASHBOARD_MODULE = path.join(ROOT, "scripts/optimizer-opportunity-dashboard.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(`optimizer repository adapter: ${message}`);
}

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function rangeOf(source) {
  return {
    startLine: source.line,
    startColumn: source.column,
    endLine: source.endLine,
    endColumn: source.endColumn,
  };
}

function sameRange(left, right) {
  return left.startLine === right.startLine && left.startColumn === right.startColumn &&
    left.endLine === right.endLine && left.endColumn === right.endColumn;
}

function sourceExcerpt(source, range) {
  const lines = source.split("\n");
  assert(range.startLine <= lines.length && range.endLine <= lines.length,
    "source range extends beyond current file");
  if (range.startLine === range.endLine) {
    return lines[range.startLine - 1].slice(range.startColumn, range.endColumn);
  }
  return [
    lines[range.startLine - 1].slice(range.startColumn),
    ...lines.slice(range.startLine, range.endLine - 1),
    lines[range.endLine - 1].slice(0, range.endColumn),
  ].join("\n");
}

function compilerReason(code) {
  return validateReason({ code, detail: {} }, DEFAULT_REASON_REGISTRY);
}

function normalizedReason(reason) {
  return validateReason(
    typeof reason === "string" ? normalizeLegacyReason(reason) : reason,
    DEFAULT_REASON_REGISTRY,
  );
}

function uniqueReasons(reasons) {
  const values = new Map();
  for (const reason of reasons) {
    const checked = normalizedReason(reason);
    values.set(canonicalJson(checked), checked);
  }
  return [...values.values()].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)));
}

function validateRepositorySources(root, dashboard) {
  const files = new Map();
  for (const record of dashboard.files) {
    const filename = path.join(root, record.path);
    assert(fs.existsSync(filename), `dashboard source is missing: ${record.path}`);
    const bytes = fs.readFileSync(filename);
    assert(bytes.length === record.bytes && sha256(bytes) === record.sourceDigest,
      `dashboard source is stale: ${record.path}`);
    const expected = sourceUnitIdentity({
      path: record.path,
      digest: record.sourceDigest,
      language: "python",
    });
    assert(expected.id === record.id, `dashboard source identity is stale: ${record.path}`);
    files.set(record.id, record);
  }
  return files;
}

function dashboardReference(dashboard) {
  return {
    id: dashboard.id,
    digest: sha256(canonicalJson(dashboard)),
    sourceBundleId: dashboard.sourceBundle.id,
    compilerId: dashboard.compilerIdentity.id,
  };
}

function mapTarget(kind) {
  return ["v8", "wasm", "native", "library", "generic"].includes(kind) ? kind : "generic";
}

function staticClassification(loop) {
  if (loop.status === "selected") return "representation";
  if (loop.status === "rejected") return "compiler-rejection";
  return "unknown";
}

function staticRegion(loop, files, passCounts, passExamples) {
  const functionId = loop.functionId ?? files.get(loop.sourceUnitId).moduleIdentity.id;
  const decisions = loop.decisions.map((decision) => ({
    decisionId: decision.id,
    passId: decision.passId,
    status: decision.selected ? "selected" : "rejected",
    reasons: uniqueReasons(decision.rejectionReasons),
  }));
  const passes = new Set(decisions.map((decision) => decision.passId));
  return {
    loopId: loop.id,
    source: {
      path: loop.source.path,
      range: rangeOf(loop.source),
      sourceUnitId: loop.sourceUnitId,
      functionId,
      regionId: loop.id,
    },
    staticDecisions: decisions,
    classification: staticClassification(loop),
    fallbackPreserving: loop.decisions.some((decision) => typeof decision.fallbackId === "string"),
    // The dashboard does not prove whether a mature algorithm duplicates this
    // work. Leaving this unknown deliberately prevents an automatic campaign.
    matureAlgorithmDisposition: "unknown",
    negativeEvidence: [],
    ranking: {
      // Static inspection cannot establish removable wall time. Runtime ticks
      // are retained as observations, not promoted into a false wall-time bound.
      removableWallLower: 0,
      affectedWorkloads: 0,
      nearMissDistance: loop.status === "rejected"
        ? Math.max(1, loop.reasonCodes.length) : loop.status === "selected" ? 0 : 99,
      generality: [...passes].reduce((sum, passId) => sum + (passCounts.get(passId) || 0), 0),
      existingComponents: loop.decisions.reduce((sum, decision) => sum +
        decision.candidates.filter((candidate) => candidate.availability !== "rejected").length, 0),
      semanticRisk: loop.status === "selected" ? 0 : loop.status === "rejected" ? 1 : 3,
      compilationCost: 1,
      evidenceQuality: loop.decisions.length > 0 ? 2 : 0,
    },
    removableFraction: { lower: 0, upper: 0 },
    repository: {
      loop: copy(loop),
      file: copy(files.get(loop.sourceUnitId)),
      heldOut: [...passes].flatMap((passId) => passExamples.get(passId) || [])
        .filter((item) => item.id !== loop.id).slice(0, 3),
    },
  };
}

function profileSourceUnits(sourceBundle) {
  return new Map(sourceBundle.files.map((file) => {
    const identity = sourceUnitIdentity({ path: file.path, digest: file.digest, language: "python" });
    return [identity.id, file];
  }));
}

function candidateMatchesRegion(candidate, region, sourceUnits, includeRange) {
  const file = sourceUnits.get(candidate.sourceUnitId);
  if (!file || file.path !== candidate.path || candidate.sourceUnitId !== region.source.sourceUnitId ||
      candidate.functionId !== region.source.functionId || candidate.regionId !== region.loopId ||
      candidate.path !== region.source.path) return false;
  return !includeRange || sameRange(candidate.range, region.source.range);
}

function routeCandidateMatchesRegion(candidate, region, sourceUnits) {
  return sourceUnits.has(candidate.sourceUnitId) &&
    candidate.sourceUnitId === region.source.sourceUnitId &&
    candidate.functionId === region.source.functionId && candidate.regionId === region.loopId;
}

function compileExactFileInChild(root, filename) {
  const script = String.raw`
const path = require("node:path");
(async () => {
  const root = process.argv[1];
  const filename = process.argv[2];
  const source = require("node:fs").readFileSync(filename, "utf8");
  const createCompiler = require(path.join(root, "dist/tools/compiler.js")).default;
  const { createPythonCompilerFrontend } = require(path.join(root,
    "dist/tools/python/compiler-frontend.js"));
  const { explainOptimizationProgram, verifyOptimizationProgram } = require(path.join(root,
    "dist/tools/python/optimizer/index.js"));
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(source, {
      filename,
      basedir: path.dirname(filename),
      libdir: path.join(root, "src/lib"),
      import_dirs: [],
      for_linting: true,
      runtime_imports: false,
      exact_integer_literals: true,
      strict_python_scopes: true,
      scoped_flags: { dict_literals: true, overload_getitem: true,
        bound_methods: true, sequential_definitions: true },
      optimization_level: "O2",
      optimization_explain: true,
      optimization_contract_policy: "diagnose",
    });
    verifyOptimizationProgram(ast.optimization_ir);
    process.stdout.write(JSON.stringify(explainOptimizationProgram(ast.optimization_ir)));
  } finally {
    if (frontend && typeof frontend.dispose === "function") await frontend.dispose();
    if (compiler && typeof compiler.dispose === "function") compiler.dispose();
  }
})().catch((error) => { process.stderr.write(String(error.stack || error)); process.exit(1); });`;
  const result = childProcess.spawnSync(process.execPath, ["-e", script, root, filename], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`exact optimizer recompilation failed for ${path.relative(root, filename)}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function exactDecision(program, dashboardDecision, source, root) {
  assert(program && program.schema === "sagejs.optimizing-mathematics/v1" &&
    Array.isArray(program.regions), "recompilation did not produce complete optimizer IR");
  const matches = program.regions.filter((decision) => {
    const location = decision && decision.source;
    const sourcePath = location && (location.path || location.filename);
    const relativePath = sourcePath && path.isAbsolute(sourcePath)
      ? path.relative(root, sourcePath).split(path.sep).join("/") : sourcePath;
    return decision && decision.passId === dashboardDecision.passId &&
      decision.selected === dashboardDecision.selected && location &&
      relativePath === source.path && sameRange(rangeOf(location), source.range);
  });
  assert(matches.length === 1,
    `exact current IR decision must occur once for ${source.regionId}; found ${matches.length}`);
  return matches[0];
}

function numericCounter(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function factPartition(decision) {
  const result = { proven: [], guarded: [], unknown: [], invalidated: [] };
  for (const fact of decision.facts || []) {
    const authority = fact.authority === "runtime-guard" ? "runtime-guard" : "static";
    const bucket = authority === "runtime-guard" ? "guarded" : "proven";
    result[bucket].push({ kind: fact.kind, authority, evidence: fact.evidence });
  }
  for (const guard of decision.guards || []) result.guarded.push({
    kind: guard,
    authority: "runtime-guard",
    evidence: `optimizer guard ${guard}`,
  });
  for (const rejection of decision.rejectionReasons || []) result.unknown.push({
    kind: normalizedReason(rejection).code,
    authority: "static",
    evidence: "current optimizer rejection",
  });
  for (const key of Object.keys(result)) {
    result[key] = [...new Map(result[key].map((fact) =>
      [`${fact.kind}:${fact.authority}`, fact])).values()];
  }
  return result;
}

function candidateProjection(candidate) {
  const reason = candidate.rejectionReason == null ? null : normalizedReason(candidate.rejectionReason);
  return {
    id: candidate.id,
    target: mapTarget(candidate.kind),
    representation: candidate.representation,
    status: candidate.availability === "selected" ? "selected"
      : candidate.availability === "rejected" ? "rejected"
        : candidate.availability === "runtime-gated" ? "runtime-gated" : "available",
    reason,
    inclusiveEvidence: null,
  };
}

function createRepositoryAdapter(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const dashboardModule = options.dashboardModule || require(path.join(root,
    "scripts/optimizer-opportunity-dashboard.cjs"));
  const compileFile = options.compileExactFile || ((filename) => compileExactFileInChild(root, filename));
  let currentCompilerIdentity = options.currentCompilerIdentity || null;
  // Evidence documents are content-addressed and treated as immutable. Caching
  // by object identity avoids repeatedly validating the 10k-region census in
  // one overlay/dossier operation without accepting a different document.
  const checkedDashboards = new WeakMap();
  const dashboardViews = new WeakMap();

  function validateDashboardDocument(value) {
    if (value && typeof value === "object" && checkedDashboards.has(value)) {
      return checkedDashboards.get(value);
    }
    const checked = dashboardModule.validateDashboard(value);
    validateRepositorySources(root, checked);
    if (!currentCompilerIdentity) {
      let optimizerCatalog;
      try {
        ({ optimizerCatalog } = require(path.join(root,
          "dist/tools/python/optimizer/catalog.js")));
      } catch (error) {
        throw new Error("optimizer repository adapter: current compiler identity requires pnpm build", {
          cause: error,
        });
      }
      currentCompilerIdentity = canonicalCompilerIdentity({
        root,
        irSchema: checked.compilerIdentity.irSchema,
        optimizerCatalog,
        optionsDigest: checked.compilerIdentity.optionsDigest,
      });
    }
    assert(compilerImplementationsCompatible(checked.compilerIdentity, currentCompilerIdentity),
      "dashboard compiler implementation is stale");
    checkedDashboards.set(value, checked);
    return checked;
  }

  function dashboard(value) {
    if (dashboardViews.has(value)) return dashboardViews.get(value);
    const files = new Map(value.files.map((file) => [file.id, file]));
    const passCounts = new Map();
    const passExamples = new Map();
    for (const loop of value.loops) for (const decision of loop.decisions) {
      passCounts.set(decision.passId, (passCounts.get(decision.passId) || 0) + 1);
      if (!passExamples.has(decision.passId)) passExamples.set(decision.passId, []);
      if (passExamples.get(decision.passId).length < 4) passExamples.get(decision.passId).push({
        id: loop.id,
        path: loop.source.path,
        line: loop.source.line,
      });
    }
    const view = {
      reference: dashboardReference(value),
      compiler: value.compilerIdentity,
      regions: value.loops.map((loop) => staticRegion(loop, files, passCounts, passExamples)),
    };
    dashboardViews.set(value, view);
    return view;
  }

  function validateProfile(value) {
    return validateProfileReceipt(value, { reasonRegistry: DEFAULT_REASON_REGISTRY });
  }

  function projectProfile(receipt, staticView) {
    const current = compilerImplementationsCompatible(receipt.compiler, staticView.compiler);
    const sourceUnits = profileSourceUnits(receipt.sourceBundle);
    const staticById = new Map(staticView.regions.map((region) => [region.loopId, region]));
    const observations = new Map();
    const unmatched = new Map();
    const addUnmatched = (reason, count) => {
      if (count <= 0) return;
      const key = canonicalJson(reason);
      unmatched.set(key, { profileId: receipt.id, reason,
        count: (unmatched.get(key)?.count || 0) + count });
    };
    const sampleCounts = { total: receipt.sampling.positionTickCounts.total,
      attributed: 0, ambiguous: 0, unmatched: 0 };

    if (!current) {
      sampleCounts.unmatched = sampleCounts.total;
      addUnmatched(compilerReason("evidence.stale-compiler"), sampleCounts.total);
    } else for (const tick of receipt.sampling.positionTicks) {
      if (tick.mapping.status === "unmatched") {
        sampleCounts.unmatched += tick.ticks;
        addUnmatched(compilerReason("evidence.unmatched-sample"), tick.ticks);
        continue;
      }
      if (tick.mapping.status === "ambiguous") {
        sampleCounts.ambiguous += tick.ticks;
        addUnmatched(compilerReason("evidence.ambiguous-source-map"), tick.ticks);
        continue;
      }
      const candidate = tick.mapping.candidates[0];
      const region = staticById.get(candidate.regionId);
      if (!region || !candidateMatchesRegion(candidate, region, sourceUnits, true)) {
        sampleCounts.unmatched += tick.ticks;
        addUnmatched(compilerReason("evidence.stale-source"), tick.ticks);
        continue;
      }
      sampleCounts.attributed += tick.ticks;
      const previous = observations.get(region.loopId) || {
        regionId: region.loopId, entryCount: 0, inclusiveSamples: 0,
        exclusiveSamples: 0, confidence: 1,
      };
      previous.inclusiveSamples += tick.ticks;
      previous.exclusiveSamples += tick.ticks;
      previous.confidence = Math.min(previous.confidence, candidate.confidence);
      observations.set(region.loopId, previous);
    }

    const routeGroups = new Map();
    if (current) for (const event of receipt.runtime.routeEvents) {
      if (event.mapping.status !== "attributed") continue;
      const candidate = event.mapping.candidates[0];
      const region = staticById.get(candidate.regionId);
      if (!region || !routeCandidateMatchesRegion(candidate, region, sourceUnits)) continue;
      const key = `${region.loopId}\0${receipt.configuration.target}`;
      const group = routeGroups.get(key) || {
        regionId: region.loopId,
        target: receipt.configuration.target,
        optimizedEntries: 0,
        fallbackEntries: 0,
        errorEntries: 0,
      };
      if (event.outcome === "guarded-fallback") group.fallbackEntries += event.count;
      else if (event.outcome === "error") group.errorEntries += event.count;
      else group.optimizedEntries += event.count;
      routeGroups.set(key, group);
      const observation = observations.get(region.loopId) || {
        regionId: region.loopId, entryCount: 0, inclusiveSamples: 0,
        exclusiveSamples: 0, confidence: 1,
      };
      observation.entryCount += event.count;
      observations.set(region.loopId, observation);
    }

    const total = sampleCounts.total;
    const protocol = receipt.sampling.protocol;
    const closureCoverage = protocol &&
      protocol.scope === "warm-prepared-sealed-generated-javascript-execution"
      ? (protocol.declaredArtifactCount === 0 || protocol.lateArtifactCount !== 0
          ? 0
          : protocol.authenticatedArtifactCount / protocol.declaredArtifactCount)
      : null;
    const projected = [...observations.values()].map((observation) => ({
      ...observation,
      wallFraction: total === 0 ? 0 : observation.exclusiveSamples / total,
    })).sort((left, right) => left.regionId.localeCompare(right.regionId));
    const exactOutput = receipt.outcome.status === "success" && receipt.output.digest !== null &&
      receipt.output.oracleResults.every((oracle) => oracle.status === "pass");
    return {
      id: receipt.id,
      workloadId: receipt.workload.id,
      current,
      // A warm sealed profile authenticates its dynamic generated-code closure
      // before sampling. Native/runtime work and source positions outside loop
      // spans remain in the wall-time denominator, but are not source-map
      // failures. Cold/legacy receipts retain the conservative sample ratio.
      coverage: closureCoverage ?? (total === 0 ? 0 : sampleCounts.attributed / total),
      exactOutput,
      samples: sampleCounts,
      observations: projected,
      runtimeRoutes: [...routeGroups.values()].sort((left, right) =>
        `${left.regionId}:${left.target}`.localeCompare(`${right.regionId}:${right.target}`)),
      unmatched: [...unmatched.values()].sort((left, right) =>
        canonicalJson(left.reason).localeCompare(canonicalJson(right.reason))),
      channels: {
        functionSamples: copy(receipt.sampling.functionSampleCounts),
        positionTicks: copy(receipt.sampling.positionTickCounts),
        routeEvents: copy(receipt.runtime.routeEventCounts),
      },
    };
  }

  function eligibilityReasons(gates) {
    const reasons = [];
    if (!gates.current) reasons.push(compilerReason("evidence.stale-compiler"));
    if (!gates.coverageSatisfied) reasons.push(compilerReason("evidence.insufficient-coverage"));
    if (!gates.exactOutput) reasons.push(compilerReason("evidence.oracle-unverified"));
    if (!gates.material) reasons.push(compilerReason("evidence.below-materiality-threshold"));
    if (!gates.classificationKnown) reasons.push(compilerReason("dashboard.no-current-pass-claimed"));
    if (!gates.fallbackPreserving) reasons.push(compilerReason("evidence.no-plausible-fallback"));
    if (!gates.algorithmDispositionKnown) {
      reasons.push(compilerReason("evidence.algorithm-disposition-unresolved"));
    }
    return uniqueReasons(reasons);
  }

  function dossierDetails({ dashboardRegion, overlayRegion, profileReceipts, profileViews }) {
    const loop = dashboardRegion.repository.loop;
    assert(loop.decisions.length > 0,
      `cannot create a dossier without current optimizer decision IR: ${loop.id}`);
    const decisionSummary = overlayRegion.staticDecisions[0];
    const dashboardDecision = loop.decisions.find((decision) =>
      decision.id === decisionSummary.decisionId);
    assert(dashboardDecision, `dashboard decision is missing: ${decisionSummary.decisionId}`);
    const filename = path.join(root, loop.source.path);
    const source = fs.readFileSync(filename, "utf8");
    assert(sha256(source) === dashboardRegion.repository.file.sourceDigest,
      `dossier source is stale: ${loop.source.path}`);
    const excerpt = sourceExcerpt(source, overlayRegion.source.range);
    assert(sha256(excerpt) === loop.excerptDigest,
      `dossier excerpt is stale: ${loop.id}`);
    const program = compileFile(filename);
    const irDecision = exactDecision(program, dashboardDecision, overlayRegion.source, root);
    const candidates = dashboardDecision.candidates.map(candidateProjection)
      .sort((left, right) => left.id.localeCompare(right.id));
    const estimated = {
      boundaryCrossings: numericCounter(dashboardDecision.boundaryCrossings),
      copiedBytes: numericCounter(dashboardDecision.copiedBytes),
      materializations: numericCounter(dashboardDecision.materializations),
      allocations: numericCounter(dashboardDecision.selectedCandidate?.cost?.allocations),
    };
    // Receipt counters are workload-global. They are intentionally not
    // misattributed to one region.
    const observed = { boundaryCrossings: 0, copiedBytes: 0, materializations: 0, allocations: 0 };
    const activeProfiles = new Set(overlayRegion.observations.map((item) => item.profileId));
    const oracles = profileReceipts.filter((receipt) => activeProfiles.has(receipt.id))
      .flatMap((receipt) => receipt.output.oracleResults.map((oracle) =>
        `${oracle.id}: ${oracle.status}${oracle.digest ? ` (${oracle.digest})` : ""}`));
    const similar = new Set(dashboardRegion.repository.heldOut.map((sibling) =>
      `${sibling.path}:${sibling.line} is a held-out same-pass hypothesis`));
    const suggested = loop.suggestedContracts.find((item) =>
      item.passId === dashboardDecision.passId);
    return {
      excerpt: { text: excerpt, digest: sha256(excerpt) },
      currentIr: {
        reportDigest: sha256(canonicalJson(program)),
        program,
        decisionId: dashboardDecision.id,
        legacyDecisionId: irDecision.id,
        passId: irDecision.passId,
        selected: irDecision.selected,
        decision: irDecision,
      },
      facts: (() => {
        const facts = factPartition(dashboardDecision);
        for (const view of profileViews) {
          const receipt = profileReceipts.find((item) => item.id === view.id);
          const runtime = receipt?.optimizer.regions.filter((item) => item.regionId === loop.id) || [];
          if (runtime.length > 0) facts.unknown.push({
            kind: `runtime-decision-${view.id.slice(-12)}`,
            authority: "observation",
            evidence: runtime.map((item) =>
              `${item.passId}:${item.selected ? "selected" : "rejected"}:${item.decisionId}`).join(", "),
          });
        }
        return facts;
      })(),
      rejections: uniqueReasons(dashboardDecision.rejectionReasons),
      costs: { estimated, observed, dominant: "unknown" },
      candidates,
      unresolvedProofs: [
        ...dashboardDecision.rejectionReasons.map((item) => normalizedReason(item).code),
        "runtime counters are workload-global and cannot be attributed to this region",
        ...(overlayRegion.opportunityEvidenceIds.length === 0
          ? ["mature algorithm duplication has not been ruled out"] : []),
      ],
      suggestedContract: {
        requiredPassId: dashboardDecision.passId,
        coverage: "all-loops",
        target: suggested?.target || "auto",
        guardFailure: "fallback",
      },
      witness: { path: loop.source.path, digest: dashboardRegion.repository.file.sourceDigest },
      oracles: [...new Set(oracles)].sort(),
      adversarialObligations: [
        "reject ambiguous source-map candidates",
        "reject stale source-unit and compiler implementation identities",
        "exercise every runtime guard and authenticated fallback",
      ],
      benchmarkObligations: [
        "cold end-to-end workload time",
        "warm end-to-end workload time",
        "compiler latency and emitted size",
        "resident memory and resource high-water mark",
        "public-call crossover against generic and native controls",
      ],
      generality: similar.size > 0 ? [...similar].sort()
        : [`${loop.source.path}:${loop.source.line} requires a held-out independent consumer`],
      negativeEvidence: overlayRegion.opportunityEvidenceIds.map((id) =>
        `reviewed target dispositions are retained in opportunity evidence ${id}`),
      claims: [loop.source.path],
      integration: { sharedFiles: [], owner: "optimizer-integration" },
      promotionCriteria: {
        minimumEndToEndImprovement: 0.1,
        minimumPhaseImprovement: 0.5,
        maximumRegression: 0.03,
      },
      dynamicFallback: dashboardDecision.fallbackId,
      independentVerifier: "verifyOptimizationProgram plus exact differential oracles",
      runtimeEvidence: profileViews.map((view) => ({
        profileId: view.id,
        optimizer: profileReceipts.find((receipt) => receipt.id === view.id)?.optimizer,
        routes: view.runtimeRoutes.filter((route) => route.regionId === loop.id),
      })),
    };
  }

  return Object.freeze({
    attachIdentity,
    validateDashboard: validateDashboardDocument,
    validateProfileReceipt: validateProfile,
    validateHotnessOverlay(value, context) {
      return validateHotnessOverlay(value, { ...context, reasonRegistry: DEFAULT_REASON_REGISTRY });
    },
    validateDossier(value, context) {
      return validateDossier(value, { ...context, reasonRegistry: DEFAULT_REASON_REGISTRY });
    },
    validateCampaign,
    validateOpportunityEvidence(value, context) {
      return validateReviewedOpportunityEvidence(value, context);
    },
    dashboard,
    profile: projectProfile,
    dossier: dossierDetails,
    reason: compilerReason,
    eligibilityReasons,
  });
}

const defaultAdapter = createRepositoryAdapter();

module.exports = Object.freeze({ ...defaultAdapter, createRepositoryAdapter });
