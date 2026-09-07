"use strict";

// Read-only potential dependency graph, NOT a GitHub expression interpreter or
// publication authorization. Matrix jobs stay aggregate nodes with their exact
// strategy attached. Conditional/skipped/tolerated failures require evaluation
// at execution time; never infer a pass or permission to waive a job from this.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const YAML = require("yaml");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const jobKey = (workflow, job) => `${workflow}#${job}`;
const successKey = (workflow) => `${workflow}#@success`;

function readWithin(root, filename) {
  if (typeof filename !== "string" || path.isAbsolute(filename) || filename.includes("\\") ||
      filename.split("/").some((part) => part === ".." || part === "")) throw new Error("unsafe inventory source path");
  const absolute = fs.realpathSync(path.join(root, filename));
  const relative = path.relative(fs.realpathSync(root), absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("inventory source escapes root");
  return fs.readFileSync(absolute);
}

function parseWorkflow(source, filename) {
  const doc = YAML.parseDocument(source, { version: "1.2", uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) throw new Error(`invalid workflow ${filename}: ${[...doc.errors, ...doc.warnings].map((e) => e.message).join("; ")}`);
  const data = doc.toJS({ maxAliasCount: 100 });
  if (!data || !data.jobs || typeof data.jobs !== "object" || Array.isArray(data.jobs)) throw new Error(`workflow lacks jobs: ${filename}`);
  return data;
}

function dependencyPath(nodes, edges, from, to) {
  const keys = new Set(nodes.map((node) => node.key));
  if (!keys.has(from) || !keys.has(to)) throw new Error("unknown workflow graph node");
  const adjacent = new Map();
  for (const edge of edges) {
    if (!adjacent.has(edge.from)) adjacent.set(edge.from, []);
    adjacent.get(edge.from).push(edge.to);
  }
  const queue = [[from]], visited = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.at(-1) === to) return current;
    for (const next of adjacent.get(current.at(-1)) || []) if (!visited.has(next)) {
      visited.add(next); queue.push([...current, next]);
    }
  }
  return null;
}

function workflowInventory(root, suppliedReview) {
  const directory = ".github/workflows";
  const sources = [], nodes = [], edges = [], reviewErrors = [], controlSteps = [];
  const workflows = new Map();
  for (const filename of fs.readdirSync(path.join(root, directory)).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const bytes = readWithin(root, `${directory}/${filename}`);
    sources.push({ filename: `${directory}/${filename}`, sha256: digest(bytes) });
    const data = parseWorkflow(bytes.toString("utf8"), filename);
    workflows.set(filename, data);
    nodes.push({ key: successKey(filename), kind: "workflow-conclusion", workflow: filename,
      triggers: data.on, concurrency: data.concurrency ?? null,
      semantics: "Conservative aggregate of all jobs; conditional execution and continue-on-error retained, not evaluated" });
    for (const [id, job] of Object.entries(data.jobs)) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id) || !job || typeof job !== "object" || Array.isArray(job)) throw new Error(`invalid workflow job: ${filename}#${id}`);
      const needs = job.needs === undefined ? [] : typeof job.needs === "string" ? [job.needs] : job.needs;
      if (!Array.isArray(needs) || needs.some((n) => typeof n !== "string" || !Object.hasOwn(data.jobs, n)) || new Set(needs).size !== needs.length) throw new Error(`invalid needs: ${filename}#${id}`);
      if (job.steps !== undefined && !Array.isArray(job.steps)) throw new Error(`invalid steps: ${filename}#${id}`);
      const key = jobKey(filename, id);
      const steps = (job.steps || []).map((step, index) => {
        if (!step || typeof step !== "object" || Array.isArray(step)) throw new Error(`invalid step: ${key}/${index}`);
        if (step.run !== undefined && typeof step.run !== "string") throw new Error(`invalid run body: ${key}/${index}`);
        // Detection only flags additional review work; no edges are inferred
        // from shell substrings, nor is absence a proof of no external calls.
        if (/\bgh\s+(?:api|workflow|run)\b|require-wasm-release\.cjs|artifact-set\.cjs\s+capture|artifact-handoff\.cjs\s+(?:verify|stage|prepare)/.test(step.run || "")) controlSteps.push({ key, index, name: step.name ?? null });
        return { index, ...step, runSha256: step.run === undefined ? null : digest(step.run) };
      });
      nodes.push({ key, kind: "job", workflow: filename, id, name: job.name ?? id,
        condition: job.if ?? null, continueOnError: job["continue-on-error"] ?? false,
        timeoutMinutes: job["timeout-minutes"] ?? null, runsOn: job["runs-on"] ?? null,
        environment: job.environment ?? null, strategy: job.strategy ?? null,
        permissions: job.permissions ?? data.permissions ?? null,
        env: { ...data.env, ...job.env }, defaults: job.defaults ?? data.defaults ?? null,
        uses: job.uses ?? null, needs, steps,
        policy: { mode: "shadow", requiredUnlessReviewed: true, assertionClassification: "unreviewed" } });
      edges.push({ from: successKey(filename), to: key, kind: "workflow-conclusion", conditional: true });
      for (const need of needs) edges.push({ from: key, to: jobKey(filename, need), kind: "needs", conditional: true });
    }
  }
  // Cycles are invalid even though an expression might skip one of the jobs.
  const adjacency = new Map(nodes.map((node) => [node.key, []]));
  for (const edge of edges) adjacency.get(edge.from).push(edge.to);
  const done = new Set(), active = new Set();
  function visit(key) {
    if (active.has(key)) throw new Error(`cyclic workflow dependencies at ${key}`);
    if (done.has(key)) return;
    active.add(key); for (const next of adjacency.get(key)) visit(next);
    active.delete(key); done.add(key);
  }
  for (const key of adjacency.keys()) visit(key);

  const reviewPath = "scripts/release/workflow-api-edges.json";
  const reviewBytes = suppliedReview ? null : readWithin(root, reviewPath);
  if (reviewBytes) sources.push({ filename: reviewPath, sha256: digest(reviewBytes) });
  const review = suppliedReview || JSON.parse(reviewBytes);
  if (review.schema !== "sagejs.workflow-api-edges/v2" || !Array.isArray(review.entries)) throw new Error("invalid workflow API review registry");
  const reviewedSteps = new Set();
  const controlEffects = [];
  const jobKeys = new Set(nodes.filter((node) => node.kind === "job").map((node) => node.key));
  function validArtifactInput(item) {
    const producer = nodes.find((node) => node.kind === "job" && node.key === item?.producer);
    const binding = item?.matrix ?? {};
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) return false;
    // Only an explicitly reviewed literal cell of a simple static matrix is
    // supported. This is not evaluation of arbitrary GitHub expressions.
    if (Object.keys(binding).length && (producer?.strategy?.matrix?.include || producer?.strategy?.matrix?.exclude ||
        Object.entries(binding).some(([key, value]) => !Array.isArray(producer?.strategy?.matrix?.[key]) ||
          typeof value !== "string" || !producer.strategy.matrix[key].includes(value)))) return false;
    const nameFor = (text) => typeof text === "string" ? text.replace(/\$\{\{\s*matrix\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
      (expression, key) => Object.hasOwn(binding, key) ? binding[key] : expression) : null;
    return producer && Array.isArray(item.names) && item.names.length && new Set(item.names).size === item.names.length &&
      item.names.every((name) => typeof name === "string" && name.trim() && producer.steps.some((step) =>
        /^actions\/upload-artifact@/.test(step.uses ?? "") && nameFor(step.with?.name) === name));
  }
  for (const entry of review.entries) {
    const from = jobKey(entry.workflow, entry.job);
    const job = nodes.find((node) => node.key === from && node.kind === "job");
    const matches = job?.steps.filter((step) => step.name === entry.step) || [];
    const failures = [];
    if (matches.length !== 1 || matches[0].runSha256 !== entry.runSha256) failures.push("step missing, ambiguous or changed");
    const requiredJobs = entry.requiresJobSuccess ?? [], artifactInputs = entry.artifactInputs ?? [], effects = entry.effects ?? [];
    if (!Array.isArray(entry.helpers) || !Array.isArray(entry.requiresWorkflowSuccess) ||
        entry.requiresWorkflowSuccess.some((name) => !workflows.has(name)) || new Set(entry.requiresWorkflowSuccess).size !== entry.requiresWorkflowSuccess.length ||
        !Array.isArray(requiredJobs) || requiredJobs.some((key) => !jobKeys.has(key)) || new Set(requiredJobs).size !== requiredJobs.length ||
        !Array.isArray(artifactInputs) || artifactInputs.some((item) => !validArtifactInput(item)) ||
        !Array.isArray(effects) || effects.some((item) => !item || !["dispatch", "rerun-job", "release-pointer"].includes(item.kind) ||
          (item.kind === "release-pointer" ? item.target !== "github:releases/latest" : !jobKeys.has(item.target))) ||
        !(entry.requiresWorkflowSuccess.length || requiredJobs.length || artifactInputs.length || effects.length) ||
        typeof entry.semantics !== "string" || !entry.semantics.trim()) failures.push("invalid API edge declaration");
    else for (const helper of entry.helpers) {
      try {
        const sha256 = digest(readWithin(root, helper.filename));
        sources.push({ filename: helper.filename, sha256 });
        if (sha256 !== helper.sha256) failures.push(`helper changed: ${helper.filename}`);
      } catch (error) { failures.push(error.message); }
    }
    const anchor = `${from}/${matches[0]?.index}`;
    if (reviewedSteps.has(anchor)) failures.push("duplicate API review anchor");
    if (failures.length) { reviewErrors.push({ from, step: entry.step, failures }); continue; }
    reviewedSteps.add(anchor);
    for (const workflow of entry.requiresWorkflowSuccess) edges.push({ from, to: successKey(workflow),
      kind: "reviewed-api-workflow-success", step: matches[0].index, runSha256: entry.runSha256,
      semantics: entry.semantics, conditional: true });
    for (const to of requiredJobs) edges.push({ from, to, kind: "reviewed-api-job-success", step: matches[0].index,
      runSha256: entry.runSha256, semantics: entry.semantics, conditional: true });
    for (const item of artifactInputs) edges.push({ from, to: item.producer, kind: "reviewed-artifact-input", names: item.names, matrix: item.matrix ?? null,
      step: matches[0].index, runSha256: entry.runSha256, semantics: entry.semantics, conditional: true });
    // Dispatch/rerun/pointer effects are recorded separately: treating them as
    // prerequisites would invent completion guarantees and false cycles.
    for (const effect of effects) controlEffects.push({ from, ...effect, step: matches[0].index,
      runSha256: entry.runSha256, semantics: entry.semantics });
  }
  // A reviewed cross-workflow condition can also make the composed graph cyclic.
  for (const key of adjacency.keys()) adjacency.set(key, []);
  for (const edge of edges) adjacency.get(edge.from).push(edge.to);
  done.clear(); active.clear();
  for (const key of adjacency.keys()) visit(key);
  return { schema: "sagejs.workflow-inventory/v1", mode: "shadow", sources, nodes, edges, reviewErrors, controlEffects,
    unreviewedControlSteps: controlSteps.filter((step) => !reviewedSteps.has(`${step.key}/${step.index}`)),
    limitations: ["Potential graph only: expressions, matrix cells and tolerated failures are not evaluated",
      "Reviewed API edges are source-bound findings, not general shell analysis; artifact edges describe availability, not successful qualification",
      "Control effects are not prerequisite edges or proof that dispatched work finished",
      "Action internals, reusable workflows and transitive script/artifact dataflow still require inventory",
      "No pass, cache reuse, numerical evidence authentication or publication authorization is implied"] };
}

module.exports = { workflowInventory, parseWorkflow, dependencyPath, jobKey, successKey };
