"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function runPublic(source, timeout = 180_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-preflight-"));
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
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("default cubic class-unit calls prime every measured artifact mode", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.class_unit_groups as class_unit_module
import sagejs.number_fields.cubic_class_number as cubic_module

original_projection = class_unit_module.cubic_class_number_projection
original_producer = cubic_module.bounded_cubic_minkowski_class_number
projection_calls = []
producer_calls = []

def counted_projection(field, proof=None):
    projection_calls.append((field, proof))
    return original_projection(field, proof=proof)

def counted_producer(field, **kwargs):
    producer_calls.append(field)
    return original_producer(field, **kwargs)

class_unit_module.cubic_class_number_projection = counted_projection
cubic_module.bounded_cubic_minkowski_class_number = counted_producer

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    (x**3 - x**2 - 6*x - 12, False, 3, (3,), "complete"),
    (x**3 + 4*x - 1, True, 2, (2,), "live-prefix"),
    (x**3 - x**2 + 7*x + 8, False, 6, (6,), "size-decline"),
    (x**3 - x**2 + 1, False, 1, (), "zero-factor-base"),
)
for index, (polynomial, proof, order, invariants, mode) in enumerate(cases):
    K = NumberField(polynomial, "a" + str(index))
    K.maximal_order()
    before_projections = len(projection_calls)
    before_producers = len(producer_calls)
    result = K.class_unit_group(proof=proof)
    assert result.complete and result.class_number() == order
    assert result.class_group().invariants() == invariants
    assert result.unit_group().unit_rank == 1
    assert result.unit_group().torsion.order == 2
    assert result.regulator().rigorous and result.regulator().full_rank_certified
    assert len(projection_calls) == before_projections + 1
    assert len(producer_calls) == before_producers + 1
    artifact = K._bounded_cubic_class_number_artifact
    resources = result.diagnostics["resources"]
    if mode == "complete":
        assert artifact.complete and artifact.diagnostics["factor_base_size"] == 5
        assert resources["cubic_relation_seed_uses"] == 1
        assert resources["cubic_relation_seed_materializations"] == 1
        assert resources["relation_attempts"] == 0
    elif mode == "live-prefix":
        assert not artifact.complete
        assert artifact.diagnostics["context_relation_prefix_bound"] is True
        projection = list(K._class_number_projection_cache.values())[-1]
        assert projection._completed is result
        assert resources["cubic_relation_seed_uses"] == 1
        assert resources["cubic_relation_seed_materializations"] == 0
        assert resources["relation_attempts"] == 0
        assert resources["relation_candidates"] == 0
    elif mode == "size-decline":
        assert artifact.diagnostics["relation_seed_size_policy_exceeded"]
        assert result.proof_status == "exact-relations-conditional-grh"
        assert resources["cubic_specialized_seed_skips"] == 1
        assert resources["cubic_relation_seed_uses"] == 0
        assert resources["relation_attempts"] == 0
    else:
        assert artifact.complete and artifact.diagnostics["factor_base_size"] == 0
        assert resources["cubic_relation_seed_uses"] == 0
        assert resources["cubic_specialized_seed_skips"] == 0
        assert resources["relation_attempts"] == 1
    # The later scalar projection reads retained state without rerunning the
    # bounded producer.
    assert K.class_number(proof=proof) == order
    assert len(producer_calls) == before_producers + 1
print("cubic-auto-preflight-modes-ok")
`);
  assert.equal(output, "cubic-auto-preflight-modes-ok");
});

test("interposed cubic computations never enter the automatic preflight", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.class_unit_groups as class_unit_module

original_projection = class_unit_module.cubic_class_number_projection
projection_calls = []
def counted_projection(*args, **kwargs):
    projection_calls.append(1)
    return original_projection(*args, **kwargs)
class_unit_module.cubic_class_number_projection = counted_projection

# Isolate dispatch from the intentionally expensive nondefault algorithms.
# The representative default modes above exercise the complete exact engine;
# here a sentinel makes every exclusion an O(1) routing assertion.
sentinel = object()
compute_calls = []
def fake_compute(*args, **kwargs):
    compute_calls.append(kwargs)
    return sentinel
class_unit_module.compute_class_unit_group = fake_compute
class_unit_module._retain_class_unit_engine_result = lambda *args, **kwargs: None

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**3 + 2*x - 1

def run(options):
    K = NumberField(polynomial, "a" + str(len(projection_calls)))
    before = len(projection_calls)
    result = class_unit_module.class_unit_context(K, proof=False, **options)
    assert len(projection_calls) == before
    assert result is sentinel

run({"algorithm": "buchmann-hecke"})
run({"seed": 1})
run({"max_relations": 2047})
run({"cancelled": lambda: False})
events = []
run({"progress": events.append})
payloads = []
run({"checkpoint": payloads.append})
run({"components": class_unit_module._Components()})

run({"resume_from": {}})
assert len(compute_calls) == 8
print("cubic-auto-preflight-policy-ok")
`);
  assert.equal(output, "cubic-auto-preflight-policy-ok");
});

test("automatic cubic preflight remains acceleration-only and cache-safe", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.cubic_class_number as cubic_module

original_producer = cubic_module.bounded_cubic_minkowski_class_number
producer_calls = []
def counted_producer(field, **kwargs):
    producer_calls.append(field)
    return original_producer(field, **kwargs)
cubic_module.bounded_cubic_minkowski_class_number = counted_producer

R = PolynomialRing(QQ, "x")
x = R.gen()

# A conditional request followed by an unconditional request reuses the
# authenticated terminal and never reruns the cubic producer.
K = NumberField(x**3 - x**2 - 6*x - 12, "a")
conditional = K.class_unit_group(proof=False)
assert conditional.complete and conditional.class_number() == 3
assert len(producer_calls) == 1
unconditional = K.class_unit_group(proof=True)
assert unconditional.complete and unconditional.proof_status == "exact-unconditional"
assert unconditional.class_group().invariants() == (3,)
assert unconditional.class_group().verify()
assert unconditional.saturation_record.verify(K, K.maximal_order())
assert len(producer_calls) == 1

# Mutating a retained relation invalidates only the acceleration hint.  The
# final exact collector, hR, saturation, and group replay still succeed through
# the unchanged engine fallback.
T = NumberField(x**3 - x**2 - 6*x - 12, "t")
forged = original_producer(T)
assert forged.complete
relation = forged.relation_records[0]
row = relation.row
relation.row = (row[0] + 1,) + row[1:]
T._bounded_cubic_class_number_artifact = forged
before = len(producer_calls)
result = T.class_unit_group(proof=True)
assert result.complete and result.class_number() == 3
assert result.class_group().invariants() == (3,)
assert result.class_group().verify()
assert result.saturation_record.verify(T, T.maximal_order())
assert result.diagnostics["resources"]["cubic_relation_seed_uses"] == 0
assert len(producer_calls) == before
print("cubic-auto-preflight-authority-ok")
`, 240_000);
  assert.equal(output, "cubic-auto-preflight-authority-ok");
});
