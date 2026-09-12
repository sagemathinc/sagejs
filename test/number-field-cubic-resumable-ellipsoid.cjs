// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const sourcePath = resolve(__dirname,
  "../src/lib/sagejs/number_fields/cubic_class_number_native.py");

// Execute the actual ordinary-Python collector with deterministic admission
// doubles. These tests prove cursor/control-flow properties, not class-group
// mathematics; the production closure and exact-replay tests cover the latter.
test("ellipsoid pauses preserve every proposal and cumulative admission state", () => {
  const result = spawnSync(pythonExecutable(), ["-", sourcePath], {
    encoding: "utf8",
    timeout: 30_000,
    input: String.raw`
import ast
import sys

with open(sys.argv[1]) as stream:
    module = ast.parse(stream.read())
collector = next(node for node in module.body if isinstance(node, ast.FunctionDef)
                 and node.name == "_cubic_append_reduced_ideal_ellipsoid")
collector.decorator_list = []
namespace = {}
exec("from __future__ import annotations\n" + ast.unparse(collector), namespace)
namespace["_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES"] = 500

class Scenario:
    def __init__(self, limits, *, capacity=10000, target=10000,
                 streaming=False, online=False, closes_at=10000,
                 initial_candidates=0, accept_all=False):
        self.limits = limits
        self.capacity = capacity
        self.target = target
        self.streaming = streaming
        self.online = online
        self.closes_at = closes_at
        self.accept_all = accept_all
        self.state = (0, initial_candidates, 0, 0, *(-x for x in limits))
        self.trace = []
        self.rows = []
        self.updates = []
        self.parameters = {(0, 7 + index): limit
                           for index, limit in enumerate(limits)}

    def candidate(self, *args):
        point = tuple(args[-3:])
        self.trace.append(point)
        zero, one, two = point
        status = int(self.accept_all or (zero + 3 * one + 7 * two) % 4 != 1)
        return status, zero, one, two

    def append(self, *args):
        count = args[4]
        zero, one, two = args[8:11]
        # Both rejected smoothness tests and duplicate relations occur.
        key = (abs(zero), one, two)
        if self.accept_all or (zero != 0 and key not in self.rows):
            self.rows.append(key)
            return count + 1
        return count

    def update(self, *args):
        row = args[-2]
        self.updates.append(row)
        return 2 if row + 1 >= self.closes_at else 1

    def advance(self, budget):
        namespace.update({
            "_cubic_reduced_ellipsoid_candidate": self.candidate,
            "_cubic_append_smooth_principal_relation": self.append,
            "_cubic_online_relation_lattice_update": self.update,
            "_cubic_modular_relation_collection_complete":
                lambda workspace, count, target, factors: count >= target,
        })
        count, candidates, online_count, status, zero, one, two = self.state
        self.state = namespace[collector.name](
            None, None, 0, None, 0, self.parameters, 0, None, None,
            count, self.capacity, 1, 1, self.target, None, None,
            self.streaming, self.online, None, None, None, None, None,
            online_count, status, zero, one, two, candidates, budget,
        )

    def snapshot(self):
        return self.state, list(self.trace), list(self.rows), list(self.updates)

for limits in [(0, 0, 0), (2, 0, 1), (1, 2, 1), (2, 2, 2)]:
    size = (2 * limits[0] + 1) * (2 * limits[1] + 1) * (2 * limits[2] + 1)
    expected_trace = [(zero, one, two)
                      for two in range(-limits[2], limits[2] + 1)
                      for one in range(-limits[1], limits[1] + 1)
                      for zero in range(-limits[0], limits[0] + 1)]
    for options in [{}, {"online": True},
                    {"streaming": True, "target": 3},
                    {"online": True, "closes_at": 3},
                    {"capacity": 2}, {"initial_candidates": 499}]:
        reference = Scenario(limits, **options)
        reference.advance(size)
        assert reference.trace == expected_trace[:len(reference.trace)]
        for split in range(size + 1):
            paused = Scenario(limits, **options)
            before = paused.snapshot()
            paused.advance(0)
            assert paused.snapshot() == before
            paused.advance(split)
            # Capacity overflow is terminal, not a resumable proof decline.
            if paused.state[0] <= paused.capacity:
                paused.advance(size)
            assert paused.snapshot() == reference.snapshot(), (limits, options, split)
        if not options:
            assert reference.trace == expected_trace
            exhausted = reference.snapshot()
            reference.advance(size)
            assert reference.snapshot() == exhausted

# Resume after a collection target was reached, without replaying that prefix.
full = Scenario((2, 2, 2), online=True)
full.advance(1000)
staged = Scenario((2, 2, 2), streaming=True, online=True, target=3)
staged.advance(1000)
assert staged.state[0] == 3
staged.target = 10000
while staged.state[6] <= 2:
    staged.advance(1)
assert staged.snapshot() == full.snapshot()

# Exact trivial-quotient closure is terminal even if a later call has budget.
closed = Scenario((2, 2, 2), online=True, closes_at=1)
closed.advance(1000)
assert closed.state[3] == 2
before = closed.snapshot()
closed.advance(1000)
assert closed.snapshot() == before

# Even one-proposal calls share the 500-candidate cap.
capped = Scenario((4, 4, 4), accept_all=True)
for _ in range(501):
    capped.advance(1)
assert capped.state[0] == capped.capacity + 1
assert capped.state[1] == 501
assert len(capped.trace) == 501
assert len(capped.rows) == 500
print("all pause boundaries, exhaustion, duplicate/rejected proposals and caps passed")
`,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}${result.stderr}`);
});

test("the actual collector resumes in compiled GMP and fmpz execution", {
  timeout: 120_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ellipsoid-cursor-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = readFileSync(sourcePath, "utf8");
  function signature(name) {
    const start = source.indexOf(`def ${name}(`);
    assert.notEqual(start, -1);
    return source.slice(start, source.indexOf(":\n", start) + 2);
  }
  const start = source.indexOf("def _cubic_append_reduced_ideal_ellipsoid(");
  const end = source.indexOf("\n\n@native", start);
  assert.ok(end > start);
  // Preserve the production collector verbatim. Only its arithmetic callees
  // are replaced with observable, deterministic admission doubles.
  const fixture = `from sagejs.native import native, uint64, UInt64Buffer, NativeIntegerVector, NativeExactArena
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix

_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES = 500

${signature("_cubic_reduced_ellipsoid_candidate")}
    workspace[0] += 1
    workspace[1] = (workspace[1] * 131 + coefficient_zero + 5 + 11 * (coefficient_one + 5) + 121 * (coefficient_two + 5)) % 1000000007
    if (coefficient_zero + 3 * coefficient_one + 7 * coefficient_two) % 4 == 1:
        return (0, 0, 0, 0)
    return (1, coefficient_zero, coefficient_one, coefficient_two)

${signature("_cubic_append_smooth_principal_relation")}
    if coordinate_zero > 0:
        return relation_count + 1
    return relation_count

${signature("_cubic_modular_relation_collection_complete")}
    return relation_count >= relation_target

${signature("_cubic_online_relation_lattice_update")}
    support[0, 0] = support[0, 0] + relation_row + 1
    return 1

${source.slice(start, end)}

@native
def cursor_witness(modular: UInt64Buffer, limit: int, budget: uint64, initial_candidates: uint64, capacity: uint64) -> int:
    with NativeExactArena(1048576, 1048576) as arena:
        workspace = arena.integer_vector(2, 0)
        matrix = arena.foreign_resource(fmpz_matrix, 1, 11)
        matrix[0, 7] = limit
        matrix[0, 8] = limit
        matrix[0, 9] = limit
        zero = -limit
        one = -limit
        two = -limit
        count: uint64 = 0
        candidates: uint64 = initial_candidates
        online_count: uint64 = 0
        online_status = 0
        offset: uint64 = 0
        factors: uint64 = 1
        target: uint64 = 3
        active_budget: uint64 = 0
        while two <= limit and count <= capacity:
            count, candidates, online_count, online_status, zero, one, two = _cubic_append_reduced_ideal_ellipsoid(
                workspace, modular, offset, matrix, offset, matrix, offset,
                matrix, matrix, count, capacity, factors, factors, target,
                matrix, matrix, True, True, matrix, matrix, matrix, matrix,
                matrix, online_count, online_status, zero, one, two,
                candidates, active_budget,
            )
            active_budget = budget
            if count >= target:
                target = 10000
        return workspace[1] + 1000000007 * (workspace[0] + 1000 * (candidates + 1000 * (count + 10002 * (online_count + 1000 * matrix[0, 0]))))
`;
  const fixturePath = join(temporary, "cursor_witness.py");
  writeFileSync(fixturePath, fixture);
  const compiled = await compileKernel({ sourcePath: fixturePath,
    cacheRoot: join(temporary, "cache") });
  const result = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const fn = require(process.argv[1]).cursor_witness;
function oracle(limit, initial, capacity) {
  let hash = 0n, visited = 0n, candidates = initial, count = 0n;
  let online = 0n, updates = 0n;
  outer: for (let two = -limit; two <= limit; two++) {
    for (let one = -limit; one <= limit; one++) {
      for (let zero = -limit; zero <= limit; zero++) {
        visited++;
        hash = (hash * 131n + zero + 5n + 11n * (one + 5n) + 121n * (two + 5n)) % 1000000007n;
        if (((zero + 3n * one + 7n * two) % 4n + 4n) % 4n === 1n) continue;
        candidates++;
        if (candidates > 500n) { count = capacity + 1n; break outer; }
        if (zero > 0n) {
          count++;
          if (count > capacity) break outer;
          online++;
          updates += online;
        }
      }
    }
  }
  return hash + 1000000007n * (visited + 1000n * (candidates + 1000n * (count + 10002n * (online + 1000n * updates))));
}
for (const limit of [0n, 1n, 2n, 4n]) {
  for (const initial of [0n, 499n]) {
    for (const capacity of [2n, 10000n]) {
      const expected = oracle(limit, initial, capacity);
      for (const budget of [1n, 2n, 7n, 19n, 10000n]) {
        for (const implementation of [fn.javascript, fn.gmp, fn.fmpz]) {
          assert.equal(implementation(new BigUint64Array(1), limit, budget,
            initial, capacity), expected);
        }
      }
    }
  }
}
`, compiled.modulePath], {
    cwd: resolve(__dirname, ".."), encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}${result.stderr}`);
});
