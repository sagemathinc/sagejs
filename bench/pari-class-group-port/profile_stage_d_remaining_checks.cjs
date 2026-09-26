"use strict";

/*
 * Dynamically count the checks left in the real Stage-D private catalog.
 *
 * This script does not regenerate IR or change the compiler.  It copies an
 * already validated Stage-D build, inserts one counter immediately before
 * each surviving checked int64 arithmetic or signed buffer-index operation in
 * the private 36-function graph, rebuilds the disposable copy, verifies every
 * frozen packet, and profiles one fresh execution of packet zero.
 *
 * Usage:
 *   node profile_stage_d_remaining_checks.cjs \
 *     FIXTURES_JSON STAGE_D_BUILD_DIRECTORY
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const [fixturesArgument, stageDArgument] = process.argv.slice(2);
if (!stageDArgument) {
  throw new Error(
    "usage: node profile_stage_d_remaining_checks.cjs " +
      "FIXTURES_JSON STAGE_D_BUILD_DIRECTORY",
  );
}

const fixturesPath = resolve(fixturesArgument);
const stageDDirectory = resolve(stageDArgument);
const outputDirectory = mkdtempSync(join(tmpdir(), "sagejs-stage-d-counts-"));
const countsPath = join(outputDirectory, "counts.tsv");
const ENTRY = "int64_pari_prime_degree_catalog";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

for (const filename of [
  "binding.gyp",
  "index.cjs",
  "manifest.json",
  "kernel.c",
  "kernel_core.h",
]) {
  copyFileSync(join(stageDDirectory, filename), join(outputDirectory, filename));
}

const original = readFileSync(join(stageDDirectory, "kernel_core.c"), "utf8");
const privateDefinitionPattern = new RegExp(
  "(?:static|SAGEJS_CHECKED_REGION_HOT_INLINE) int " +
    `tagged_sagejs_checked_r0_${ENTRY}\\([^;]+\\)\\n\\{`,
  "g",
);
const privateDefinitions = [...original.matchAll(privateDefinitionPattern)];
assert.equal(privateDefinitions.length, 1, "expected one private entry definition");
const start = privateDefinitions[0].index;
const nativeDefinition = new RegExp(
  `static int native_${ENTRY}\\([^;]+\\)\\n\\{`,
).exec(original.slice(start));
assert(nativeDefinition, "missing native entry definition after private graph");
const end = start + nativeDefinition.index;

const prefix = original.slice(0, start);
const privateGraph = original.slice(start, end);
const suffix = original.slice(end);
const lines = privateGraph.split("\n");
const sites = [];
let provenance = null;
const provenancePattern =
  /\/\* sagejs-ir ([^ ]+) ([^ ]+):(\d+):(\d+)(?: origins=([^ ]+))? \*\//;
const arithmeticPattern =
  /if \(!sagejs_word_(add|sub|mul)_int64\((.*)\)\)/;
const boundsPattern =
  /if \(!sagejs_signed_buffer_index\(([^,]+)\.length, (.*), &[^)]+\)\)/;

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const provenanceMatch = provenancePattern.exec(line);
  if (provenanceMatch) {
    const [generatedFunctionAndOperation, source, sourceLine, sourceColumn,
      originalFunctionAndOperation] =
      provenanceMatch.slice(1);
    const functionAndOperation =
      originalFunctionAndOperation || generatedFunctionAndOperation;
    const separator = functionAndOperation.lastIndexOf(":");
    provenance = {
      function: functionAndOperation.slice(0, separator),
      operation: functionAndOperation.slice(separator + 1),
      source,
      sourceLine: Number(sourceLine),
      sourceColumn: Number(sourceColumn),
    };
  }

  const arithmetic = arithmeticPattern.exec(line);
  const bounds = boundsPattern.exec(line);
  if (!arithmetic && !bounds) continue;
  assert(provenance, `site at generated line ${index + 1} lacks provenance`);
  const indentation = /^\s*/.exec(line)[0];
  const id = sites.length;
  let metadata;
  if (arithmetic) {
    metadata = {
      family: "arithmetic",
      operationKind: arithmetic[1],
      expression: arithmetic[2],
    };
  } else {
    const failure = lines.slice(index, index + 8).join("\n");
    const bufferType = /(Int64|UInt64)Buffer index out of range/.exec(failure);
    assert(bufferType, `bounds site at generated line ${index + 1} lacks type`);
    metadata = {
      family: "bounds",
      operationKind: "signed-buffer-index",
      bufferType: bufferType[1],
      buffer: bounds[1],
      indexExpression: bounds[2],
    };
  }
  sites.push({
    id,
    ...provenance,
    ...metadata,
    generatedLine: index + 1,
  });
  lines[index] = `${indentation}sagejs_diag_counts[${id}] += UINT64_C(1);\n${line}`;
}

assert.equal(
  sites.filter((site) => site.family === "arithmetic").length,
  311,
  "Stage-D arithmetic check census changed",
);
assert.equal(
  sites.filter((site) => site.family === "bounds").length,
  71,
  "Stage-D bounds check census changed",
);

const diagnosticSupport = `
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

/* Diagnostic-only dynamic Stage-D check counters. */
static uint64_t sagejs_diag_counts[${sites.length}] = {0};
static int sagejs_diag_registered = 0;
static void sagejs_diag_dump(void)
{
    const char *path = getenv("SAGEJS_STAGE_D_COUNTS_PATH");
    if (path == NULL || path[0] == '\\0') return;
    FILE *stream = fopen(path, "w");
    if (stream == NULL) return;
    for (size_t index = 0; index < ${sites.length}; index += 1)
        fprintf(stream, "%zu\\t%" PRIu64 "\\n", index, sagejs_diag_counts[index]);
    fclose(stream);
}
static void sagejs_diag_register(void)
{
    if (sagejs_diag_registered) return;
    sagejs_diag_registered = 1;
    atexit(sagejs_diag_dump);
}

`;
let instrumentedPrivate = lines.join("\n");
const openingBrace = instrumentedPrivate.indexOf("\n{");
assert(openingBrace >= 0);
instrumentedPrivate =
  instrumentedPrivate.slice(0, openingBrace + 2) +
  "\n    sagejs_diag_register();" +
  instrumentedPrivate.slice(openingBrace + 2);
const instrumented =
  diagnosticSupport + prefix + instrumentedPrivate + suffix;
writeFileSync(join(outputDirectory, "kernel_core.c"), instrumented);

const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
  paths: [resolve(__dirname, "../../packages/flint")],
});
const build = spawnSync(process.execPath, [nodeGyp, "rebuild", "--jobs", "4"], {
  cwd: outputDirectory,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
if (build.status !== 0) {
  process.stderr.write(build.stdout || "");
  process.stderr.write(build.stderr || "");
  throw new Error(`node-gyp exited with status ${build.status}`);
}
writeFileSync(join(outputDirectory, "rebuild.log"), build.stdout + build.stderr);

const runnerPath = join(outputDirectory, "run.cjs");
writeFileSync(
  runnerPath,
  `"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const fixtures = JSON.parse(readFileSync(process.argv[2], "utf8"));
const kernel = require(join(__dirname, "index.cjs"))[${JSON.stringify(ENTRY)}];
function args(packet) {
  return packet.map((value, index) => {
    if (!Array.isArray(value)) return BigInt(value);
    if (index === 8) return kernel.createUInt64Buffer(value.map(BigInt));
    if ([5, 6, 7].includes(index))
      return kernel.createIntegerBuffer(value.length, 16, value.map(BigInt));
    return kernel.createInt64Buffer(value.map(BigInt));
  });
}
function snapshot(values) {
  return values.map((value) => {
    if (typeof value === "bigint") return String(value);
    if (typeof value.toArray === "function") return value.toArray().map(String);
    return Array.from(value).map(String);
  });
}
const indexes = process.argv[3] === "all" ? [0, 1, 2, 3] : [0];
for (const index of indexes) {
  const values = args(fixtures.packets[index]);
  const result = Number(kernel.tagged(...values));
  assert.deepEqual({ result, args: snapshot(values) }, fixtures.expected[index]);
}
`,
);

function run(label, indexes, environment = {}) {
  const child = spawnSync(process.execPath, [runnerPath, fixturesPath, indexes], {
    cwd: outputDirectory,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  if (child.status !== 0) {
    process.stderr.write(child.stdout || "");
    process.stderr.write(child.stderr || "");
    throw new Error(`${label} exited with status ${child.status}`);
  }
}
run("frozen validation", "all");
run("packet-zero profile", "zero", {
  SAGEJS_STAGE_D_COUNTS_PATH: countsPath,
});

const counts = new Map(
  readFileSync(countsPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => line.split("\t").map(Number)),
);
assert.equal(counts.size, sites.length);
for (const site of sites) site.count = counts.get(site.id);

function normalizeExpression(expression) {
  return expression
    .replaceAll("sagejs_local_tagged_", "")
    .replaceAll("sagejs_word_", "")
    .replaceAll(/sagejs_native_tmp_\d+/g, "tmp")
    .replaceAll(/\s+/g, " ")
    .trim();
}
for (const site of sites) {
  site.expression = site.expression && normalizeExpression(site.expression);
  site.buffer = site.buffer && normalizeExpression(site.buffer);
  site.indexExpression =
    site.indexExpression && normalizeExpression(site.indexExpression);
  site.source = site.source.replace(
    "/home/user/sagejs-worktrees/pari-class-group-port/",
    "",
  );
}

function aggregate(keyFunction) {
  const groups = new Map();
  for (const site of sites) {
    const key = keyFunction(site);
    const group = groups.get(key) || { key, count: 0, staticSites: 0 };
    group.count += site.count;
    group.staticSites += 1;
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort(
    (left, right) => right.count - left.count,
  );
  let cumulativeCount = 0;
  for (const group of ranked) {
    cumulativeCount += group.count;
    group.cumulativeCount = cumulativeCount;
  }
  return ranked;
}

const total = sites.reduce((sum, site) => sum + site.count, 0);
const rankedSites = [...sites].sort((left, right) => right.count - left.count);
let cumulative = 0;
for (const site of rankedSites) {
  cumulative += site.count;
  site.cumulativeCount = cumulative;
  site.cumulativeFraction = total === 0 ? 0 : cumulative / total;
}
const familyTotals = Object.fromEntries(
  ["arithmetic", "bounds"].map((family) => [
    family,
    sites
      .filter((site) => site.family === family)
      .reduce((sum, site) => sum + site.count, 0),
  ]),
);
const byFunction = aggregate((site) => site.function);
const byOperation = aggregate(
  (site) => `${site.family}:${site.operationKind}`,
);
const byIndexShape = aggregate((site) =>
  site.family === "bounds"
    ? `${site.buffer}[${site.indexExpression}]`
    : `${site.operationKind}(${site.expression})`,
);
for (const ranking of [byFunction, byOperation, byIndexShape]) {
  for (const group of ranking) {
    group.cumulativeFraction = total === 0 ? 0 : group.cumulativeCount / total;
  }
}
const result = {
  schema: "sagejs.checked-region/stage-d-dynamic-check-profile-v1",
  diagnosticOnly: true,
  boundary: "one fresh tagged execution of frozen packet zero",
  frozenValidationPackets: 4,
  frozenOutputsIdentical: true,
  staticSites: sites.length,
  dynamicChecks: total,
  familyTotals,
  fixtureSha256: sha256(readFileSync(fixturesPath)),
  stageDCoreSha256: sha256(original),
  instrumentedCoreSha256: sha256(instrumented),
  byFunction,
  byOperation,
  byIndexShape,
  rankedSites,
  outputDirectory,
};
console.log(JSON.stringify(result));
