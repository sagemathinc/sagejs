// sagejs-test-tier: unit
// CPython reference qualification; native word-admission evidence is documented separately.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("incremental parity quotient agrees with independent dense elimination", () => {
  const run = cp.spawnSync(pythonExecutable(), ["-c", String.raw`
import ast
import json
import random
from pathlib import Path

source = Path("bench/class-unit-groups/cubic-two-primary.py").read_text()
tree = ast.parse(source)
# Execute the actual ordinary-Python bodies, substituting only typed storage.
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
namespace = {"FmpzMatrix": object, "UInt64Buffer": list, "uint64": int, "checked_uint64": int}
exec(compile(ast.Module(body=functions, type_ignores=[]), "parity-source", "exec"), namespace)
extend = namespace["parity_relation_basis"]
reduce = namespace["parity_quotient_reduce"]
prepare_word = namespace["parity_word_prepare"]
commit_word = namespace["parity_word_commit"]

class Matrix:
    def __init__(self, rows, columns):
        assert all(len(row) == columns for row in rows)
        self.rows = [list(row) for row in rows]
    def __getitem__(self, key):
        i, j = key
        return self.rows[i][j]
    def __setitem__(self, key, value):
        i, j = key
        self.rows[i][j] = value

def dense_echelon(rows, n):
    # Independent column-first Gaussian elimination on scalar entries, no bitsets.
    work = [[v % 2 for v in row] for row in rows]
    rank = 0
    pivots = []
    for column in range(n):
        pivot = next((i for i in range(rank, len(work)) if work[i][column]), None)
        if pivot is None:
            continue
        work[rank], work[pivot] = work[pivot], work[rank]
        for i in range(rank + 1, len(work)):
            if work[i][column]:
                work[i] = [(a + b) % 2 for a, b in zip(work[i], work[rank])]
        pivots.append(column)
        rank += 1
    return work[:rank], pivots

def dense_reduce(rows, pivots, vector):
    vector = [v % 2 for v in vector]
    for row, pivot in zip(rows, pivots):
        if vector[pivot]:
            vector = [(a + b) % 2 for a, b in zip(vector, row)]
    return vector

def encode(row):
    return sum((value % 2) * 2**i for i, value in enumerate(row))

rng = random.Random(20260910)
cases = []
for n in range(0, 18):
    for trial in range(12):
        rows = [[rng.randrange(-2**130, 2**130) for _ in range(n)] for _ in range(trial)]
        if rows:
            rows += [rows[0][:], [-v for v in rows[0]], [0] * n]
        cases.append((n, rows))
for n in [31, 64, 65, 127, 128, 255, 512]:
    cases.append((n, [[rng.randrange(-2**257, 2**257) for _ in range(n)] for _ in range(19)]))
    # Explicit high-bit and signed pivots cross all machine-word boundaries.
    columns = sorted(set([0, n // 2, n - 1]))
    cases.append((n, [[-(2**300 + 1) if i == j else 2**280 for i in range(n)] for j in columns]))
cases += [(6, [[2 if i == j else 0 for j in range(6)] for i in range(6)]),
          (6, [[1 if i == j else 0 for j in range(6)] for i in range(6)])]

prefixes = 0
for n, rows in cases:
    matrix = Matrix(rows, n)
    # Physical stride may exceed the logical number of factors. Check both
    # boundary words and untouched guards outside the exact borrowed range.
    capacity = max(1, n + 3)
    words = (capacity + 63) // 64
    base = 2
    word_state = [991, 992] + [0] * ((capacity + 1) * words) + [993]
    retained = []
    for row_index, row in enumerate(rows):
        before = word_state[:base + capacity * words]
        pivot = prepare_word(matrix, word_state, row_index, n, base, capacity)
        assert word_state[:base + capacity * words] == before
        _, old_pivots = dense_echelon(retained, n)
        _, new_pivots = dense_echelon(retained + [row], n)
        assert (pivot < n) == (len(new_pivots) > len(old_pivots))
        # Rejected independent proposals must not hide later directions.
        if row_index % 3 != 1:
            commit_word(word_state, pivot, n, base, capacity)
            retained.append(row)
        else:
            assert word_state[:base + capacity * words] == before
        _, retained_pivots = dense_echelon(retained, n)
        actual_pivots = [j for j in range(n) if
            word_state[base + j * words + j // 64] & (1 << (j % 64))]
        assert actual_pivots == retained_pivots
        assert word_state[:base] == [991, 992] and word_state[-1] == 993
        assert all(0 <= value < 2**64 for value in word_state)
    basis = Matrix([[0] * (n + 2)], n + 2)
    cuts = sorted(set([0, len(rows) // 3, len(rows) // 2, len(rows)]))
    if n <= 5:
        cuts = list(range(len(rows) + 1))
    for count in cuts:
        expected, pivots = dense_echelon(rows[:count], n)
        assert extend(matrix, basis, count, n) == len(pivots)
        assert basis[0, n + 1] == count
        assert [j for j in range(n) if basis[0, j]] == pivots
        for j in pivots:
            bitset = basis[0, j]
            assert bitset % 2**(j + 1) == 2**j and bitset < 2**n
        probes = [[int(i == j) for i in range(n)] for j in range(n)]
        probes += rows[:count]
        if n <= 5:
            probes += [[(v // 2**j) % 2 for j in range(n)] for v in range(2**n)]
        else:
            probes += [[rng.randrange(2) for _ in range(n)] for _ in range(7)]
        for row in probes:
            residual = reduce(basis, encode(row), n)
            assert residual == encode(dense_reduce(expected, pivots, row))
            assert reduce(basis, residual, n) == residual
        old = [row[:] for row in basis.rows]
        assert extend(matrix, basis, count, n) == len(pivots) and basis.rows == old
        prefixes += 1
    fresh = Matrix([[0] * (n + 2)], n + 2)
    assert extend(matrix, fresh, len(rows), n) == basis[0, n]
    assert fresh.rows == basis.rows
    assert reduce(basis, -1, n) == -1
    assert reduce(basis, 2**n, n) == -1
    # Invalid cursor/rank rejects before mutation. This is not forged-state authentication.
    for bad_rank, bad_count in [(-1, 0), (n + 1, 0), (0, -1), (0, len(rows) + 1)]:
        invalid = Matrix([[0] * n + [bad_rank, bad_count]], n + 2)
        before = [row[:] for row in invalid.rows]
        assert extend(matrix, invalid, len(rows), n) == -1
        assert invalid.rows == before

# Same mod-2 quotient does not imply same integer quotient: Z/2 and Z/4.
for value in [2, 4]:
    basis = Matrix([[0, 0, 0]], 3)
    assert extend(Matrix([[value]], 1), basis, 1, 1) == 0
    assert reduce(basis, 1, 1) == 1
# Conversely, parity membership does not imply integer membership in 3Z.
basis = Matrix([[0, 0, 0]], 3)
assert extend(Matrix([[3]], 1), basis, 1, 1) == 1
assert reduce(basis, 1, 1) == 0

# Actual 182-ideal research prefix: the odd-prime scheduler discarded an
# independently replayed principal relation that adds a parity direction.
# This checks the loss mechanism, not whether all true two-torsion is removed.
fixture = json.loads(Path("test/fixtures/cubic-two-primary-admission.json").read_text())
n = fixture["columns"]
def unpack(sparse):
    row = [0] * n
    columns = [column for column, value in sparse]
    assert columns == sorted(set(columns))
    for column, value in sparse:
        assert 0 <= column < n and value != 0
        row[column] = value
    return row
rows = [unpack(row) for row in fixture["prefix"]]
candidate = unpack(fixture["candidate"])
assert len(rows) == fixture["row_count"] == 184
def odd_prime_rank(rows):
    prime = fixture["word_prime"]
    pivots = {}
    for row in rows:
        work = [value % prime for value in row]
        for column in range(n):
            if work[column] == 0:
                continue
            if column in pivots:
                value = work[column]
                work = [(x - value*y) % prime for x, y in zip(work, pivots[column])]
            else:
                inverse = pow(work[column], -1, prime)
                pivots[column] = [x * inverse % prime for x in work]
                break
    return len(pivots)
rank = odd_prime_rank(rows)
assert rank == fixture["rank_before"] == 178
assert odd_prime_rank(rows + [candidate]) == rank
assert len(rows) == rank + fixture["relation_target"] - n
event = list(map(int, fixture["trace_event"]))
assert event[3:8] == [1261, 1, 0, 184, 184]
assert event[12:14] == [5, rank]  # Executed native quota-rejection branch.
basis = Matrix([[0] * (n + 2)], n + 2)
before = extend(Matrix(rows, n), basis, len(rows), n)
assert reduce(basis, encode(candidate), n) != 0
assert reduce(basis, encode([-value for value in candidate]), n) != 0
assert reduce(basis, encode([2 * value for value in candidate]), n) == 0
assert extend(Matrix(rows + [candidate], n), basis, len(rows) + 1, n) == before + 1
assert reduce(basis, encode(candidate), n) == 0
# Replay the real retained prefix through the machine-word implementation.
capacity = 256
words = 4
state = [0] * ((capacity + 1) * words)
matrix = Matrix(rows + [candidate], n)
for i in range(len(rows)):
    pivot = prepare_word(matrix, state, i, n, 0, capacity)
    commit_word(state, pivot, n, 0, capacity)
before = state[:capacity * words]
pivot = prepare_word(matrix, state, len(rows), n, 0, capacity)
assert pivot < n and state[:capacity * words] == before
# Deliberately reject, then propose again: novelty must still be visible.
assert prepare_word(matrix, state, len(rows), n, 0, capacity) == pivot
assert state[:capacity * words] == before
commit_word(state, pivot, n, 0, capacity)
assert prepare_word(matrix, state, len(rows), n, 0, capacity) == n
print(len(cases), "matrices;", prefixes, "incremental prefixes; dense quotient agreement")
`], { cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 60000, maxBuffer: 2e6 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /232 matrices; .* incremental prefixes; dense quotient agreement/);
});
