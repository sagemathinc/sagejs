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

// The actual outer/inner cursor bodies execute unchanged. Arithmetic doubles
// expose proposal order and admission state: this is a control-flow witness,
// not a replacement for the production class-group exact-replay regressions.
test("adjacent ideal pauses retain permutation, plans, ellipsoids and shells", () => {
  const result = spawnSync(pythonExecutable(), ["-", sourcePath], {
    encoding: "utf8", timeout: 30_000,
    input: String.raw`
import ast
import inspect
import sys
from collections import defaultdict

with open(sys.argv[1]) as stream:
    module = ast.parse(stream.read())
names = {"_cubic_collect_adjacent_relation_prefix",
         "_cubic_append_reduced_ideal_ellipsoid"}
namespace = {
    "_FACTOR_OFFSET": 100, "_FACTOR_STRIDE": 16,
    "_POWER_OFFSET": 1000, "_CUBIC_MAX_POWERS": 5,
    "_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES": 500,
    "checked_uint64": int,
}
for node in module.body:
    if isinstance(node, ast.FunctionDef) and node.name in names:
        node.decorator_list = []
        exec("from __future__ import annotations\n" + ast.unparse(node), namespace)

class Scenario:
    codes = (5, 1, 1, 0, 6, 3)
    inert = (0, 1, 0, 0, 0, 0)
    permutation = (2, 6, 4, 1, 5, 3)
    limits = ((1, 1, 0), (1, 0, 1), (0, 0, 0),
              (0, 0, 0), (1, 1, 1), (0, 0, 0))

    def __init__(self, *, bounded=True, permutation=True, streaming=True,
                 online=True, target=10000, capacity=10000, closes_at=10000,
                 bad_plan=-1, bad_update=-1):
        self.bounded = bounded
        self.use_permutation = permutation
        self.streaming = streaming
        self.online = online
        self.target = target
        self.capacity = capacity
        self.closes_at = closes_at
        self.bad_plan = bad_plan
        self.bad_update = bad_update
        self.workspace = defaultdict(int)
        self.parameters = defaultdict(int)
        self.order = {(i, 0): value for i, value in enumerate(self.permutation)}
        self.output = defaultdict(int)
        self.state = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        self.trace, self.rows, self.updates, self.plans = [], [], [], []
        for i, code in enumerate(self.codes):
            self.workspace[100 + 16 * i + 9] = code
            self.workspace[100 + 16 * i + 8] = self.inert[i]
            for j, limit in enumerate(self.limits[i]):
                self.parameters[i, 7 + j] = limit
            self.parameters[i, 10] = sum(
                self.eligible(z, o, t)
                for t in range(-self.limits[i][2], self.limits[i][2] + 1)
                for o in range(-self.limits[i][1], self.limits[i][1] + 1)
                for z in range(-self.limits[i][0], self.limits[i][0] + 1))

    @staticmethod
    def eligible(z, o, t):
        return (z + 3 * o + 7 * t) % 4 != 1

    def plan(self, *args):
        i = args[6]
        self.plans.append(i)
        return -2 if i == self.bad_plan else self.codes[i]

    def candidate(self, *args):
        i = args[5]
        z, o, t = args[-3:]
        self.trace.append(("ellipsoid", i, z, o, t))
        return int(self.eligible(z, o, t)), 100 * (i + 1) + z, o, t

    def transformed(self, *args):
        i = (args[1] - 1000) // 45
        z, o, t = args[-3:]
        self.trace.append(("shell", i, z, o, t))
        return 100 * (i + 1) + z, o, t

    def append(self, *args):
        count = args[4]
        z, o, t = args[8:11]
        # Rejections and duplicates are both deliberately present.
        key = (z, abs(o), t)
        if (z + o + t) % 3 != 0 and key not in self.rows:
            self.rows.append(key)
            return count + 1
        return count

    def update(self, *args):
        row = args[-2]
        self.updates.append(row)
        if row == self.bad_update:
            return -1
        return 2 if row + 1 >= self.closes_at else 1

    def advance(self, budget):
        namespace.update({
            "_cubic_plan_adjacent_ideal": self.plan,
            "_cubic_reduced_ellipsoid_candidate": self.candidate,
            "_cubic_transformed_ideal_coordinates": self.transformed,
            "_cubic_append_smooth_principal_relation": self.append,
            "_cubic_online_relation_lattice_update": self.update,
            "_cubic_modular_relation_collection_complete":
                lambda workspace, count, target, factors: count >= target,
        })
        self.state = namespace["_cubic_collect_adjacent_relation_prefix"](
            self.workspace, None, self.order, None, None, None, None,
            self.parameters, None, None, None, None, None, None, None,
            None, None, self.output, 1, 0, 0, 1, 0, 1, 2, 3, 4, 1024,
            6, 1, 5, self.bounded, self.use_permutation, self.streaming,
            self.online, self.target, self.capacity, *self.state, budget)

    def snapshot(self):
        return (self.state, list(self.trace), list(self.rows), list(self.updates),
                list(self.plans), dict(self.workspace), dict(self.output))

    def expected_trace(self):
        indices = (list(reversed([x - 1 for x in self.permutation]))
                   if self.bounded and self.use_permutation else range(6))
        trace = []
        for i in indices:
            code = self.codes[i]
            if code <= 0:
                continue
            if self.inert[i] or code >= 5:
                a, b, c = self.limits[i]
                trace.extend(("ellipsoid", i, z, o, t)
                             for t in range(-c, c + 1)
                             for o in range(-b, b + 1)
                             for z in range(-a, a + 1))
            if not self.inert[i]:
                pair = code - (5 if code >= 5 else 1)
                first, second = ((0, 1), (0, 2), (1, 2))[pair]
                for left, right in ((1, 0), (0, 1), (1, 1), (-1, 1)):
                    point = [0, 0, 0]
                    point[first], point[second] = left, right
                    trace.append(("shell", i, *point))
        return trace

full_case = Scenario()
full_case.advance(10000)
cases = ({}, {"permutation": False}, {"bounded": False},
         {"streaming": False, "online": False}, {"target": 5},
         {"capacity": 2}, {"closes_at": 3}, {"bad_plan": 4},
         {"streaming": False, "closes_at": 4},
         ) + tuple({"bad_update": i} for i in range(len(full_case.rows)))
for options in cases:
    reference = Scenario(**options)
    reference.advance(10000)
    if "bad_update" in options:
        assert reference.state[2] == -1
        assert reference.updates == list(range(options["bad_update"] + 1))
        assert reference.state[1] == options["bad_update"]
        assert len(reference.rows) == options["bad_update"] + 1
    if "bad_plan" in options:
        assert reference.state[2] == -1
    assert reference.trace == reference.expected_trace()[:len(reference.trace)]
    if reference.state[2] >= 0 and reference.state[2] != 2 and reference.state[0] < reference.target:
        assert reference.trace == reference.expected_trace()
    for split in range(len(reference.expected_trace()) + 1):
        paused = Scenario(**options)
        before = paused.snapshot()
        paused.advance(0)
        assert paused.snapshot() == before
        paused.advance(split)
        paused.advance(10000)
        assert paused.snapshot() == reference.snapshot(), (options, split, paused.snapshot(), reference.snapshot())
        assert len(paused.plans) == len(set(paused.plans))
    if reference.state[2] < 0 or reference.state[2] == 2 or reference.state[5] >= 6:
        before = reference.snapshot()
        reference.advance(10000)
        assert reference.snapshot() == before

# Changing the target after a real pause must continue, not replay the current
# ideal, reset its candidate count, or skip an unfinished shell.
reference = Scenario()
reference.advance(10000)
for target in range(1, len(reference.rows)):
    resumed = Scenario(target=target)
    resumed.advance(10000)
    assert resumed.state[0] == target
    resumed.target = 10000
    while resumed.state[5] < 6:
        resumed.advance(1)
    assert resumed.snapshot() == reference.snapshot(), target

# An already failed inner cursor is terminal too. No arithmetic callee may
# overwrite its negative status, even when more proposals remain.
inner = namespace["_cubic_append_reduced_ideal_ellipsoid"]
arguments = {name: None for name in inspect.signature(inner).parameters}
arguments.update(parameters={(0, 7): 1, (0, 8): 1, (0, 9): 1},
                 parameter_row=0, relation_count=7, candidate_count=9,
                 online_relation_count=6, online_relation_status=-1,
                 coefficient_zero=-1, coefficient_one=-1, coefficient_two=-1,
                 proposal_budget=1000)
assert inner(**arguments) == (7, 9, 6, -1, -1, -1, -1)

for corruption in ("permutation", "phase", "direction"):
    invalid = Scenario()
    if corruption == "permutation":
        invalid.order[5, 0] = 0
    else:
        state = list(invalid.state)
        state[6] = 3 if corruption == "phase" else 2
        state[7] = 4
        invalid.state = tuple(state)
    invalid.advance(1000)
    assert invalid.state[2] == -1
    assert invalid.trace == []
    before = invalid.snapshot()
    invalid.advance(1000)
    assert invalid.snapshot() == before

class CappedScenario(Scenario):
    codes = (1, 0, 0, 0, 0, 0)
    inert = (1, 0, 0, 0, 0, 0)
    limits = ((4, 4, 4),) + ((0, 0, 0),) * 5

capped = CappedScenario(permutation=False)
capped.advance(10000)
assert capped.state[2] == -1 and capped.state[11] == 501
assert capped.state[0] == capped.capacity + 1
paused_cap = CappedScenario(permutation=False)
while paused_cap.state[2] >= 0:
    paused_cap.advance(1)
assert paused_cap.snapshot() == capped.snapshot()
print("all ideal/shell/ellipsoid pause boundaries and target changes agree")
`,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}${result.stderr}`);
});

test("the full adjacent cursor continues in compiled GMP and fmpz", {
  timeout: 120_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-adjacent-cursor-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = readFileSync(sourcePath, "utf8");
  function signature(name) {
    const start = source.indexOf(`def ${name}(`);
    assert.notEqual(start, -1);
    return source.slice(start, source.indexOf(":\n", start) + 2);
  }
  function body(name, following) {
    const start = source.indexOf(`def ${name}(`);
    const end = source.indexOf(following, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
  }
  const fixture = `from sagejs.native import native, uint64, checked_uint64, UInt64Buffer, IntegerBuffer, NativeIntegerVector, NativeExactArena
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix

_FACTOR_OFFSET = 100
_FACTOR_STRIDE = 16
_POWER_OFFSET = 1000
_CUBIC_MAX_POWERS = 5
_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES = 500

${signature("_cubic_plan_adjacent_ideal")}
    workspace[2] = workspace[2] * 7 + factor_index + 1
    offset: uint64 = 100 + 16 * factor_index + 9
    return workspace[offset]

${signature("_cubic_reduced_ellipsoid_candidate")}
    workspace[0] = (workspace[0] * 131 + 1000 * (parameter_row + 1) + coefficient_zero + 5 + 11 * (coefficient_one + 5) + 121 * (coefficient_two + 5)) % 1000000007
    workspace[1] += 1
    if (coefficient_zero + 3 * coefficient_one + 7 * coefficient_two) % 4 == 1:
        return (0, 0, 0, 0)
    return (1, 100 * (parameter_row + 1) + coefficient_zero, coefficient_one, coefficient_two)

${signature("_cubic_transformed_ideal_coordinates")}
    index: uint64 = (basis_offset - 1000) // 45
    workspace[0] = (workspace[0] * 131 + 1000000 + 1000 * (index + 1) + coefficient_zero + 5 + 11 * (coefficient_one + 5) + 121 * (coefficient_two + 5)) % 1000000007
    workspace[1] += 1
    return (100 * (index + 1) + coefficient_zero, coefficient_one, coefficient_two)

${signature("_cubic_append_smooth_principal_relation")}
    if (coordinate_zero + coordinate_one + coordinate_two) % 3 == 0:
        return relation_count
    if coordinate_one < 0:
        coordinate_one = -coordinate_one
    index: uint64 = 0
    while index < relation_count:
        if relation_elements[index, 0] == coordinate_zero and relation_elements[index, 1] == coordinate_one and relation_elements[index, 2] == coordinate_two:
            return relation_count
        index += 1
    relation_elements[relation_count, 0] = coordinate_zero
    relation_elements[relation_count, 1] = coordinate_one
    relation_elements[relation_count, 2] = coordinate_two
    return relation_count + 1

${signature("_cubic_modular_relation_collection_complete")}
    return relation_count >= relation_target

${signature("_cubic_online_relation_lattice_update")}
    if relation_row == membership_coordinates[0, 1]:
        return -1
    basis[0, 0] = basis[0, 0] + relation_row + 1
    return 1

${body("_cubic_append_reduced_ideal_ellipsoid", "\n\n@native")}
${body("_cubic_collect_adjacent_relation_prefix", "\n\ndef _cubic_prepare_proof_relation_support")}

@native
def adjacent_cursor_witness(modular: UInt64Buffer, output: IntegerBuffer, budget: uint64, first_target: uint64, bad_update: int) -> int:
    with NativeExactArena(1048576, 1048576) as arena:
        workspace = arena.integer_vector(220, 0)
        plans = arena.foreign_resource(fmpz_matrix, 6, 11)
        rows = arena.foreign_resource(fmpz_matrix, 128, 3)
        scratch = arena.foreign_resource(fmpz_matrix, 11, 11)
        scratch[0, 1] = bad_update
        index: uint64 = 0
        while index < 6:
            offset: uint64 = 100 + 16 * index
            workspace[offset + 9] = 1
            plans[index, 7] = 1
            plans[index, 8] = 1
            plans[index, 9] = 1
            index += 1
        workspace[109] = 5
        workspace[124] = 1
        workspace[157] = 0
        workspace[173] = 6
        workspace[189] = 3
        plans[0, 9] = 0
        plans[1, 8] = 0
        plans[0, 0] = 2
        plans[1, 0] = 6
        plans[2, 0] = 4
        plans[3, 0] = 1
        plans[4, 0] = 5
        plans[5, 0] = 3
        count: uint64 = 0
        online_count: uint64 = 0
        status: int = 0
        planned: uint64 = 0
        enumerated: uint64 = 0
        cursor: uint64 = 0
        phase: uint64 = 0
        direction: uint64 = 0
        zero: int = 0
        one: int = 0
        two: int = 0
        candidates: uint64 = 0
        active_budget: uint64 = 0
        target: uint64 = first_target
        factors: uint64 = 6
        groups: uint64 = 1
        effort: uint64 = 5
        capacity: uint64 = 128
        while cursor < factors and status >= 0:
            count, online_count, status, planned, enumerated, cursor, phase, direction, zero, one, two, candidates = _cubic_collect_adjacent_relation_prefix(
                workspace, modular, plans, scratch, scratch, scratch, plans,
                plans, rows, rows, scratch, scratch, scratch, scratch, scratch,
                scratch, scratch, output, 1, 0, 0, 1, 0, 1, 2, 3, 4, 1024,
                factors, groups, effort, True, True, True, True, target, capacity,
                count, online_count, status, planned, enumerated, cursor, phase,
                direction, zero, one, two, candidates, active_budget,
            )
            if count >= target:
                target = 10000
            active_budget = budget
        return workspace[0] + 1000000007 * (workspace[1] + 1000 * (workspace[2] + 1000000 * (count + 1000 * (online_count + 1000 * (status + 1000 * scratch[0, 0])))))
`;
  const fixturePath = join(temporary, "adjacent_cursor_witness.py");
  writeFileSync(fixturePath, fixture);
  const compiled = await compileKernel({ sourcePath: fixturePath,
    cacheRoot: join(temporary, "cache") });
  const result = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const fn = require(process.argv[1]).adjacent_cursor_witness;
function oracle(bad) {
  const codes = [5, 1, 1, 0, 6, 3];
  const limits = [[1,1,0], [1,0,1], [0,0,0], [0,0,0], [1,1,1], [0,0,0]];
  const rows = new Set();
  let hash = 0n, visits = 0n, plans = 0n, count = 0n, online = 0n, status = 0n, updates = 0n;
  function proposal(i, z, o, t, shell) {
    hash = (hash * 131n + (shell ? 1000000n : 0n) + 1000n * BigInt(i + 1) + BigInt(z + 5 + 11 * (o + 5) + 121 * (t + 5))) % 1000000007n;
    visits++;
    if (!shell && ((z + 3 * o + 7 * t) % 4 + 4) % 4 === 1) return true;
    z += 100 * (i + 1);
    const key = [z, Math.abs(o), t].join(",");
    if ((z + o + t) % 3 === 0 || rows.has(key)) return true;
    rows.add(key);
    count++;
    if (online === bad) { status = -1n; return false; }
    online++;
    updates += online;
    status = 1n;
    return true;
  }
  outer: for (const i of [2, 4, 0, 3, 5, 1]) {
    const code = codes[i];
    if (!code) continue;
    plans = plans * 7n + BigInt(i + 1);
    if (i === 1 || code >= 5) {
      const [a,b,c] = limits[i];
      for (let t = -c; t <= c; t++) for (let o = -b; o <= b; o++) for (let z = -a; z <= a; z++) {
        if (!proposal(i,z,o,t,false)) break outer;
      }
    }
    if (i !== 1) {
      const pair = code - (code >= 5 ? 5 : 1);
      const [first, second] = [[0,1], [0,2], [1,2]][pair];
      for (const [l,r] of [[1,0], [0,1], [1,1], [-1,1]]) {
        const point = [0,0,0]; point[first] = l; point[second] = r;
        if (!proposal(i,...point,true)) break outer;
      }
    }
  }
  return hash + 1000000007n * (visits + 1000n * (plans + 1000000n * (count + 1000n * (online + 1000n * (status + 1000n * updates)))));
}
for (const bad of [-1n, 0n, 2n, 3n, 7n, 12n]) for (const budget of [1n, 2n, 7n, 10000n]) {
  for (const target of [1n, 3n, 7n, 10000n]) for (const implementation of [fn.javascript, fn.gmp, fn.fmpz]) {
    const actual = implementation(new BigUint64Array(1), fn.createIntegerBuffer(64, 16), budget, target, bad);
    assert.equal(actual, oracle(bad), JSON.stringify({bad: String(bad), budget: String(budget), target: String(target)}));
  }
}
`, compiled.modulePath], {
    cwd: resolve(__dirname, ".."), encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}${result.stderr}`);
});
