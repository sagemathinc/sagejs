// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { buildHotnessOverlay } = require("../tools/optimizer-development/overlay.cjs");
const { generateDossier } = require("../tools/optimizer-development/dossier.cjs");
const adapter = require("./fixtures/optimizer-development/dossiers/adapter.cjs");

const fixtures = path.join(__dirname, "fixtures/optimizer-development/dossiers");
const load = (name) => JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));

function evidence() {
  const dashboard = load("dashboard.json");
  const profileReceipts = [load("profile-current.json")];
  const overlay = buildHotnessOverlay({ dashboard, profileReceipts, adapter });
  return { overlay, dashboard, profileReceipts };
}

test("dossier is an exact-region projection with full IR and complete obligations", () => {
  const inputs = evidence();
  const dossier = generateDossier({ ...inputs, regionId: adapter.cid("region:hot"), adapter });
  assert.equal(dossier.schema, "sagejs.optimizer-dossier/v1");
  assert.equal(dossier.source.regionId, adapter.cid("region:hot"));
  assert.equal(dossier.recommendedAction, "compiler-campaign");
  assert.equal(dossier.classification, "compiler-rejection");
  assert.equal(dossier.currentIr.program.schema, "sagejs.optimizing-mathematics/v1");
  assert.deepEqual(dossier.currentIr.decision.operations, ["load", "mul", "store"]);
  assert.deepEqual(dossier.unresolvedProofs, ["bounded-integer.mutable-buffer-access"]);
  assert.equal(dossier.generality.length, 1);
  assert.equal(dossier.benchmarkObligations.includes("resource"), true);
});

test("a missing complete optimizer program fails closed", () => {
  const inputs = evidence();
  const bad = { ...adapter, dossier(args) {
    const details = adapter.dossier(args);
    details.currentIr = null;
    return details;
  } };
  assert.throws(() => generateDossier({
    ...inputs, regionId: adapter.cid("region:hot"), adapter: bad,
  }), /complete detached optimizer program/);
});

test("dossiers require exact IDs rather than ambiguous path-line selectors", () => {
  assert.throws(() => generateDossier({
    ...evidence(), regionId: "src/lib/example.py:10", adapter,
  }), /exact region identity not present/);
});

test("dossier generation refuses to detach from its authenticated profile receipt", () => {
  const inputs = evidence();
  assert.throws(() => generateDossier({
    ...inputs, profileReceipts: [load("profile-stale.json")],
    regionId: adapter.cid("region:hot"), adapter,
  }), /missing authenticated profile receipt/);
});

test("known losing target evidence is retained and classified as rejection", () => {
  const dossier = generateDossier({
    ...evidence(), regionId: adapter.cid("region:negative"), adapter,
  });
  assert.equal(dossier.recommendedAction, "reject");
  assert.equal(dossier.status, "rejected");
  assert.match(dossier.negativeEvidence[0], /26x/);
  assert.equal(dossier.candidates.every((item) => item.status === "rejected"), true);
});
