"""Compare actual recovery discovery bodies, including exact owner writes."""

import ast
import copy
import json
import random
import runpy
import sys


data = json.load(sys.stdin)
original = ast.parse(data["original"])
shared = ast.parse(data["shared"])
fixture = runpy.run_path(data["fault_fixture"])
compile_function = fixture["compile_function"]


def function(tree, name):
    return next(
        item
        for item in tree.body
        if isinstance(item, ast.FunctionDef) and item.name == name
    )


name = "_cubic_relation_prefix_has_archimedean_unit"
before = function(original, name)
after = function(shared, name)
begin = next(
    i
    for i, node in enumerate(before.body)
    if isinstance(node, ast.Assign)
    and isinstance(node.targets[0], ast.Name)
    and node.targets[0].id == "unit_candidate_found"
)
end = next(
    i
    for i in range(begin + 1, len(before.body))
    if isinstance(before.body[i], ast.If)
    and ast.unparse(before.body[i].test) == "not unit_candidate_found"
)
# Everything around the replaced block, including exact reconstruction and
# final publication, must remain the same actual AST.
assert [ast.dump(x) for x in before.body[:begin]] == [
    ast.dump(x) for x in after.body[:begin]
]
assert [ast.dump(x) for x in before.body[end:]] == [
    ast.dump(x) for x in after.body[begin + 1 :]
]
wrapper = ast.parse(
    "def original_loop(prefix_dependencies_reduced, prefix_logs, "
    "prefix_unit_combinations, relation_count, dependency_count): pass"
).body[0]
wrapper.body = copy.deepcopy(before.body[begin:end]) + [
    ast.parse(
        "return unit_candidate_found, best_regulator_lower, best_regulator_upper"
    ).body[0]
]
old, _ = compile_function(wrapper)
discover, _ = compile_function(function(shared, "_cubic_discover_dependency_unit"))


class Matrix:
    def __init__(self, entries):
        self.entries = dict(entries)
        self.writes = []

    def __getitem__(self, key):
        return self.entries[key]

    def __setitem__(self, key, value):
        self.entries[key] = value
        self.writes.append((key, value))


def compare(deps, logs, rows, cols):
    # Inactive tails must not be read or changed. Missing cells raise rather
    # than silently returning zero, to catch accidental dimension extension.
    initial = {(i, j): -991 for i in range(3) for j in range(cols + 1)}
    left, right = Matrix(initial), Matrix(initial)
    expected = old(deps, logs, left, cols, rows)
    actual = discover(deps, logs, right, cols, rows, True, False, 0, 0)
    assert actual == expected
    assert left.entries == right.entries
    assert left.writes == right.writes
    assert left.entries[2, cols] == -991
    return len(left.writes)


rng = random.Random(9102026)
for _ in range(2400):
    rows, cols = rng.randrange(0, 8), rng.randrange(0, 9)
    logs = {}
    for j in range(cols):
        lo = rng.randrange(-40, 41) * (1 << rng.randrange(0, 130))
        logs[j, 0], logs[j, 1] = lo, lo + rng.randrange(0, 10)
    deps = {
        (i, j): rng.randrange(-15, 16) * (1 << rng.randrange(0, 70))
        for i in range(rows)
        for j in range(cols)
    }
    compare(deps, logs, rows, cols)

# Degenerate intervals, both orientations, overlapping remainders, and
# consecutive Fibonacci values exercising the bounded Euclidean loop.
a, b = 1, 1
for _ in range(3000):
    a, b = b, a + b
for lo, hi in [(0, 0), (-1, 1), (1, 1), (-1, -1), (a, a), (a, b)]:
    compare({(0, 0): 1, (1, 0): -1}, {(0, 0): lo, (0, 1): hi}, 2, 1)
writes = compare(
    {(0, 0): 1, (0, 1): 0, (1, 0): 0, (1, 1): 1},
    {(0, 0): a, (0, 1): a, (1, 0): b, (1, 1): b},
    2,
    2,
)
assert writes == 6 + 4 * 1024, writes


# Reuse the complete recovery fault suite with the real shared dependency
# helper, not a stub. Check both plain and torsion-probe source compositions.
def with_shared(node):
    fn, namespace = compile_function(node)
    namespace["_cubic_discover_dependency_unit"] = discover
    exec(data["torsion_helper"], namespace)
    return fn, namespace


fixture["helper_cases"].__globals__["compile_function"] = with_shared
fixture["helper_cases"](shared)
fixture["helper_cases"](ast.parse(data["probe_shared"]))
print(
    "2400 exact differential cases, write traces, bounded reduction, and recovery faults passed"
)
