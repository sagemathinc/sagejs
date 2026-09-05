// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");

for (const [file, baseline, candidate] of [
  ["native_fixed_slice.py", "explicit_stores", "slice_stores"],
  ["native_workspace_bundle.py", "explicit", "bundled"],
]) test(`${candidate} preserves explicit-code checkpoint resource bounds`, {
  skip: process.platform === "win32" ? "standalone resource probe uses Unix compiler flags" : false,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "compression-resources-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(__dirname, "../bench", file);
  const core = generateHostCore(await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath));
  writeFileSync(join(directory, "kernel_core.c"), core.source);
  writeFileSync(join(directory, "kernel_core.h"), core.header);
  writeFileSync(join(directory, "probe.c"), `
#include <assert.h>
#include <stdio.h>
#include "kernel_core.c"
int main(void) {
    mpz_t input, output;
    fmpz_t finput, foutput;
    mpz_inits(input, output, NULL);
    fmpz_init(finput); fmpz_init(foutput);
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    for (int promoted = 0; promoted < 2; ++promoted) {
        mpz_set_ui(input, 7);
        if (promoted) mpz_mul_2exp(input, input, 300);
        fmpz_set_mpz(finput, input);
        for (int backend = 0; backend < 2; ++backend) {
            sagejs_native_gmp_checkpoint_stats before, after;
            if (backend) assert(fmpz_native_${baseline}(&status, foutput, finput, 1000));
            else assert(native_${baseline}(&status, output, input, 1000));
            assert(sagejs_native_gmp_last_checkpoint_stats(&before));
            if (backend) assert(fmpz_native_${candidate}(&status, foutput, finput, 1000));
            else assert(native_${candidate}(&status, output, input, 1000));
            assert(sagejs_native_gmp_last_checkpoint_stats(&after));
            printf("${candidate} backend=%d promoted=%d peak=%zu/%zu allocations=%llu/%llu\\n",
                backend, promoted, before.high_water, after.high_water,
                (unsigned long long)before.allocation_calls, (unsigned long long)after.allocation_calls);
            assert(after.capacity == before.capacity);
            assert(after.high_water <= before.high_water);
            assert(after.allocation_calls <= before.allocation_calls);
            assert(after.upstream_allocations <= before.upstream_allocations);
            assert(after.soft_limit_exhaustions == 0);
        }
    }
    fmpz_clear(finput); fmpz_clear(foutput);
    mpz_clears(input, output, NULL);
    return 0;
}
`);
  const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX || join(__dirname, "../packages/flint/.native/prefix"));
  const executable = join(directory, "probe");
  const compiled = spawnSync(process.env.CC || "cc", ["-std=c11", "-O2", `-I${directory}`,
    `-I${join(prefix, "include")}`, join(directory, "probe.c"), ...["flint", "mpfr", "gmp", "openblas"].map(name => join(prefix, `lib/lib${name}.a`)),
    "-lm", "-lpthread", "-o", executable], { encoding: "utf8", timeout: 120000 });
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const result = spawnSync(executable, [], { encoding: "utf8", timeout: 120000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  t.diagnostic(result.stdout.trim());
});
