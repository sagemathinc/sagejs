"""Fault-test actual analytic helpers and root allocation orchestration.

The interval arithmetic is checked against an independent rational oracle.
Injected root probes and logarithms test control flow, not numerical accuracy;
the companion native tests execute real Arb and exact unit-root arithmetic.
"""

import ast
from fractions import Fraction
import inspect
import itertools
import json
from pathlib import Path
import sys


source_path = Path(sys.argv[1])
module = ast.parse(source_path.read_text())
helpers = {
    "_cubic_analytic_index_bounds",
    "_cubic_classify_analytic_index",
    "_cubic_saturate_analytic_unit",
    "_cubic_publish_analytic_relation_presentation",
    "_cubic_publish_relation_factor_rows",
    "_cubic_publish_relation_rows",
    "_cubic_dyadic_ceiling_quotient",
}
namespace = {
    "_ROW_SCRATCH_OFFSET": 7880,
    "_POWER_OFFSET": 926,
    "_CUBIC_MAX_POWERS": 12,
    "_CUBIC_PROOF_ANALYTIC_GRH": 1,
}
for node in module.body:
    if isinstance(node, ast.FunctionDef) and node.name in helpers:
        node.decorator_list = []
        exec("from __future__ import annotations\n" + ast.unparse(node), namespace)


class Matrix:
    def __init__(self, values=None):
        self.values = values or {(12, 0): 100, (13, 0): 101, (16, 0): 100, (17, 0): 101}

    def __getitem__(self, key):
        return self.values.get(key, 0)

    def __setitem__(self, key, value):
        self.values[key] = value


index_bounds = namespace["_cubic_analytic_index_bounds"]
classify = namespace["_cubic_classify_analytic_index"]
count_bounds = 0
for disc, cls, reg, pi, zeta in itertools.product(
    ((1, 1), (2, 3), (101, 102)),
    ((0, 0), (3, 4)),
    ((-13, -12), (4, 7)),
    ((5, 6), (17, 17)),
    ((-5, -2), (10, 13)),
):
    endpoints = Matrix(
        {(12, 0): disc[0], (13, 0): disc[1], (16, 0): cls[0], (17, 0): cls[1]}
    )
    ready, lower, upper = index_bounds(endpoints, *reg, *pi, *zeta)
    exact_lower = cls[0] + reg[0] + pi[0] - Fraction(disc[1], 2) - zeta[1]
    exact_upper = cls[1] + reg[1] + pi[1] - Fraction(disc[0], 2) - zeta[0]
    assert ready
    assert lower == exact_lower.numerator // exact_lower.denominator
    assert upper == -(-exact_upper.numerator // exact_upper.denominator)
    count_bounds += 1
for pair, row in (((0, 2), 12), ((5, 4), 12), ((-1, 0), 16), ((8, 7), 16)):
    endpoint = Matrix()
    endpoint[row, 0], endpoint[row + 1, 0] = pair
    assert index_bounds(endpoint, 10, 11, 20, 21, 5, 6) == (False, 0, 0)
for values in ((11, 10, 20, 21, 5, 6), (10, 11, 21, 20, 5, 6), (10, 11, 20, 21, 6, 5)):
    assert index_bounds(Matrix(), *values) == (False, 0, 0)

classification_cases = (
    ((-2, 0, 6, 7), 1),
    ((0, 0, 6, 7), 1),
    ((-2, 5, 6, 7), 1),
    ((-2, 6, 6, 7), 0),
    ((0, 20, 6, 7), 0),
    ((7, 20, 6, 7), 0),
    ((-5, -1, 6, 7), -1),
    ((2, 1, 6, 7), -1),
    ((0, 1, 0, 1), -1),
    ((0, 1, 7, 6), -1),
    # This well-ordered interval excludes log of every positive integer.
    ((1, 5, 6, 7), -1),
)
for values, expected in classification_cases:
    assert classify(*values) == expected

saturate = namespace["_cubic_saturate_analytic_unit"]
base = {name: 0 for name in inspect.signature(saturate).parameters}
base.update(
    workspace=[0] * 8192,
    coefficients=[-1, -1, 0, 1],
    dependency_coordinates=Matrix(),
    log_numerators=Matrix(),
    log_denominators=Matrix(),
    log_endpoints=Matrix(),
    analytic_endpoints=Matrix(),
    output=[0] * 64,
    denominator=1,
    basis_zero_zero=1,
    basis_one_one=1,
    basis_two_two=1,
    identity_zero=1,
    proof_unit_zero=11,
    proof_unit_one=12,
    proof_unit_two=13,
    proof_regulator_lower=100000000,
    proof_regulator_upper=100000010,
    analytic_scale=1,
    analytic_precision=64,
    zeta_lower=330,
    zeta_upper=334,
)


def install_faults(root_statuses=(0, 0, 0), bad_log=None, overlap=None):
    calls = []
    regulator = [base["proof_regulator_lower"], base["proof_regulator_upper"]]
    namespace["_cubic_log_interval_bounds"] = lambda *args: (
        (100, 101) if bad_log != "reg" else (2, 1)
    )
    namespace["_cubic_log_two_pi_bounds"] = lambda *args: (
        (200, 201) if bad_log != "pi" else (2, 1)
    )
    namespace["_cubic_arb_log_positive_rational_bounds"] = lambda *args: (
        (6, 7) if bad_log != "two" else (7, 6)
    )

    def root(prime, status):
        def run(*args):
            calls.append(prime)
            return status, 20 + prime, 30 + prime, 40 + prime

        return run

    for prime, kind, status in zip(
        (2, 3, 5), ("square", "cube", "fifth"), root_statuses
    ):
        namespace[f"_cubic_exact_unit_{kind}_root"] = root(prime, status)

    def new_regulator(*args):
        prime = calls[-1]
        if overlap is not None:
            return overlap
        regulator[:] = (regulator[0] // prime, (regulator[1] + prime - 1) // prime)
        return tuple(regulator)

    namespace["_cubic_regulator_bounds"] = new_regulator
    return calls


calls = install_faults()
result = saturate(**base)
assert result[0] and calls == [2, 3, 5]
assert result[1:6] == (11, 12, 13, 100000000, 100000010)
assert classify(*result[10:14]) == 0
for statuses, order in (((1, 0, 0), [2]), ((0, 1, 0), [2, 3]), ((0, 0, 1), [2, 3, 5])):
    calls = install_faults(statuses)
    result = saturate(**base)
    assert result[0] and calls == order * 8
for statuses in ((-1, 0, 0), (0, -1, 0), (0, 0, -1), (2, 0, 0)):
    calls = install_faults(statuses)
    assert not saturate(**base)[0]
    assert len(calls) <= 3
for bad_log in ("reg", "pi", "two"):
    calls = install_faults(bad_log=bad_log)
    assert not saturate(**base)[0] and calls == []
for overlap in ((0, 1), (2, 1), (1, 2), (100000020, 100000030)):
    calls = install_faults((1, 0, 0), overlap=overlap)
    assert not saturate(**base)[0] and calls == [2]
for override in ({"analytic_scale": 0}, {"analytic_scale": -1}, {"zeta_lower": 400}):
    calls = install_faults()
    assert not saturate(**(base | override))[0] and calls == []

# Extract only the real root's analytic suffix. All new mathematical helpers
# above remain real; only BF/log/root inputs are controlled fault injections.
entry = next(
    node
    for node in module.body
    if isinstance(node, ast.FunctionDef)
    and node.name == "certified_complex_cubic_class_group_v1"
)
arena = next(node for node in entry.body if isinstance(node, ast.With))
start = next(
    i for i, node in enumerate(arena.body) if ast.unparse(node) == "output[63] = 5"
)
suffix = arena.body[start:]
names = sorted(
    {
        node.id
        for statement in suffix
        for node in ast.walk(statement)
        if isinstance(node, ast.Name)
    }
)
function = ast.FunctionDef(
    name="actual_root_suffix",
    args=ast.arguments(
        posonlyargs=[],
        args=[ast.arg(arg=name) for name in names],
        kwonlyargs=[],
        kw_defaults=[],
        defaults=[],
    ),
    body=suffix,
    decorator_list=[],
)
exec(
    compile(
        ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])),
        str(source_path),
        "exec",
    ),
    namespace,
)
root_suffix = namespace["actual_root_suffix"]


def run_suffix(
    *,
    initial_wide=False,
    refined_wide=False,
    initial_plan=True,
    refined_plan=True,
    initial_eval=True,
    refined_eval=True,
    reversed_zeta=False,
    refined_contradiction=False,
    publication_failure=False,
):
    state = {name: namespace.get(name, 0) for name in names}
    state.update(base)
    state.update(
        output=[-911] * 64,
        one_column=1,
        invariant_count=1,
        class_number_upper=3,
        factor_count=2,
        group_count=1,
        proof_relation_count=3,
        relation_rank=2,
        transcript_mode=1 if publication_failure else 0,
        _CUBIC_ANALYTIC_THRESHOLD=997,
        _CUBIC_ANALYTIC_REFINED_THRESHOLD=1494,
        _CUBIC_ANALYTIC_PRECISION=64,
        uint64=int,
        transcript_factor_rows=[0],
        transcript_relation_rows=[0],
        transcript_relation_elements=[0],
    )
    state["workspace"][7880] = 3
    calls = install_faults()
    events = []

    class Arena:
        def foreign_resource(self, constructor, rows, columns):
            events.append(("allocate", rows, columns))
            return Matrix()

    def plan(*args):
        threshold = args[-1]
        events.append(("plan", threshold))
        refined = threshold == 1494
        return (refined_plan if refined else initial_plan), 7, (9 if refined else 5)

    def evaluate(*args):
        refined = args[4] == 9
        events.append(("evaluate", args[4]))
        wide = refined_wide if refined else initial_wide
        lower, upper = (330, 334) if wide else (350, 354)
        if refined and refined_contradiction:
            lower, upper = 348, 348
        if reversed_zeta:
            lower, upper = upper, lower
        return (refined_eval if refined else initial_eval), lower, upper, 2

    state.update(
        arena=Arena(), _cubic_prepare_bf_plan=plan, _cubic_evaluate_bf_plan=evaluate
    )
    result = root_suffix(**{name: state[name] for name in names})
    return result, events, state["output"], calls


result, events, output, calls = run_suffix()
assert result and output[0] == 2 and calls == []
assert events == [
    ("plan", 997),
    ("allocate", 5, 1),
    ("allocate", 20, 1),
    ("evaluate", 5),
]
result, events, output, calls = run_suffix(initial_wide=True)
assert result and output[36] == 1494 and calls == [2, 3, 5]
assert events[-4:] == [
    ("plan", 1494),
    ("allocate", 9, 1),
    ("allocate", 36, 1),
    ("evaluate", 9),
]
for options in (
    {"initial_plan": False},
    {"initial_eval": False},
    {"reversed_zeta": True},
    {"initial_wide": True, "refined_plan": False},
    {"initial_wide": True, "refined_eval": False},
    {"initial_wide": True, "refined_wide": True},
):
    result, events, output, calls = run_suffix(**options)
    assert not result and output[0] != 2
    if options.get("initial_plan") is False:
        assert events == [("plan", 997)]
    if options.get("refined_plan") is False:
        assert sum(event[0] == "allocate" for event in events) == 2

result, _, output, _ = run_suffix(initial_wide=True, refined_contradiction=True)
assert not result and output[63] == 44 and output[44] > 0 and output[45] < output[48]
result, _, output, _ = run_suffix(publication_failure=True)
assert not result and output[63] == 44 and output[0] != 2

# Evaluate the current host effort gate: wide valid intervals may be retried;
# mathematical contradiction or failed publication cannot authorize a retry.
runtime = ast.parse(
    source_path.with_name("cubic_class_number_native_runtime.py").read_text()
)
gate = next(
    node.test
    for node in ast.walk(runtime)
    if isinstance(node, ast.If)
    and isinstance(node.test, ast.Compare)
    and any(
        isinstance(item, ast.Name) and item.id == "failed_values"
        for item in ast.walk(node.test)
    )
)
for phase, must_break in ((8, False), (44, True)):
    values = [0] * 64
    values[63] = phase
    assert (
        eval(
            compile(ast.Expression(gate), "<actual-host-gate>", "eval"),
            {"failed_values": values},
        )
        == must_break
    )

# A scalar publication failure must not expose an accepted marker before the
# failing write. Model three different output-buffer failure positions.
publish = namespace["_cubic_publish_analytic_relation_presentation"]
publication = {name: 0 for name in inspect.signature(publish).parameters}
publication.update(base)
publication.update(
    compact_relation_matrix=Matrix(),
    compact_relation_elements=Matrix(),
    transcript_factor_rows=[],
    transcript_relation_rows=[],
    transcript_relation_elements=[],
    class_number_upper=3,
    invariant_count=1,
    analytic_precision=64,
    tail_upper=1,
    index_log_lower=-2,
    index_log_upper=3,
    log_two_lower=6,
    log_two_upper=7,
)
publication["workspace"][7880] = 3


class FailingOutput(list):
    def __init__(self, failure_index):
        super().__init__([-911] * 64)
        self.failure_index = failure_index

    def __setitem__(self, index, value):
        if index == self.failure_index and value != 0:
            raise OverflowError("injected packed scalar capacity")
        super().__setitem__(index, value)


for failure_index in (3, 25, 47):
    result = FailingOutput(failure_index)
    publication["output"] = result
    try:
        publish(
            **{
                name: publication[name]
                for name in inspect.signature(publish).parameters
            }
        )
        assert False, "fault injection did not execute"
    except OverflowError:
        assert result[0] != 2

print(
    json.dumps(
        {
            "interval_oracles": count_bounds,
            "classifier_cases": len(classification_cases),
            "lazy_root_cases": 10,
            "publication_faults": 3,
        }
    )
)
