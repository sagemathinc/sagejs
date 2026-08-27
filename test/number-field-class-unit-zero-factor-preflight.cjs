// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function runPublic(source, timeout = 240_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-zero-factor-"));
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

test("an authenticated empty cubic factor base bypasses only the stale specialized probe", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.cubic_class_number as cubic_module

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**3 - x**2 + 1

for proof in (False, True):
    K = NumberField(polynomial, "a" + str(int(proof)))
    result = K.class_unit_group(proof=proof)
    resources = result.diagnostics["resources"]
    artifact = K._bounded_cubic_class_number_artifact
    assert cubic_module.authenticated_cubic_class_number(artifact, K) == 1
    assert artifact.__dict__["_live_authentication"].factor_base_size == 0
    assert result.complete and result.proof_status == "exact-unconditional"
    assert result.class_number() == 1
    assert result.class_group().invariants() == ()
    assert result.unit_group().complete and result.unit_group().unit_rank == 1
    assert result.unit_group().torsion.order == 2
    assert result.regulator().rigorous and result.regulator().full_rank_certified
    assert resources["cubic_specialized_empty_factor_base_skips"] == 1
    assert resources["cubic_specialized_seed_skips"] == 0
    assert resources["cubic_relation_seed_uses"] == 0
    assert resources["relation_attempts"] == 1
    assert resources["relation_candidates"] == 2
    assert resources["generation_verification_full_replays"] == 0
    assert resources["saturation_live_authentication_hits"] == 1
    assert result.saturation_record.verify(K, K.maximal_order())

    public_group = K.class_group(proof=proof)
    assert public_group.invariants() == () and public_group.verify()
    payload = public_group.proof_payload()
    assert public_group.verify_proof_payload(payload)

# Public diagnostic metadata cannot turn a nonempty factor base into the
# empty-base routing authority.
F = NumberField(x**3 - x**2 - 6*x - 12, "f")
forged_diagnostics = cubic_module.bounded_cubic_minkowski_class_number(F)
assert cubic_module.authenticated_cubic_class_number(forged_diagnostics, F) == 3
forged_diagnostics.diagnostics["factor_base_size"] = 0
F._bounded_cubic_class_number_artifact = forged_diagnostics
nonempty = F.class_unit_group(proof=False)
assert nonempty.complete and nonempty.class_number() == 3
assert nonempty.class_group().invariants() == (3,)
assert nonempty.diagnostics["resources"][
    "cubic_specialized_empty_factor_base_skips"
] == 0

# Mutating the module-issued authority invalidates the acceleration hint.  The
# unchanged exact engine remains the only source of the final class/unit proof.
T = NumberField(polynomial, "t")
tampered = cubic_module.bounded_cubic_minkowski_class_number(T)
authority = tampered.__dict__["_live_authentication"]
authority.__dict__["factor_base_size"] = 1
assert cubic_module.authenticated_cubic_class_number(tampered, T) is None
T._bounded_cubic_class_number_artifact = tampered
fallback = T.class_unit_group(proof=True)
assert fallback.complete and fallback.class_number() == 1
assert fallback.class_group().invariants() == ()
assert fallback.class_group().verify()
assert fallback.saturation_record.verify(T, T.maximal_order())
assert fallback.diagnostics["resources"][
    "cubic_specialized_empty_factor_base_skips"
] == 0
print("cubic-zero-factor-preflight-ok")
`);
  assert.equal(output, "cubic-zero-factor-preflight-ok");
});
