#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { plan, targets } = require("./stages.cjs");
const { classification, stageIds } = require("./policy.cjs");
const { discoverTestManifest } = require("../test-metadata.cjs");
const { selectGate } = require("./test-gates.cjs");
const { workflowInventory, dependencyPath } = require("./workflow-inventory.cjs");
const root = path.resolve(__dirname, "../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function packageEntrypoint(command, directory = root) {
  if (command[0] !== "pnpm") return null;
  const scoped = command[1] === "--dir";
  const manifestPath = scoped ? `${command[2]}/package.json` : "package.json";
  const script = command[scoped ? 3 : 1];
  // Preserve shell bodies verbatim. This is not a shell parser or a proof of
  // complete transitive closure; unresolved invocations remain conspicuous.
  const absolute = path.resolve(directory, manifestPath);
  if (path.relative(directory, absolute).startsWith("..")) throw new Error("package manifest escapes inventory root");
  const bytes = fs.readFileSync(absolute);
  const body = JSON.parse(bytes).scripts?.[script];
  return { manifest: manifestPath, manifestSha256: sha256(bytes), script,
    body: body ?? null, resolved: typeof body === "string" };
}

function inventory() {
  const manifest = discoverTestManifest(root);
  const profiles = [["preparation", "linux-x64"], ["canonical", "linux-x64"], ["browser", "linux-x64"], ["reporting", "linux-x64"], ...targets.map((target) => ["native", target])];
  const instances = profiles.flatMap(([profile, target]) => {
    const stages = plan(profile, undefined, target);
    return stages.map((stage, index) => ({
      key: `${profile}/${target}/${stage.id}`, profile, target, ...stage,
      policy: classification(stage.id),
      // Current runner is sequential, even when artifacts could be independent.
      scheduledAfter: index ? stages[index - 1].id : null,
      packageEntrypoints: stage.commands.map((command) => packageEntrypoint(command)).filter(Boolean),
      testFiles: ["unit", "portable"].includes(stage.id) ? manifest[stage.id] :
        stage.id === "integration" ? selectGate(manifest.integration, "correctness") :
        stage.id === "integration-performance" ? selectGate(manifest.integration, "performance") : null,
      validationClosure: "current runner uses the full clean candidate, host, environment, runner and declared input/output snapshots; no cross-candidate evidence reuse",
    }));
  });
  const actualIds = new Set(instances.map((stage) => stage.id));
  const unreviewed = [...actualIds].filter((id) => !classification(id).reviewed);
  const stalePolicy = stageIds.filter((id) => !actualIds.has(id));
  return {
    schema: "sagejs.release-inventory/v1", mode: "shadow", scope: "runner profiles, top-level test discovery and potential workflow dependencies",
    // Keep these omissions explicit: a runner-only inventory cannot authorize
    // removing CI's whole-workflow dependency or numerical evidence requirements.
    incompleteScopes: ["transitive package/shell command closure", "specialized/package tests outside the runner",
      "unreviewed workflow API/action/artifact dependencies", "numerical browser/supplemental aggregation",
      "signing, publication and deployment command semantics"],
    sources: ["scripts/release/stages.cjs", "scripts/release/policy.cjs", "scripts/test-metadata.cjs", "scripts/release/test-gates.cjs",
      "scripts/release/workflow-inventory.cjs", "package.json", "pnpm-lock.yaml"]
      .map((filename) => ({ filename, sha256: sha256(fs.readFileSync(path.join(root, filename))) })),
    counts: Object.fromEntries(["unit", "portable", "integration", "specialized", "smoke", "platform"].map((tier) => [tier, manifest[tier].length])),
    testRecords: manifest.records, instances, unreviewed, stalePolicy, workflows: workflowInventory(root),
  };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const pathQuery = args.length === 3 && args[0] === "--path";
    if (!pathQuery && !(args.length === 0 || (args.length === 1 && args[0] === "--check"))) throw new Error("usage: release:inventory [--check | --path WORKFLOW#JOB DEPENDENCY#JOB]");
    const result = inventory();
    const unresolved = result.instances.flatMap((stage) => stage.packageEntrypoints.filter((entry) => !entry.resolved));
    if (pathQuery) {
      if (result.workflows.reviewErrors.length) throw new Error("workflow API edge review has drifted; inspect release:inventory --check");
      const route = dependencyPath(result.workflows.nodes, result.workflows.edges, args[1], args[2]);
      console.log(JSON.stringify({ mode: "shadow", potentialDependencyPath: route,
        edges: route?.slice(1).map((to, index) => result.workflows.edges.find((edge) => edge.from === route[index] && edge.to === to)) ?? [],
        limitations: result.workflows.limitations }, null, 2));
    } else if (args.includes("--check")) {
      if (result.unreviewed.length || result.stalePolicy.length || unresolved.length || result.workflows.reviewErrors.length) {
        throw new Error(`inventory needs review: ${JSON.stringify({ unreviewed: result.unreviewed, stalePolicy: result.stalePolicy, unresolved, apiEdges: result.workflows.reviewErrors })}`);
      }
      console.log(`${result.instances.length} runner stage instances; ${result.workflows.nodes.filter((node) => node.kind === "job").length} workflow jobs; ${result.workflows.edges.length} potential edges; ${result.workflows.unreviewedControlSteps.length} additional API/control steps need review; shadow policy only; ${result.incompleteScopes.length} scopes still incomplete`);
    } else console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { inventory, packageEntrypoint };
