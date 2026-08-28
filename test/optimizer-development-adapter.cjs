// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { buildHotnessOverlay } = require("../tools/optimizer-development/overlay.cjs");
const { generateDossier } = require("../tools/optimizer-development/dossier.cjs");
const {
  createRepositoryAdapter,
} = require("../tools/optimizer-development/repository-adapter.cjs");
const {
  makeCompiler,
  makeReceipt,
} = require("./fixtures/optimizer-development/repository-adapter/helpers.cjs");
const {
  analyzeSources,
} = require("../scripts/optimizer-opportunity-dashboard.cjs");

const root = path.resolve(__dirname, "..");
let dashboard;
let selected;
let production;

function adapter(options = {}) {
  return createRepositoryAdapter({
    root,
    currentCompilerIdentity: dashboard.compilerIdentity,
    dashboard,
    ...options,
  });
}

test.before(async () => {
  const relativePath = "src/lib/sagejs/plotting/field_layers.py";
  const filename = path.join(root, relativePath);
  dashboard = await analyzeSources({
    root,
    compilerRoot: root,
    sources: [{
      relativePath,
      filename,
      source: fs.readFileSync(filename, "utf8"),
    }],
  });
  selected = dashboard.loops.find((loop) =>
    loop.status === "selected" && loop.functionId !== null);
  assert.ok(selected);
  production = adapter();
});

test("real dashboard and sparse receipt join by exact portable region identity", () => {
  const receipt = makeReceipt({ dashboard, loop: selected, ticks: 7, functionSamples: 500 });
  const view = production.profile(
    production.validateProfileReceipt(receipt),
    production.dashboard(production.validateDashboard(dashboard)),
  );
  assert.deepEqual(view.samples, { total: 7, attributed: 7, ambiguous: 0, unmatched: 0 });
  assert.equal(view.channels.functionSamples.total, 500);
  assert.equal(view.observations.length, 1);
  assert.equal(view.observations[0].exclusiveSamples, 7);

  const overlay = buildHotnessOverlay({
    dashboard,
    profileReceipts: [receipt],
    adapter: production,
  });
  assert.equal(overlay.regions.length, 1);
  assert.equal(overlay.regions[0].source.regionId, selected.id);
  assert.equal(overlay.regions[0].observations[0].exclusiveSamples, 7);
  assert.equal(overlay.regions[0].staticDecisions[0].decisionId, selected.decisions[0].id);
});

test("compiler options may differ but compiler implementation dimensions must agree", () => {
  const staticView = production.dashboard(production.validateDashboard(dashboard));
  const optionsOnly = production.profile(production.validateProfileReceipt(makeReceipt({
    dashboard,
    loop: selected,
    compiler: makeCompiler(dashboard, "3".repeat(64)),
  })), staticView);
  assert.equal(optionsOnly.current, true);

  const incompatible = production.profile(production.validateProfileReceipt(makeReceipt({
    dashboard,
    loop: selected,
    compiler: makeCompiler(dashboard, "4".repeat(64), {
      frontendDigest: "5".repeat(64),
    }),
  })), staticView);
  assert.equal(incompatible.current, false);
  assert.deepEqual(incompatible.samples, { total: 7, attributed: 0, ambiguous: 0, unmatched: 7 });
  assert.equal(incompatible.unmatched[0].reason.code, "evidence.stale-compiler");
});

test("sealed artifact coverage does not misclassify runtime and native ticks as map failures", () => {
  const staticView = production.dashboard(production.validateDashboard(dashboard));
  const receipt = makeReceipt({
    dashboard,
    loop: selected,
    ticks: 1,
    unmatchedTicks: 999,
    warmSealedProtocol: true,
  });
  const view = production.profile(
    production.validateProfileReceipt(receipt), staticView,
  );
  assert.deepEqual(view.samples, {
    total: 1000,
    attributed: 1,
    ambiguous: 0,
    unmatched: 999,
  });
  assert.equal(view.coverage, 1);

  const late = structuredClone(receipt);
  late.sampling.protocol.lateArtifactCount = 1;
  const { documentIdentity } = require("../tools/optimizer-development/common.cjs");
  late.id = documentIdentity(late);
  assert.throws(() => production.validateProfileReceipt(late),
    /lateArtifactCount.*must be zero/);
});

test("stale and ambiguous source mappings fail closed while conserving every tick", () => {
  const staticView = production.dashboard(production.validateDashboard(dashboard));
  const stale = production.profile(production.validateProfileReceipt(makeReceipt({
    dashboard,
    loop: selected,
    ticks: 11,
    sourceDigest: "6".repeat(64),
  })), staticView);
  assert.deepEqual(stale.samples, { total: 11, attributed: 0, ambiguous: 0, unmatched: 11 });
  assert.equal(stale.unmatched[0].reason.code, "evidence.stale-source");

  const ambiguous = production.profile(production.validateProfileReceipt(makeReceipt({
    dashboard,
    loop: selected,
    ticks: 13,
    mappingStatus: "ambiguous",
  })), staticView);
  assert.deepEqual(ambiguous.samples, { total: 13, attributed: 0, ambiguous: 13, unmatched: 0 });
  assert.equal(ambiguous.unmatched[0].reason.code, "evidence.ambiguous-source-map");
});

test("runtime route evidence remains separate and route-only regions are retained", () => {
  const receipt = makeReceipt({
    dashboard,
    loop: selected,
    ticks: 0,
    functionSamples: 0,
    routeOutcome: "guarded-fallback",
    routeCount: 9,
  });
  const overlay = buildHotnessOverlay({ dashboard, profileReceipts: [receipt], adapter: production });
  assert.equal(overlay.regions.length, 1);
  assert.equal(overlay.regions[0].observations[0].exclusiveSamples, 0);
  assert.equal(overlay.regions[0].runtimeRoutes[0].fallbackEntries, 9);
  assert.equal(overlay.regions[0].runtimeRoutes[0].optimizedEntries, 0);
  assert.equal(overlay.regions[0].staticDecisions[0].status, "selected");
  assert.equal(overlay.regions[0].recommendedAction, "investigate");
});

test("oracle failures are retained as an explicit eligibility gate", () => {
  const receipt = makeReceipt({ dashboard, loop: selected, oracleStatus: "fail" });
  const overlay = buildHotnessOverlay({ dashboard, profileReceipts: [receipt], adapter: production });
  assert.equal(overlay.regions[0].eligibility.status, "ineligible");
  assert.equal(overlay.regions[0].eligibility.reasons.some((reason) =>
    reason.code === "evidence.oracle-unverified"), true);
});

test("dossier recompiles one exact file and embeds the complete detached IR", () => {
  const dashboardDecision = selected.decisions[0];
  const legacyDecision = {
    id: "legacy-selected-region",
    passId: dashboardDecision.passId,
    selected: dashboardDecision.selected,
    source: { ...dashboardDecision.source },
    operations: ["math.ring.mul"],
  };
  const program = {
    schema: "sagejs.optimizing-mathematics/v1",
    regions: [legacyDecision],
  };
  let compiledPath = null;
  const production = adapter({ compileExactFile(filename) {
    compiledPath = filename;
    return program;
  } });
  const receipt = makeReceipt({ dashboard, loop: selected });
  const overlay = buildHotnessOverlay({ dashboard, profileReceipts: [receipt], adapter: production });
  const dossier = generateDossier({
    overlay,
    dashboard,
    profileReceipts: [receipt],
    regionId: selected.id,
    adapter: production,
  });
  assert.equal(compiledPath, path.join(root, selected.source.path));
  assert.deepEqual(JSON.parse(JSON.stringify(dossier.currentIr.program)), program);
  assert.deepEqual(JSON.parse(JSON.stringify(dossier.currentIr.decision)), legacyDecision);
  assert.equal(dossier.currentIr.decisionId, dashboardDecision.id);
  assert.equal(dossier.currentIr.legacyDecisionId, legacyDecision.id);
  assert.equal(dossier.excerpt.digest, selected.excerptDigest);
  assert.equal(dossier.costs.observed.allocations, 0);
  assert.equal(dossier.unresolvedProofs.some((item) =>
    item.includes("workload-global")), true);
});

test("dossier refuses unrecognized loops with no current compiler decision", () => {
  const loop = dashboard.loops.find((item) =>
    item.status === "unrecognized" && item.functionId !== null);
  assert.ok(loop);
  const receipt = makeReceipt({ dashboard, loop });
  const production = adapter({ compileExactFile() {
    throw new Error("must not compile an unrecognized loop");
  } });
  const overlay = buildHotnessOverlay({ dashboard, profileReceipts: [receipt], adapter: production });
  assert.throws(() => generateDossier({
    overlay,
    dashboard,
    profileReceipts: [receipt],
    regionId: loop.id,
    adapter: production,
  }), /without current optimizer decision IR/);
});

test("invalid profile identities are rejected before repository projection", () => {
  const receipt = JSON.parse(JSON.stringify(makeReceipt({ dashboard, loop: selected })));
  receipt.sampling.positionTickCounts.total += 1;
  assert.throws(() => adapter().validateProfileReceipt(receipt),
    /positionTickCounts.total|identity/i);
});
