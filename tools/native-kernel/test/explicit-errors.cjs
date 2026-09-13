// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const {mkdtempSync, writeFileSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const test = require("node:test");
const {compileKernel} = require("../compiler.cjs");
test("explicit integer-kernel errors survive nested native calls", async () => {
  globalThis.ValueError = class ValueError extends Error {};
  globalThis.ZeroDivisionError = class ZeroDivisionError extends Error {};
  const dir = mkdtempSync(join(tmpdir(), "sagejs-errors-")), source = join(dir, "errors.py");
  writeFileSync(source, `from sagejs.native import native
@native
def checked(x: int) -> int:
    if x < 0:
        raise ValueError("division is not the cause")
    if x == 0:
        raise ZeroDivisionError("custom zero")
    return x
@native
def caller(x: int) -> int:
    return checked(x)
@native
def collision(x: int) -> int:
    if x < 0:
        raise ValueError("division by zero")
    if x == 99:
        raise ValueError("division by zero")
    return 7 // x
`);
  const built = await compileKernel({sourcePath: source}), mod = require(built.modulePath);
  for (const name of ["checked", "caller"]) {
    for (const f of [mod[name], mod[name].javascript, mod[name].gmp, mod[name].tagged]) {
      assert.equal(f(7n), 7n);
      assert.throws(() => f(-1n), error => error instanceof globalThis.ValueError && error.message === "division is not the cause");
      assert.throws(() => f(0n), error => error instanceof globalThis.ZeroDivisionError && error.message === "custom zero");
    }
  }
  for (const f of [mod.collision.javascript, mod.collision.gmp, mod.collision.tagged]) {
    assert.throws(() => f(-1n), error => error instanceof globalThis.ValueError && error.message === "division by zero");
    assert.throws(() => f(0n), error => error instanceof globalThis.ZeroDivisionError);
  }
});
