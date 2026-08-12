#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function runSageJs(source, environment = {}, timeout = 180_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-public-sparse-random-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const result = spawnSync(resolve(root, "bin", "sagejs"), ["--python", script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      timeout,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const semanticWitness = String.raw`
def snapshot(base):
    set_random_seed(123)
    value = random_matrix(base, 3, 4, density=0.4)
    return value.list(), random()


expected = [
    (ZZ, [0, 0, -1, 0, 0, 0, -4, 0, 5, 0, 0, 0]),
    (QQ, [0, 0, 1, 0, 0, 0, 0, QQ(1)/2, 0, 0, 0, 1]),
    (GF(2), [1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0]),
    (GF(7), [0, 0, 4, 0, 2, 0, 0, 0, 0, 0, 2, 0]),
]
for base, entries in expected:
    value, next_random = snapshot(base)
    assert value == [base(entry) for entry in entries], (base, value)
    assert 0 <= next_random < 1

for base in [ZZ, QQ, GF(7)]:
    assert random_matrix(base, 4, 10, density=-1).is_zero()
    assert random_matrix(base, 4, 10, density=0.09).is_zero()
    assert all(random_matrix(base, 8, density=2).list())
    set_random_seed(20260812)
    left = random_matrix(base, 20, 30, density=0.2)
    set_random_seed(20260812)
    right = random_matrix(base, 20, 30, density=0.2)
    assert left == right

assert random_matrix(GF(2), 4, 10, density=-1).is_zero()
assert all(random_matrix(GF(2), 8, density=2).list())
set_random_seed(20260812)
left = random_matrix(GF(2), 20, 30, density=0.2)
set_random_seed(20260812)
right = random_matrix(GF(2), 20, 30, density=0.2)
assert left == right

bounded = random_matrix(ZZ, 20, 30, density=0.2, x=-7, y=8)
assert all(-7 <= value < 8 for value in bounded.list())
rational = random_matrix(QQ, 20, 30, density=0.2, num_bound=5, den_bound=5)
assert any(value.denominator() > 1 for value in rational.list())

binary = random_matrix(GF(2), 200, 200, density=0.1)
assert max(sum(1 for value in binary.row(row) if value) for row in range(200)) > 20

assert random_matrix(ZZ, 3, density=0.2)._has_fmpz_matrix_resource()
assert random_matrix(QQ, 3, density=0.2)._has_fmpq_matrix_resource()
assert random_matrix(GF(2), 3, density=0.2)._has_m4ri_matrix_resource()

class BadDensity:
    def __float__(self):
        raise RuntimeError("density coerced")


for rows, columns in [(0, 0), (0, 5), (5, 0)]:
    value = random_matrix(GF(2), rows, columns, density=BadDensity())
    assert (value.nrows(), value.ncols(), len(value.list())) == (rows, columns, 0)

for base in [ZZ, QQ, GF(7)]:
    try:
        random_matrix(base, 0, 5, density=BadDensity())
    except RuntimeError as error:
        assert "density coerced" in str(error)
    else:
        raise AssertionError("row-draw density was not coerced")

print("public-sparse-random-ok")
`;

assert.equal(runSageJs(semanticWitness), "public-sparse-random-ok");
assert.equal(
  runSageJs(semanticWitness, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-sparse-random-ok",
);

const trace = runSageJs(
  String.raw`
random_matrix(ZZ, 4, density=0.25)
random_matrix(QQ, 4, density=0.25)
random_matrix(GF(2), 4, density=0.25)
random_matrix(GF(7), 4, density=0.25)
`,
  { SAGEJS_NATIVE_TRACE: "1" },
);
assert.match(
  trace,
  /Matrix\.random_matrix ZZ 4x4 -> typed-python-isolated-sparse/,
);
assert.match(
  trace,
  /Matrix\.random_matrix QQ 4x4 -> typed-python-isolated-sparse/,
);
assert.match(
  trace,
  /Matrix\.random_matrix GF\(2\) 4x4 -> typed-python-isolated-sparse/,
);
assert.match(
  trace,
  /Matrix\.random_matrix GF\(7\) 4x4 -> typed-python-isolated-sparse/,
);

// The contract test carries the full Sage oracle. Re-run it here when its
// configured Sage executable exists so this public dispatch cannot drift from
// the independently recorded domain policies.
const contract = join(root, "test", "linear-sparse-random.cjs");
if (existsSync(contract)) {
  const result = spawnSync(process.execPath, [contract], {
    cwd: root,
    encoding: "utf8",
    timeout: 240_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

console.log("public sparse random matrices passed");
