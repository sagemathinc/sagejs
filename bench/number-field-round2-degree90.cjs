#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const corpus = JSON.parse(
  readFileSync(join(root, "test", "fixtures", "number-field-maximal-order-corpus.json")),
);
const vector429 = process.argv.includes("--vector429");
const fixture = vector429
  ? (() => {
      const witness = readFileSync(join(root, "bench", "number-field-order-resource-witness.c"), "utf8");
      const block = witness.match(
        /static const char \*const vector429_coefficients\[\] = \{([\s\S]*?)\n\};/,
      );
      assert(block, "missing vector429 coefficients");
      return {
        polynomial: {
          coefficients: [...block[1].matchAll(/"(-?\d+)"/g)].map((match) => match[1]),
        },
      };
    })()
  : corpus.cases.find((item) => item.id === "hecke-degree-90");
assert(fixture);
const temporary = mkdtempSync(join(tmpdir(), "sagejs-round2-degree90-"));

const source = `
#define _POSIX_C_SOURCE 200809L
#include <assert.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct { const char *name; double seconds; uint64_t calls; } phase_t;
static _Thread_local phase_t phases[] = {
  {"setup",0,0},{"modular-table",0,0},{"radical",0,0},{"multiplier",0,0},
  {"basis-prepare",0,0},{"basis-transform",0,0},{"basis-output",0,0},
  {"publish",0,0},{"cleanup",0,0},{"independent-local",0,0},
  {"independent-unpack",0,0},{"independent-merge",0,0},
  {"independent-publish",0,0},{"independent-cleanup",0,0}
};
static _Thread_local struct timespec phase_started[32];
static _Thread_local size_t phase_depth;
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return (double)t.tv_sec + (double)t.tv_nsec/1e9; }
static void begin(const char *name) { (void)name; assert(phase_depth<32); clock_gettime(CLOCK_MONOTONIC,&phase_started[phase_depth++]); }
static void end(const char *name) {
  assert(phase_depth>0); const struct timespec started_at=phase_started[--phase_depth];
  const double started=(double)started_at.tv_sec+(double)started_at.tv_nsec/1e9;
  for (size_t i=0;i<sizeof(phases)/sizeof(*phases);i++) if (strcmp(phases[i].name,name)==0) { phases[i].seconds += now()-started; phases[i].calls++; return; }
}
static _Thread_local uint64_t iterations=0,enlargements=0,radical_sum=0,nullity_sum=0;
static struct timespec local_wall_started[64],local_cpu_started[64];
static double local_wall_seconds[64],local_cpu_seconds[64];
static void local_begin(long index) { assert(index>=0&&index<64); clock_gettime(CLOCK_MONOTONIC,&local_wall_started[index]); clock_gettime(CLOCK_THREAD_CPUTIME_ID,&local_cpu_started[index]); }
static void local_end(long index) { struct timespec wall,cpu; clock_gettime(CLOCK_MONOTONIC,&wall); clock_gettime(CLOCK_THREAD_CPUTIME_ID,&cpu); local_wall_seconds[index]=(double)(wall.tv_sec-local_wall_started[index].tv_sec)+(double)(wall.tv_nsec-local_wall_started[index].tv_nsec)/1e9; local_cpu_seconds[index]=(double)(cpu.tv_sec-local_cpu_started[index].tv_sec)+(double)(cpu.tv_nsec-local_cpu_started[index].tv_nsec)/1e9; }
#define SAGEJS_NF_ORDER_PROFILE_BEGIN(name) begin(name)
#define SAGEJS_NF_ORDER_PROFILE_END(name) end(name)
#define SAGEJS_NF_ORDER_PROFILE_BATCH_BEGIN(name) begin(name)
#define SAGEJS_NF_ORDER_PROFILE_BATCH_END(name) end(name)
#define SAGEJS_NF_ORDER_PROFILE_LOCAL_BEGIN(index) local_begin(index)
#define SAGEJS_NF_ORDER_PROFILE_LOCAL_END(index) local_end(index)
#define SAGEJS_NF_ORDER_PROFILE_ITERATION(radical_dimension,nullity) do { iterations++; radical_sum+=(uint64_t)(radical_dimension); if ((nullity)>0) { enlargements++; nullity_sum+=(uint64_t)(nullity); } } while (0)
#include "sagejs/number_field_order_resource_ffi.h"

static const char *coefficients[] = {${fixture.polynomial.coefficients.map((value) => `"${value}"`).join(",")}};

int main(int argc, char **argv) {
  assert(argc >= 2);
  sagejs_fmpz_polynomial_t polynomial;
  assert(sagejs_fmpz_polynomial_init(polynomial,sizeof(coefficients)/sizeof(*coefficients)));
  fmpz_t value; fmpz_init(value);
  for (size_t i=0;i<sizeof(coefficients)/sizeof(*coefficients);i++) { assert(fmpz_set_str(value,coefficients[i],10)==0); assert(sagejs_fmpz_polynomial_set_coefficient(polynomial,i,value)); }
  assert(sagejs_fmpz_polynomial_seal(polynomial));
  sagejs_fmpz_matrix_t multiplication;
  const double table_started=now();
  assert(sagejs_nf_order_polynomial_multiplication_table(multiplication,polynomial));
  const double table_seconds=now()-table_started;
  uint64_t *primes=malloc((size_t)(argc-1)*sizeof(uint64_t)); assert(primes);
  for (int i=1;i<argc;i++) primes[i-1]=strtoull(argv[i],NULL,10);
  sagejs_fmpq_matrix_t basis;
  const double started=now();
  assert(sagejs_number_field_order_maximal_at_primes(basis,multiplication,primes,(uint64_t)(argc-1)));
  const double elapsed=now()-started;
  printf("{\\\"table_us\\\":%.0f,\\\"round2_us\\\":%.0f,\\\"iterations\\\":%" PRIu64 ",\\\"enlargements\\\":%" PRIu64 ",\\\"mean_radical\\\":%.6f,\\\"mean_nullity\\\":%.6f,\\\"phases\\\":{",
    table_seconds*1e6,elapsed*1e6,iterations,enlargements,iterations?(double)radical_sum/(double)iterations:0.0,enlargements?(double)nullity_sum/(double)enlargements:0.0);
  for (size_t i=0;i<sizeof(phases)/sizeof(*phases);i++) { if (i) putchar(','); printf("\\\"%s\\\":{\\\"us\\\":%.0f,\\\"calls\\\":%" PRIu64 "}",phases[i].name,phases[i].seconds*1e6,phases[i].calls); }
  printf("},\\\"locals\\\":[");
  for (int i=1;i<argc;i++) { if (i>1) putchar(','); printf("{\\\"prime\\\":%" PRIu64 ",\\\"wall_us\\\":%.0f,\\\"cpu_us\\\":%.0f}",primes[i-1],local_wall_seconds[i-1]*1e6,local_cpu_seconds[i-1]*1e6); }
  puts("]}");
  if (getenv("SAGEJS_DEGREE90_BASIS") != NULL) {
    puts("BASIS");
    fmpz_mat_t canonical; fmpz_mat_init(canonical,fmpq_mat_nrows(basis->value),fmpq_mat_ncols(basis->value)); fmpz_t denominator; fmpz_init(denominator);
    assert(sagejs_nf_order_normalize_fmpq_basis(canonical,denominator,basis));
    assert(fmpz_fprint(stdout,denominator)>0); putchar('\\n');
    for (slong row=0;row<fmpz_mat_nrows(canonical);row++) for (slong column=0;column<fmpz_mat_ncols(canonical);column++) { assert(fmpz_fprint(stdout,fmpz_mat_entry(canonical,row,column))>0); putchar('\\n'); }
    fmpz_clear(denominator); fmpz_mat_clear(canonical);
  }
  sagejs_fmpq_matrix_clear(basis); free(primes); sagejs_fmpz_matrix_clear(multiplication); fmpz_clear(value); sagejs_fmpz_polynomial_clear(polynomial); return 0;
}
`;

function compile(name, defines = []) {
  const sourcePath = join(temporary, `${name}.c`);
  const executable = join(temporary, name);
  writeFileSync(sourcePath, source);
  const libraries = ["flint", "openblas", "mpc", "mpfr", "gmp"].map(
    (library) => join(prefix, "lib", `lib${library}.a`),
  );
  const result = spawnSync(process.env.CC || "cc", [
    "-std=c11", "-O3", "-Wall", "-Wextra", "-Werror",
    ...defines.map((define) => `-D${define}`),
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`, sourcePath, ...libraries,
    "-lm", "-lpthread", "-o", executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return executable;
}

function run(executable, primes, timeout = 120_000) {
  const result = spawnSync(executable, primes.map(String), {
    cwd: root, encoding: "utf8", timeout,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function basis(executable, primes, timeout = 120_000) {
  const result = spawnSync(executable, primes.map(String), {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: { ...process.env, SAGEJS_DEGREE90_BASIS: "1" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const marker = result.stdout.indexOf("BASIS\n");
  assert.notEqual(marker, -1);
  return result.stdout.slice(marker + "BASIS\n".length);
}

try {
  const packed = process.argv.includes("--packed");
  const individual = process.argv.includes("--individual");
  const differential = process.argv.includes("--differential");
  const hnfDifferential = process.argv.includes("--hnf-differential");
  const genericHnf = process.argv.includes("--generic-hnf");
  const oneLane = process.argv.includes("--one-lane");
  const executable = compile(
    "profile",
    [
      ...(packed ? [] : ["SAGEJS_NF_ORDER_DISABLE_PADIC_STATE=1"]),
      ...(genericHnf ? ["SAGEJS_NF_ORDER_FORCE_GENERIC_HNF=1"] : []),
      ...(oneLane ? ["SAGEJS_NF_ORDER_FORCE_ONE_INDEPENDENT_WORKER=1"] : []),
    ],
  );
  const primes = process.argv.slice(2)
    .filter((value) => value !== "--packed" && value !== "--individual")
    .filter((value) => value !== "--differential")
    .filter((value) => value !== "--generic-hnf")
    .filter((value) => value !== "--hnf-differential")
    .filter((value) => value !== "--vector429")
    .filter((value) => value !== "--one-lane")
    .map(Number);
  assert(primes.length > 0, "pass one or more primes");
  const report = hnfDifferential
    ? (() => {
        const generic = compile("generic-hnf", [
          "SAGEJS_NF_ORDER_DISABLE_PADIC_STATE=1",
          "SAGEJS_NF_ORDER_FORCE_GENERIC_HNF=1",
        ]);
        const modularBasis = basis(executable, primes);
        const genericBasis = basis(generic, primes);
        assert.equal(modularBasis, genericBasis);
        return {
          primes,
          basis_sha256: createHash("sha256").update(modularBasis).digest("hex"),
          exact_hnf: true,
        };
      })()
    : differential
    ? (() => {
        const sequential = compile("sequential", [
          "SAGEJS_NF_ORDER_DISABLE_PADIC_STATE=1",
          "SAGEJS_NF_ORDER_DISABLE_INDEPENDENT_PRIMES=1",
        ]);
        const independentBasis = basis(executable, primes);
        const sequentialBasis = basis(sequential, primes);
        assert.equal(independentBasis, sequentialBasis);
        return {
          primes,
          basis_sha256: createHash("sha256").update(independentBasis).digest("hex"),
          exact: true,
        };
      })()
    : individual
    ? primes.map((prime) => ({ prime, ...run(executable, [prime]) }))
    : run(executable, primes);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
