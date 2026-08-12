#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function execute(command, args, source) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

function corpus(helperDefinitions) {
  return String.raw`
import json
import time

${helperDefinitions}


def minimum_time(function, repetitions=3):
    best = 10**100
    for _repeat in range(repetitions):
        start = time.perf_counter()
        function()
        best = min(best, time.perf_counter() - start)
    return best


cases = []
for label, base in [("ZZ", ZZ), ("QQ", QQ), ("GF7", GF(7))]:
    entries = []
    for position in range(100):
        numerator = (position * 17 + 3) % 23 - 11
        if label == "QQ":
            entries.append(base(numerator) / (position % 5 + 1))
        else:
            entries.append(base(numerator))
    permanent_matrix = matrix(base, 10, 10, entries)
    minor_matrix = matrix(base, 7, 8, entries[:56])
    compute_permanent(permanent_matrix)
    compute_minors(minor_matrix, 3)
    cases.append({
        "domain": label,
        "permanent_10x10_ms": 1000 * minimum_time(
            lambda: compute_permanent(permanent_matrix)
        ),
        "minors_7x8_k3_ms": 1000 * minimum_time(
            lambda: compute_minors(minor_matrix, 3),
            2,
        ),
    })

print(json.dumps(cases, separators=(",", ":")))
`;
}

const sagejsHelpers = String.raw`
from sagejs.linear_algebra.combinatorial import matrix_minors, matrix_permanent


def compute_minors(matrix_value, size):
    return matrix_minors(matrix_value, size)


def compute_permanent(matrix_value):
    return matrix_permanent(matrix_value)
`;

const sageHelpers = String.raw`
def compute_minors(matrix_value, size):
    return matrix_value.minors(size)


def compute_permanent(matrix_value):
    return matrix_value.permanent()
`;

const result = {
  schema: "sagejs.linear-algebra/combinatorial-benchmark-v1",
  policy: "minimum of three warm samples; minors minimum of two",
  sagejs: execute(sagejs, ["--python"], corpus(sagejsHelpers)),
};

const sage = process.env.SAGE || "/home/user/bin/sagelite";
if (existsSync(sage)) {
  result.sage = execute(sage, ["-c", corpus(sageHelpers)], "");
}

console.log(JSON.stringify(result, null, 2));
