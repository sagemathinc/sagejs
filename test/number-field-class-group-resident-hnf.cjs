#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const kernelSource = join(
  root,
  "src/lib/sagejs/kernels/matrix/class_group_hnf.py",
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
    legacy, legacy_rank = cubic._select_cubic_relation_candidates(
        matrix, initial, triples, columns
    )
    assert legacy is not None
    legacy_indices = tuple(entry[1][0] for entry in legacy)
    basis, support = matrix.exact_relation_hnf_support(
        initial + candidates, columns
    )
    assert legacy_rank == fixture['rank']
    assert support == tuple(fixture['support'])
    assert legacy_indices == tuple(fixture['selected'])

    for backend in ('native', 'javascript'):
        answer = matrix.resident_exact_relation_hnf_selection(
            initial, candidates, columns, backend=backend
        )
        assert answer.basis == basis
        assert answer.source_support == support
        assert answer.selected_candidate_indices == legacy_indices
        assert answer.rank == legacy_rank
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
    assert oracle.basis == basis and oracle.rank == legacy_rank
    oracle_rows = initial + tuple(
        candidates[index] for index in oracle.selected_candidate_indices
    )
    assert matrix.exact_relation_hnf_basis(oracle_rows, columns) == basis
    reports.append({
        'name': fixture['name'],
        'rank': legacy_rank,
        'selected': len(legacy_indices),
        'trials': fixture['trials'],
    })

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

from sagejs.kernels.matrix.class_group_hnf import resident_exact_relation_hnf_select
assert is_compiled(resident_exact_relation_hnf_select)
assert resident_exact_relation_hnf_select.nativeAvailable
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
