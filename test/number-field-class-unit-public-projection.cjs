"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function run(source, timeout = 900_000) {
  const executable =
    process.platform === "win32"
      ? process.execPath
      : join(root, "bin", "sagejs");
  const arguments_ =
    process.platform === "win32"
      ? [join(root, "bin", "sagejs-source.cjs"), "--python"]
      : ["--python"];
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("conditional public projections publish transactionally and return isolated views", () => {
  const output = run(String.raw`
import json
import time

from sagejs.number_fields import class_group_maps
from sagejs.number_fields import ideal_arithmetic

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
_order = K.maximal_order()
result = K.class_unit_group(proof=False, max_relation_attempts=64)
assert result.complete

# A failed adapter owns only the reservation; it cannot publish partial state.
original_adapter = class_group_maps.class_group_from_engine_result
def fail_adapter(_result):
    raise ArithmeticError("injected public adapter failure")
class_group_maps.class_group_from_engine_result = fail_adapter
try:
    K.class_group(proof=False, max_relation_attempts=64)
    raise AssertionError("the injected adapter failure disappeared")
except ArithmeticError as error:
    assert "injected public adapter failure" in str(error)
finally:
    class_group_maps.class_group_from_engine_result = original_adapter

# Replaced helpers are interposed paths: they remain cold and cannot publish.
original_sealer = class_group_maps.seal_public_class_group_projection
def malformed_sealer(_group):
    return object()
class_group_maps.seal_public_class_group_projection = malformed_sealer
try:
    interposed = K.class_group(proof=False, max_relation_attempts=64)
    assert interposed.verify()
finally:
    class_group_maps.seal_public_class_group_projection = original_sealer
assert result.context._live_artifacts.public_class_group_projection is None
assert not result.context._live_artifacts.public_class_group_projection_reserved

# An interposed adapter cannot smuggle a correctly typed but invalid group into
# the retained projection.  It fails its cold public verification, and helper
# restoration permits an ordinary clean publication.
def mutated_adapter(_result):
    group = original_adapter(_result)
    group._invariants = (2,)
    return group
class_group_maps.class_group_from_engine_result = mutated_adapter
try:
    K.class_group(proof=False, max_relation_attempts=64)
    raise AssertionError("an invalid interposed adapter result was accepted")
except ArithmeticError as error:
    assert "interposed public class-group adapter" in str(error)
finally:
    class_group_maps.class_group_from_engine_result = original_adapter
assert result.context._live_artifacts.public_class_group_projection is None

first = K.class_group(proof=False, max_relation_attempts=64)
payload_text = json.dumps(first.proof_payload(), sort_keys=True, separators=(",", ":"))
ideal_payload = ideal_arithmetic.serialize_ideal(first.gens_ideals()[0])
assert first.verify()

started = time.monotonic()
second = K.class_group(proof=False, max_relation_attempts=64)
repeat_seconds = time.monotonic() - started
assert first is not second
assert first._projection_core is not second._projection_core
assert first.gen(0).parent() is first and second.gen(0).parent() is second
assert second.invariants() == (4,) and second.order() == 4
assert json.dumps(second.proof_payload(), sort_keys=True, separators=(",", ":")) == payload_text
assert second.verify()
assert second.verify_proof_payload(second.proof_payload())
assert not second.verify_proof_payload(
    second.proof_payload(), cancelled=lambda: True
)

# The context-owned recipe is not reachable from either public view.  Direct
# capsule mutation is rejected and cannot alter the next view's replay.
try:
    first._projection_core._proof_payload_json = "{}"
    raise AssertionError("a projected view capsule was mutable")
except AttributeError:
    pass
assert not hasattr(first._projection_core, "_proof_context")
assert second.verify()

# Mutating a returned wrapper, its ideal shell, or a detached payload cannot
# change the context-owned recipe or the next fresh view.
first._invariants = (2,)
first._algorithm = "mutated"
first.gens_ideals()[0]._basis_rows = ((QQ(1), QQ(0), QQ(0), QQ(0), QQ(0)),)
assert not first.verify()
detached = second.proof_payload()
detached["theorem"] = "mutated"
third = K.class_group(proof=False, max_relation_attempts=64)
assert third.invariants() == (4,)
assert third.algorithm != "mutated"
assert ideal_arithmetic.serialize_ideal(third.gens_ideals()[0]) == ideal_payload
assert json.dumps(third.proof_payload(), sort_keys=True, separators=(",", ":")) == payload_text

# Replacing the private projection slot is a failed hint, never a public group.
live = result.context._live_artifacts
retained_projection = live.public_class_group_projection
live.public_class_group_projection = object()
try:
    K.class_group(proof=False, max_relation_attempts=64)
    raise AssertionError("a replaced projection was accepted")
except ArithmeticError as error:
    assert "projection changed type" in str(error)
finally:
    live.public_class_group_projection = retained_projection
assert K.class_group(proof=False, max_relation_attempts=64).invariants() == (4,)

# Callback-bearing contexts remain on the ordinary cold adapter and never
# publish a reusable projection.
L = NumberField(x**3 + 2*x + 1, "b")
events = []
cold_result = L.class_unit_group(
    proof=False,
    progress=events.append,
    max_relation_attempts=64,
)
assert cold_result.context._live_artifacts.public_class_group_projection is None
if cold_result.complete:
    assert original_adapter(cold_result).verify()

print(json.dumps({"repeat_seconds": repeat_seconds, "status": "ok"}, sort_keys=True))
`);
  const payload = JSON.parse(output.split("\n").at(-1));
  assert.equal(payload.status, "ok");
  assert.ok(payload.repeat_seconds < 0.5, output);
});
