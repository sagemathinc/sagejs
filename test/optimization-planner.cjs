// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const auditors = require("../tools/optimization-engine/auditors.cjs");
const contracts = require("../tools/optimization-engine/contracts.cjs");
const planner = require("../tools/optimization-engine/planner.cjs");
const fixture = require("./fixtures/optimization-engine/helpers.cjs");

function selected(category) {
  const epoch = fixture.epoch();
  const workload = fixture.workload();
  const subject = fixture.subject(epoch, workload);
  const proposal = fixture.proposal(category);
  const audited = auditors.auditIntervention({ epoch, subject, proposal }, {
    evidence: fixture.evidence(epoch, proposal),
  });
  const observationId = fixture.id(`${category}-observation`);
  const opportunity = contracts.createDocument("opportunity", {
    authority: fixture.authority("validated-input-set", [audited.intervention.id]),
    binding: { epochId: epoch.id, state: "current", predecessorIds: [] },
    subjectId: subject.id,
    observationIds: [observationId],
    classifications: [{
      kind: "mixed",
      observationIds: [observationId],
      explanation: "diagnostic classification does not select the intervention",
    }],
    interventionIds: [audited.intervention.id],
    losingEvidenceIds: [fixture.id(`${category}-loser`)],
    unresolvedObligations: [],
    decision: {
      status: "select",
      selectedInterventionId: audited.intervention.id,
      reasons: ["deterministic hard gates selected the candidate"],
    },
  });
  return { epoch, workload, subject, intervention: audited.intervention, observationId, opportunity };
}

test("neutral dossiers and category-derived campaigns cover all eight categories", () => {
  for (const category of contracts.INTERVENTION_CATEGORIES) {
    const state = selected(category);
    const dossier = planner.createDossier({
      opportunity: state.opportunity,
      intervention: state.intervention,
      observationIds: [state.observationId],
    });
    assert.equal(dossier.category, category);
    if (category !== "compiler") {
      assert.equal(Object.hasOwn(dossier.evidence, "irId"), false);
      assert.equal(Object.hasOwn(dossier.evidence, "decisionId"), false);
    }
    const roles = auditors.campaignLaneRoles(category);
    const claimsByRole = Object.fromEntries(roles.map((role) => [
      role,
      [`lanes/${category}/${role}.txt`],
    ]));
    const campaign = planner.generateCampaign({
      dossier,
      opportunity: state.opportunity,
      intervention: state.intervention,
      claimsByRole,
      requiredEvidenceIds: [fixture.id(`${category}-required`)],
      representativeWorkloadIds: [state.workload.id],
      heldOutWorkloadIds: [fixture.id(`${category}-heldout`)],
    });
    assert.deepEqual(
      campaign.lanes.map((lane) => lane.role).sort(),
      [...roles].sort(),
    );
  }
});
test("a non-selected opportunity cannot manufacture a dossier", () => {
  const state = selected("library-route");
  const payload = structuredClone(state.opportunity);
  payload.decision = {
    status: "investigate",
    selectedInterventionId: null,
    reasons: ["missing evidence"],
  };
  const { schema: _schema, id: _id, ...body } = payload;
  const investigate = contracts.createDocument("opportunity", body);
  assert.throws(() => planner.createDossier({
    opportunity: investigate,
    intervention: state.intervention,
    observationIds: [state.observationId],
  }), /requires the exact selected intervention/);
});

test("campaign generation rejects missing roles and overlapping claims", () => {
  const state = selected("cache");
  const dossier = planner.createDossier({
    opportunity: state.opportunity,
    intervention: state.intervention,
    observationIds: [state.observationId],
  });
  const roles = auditors.campaignLaneRoles("cache");
  const claims = Object.fromEntries(roles.map((role) => [role, [`lanes/${role}.txt`]]));
  delete claims.integration;
  assert.throws(() => planner.generateCampaign({
    dossier,
    opportunity: state.opportunity,
    intervention: state.intervention,
    claimsByRole: claims,
    requiredEvidenceIds: [fixture.id("required")],
    representativeWorkloadIds: [state.workload.id],
    heldOutWorkloadIds: [fixture.id("heldout")],
  }), /missing required lane role integration/);

  claims.integration = ["lanes/shared"];
  claims.implementation = ["lanes/shared/file.cjs"];
  assert.throws(() => planner.generateCampaign({
    dossier,
    opportunity: state.opportunity,
    intervention: state.intervention,
    claimsByRole: claims,
    requiredEvidenceIds: [fixture.id("required")],
    representativeWorkloadIds: [state.workload.id],
    heldOutWorkloadIds: [fixture.id("heldout")],
  }), /overlapping claims/);
});

test("path-aware claim overlap is symmetric and segment-aware", () => {
  assert.equal(planner.claimOverlaps("src/lib", "src/lib/file.py"), true);
  assert.equal(planner.claimOverlaps("src/lib/file.py", "src/lib"), true);
  assert.equal(planner.claimOverlaps("src/lib-a", "src/lib"), false);
});
