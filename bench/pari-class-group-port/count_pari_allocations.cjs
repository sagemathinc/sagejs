"use strict";
// Diagnostic instrumentation of the existing attributed PARI reference only.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const hash = value => createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60000,
    maxBuffer: 4 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result;
}
assert.equal(process.platform, "linux");
const referencePath = path.resolve(process.argv[2]);
const interposer = fs.realpathSync(process.argv[3]);
const reference = JSON.parse(fs.readFileSync(referencePath, "utf8"));
assert.equal(reference.sourceHash, "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
assert.equal(reference.ubsan, false, "use the existing release reference");
let source = fs.readFileSync(reference.build.sourcePath, "utf8");
assert.equal(hash(source), reference.transformedHash, "reference source drift");
const replacements = [];
function replace(before, after) {
  assert.equal(source.split(before).length, 2, "reference boundary drift: " + before);
  source = source.replace(before, after); replacements.push({ before, after });
}
replace('#include <time.h>', `#include <time.h>
#include <stdint.h>
extern int sagejs_alloc_begin(void);
extern void sagejs_alloc_end(void);
extern uint64_t sagejs_alloc_count(unsigned);
static void report_allocations(long field,long rep) {
  fprintf(stderr,"{\\\"field\\\":%ld,\\\"rep\\\":%ld,\\\"counts\\\":[",field,rep);
  for(unsigned i=0;i<11;i++) fprintf(stderr,"%s%llu",i?",":"",(unsigned long long)sagejs_alloc_count(i));
  fputs("]}\\n",stderr);
}`);
replace('cache.basis=zero_Flm_copy(F.KC,F.KC);',
  'if(!sagejs_alloc_begin())return 90;cache.basis=zero_Flm_copy(F.KC,F.KC);');
replace('GEN cyc=ZM_snf(W);if(rep>=0)',
  'GEN cyc=ZM_snf(W);sagejs_alloc_end();report_allocations(field,rep);if(rep>=0)');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-pari-allocations-"));
const sourcePath = path.join(directory, "oracle.c"), executable = path.join(directory, "oracle");
fs.writeFileSync(sourcePath, source);
const build = reference.build;
const args = [...build.flags, ...build.includePaths.map(p => "-I" + p), sourcePath,
  "-L" + build.libraryDirectory, "-Wl,-rpath," + build.libraryDirectory,
  "-lpari", "-lm", interposer, "-o", executable];
run(build.compilerPath, args);
const result = run(executable, ["3", "1"], { env: { ...process.env, LD_PRELOAD: interposer } });
const outputs = result.stdout.trim().split("\n").map(JSON.parse);
const samples = result.stderr.trim().split("\n").map(JSON.parse);
assert.equal(outputs.length, 1); assert.equal(samples.length, 4);
const expected = reference.outputs.find(r => r.field === 1);
assert(expected, "reference must contain field 1");
for (const [key, value] of Object.entries(expected)) {
  if (["repetitions", "unqualifiedSecondsTotal"].includes(key)) continue;
  assert.deepEqual(outputs[0][key], value, key);
}
assert.deepEqual(samples.map(s => s.rep), [-1, 0, 1, 2]);
for (const sample of samples) {
  assert.equal(sample.field, 1); assert.equal(sample.counts.length, 11);
  assert(sample.counts.every(Number.isSafeInteger));
  assert.equal(sample.counts[10], 0, "counter overflow");
}
const report = { diagnosticOnly: true, qualifiedTiming: false,
  boundary: "Existing prepared PARI reference: cache initialization through invariant-only SNF; excludes preparation, reporting and cache teardown. Warmup reported separately.",
  referencePath, referenceHash: hash(fs.readFileSync(referencePath)),
  interposer, interposerHash: hash(fs.readFileSync(interposer)),
  originalSourceHash: reference.transformedHash, instrumentedSourceHash: hash(source),
  pariLibraryPath: fs.realpathSync(build.pariLibraryPath),
  pariLibraryHash: hash(fs.readFileSync(build.pariLibraryPath)),
  executableHash: hash(fs.readFileSync(executable)),
  timingCaveat: "Allocator instrumentation and report serialization perturb the original clock; unqualifiedSecondsTotal is retained only as raw diagnostic output, never as a speed comparison.",
  replacements, buildArguments: args, directory, outputs, samples,
  counterNames: ["mallocCalls", "callocCalls", "reallocCalls", "freeCalls",
    "mallocRequestedBytes", "callocRequestedBytes", "reallocRequestedBytes",
    "freeNullCalls", "reallocNullCalls", "callocSizeOverflowCalls", "counterOverflow"] };
const reportPath = path.join(directory, "result.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, samples, outputs }));
