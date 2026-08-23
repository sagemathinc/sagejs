#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-class-group-matrix.json"),
    "utf8",
  ),
);

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-class-matrix-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), "--python", script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
        timeout: 60_000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const fixtureJson = JSON.stringify(fixture);
const behavior = String.raw`
import copy
import json
import time

from sagejs.number_fields.class_group_matrix import (
    DeferredPresentationPolicy,
    PresentationDecision,
    RelationMatrixAccumulator,
    RelationMatrixError,
    RelationPresentation,
    SparseRelationRow,
    extend_relation_presentation_with_duplicate_rows,
    extract_relation_presentation,
    modular_rank_and_pivots,
)

fixture = json.loads(${JSON.stringify(fixtureJson)})

def normalized_coordinates(presentation, coordinates):
    answer = []
    for position, value in zip(presentation.generator_positions, coordinates):
        if position < presentation.rank:
            value %= presentation.diagonal[position]
        answer.append(value)
    return tuple(answer)

for case in fixture['cases']:
    rows = case['rows']
    columns = len(rows[0])
    accumulator = RelationMatrixAccumulator(columns)
    for index, row in enumerate(rows):
        insertion = accumulator.add_relation(
            row,
            witness_key='w' + str(index),
            provenance={'case': case['name'], 'index': index},
        )
        assert insertion.index == index
        assert insertion.row.dense() == row
    restored_accumulator = RelationMatrixAccumulator.from_dict(
        accumulator.to_dict()
    )
    assert restored_accumulator.dense_rows() == rows
    assert restored_accumulator.modular_ranks == accumulator.modular_ranks
    assert restored_accumulator.witness_keys == accumulator.witness_keys

    python = accumulator.presentation(backend='python')
    flint = accumulator.presentation(backend='flint')
    expected_diagonal = tuple(
        value for value in case['elementary_divisors'] if value
    )
    for presentation in (python, flint):
        assert presentation.verify()
        assert presentation.diagonal == expected_diagonal
        assert presentation.invariants == tuple(case['invariants'])
        assert presentation.free_rank == case['free_rank']
        assert presentation.order == case['order']
        assert len(presentation.dependency_transforms) == case['dependency_count']
        assert presentation.unit_transforms == presentation.dependency_transforms
        assert len(presentation.generator_transforms) == (
            len(presentation.invariants) + presentation.free_rank
        )
        for row in rows:
            assert all(value == 0 for value in presentation.class_coordinates(row))
        coordinates = tuple(
            17 - 3 * index for index in range(len(presentation.generator_positions))
        )
        lifted = presentation.lift_class_coordinates(coordinates)
        assert presentation.class_coordinates(lifted) == normalized_coordinates(
            presentation, coordinates
        )
        replayed = RelationPresentation.from_dict(presentation.to_dict())
        assert replayed.invariants == presentation.invariants
        assert replayed.generator_transforms == presentation.generator_transforms
        assert replayed.verify()

        retained_order = presentation.order
        presentation.order = (
            2 if retained_order is None else retained_order + 1
        )
        assert not presentation.verify()
        presentation.order = retained_order
        assert presentation.verify()

        duplicate = extend_relation_presentation_with_duplicate_rows(
            presentation, (rows[0], rows[0])
        )
        assert duplicate.verify()
        assert duplicate.invariants == presentation.invariants
        assert duplicate.order == presentation.order
        assert len(duplicate.dependency_transforms) == (
            len(presentation.dependency_transforms) + 2
        )
        assert [row.dense() for row in duplicate.relation_rows] == rows + [
            rows[0], rows[0]
        ]
        rebuilt_duplicate = extract_relation_presentation(
            rows + [rows[0], rows[0]], columns, backend=presentation.backend
        )
        assert duplicate.invariants == rebuilt_duplicate.invariants
        assert duplicate.order == rebuilt_duplicate.order

        corrupted = copy.deepcopy(presentation.to_dict())
        if corrupted['rows'] and columns:
            corrupted['rows'][0]['entries'] = [[0, rows[0][0] + 1]]
            try:
                RelationPresentation.from_dict(corrupted)
            except (RelationMatrixError, ArithmeticError):
                pass
            else:
                raise AssertionError('corrupted relation replay was accepted')

    assert python.invariants == flint.invariants
    assert python.order == flint.order
    diagnostics = modular_rank_and_pivots(rows, columns)
    assert diagnostics['rank_lower_bound'] <= python.rank
    assert diagnostics['full_column_rank_certified'] == (
        diagnostics['rank_lower_bound'] == columns
    )

# Duplicate sparse positions cancel and canonical storage retains no zero.
sparse = SparseRelationRow(5, [(4, 7), (1, 3), (4, -7), (1, -1)])
assert sparse.entries == ((1, 2),)

# A determinant divisible by one screen prime is inconclusive only for that
# prime. Another prime proves full rank, then tentative-order screening swaps
# the unlucky prime and deterministically replays all exact rows.
collision = RelationMatrixAccumulator(2)
collision.add_relation({0: 46337})
collision.add_relation({1: 2})
assert collision.modular_ranks[0] == 1
assert max(collision.modular_ranks) == 2
assert collision.full_rank_plausible
old_primes = collision.modular.primes
new_primes = collision.replace_unlucky_primes(92674)
assert old_primes[0] == 46337 and new_primes[0] != 46337
assert all(92674 % prime for prime in new_primes)
assert collision.modular_ranks == (2, 2, 2)

# Candidates covering currently missing pivots are ordered ahead of dependent
# or irrelevant rows without mutating the modular state.
partial = RelationMatrixAccumulator(4)
partial.add_relation([1, 0, 0, 0])
before = partial.modular_ranks
candidates = [[2, 0, 0, 0], [0, 0, 7, 0], [0, 5, 0, 0]]
assert partial.prioritize(candidates) == [1, 2, 0]
assert partial.modular_ranks == before

# Production relation collection asks the policy after every admitted row.
# Modular screening is always incremental, but dense exact extraction happens
# only on first full rank and at deterministic batch boundaries.
deferred = RelationMatrixAccumulator(4)
policy = DeferredPresentationPolicy(4, batch_size=4)
for row in ([2, 0, 0, 0], [0, 3, 0, 0], [0, 0, 5, 0]):
    deferred.add_relation(row)
    update = policy.extract_if_due(deferred, backend='flint')
    assert not update.extracted
    assert update.decision.reason == 'awaiting-modular-full-rank'
assert not policy.decision(deferred, force=True).should_extract

deferred.add_relation([0, 0, 0, 7])
first = policy.extract_if_due(
    deferred, required_level='hnf', backend='flint'
)
assert first.extracted
assert first.decision.reason == 'first-full-rank'
assert first.decision.needs_exact_hnf
assert not first.decision.needs_exact_snf
assert policy.extraction_count == 1
assert policy.last_exact_level == 'snf'

extra_rows = [
    [2, 3, 0, 0], [0, 3, 5, 0], [0, 0, 5, 7], [4, 6, 0, 0],
    [2, 0, 5, 0], [0, 6, 0, 7], [4, 0, 0, 7], [2, 3, 5, 7],
    [6, 3, 0, 0], [0, 9, 5, 0], [2, 0, 10, 0], [0, 3, 0, 14],
]
extracted_at = [deferred.row_count]
for row in extra_rows:
    deferred.add_relation(row)
    update = policy.extract_if_due(deferred, backend='flint')
    if update.extracted:
        extracted_at.append(deferred.row_count)
assert extracted_at == [4, 8, 12, 16]
assert policy.extraction_count == 4
assert policy.decision(deferred).reason == 'exact-presentation-current'
direct = deferred.presentation(backend='python', require_full_rank=True)
assert update.presentation.invariants == direct.invariants
assert update.presentation.order == direct.order

# A finalization boundary refreshes a stale sub-batch. Decision records and
# policy state serialize independently of the exact presentation payload.
deferred.add_relation([2, 6, 10, 14])
waiting = policy.decision(deferred)
assert not waiting.should_extract
assert waiting.reason == 'batching-new-relations'
assert waiting.pending_rows == 1 and waiting.stale
assert PresentationDecision.from_dict(waiting.to_dict()).reason == waiting.reason

restored_deferred = RelationMatrixAccumulator.from_dict(deferred.to_dict())
restored_policy = DeferredPresentationPolicy.from_dict(
    policy.to_dict(), restored_deferred
)
assert restored_policy.verify_against(restored_deferred)
assert restored_policy.decision(restored_deferred).to_dict() == waiting.to_dict()
forced = restored_policy.extract_if_due(
    restored_deferred, force=True, backend='flint'
)
assert forced.extracted
assert forced.decision.reason == 'forced-finalization'
assert forced.presentation.invariants == deferred.presentation(
    backend='python', require_full_rank=True
).invariants

# An HNF-only external extraction can be recorded without pretending SNF maps
# exist. A later map request signals an exact-level upgrade at the same rows.
hnf_policy = DeferredPresentationPolicy(4, batch_size=4)
hnf_policy.note_exact_presentation(
    deferred, deferred.presentation(backend='python'), extracted_level='hnf'
)
upgrade = hnf_policy.decision(deferred, required_level='snf')
assert upgrade.should_extract and upgrade.needs_exact_snf
assert upgrade.reason == 'upgrade-to-smith'

# Replay is bound to the exact relation prefix that was last presented.
corrupted_accumulator = RelationMatrixAccumulator.from_dict(deferred.to_dict())
corrupted_accumulator.rows[0] = SparseRelationRow(4, [3, 0, 0, 0])
assert not policy.verify_against(corrupted_accumulator)
try:
    DeferredPresentationPolicy.from_dict(
        policy.to_dict(), corrupted_accumulator
    )
except RelationMatrixError:
    pass
else:
    raise AssertionError('policy replay accepted a changed exact prefix')

benchmark = fixture['benchmark']
state = benchmark['seed']
rows = []
for row_index in range(benchmark['rows']):
    row = {}
    if row_index < benchmark['columns']:
        row[row_index] = 2 + row_index % 11
    for _ in range(benchmark['entries_per_row']):
        state = (1664525 * state + 1013904223) % 2**32
        column = state % benchmark['columns']
        state = (1664525 * state + 1013904223) % 2**32
        value = state % 15 - 7
        if value:
            row[column] = row.get(column, 0) + value
            if row[column] == 0:
                del row[column]
    rows.append(row)

started = time.perf_counter()
accumulator = RelationMatrixAccumulator(benchmark['columns'])
for row in rows:
    accumulator.add_relation(row)
modular_ms = 1000 * (time.perf_counter() - started)
assert accumulator.full_rank_plausible
assert accumulator.density < 0.15

started = time.perf_counter()
flint = accumulator.presentation(backend='flint', require_full_rank=True)
flint_ms = 1000 * (time.perf_counter() - started)
assert flint.verify()

oracle_rows = [
    SparseRelationRow(benchmark['columns'], row).dense()[
        : benchmark['python_oracle_columns']
    ]
    for row in rows[: benchmark['python_oracle_rows']]
]
started = time.perf_counter()
python = extract_relation_presentation(
    oracle_rows, benchmark['python_oracle_columns'], backend='python'
)
python_ms = 1000 * (time.perf_counter() - started)
flint_oracle = extract_relation_presentation(
    oracle_rows, benchmark['python_oracle_columns'], backend='flint'
)
assert python.diagonal == flint_oracle.diagonal
assert python.verify() and flint_oracle.verify()

assert modular_ms < benchmark['modular_insert_max_ms'], modular_ms
assert flint_ms < benchmark['flint_presentation_max_ms'], flint_ms
assert python_ms < benchmark['python_presentation_max_ms'], python_ms
print(json.dumps({
    'status': 'class-group-matrix-ok',
    'cases': len(fixture['cases']),
    'benchmark': {
        'modular_ms': modular_ms,
        'flint_ms': flint_ms,
        'python_oracle_ms': python_ms,
        'rows': accumulator.row_count,
        'columns': accumulator.column_count,
        'nonzeros': accumulator.nonzero_count,
    },
}, sort_keys=True))
`;

const reports = [];
for (const nativeDisabled of [false, true]) {
  reports.push(
    JSON.parse(
      runSage(behavior, {
        SAGEJS_NATIVE_DISABLE: nativeDisabled ? "1" : "0",
      }),
    ),
  );
}
for (const report of reports) {
  assert.equal(report.status, "class-group-matrix-ok");
  assert.equal(report.cases, fixture.cases.length);
  assert.equal(report.benchmark.rows, fixture.benchmark.rows);
  assert.equal(report.benchmark.columns, fixture.benchmark.columns);
}

console.log(
  `class-group relation matrix tests passed (${JSON.stringify(reports)})`,
);
