"use strict";

// Benchmark-only PARI 2.17.4 controls for the resident field's eager degree
// catalog. This does not alter or replace the frozen whole-candidate reference.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const sha256 = value => createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
function count(name, fallback, maximum) {
  const text = option(name, String(fallback));
  assert(/^[0-9]+$/.test(text), name);
  const value = Number(text);
  assert(Number.isSafeInteger(value) && value <= maximum, name);
  return value;
}

const pari = path.resolve(process.argv[2]);
const archive = path.resolve(process.argv[3]);
const catalogPath = path.resolve(process.argv[4]);
const lib = path.join(pari, "Olinux-x86_64");
const warmups = count("--warmups", 3, 100);
const batches = count("--batches", 1, 100);
const repetitions = count("--repetitions", 1, 10000);
assert(batches > 0 && repetitions > 0);

const archiveBytes = fs.readFileSync(archive);
assert.equal(
  sha256(archiveBytes),
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
);
const pristine = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
assert.equal(
  sha256(pristine),
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
);
for (const name of ["pariinl.h", "parigen.h"]) {
  const pinned = run("tar", ["-xOf", archive, `pari-2.17.4/src/headers/${name}`]);
  assert.equal(fs.readFileSync(path.join(pari, "src/headers", name), "utf8"), pinned);
}

const catalogBytes = fs.readFileSync(catalogPath);
const catalog = JSON.parse(catalogBytes);
const fixture = catalog.cases[0];
assert.equal(fixture.primes.length, 1230);
assert.equal(Number(fixture.primes.at(-1)), 10007);
const primes = fixture.primes.map(Number);
assert(primes.every(Number.isSafeInteger));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-pari-catalog-stage-"));
const sourcePath = path.join(directory, "catalog-stage.c");
const executablePath = path.join(directory, "catalog-stage");
const cPrimes = primes.join(",");
const source = `${pristine}

/* Benchmark-only controls appended to pristine PARI 2.17.4 buch2.c. */
#include <time.h>
#include <stdint.h>
static const ulong frozen_primes[1230] = {${cPrimes}};
static long pattern_offsets[1230], pattern_counts[1230];
static long full_offsets[1230], full_counts[1230];
static long pattern_degrees[3690], pattern_multiplicities[3690];
static long full_degrees[3690];

typedef struct { long primes, groups, factors; } catalog_state;
static double seconds_between(struct timespec a, struct timespec b)
{ return (double)(b.tv_sec-a.tv_sec) + (double)(b.tv_nsec-a.tv_nsec)*1e-9; }
static long argument(const char *text)
{
  char *end; long value = strtol(text, &end, 10);
  return (!*text || *end)? -1: value;
}

/* Same mathematical get_fs calls, supplied-prime order, and flat publication
 * contract as the translated eager wrapper. Internally this still uses PARI
 * GEN/stack storage, so it is output-contract matched, not storage matched. */
static catalog_state contract_catalog(GEN nf)
{
  GEN P = nf_get_pol(nf), index = nf_get_index(nf);
  catalog_state state = {0,0,0};
  long groups = 0, factors = 0;
  if (!equali1(index)) pari_err_BUG("unexpected resident equation index");
  for (long i=0; i<1230; i++)
  {
    pari_sp av = avma;
    ulong p = frozen_primes[i];
    GEN result = get_fs(nf, P, index, p);
    GEN degrees = gel(result,1), counts = gel(result,2);
    pattern_offsets[i] = groups;
    pattern_counts[i] = lg(degrees)-1;
    full_offsets[i] = factors;
    full_counts[i] = 0;
    for (long j=1; j<lg(degrees); j++)
    {
      long degree = degrees[j], multiplicity = counts[j];
      pattern_degrees[groups] = degree;
      pattern_multiplicities[groups++] = multiplicity;
      for (long k=0; k<multiplicity; k++) full_degrees[factors++] = degree;
      full_counts[i] += multiplicity;
    }
    set_avma(av);
  }
  state.primes = 1230; state.groups = groups; state.factors = factors;
  return state;
}

static catalog_state natural_cache_state(GRHcheck_t *S)
{
  long groups=0, factors=0;
  for (long i=0; i<S->nprimes; i++)
  {
    GEN degrees=gel(S->primes[i].dec,1), counts=gel(S->primes[i].dec,2);
    groups += lg(degrees)-1;
    for (long j=1; j<lg(counts); j++) factors += counts[j];
  }
  catalog_state state={S->nprimes,groups,factors}; return state;
}

static void print_longs(const long *values, long count)
{
  putchar('['); for (long i=0;i<count;i++) { if(i) putchar(','); printf("%ld",values[i]); } putchar(']');
}

int main(int argc, char **argv)
{
  if (argc != 4) return 2;
  long warmups=argument(argv[1]), batches=argument(argv[2]), reps=argument(argv[3]);
  if (warmups<0 || warmups>100 || batches<1 || batches>100 || reps<1 || reps>10000) return 2;
  pari_init(256000000,10000); DEBUGLEVEL=0;
  GEN nf=nfinit(gp_read_str("x^3-20018*x+20034"),nbits2prec(192));
  if (!equali1(nf_get_index(nf))) pari_err_BUG("resident equation index changed");
  double *natural_wall=calloc((size_t)batches,sizeof(double));
  double *natural_cpu=calloc((size_t)batches,sizeof(double));
  double *natural_teardown_wall=calloc((size_t)batches,sizeof(double));
  double *natural_teardown_cpu=calloc((size_t)batches,sizeof(double));
  double *contract_wall=calloc((size_t)batches,sizeof(double));
  double *contract_cpu=calloc((size_t)batches,sizeof(double));
  if (!natural_wall || !natural_cpu || !natural_teardown_wall ||
      !natural_teardown_cpu || !contract_wall || !contract_cpu) return 4;
  catalog_state last_natural={0,0,0}, last_contract={0,0,0};
  long calls=warmups+batches*reps;
  for (long call=0; call<calls; call++)
  {
    long batch=call<warmups? -1: (call-warmups)/reps;
    struct timespec w0,w1,c0,c1;
    int contract_first=(call&1)==0;
    for (long arm=0; arm<2; arm++)
    {
      int do_contract=(arm==0)==contract_first;
      if (do_contract)
      {
        clock_gettime(CLOCK_MONOTONIC,&w0); clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c0);
        last_contract=contract_catalog(nf);
        clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c1); clock_gettime(CLOCK_MONOTONIC,&w1);
        if(batch>=0){contract_wall[batch]+=seconds_between(w0,w1);contract_cpu[batch]+=seconds_between(c0,c1);}
      }
      else
      {
        long N=nf_get_degree(nf), r1=nf_get_r1(nf);
        double LOGD=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2;
        GRHcheck_t S;
        /* Fresh-cache construction is setup, analogous to caller-owned native
         * buffers. Cache population is the isolated natural PARI stage. */
        init_GRHcheck(&S,N,r1,LOGD);
        clock_gettime(CLOCK_MONOTONIC,&w0); clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c0);
        cache_prime_dec(&S,10007,nf);
        clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c1); clock_gettime(CLOCK_MONOTONIC,&w1);
        if(batch>=0){natural_wall[batch]+=seconds_between(w0,w1);natural_cpu[batch]+=seconds_between(c0,c1);}
        last_natural=natural_cache_state(&S);
        clock_gettime(CLOCK_MONOTONIC,&w0); clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c0);
        free_GRHcheck(&S);
        clock_gettime(CLOCK_THREAD_CPUTIME_ID,&c1); clock_gettime(CLOCK_MONOTONIC,&w1);
        if(batch>=0){natural_teardown_wall[batch]+=seconds_between(w0,w1);natural_teardown_cpu[batch]+=seconds_between(c0,c1);}
      }
    }
    if(last_contract.primes!=1230||last_contract.groups!=1833||last_contract.factors!=2270) return 5;
    if(last_natural.primes!=1230||last_natural.groups!=1833||last_natural.factors!=2270) return 6;
  }
  printf("{\\"state\\":[0,%ld,%ld,%ld],\\"naturalState\\":[0,%ld,%ld,%ld],",last_contract.primes,last_contract.groups,last_contract.factors,last_natural.primes,last_natural.groups,last_natural.factors);
  printf("\\"patternOffsets\\":");print_longs(pattern_offsets,1230);
  printf(",\\"patternCounts\\":");print_longs(pattern_counts,1230);
  printf(",\\"patternDegrees\\":");print_longs(pattern_degrees,last_contract.groups);
  printf(",\\"patternMultiplicities\\":");print_longs(pattern_multiplicities,last_contract.groups);
  printf(",\\"fullOffsets\\":");print_longs(full_offsets,1230);
  printf(",\\"fullCounts\\":");print_longs(full_counts,1230);
  printf(",\\"fullDegrees\\":");print_longs(full_degrees,last_contract.factors);puts("}");
  printf("{\\"contractWallSeconds\\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",contract_wall[i]);}
  printf("],\\"contractThreadCpuSeconds\\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",contract_cpu[i]);}
  printf("],\\"naturalWallSeconds\\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",natural_wall[i]);}
  printf("],\\"naturalThreadCpuSeconds\\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",natural_cpu[i]);}
  printf("],\\"naturalTeardownWallSeconds\\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",natural_teardown_wall[i]);}
  printf("],\\"naturalTeardownThreadCpuSeconds\\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",natural_teardown_cpu[i]);}puts("]}");
  free(natural_wall);free(natural_cpu);free(natural_teardown_wall);free(natural_teardown_cpu);free(contract_wall);free(contract_cpu);
  pari_close();return 0;
}
`;
fs.writeFileSync(sourcePath, source);

const compilerPath = run("sh", ["-c", "command -v cc"]).trim();
const buildArguments = [
  "-O3",
  `-I${path.join(pari, "src/headers")}`,
  `-I${lib}`,
  sourcePath,
  `-L${lib}`,
  `-Wl,-rpath,${lib}`,
  "-lpari",
  "-lm",
  "-o",
  executablePath,
];
run(compilerPath, buildArguments);
const stdout = run(executablePath, [String(warmups), String(batches), String(repetitions)], {
  env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1" },
});
const records = stdout.trim().split("\n").map(JSON.parse);
assert.equal(records.length, 2);
const output = records[0];
const timing = records[1];

const expected = {
  state: [
    0,
    1230,
    fixture.degrees.length,
    fixture.multiplicities.reduce((sum, value) => sum + Number(value), 0),
  ],
  naturalState: [
    0,
    1230,
    fixture.degrees.length,
    fixture.multiplicities.reduce((sum, value) => sum + Number(value), 0),
  ],
  patternOffsets: fixture.offsets.map(Number),
  patternCounts: fixture.counts.map(Number),
  patternDegrees: fixture.degrees.map(Number),
  patternMultiplicities: fixture.multiplicities.map(Number),
  fullOffsets: [],
  fullCounts: [],
  fullDegrees: [],
};
for (let i = 0; i < fixture.primes.length; i++) {
  expected.fullOffsets.push(expected.fullDegrees.length);
  const offset = Number(fixture.offsets[i]);
  const count = expected.patternCounts[i];
  let factors = 0;
  for (let j = 0; j < count; j++) {
    const degree = Number(fixture.degrees[offset + j]);
    const multiplicity = Number(fixture.multiplicities[offset + j]);
    factors += multiplicity;
    for (let k = 0; k < multiplicity; k++) expected.fullDegrees.push(degree);
  }
  expected.fullCounts.push(factors);
}
assert.deepEqual(output, expected);
for (const key of [
  "contractWallSeconds",
  "contractThreadCpuSeconds",
  "naturalWallSeconds",
  "naturalThreadCpuSeconds",
  "naturalTeardownWallSeconds",
  "naturalTeardownThreadCpuSeconds",
]) {
  assert.equal(timing[key].length, batches);
  assert(timing[key].every(value => Number.isFinite(value) && value > 0));
}

const result = {
  qualifiedTiming: false,
  boundary: {
    natural:
      "cache_prime_dec(...,10007,nf) on a fresh GRHcheck; prime enumeration, logs and clones included; initialization excluded and teardown separate",
    contractMatched:
      "supplied frozen primes through pristine get_fs, grouped and expanded flat outputs; PARI GEN/stack internals remain",
  },
  limitations: [
    "Shared-host diagnostic; affinity and host-idle qualification are not established here.",
    "The contract-matched control matches work ordering and output publication, not internal storage representation.",
    "nfinit, process startup, result serialization and output checking are outside the clocks.",
  ],
  warmups,
  batches,
  repetitions,
  timing,
  outputHash: sha256(JSON.stringify(output)),
  expectedHash: sha256(JSON.stringify(expected)),
  files: { pari, archive, catalogPath, sourcePath, executablePath },
  hashes: {
    archive: sha256(archiveBytes),
    pristineBuch2: sha256(pristine),
    catalogFixture: sha256(catalogBytes),
    generatedSource: sha256(source),
    executable: sha256(fs.readFileSync(executablePath)),
    pariLibrary: sha256(fs.readFileSync(fs.realpathSync(path.join(lib, "libpari.so")))),
  },
  build: { compilerPath, compilerVersion: run(compilerPath, ["--version"]).trim(), arguments: buildArguments },
  host: { date: new Date().toISOString(), hostname: os.hostname(), platform: process.platform, arch: process.arch },
  directory,
};
fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
