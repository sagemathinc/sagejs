#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  loadRatchets,
  validateRatchets,
} = require("../bench/linear-algebra-api-audit.cjs");

const root = join(__dirname, "..");
const auditPath = join(root, "docs", "audits", "linear-algebra-api.json");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));

function surfaceHash(names) {
  return createHash("sha256").update([...names].sort().join("\n") + "\n").digest("hex");
}

function nativeFunctionCount(relativePath) {
  const source = readFileSync(join(root, relativePath), "utf8");
  return (source.match(/^@native$/gm) || []).length;
}

function assertAuditStructure() {
  assert.equal(audit.schema_version, 1);
  assert.deepEqual(audit.scope.base_rings, ["ZZ", "QQ", "GF(7)"]);
  assert.deepEqual(audit.scope.objects, ["Matrix", "Vector"]);

  for (const object of audit.scope.objects) {
    const surface = audit.public_surface.sagejs[object];
    assert.equal(surface.count, surface.names.length);
    assert.equal(surface.sha256, surfaceHash(surface.names));
    assert.ok(
      surface.count >= audit.ratchets.minimum_sagejs_public_names[object],
      `${object} public surface fell below its ratchet`,
    );
  }

  for (const ring of audit.scope.base_rings) {
    for (const object of audit.scope.objects) {
      const surface = audit.public_surface.by_base_ring[ring][object];
      assert.match(surface.sage_sha256, /^[a-f0-9]{64}$/);
      assert.equal(surface.coverage, surface.common_count / surface.sage_count);
      assert.equal(surface.missing_count, surface.sage_count - surface.common_count);
      assert.equal(
        surface.sagejs_only_count,
        audit.public_surface.sagejs[object].count - surface.common_count,
      );
      assert.ok(
        surface.common_count >=
          audit.ratchets.minimum_sage_name_intersection[object][ring],
      );
    }
    const matrix = audit.representations[ring].Matrix;
    assert.equal(matrix.production_path, "packed-compiler-owned");
    assert.equal(matrix.generated_owned_resources, 0);
    assert.equal(matrix.napi_public_state, false);
    assert.equal(matrix.napi_oracle, true);
    assert.ok(
      matrix.generated_packed_ffi_functions >=
        audit.ratchets.minimum_generated_packed_ffi_functions[ring],
    );

    const vector = audit.representations[ring].Vector;
    assert.equal(vector.production_path, "dynamic-python");
    assert.equal(vector.typed_python_kernels, 0);
    assert.equal(vector.generated_owned_resources, 0);
    assert.equal(vector.napi_public_state, false);
  }

  for (const relativePath of Object.values(audit.source_evidence).flat()) {
    assert.ok(existsSync(join(root, relativePath)), `missing audit evidence ${relativePath}`);
  }
}

function assertBackendInventory() {
  assert.equal(
    nativeFunctionCount("src/lib/sagejs/kernels/matrix/dense_integer.py"),
    audit.representations.ZZ.Matrix.typed_python_kernels,
  );
  assert.equal(
    nativeFunctionCount("src/lib/sagejs/kernels/matrix/dense_rational.py"),
    audit.representations.QQ.Matrix.typed_python_kernels,
  );
  assert.equal(
    nativeFunctionCount("src/lib/sagejs/kernels/matrix/dense_prime_field.py"),
    audit.representations["GF(7)"].Matrix.typed_python_kernels,
  );

  const ffi = JSON.parse(readFileSync(join(root, "ffi", "flint.ffi.json"), "utf8"));
  const ffiCounts = {
    ZZ: ffi.functions.filter((fn) => fn.id.startsWith("fmpz_mat_")).length,
    QQ: ffi.functions.filter((fn) => fn.id.startsWith("fmpq_mat_")).length,
    "GF(7)": ffi.functions.filter((fn) => fn.id.startsWith("nmod_mat_")).length,
  };
  for (const ring of audit.scope.base_rings) {
    assert.equal(
      ffiCounts[ring],
      audit.representations[ring].Matrix.generated_packed_ffi_functions,
    );
  }
  assert.equal(
    ffi.resources.filter((resource) => /mat/i.test(resource.id)).length,
    0,
    "matrix declarations are packed aggregate adapters, not owned resources",
  );

  const abi = JSON.parse(readFileSync(join(root, "ffi", "abi-types.json"), "utf8"));
  assert.equal(abi.adapters.packed_fmpz_matrix.kind, "packed");
  assert.equal(abi.adapters.packed_nmod_matrix.kind, "packed");

  const matrixSource = readFileSync(join(root, "src", "baselib", "matrix.py"), "utf8");
  for (const module of ["dense_integer", "dense_rational", "dense_prime_field"]) {
    assert.match(matrixSource, new RegExp(`sagejs\\.kernels\\.matrix\\.${module}`));
  }
  for (const message of [
    "packed GF(p) matrices have no N-API matrix handle",
    "packed ZZ matrices have no N-API matrix handle",
    "packed QQ matrices have no N-API matrix handle",
  ]) {
    assert.match(matrixSource, new RegExp(message.replace(/[()]/g, "\\$&")));
  }

  const policy = JSON.parse(
    readFileSync(join(root, "architecture", "native-export-policy.json"), "utf8"),
  );
  const decisions = new Map(policy.exports.map((entry) => [entry.id, entry.decision]));
  for (const name of ["zzMatrix", "qqMatrix", "matrixExportPacked"]) {
    assert.equal(
      decisions.get(`napi:@sagemath/sagejs-flint:${name}`),
      "retain-representation-primitive",
    );
  }
  for (const name of ["matrixMul", "matrixDet"]) {
    assert.equal(
      decisions.get(`napi:@sagemath/sagejs-flint:${name}`),
      "migrate-to-declared-ffi",
    );
  }
}

function assertPerformanceRatchets() {
  const ratchets = validateRatchets(loadRatchets());
  assert.equal(ratchets.audit_id, audit.audit_id);
  assert.equal(ratchets.cases.length, 18);
  for (const ring of audit.scope.base_rings) {
    const cases = ratchets.cases.filter((testCase) => testCase.base_ring === ring);
    assert.equal(cases.length, 6);
    assert.deepEqual(new Set(cases.map((testCase) => testCase.object)), new Set([
      "Matrix",
      "Vector",
    ]));
    assert.deepEqual(new Set(cases.map((testCase) => testCase.path)), new Set([
      "packed-compiler-owned",
      "generated-packed-ffi",
      "dynamic-python",
    ]));
  }
}

const semanticProbe = String.raw`
def _audit_matrix_vector_witness(base):
    A = matrix(base, 2, 2, [1, 2, 3, 5])
    B = matrix(base, 2, 2, [2, 1, 4, 3])
    v = vector(base, [1, 2])
    w = vector(base, [3, 4])
    matrix_witnesses = [
        A.list() == [base(1), base(2), base(3), base(5)],
        (A + B) - B == A,
        A * identity_matrix(base, 2) == A,
        A.det() == base(-1),
        A.rank() == 2,
        A.rref().rank() == 2,
        A * A.inverse() == identity_matrix(A.inverse().base_ring(), 2),
        A * A.solve_right(v) == v,
        matrix(base, 2, 3, [1, 2, 3, 2, 4, 6]).right_kernel().dimension() == 2,
        A.charpoly()(A).is_zero(),
        A.stack(B).dimensions() == (4, 2),
        A.augment(B).dimensions() == (2, 4),
    ]
    vector_witnesses = [
        v.list() == [base(1), base(2)],
        (v + w).list() == [base(4), base(6)],
        (w - v).list() == [base(2), base(2)],
        (-v).list() == [base(-1), base(-2)],
        (3*v).list() == [base(3), base(6)],
        v.dot_product(w) == base(11),
        v.row().dimensions() == (1, 2),
        v.column().dimensions() == (2, 1),
    ]
    assert all(matrix_witnesses)
    assert all(vector_witnesses)
    try:
        A._native
        raise AssertionError('target Matrix exposed opaque N-API state')
    except RuntimeError:
        pass
    return (len(matrix_witnesses), len(vector_witnesses))

for _audit_base in [ZZ, QQ, GF(7)]:
    _audit_counts = _audit_matrix_vector_witness(_audit_base)
    print('WITNESS', _audit_base, _audit_counts[0], _audit_counts[1])

_audit_matrix_names = sorted([name for name in dir(matrix(ZZ, 1, 1, [1])) if not name.startswith('_')])
_audit_vector_names = sorted([name for name in dir(vector(ZZ, [1])) if not name.startswith('_')])
print('MATRIX-SURFACE', ','.join(_audit_matrix_names))
print('VECTOR-SURFACE', ','.join(_audit_vector_names))
`;

async function assertOperationalWitnesses() {
  const session = await createSage();
  try {
    const result = await session.evaluate(semanticProbe);
    const witnesses = result.stdout.split("\n").filter((line) => line.startsWith("WITNESS"));
    assert.equal(witnesses.length, 3);
    for (const line of witnesses) {
      assert.match(line, / 12 8$/);
    }
    for (const object of ["Matrix", "Vector"]) {
      const prefix = `${object.toUpperCase()}-SURFACE `;
      const line = result.stdout.split("\n").find((entry) => entry.startsWith(prefix));
      assert.ok(line, `missing ${object} surface output`);
      const names = line.slice(prefix.length).split(",");
      assert.deepEqual(names, audit.public_surface.sagejs[object].names);
      assert.equal(surfaceHash(names), audit.public_surface.sagejs[object].sha256);
    }
  } finally {
    session.close();
  }
}

(async () => {
  assertAuditStructure();
  assertBackendInventory();
  assertPerformanceRatchets();
  await assertOperationalWitnesses();
  console.log("linear-algebra-api-audit-ok");
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
