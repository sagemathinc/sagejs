#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { hostname, tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..", "..");
const host = hostname();
const forced = process.env.SAGEJS_FORCE_CLASS_UNIT_BENCH === "1";
if (host !== "bench-1" && !forced) {
  console.log(
    JSON.stringify({
      benchmark: "class-unit-engine-quintic",
      status: "skipped",
      reason: "the production timing receipt is conditional on bench-1",
      host,
    }),
  );
  process.exit(0);
}

const executable =
  process.env.SAGEJS_BENCH_EXECUTABLE || join(root, "bin", "sagejs");
const moduleSource = readFileSync(
  join(
    root,
    "src",
    "lib",
    "sagejs",
    "number_fields",
    "class_unit_groups.py",
  ),
  "utf8",
).replace("from __future__ import annotations\n", "");
const proof = process.env.SAGEJS_CLASS_UNIT_PROOF !== "0";
const source = String.raw`
import json

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
events = []
result = compute_class_unit_group(
    K,
    proof=${proof ? "True" : "False"},
    algorithm="buchmann-hecke",
    progress=events.append,
)
payload = {
    "complete": result.complete,
    "proof_status": result.proof_status,
    "reason": result.reason,
    "tentative_invariants": list(result.tentative_invariants),
    "class_number": result.class_number() if result.complete else None,
    "diagnostics": result.diagnostics,
    "stages": [stage.to_dict() for stage in result.stages],
    "progress_events": len(events),
}
print(json.dumps(payload, sort_keys=True))
`;

const directory = mkdtempSync(join(tmpdir(), "sagejs-class-unit-bench-"));
try {
  const filename = join(directory, "benchmark.py");
  writeFileSync(filename, `${moduleSource}\n${source}`, "utf8");
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, ["--python", filename], {
    cwd: root,
    encoding: "utf8",
    timeout: 30 * 60 * 1000,
  });
  const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  console.log(
    JSON.stringify({
      benchmark: "class-unit-engine-quintic",
      status: "completed",
      host,
      proof,
      wall_seconds: elapsedSeconds,
      result: JSON.parse(result.stdout.trim()),
    }),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
