"use strict";

const { availableParallelism } = require("node:os");
const { readFileSync, realpathSync } = require("node:fs");
const { join, isAbsolute } = require("node:path");
const { canonical, sha256 } = require("./evidence.cjs");
const { applyIntentionalIncompatibilities, compareBaselineRecord } = require("./output-baseline.cjs");
const { execute, inspectReference, runOne, mapConcurrent, legacyEnvironment } = require("./legacy-output-runner.cjs");

const comparison = "cpython-output-baseline-v2";
const defaultJobs = () => Math.max(1, Math.min(8,
  typeof availableParallelism === "function" ? availableParallelism() : 4));

function validateSelection(loaded, selected, artifactReport) {
  for (const entry of selected) {
    if (!["assertion-exit-empty-output", comparison].includes(entry.comparison)) {
      throw new Error(`unsupported comparison ${entry.comparison}`);
    }
  }
  for (const [suite, metadata] of Object.entries(loaded.outputComparisons ?? {})) {
    const entries = selected.filter(entry => entry.suite === suite);
    if (!entries.length) continue;
    const names = entries.map(entry => entry.path.slice("basics/".length)).sort();
    if (!artifactReport && canonical(names) !== canonical(metadata.candidates)) {
      throw new Error(`${suite}: baseline qualification requires the complete suite; use --artifact-report for partial diagnosis`);
    }
  }
}

async function runOutputSuite(entries, metadata, reference, {
  root, python, execute: executeRuntime = execute, environment = legacyEnvironment(),
  jobs = defaultJobs(),
}) {
  if (!entries.length || entries.some(entry =>
    entry.comparison !== comparison || entry.executionProfile !== "micropython-corpus-v1")) {
    throw new Error("unsupported output execution profile");
  }
  // Keep the original identification command, cwd, environment and error order.
  // The assertion probe's scrubbed environment cannot authenticate this profile.
  const outputReference = await inspectReference({python, timeout:5000}, environment,
    {root, execute:executeRuntime});
  if (outputReference.implementation !== reference.implementation ||
      outputReference.version !== reference.version) {
    throw new Error("legacy-environment oracle identity differs from manifest oracle");
  }
  const ordered = [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  // Additional generic qualification preflight, not part of the old runner.
  // Resolve in the actual legacy case environment/cwd, then pin case launches
  // to this interpreter rather than resolving a command or wrapper repeatedly.
  const identity = await executeRuntime(python, ["-BS", "-c",
    "import json, platform, sys; print(json.dumps(dict(implementation=platform.python_implementation(), version=platform.python_version(), executable=sys.executable)))"],
  {cwd:join(ordered[0].directory, "basics"), env:environment, timeout:5000});
  if (identity.error || identity.timedOut || identity.signal || identity.status !== 0 || identity.stderr !== "") {
    throw new Error("legacy-environment oracle executable could not be identified");
  }
  const resolvedReference = JSON.parse(identity.stdout);
  if (resolvedReference.implementation !== reference.implementation ||
      resolvedReference.version !== reference.version ||
      typeof resolvedReference.executable !== "string" || !isAbsolute(resolvedReference.executable) ||
      typeof reference.executable !== "string" || !isAbsolute(reference.executable) ||
      realpathSync(resolvedReference.executable) !== realpathSync(reference.executable) ||
      sha256(readFileSync(resolvedReference.executable)) !== reference.executableSha256) {
    throw new Error("legacy-environment oracle executable differs from qualified oracle");
  }
  Object.assign(outputReference, {
    executable:reference.executable, executableSha256:reference.executableSha256,
    executionCommand:reference.executable,
  });
  const rawResults = await mapConcurrent(ordered, jobs, entry => runOne({
    name:entry.path.slice("basics/".length), file:join(entry.directory, entry.path),
  }, {python:reference.executable, timeout:entry.timeoutMs}, environment, {
    corpusRoot:join(entry.directory, "basics"), sagejs:join(root, "bin/sagejs-source.cjs"),
    execute:executeRuntime,
  }));
  const results = applyIntentionalIncompatibilities(rawResults, metadata.reviews.tests, outputReference);
  const complete = canonical(results.map(result => result.name).sort()) === canonical(metadata.candidates);
  const changes = complete ? compareBaselineRecord(results, outputReference, metadata.excluded,
    metadata.baseline, metadata.baseline.provenance, metadata.baseline.source) : null;
  const infrastructureFailure = rawResults.some(result => result.status === "launch-error");
  return {reference:outputReference, results, complete, changes, infrastructureFailure,
    passed:complete && !infrastructureFailure && changes.length === 0,
    provenance:metadata.baseline.provenance, excluded:metadata.excluded};
}

module.exports = { validateSelection, runOutputSuite, defaultJobs };
