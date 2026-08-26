// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function run(source, timeout = 120_000) {
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
    env: { ...process.env, SAGEJS_USE_SOURCE: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("producer steering partitions rational primes and replays its sole PRNG", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_group_relations import (
    ExactRelationCollector,
    RelationSearchState,
    _RELATION_STEERING_CONTEXT_TOKEN,
    _RelationSteeringContext,
)
from sagejs.number_fields.class_unit_groups import ClassUnitGroupEngine

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
O = K.maximal_order()
engine = ClassUnitGroupEngine(K, proof=False)
_plan, factor_base = engine._factor_base(proof=False)
collector = ExactRelationCollector(O, factor_base)

payload = RelationSearchState(19).to_dict()
left_state = RelationSearchState.from_dict(payload)
right_state = RelationSearchState.from_dict(payload)
left = _RelationSteeringContext(
    collector, left_state, _producer_token=_RELATION_STEERING_CONTEXT_TOKEN
)
right = _RelationSteeringContext(
    collector, right_state, _producer_token=_RELATION_STEERING_CONTEXT_TOKEN
)
assert left.rational_prime_partition == (
    (2, (0, 3)), (3, (1, 2)), (5, (4,)), (11, (5,))
)
assert left.subfactor_indices == (0, 1, 4, 5)
assert left.source_row(2) == right.source_row(2)
assert left_state.to_dict() == right_state.to_dict()
assert left.screen_norm(QQ(66)) == QQ(66)
assert left.screen_norm(QQ(1) / QQ(6)) == QQ(1) / QQ(6)
assert left.screen_norm(QQ(7)) is None

try:
    RelationSearchState.from_dict({**payload, "schema": "tampered"})
    raise AssertionError("a tampered search-state schema was accepted")
except ValueError:
    pass
print("partition-prng-ok")
`);
  assert.equal(output, "partition-prng-ok");
});

test("candidate and dependency cursors commit or abort transactionally", () => {
  const output = run(String.raw`
from sagejs.number_fields.class_group_relations import (
    ExactRelationCollector,
    RelationSearchState,
    _RELATION_STEERING_CONTEXT_TOKEN,
    _RelationSteeringContext,
)

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**4 - x - 1, "a")
O = K.maximal_order()
collector = ExactRelationCollector(O, ())
state = RelationSearchState(3)
context = _RelationSteeringContext(
    collector, state, _producer_token=_RELATION_STEERING_CONTEXT_TOKEN
)

ticket = context.begin_candidate(K.gen(), logarithms=(1.0, 0.0))
ticket.key = "0" * 64
ticket._snapshot = (ticket.key, ticket.logarithms)
try:
    context.commit_candidate(ticket)
    raise AssertionError("a mutated candidate ticket was accepted")
except ValueError:
    pass
context.abort_candidate(ticket)

clean = context.begin_candidate(K.gen(), logarithms=(1.0, 0.0))
context.commit_candidate(clean)
assert context.provisional_unit_rank == 1

stall = _RelationSteeringContext(
    collector, RelationSearchState(5), _producer_token=_RELATION_STEERING_CONTEXT_TOKEN
)
for _index in range(7):
    assert stall.begin_candidate(
        K.gen(), logarithms=(1.0, 0.0), logarithmically_independent=False
    ) is None
fallback = stall.begin_candidate(
    K.gen(), logarithms=(1.0, 0.0), logarithmically_independent=False
)
assert fallback is not None
stall.abort_candidate(fallback)
assert stall.diagnostics()["unit_log_stall_fallbacks"] == 1
assert not stall.diagnostics()["unit_log_filter_enabled"]

binding_probe = _RelationSteeringContext(
    collector, state, _producer_token=_RELATION_STEERING_CONTEXT_TOKEN
)
binding_probe._search_state = RelationSearchState(99)
try:
    binding_probe.source_row(1)
    raise AssertionError("mutated producer binding was accepted")
except RuntimeError:
    pass

class Presentation:
    row_count = 2
    dependency_transforms = ((1, 0), (0, 1))

transaction = context.begin_dependency_update(Presentation())
assert transaction.dependencies == ((1, 0), (0, 1))
transaction.row_count = 7
transaction._snapshot = (
    transaction.row_count,
    transaction.dependency_count,
    transaction.dependencies,
)
try:
    context.commit_dependency_update(transaction)
    raise AssertionError("a mutated dependency transaction was accepted")
except ValueError:
    pass
context.abort_dependency_update(transaction)

retry = context.begin_dependency_update(Presentation())
assert retry.dependencies == ((1, 0), (0, 1))
context.commit_dependency_update(retry)
stale = context.begin_dependency_update(Presentation())
assert stale.dependencies == ()
context.abort_dependency_update(stale)
diagnostics = context.diagnostics()
assert diagnostics["dependency_commits"] == 1
assert diagnostics["dependency_aborts"] == 2
assert diagnostics["stale_dependency_scans"] == 1
print("transaction-ok")
`);
  assert.equal(output, "transaction-ok");
});
