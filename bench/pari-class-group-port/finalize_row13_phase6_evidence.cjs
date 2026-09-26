#!/usr/bin/env node
"use strict";

// Bind the completed external resource sampler only after both it and the
// immutable diagnostic receipt have closed.  The in-process checker cannot
// honestly hash a sidecar which is still being appended by its launcher.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const canonical = value => Buffer.from(`${JSON.stringify(value)}\n`);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function parseResourceSidecar(bytes) {
  const lines = bytes.toString("utf8").trimEnd().split("\n");
  const take = (name, pattern = /^[0-9]+$/) => {
    const line = lines.shift() || "";
    assert(line.startsWith(`${name}=`), `missing sidecar ${name}`);
    const value = line.slice(name.length + 1);
    assert.match(value, pattern, `invalid sidecar ${name}`);
    return value;
  };
  const runIdentity = take("run_identity", /^[A-Za-z0-9][A-Za-z0-9._-]{15,127}$/);
  const runnerPid = take("runner_pid"), processGroup = take("process_group");
  assert.equal(take("resource_scope", /^[a-z-]+$/), "recursive-descendants");
  const startEpochNs = take("start_epoch_ns"), rssLimitKiB = take("rss_limit_kib");
  assert.equal(lines.shift(),
    "sample_epoch_ns aggregate_descendant_rss_kib aggregate_descendant_vsz_kib process_count build_process_count");
  const samples = [];
  while (lines.length && /^[0-9]+ [0-9]+ [0-9]+ [0-9]+ [0-9]+$/.test(lines[0]))
    samples.push(lines.shift().split(" ").map(BigInt));
  assert(samples.length > 0, "resource sidecar has no samples");
  const exitStatus = take("exit_status"), violation = take("rss_limit_violation");
  const buildProcessSeen = take("build_process_seen");
  const peakRss = take("peak_aggregate_rss_kib");
  const peakVsz = take("peak_aggregate_vsz_kib");
  const endEpochNs = take("end_epoch_ns"), wallNs = take("wall_ns");
  const wallSeconds = take("wall_seconds", /^[0-9]+\.[0-9]{9}$/);
  const postflightStatus = take("postflight_status");
  assert.equal(lines.length, 0, "resource sidecar has trailing material");
  assert.equal(exitStatus, "0"); assert.equal(violation, "0");
  assert.equal(buildProcessSeen, "0"); assert.equal(postflightStatus, "0");
  assert.equal(rssLimitKiB, "4194304");
  assert(BigInt(peakRss) <= BigInt(rssLimitKiB));
  assert.equal(BigInt(endEpochNs) - BigInt(startEpochNs), BigInt(wallNs));
  const wall = BigInt(wallNs);
  assert.equal(wallSeconds,
    `${wall / 1_000_000_000n}.${String(wall % 1_000_000_000n).padStart(9, "0")}`);
  assert.equal(BigInt(peakRss), samples.reduce((m, s) => s[1] > m ? s[1] : m, 0n));
  assert.equal(BigInt(peakVsz), samples.reduce((m, s) => s[2] > m ? s[2] : m, 0n));
  for (let index = 1; index < samples.length; index += 1)
    assert(samples[index][0] > samples[index - 1][0], "sample times are not increasing");
  for (const sample of samples) {
    assert(sample[0] >= BigInt(startEpochNs) && sample[0] <= BigInt(endEpochNs),
      "resource sample is outside the run interval");
    assert(sample[3] > 0n, "resource sample process count must be positive");
    assert.equal(sample[4], 0n, "resource sample observed a native build process");
  }
  return { runIdentity, runnerPid, processGroup, startEpochNs, endEpochNs,
    wallNs, rssLimitKiB, peakAggregateRssKiB: peakRss,
    peakAggregateVszKiB: peakVsz, sampleCount: String(samples.length),
    resourceScope: "recursive-descendants", buildProcessSeen,
    postflightStatus };
}

function validateResourceForCore(core, resource) {
  assert.equal(resource.runIdentity, core.runIdentity,
    "resource sidecar belongs to another run");
  require("./check_row13_phase6_qualification_pair.cjs")
    .validateSourceAuthority(core.sourceAuthority);
  return resource;
}

function validateCoreForFinalization(core) {
  require("./check_row13_phase6_qualification_pair.cjs")
    .validateReportCore(core);
  assert.equal(core.qualifiedTiming, false);
  assert.equal(core.externalResourceSidecarBound, false);
  return core;
}

function finalize(corePath, resourcePath) {
  const coreBytes = fs.readFileSync(corePath);
  const resourceBytes = fs.readFileSync(resourcePath);
  const core = JSON.parse(coreBytes);
  validateCoreForFinalization(core);
  const resource = parseResourceSidecar(resourceBytes);
  validateResourceForCore(core, resource);
  const authority = {
    core: { path: corePath, sha256: sha256(coreBytes) },
    resourceSidecar: { path: resourcePath, sha256: sha256(resourceBytes) },
    sourceAuthoritySha256: core.sourceAuthority.sha256, resource,
  };
  return { schema:
    "sagejs.pari-class-group/row13-phase6-diagnostic-evidence-bundle-v1",
    qualifiedTiming: false, authority,
    authoritySha256: sha256(canonical(authority)) };
}

function main() {
  assert.equal(process.argv.length, 5,
    "usage: finalize_row13_phase6_evidence.cjs CORE RESOURCE OUTPUT");
  const result = finalize(process.argv[2], process.argv[3]);
  fs.writeFileSync(process.argv[4], canonical(result), { flag: "wx" });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = { finalize, main, parseResourceSidecar,
  validateCoreForFinalization, validateResourceForCore };
if (require.main === module) main();
