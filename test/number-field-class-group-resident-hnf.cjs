#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = resolve(__dirname, "..");
const kernelSource = join(
  root,
  "src/lib/sagejs/kernels/matrix/class_group_hnf.py",
);
const crashFixture = JSON.parse(
  readFileSync(
    join(
      root,
      "test/fixtures/number-field-class-group-stable-hnf-37x8.json",
    ),
    "utf8",
  ),
);

const fixtures = [
  {
    name: "lmfdb-3.1.4027.2-unconditional-first",
    columns: 10,
    initial: [
      [1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
    ],
    candidates: [
      [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0, 0, 0, 0, 0, 0],
      [1, 2, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      [0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [4, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    ],
    rank: 8,
    support: [1, 2, 6, 8, 9, 11, 12, 13, 14],
    selected: [5, 6, 8, 9, 11],
    trials: 6,
  },
  {
    name: "lmfdb-3.1.4027.2-conditional",
    columns: 7,
    initial: [
      [1, 0, 1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 1, 0],
    ],
    candidates: [
      [6, 0, 0, 0, 0, 0, 0],
      [7, 0, 1, 0, 0, 0, 0],
      [3, 1, 0, 1, 0, 0, 0],
      [3, 0, 0, 0, 0, 0, 0],
      [3, 0, 0, 0, 0, 0, 0],
      [3, 1, 0, 0, 0, 0, 1],
      [4, 1, 1, 1, 0, 0, 0],
      [4, 0, 1, 0, 0, 0, 0],
      [4, 2, 0, 0, 0, 0, 0],
      [4, 0, 1, 0, 0, 0, 0],
      [0, 2, 0, 2, 0, 0, 0],
      [0, 1, 0, 1, 0, 0, 0],
      [0, 1, 0, 1, 0, 0, 0],
      [0, 2, 0, 1, 0, 0, 1],
      [0, 0, 3, 0, 0, 0, 0],
      [0, 1, 1, 0, 1, 0, 0],
      [0, 1, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 0, 0, 0],
      [1, 3, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 1, 0, 1],
      [1, 1, 1, 1, 0, 0, 0],
      [1, 0, 0, 0, 1, 1, 0],
      [1, 0, 1, 0, 0, 0, 0],
      [1, 2, 0, 0, 0, 0, 0],
      [1, 0, 4, 0, 0, 0, 0],
      [1, 0, 1, 0, 0, 0, 0],
      [1, 1, 2, 0, 1, 0, 0],
    ],
    rank: 7,
    support: [0, 1, 4, 21, 22, 25, 28],
    selected: [2, 19, 20, 23, 26],
    trials: 0,
  },
  {
    name: "lmfdb-3.1.5448.1-rank-six-prefix",
    columns: 7,
    initial: [
      [1, 2, 0, 0, 0, 0, 0],
      [0, 0, 2, 1, 0, 0, 0],
    ],
    candidates: [
      [0, 1, 1, 0, 0, 0, 0],
      [1, 2, 0, 0, 0, 0, 0],
      [4, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 1, 0, 0],
      [1, 0, 1, 0, 0, 1, 0],
      [5, 2, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 1, 0, 0],
      [1, 3, 0, 1, 1, 0, 0],
      [1, 1, 2, 0, 0, 1, 0],
    ],
    rank: 6,
    support: [1, 6, 7, 8, 9, 10],
    selected: [5, 6, 7, 8],
    trials: 1,
  },
];

test("the cubic HNF region owns one resident exact resource graph", async () => {
  const ir = await lowerSource(readFileSync(kernelSource, "utf8"), kernelSource);
  const stable = ir.functions.find(
    (candidate) => candidate.name === "stable_exact_relation_hnf_select_v1",
  );
  const fn = ir.functions.find(
    (candidate) => candidate.name === "resident_exact_relation_hnf_select_v2",
  );
  assert.ok(stable);
  assert.equal(stable.analysis.backend.kind, "gmp");
  assert.equal(stable.analysis.liveExactWorkspace.count, 1);
  assert.deepEqual(
    stable.analysis.liveExactWorkspace.scopes[0].children.map((child) => ({
      owner: child.owner,
      storage: child.storage,
      resource: child.resourceId,
    })),
    [
      "source_matrix",
      "basis_matrix",
      "trial_source_matrix",
      "trial_hnf_matrix",
    ].map((owner) => ({
      owner,
      storage: "declared-owned-ffi-resource",
      resource: "fmpz_matrix",
    })),
  );
  assert.ok(fn);
  assert.equal(fn.analysis.backend.kind, "gmp");
  assert.equal(fn.analysis.liveExactWorkspace.count, 1);
  assert.deepEqual(
    fn.analysis.liveExactWorkspace.scopes[0].children.map((child) => ({
      owner: child.owner,
      storage: child.storage,
      resource: child.resourceId,
    })),
    [
      "source_matrix",
      "basis_matrix",
      "transform_matrix",
      "trial_source_matrix",
      "trial_hnf_matrix",
      "trial_transform_matrix",
    ].map((owner) => ({
      owner,
      storage: "declared-owned-ffi-resource",
      resource: "fmpz_matrix",
    })),
  );

  const core = generateHostCore(ir).source;
  const stableStart = core.lastIndexOf(
    "static int native_stable_exact_relation_hnf_select_v1(",
  );
  const stableEnd = core.indexOf(
    "static int native_resident_exact_relation_hnf_select_v2(",
    stableStart,
  );
  const stableRegion = core.slice(stableStart, stableEnd);
  assert.ok(stableStart >= 0 && stableEnd > stableStart);
  assert.match(stableRegion, /sagejs_fmpz_matrix_hnf_into/);
  assert.doesNotMatch(
    stableRegion,
    /hnf_transform|transform_matrix|fmpz_matrix_det|replay_value/,
  );
  const start = core.lastIndexOf(
    "static int native_resident_exact_relation_hnf_select_v2(",
  );
  const end = core.indexOf(
    "static int native_resident_exact_relation_hnf_select(",
    start,
  );
  const region = core.slice(start, end);
  const checkpoint = region.indexOf("sagejs_native_gmp_checkpoint_begin(");
  const lastAllocation = region.lastIndexOf("sagejs_fmpz_matrix_init(", checkpoint);
  const firstEntryWrite = region.indexOf("sagejs_fmpz_matrix_set_entry(", checkpoint);
  const firstHnf = region.indexOf("sagejs_fmpz_matrix_hnf_transform(", checkpoint);
  assert.ok(start >= 0);
  assert.ok(lastAllocation > 0 && checkpoint > lastAllocation);
  assert.ok(firstEntryWrite > checkpoint && firstHnf > firstEntryWrite);
  assert.doesNotMatch(
    region,
    /packed_(?:fmpz|integer)|PyObject|napi_/,
  );
});

function compileInto(cache) {
  return spawnSync(
    process.execPath,
    [
      join(root, "bin/sagejs"),
      "native",
      "compile",
      kernelSource,
      "--cache-root",
      cache,
    ],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
}

function runSage(cache, source) {
  const script = join(cache, "resident-hnf-test.py");
  writeFileSync(script, source);
  return spawnSync(process.execPath, [join(root, "bin/sagejs"), "--python", script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
    },
    timeout: 120_000,
  });
}

test("resident exact HNF matches authentic cubic selection boundaries", () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-resident-hnf-"));
  try {
    const compiled = compileInto(cache);
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const program = String.raw`
import json
import sagejs.number_fields.class_group_matrix as matrix
import sagejs.number_fields.cubic_class_number as cubic
from sagejs.native import is_compiled

fixtures = json.loads(${JSON.stringify(JSON.stringify(fixtures))})
reports = []
for fixture in fixtures:
    initial = tuple(tuple(row) for row in fixture['initial'])
    candidates = tuple(tuple(row) for row in fixture['candidates'])
    columns = fixture['columns']
    triples = tuple(
        (row, (index,), 1) for index, row in enumerate(candidates)
    )
    basis, support = matrix.exact_relation_hnf_support(
        initial + candidates, columns
    )
    assert support == tuple(fixture['support'])

    stable = matrix.stable_exact_relation_hnf_selection(
        initial, candidates, columns
    )
    stable_rows = initial + tuple(
        candidates[index] for index in stable.selected_candidate_indices
    )
    assert stable.basis == basis
    assert stable.rank == fixture['rank']
    assert stable.deletion_complete
    assert stable.hnf_calls == stable.deletion_trials + 1
    assert stable.boundary_calls == 1
    assert stable.library_boundary_calls == 0
    assert stable.backend == 'stable-native-basis-deletions'
    assert matrix.exact_relation_hnf_basis(stable_rows, columns) == basis
    for selected_index in stable.selected_candidate_indices:
        without = initial + tuple(
            candidates[index]
            for index in stable.selected_candidate_indices
            if index != selected_index
        )
        assert matrix.exact_relation_hnf_basis(without, columns) != basis

    selected, selected_rank = cubic._select_cubic_relation_candidates(
        matrix, initial, triples, columns
    )
    assert selected is not None
    selected_indices = tuple(entry[1][0] for entry in selected)
    assert selected_rank == stable.rank
    assert selected_indices == stable.selected_candidate_indices

    for backend in ('native', 'javascript'):
        answer = matrix.resident_exact_relation_hnf_selection(
            initial, candidates, columns, backend=backend
        )
        assert answer.basis == basis
        assert answer.source_support == support
        assert answer.selected_candidate_indices == tuple(fixture['selected'])
        assert answer.rank == fixture['rank']
        assert answer.deletion_trials == fixture['trials']
        assert answer.hnf_calls == answer.deletion_trials + 1
        assert answer.deletion_complete
        assert answer.boundary_calls == 1
        assert answer.packed_input_bytes > 0
        assert answer.published_output_values > 0
        assert answer.work_units <= matrix.MAX_RESIDENT_HNF_WORK

    oracle = matrix.resident_exact_relation_hnf_selection(
        initial, candidates, columns, backend='python'
    )
    assert oracle.basis == basis and oracle.rank == fixture['rank']
    oracle_rows = initial + tuple(
        candidates[index] for index in oracle.selected_candidate_indices
    )
    assert matrix.exact_relation_hnf_basis(oracle_rows, columns) == basis
    reports.append({
        'name': fixture['name'],
        'rank': fixture['rank'],
        'selected': len(stable.selected_candidate_indices),
        'trials': fixture['trials'],
    })

# This is the exact 37-by-8 relation workspace that deterministically crashed
# the older transform-based resident selector.  The new basis-only kernel is a
# separate route and must execute this real source matrix, not merely a matrix
# with the same dimensions.
crash = json.loads(${JSON.stringify(JSON.stringify(crashFixture))})
crash_initial = tuple(tuple(row) for row in crash['initial'])
crash_candidates = tuple(tuple(row) for row in crash['candidates'])
crash_expected = crash['expected']
crash_native = matrix.stable_exact_relation_hnf_selection(
    crash_initial, crash_candidates, crash['columns']
)
assert crash_native.basis == tuple(tuple(row) for row in crash_expected['basis'])
assert crash_native.selected_candidate_indices == tuple(
    crash_expected['selected_candidate_indices']
)
assert crash_native.rank == crash_expected['rank']
assert crash_native.deletion_trials == crash_expected['deletion_trials']
assert crash_native.hnf_calls == crash_expected['hnf_calls']
assert crash_native.backend == 'stable-native-basis-deletions'
assert crash_native.boundary_calls == 1
assert crash_native.library_boundary_calls == 0
crash_oracle = matrix.stable_exact_relation_hnf_selection(
    crash_initial,
    crash_candidates,
    crash['columns'],
    cancelled=lambda: False,
)
assert crash_native == crash_oracle
assert crash_oracle.backend == 'stable-flint-basis-deletions'
assert crash_oracle.boundary_calls == 0
assert crash_oracle.library_boundary_calls == crash_oracle.hnf_calls

# Exercise every dimension in the separately qualified native envelope.  The
# entries cover the complete accepted signed four-bit range.  One deletion
# trial exercises allocation, ingress, both HNF destinations, mutation or
# restoration, publication, and cleanup for all 640 shapes.  Each native
# result is checked against the mature FLINT route rather than against another
# compiled implementation.  The two real cubic fixtures below exercise long
# deletion sequences.
qualified_shape_cases = 0
for qualified_rows in range(1, matrix.MAX_STABLE_HNF_NATIVE_ROWS + 1):
    for qualified_columns in range(1, matrix.MAX_STABLE_HNF_NATIVE_COLUMNS + 1):
        qualified_source = tuple(
            tuple(
                ((17 * row + 11 * column + 3) % 31) - 15
                for column in range(qualified_columns)
            )
            for row in range(qualified_rows)
        )
        qualified_native = matrix.stable_exact_relation_hnf_selection(
            (),
            qualified_source,
            qualified_columns,
            maximum_deletion_trials=1,
        )
        qualified_oracle = matrix.stable_exact_relation_hnf_selection(
            (),
            qualified_source,
            qualified_columns,
            maximum_deletion_trials=1,
            cancelled=lambda: False,
        )
        assert qualified_native.basis == qualified_oracle.basis
        assert qualified_native.source_support == qualified_oracle.source_support
        assert qualified_native.selected_candidate_indices == qualified_oracle.selected_candidate_indices
        assert qualified_native.rank == qualified_oracle.rank
        assert qualified_native.hnf_calls == qualified_oracle.hnf_calls
        assert 1 <= qualified_native.hnf_calls <= 2
        assert qualified_native.deletion_trials == qualified_oracle.deletion_trials
        assert 0 <= qualified_native.deletion_trials <= 1
        assert qualified_native.backend == 'stable-native-basis-deletions'
        assert qualified_oracle.backend == 'stable-flint-basis-deletions'
        qualified_shape_cases += 1
assert qualified_shape_cases == (
    matrix.MAX_STABLE_HNF_NATIVE_ROWS * matrix.MAX_STABLE_HNF_NATIVE_COLUMNS
)

hard = fixtures[0]
initial = tuple(tuple(row) for row in hard['initial'])
candidates = tuple(tuple(row) for row in hard['candidates'])
bounded = matrix.resident_exact_relation_hnf_selection(
    initial, candidates, hard['columns'], backend='native',
    maximum_deletion_trials=2,
)
assert bounded.deletion_trials == 2 and not bounded.deletion_complete
bounded_rows = initial + tuple(
    candidates[index] for index in bounded.selected_candidate_indices
)
assert matrix.exact_relation_hnf_basis(
    bounded_rows, hard['columns']
) == bounded.basis

checks = [0]
def cancelled():
    checks[0] += 1
    return checks[0] >= 2
try:
    matrix.resident_exact_relation_hnf_selection(
        initial, candidates, hard['columns'], cancelled=cancelled
    )
except RuntimeError as error:
    assert str(error) == 'class/unit computation cancelled'
else:
    raise AssertionError('resident HNF cancellation was ignored')

stable_checks = [0]
def stable_cancelled():
    stable_checks[0] += 1
    return stable_checks[0] >= 2
try:
    matrix.stable_exact_relation_hnf_selection(
        initial, candidates, hard['columns'], cancelled=stable_cancelled
    )
except RuntimeError as error:
    assert str(error) == 'class/unit computation cancelled'
else:
    raise AssertionError('stable HNF cancellation was ignored')

for arguments, fragment in (
    (((0,) * (matrix.MAX_RESIDENT_HNF_COLUMNS + 1),), 'column count'),
    (
        tuple((0,) for _index in range(matrix.MAX_RESIDENT_HNF_ROWS + 1)),
        'shape bound',
    ),
    (((1 << matrix.MAX_RESIDENT_HNF_ENTRY_BITS,),), 'entry'),
):
    rows = arguments
    try:
        matrix.resident_exact_relation_hnf_selection(
            (), rows, len(rows[0]), backend='python'
        )
    except matrix.RelationMatrixError as error:
        assert fragment in str(error)
    else:
        raise AssertionError('resident HNF resource bound was ignored')
try:
    matrix.resident_exact_relation_hnf_selection(
        initial, candidates, hard['columns'], work_limit=1
    )
except matrix.RelationMatrixError as error:
    assert 'work limit' in str(error)
else:
    raise AssertionError('resident HNF work bound was ignored')

saved_override = matrix._resident_hnf_kernel_override
def rejected_replay(*_arguments):
    return 0
matrix._resident_hnf_kernel_override = rejected_replay
try:
    try:
        matrix.resident_exact_relation_hnf_selection(
            initial, candidates, hard['columns']
        )
    except ArithmeticError as error:
        assert 'exact replay' in str(error)
    else:
        raise AssertionError('resident HNF accepted a failed replay')
finally:
    matrix._resident_hnf_kernel_override = saved_override

# Automatic native dispatch is deliberately limited to the largest authentic
# shape and entry bit width in this release's differential corpus.  Larger
# exact workspaces must fail closed without entering native code.
wide_initial = ((1, 0),)
wide_candidates = tuple(
    (index + 2, 1) for index in range(matrix.MAX_RESIDENT_HNF_NATIVE_ROWS)
)
native_calls = [0]
def unqualified_native(*_arguments):
    native_calls[0] += 1
    raise AssertionError('an unqualified resident HNF shape entered native code')
matrix._resident_hnf_kernel_override = unqualified_native
try:
    fallback = matrix.resident_exact_relation_hnf_selection(
        wide_initial, wide_candidates, 2, backend='auto'
    )
    oracle = matrix.resident_exact_relation_hnf_selection(
        wide_initial, wide_candidates, 2, backend='python'
    )
    assert fallback.basis == oracle.basis
    assert fallback.selected_candidate_indices == oracle.selected_candidate_indices
    assert fallback.backend in (
        'python+flint-basis-deletions',
        'python',
    )
    assert oracle.backend == 'python'
    assert native_calls[0] == 0
    try:
        matrix.resident_exact_relation_hnf_selection(
            wide_initial, wide_candidates, 2, backend='native'
        )
    except RuntimeError as error:
        assert 'qualified shape/bit envelope' in str(error)
    else:
        raise AssertionError('an unqualified explicit native shape was accepted')
finally:
    matrix._resident_hnf_kernel_override = saved_override

# If the mature basis-only route is unavailable, automatic selection remains
# exact and reports the ordinary Python deletion route.  This is independent
# of the custom resident-kernel guard exercised above.
saved_basis_route = matrix._exact_relation_hnf_basis_from_source
def forced_python_basis(source, columns):
    hnf, _left = matrix._python_hnf_transform(
        [list(row) for row in source], columns
    )
    return tuple(tuple(row) for row in hnf if any(row)), 'python'
matrix._exact_relation_hnf_basis_from_source = forced_python_basis
try:
    fallback = matrix.resident_exact_relation_hnf_selection(
        wide_initial, wide_candidates, 2, backend='auto'
    )
    oracle = matrix.resident_exact_relation_hnf_selection(
        wide_initial, wide_candidates, 2, backend='python'
    )
    assert fallback == oracle
    assert fallback.backend == 'python'
finally:
    matrix._exact_relation_hnf_basis_from_source = saved_basis_route

stable_library = matrix.stable_exact_relation_hnf_selection(
    wide_initial, wide_candidates, 2, cancelled=lambda: False
)
matrix._exact_relation_hnf_basis_from_source = forced_python_basis
try:
    stable_python = matrix.stable_exact_relation_hnf_selection(
        wide_initial, wide_candidates, 2, cancelled=lambda: False
    )
    assert stable_python == stable_library
    assert stable_python.backend == 'stable-python-basis-deletions'
    assert stable_python.library_boundary_calls == 0
finally:
    matrix._exact_relation_hnf_basis_from_source = saved_basis_route

for arguments, columns, fragment in (
    (
        tuple((0,) for _index in range(matrix.MAX_STABLE_HNF_ROWS + 1)),
        1,
        'shape bound',
    ),
    (((0,) * (matrix.MAX_STABLE_HNF_COLUMNS + 1),),
        matrix.MAX_STABLE_HNF_COLUMNS + 1, 'column count'),
    (((1 << matrix.MAX_STABLE_HNF_ENTRY_BITS,),), 1, 'entry'),
):
    try:
        matrix.stable_exact_relation_hnf_selection((), arguments, columns)
    except matrix.RelationMatrixError as error:
        assert fragment in str(error)
    else:
        raise AssertionError('stable HNF resource bound was ignored')
try:
    matrix.stable_exact_relation_hnf_selection(
        wide_initial, wide_candidates, 2, work_limit=1
    )
except matrix.RelationMatrixError as error:
    assert 'work limit' in str(error)
else:
    raise AssertionError('stable HNF work bound was ignored')

saved_override = matrix._resident_hnf_kernel_override
bit_calls = [0]
def unqualified_bit_native(*_arguments):
    bit_calls[0] += 1
    raise AssertionError('an unqualified resident HNF bit width entered native code')
matrix._resident_hnf_kernel_override = unqualified_bit_native
try:
    bit_rows = ((1 << matrix.MAX_RESIDENT_HNF_NATIVE_ENTRY_BITS,),)
    fallback = matrix.resident_exact_relation_hnf_selection(
        (), bit_rows, 1, backend='auto'
    )
    oracle = matrix.resident_exact_relation_hnf_selection(
        (), bit_rows, 1, backend='python'
    )
    assert bit_calls[0] == 0
    assert fallback == oracle
    try:
        matrix.resident_exact_relation_hnf_selection(
            (), bit_rows, 1, backend='native'
        )
    except RuntimeError as error:
        assert 'qualified shape/bit envelope' in str(error)
    else:
        raise AssertionError('an unqualified explicit native bit width was accepted')
finally:
    matrix._resident_hnf_kernel_override = saved_override

# The new basis-only selector has its own independent release envelope.  A
# first-outside row shape and bit width must not enter it, even when a callable
# override is installed before any buffer allocation.
saved_stable_override = matrix._stable_hnf_kernel_override
stable_native_calls = [0]
def unqualified_stable_native(*_arguments):
    stable_native_calls[0] += 1
    raise AssertionError('an unqualified stable HNF shape entered native code')
matrix._stable_hnf_kernel_override = unqualified_stable_native
try:
    outside_candidates = tuple(
        (index + 2, 1) for index in range(matrix.MAX_STABLE_HNF_NATIVE_ROWS)
    )
    outside_shape = matrix.stable_exact_relation_hnf_selection(
        ((1, 0),),
        outside_candidates,
        2,
        maximum_deletion_trials=0,
    )
    outside_bits = matrix.stable_exact_relation_hnf_selection(
        (),
        ((1 << matrix.MAX_STABLE_HNF_NATIVE_ENTRY_BITS,),),
        1,
        maximum_deletion_trials=0,
    )
    assert stable_native_calls == [0]
    assert outside_shape.boundary_calls == 0
    assert outside_bits.boundary_calls == 0
finally:
    matrix._stable_hnf_kernel_override = saved_stable_override

# A native decline is private and restarts through the unchanged mature exact
# route.  No partial native output is published.
stable_declines = [0]
def declined_stable_native(*_arguments):
    stable_declines[0] += 1
    return -1
matrix._stable_hnf_kernel_override = declined_stable_native
try:
    declined = matrix.stable_exact_relation_hnf_selection(
        crash_initial, crash_candidates, crash['columns']
    )
    assert stable_declines == [1]
    assert declined == crash_oracle
    assert declined.backend == 'stable-flint-basis-deletions'
    assert declined.boundary_calls == 0
finally:
    matrix._stable_hnf_kernel_override = saved_stable_override

from sagejs.kernels.matrix.class_group_hnf import (
    resident_exact_relation_hnf_select,
    resident_exact_relation_hnf_select_v2,
    stable_exact_relation_hnf_select_v1,
)
assert is_compiled(resident_exact_relation_hnf_select)
assert resident_exact_relation_hnf_select.nativeAvailable
assert is_compiled(resident_exact_relation_hnf_select_v2)
assert resident_exact_relation_hnf_select_v2.nativeAvailable
assert is_compiled(stable_exact_relation_hnf_select_v1)
assert stable_exact_relation_hnf_select_v1.nativeAvailable
print(json.dumps({'status': 'resident-hnf-ok', 'reports': reports}, sort_keys=True))
`;
    const result = runSage(cache, program);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.status, "resident-hnf-ok");
    assert.equal(report.reports.length, fixtures.length);
    assert.ok(report.reports.some((entry) => entry.trials === 6));
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test("the ordinary CPython oracle retains the same canonical lattices", () => {
  const python = spawnSync(
    "python3",
    [
      "-c",
      [
        "import json, sys",
        `sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})`,
        "import sagejs.number_fields.class_group_matrix as matrix",
        `fixtures = json.loads(${JSON.stringify(JSON.stringify(fixtures))})`,
        "for fixture in fixtures:",
        "    initial = tuple(tuple(row) for row in fixture['initial'])",
        "    candidates = tuple(tuple(row) for row in fixture['candidates'])",
        "    answer = matrix.resident_exact_relation_hnf_selection(initial, candidates, fixture['columns'], backend='python')",
        "    retained = initial + tuple(candidates[index] for index in answer.selected_candidate_indices)",
        "    assert answer.rank == fixture['rank']",
        "    assert matrix.exact_relation_hnf_basis(retained, fixture['columns']) == answer.basis",
        "    stable = matrix.stable_exact_relation_hnf_selection(initial, candidates, fixture['columns'])",
        "    stable_retained = initial + tuple(candidates[index] for index in stable.selected_candidate_indices)",
        "    assert stable.rank == fixture['rank'] and stable.deletion_complete",
        "    assert matrix.exact_relation_hnf_basis(stable_retained, fixture['columns']) == stable.basis",
        "    for selected_index in stable.selected_candidate_indices:",
        "        without = initial + tuple(candidates[index] for index in stable.selected_candidate_indices if index != selected_index)",
        "        assert matrix.exact_relation_hnf_basis(without, fixture['columns']) != stable.basis",
        "print(json.dumps({'status': 'cpython-resident-hnf-ok'}))",
      ].join("\n"),
    ],
    { cwd: tmpdir(), encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(python.status, 0, python.stderr || python.stdout);
  assert.deepEqual(JSON.parse(python.stdout), {
    status: "cpython-resident-hnf-ok",
  });
});
