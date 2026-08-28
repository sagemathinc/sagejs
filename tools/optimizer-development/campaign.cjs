"use strict";

const CAMPAIGN_SCHEMA = "sagejs.optimizer-campaign/v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeClaim(claim) {
  assert(typeof claim === "string" && claim.length > 0, "claims must be nonempty strings");
  assert(!claim.startsWith("/") && !claim.includes("\\") && !claim.split("/").includes(".."),
    `claim must be a repository-relative POSIX path: ${claim}`);
  return claim.replace(/^\.\//, "").replace(/\/+$/, "");
}

function claimsOverlap(left, right) {
  const a = normalizeClaim(left);
  const b = normalizeClaim(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function validateTaskGraph(tasks, sharedIntegrationClaims, existingContracts = []) {
  const byId = new Map();
  const claimed = [];
  for (const task of tasks) {
    assert(task && typeof task.id === "string" && task.id.length > 0, "task id is required");
    assert(!byId.has(task.id), `duplicate task id: ${task.id}`);
    byId.set(task.id, task);
    assert(Array.isArray(task.claims) && task.claims.length > 0, `task ${task.id} must have claims`);
    for (const raw of task.claims) {
      const claim = normalizeClaim(raw);
      if (task.role !== "integration") for (const shared of sharedIntegrationClaims) {
        assert(!claimsOverlap(claim, shared),
          `shared integration claim ${shared} may only be owned by integration (claimed by ${task.id})`);
      }
      for (const other of claimed) assert(!claimsOverlap(claim, other.claim),
        `proposed claim overlap: ${task.id}:${claim} and ${other.taskId}:${other.claim}`);
      claimed.push({ taskId: task.id, claim });
    }
  }
  for (const task of tasks) for (const dependency of task.dependencies) {
    assert(byId.has(dependency), `task ${task.id} has unknown dependency ${dependency}`);
    assert(dependency !== task.id, `task ${task.id} cannot depend on itself`);
  }
  const active = existingContracts.filter((contract) => contract && !["complete", "blocked"].includes(contract.status));
  for (const task of tasks) for (const claim of task.claims) for (const contract of active) {
    for (const existing of contract.claims || []) assert(!claimsOverlap(claim, existing),
      `proposed claim ${task.id}:${claim} overlaps active task ${contract.id}:${existing}`);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    assert(!visiting.has(id), `campaign task dependency cycle at ${id}`);
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
}

function parallelNewArgv(task, baseCommit) {
  const argv = ["pnpm", "parallel:new", "--", task.id, task.lane,
    "--objective", task.objective, "--base", baseCommit,
    "--architecture", task.architecture, "--fallback", task.fallback];
  for (const claim of task.claims) argv.push("--claim", claim);
  for (const dependency of task.dependencies) argv.push("--dependency", dependency);
  for (const oracle of task.oracles) argv.push("--oracle", oracle);
  return argv;
}

function generateCampaign({ dossier, baseCommit, proposal, existingContracts = [], adapter }) {
  for (const name of ["validateDossier", "attachIdentity", "validateCampaign"]) {
    assert(adapter && typeof adapter[name] === "function", `campaign adapter.${name} is required`);
  }
  const checked = adapter.validateDossier(dossier);
  assert(checked.status === "approved", "campaign creation requires an approved dossier");
  assert(checked.recommendedAction === "compiler-campaign",
    "campaign creation requires a compiler-campaign dossier action");
  assert(typeof baseCommit === "string" && /^[0-9a-f]{40}$/.test(baseCommit),
    "baseCommit must be an exact Git commit");
  assert(proposal && Array.isArray(proposal.tasks) && proposal.tasks.length > 0,
    "campaign proposal tasks are required");
  assert(typeof proposal.owner === "string" && proposal.owner.length > 0,
    "campaign proposal owner is required");
  const shared = (proposal.sharedIntegrationClaims || []).map(normalizeClaim).sort();
  const tasks = proposal.tasks.map((task) => ({
    id: task.id,
    role: task.role,
    lane: task.lane || "optimizer-development",
    objective: task.objective,
    claims: task.claims.map(normalizeClaim).sort(),
    dependencies: [...(task.dependencies || [])].sort(),
    architecture: task.architecture || "compiler-infrastructure",
    fallback: task.fallback || "same-source",
    oracles: [...(task.oracles || [])].sort(),
    deliverables: [...task.deliverables].sort(),
  })).sort((a, b) => a.id.localeCompare(b.id));
  validateTaskGraph(tasks, shared, existingContracts);
  const integrations = tasks.filter((task) => task.role === "integration");
  assert(integrations.length === 1, "campaign requires exactly one integration task");
  for (const claim of shared) assert(integrations[0].claims.some((owned) => claimsOverlap(claim, owned)),
    `integration task must own shared integration claim ${claim}`);

  const payload = {
    status: "proposed",
    baseCommit,
    dossier: { id: checked.id },
    hypothesis: proposal.hypothesis,
    selectionEvidence: [...proposal.selectionEvidence].sort(),
    interfaces: [...proposal.interfaces].sort((a, b) => a.name.localeCompare(b.name)),
    targets: [...proposal.targets].sort(),
    lanes: tasks.map((task) => ({
      id: task.id,
      role: task.role,
      claims: task.claims,
      dependencies: task.dependencies,
      task: {
        id: task.id,
        branch: `agent/${task.id}`,
        contractPath: `.agents/tasks/${task.id}.json`,
        parallelNewArgs: parallelNewArgv(task, baseCommit).slice(3),
      },
      deliverables: task.deliverables,
    })),
    dependencies: [...(proposal.dependencies || [])].sort(),
    oracles: [...proposal.oracles].sort(),
    acceptance: { ...proposal.acceptance },
    platforms: [...proposal.platforms].sort(),
    evidencePolicy: { ...proposal.evidencePolicy },
  };
  const campaign = adapter.validateCampaign(adapter.attachIdentity(CAMPAIGN_SCHEMA, payload), {
    dossierId: checked.id,
  });
  const projections = tasks.map((task) => ({
    id: task.id,
    taskContract: {
      $schema: "../task.schema.json",
      schema_version: 2,
      id: task.id,
      title: task.id,
      lane: task.lane,
      status: "active",
      owner: proposal.owner,
      objective: task.objective,
      base_commit: baseCommit,
      claims: task.claims,
      dependencies: task.dependencies,
      references: [],
      architecture: { strategy: task.architecture, fallback: task.fallback,
        oracles: task.oracles, exceptions: [] },
      platforms: Object.fromEntries(proposal.platforms.map((platform) => [platform, "required"])),
      validation: [],
      runs: [],
      handoff: { summary: "", risks: [], next_steps: [] },
    },
    parallelNew: { argv: parallelNewArgv(task, baseCommit) },
  }));
  return Object.freeze({ campaign, projections: Object.freeze(projections) });
}

module.exports = {
  CAMPAIGN_SCHEMA,
  claimsOverlap,
  generateCampaign,
  parallelNewArgv,
  validateTaskGraph,
};
