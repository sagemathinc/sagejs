// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

test("prepared field inputs are read-only isolated-core operands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sagejs-prepared-fields-"));
  const source = join(dir, "prepared.py");
  writeFileSync(source, `from sagejs.native import native
@native
def real_product(field: RealField, a: RealNumber, b: RealNumber) -> RealNumber:
    return a * b
@native
def complex_product(field: ComplexField, a: ComplexNumber, b: ComplexNumber) -> ComplexNumber:
    return a * b
@native
def real_identity(field: RealField, a: RealNumber) -> RealNumber:
    return a
@native
def real_sum(field: RealField, a: RealNumberBuffer, n: uint64) -> RealNumber:
    value = field("0")
    for i in range(n):
        value += a[i]
    return value
@native
def complex_first(field: ComplexField, a: ComplexNumberBuffer) -> ComplexNumber:
    return a[0]
@native
def real_two(field: RealField) -> RealNumber:
    return field("2")
@native
def real_two_sums(field: RealField, a: RealNumberBuffer, n: uint64, m: uint64) -> RealNumber:
    value = field("0")
    for i in range(n):
        value += a[i]
    for j in range(m):
        value += a[j]
    return value
`);
  const built = await compileKernel({ sourcePath: source });
  const mod = require(built.modulePath);
  assert.equal(mod.real_product.nativeAvailable, true);
  assert.throws(() => mod.real_product({}, {}, {}), /RealField/);
  const field = { _kind: "RealField", precision: () => 192, _fromNative: x => x };
  field._fromNative = value => ({_native: value, _parent: field});
  assert.throws(() => mod.real_product(field, {}, {}), /supplied field/);
  const fake = { _parent: field, _native: {} };
  assert.throws(() => mod.real_product(field, fake, fake), /MPFR real/);
  // Same-source JS fallback consumes the mathematical objects, not handles.
  const a = { _mul_: b => 7 * b }, b = 9;
  assert.equal(mod.real_product.javascript(field, a, b), 63);
  assert.equal(mod.real_identity.javascript(field, a), a);
  const two = mod.real_two(field);
  assert.ok(mod.real_sum(field, [two, two], 2)._native);
  assert.ok(mod.real_two_sums(field, [two, two], 2, 1)._native);
  assert.throws(() => mod.real_two_sums(field, [two], 1, -1), /uint64|nonnegative|unsigned/);
  assert.throws(() => mod.real_sum(field, [two], 2), /index out of range/);
  assert.throws(() => mod.real_sum(field, [two, fake], 2), /MPFR real/);
  const dyn = value => ({value: BigInt(value), _add_(rhs) { return dyn(this.value + rhs.value); }});
  assert.equal(mod.real_sum.javascript(dyn, [dyn(3), dyn(-5)], 2).value, -2n);
  assert.equal(mod.real_two_sums.javascript(dyn, [dyn(3), dyn(-5)], 2, 1).value, 1n);
  assert.throws(() => mod.real_sum.javascript(dyn, [], 1), /index out of range/);
  assert.equal(mod.complex_first.javascript(null, [a]), a);

  const control = join(dir, "control.c");
  writeFileSync(control, `#include <assert.h>
#include "kernel_core.h"
int main(void) {
  sagejs_native_status status;
  mpfr_t a,b,r,expected,saved;
  mpc_t c,d,z,w;
  mpfr_init2(a,192); mpfr_init2(b,192); mpfr_init2(r,192);
  mpfr_init2(expected,192); mpfr_init2(saved,192);
  mpfr_set_str(a,"-123456789012345678901234567890.125",10,MPFR_RNDN);
  mpfr_set_str(b,"0.00000000000000000000000000003",10,MPFR_RNDN);
  mpfr_set(saved,a,MPFR_RNDN);
  mpfr_mul(expected,a,b,MPFR_RNDN);
  assert(sagejs_kernel_real_product(&status,r,192,a,b));
  assert(mpfr_equal_p(r,expected)); assert(mpfr_equal_p(a,saved));
  assert(sagejs_kernel_real_identity(&status,r,192,a));
  assert(mpfr_equal_p(r,a));
  mpfr_srcptr entries[] = {a,b};
  mpfr_add(expected,a,b,MPFR_RNDN);
  assert(sagejs_kernel_real_sum(&status,r,192,entries,2,2));
  assert(mpfr_equal_p(r,expected));
  mpfr_add(expected,expected,a,MPFR_RNDN);
  assert(sagejs_kernel_real_two_sums(&status,r,192,entries,2,2,1));
  assert(mpfr_equal_p(r,expected));
  assert(!sagejs_kernel_real_sum(&status,r,192,entries,2,3));
  assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
  assert(!sagejs_kernel_real_product(&status,r,128,a,b));
  assert(status.code == SAGEJS_NATIVE_TYPE_ERROR);
  mpc_init2(c,192); mpc_init2(d,192); mpc_init2(z,192); mpc_init2(w,192);
  mpc_set_fr_fr(c,a,b,MPC_RNDNN); mpc_set_fr_fr(d,b,a,MPC_RNDNN);
  mpc_mul(w,c,d,MPC_RNDNN);
  assert(sagejs_kernel_complex_product(&status,z,192,c,d));
  assert(mpc_cmp(z,w)==0);
  mpc_srcptr cent[] = {c,d};
  assert(sagejs_kernel_complex_first(&status,z,192,cent,2));
  assert(mpc_cmp(z,c)==0);
  assert(!sagejs_kernel_complex_first(&status,z,192,NULL,0));
  mpc_clear(c); mpc_clear(d); mpc_clear(z); mpc_clear(w);
  mpfr_clear(a);mpfr_clear(b);mpfr_clear(r);mpfr_clear(expected);mpfr_clear(saved);
  return 0;
}
`);
  const prefix = process.env.SAGEJS_FLINT_PREFIX;
  assert.ok(prefix, "set SAGEJS_FLINT_PREFIX to a prepared numerical prefix");
  const exe = join(dir, "control");
  const cc = spawnSync("cc", ["-O2", "-I" + built.outputPath,
    "-I" + join(prefix, "include"), control, built.coreSourcePath,
    join(prefix,"lib/libmpc.a"), join(prefix,"lib/libmpfr.a"),
    join(prefix,"lib/libgmp.a"), "-lm", "-o", exe], {encoding:"utf8"});
  assert.equal(cc.status,0,cc.stderr);
  const run = spawnSync(exe, [], {encoding:"utf8",timeout:30000});
  assert.equal(run.status,0,run.stderr);
  await assert.rejects(() => lowerSource(`def bad(f: RealField, a: ComplexNumber) -> RealNumber:\n    return a\n`, "bad.py"), /match the result field type/);
  await assert.rejects(() => lowerSource(`def bad(f: RealField, a: RealNumberBuffer) -> RealNumber:\n    return a[-1]\n`, "bad.py"), /nonnegative constant or uint64/);
});
