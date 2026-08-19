#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const { arch, cpus, platform, release } = require("node:os");
const { join, resolve } = require("node:path");
const { spawn } = require("node:child_process");

const root = resolve(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const fixture = corpus.cases.find(
  (entry) => entry.id === "pari-round4-vector-429",
);
assert(fixture, "missing vector429 fixture");

const sampleArgument = process.argv.find((argument) =>
  argument.startsWith("--samples="),
);
const sampleCount = sampleArgument ? Number(sampleArgument.split("=")[1]) : 3;
const assertTarget = process.argv.includes("--assert-target");
const runControl = process.argv.includes("--control");
assert(Number.isInteger(sampleCount) && sampleCount >= 1 && sampleCount <= 5);

function processGroupRssKib(processGroup) {
  if (platform() !== "linux") return null;
  let total = 0;
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      const fields = stat.slice(close + 2).trim().split(/\s+/);
      if (Number(fields[2]) !== processGroup) continue;
      const status = readFileSync(`/proc/${name}/status`, "utf8");
      const match = /^VmRSS:\s+(\d+)\s+kB$/mu.exec(status);
      if (match) total += Number(match[1]);
    } catch {
      // Processes may exit between the directory and status reads.
    }
  }
  return total;
}

function terminateGroup(child, signal) {
  try {
    if (platform() === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // The child may already have completed.
  }
}

function runSage(source, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(join(root, "bin/sagejs"), [], {
      cwd: root,
      detached: platform() !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let peakRssKib = 0;
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const sampler = setInterval(() => {
      const observed = processGroupRssKib(child.pid);
      if (observed !== null) peakRssKib = Math.max(peakRssKib, observed);
    }, 25);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateGroup(child, "SIGTERM");
      setTimeout(() => terminateGroup(child, "SIGKILL"), 2000).unref();
    }, timeoutMs);
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      clearInterval(sampler);
      clearTimeout(timeout);
      if (timedOut) {
        resolvePromise({ timed_out: true, peak_rss_kib: peakRssKib });
        return;
      }
      if (code !== 0) {
        rejectPromise(
          new Error(`Sage.js child failed (${code ?? signal}): ${stderr}`),
        );
        return;
      }
      const line = stdout.trim().split(/\r?\n/).at(-1);
      const result = JSON.parse(line);
      result.peak_rss_kib = peakRssKib || null;
      resolvePromise(result);
    });
    child.stdin.end(source);
  });
}

const coefficients = fixture.polynomial.coefficients.join(",");
const publicProgram = String.raw`
import json
from time import perf_counter_ns

coefficients = [${coefficients}]
R = PolynomialRing(QQ, "x")
K = NumberField(R(coefficients), "a")
started = perf_counter_ns()
order = K.maximal_order(trace=True)
elapsed_us = (perf_counter_ns() - started) // 1000
certificate = order.maximality_certificate()
projection = order._authenticated_basis_projection
if projection is None:
    raise AssertionError("vector429 omitted its authenticated basis projection")
degree = len(coefficients) - 1
flat = projection[0]
events = order.maximal_order_trace()["events"]
print(json.dumps({
    "elapsed_us": elapsed_us,
    "basis_denominator": str(projection[1]),
    "basis_rows": [
        [str(flat[row * degree + column]) for column in range(degree)]
        for row in range(degree)
    ],
    "index": str(certificate["index"]),
    "order_discriminant": str(order.discriminant()),
    "certified": certificate["certified"] is True and order.is_maximal(),
    "events": [
        {
            "stage": event["stage"],
            "state": event["state"],
            "duration_us": event["duration_ns"] // 1000,
            "prime": event["details"].get("prime"),
            "authenticated_round2_proof": event["details"].get(
                "authenticated_round2_proof"
            ),
            "current_call_attested": event["details"].get(
                "current_call_attested"
            ),
        }
        for event in events
    ],
}))
`;

const controlProgram = String.raw`
coefficients = [${coefficients}]
R = PolynomialRing(QQ, "x")
K = NumberField(R(coefficients), "a")
O = K.maximal_order(7, algorithm="round2", trace=True)
print("completed", O.is_maximal())
`;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function projectionDigest(rows, denominator) {
  return digest(
    `sagejs-maximal-order-authenticated-projection-v1\n${JSON.stringify({
      denominator,
      numerator: rows,
    })}`,
  );
}

async function main() {
  const samples = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const result = await runSage(publicProgram, 15_000);
    assert.equal(result.timed_out, undefined, "public vector429 sample timed out");
    const basisDigest = projectionDigest(
      result.basis_rows,
      result.basis_denominator,
    );
    assert.equal(result.index, fixture.equationOrderIndex);
    assert.equal(result.order_discriminant, fixture.fieldDiscriminant);
    assert.equal(result.certified, true);
    const om = result.events.find(
      (event) => event.stage === "om-auto-local-order" && event.prime === 7,
    );
    const native = result.events.find(
      (event) => event.stage === "native-local-orders",
    );
    const global = result.events.find(
      (event) => event.stage === "global-certification",
    );
    assert.equal(om?.state, "complete");
    assert.equal(om?.current_call_attested, true);
    assert.equal(native?.state, "complete");
    assert.equal(native?.authenticated_round2_proof, true);
    assert.equal(global?.state, "authenticated-local-portfolio");
    samples.push({
      elapsed_us: result.elapsed_us,
      peak_rss_bytes:
        result.peak_rss_kib === null ? null : result.peak_rss_kib * 1024,
      basis_sha256: basisDigest,
      trace_sha256: digest(JSON.stringify(result.events)),
      stages: result.events,
    });
  }
  const elapsed = samples.map((sample) => sample.elapsed_us);
  assert.equal(
    new Set(samples.map((sample) => sample.basis_sha256)).size,
    1,
    "fresh public samples returned different authenticated bases",
  );
  const control = runControl
    ? await runSage(controlProgram, 15_000)
    : { not_run: true };
  const report = {
    schema: "sagejs.benchmark/number-field-vector429-public-v1",
    generated_at: new Date().toISOString(),
    case_id: fixture.id,
    degree: fixture.polynomial.degree,
    sample_count: sampleCount,
    target_us: 5_000_000,
    samples,
    statistics: {
      min_us: Math.min(...elapsed),
      median_us: median(elapsed),
      max_us: Math.max(...elapsed),
      median_under_target: median(elapsed) < 5_000_000,
      all_under_target: elapsed.every((value) => value < 5_000_000),
    },
    exact: {
      authenticated_projection_sha256: samples[0].basis_sha256,
      canonical_fixture_sha256: fixture.basis.digest,
      equation_order_index: fixture.equationOrderIndex,
      field_discriminant: fixture.fieldDiscriminant,
      certified: true,
    },
    suppressed_p7_round2_control: control,
    runtime: {
      node: process.version,
      platform: platform(),
      architecture: arch(),
      release: release(),
      cpu: cpus()[0]?.model ?? null,
    },
  };
  if (assertTarget) {
    assert.equal(report.statistics.median_under_target, true);
    if (runControl) assert.equal(control.timed_out, true);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
