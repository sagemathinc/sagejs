"""Differentially execute the actual group loops with exact modeled valuations.

This checks scan equivalence and side-effect order, not ideal arithmetic.
Full native ledger comparisons separately exercise real ideal arithmetic.
"""

import ast
import copy
import hashlib
import importlib.util
import sys
import json
import random
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).parent
BASE = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else ROOT.parents[1] / "src/lib/sagejs/number_fields/cubic_class_number_native.py"
)
spec = importlib.util.spec_from_file_location(
    "ablation", ROOT / "cubic-factor-scan-ablation.py"
)
ablation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ablation)
source = BASE.read_text()
uses_cached_powers = "_cubic_cached_ideal_power" in source
candidate = ablation.ranges(source)
word_indices = ablation.indices(source)
for transform, transformed in [
    (ablation.ranges, candidate),
    (ablation.indices, word_indices),
]:
    try:
        transform(transformed)
    except ValueError:
        pass
    else:
        raise AssertionError("accepted an already transformed source")
    try:
        transform(
            source + "\n" + ast.get_source_segment(source, ablation.target(source)[1])
        )
    except ValueError:
        pass
    else:
        raise AssertionError("accepted duplicate helper")
# A Unicode prefix must not corrupt AST byte-column addressing.
assert ablation.indices("# π\n" + source) == "# π\n" + word_indices

NAME = "_cubic_append_smooth_principal_relation"


def checked_uint64(value):
    if not 0 <= value < 2**64:
        raise OverflowError(value)
    return value


def extract(source):
    tree = ast.parse(source)
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == NAME)
    loops = [
        n
        for n in fn.body
        if isinstance(n, ast.While)
        and ast.unparse(n.test) == "valid_relation and group_index < group_count"
    ]
    assert len(loops) == 1
    loop = copy.deepcopy(loops[0])
    wrapper = ast.parse("def run():\n    pass\n").body[0]
    wrapper.body = (
        ast.parse("valid_relation = True\ngroup_index = 0\n").body
        + [loop]
        + ast.parse("return valid_relation\n").body
    )
    return compile(
        ast.fix_missing_locations(ast.Module(body=[wrapper], type_ignores=[])),
        "actual-group-loop",
        "exec",
    )


class Workspace(list):
    def __init__(self, values):
        super().__init__(values)
        self.reads = 0

    def __getitem__(self, index):
        self.reads += 1
        return super().__getitem__(index)


old, new = extract(source), extract(candidate)
rng = random.Random(921643)
cases = 2500
read_totals = [0, 0]
accepted = 0
max_groups = 0
for case in range(cases):
    groups = rng.randint(1, 35)
    max_groups = max(max_groups, groups)
    sizes = [rng.randint(1, 3) for _ in range(groups)]
    n = sum(sizes)
    layout = SimpleNamespace(
        group=10 * n, row=10 * n + 4 * groups, power=10 * n + 4 * groups + n
    )
    initial = [0] * (layout.power + 1)
    valuations = []
    start = 0
    for group, count in enumerate(sizes):
        # Include absent primes, mixed splitting, auxiliary residual valuation,
        # insufficient stored powers, and excessive/invalid rational valuations.
        auxiliary = count == 2 and rng.randrange(2) == 1
        weighted = 0
        for j in range(count):
            index = start + j
            degree = 2 if auxiliary and j == 1 else 1
            value = rng.randrange(5) if case % 4 else 0
            valuations.append(value)
            weighted += degree * value
            initial[10 * index : 10 * index + 10] = [
                2 + group,
                1,
                degree,
                0,
                0,
                0,
                1,
                group,
                int(auxiliary and j == 1),
                0,
            ]
        rational = weighted if case % 3 else rng.randrange(22)
        initial[layout.group + 4 * group : layout.group + 4 * group + 4] = [
            2 + group,
            start,
            count,
            rational,
        ]
        start += count

    def execute(code, data):
        workspace = Workspace(data)
        calls = []

        def cached(layout, ws, index, power, hnf_source, hnf_result):
            calls.append(("power", index, power))
            return (index + 1) * 100 + power

        def contains(ws, address, a, b, c):
            if uses_cached_powers:
                index, power = divmod(address, 100)
                index -= 1
            else:
                index, offset = divmod(address - layout.power, 16 * 9)
                power = offset // 9 + 1
            calls.append(("contains", index, power))
            return power <= valuations[index]

        def product(ws, left, right, destination, hnf_source, hnf_result):
            calls.append(("product", left, right, destination))
            return True

        env = dict(
            layout=layout,
            workspace=workspace,
            factor_count=n,
            group_count=groups,
            relation_capacity=512,
            uint64=int,
            checked_uint64=checked_uint64,
            _GROUP_STRIDE=4,
            _FACTOR_STRIDE=10,
            _FACTOR_OFFSET=0,
            _GROUP_OFFSET=layout.group,
            _ROW_SCRATCH_OFFSET=layout.row,
            _POWER_OFFSET=layout.power,
            _CUBIC_MAX_POWERS=16,
            _cubic_cached_ideal_power=cached,
            _cubic_lattice_contains=contains,
            _cubic_ideal_product=product,
            coordinate_zero=1,
            coordinate_one=2,
            coordinate_two=3,
            hnf_source=None,
            hnf_result=None,
        )
        exec(code, env)
        result = env["run"]()
        return result, list(workspace), calls, workspace.reads

    before, after = execute(old, initial), execute(new, initial)
    assert before[:3] == after[:3], case
    accepted += before[0] is True
    read_totals[0] += before[3]
    read_totals[1] += after[3]
    if case < 50:
        for start_bad, count_bad in [(-1, 1), (0, -1), (n, 1), (2**64, 1), (0, 2**64)]:
            broken = initial.copy()
            broken[layout.group + 1 : layout.group + 3] = [start_bad, count_bad]
            failed = execute(new, broken)
            assert failed[0] == 513 and not failed[2]

record = dict(
    cases=cases,
    accepted=accepted,
    rejected=cases - accepted,
    invalid_range_cases=250,
    max_groups=max_groups,
    workspace_reads=dict(baseline=read_totals[0], candidate=read_totals[1]),
    baseline_sha256=hashlib.sha256(BASE.read_bytes()).hexdigest(),
    candidate_sha256=hashlib.sha256(candidate.encode()).hexdigest(),
    scope="Actual group loop, identical full workspace mutations and cached-power/membership call sequence under the contiguous-group invariant; ideal arithmetic modeled, not proved by this test.",
)
print(json.dumps(record))
