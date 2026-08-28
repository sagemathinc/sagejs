// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const common = require("../tools/optimizer-development/common.cjs");
const identity = require("../tools/optimizer-development/identity.cjs");
const opportunity = require("../tools/optimizer-development/opportunity-evidence.cjs");

const ROOT = path.resolve(__dirname, "..");

function rawDigest(seed) {
  return common.sha256(`optimizer opportunity fixture: ${seed}`);
}

function refId(seed) {
  return `sha256:${rawDigest(seed)}`;
}

function readdress(document) {
  document.id = common.documentIdentity(document);
  return document;
}

function distribution(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    unit: "microseconds",
    samples,
    minimum: sorted[0],
    median: sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2,
    maximum: sorted[sorted.length - 1],
  };
}

function fixtureAdapter() {
  function validate(label, value) {
    common.verifyDocumentIdentity(label, value);
    return value;
  }
  return {
    validateDashboard: (value) => validate("fixture dashboard", value),
    validateWorkload: (value) => validate("fixture workload", value),
    validateProfileReceipt: (value) => validate("fixture profile", value),
  };
}

function buildFixture() {
  const compiler = identity.compilerIdentity({
    irSchema: "sagejs.optimizing-mathematics/v1",
    compilerSourceBundleId: refId("compiler source bundle"),
    frontendDigest: rawDigest("frontend"),
    catalogDigest: rawDigest("catalog"),
    optionsDigest: rawDigest("options"),
  });
  const sourceDigest = rawDigest("source bytes");
  const sourceUnit = identity.sourceUnitIdentity({
    path: "src/lib/example.py",
    digest: sourceDigest,
    language: "python",
  });
  const functionRecord = identity.functionIdentity({
    sourceUnitId: sourceUnit.id,
    qualifiedName: "example",
    kind: "function",
    semanticFingerprint: identity.semanticFingerprint({ kind: "function", body: "fold" }),
    range: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 17 },
    ordinal: 0,
  });
  const region = identity.semanticRegionIdentity({
    functionId: functionRecord.id,
    kind: "AST_ForIn",
    semanticFingerprint: identity.semanticFingerprint({ kind: "for", body: "mul-add" }),
    range: { startLine: 3, startColumn: 4, endLine: 4, endColumn: 29 },
    ordinal: 0,
  });
  const source = {
    path: "src/lib/example.py",
    range: region.range,
    sourceUnitId: sourceUnit.id,
    functionId: functionRecord.id,
    regionId: region.id,
    semanticFingerprint: region.semanticFingerprint,
    excerptDigest: rawDigest("source excerpt"),
  };
  const childRegion = identity.semanticRegionIdentity({
    functionId: functionRecord.id,
    kind: "AST_ForIn",
    semanticFingerprint: identity.semanticFingerprint({ kind: "for", body: "inner modular scan" }),
    range: { startLine: 4, startColumn: 8, endLine: 4, endColumn: 25 },
    ordinal: 1,
  });
  const childSource = {
    path: source.path,
    range: childRegion.range,
    sourceUnitId: source.sourceUnitId,
    functionId: source.functionId,
    regionId: childRegion.id,
    semanticFingerprint: childRegion.semanticFingerprint,
    excerptDigest: rawDigest("child source excerpt"),
  };
  const sourceBundle = common.attachIdentity("sagejs.optimizer-source-bundle/v1", {
    files: [{ path: source.path, digest: sourceDigest, bytes: 200 }],
  });
  const compilerDecision = {
    decisionId: refId("modular sequence reconnaissance decision"),
    passId: "math.modular-sequence-reconnaissance.v1",
  };
  const dashboard = common.attachIdentity("fixture.optimizer-dashboard/v1", {
    sourceBundle,
    compilerIdentity: compiler,
    loops: [{
      id: region.id,
      source: {
        path: source.path,
        line: source.range.startLine,
        column: source.range.startColumn,
        endLine: source.range.endLine,
        endColumn: source.range.endColumn,
      },
      sourceUnitId: source.sourceUnitId,
      functionId: source.functionId,
      semanticFingerprint: source.semanticFingerprint,
      excerptDigest: source.excerptDigest,
      decisions: [{
        id: compilerDecision.decisionId,
        passId: compilerDecision.passId,
        selected: false,
      }],
    }, {
      id: childRegion.id,
      source: {
        path: childSource.path,
        line: childSource.range.startLine,
        column: childSource.range.startColumn,
        endLine: childSource.range.endLine,
        endColumn: childSource.range.endColumn,
      },
      sourceUnitId: childSource.sourceUnitId,
      functionId: childSource.functionId,
      semanticFingerprint: childSource.semanticFingerprint,
      excerptDigest: childSource.excerptDigest,
      decisions: [],
    }],
  });
  const outputDigest = rawDigest("exact mathematical output");
  const workload = common.attachIdentity("fixture.optimizer-workload/v1", {
    input: { digest: rawDigest("workload input") },
    corpus: { id: "public-polynomial" },
    oracles: [{ id: "exact-output", expectedDigest: outputDigest }],
    phases: [{ id: "normalization-factor", label: "Normalization factor" }],
    protocol: { repetitions: 11 },
  });
  const baselineSamples = Array.from({ length: 11 }, (_, index) => 120 + index);
  const feasibleSamples = Array.from({ length: 11 }, (_, index) => 80 + index);
  const negativeSamples = Array.from({ length: 11 }, (_, index) => 105 + index);

  function profile(seed, target, samples, { ticks = false, selected = false, route = false } = {}) {
    const mapping = {
      status: "attributed",
      candidates: [{
        sourceUnitId: childSource.sourceUnitId,
        functionId: childSource.functionId,
        regionId: childSource.regionId,
        path: childSource.path,
        range: childSource.range,
        confidence: 1,
      }],
    };
    return common.attachIdentity("fixture.optimizer-profile/v1", {
      workload: { id: workload.id },
      compiler,
      sourceBundle,
      host: {
        platform: "linux",
        architecture: "x64",
        runtime: "node",
        runtimeVersion: "26.7.0",
        engine: "v8",
        engineVersion: "14.2",
      },
      configuration: {
        target,
        mode: "sage",
        environmentDigest: rawDigest("shared environment"),
      },
      outcome: { status: "success", error: null },
      output: {
        digest: outputDigest,
        oracleResults: [{ id: "exact-output", status: "pass", digest: outputDigest }],
      },
      execution: { warm: distribution(samples) },
      phases: [{ id: "normalization-factor", cold: distribution(samples),
        warm: distribution(samples) }],
      sampling: {
        positionTicks: ticks ? [{ ticks: 37, mapping }] : [],
        ...(ticks ? { protocol: {
          scope: "warm-prepared-sealed-generated-javascript-execution",
          preparationMicroseconds: 12_000,
          warmupRuns: 2,
          repetitions: 3,
          declaredArtifactCount: 1,
          authenticatedArtifactCount: 1,
          lateArtifactCount: 0,
          closureDigest: rawDigest("authenticated prepared closure"),
        } } : {}),
      },
      optimizer: {
        regions: selected ? [{ regionId: source.regionId, selected: true }] : [],
      },
      runtime: {
        routeEvents: route ? [{ mapping: {
          status: "attributed",
          candidates: [{
            sourceUnitId: source.sourceUnitId,
            functionId: source.functionId,
            regionId: source.regionId,
          }],
        } }] : [],
      },
      fixtureSeed: seed,
    });
  }

  const baseline = profile("baseline", "generic", baselineSamples, { ticks: true });
  const feasible = profile("feasible", "v8", feasibleSamples);
  const negative = profile("losing native", "native", negativeSamples);
  const profiles = [baseline, feasible, negative];
  const negativeIds = [negative.id].sort();
  const pairs = baselineSamples.map((baselineMicroseconds, index) => ({
    order: ["AB", "BA", "BA", "AB"][index % 4],
    baselineMicroseconds,
    feasibleLowerBoundMicroseconds: feasibleSamples[index],
    baselineOutputDigest: outputDigest,
    feasibleOutputDigest: outputDigest,
  }));
  const statistics = opportunity.computeOpportunityStatistics(pairs);
  const scopePayload = {
    candidateScope: "fused-outer-region",
    phaseId: "normalization-factor",
    path: source.path,
    range: source.range,
    sourceUnitId: source.sourceUnitId,
    functionId: source.functionId,
    primaryRegionId: source.regionId,
    hotChildRegionIds: [childSource.regionId].sort(),
  };
  const scope = {
    id: opportunity.opportunityScopeIdentity(scopePayload),
    ...scopePayload,
  };
  const payload = {
    status: "eligible",
    dashboard: {
      id: dashboard.id,
      sourceBundleId: dashboard.sourceBundle.id,
      compilerId: compiler.id,
    },
    compiler,
    compilerDecision,
    source,
    scope,
    workload: {
      id: workload.id,
      inputDigest: workload.input.digest,
      corpusId: workload.corpus.id,
    },
    profiles: {
      attributionId: baseline.id,
      baselineId: baseline.id,
      feasibleLowerBoundId: feasible.id,
      negativeIds,
    },
    feasibleCandidate: {
      id: "primitive-modular-fold",
      target: "v8",
      status: "lower-bound-only",
      representation: "guarded exact binary64 integers",
      compilerRoute: "none",
      scopeId: scope.id,
      candidateScope: scope.candidateScope,
    },
    measurement: {
      method: opportunity.PAIRING_METHOD,
      scope: "complete-warm-workload",
      pairs,
      statistics,
    },
    classification: {
      primary: "compiler-rejection",
      rationale: "A complete exact workload isolates one unsupported reusable fold shape.",
      profileIds: [baseline.id, feasible.id].sort(),
    },
    matureAlgorithm: {
      disposition: "not-duplicate",
      rationale: "The opportunity removes dynamic representation cost without replacing the algorithm.",
      profileIds: [baseline.id, negative.id].sort(),
    },
    negativeEvidence: [{
      profileId: negative.id,
      target: "native",
      disposition: "measured-slower",
      medianMicroseconds: negative.execution.warm.median,
      slowdownVersusFeasible:
        negative.execution.warm.median / feasible.execution.warm.median,
      summary: "The complete native candidate loses to the feasible V8 lower bound.",
    }].sort((left, right) => left.profileId.localeCompare(right.profileId)),
  };
  const context = { dashboard, workload, profileReceipts: profiles };
  return { adapter: fixtureAdapter(), baseline, childSource, compilerDecision, context,
    dashboard, feasible,
    negative, outputDigest, pairs, payload, scope, source, workload };
}

function validDocument(fixture = buildFixture()) {
  return opportunity.createOpportunityEvidence(
    fixture.payload, fixture.context, fixture.adapter,
  );
}

test("opportunity evidence schema is strict and versioned", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    ROOT, "architecture/optimizer-development/opportunity-evidence-v1.schema.json",
  ), "utf8"));
  assert.equal(schema.properties.schema.const, opportunity.OPPORTUNITY_EVIDENCE_SCHEMA);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.measurement.properties.pairs.minItems, 11);
  assert.equal(schema.properties.feasibleCandidate.properties.status.const, "lower-bound-only");
  assert.deepEqual(schema.properties.scope.properties.candidateScope.enum,
    ["fused-outer-region", "inner-loop-only"]);
});

test("reviewed evidence binds current identities and recomputes a positive lower bound", () => {
  const fixture = buildFixture();
  const document = validDocument(fixture);
  assert.equal(document.measurement.statistics.pairCount, 11);
  assert.equal(document.measurement.statistics.positivePairs, 11);
  assert.equal(document.measurement.statistics.removableWallLowerMicroseconds, 40);
  assert.equal(document.measurement.statistics.removableFractionLower, 40 / 130);
  assert.equal(document.negativeEvidence[0].profileId, fixture.negative.id);
  assert.equal(document.scope.hotChildRegionIds[0], fixture.childSource.regionId);
  assert.equal(document.feasibleCandidate.scopeId, document.scope.id);
  assert.deepEqual(document.compilerDecision, fixture.compilerDecision);
  assert(Object.isFrozen(document));
  assert(Object.isFrozen(document.measurement.pairs[0]));
});

test("a reviewed composite phase is selectable without claiming complete-call timing", () => {
  const fixture = buildFixture();
  const document = structuredClone(validDocument(fixture));
  document.measurement.scope = "reviewed-phase";
  readdress(document);
  const checked = opportunity.validateOpportunityEvidence(
    document, fixture.context, fixture.adapter,
  );
  assert.equal(checked.measurement.scope, "reviewed-phase");

  const missing = structuredClone(fixture.context);
  const feasibleIndex = missing.profileReceipts.findIndex(
    (profile) => profile.id === fixture.feasible.id,
  );
  missing.profileReceipts[feasibleIndex].phases = [];
  readdress(missing.profileReceipts[feasibleIndex]);
  const invalid = structuredClone(document);
  invalid.profiles.feasibleLowerBoundId = missing.profileReceipts[feasibleIndex].id;
  invalid.classification.profileIds = [
    invalid.profiles.baselineId,
    invalid.profiles.feasibleLowerBoundId,
  ].sort();
  readdress(invalid);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    invalid, missing, fixture.adapter,
  ), /does not measure reviewed phase/);
});

test("one lucky pair cannot manufacture a positive conservative bound", () => {
  const output = rawDigest("statistical output");
  const pairs = Array.from({ length: 11 }, (_, index) => ({
    order: ["AB", "BA", "BA", "AB"][index % 4],
    baselineMicroseconds: 100,
    feasibleLowerBoundMicroseconds: index === 0 ? 1 : 101,
    baselineOutputDigest: output,
    feasibleOutputDigest: output,
  }));
  const statistics = opportunity.computeOpportunityStatistics(pairs);
  assert.equal(statistics.positivePairs, 1);
  assert.equal(statistics.removableWallLowerMicroseconds, 0);
  assert.equal(statistics.removableFractionLower, 0);
});

test("ABBA ordering and eleven-pair minimum fail closed", () => {
  const fixture = buildFixture();
  assert.throws(() => opportunity.computeOpportunityStatistics(fixture.pairs.slice(0, 10)),
    /at least 11/);
  const wrongOrder = structuredClone(fixture.pairs);
  wrongOrder[5].order = "AB";
  assert.throws(() => opportunity.computeOpportunityStatistics(wrongOrder),
    /deterministic ABBA order/);
});

test("stale document and current dashboard identities fail closed", () => {
  const fixture = buildFixture();
  const document = structuredClone(validDocument(fixture));
  document.classification.rationale = "Mutated after addressing.";
  assert.throws(() => opportunity.validateOpportunityEvidence(
    document, fixture.context, fixture.adapter,
  ), /id: is stale/);

  const current = buildFixture();
  const counterfeit = structuredClone(validDocument(current));
  counterfeit.dashboard.id = refId("different dashboard");
  readdress(counterfeit);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    counterfeit, current.context, current.adapter,
  ), /does not match the exact current dashboard/);
});

test("counterfeit region and compiler implementation tuples fail closed", () => {
  const fixture = buildFixture();
  const wrongSource = structuredClone(validDocument(fixture));
  wrongSource.source.excerptDigest = rawDigest("counterfeit excerpt");
  readdress(wrongSource);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    wrongSource, fixture.context, fixture.adapter,
  ), /exact current dashboard region/);

  const wrongCompiler = structuredClone(validDocument(fixture));
  wrongCompiler.compiler.optionsDigest = rawDigest("counterfeit compiler options");
  wrongCompiler.compiler = identity.compilerIdentity({
    irSchema: wrongCompiler.compiler.irSchema,
    compilerSourceBundleId: wrongCompiler.compiler.compilerSourceBundleId,
    frontendDigest: wrongCompiler.compiler.frontendDigest,
    catalogDigest: wrongCompiler.compiler.catalogDigest,
    optionsDigest: wrongCompiler.compiler.optionsDigest,
  });
  readdress(wrongCompiler);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    wrongCompiler, fixture.context, fixture.adapter,
  ), /implementation tuple does not match/);
});

test("reviewed evidence binds one exact current compiler decision", () => {
  const fixture = buildFixture();
  const counterfeit = structuredClone(validDocument(fixture));
  counterfeit.compilerDecision.decisionId = refId("different compiler decision");
  readdress(counterfeit);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    counterfeit, fixture.context, fixture.adapter,
  ), /does not identify exactly one current dashboard decision/);

  const alreadySelectedContext = structuredClone(fixture.context);
  alreadySelectedContext.dashboard.loops[0].decisions[0].selected = true;
  readdress(alreadySelectedContext.dashboard);
  const selected = structuredClone(validDocument(fixture));
  selected.dashboard.id = alreadySelectedContext.dashboard.id;
  readdress(selected);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    selected, alreadySelectedContext, fixture.adapter,
  ), /cannot bind an already-selected decision/);
});

test("runtime profiling options may differ while compiler implementation stays exact", () => {
  const fixture = buildFixture();
  const context = structuredClone(fixture.context);
  for (const profile of context.profileReceipts) {
    profile.compiler = identity.compilerIdentity({
      irSchema: profile.compiler.irSchema,
      compilerSourceBundleId: profile.compiler.compilerSourceBundleId,
      frontendDigest: profile.compiler.frontendDigest,
      catalogDigest: profile.compiler.catalogDigest,
      optionsDigest: rawDigest(`runtime options ${profile.fixtureSeed}`),
    });
    readdress(profile);
  }
  const bySeed = new Map(context.profileReceipts.map((profile) =>
    [profile.fixtureSeed, profile]));
  const document = structuredClone(validDocument(fixture));
  document.profiles.attributionId = bySeed.get("baseline").id;
  document.profiles.baselineId = bySeed.get("baseline").id;
  document.profiles.feasibleLowerBoundId = bySeed.get("feasible").id;
  document.profiles.negativeIds = [bySeed.get("losing native").id];
  document.classification.profileIds = [
    bySeed.get("baseline").id,
    bySeed.get("feasible").id,
  ].sort();
  document.matureAlgorithm.profileIds = [
    bySeed.get("baseline").id,
    bySeed.get("losing native").id,
  ].sort();
  document.negativeEvidence[0].profileId = bySeed.get("losing native").id;
  readdress(document);
  assert.doesNotThrow(() => opportunity.validateOpportunityEvidence(
    document, { ...context, profileReceipts: [...bySeed.values()] }, fixture.adapter,
  ));

  const counterfeit = structuredClone(bySeed.get("feasible"));
  counterfeit.compiler = identity.compilerIdentity({
    irSchema: counterfeit.compiler.irSchema,
    compilerSourceBundleId: counterfeit.compiler.compilerSourceBundleId,
    frontendDigest: rawDigest("different frontend implementation"),
    catalogDigest: counterfeit.compiler.catalogDigest,
    optionsDigest: counterfeit.compiler.optionsDigest,
  });
  readdress(counterfeit);
  const bad = structuredClone(document);
  bad.profiles.feasibleLowerBoundId = counterfeit.id;
  bad.classification.profileIds = [bad.profiles.baselineId, counterfeit.id].sort();
  readdress(bad);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    bad,
    { ...context, profileReceipts: [bySeed.get("baseline"), counterfeit,
      bySeed.get("losing native")] },
    fixture.adapter,
  ), /does not match the reviewed compiler implementation tuple/);
});

test("profile and workload references cannot be absent or counterfeit", () => {
  const fixture = buildFixture();
  const missing = structuredClone(validDocument(fixture));
  missing.profiles.feasibleLowerBoundId = refId("missing profile");
  readdress(missing);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    missing, fixture.context, fixture.adapter,
  ), /missing validated profile/);

  const wrongWorkload = structuredClone(validDocument(fixture));
  wrongWorkload.workload.inputDigest = rawDigest("wrong input");
  readdress(wrongWorkload);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    wrongWorkload, fixture.context, fixture.adapter,
  ), /exact validated workload/);
});

test("per-pair mathematical output mismatches fail before performance claims", () => {
  const fixture = buildFixture();
  const document = structuredClone(validDocument(fixture));
  document.measurement.pairs[7].feasibleOutputDigest = rawDigest("wrong answer");
  readdress(document);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    document, fixture.context, fixture.adapter,
  ), /outputs must be exactly equal/);

  const corruptContext = structuredClone(fixture.context);
  const feasibleIndex = corruptContext.profileReceipts.findIndex(
    (profile) => profile.id === fixture.feasible.id,
  );
  corruptContext.profileReceipts[feasibleIndex].output.oracleResults[0].digest =
    rawDigest("counterfeit oracle");
  readdress(corruptContext.profileReceipts[feasibleIndex]);
  const oracleMismatch = structuredClone(validDocument(fixture));
  oracleMismatch.profiles.feasibleLowerBoundId =
    corruptContext.profileReceipts[feasibleIndex].id;
  oracleMismatch.classification.profileIds = [
    fixture.baseline.id,
    corruptContext.profileReceipts[feasibleIndex].id,
  ].sort();
  readdress(oracleMismatch);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    oracleMismatch, corruptContext, fixture.adapter,
  ), /oracle exact-output digest does not match/);
});

test("claimed statistics are recomputed from the paired raw observations", () => {
  const fixture = buildFixture();
  const forgedStatistics = structuredClone(validDocument(fixture));
  forgedStatistics.measurement.statistics.removableWallLowerMicroseconds += 1;
  readdress(forgedStatistics);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    forgedStatistics, fixture.context, fixture.adapter,
  ), /statistics.*does not match/);

  const forgedSample = structuredClone(validDocument(fixture));
  forgedSample.measurement.pairs[0].baselineMicroseconds -= 5;
  readdress(forgedSample);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    forgedSample, fixture.context, fixture.adapter,
  ), /statistics.*does not match/);
});

test("eligible baseline attribution requires an authenticated sealed warm closure", () => {
  const fixture = buildFixture();
  const missingProtocolContext = structuredClone(fixture.context);
  const baselineIndex = missingProtocolContext.profileReceipts.findIndex(
    (profile) => profile.id === fixture.baseline.id,
  );
  delete missingProtocolContext.profileReceipts[baselineIndex].sampling.protocol;
  readdress(missingProtocolContext.profileReceipts[baselineIndex]);
  const missingProtocol = structuredClone(validDocument(fixture));
  missingProtocol.profiles.attributionId =
    missingProtocolContext.profileReceipts[baselineIndex].id;
  missingProtocol.profiles.baselineId =
    missingProtocolContext.profileReceipts[baselineIndex].id;
  missingProtocol.classification.profileIds = [
    missingProtocol.profiles.baselineId,
    fixture.feasible.id,
  ].sort();
  missingProtocol.matureAlgorithm.profileIds = [
    missingProtocol.profiles.baselineId,
    fixture.negative.id,
  ].sort();
  readdress(missingProtocol);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    missingProtocol, missingProtocolContext, fixture.adapter,
  ), /requires an explicit warm prepared sealed sampling protocol/);

  const lateContext = structuredClone(fixture.context);
  const lateBaselineIndex = lateContext.profileReceipts.findIndex(
    (profile) => profile.id === fixture.baseline.id,
  );
  lateContext.profileReceipts[lateBaselineIndex].sampling.protocol.lateArtifactCount = 1;
  readdress(lateContext.profileReceipts[lateBaselineIndex]);
  const late = structuredClone(validDocument(fixture));
  late.profiles.attributionId = lateContext.profileReceipts[lateBaselineIndex].id;
  late.profiles.baselineId = lateContext.profileReceipts[lateBaselineIndex].id;
  late.classification.profileIds = [late.profiles.baselineId, fixture.feasible.id].sort();
  late.matureAlgorithm.profileIds = [late.profiles.baselineId, fixture.negative.id].sort();
  readdress(late);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    late, lateContext, fixture.adapter,
  ), /requires zero artifacts declared after the closure was sealed/);
});

test("a feasible lower-bound prototype cannot masquerade as a compiler route", () => {
  const fixture = buildFixture();
  const context = structuredClone(fixture.context);
  const feasibleIndex = context.profileReceipts.findIndex(
    (profile) => profile.id === fixture.feasible.id,
  );
  context.profileReceipts[feasibleIndex].optimizer.regions = [{
    regionId: fixture.source.regionId,
    selected: true,
  }];
  readdress(context.profileReceipts[feasibleIndex]);
  const document = structuredClone(validDocument(fixture));
  document.profiles.feasibleLowerBoundId = context.profileReceipts[feasibleIndex].id;
  document.classification.profileIds = [
    fixture.baseline.id,
    context.profileReceipts[feasibleIndex].id,
  ].sort();
  readdress(document);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    document, context, fixture.adapter,
  ), /must not claim an optimizer-selected or runtime route/);
});

test("composite scope prevents inner-loop evidence from claiming a fused outer region", () => {
  const fixture = buildFixture();
  const wrongCandidateScope = structuredClone(validDocument(fixture));
  wrongCandidateScope.feasibleCandidate.candidateScope = "inner-loop-only";
  readdress(wrongCandidateScope);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    wrongCandidateScope, fixture.context, fixture.adapter,
  ), /does not bind the exact reviewed composite scope/);

  const counterfeitChild = structuredClone(validDocument(fixture));
  const scopePayload = {
    candidateScope: counterfeitChild.scope.candidateScope,
    phaseId: counterfeitChild.scope.phaseId,
    path: counterfeitChild.scope.path,
    range: counterfeitChild.scope.range,
    sourceUnitId: counterfeitChild.scope.sourceUnitId,
    functionId: counterfeitChild.scope.functionId,
    primaryRegionId: counterfeitChild.scope.primaryRegionId,
    hotChildRegionIds: [refId("counterfeit hot child")],
  };
  counterfeitChild.scope = {
    id: opportunity.opportunityScopeIdentity(scopePayload),
    ...scopePayload,
  };
  counterfeitChild.feasibleCandidate.scopeId = counterfeitChild.scope.id;
  readdress(counterfeitChild);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    counterfeitChild, fixture.context, fixture.adapter,
  ), /must resolve .* exactly once in the current dashboard/);
});

test("negative target profiles and their measured costs are preserved exactly", () => {
  const fixture = buildFixture();
  const omitted = structuredClone(validDocument(fixture));
  omitted.negativeEvidence = [];
  readdress(omitted);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    omitted, fixture.context, fixture.adapter,
  ), /at least 1/);

  const forged = structuredClone(validDocument(fixture));
  forged.negativeEvidence[0].slowdownVersusFeasible = 1;
  readdress(forged);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    forged, fixture.context, fixture.adapter,
  ), /comparative statistics do not match/);
});

test("excellent timings cannot override an available mature algorithm", () => {
  const fixture = buildFixture();
  const document = structuredClone(validDocument(fixture));
  document.matureAlgorithm = {
    disposition: "mature-algorithm-available",
    rationale: "The dense-list body is a reference oracle; mature production arithmetic already exists.",
    profileIds: [fixture.baseline.id, fixture.negative.id].sort(),
  };
  document.negativeEvidence[0].summary =
    "The candidate duplicates a mature production algorithm despite excellent isolated timings.";
  readdress(document);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    document, fixture.context, fixture.adapter,
  ), /must rule out duplicating a mature algorithm/);

  document.status = "rejected";
  readdress(document);
  const preserved = opportunity.validateOpportunityEvidence(
    document, fixture.context, fixture.adapter,
  );
  assert.equal(preserved.status, "rejected");
  assert.equal(
    preserved.matureAlgorithm.disposition,
    "mature-algorithm-available",
  );
  assert.equal(preserved.negativeEvidence.length, 1);
});

test("unknown fields and counterfeit validated profile identities fail closed", () => {
  const fixture = buildFixture();
  const unknown = structuredClone(validDocument(fixture));
  unknown.score = 100;
  readdress(unknown);
  assert.throws(() => opportunity.validateOpportunityEvidence(
    unknown, fixture.context, fixture.adapter,
  ), /fields must be exactly/);

  const context = structuredClone(fixture.context);
  context.profileReceipts[0].fixtureSeed = "mutated without readdressing";
  assert.throws(() => opportunity.validateOpportunityEvidence(
    validDocument(fixture), context, fixture.adapter,
  ), /fixture profile.id: is stale/);
});
