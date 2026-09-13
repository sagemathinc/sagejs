#!/usr/bin/env node
// Measure Sage.js session startup, warm ODE solves, and process-memory snapshots.

import { performance } from "node:perf_hooks";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const require = createRequire(import.meta.url);
const { createSage } = require(join(root, "dist", "tools", "kernel.js"));

const source = String.raw`
import json
import math
import time
from sagejs.numerics.ode import OdeInvariant, solve_ivp

def classroom():
    return solve_ivp(
        lambda t, y: [y[0]],
        (0.0, 1.0),
        [1.0],
        rtol=1e-7,
        atol=1e-10,
        reference=lambda t: [math.exp(t)],
        reference_atol=1e-6,
        reference_rtol=1e-6,
        trace="summary",
    )

def interactive():
    return solve_ivp(
        lambda t, y: [y[1], -y[0]],
        (0.0, 40.0 * math.pi),
        [1.0, 0.0],
        rtol=1e-7,
        atol=1e-10,
        max_step=0.25,
        invariants=[
            OdeInvariant(
                lambda t, y: y[0] * y[0] + y[1] * y[1],
                name="squared_norm",
                atol=2e-5,
                rtol=2e-5,
            )
        ],
        trace="summary",
    )

records = {}
for name, workload, repetitions in (
    ("instant_classroom", classroom, 7),
    ("interactive_exploration", interactive, 3),
):
    workload()
    samples = []
    result = None
    for sample in range(repetitions):
        started = time.perf_counter()
        result = workload()
        samples.append(1000.0 * (time.perf_counter() - started))
    samples.sort()
    records[name] = {
        "samples": repetitions,
        "minimum_ms": samples[0],
        "median_ms": samples[len(samples) // 2],
        "maximum_ms": samples[-1],
        "accepted_steps": result.evidence["local_error_control"]["accepted_steps"],
        "rhs_evaluations": result.to_dict()["measurements"]["rhs_evaluations"],
        "serialized_result_bytes": len(result.to_json().encode("utf-8")),
    }

print(json.dumps(records, sort_keys=True))
`;

const before = process.memoryUsage();
const startupStarted = performance.now();
const session = await createSage({ mode: "python" });
const sessionStartupMs = performance.now() - startupStarted;
const afterStartup = process.memoryUsage();
let evaluation;
let evaluationWallMs;
try {
  const evaluationStarted = performance.now();
  evaluation = await session.evaluate(source, { language: "python", timeout: 240_000 });
  evaluationWallMs = performance.now() - evaluationStarted;
} finally {
  await session.close();
}
const afterEvaluation = process.memoryUsage();
const lines = evaluation.stdout.trim().split("\n");
const workloads = JSON.parse(lines.at(-1));

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  host: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
  },
  session_startup_ms: sessionStartupMs,
  evaluation_wall_ms: evaluationWallMs,
  memory_snapshots_bytes: {
    before,
    after_startup: afterStartup,
    after_evaluation: afterEvaluation,
  },
  memory_interpretation: "Node process snapshots include the complete Sage.js runtime; they are not per-result peaks",
  workloads,
}, null, 2)}\n`);
