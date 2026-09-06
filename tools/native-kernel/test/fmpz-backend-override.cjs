// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const root = resolve(__dirname, "../../..");
const source = String.raw`
from sagejs.native import NativeExactArena, native, uint64


@native
def forced_fmpz_witness(
    value: int, memory_limit: uint64, temporary_limit: uint64
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(8, 0)
        values[0] = value * value + 17
        return values[0]


@native
def ordinary_exact_witness(value: int) -> int:
    return value * value + 17
`;

function run(modulePath, backend, program, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, ["-e", program, modulePath], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      SAGEJS_NATIVE_INTEGER_BACKEND: backend,
      ...extraEnvironment,
    },
  });
  if (result.error) throw result.error;
  return result;
}

test("the fmpz environment override is restricted to qualified functions", async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-override-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "fmpz_override.py");
  writeFileSync(sourcePath, source);

  const ir = await lowerSource(source, sourcePath);
  assert.equal(ir.functions[0].analysis.backend.kind, "fmpz");
  assert.notEqual(ir.functions[1].analysis.backend.kind, "fmpz");
  const compiled = await compileKernel({
    sourcePath,
    cacheRoot: join(temporary, "cache"),
  });
  const program = String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const root = module.forced_fmpz_witness;
const ordinary = module.ordinary_exact_witness;
const args = [(1n << 255n) + 91n, 32n << 20n, 64n << 20n];
assert.equal(root.backendFor(...args), "fmpz");
assert.equal(root(...args), root.fmpz(...args));
assert.equal(root(...args), root.gmp(...args));
assert.equal(root(...args), root.javascript(...args));
assert.throws(
  () => ordinary.backendFor(args[0]),
  /fmpz backend was requested but ordinary_exact_witness is not qualified/,
);
assert.throws(
  () => ordinary(args[0]),
  /fmpz backend was requested but ordinary_exact_witness is not qualified/,
);
assert.equal(ordinary.gmp(args[0]), ordinary.javascript(args[0]));
`;
  const forced = run(compiled.modulePath, "fmpz", program);
  assert.equal(forced.status, 0, forced.stderr || forced.stdout);

  for (const backend of ["auto", "gmp"]) {
    const differential = run(
      compiled.modulePath,
      backend,
      String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const root = module.forced_fmpz_witness;
const ordinary = module.ordinary_exact_witness;
const value = (1n << 255n) + 91n;
const args = [value, 32n << 20n, 64n << 20n];
assert.equal(root(...args), root.javascript(...args));
assert.equal(ordinary(value), ordinary.javascript(value));
`,
    );
    assert.equal(differential.status, 0, differential.stderr || differential.stdout);
  }

  const invalid = run(compiled.modulePath, "invented", "require(process.argv[1]);");
  assert.notEqual(invalid.status, 0);
  assert.match(
    invalid.stderr,
    /SAGEJS_NATIVE_INTEGER_BACKEND must be auto, bigint, tagged, gmp, or fmpz/,
  );

  const unavailable = run(
    compiled.modulePath,
    "fmpz",
    String.raw`
"use strict";
const assert = require("node:assert/strict");
const root = require(process.argv[1]).forced_fmpz_witness;
assert.throws(
  () => root.backendFor(37n, 32n << 20n, 64n << 20n),
  /fmpz backend was requested but is not available/,
);
assert.throws(
  () => root(37n, 32n << 20n, 64n << 20n),
  /fmpz backend was requested but is not available/,
);
`,
    { SAGEJS_NATIVE_MODE: "javascript" },
  );
  assert.equal(unavailable.status, 0, unavailable.stderr || unavailable.stdout);
});
