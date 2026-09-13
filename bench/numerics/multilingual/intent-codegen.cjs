#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..", "..", "..");
const iterations = Number(process.env.SAGEJS_MULTILINGUAL_BENCH_ITERATIONS || 2000);
assert.ok(Number.isSafeInteger(iterations) && iterations > 0);

const source = String.raw`
import collections.abc, hashlib, json, math, re, sys, time, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.numerics.frontends import FRONTEND_LANGUAGES, SCALAR_ROOT, create_frontend_registry, matlab_fzero_intent

iterations = ${iterations}
registry = create_frontend_registry()
started = time.perf_counter()
digests = []
for index in range(iterations):
    intent = matlab_fzero_intent(
        lambda x: x*x - 2,
        [1, 2],
        expression="x^2 - 2",
    )
    digests.append(intent.digest)
record_seconds = time.perf_counter() - started

intent = matlab_fzero_intent(lambda x: x*x - 2, [1, 2], expression="x^2 - 2")
started = time.perf_counter()
translated = 0
for index in range(iterations):
    for language in FRONTEND_LANGUAGES:
        code = registry.emit(intent, language)
        round_trip = registry.parse(code, language, SCALAR_ROOT)
        assert round_trip.digest == intent.digest
        translated += 1
translation_seconds = time.perf_counter() - started

print(json.dumps({
    "schema_version": 1,
    "workload": "scalar-root-canonical-intent-and-four-target-round-trip",
    "runtime": "cpython",
    "iterations": iterations,
    "record_constructions": len(digests),
    "round_trips": translated,
    "record_seconds": record_seconds,
    "round_trip_seconds": translation_seconds,
    "records_per_second": len(digests) / record_seconds,
    "round_trips_per_second": translated / translation_seconds,
}, sort_keys=True))
`;

const executable = process.env.PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const result = spawnSync(executable, ["-I", "-c", source], {
  cwd: root,
  encoding: "utf8",
  timeout: 120_000,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
process.stdout.write(result.stdout);
