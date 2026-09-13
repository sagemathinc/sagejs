"""Execute current and frozen one-shot AST with controlled exact-operation faults.

These doubles test failure classification, allocation ordering and lazy branches.
The companion native fixture supplies independent actual arithmetic.
"""

import ast
import copy
from pathlib import Path
import sys


class Stop(Exception):
    pass


class Matrix:
    def __init__(self, rows, columns):
        self.rows = rows
        self.columns = columns
        self.entries = {}

    def __getitem__(self, key):
        row, column = key
        assert 0 <= row < self.rows and 0 <= column < self.columns, key
        return self.entries.get(key, 0)

    def __setitem__(self, key, value):
        row, column = key
        assert 0 <= row < self.rows and 0 <= column < self.columns, key
        self.entries[key] = value


class TopLevelReturns(ast.NodeTransformer):
    def visit_Return(self, node):
        return ast.copy_location(
            ast.Raise(
                exc=ast.Call(
                    func=ast.Name(id="Stop", ctx=ast.Load()),
                    args=[node.value],
                    keywords=[],
                ),
                cause=None,
            ),
            node,
        )


def body_for(tree, name):
    entry = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == name
    )
    body = next(node for node in entry.body if isinstance(node, ast.With)).body
    if name == "compact_one_shot_reference":
        start = next(
            i
            for i, node in enumerate(body)
            if isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == "compact_tail_start"
        )
    else:
        start = next(
            i
            for i, node in enumerate(body)
            if any(
                isinstance(item, ast.Call)
                and isinstance(item.func, ast.Name)
                and item.func.id == "_cubic_compact_relation_plan"
                for item in ast.walk(node)
            )
        )
    end = next(
        i for i in range(start, len(body)) if ast.unparse(body[i]) == "output[59] = 434"
    )
    return copy.deepcopy(body[start : end + 1])


def compile_nodes(nodes):
    module = ast.Module(
        body=[
            ast.ImportFrom(
                module="__future__", names=[ast.alias(name="annotations")], level=0
            ),
            *nodes,
        ],
        type_ignores=[],
    )
    return compile(
        ast.fix_missing_locations(module), "<actual-compact-dependency-ast>", "exec"
    )


def execute(tree, snippet, mode="success", rows=4, cheap=False):
    events = []

    class Arena:
        def foreign_resource(self, constructor, r, c):
            events.append(("allocate", r, c))
            return Matrix(r, c)

    namespace = dict(
        Stop=Stop,
        arena=Arena(),
        fmpz_matrix=Matrix,
        relation_count=rows,
        factor_count=1,
        relation_rank=1,
        one_column=1,
        support_count=rows if cheap else 1,
        proof_unit_found=cheap,
        proof_regulator_lower=100 if cheap else 0,
        proof_regulator_upper=100 if cheap else 0,
        reuse_online_relation_support=True,
        class_number_upper=1,
        analytic_scale=1,
        coefficients=[],
        denominator=1,
        basis_zero_zero=1,
        basis_zero_one=0,
        basis_zero_two=0,
        basis_one_one=1,
        basis_one_two=0,
        basis_two_two=1,
        output=[0] * 64,
        _CUBIC_RELATION_REDUNDANCY_TAIL=6,
        _CUBIC_ANALYTIC_PRECISION=64,
        relation_matrix=Matrix(rows, 1),
        relation_elements=Matrix(rows, 3),
        relation_hnf=Matrix(rows, 1),
        proof_relation_support=Matrix(rows, 1),
        log_numerators=Matrix(2, 1),
        log_denominators=Matrix(2, 1),
        log_endpoints=Matrix(4, 1),
    )
    namespace["output"][63] = 43
    for row in range(rows):
        namespace["relation_matrix"][row, 0] = 1
        namespace["relation_elements"][row, 0] = row
        namespace["relation_hnf"][row, 0] = int(row == 0)
        namespace["proof_relation_support"][row, 0] = int(row == 0 or cheap)
    if mode == "copy-count":
        namespace["support_count"] += 1

    def hnf(out, source, *shape):
        events.append(("hnf",))
        if mode == "hnf-failure":
            return False
        for row in range(rows):
            out[row, 0] = int(row == 0)
            if mode == "rank-deficient":
                out[row, 0] = 0
            if mode == "online-mismatch":
                out[row, 0] = 2 * int(row == 0)
        return True

    def smith(out, source, *shape):
        events.append(("snf",))
        if mode == "snf-failure":
            return False
        for row in range(rows):
            out[row, 0] = int(row == 0)
        if mode == "index-mismatch":
            out[0, 0] = 2
        if mode == "invalid-invariant":
            out[0, 0] = 0
        return True

    def hnf_transform(out, transform, source, *shape):
        events.append(("hnf-transform",))
        if mode == "hnf-transform-failure":
            return False
        for row in range(rows):
            out[row, 0] = int(row == 0)
            for col in range(rows):
                transform[row, col] = int(row == col)
                if row > 0 and col == 0:
                    transform[row, col] = -1
        return True

    def lll(out, transform, source, *shape):
        events.append(("lll",))
        if mode == "lll-failure":
            return False
        for row in range(rows - 1):
            for col in range(rows):
                out[row, col] = source[row, col]
        return True

    def root_interval(coefficients, scale):
        events.append(("root",))
        return (1, 0) if mode == "root-interval" else (0, 1)

    def logs(*args):
        events.append(("log",))
        if mode == "log-interval":
            return (1, 0)
        coordinate = 0 if mode == "no-candidate" else args[-7]
        value = (100 + 100 * coordinate) * args[-2]
        return value, value

    namespace.update(
        fmpz_matrix_hnf_into=hnf,
        fmpz_matrix_hnf_prefix_into=hnf,
        fmpz_matrix_snf_into=smith,
        fmpz_matrix_snf_prefix_into=smith,
        fmpz_matrix_hnf_transform=hnf_transform,
        fmpz_matrix_hnf_transform_prefix=hnf_transform,
        fmpz_matrix_lll_transform=lll,
        fmpz_matrix_lll_transform_prefix=lll,
        _cubic_real_root_interval=root_interval,
        _cubic_real_log_bounds_from_root_interval=logs,
        _cubic_bounded_bit_length=lambda value, limit: (
            513 if mode == "coefficient-bound" else abs(value).bit_length()
        ),
    )
    helpers = [
        copy.deepcopy(node)
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name
        in {
            "_cubic_compact_relation_plan",
            "_cubic_prepare_compact_presentation",
            "_cubic_verify_compact_presentation_index",
            "_cubic_reduce_dependency_prefix",
            "_cubic_fill_dependency_logs",
            "_cubic_discover_dependency_unit",
            "_cubic_copy_relation_support_tail",
        }
    ]
    for node in helpers:
        node.decorator_list = []
    exec(compile_nodes(helpers), namespace)
    stopped = None
    try:
        nodes = [TopLevelReturns().visit(copy.deepcopy(node)) for node in snippet]
        exec(compile_nodes(nodes), namespace)
    except Stop as error:
        stopped = error.args[0]
    for row in range(rows):
        assert namespace["relation_matrix"][row, 0] == 1
        assert namespace["relation_elements"][row, 0] == row
    return namespace, events, stopped


production = ast.parse(Path(sys.argv[1]).read_text())
reference = ast.parse(Path(sys.argv[2]).read_text())
current = body_for(production, "certified_complex_cubic_class_group_v1")
golden = body_for(reference, "compact_one_shot_reference")

# Exercise actual bounded-tail planning/copy beyond the six-row tail, including
# support/tail overlap and repeated shrinking. These labels test ordering only.
helper_namespace, _, _ = execute(production, current)
source = Matrix(12, 3)
elements = Matrix(12, 5)
support = Matrix(12, 2)
target = Matrix(12, 3)
target_elements = Matrix(12, 5)
for rows in (4, 10, 4, 10):
    chosen = [0, 2] if rows == 4 else [0, 2, 6]
    for row in range(12):
        for column in range(3):
            source[row, column] = -991
            target[row, column] = -991
        for column in range(5):
            elements[row, column] = -991
            target_elements[row, column] = -991
        support[row, 0] = -991
    for row in range(rows):
        source[row, 0] = row
        source[row, 1] = row + 100
        support[row, 0] = 7 if row in chosen else 0
        for column in range(3):
            elements[row, column] = row * 10 + column
    tail, count = helper_namespace["_cubic_compact_relation_plan"](
        support, rows, len(chosen)
    )
    expected = chosen + [
        row for row in range(max(0, rows - 6), rows) if row not in chosen
    ]
    assert tail == max(0, rows - 6) and count == len(expected)
    copied = helper_namespace["_cubic_copy_relation_support_tail"](
        source, elements, support, rows, 2, tail, target, target_elements
    )
    assert copied == count
    for row, source_row in enumerate(expected):
        assert target[row, 0] == source_row
        assert target[row, 1] == source_row + 100
        for column in range(3):
            assert target_elements[row, column] == source_row * 10 + column
    for row in range(12):
        for column in range(3):
            if row >= count or column >= 2:
                assert target[row, column] == -991
        for column in range(5):
            if row >= count or column >= 3:
                assert target_elements[row, column] == -991

for rows in (1, 2, 4):
    for cheap in (False, True):
        for mode in ("success", "no-candidate"):
            actual, actual_events, actual_stop = execute(
                production, current, mode, rows, cheap
            )
            old, old_events, old_stop = execute(production, golden, mode, rows, cheap)
            assert actual_events == old_events, (
                rows,
                cheap,
                mode,
                actual_events,
                old_events,
            )
            assert actual_stop == old_stop
            for name in (
                "proof_unit_found",
                "proof_regulator_lower",
                "proof_regulator_upper",
                "compact_relation_count",
            ):
                assert actual[name] == old[name], (name, rows, cheap, mode)
            if actual_stop is None:
                for name in (
                    "dependency_log_scale",
                    "dependency_log_precision",
                    "dependency_coefficient_bits",
                    "dependency_count",
                ):
                    assert actual[name] == old[name], (name, rows, cheap, mode)
                assert (
                    actual["unit_combinations"].entries
                    == old["unit_combinations"].entries
                )
            if cheap:
                assert all(event[0] == "allocate" for event in actual_events), (
                    actual_events
                )
                assert [event[1:] for event in actual_events] == [
                    (rows, 1),
                    (rows, 1),
                    (rows, 3),
                    (1, 1),
                    (1, 1),
                    (1, 1),
                    (1, 1),
                    (1, 2),
                    (2, 1),
                ]

# Inconsistent presentation/failed arithmetic cannot request more relations.
for mode in (
    "copy-count",
    "hnf-failure",
    "rank-deficient",
    "online-mismatch",
    "snf-failure",
    "index-mismatch",
    "invalid-invariant",
    "hnf-transform-failure",
    "lll-failure",
    "coefficient-bound",
    "root-interval",
    "log-interval",
):
    actual, events, stopped = execute(production, current, mode)
    old, old_events, old_stop = execute(production, golden, mode)
    assert stopped is False and old_stop is False, (mode, stopped, old_stop)
    assert actual["output"][63] == 44, (mode, actual["output"])
    assert events == old_events, (mode, events, old_events)

# Zero dependency count alone keeps the established insufficiency gate.
missing, _, stopped = execute(production, current, rows=1)
assert stopped is False and missing["output"][63] == 43
no_candidate, _, stopped = execute(production, current, "no-candidate")
assert stopped is None and not no_candidate["proof_unit_found"]
assert no_candidate["output"][59] == 434  # Existing optional recovery must follow.

# Inspect the actual host gate rather than copying its allowed phases.
runtime = ast.parse(Path(sys.argv[3]).read_text())
gate = next(
    node.test
    for node in ast.walk(runtime)
    if isinstance(node, ast.If)
    and any(
        isinstance(item, ast.Name) and item.id == "failed_values"
        for item in ast.walk(node.test)
    )
)
retry_helper = next(
    node
    for node in runtime.body
    if isinstance(node, ast.FunctionDef) and node.name == "_retryable_native_decline"
)
gate_namespace = {"Any": object, "_CUBIC_OUTPUT_LENGTH": 64}
exec(
    compile(ast.Module(body=[retry_helper], type_ignores=[]), "<retry-helper>", "exec"),
    gate_namespace,
)
for phase, expected in ((43, False), (44, True)):
    failed_values = [0] * 64
    failed_values[63] = phase
    assert (
        eval(
            compile(ast.Expression(gate), "<actual-host-gate>", "eval"),
            {**gate_namespace, "failed_values": failed_values},
        )
        == expected
    )
print("compact-dependency-status-ok")
