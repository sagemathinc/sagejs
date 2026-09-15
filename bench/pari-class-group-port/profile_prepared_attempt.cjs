"use strict";
// Linux-only generated-artifact instrumentation. Not production compilation,
// an alternative mathematical implementation, or a qualified timing harness.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

assert(!process.argv.some(arg => arg === "--word-capacity" || arg.startsWith("--word-capacity=")),
  "phase profiler uses the fixed 64-word policy; use the resident probe for capacity experiments");

const phases = ["attempt", "relation_initialization", "collection", "logs",
  "hnf", "acceptance", "smith", "host_adapter"];
const mathematicalNames = ["prepared_class_group_attempt", "initialize_owned_relations",
  "collect_unreduced_ideals", "append_relation_log_embeddings", "hnfspec_complete",
  "post_hnf_acceptance", "class_invariant_output"].map(x => "pari_" + x);
const functionNames = mathematicalNames.flatMap(name => ["native_" + name, "tagged_" + name])
  .concat(["compiled_pari_prepared_class_group_attempt_gmp", "compiled_pari_prepared_class_group_attempt"]);
const sha = x => createHash("sha256").update(x).digest("hex");

function maskC(code) {
  return code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    text => text.replace(/[^\n]/g, " "));
}

function instrument(code, selected, returnType) {
  const masked = maskC(code), edits = [], coverage = [];
  for (const [id, name] of selected) {
    const pattern = new RegExp("^static " + returnType + " " + name + "\\([^;{}]*\\)\\s*\\{", "gm");
    const matches = [...masked.matchAll(pattern)];
    assert.equal(matches.length, 1, "expected one function definition: " + name);
    const open = matches[0].index + matches[0][0].lastIndexOf("{");
    let end = open + 1, depth = 1;
    while (depth && end < masked.length) {
      if (masked[end] === "{") depth++;
      else if (masked[end] === "}") depth--;
      end++;
    }
    assert.equal(depth, 0, "unclosed generated function: " + name);
    const body = masked.slice(open + 1, end - 1);
    const returns = [...body.matchAll(/\breturn\s+([^;]+);/g)];
    assert(returns.length > 0, "missing generated return: " + name);
    for (const match of returns) {
      const begin = open + 1 + match.index;
      const original = code.slice(begin, begin + match[0].length);
      const expression = original.slice(original.indexOf("return") + 6, -1).trim();
      const helper = returnType === "int" ? "sagejs_diag_end_int" : "sagejs_diag_end_pointer";
      edits.push([begin, begin + match[0].length,
        `return ${helper}(${id}, sagejs_diag_stamp, (${expression}));`]);
    }
    edits.push([open + 1, open + 1,
      `\n    sagejs_diag_clock sagejs_diag_stamp = sagejs_diag_begin(${id});`]);
    coverage.push({ id, name, returnSites: returns.length });
  }
  edits.sort((a, b) => a[0] - b[0]);
  let position = 0;
  const pieces = [];
  for (const [begin, end, replacement] of edits) {
    assert(begin >= position, "overlapping diagnostic edits");
    pieces.push(code.slice(position, begin), replacement);
    position = end;
  }
  pieces.push(code.slice(position));
  return { code: pieces.join(""), coverage };
}

const timerSource = String.raw`
/* Diagnostic-only clocks; serialized Node execution, not thread-safe API. */
#include <time.h>
typedef struct { double wall, cpu; int outer; } sagejs_diag_clock;
static unsigned long long sagejs_diag_calls[16];
static double sagejs_diag_wall[16], sagejs_diag_cpu[16];
static double sagejs_diag_phase_wall[8], sagejs_diag_phase_cpu[8];
static unsigned long long sagejs_diag_phase_calls[8];
static int sagejs_diag_depth[8], sagejs_diag_clock_error;
static double sagejs_diag_now(clockid_t clock) {
    struct timespec value;
    if (clock_gettime(clock, &value)) { sagejs_diag_clock_error = 1; return 0; }
    return (double)value.tv_sec + (double)value.tv_nsec * 1e-9;
}
static sagejs_diag_clock sagejs_diag_begin(int id) {
    sagejs_diag_clock stamp;
    stamp.wall = sagejs_diag_now(CLOCK_MONOTONIC);
    stamp.cpu = sagejs_diag_now(CLOCK_THREAD_CPUTIME_ID);
    stamp.outer = sagejs_diag_depth[id / 2]++ == 0;
    sagejs_diag_calls[id]++;
    return stamp;
}
static void sagejs_diag_end(int id, sagejs_diag_clock stamp) {
    double wall = sagejs_diag_now(CLOCK_MONOTONIC) - stamp.wall;
    double cpu = sagejs_diag_now(CLOCK_THREAD_CPUTIME_ID) - stamp.cpu;
    sagejs_diag_wall[id] += wall; sagejs_diag_cpu[id] += cpu;
    if (--sagejs_diag_depth[id / 2] < 0) sagejs_diag_clock_error = 1;
    if (stamp.outer) {
        sagejs_diag_phase_wall[id / 2] += wall;
        sagejs_diag_phase_cpu[id / 2] += cpu;
        sagejs_diag_phase_calls[id / 2]++;
    }
}
static int sagejs_diag_end_int(int id, sagejs_diag_clock stamp, int result) {
    sagejs_diag_end(id, stamp); return result;
}
static void *sagejs_diag_end_pointer(int id, sagejs_diag_clock stamp, void *result) {
    sagejs_diag_end(id, stamp); return result;
}
`;

// This additional getter exists only in the copied diagnostic host adapter.
// No host call or output serialization is inserted in mathematical execution.
const getterSource = String.raw`
#include <stdio.h>
static napi_value sagejs_diag_profile(napi_env env, napi_callback_info info) {
    char text[8192]; size_t used = 0; napi_value result; (void)info;
    int invalid = sagejs_diag_clock_error;
    for (int i = 0; i < 8; i++) if (sagejs_diag_depth[i]) invalid = 1;
    used += (size_t)snprintf(text + used, sizeof(text) - used,
        "{\"invalid\":%d,\"functions\":[", invalid);
    for (int i = 0; i < 16; i++)
        used += (size_t)snprintf(text + used, sizeof(text) - used,
            "%s[%llu,%.17g,%.17g]", i ? "," : "", sagejs_diag_calls[i], sagejs_diag_wall[i], sagejs_diag_cpu[i]);
    used += (size_t)snprintf(text + used, sizeof(text) - used, "],\"phases\":[");
    for (int i = 0; i < 8; i++)
        used += (size_t)snprintf(text + used, sizeof(text) - used,
            "%s[%llu,%.17g,%.17g]", i ? "," : "", sagejs_diag_phase_calls[i], sagejs_diag_phase_wall[i], sagejs_diag_phase_cpu[i]);
    used += (size_t)snprintf(text + used, sizeof(text) - used, "]}");
    if (used >= sizeof(text)) { napi_throw_error(env, NULL, "diagnostic profile overflow"); return NULL; }
    if (napi_create_string_utf8(env, text, used, &result) != napi_ok) return NULL;
    return result;
}
`;

async function main(argv = process.argv.slice(2)) {
  assert.equal(process.platform, "linux", "Linux-only diagnostic instrumentation");
  const get = (name, fallback) => {
    const i = argv.indexOf(name);
    if (i < 0) return fallback;
    assert.equal(argv.lastIndexOf(name), i, "duplicate option " + name);
    assert(argv[i + 1] && !argv[i + 1].startsWith("--"), "missing value " + name);
    return argv[i + 1];
  };
  assert(argv[0] && !argv[0].startsWith("--"), "input fixture required");
  const inputPath = path.resolve(argv[0]);
  const backend = get("--backend", "gmp");
  assert(["gmp", "tagged"].includes(backend));
  const cacheRoot = path.join(__dirname, ".sagejs-native-kernels");
  const sourcePath = path.join(__dirname, "prepared_class_group_attempt.py");
  const discovery = JSON.parse(fs.readFileSync(path.join(cacheRoot, "index.json"), "utf8"));
  const cacheKey = get("--cache-key", discovery.sources[sourcePath]?.cacheKey);
  assert(/^[0-9a-f]{64}$/.test(cacheKey), "missing valid existing cache key");
  const canonical = path.join(cacheRoot, cacheKey);
  const manifest = JSON.parse(fs.readFileSync(path.join(canonical, "manifest.json"), "utf8"));
  assert.equal(manifest.sourcePath, sourcePath);
  assert.equal(manifest.sourceHash, sha(fs.readFileSync(sourcePath)), "stale top-level cache source");
  // Do not ask the compiler to rebuild or alter this canonical artifact.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-phase-profile-"));
  const originals = {};
  for (const file of ["kernel.c", "kernel_core.c", "kernel_core.h", "binding.gyp", "index.cjs"]) {
    originals[file] = fs.readFileSync(path.join(canonical, file), "utf8");
    fs.writeFileSync(path.join(directory, file), originals[file]);
  }
  const binding = JSON.parse(originals["binding.gyp"]);
  assert.deepEqual(binding.targets[0].sources, ["kernel.c"], "unsupported copied build dependencies");
  assert(!originals["kernel_core.c"].includes("sagejs_diag_"), "already instrumented core");
  const core = instrument(originals["kernel_core.c"], functionNames.slice(0, 14).map((n, i) => [i, n]), "int");
  const adapter = instrument(originals["kernel.c"], functionNames.slice(14).map((n, i) => [i + 14, n]), "napi_value");
  fs.writeFileSync(path.join(directory, "kernel_core.c"), timerSource + core.code);
  const initialize = "SAGEJS_NATIVE_INITIALIZER_LINKAGE napi_value SAGEJS_NATIVE_INITIALIZER(";
  assert.equal(adapter.code.split(initialize).length, 2, "unexpected adapter initializer");
  let copiedAdapter = adapter.code.replace(initialize, getterSource + "\n" + initialize);
  const properties = "napi_property_descriptor properties[] = {";
  assert.equal(copiedAdapter.split(properties).length, 2, "unexpected export table");
  copiedAdapter = copiedAdapter.replace(properties, properties +
    '\n        {"__diagnosticPhaseProfile", NULL, sagejs_diag_profile, NULL, NULL, NULL, napi_default, NULL},');
  fs.writeFileSync(path.join(directory, "kernel.c"), copiedAdapter);
  const provenance = {
    qualifiedTiming: false, diagnosticOnly: true, backend, cacheKey, canonical, directory,
    inputSha256: sha(fs.readFileSync(inputPath)), sourceSha256: manifest.sourceHash,
    manifestSha256: sha(fs.readFileSync(path.join(canonical, "manifest.json"))),
    originalHashes: Object.fromEntries(Object.entries(originals).map(([n, s]) => [n, sha(s)])),
    instrumentedHashes: { "kernel_core.c": sha(timerSource + core.code), "kernel.c": sha(copiedAdapter) },
    coverage: core.coverage.concat(adapter.coverage), binding,
    note: "Pinned copied cache artifact, not a claim that all current transitive sources match it; original core and manifest hashes identify the executed graph. Timers perturb code generation. Function timings are inclusive; outermost phase totals suppress same-phase bridge double counts. Includes the probe warmup. No PARI ratio or production performance claim.",
  };
  fs.writeFileSync(path.join(directory, "instrumentation.json"), JSON.stringify(provenance, null, 2));
  if (argv.includes("--prepare-only")) { console.log(JSON.stringify(provenance)); return; }
  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", { paths: [path.join(__dirname, "../../packages/flint")] });
  const build = spawnSync(process.execPath, [nodeGyp, "rebuild", "--jobs", "1"],
    { cwd: directory, encoding: "utf8", timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(path.join(directory, "build.log"), (build.stdout || "") + (build.stderr || ""));
  assert.equal(build.status, 0, "diagnostic build failed: " + (build.error || build.stderr));
  const probePath = path.join(__dirname, "probe_resident_class_attempt.cjs");
  const ordinaryRequire = createRequire(probePath);
  let probeReport;
  const copiedBuild = {
    modulePath: path.join(directory, "index.cjs"),
    coreSourcePath: path.join(directory, "kernel_core.c"),
  };
  const probeArguments = [process.execPath, probePath, inputPath, "--backend", backend,
    "--samples", get("--samples", "3"), "--repetitions", get("--repetitions", "1")];
  const reference = get("--reference-fixtures", null);
  if (reference) probeArguments.push("--reference-fixtures", path.resolve(reference));
  const probeSource = fs.readFileSync(probePath, "utf8");
  assert.equal(probeSource.split("(async () => {").length, 2, "unexpected probe entry");
  // Same JavaScript realm as the generated module: deepStrictEqual must retain
  // its prototype checks. Only return the existing promise to await it here.
  const runProbe = new Function("require", "__dirname", "process", "console",
    probeSource.replace("(async () => {", "return (async () => {"));
  await runProbe(
    name => name === "../../tools/native-kernel/compiler.cjs"
      ? { compileKernel: async options => { assert.equal(options.sourcePath, sourcePath); return copiedBuild; } }
      : ordinaryRequire(name),
    __dirname, { argv: probeArguments, cpuUsage: process.cpuUsage.bind(process) },
    { log: text => { probeReport = JSON.parse(text); }, error: error => { throw error; } },
  );
  assert(probeReport, "probe failed to publish checked results");
  const addon = require(path.join(directory, "build/Release/sagejs_native_kernel.node"));
  const counters = JSON.parse(addon.__diagnosticPhaseProfile());
  assert.equal(counters.invalid, 0, "unbalanced phase stack or clock failure");
  const summarize = (names, rows) => Object.fromEntries(names.map((name, i) => [name,
    { calls: rows[i][0], wallSeconds: rows[i][1], threadCpuSeconds: rows[i][2] }]));
  const functions = summarize(functionNames, counters.functions), phaseTotals = summarize(phases, counters.phases);
  const calls = probeReport.timedCalls + probeReport.warmupCalls;
  for (const phase of phases) assert.equal(phaseTotals[phase].calls, calls, "unexpected call schedule: " + phase);
  const sums = key => phases.slice(1, 7).reduce((sum, name) => sum + phaseTotals[name][key], 0);
  const residual = {
    coreOtherWallSeconds: phaseTotals.attempt.wallSeconds - sums("wallSeconds"),
    coreOtherThreadCpuSeconds: phaseTotals.attempt.threadCpuSeconds - sums("threadCpuSeconds"),
    hostAdapterOtherWallSeconds: phaseTotals.host_adapter.wallSeconds - phaseTotals.attempt.wallSeconds,
    hostAdapterOtherThreadCpuSeconds: phaseTotals.host_adapter.threadCpuSeconds - phaseTotals.attempt.threadCpuSeconds,
  };
  for (const [file, original] of Object.entries(originals))
    assert.equal(sha(fs.readFileSync(path.join(canonical, file))), sha(original), "canonical artifact changed: " + file);
  const report = { ...provenance, probeSha256: sha(probeSource), functions, phaseTotals, residual, probe: probeReport };
  fs.writeFileSync(path.join(directory, "profile.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

module.exports = { instrument, maskC, main };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
