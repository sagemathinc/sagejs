// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");
const { exactArenaRetryable } = require("../exact-analysis.cjs");

const source = `from sagejs.native import native, uint64, NativeExactArena, IntegerBuffer, Float64Buffer

@native
def gmp_mutating(out: IntegerBuffer, side: Float64Buffer, value: int, temporary: uint64) -> int:
    with NativeExactArena(0, temporary) as arena:
        out[0] += 1
        side[0] = 2.0
        result = value * value
        out[1] = result
        return result

@native
def gmp_pure(side: Float64Buffer, value: int, temporary: uint64) -> int:
    with NativeExactArena(0, temporary) as arena:
        if side[0] < 0.0:
            raise ValueError("negative sidecar")
        return value * value

@native
def fmpz_mutating(out: IntegerBuffer, value: int, temporary: uint64) -> int:
    with NativeExactArena(1048576, temporary) as arena:
        values = arena.integer_vector(1, 0)
        out[0] += 1
        values[0] = value
        values.addmul(0, value, value)
        out[1] = values[0]
        return values[0]

@native
def fmpz_pure(value: int, temporary: uint64) -> int:
    with NativeExactArena(1048576, temporary) as arena:
        values = arena.integer_vector(1, 0)
        values[0] = value
        values.addmul(0, value, value)
        return values[0]
`;

function body(text, name) {
  const match = new RegExp(`static int ${name}\\([^\\n]*\\)\\n\\{`).exec(text);
  assert(match, `missing definition ${name}`);
  const end = text.indexOf("\n}\n", match.index);
  assert(end > match.index);
  return text.slice(match.index, end + 3);
}

test("arena reservation and retry use the same external-effect proof", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-arena-policy-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, "arena_policy.py");
  fs.writeFileSync(sourcePath, source);
  const ir = await lowerSource(source, sourcePath);
  for (const fn of ir.functions) {
    assert.equal(Boolean(exactArenaRetryable(fn)), fn.name.endsWith("_pure"));
    assert.equal(fn.analysis.backend.kind, fn.name.startsWith("fmpz_") ? "fmpz" : "gmp");
  }
  const built = await compileKernel({ sourcePath });
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  const adapter = fs.readFileSync(built.adapterSourcePath || path.join(path.dirname(built.coreSourcePath), "kernel.c"), "utf8");
  const mod = require(built.modulePath);
  const output = () => mod.createIntegerBuffer(2, 256, [0n, 0n]);
  for (const name of ["gmp_mutating", "gmp_pure", "fmpz_mutating", "fmpz_pure"]) {
    const policy = name.endsWith("_pure") ? 1 : 0;
    const definitions = [`native_${name}`, ...(name.startsWith("fmpz_") ? [`fmpz_native_${name}`] : [])];
    for (const definition of definitions) {
      assert.match(body(core, definition), new RegExp(`sagejs_native_gmp_checkpoint_begin\\([^;]*temporary_limit, ${policy}\\)`));
    }
  }
  // No replay is allowed after a caller-owned write. A tiny arena exhausts
  // after the first write; the counter must remain one, not count retries.
  const large = 1n << 4096n;
  for (const backend of ["gmp", "tagged"]) {
    const out = output(), side = [0];
    assert.throws(() => mod.gmp_mutating[backend](out, side, large, 1n), /temporary capacity exhausted/);
    assert.equal(out.toArray()[0], 1n);
    assert.equal(side[0], 2);
    assert.equal(mod.gmp_pure[backend]([0], large, 64n), large * large);
  }
  for (const backend of ["gmp", "tagged", "fmpz"]) {
    const out = output();
    assert.throws(() => mod.fmpz_mutating[backend](out, large, 1n), /temporary capacity exhausted/);
    assert.equal(out.toArray()[0], 1n);
    assert.equal(mod.fmpz_pure[backend](large, 1024n), large + large * large);
  }
  // Sufficient declared capacity preserves the same-source result, including
  // copied external buffer values surviving arena cleanup.
  const values = [0n, 1n, -3n, 1n << 128n, large];
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const oracle = spawnSync(python, ["-c", "import json,sys; v=list(map(int,json.load(sys.stdin))); print(json.dumps([[str(x*x),str(x+x*x)] for x in v]))"], {
    input: JSON.stringify(values.map(String)), encoding: "utf8", timeout: 30000,
  });
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout);
  for (let i = 0; i < values.length; i++) {
    const [square, combined] = expected[i].map(BigInt);
    for (const backend of ["javascript", "gmp", "tagged"]) {
      const out = output(), side = [0];
      assert.equal(mod.gmp_mutating[backend](out, side, values[i], 1048576n), square);
      assert.deepEqual(out.toArray(), [1n, square]);
      assert.deepEqual(side, [2]);
      assert.equal(mod.gmp_pure[backend]([0], values[i], 1048576n), square);
    }
    for (const backend of ["javascript", "gmp", "tagged", "fmpz"]) {
      const out = output();
      assert.equal(mod.fmpz_mutating[backend](out, values[i], 1048576n), combined);
      assert.deepEqual(out.toArray(), [1n, combined]);
    }
  }
  assert.match(adapter, /sagejs_native_gmp_recommended_retry_shift/);
});
