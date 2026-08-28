// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { buildHotnessOverlay } = require("../tools/optimizer-development/overlay.cjs");
const { generateDossier } = require("../tools/optimizer-development/dossier.cjs");
const { claimsOverlap, generateCampaign } = require("../tools/optimizer-development/campaign.cjs");
const adapter = require("./fixtures/optimizer-development/dossiers/adapter.cjs");

const fixtures = path.join(__dirname, "fixtures/optimizer-development/dossiers");
const load = (name) => JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));

function approvedDossier() {
  const dashboard = load("dashboard.json");
  const profileReceipts = [load("profile-current.json")];
  const overlay = buildHotnessOverlay({ dashboard, profileReceipts, adapter });
  const draft = generateDossier({ overlay, dashboard, profileReceipts,
    regionId: adapter.cid("region:hot"), adapter });
  const { schema, id: _id, ...payload } = draft;
  return adapter.attachIdentity(schema, { ...payload, status: "approved" });
}

const tasks = [
  {
    id: "bounded-proof", role: "semantic-proof", objective: "Prove packed ownership and ranges",
    claims: ["src/compiler/analysis/bounded-proof.ts"], oracles: ["CPython and O0"],
    taskTemplate: "agents/campaigns/bounded-proof.json", deliverables: ["verified proof plan"],
  },
  {
    id: "bounded-target", role: "target", objective: "Lower verified plans to V8",
    claims: ["src/compiler/targets/bounded-v8.ts"], dependencies: ["bounded-proof"],
    taskTemplate: "agents/campaigns/bounded-target.json", deliverables: ["V8 lowering"],
  },
  {
    id: "bounded-integration", role: "integration", objective: "Integrate and promote the campaign",
    claims: ["src/compiler/passes/registry.ts", "test/compiler/bounded-integration.cjs"],
    dependencies: ["bounded-proof", "bounded-target"],
    taskTemplate: "agents/campaigns/bounded-integration.json", deliverables: ["promotion receipt"],
  },
];

function proposal(taskProposals = tasks) {
  return {
    owner: "optimizer-integration",
    hypothesis: "A proved packed representation removes material conversion time in two consumers.",
    selectionEvidence: ["authenticated profile hot region", "one stable rejection reason"],
    interfaces: [{ name: "bounded-plan", schema: "sagejs.bounded-plan/v1",
      digest: adapter.digest("bounded-plan"), owner: "bounded-proof" }],
    targets: ["v8", "wasm"],
    tasks: taskProposals,
    sharedIntegrationClaims: ["src/compiler/passes/registry.ts"],
    dependencies: [],
    oracles: ["CPython", "O0", "independent modular oracle"],
    acceptance: { minimumEndToEndImprovement: 0.1, minimumPhaseImprovement: 0.5,
      maximumRegression: 0.02, requiredConsumers: 2 },
    platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
    evidencePolicy: { id: "campaign-one", digest: adapter.digest("campaign-one") },
  };
}

const baseCommit = "0123456789abcdef0123456789abcdef01234567";

test("campaign dry-run is deterministic and projects real parallel:new contracts", () => {
  const args = { dossier: approvedDossier(), baseCommit, proposal: proposal(), adapter };
  const first = generateCampaign(args);
  const second = generateCampaign(args);
  assert.deepEqual(first, second);
  assert.equal(first.campaign.schema, "sagejs.optimizer-campaign/v1");
  assert.equal(first.campaign.status, "proposed");
  assert.equal(first.projections.length, 3);
  assert.deepEqual(first.projections[0].parallelNew.argv.slice(0, 4),
    ["pnpm", "parallel:new", "--", "bounded-integration"]);
  assert.equal(first.projections[0].taskContract.$schema, "../task.schema.json");
});

test("claim overlap is path-aware and fails closed", () => {
  assert.equal(claimsOverlap("src/compiler", "src/compiler/pass.ts"), true);
  assert.equal(claimsOverlap("src/compiler-a", "src/compiler-b"), false);
  const bad = JSON.parse(JSON.stringify(tasks));
  bad[1].claims = ["src/compiler/analysis"];
  assert.throws(() => generateCampaign({ dossier: approvedDossier(), baseCommit,
    proposal: proposal(bad), adapter }), /proposed claim overlap/);
});

test("shared registries can only be claimed by the integration lane", () => {
  const bad = JSON.parse(JSON.stringify(tasks));
  bad[0].claims.push("src/compiler/passes/registry.ts");
  assert.throws(() => generateCampaign({ dossier: approvedDossier(), baseCommit,
    proposal: proposal(bad), adapter }), /shared integration claim/);
});

test("cycles and conflicts with active parallel contracts are rejected", () => {
  const cyclic = JSON.parse(JSON.stringify(tasks));
  cyclic[0].dependencies = ["bounded-target"];
  assert.throws(() => generateCampaign({ dossier: approvedDossier(), baseCommit,
    proposal: proposal(cyclic), adapter }), /dependency cycle/);
  assert.throws(() => generateCampaign({ dossier: approvedDossier(), baseCommit,
    proposal: proposal(), adapter,
    existingContracts: [{ id: "live", status: "active", claims: ["src/compiler/targets"] }],
  }), /overlaps active task/);
});

test("only an explicitly approved compiler-campaign dossier can create tasks", () => {
  const draft = approvedDossier();
  const { schema, id: _id, ...payload } = draft;
  const notApproved = adapter.attachIdentity(schema, { ...payload, status: "draft" });
  assert.throws(() => generateCampaign({ dossier: notApproved, baseCommit,
    proposal: proposal(), adapter }), /approved dossier/);
});
