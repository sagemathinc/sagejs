"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function runPublic(source, timeout = 240_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-quartic-continuation-"));
  try {
    const filename = join(directory, "test.py");
    writeFileSync(filename, source, "utf8");
    const executable =
      process.platform === "win32"
        ? process.execPath
        : join(root, "bin", "sagejs");
    const arguments_ =
      process.platform === "win32"
        ? [join(root, "bin", "sagejs-source.cjs"), "--python", filename]
        : ["--python", filename];
    const result = spawnSync(executable, arguments_, {
      cwd: root,
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, SAGEJS_USE_SOURCE: "1" },
    });
    assert.equal(
      result.status,
      0,
      result.error?.message || result.stderr || result.stdout,
    );
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("nontrivial bounded quartics continue with the exact Minkowski base", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.class_unit_groups as class_unit_module
from sagejs.number_fields.class_groups import bounded_minkowski_class_number_one

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    ("complex-h2", x**4 - x**3 + 3*x**2 + 2*x + 1, (0, 2), 2),
    ("mixed-h2", x**4 - 2*x**3 - x**2 - 3*x + 1, (2, 1), 2),
    ("real-h2", x**4 - 4*x**3 - 5*x**2 + 5*x + 4, (4, 0), 2),
    ("complex-h4", x**4 - 4*x**3 + 4*x**2 - x + 6, (0, 2), 4),
)

for proof in (False, True):
    for index, (_label, polynomial, signature, expected) in enumerate(cases):
        K = NumberField(polynomial, "a" + str(int(proof)) + str(index))
        K.maximal_order()
        bounded = bounded_minkowski_class_number_one(K)
        assert not bounded.complete and bounded.certificate is None
        assert bounded.minkowski_factor_base_complete
        assert K.signature() == signature
        assert K.class_number(proof=proof) == expected
        retained = class_unit_module.class_unit_context(
            K, proof=proof, algorithm="minkowski"
        )
        assert retained.complete and retained.class_number() == expected
        assert retained.proof_status == "exact-unconditional"
        assert retained.diagnostics["resources"]["proof_primes_completed"] == 0

print("quartic-minkowski-continuation-ok")
`);
  assert.equal(output, "quartic-minkowski-continuation-ok");
});
