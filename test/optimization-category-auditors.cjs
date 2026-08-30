// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const auditors = require("../tools/optimization-engine/auditors.cjs");
const contracts = require("../tools/optimization-engine/contracts.cjs");
const categories = require("../tools/optimization-engine/category-contracts.cjs");
const fixture = require("./fixtures/optimization-engine/helpers.cjs");

function base() {
  const epoch = fixture.epoch();
  const workload = fixture.workload();
  const subject = fixture.subject(epoch, workload);
  return { epoch, workload, subject };
}

function audit(category, mutate = null) {
  const state = base();
  const proposal = fixture.proposal(category);
  const evidence = fixture.evidence(state.epoch, proposal);
  if (mutate) mutate({ ...state, proposal, evidence });
  return auditors.auditIntervention({
    epoch: state.epoch,
    subject: state.subject,
    proposal,
  }, { evidence });
}

test("every category has one complete deterministic positive audit", () => {
  for (const category of contracts.INTERVENTION_CATEGORIES) {
    const result = audit(category);
    assert.equal(result.intervention.category, category);
    assert.equal(result.audit.status, "eligible");
    assert.deepEqual(
      result.audit.requiredLaneRoles,
      categories.requiredLaneRoles(category),
    );
  }
});
test("every category investigates missing authority and rejects cross-epoch authority", () => {
  for (const category of contracts.INTERVENTION_CATEGORIES) {
    const missing = audit(category, ({ evidence }) => evidence.pop());
    assert.equal(missing.audit.status, "investigate", category);
    assert.ok(missing.audit.requirements.some((requirement) => requirement.status === "missing"));

    const wrongEpoch = audit(category, ({ evidence }) => {
      evidence[0].epochId = fixture.id(`wrong-${category}`);
    });
    assert.equal(wrongEpoch.audit.status, "rejected", category);
    assert.ok(wrongEpoch.audit.requirements.some((requirement) => requirement.status === "fail"));
  }
});

test("mature capability rejects duplicate algorithm and compiler proposals", () => {
  for (const category of ["algorithm", "compiler"]) {
    const result = audit(category, ({ proposal, evidence, epoch }) => {
      proposal.matureCapability.status = "available";
      proposal.matureCapability.capabilityIds = [fixture.id(`${category}-duplicate`)];
      evidence.push({ id: proposal.matureCapability.capabilityIds[0], epochId: epoch.id });
    });
    assert.equal(result.audit.status, "rejected");
    assert.ok(result.audit.requirements.some(
      (requirement) => requirement.code === "duplicate-mature-capability",
    ));
  }
});

test("cache invalidation coverage and compiler-only fields fail closed", () => {
  const cacheProposal = fixture.proposal("cache");
  cacheProposal.specific.invalidationDimensions.pop();
  assert.throws(
    () => categories.validateCategoryDetails("cache", "cache", cacheProposal.specific),
    /cover every|at least/,
  );

  const library = fixture.proposal("library-route");
  library.specific.decisionId = fixture.id("counterfeit-decision");
  assert.throws(
    () => categories.validateCategoryDetails("library", "library-route", library.specific),
    /fields must be exactly/,
  );

  const compiler = fixture.proposal("compiler");
  delete compiler.specific.optimizerProgramId;
  assert.throws(
    () => categories.validateCategoryDetails("compiler", "compiler", compiler.specific),
    /fields must be exactly/,
  );
});

function candidate(category, overrides = {}) {
  const audited = audit(category);
  const representative = fixture.id(`representative-${category}`);
  const heldOut = fixture.id(`heldout-${category}`);
  return {
    intervention: audited.intervention,
    audit: audited.audit,
    feasibility: {
      epochId: audited.intervention.binding.epochId,
      outputEquivalent: true,
      fallbackComplete: true,
      costBoundaryComplete: true,
      matureAuditComplete: true,
      semanticObligationsResolved: true,
      platformFallbackComplete: true,
      negativeEvidenceRetained: true,
      comparisons: [
        { role: "held-out", workloadId: heldOut, pairs: fixture.pairs() },
        { role: "representative", workloadId: representative, pairs: fixture.pairs() },
      ],
      dimensions: fixture.dimensions(),
      missingAuthority: false,
      ...overrides,
    },
  };
}

test("adjudication compares different categories without reading classification", () => {
  const library = candidate("library-route", {
    dimensions: fixture.dimensions({ removableWallLowerMicroseconds: 500 }),
  });
  const source = candidate("source", {
    dimensions: fixture.dimensions({ removableWallLowerMicroseconds: 300 }),
  });
  const result = auditors.adjudicateCandidates({
    epochId: library.intervention.binding.epochId,
    candidates: [library, source].sort(
      (left, right) => left.intervention.id.localeCompare(right.intervention.id),
    ),
  });
  assert.equal(result.status, "select");
  assert.equal(result.selectedInterventionId, library.intervention.id);
  assert.equal(result.pairwiseComparisons[0].decisiveDimension, "removable-wall");
});

test("select, investigate, reject, and already-optimized are deterministic outcomes", () => {
  const selected = candidate("library-route");
  assert.equal(auditors.adjudicateCandidates({
    epochId: selected.intervention.binding.epochId, candidates: [selected],
  }).status, "select");

  const investigate = candidate("library-route", { missingAuthority: true });
  investigate.audit = { ...investigate.audit, status: "investigate" };
  assert.equal(auditors.adjudicateCandidates({
    epochId: investigate.intervention.binding.epochId, candidates: [investigate],
  }).status, "investigate");

  const rejected = candidate("source", {
    comparisons: [
      { role: "held-out", workloadId: fixture.id("heldout"), pairs: fixture.pairs(1000, 950) },
      { role: "representative", workloadId: fixture.id("representative"), pairs: fixture.pairs(1000, 950) },
    ],
  });
  assert.equal(auditors.adjudicateCandidates({
    epochId: rejected.intervention.binding.epochId, candidates: [rejected],
  }).status, "reject");
  assert.equal(auditors.adjudicateCandidates({
    epochId: rejected.intervention.binding.epochId,
    candidates: [rejected],
    currentAlreadyOptimized: true,
  }).status, "already-optimized");
});

test("classification changes cannot affect hard gates or selection", () => {
  const candidateValue = candidate("library-route");
  const first = auditors.adjudicateCandidates({
    epochId: candidateValue.intervention.binding.epochId,
    candidates: [candidateValue],
  });
  const diagnosticClassifications = ["compiler-region", "runtime-cost", "mixed"];
  for (const classification of diagnosticClassifications) {
    const second = auditors.adjudicateCandidates({
      epochId: candidateValue.intervention.binding.epochId,
      candidates: [candidateValue],
      diagnosticClassification: classification,
    });
    assert.deepEqual(second, first);
  }
});
