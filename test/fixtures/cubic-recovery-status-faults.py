"""Fault-inject the actual recovery/helper and caller AST, not an alternate proof.

The arithmetic results here are deliberately synthetic control-flow inputs.
The separate native witness executes actual exact arithmetic on genuine rows.
"""

import ast
import inspect
from pathlib import Path
import sys


class Matrix:
    def __init__(self):
        self.entries = {}

    def __getitem__(self, key):
        return self.entries.get(key, -991)

    def __setitem__(self, key, value):
        self.entries[key] = value


def compile_function(node):
    namespace = {}
    module = ast.Module(
        body=[
            ast.ImportFrom(
                module="__future__", names=[ast.alias(name="annotations")], level=0
            ),
            node,
        ],
        type_ignores=[],
    )
    exec(
        compile(ast.fix_missing_locations(module), "<actual-source-ast>", "exec"),
        namespace,
    )
    return namespace[node.name], namespace


def helper_cases(tree):
    node = next(
        item
        for item in tree.body
        if isinstance(item, ast.FunctionDef)
        and item.name == "_cubic_relation_prefix_has_archimedean_unit"
    )
    function, namespace = compile_function(node)
    parameters = inspect.signature(function).parameters

    def run(mode, expected, rows=2, factors=1, bounds=(100, 100), reconstruction=1):
        calls = []
        args = {name: Matrix() for name in parameters}
        args.update(
            relation_count=rows,
            factor_count=factors,
            denominator=1,
            basis_zero_zero=1,
            basis_zero_one=0,
            basis_zero_two=0,
            basis_one_one=1,
            basis_one_two=0,
            basis_two_two=1,
            analytic_scale=1,
            analytic_precision=0,
        )
        for row in range(rows):
            for column in range(factors):
                args["relation_candidates"][row, column] = int(column == 0)
            for column in range(3):
                args["relation_elements"][row, column] = row if column == 0 else 0
        before_result = dict(args["prefix_unit_result"].entries)

        def hnf(output, transform, source, active_rows, active_columns):
            calls.append("hnf")
            assert (active_rows, active_columns) == (rows, factors)
            if mode == "hnf-failure":
                return False
            for row in range(rows):
                for column in range(factors):
                    nonzero = row == 0
                    if mode == "impossible-rank":
                        nonzero = True
                    elif mode == "unordered-hnf":
                        nonzero = row == 1
                    output[row, column] = int(nonzero and column == 0)
                for column in range(rows):
                    transform[row, column] = int(row == column)
            if rows > 1:
                transform[1, 0] = -1
            return True

        def lll(output, transform, source, active_rows, active_columns):
            calls.append("lll")
            assert (active_rows, active_columns) == (rows - factors, rows)
            if mode == "lll-failure":
                return False
            for row in range(active_rows):
                for column in range(active_columns):
                    output[row, column] = -1 if column == 0 else 1
            return True

        def real_log(*values):
            calls.append("log")
            if mode == "invalid-log":
                return (1, 0)
            scale = values[-2]
            coordinate = 0 if mode == "no-candidate" else values[-5]
            value = (100 + 100 * coordinate) * scale
            return (value, value)

        def reconstruct(*values):
            calls.append("reconstruct")
            return (reconstruction, 7, 8, 9)

        def regulator(*values):
            calls.append("regulator")
            return bounds

        namespace.update(
            fmpz_matrix_hnf_transform_prefix=hnf,
            fmpz_matrix_lll_transform_prefix=lll,
            _cubic_bounded_bit_length=lambda *_: 513 if mode == "exponent-bound" else 1,
            _cubic_real_log_bounds=real_log,
            _cubic_reconstruct_archimedean_unit=reconstruct,
            _cubic_regulator_bounds=regulator,
        )
        actual = function(**args)
        assert actual == expected, (mode, actual, expected, calls)
        if expected == 1:
            assert [args["prefix_unit_result"][0, i] for i in range(5)] == [
                7,
                8,
                9,
                *bounds,
            ]
        else:
            assert args["prefix_unit_result"].entries == before_result, (mode, calls)
        if mode == "no-candidate":
            assert "reconstruct" not in calls and "regulator" not in calls
        if expected == -2:
            assert "reconstruct" in calls and "regulator" not in calls
        if expected == -3:
            assert calls[-2:] == ["reconstruct", "regulator"]
        if expected == 2 or (rows == factors and expected == 0):
            assert "lll" not in calls
        return calls

    run("success", 1)
    run("no-candidate", 0)
    run("full-rank-without-dependencies", 0, rows=1)
    assert run("too-few-rows", 2, rows=1, factors=2) == []
    run("rank-deficient", 2, factors=2)
    for mode in (
        "impossible-rank",
        "unordered-hnf",
        "hnf-failure",
        "lll-failure",
        "invalid-log",
        "exponent-bound",
    ):
        run(mode, -1)
    for code in (0, 2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19):
        run("unavailable-reconstruction", -2, reconstruction=code)
    for bounds in ((0, 0), (0, 100), (-1, 100), (101, 100), (90, 99), (101, 110)):
        run("bad-regulator", -3, bounds=bounds)
    for bounds in ((99, 100), (100, 101), (99, 101)):
        run("success", 1, bounds=bounds)


def caller_cases(tree, runtime_tree):
    entry = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "certified_complex_cubic_class_group_v1"
    )
    arena = next(node for node in entry.body if isinstance(node, ast.With))
    recovery = next(
        node
        for node in arena.body
        if isinstance(node, ast.If)
        and any(
            isinstance(item, ast.Call)
            and isinstance(item.func, ast.Name)
            and item.func.id == "_cubic_relation_prefix_has_archimedean_unit"
            for item in ast.walk(node)
        )
    )
    guard_index = next(
        index
        for index, node in enumerate(recovery.body)
        if isinstance(node, ast.If)
        and any(
            isinstance(item, ast.Name) and item.id == "prefix_unit_status"
            for item in ast.walk(node.test)
        )
    )
    caller_index = arena.body.index(recovery)
    statements = (
        recovery.body[guard_index:] + arena.body[caller_index + 1 : caller_index + 3]
    )
    names = sorted(
        {
            item.id
            for node in statements
            for item in ast.walk(node)
            if isinstance(item, ast.Name)
        }
    )
    function = ast.FunctionDef(
        name="actual_caller_gate",
        args=ast.arguments(
            posonlyargs=[],
            args=[ast.arg(arg=name) for name in names],
            kwonlyargs=[],
            kw_defaults=[],
            defaults=[],
        ),
        body=statements
        + [
            ast.Return(
                value=ast.Tuple(
                    elts=[ast.Constant(True)]
                    + [
                        ast.Name(name, ast.Load())
                        for name in (
                            "proof_unit_zero",
                            "proof_unit_one",
                            "proof_unit_two",
                        )
                    ],
                    ctx=ast.Load(),
                )
            )
        ],
        decorator_list=[],
    )
    caller, _ = compile_function(function)
    retry_gates = [
        node.test
        for node in ast.walk(runtime_tree)
        if isinstance(node, ast.If)
        and any(
            isinstance(item, ast.Name) and item.id == "failed_values"
            for item in ast.walk(node.test)
        )
    ]
    assert len(retry_gates) == 1
    host_break = compile(ast.Expression(retry_gates[0]), "<actual-host-gate>", "eval")
    retry_node = next(
        node
        for node in runtime_tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_retryable_native_decline"
    )
    retry, retry_namespace = compile_function(retry_node)
    retry_namespace["_CUBIC_OUTPUT_LENGTH"] = 64
    for status in (1, 0, 2, -1, -2, -3, 99):
        output = [-991] * 64
        result = Matrix()
        for i, value in enumerate((7, 8, 9, 100, 101)):
            result[0, i] = value
        args = {name: 0 for name in names}
        args.update(
            prefix_unit_status=status,
            prefix_unit_result=result,
            output=output,
            proof_unit_found=False,
            proof_unit_zero=1,
        )
        actual = caller(**args)
        if status == 1:
            assert actual == (True, 7, 8, 9)
            assert output[61] == 1
        else:
            assert actual is False
            assert output[61] == -991
            assert output[63] == (43 if status == 0 else 44), output
            if status != 0:
                assert output[62] == status
            assert eval(
                host_break,
                {
                    "failed_values": output,
                    "int": int,
                    "_retryable_native_decline": retry,
                },
            ) is (status != 0)


def main():
    tree = ast.parse(Path(sys.argv[1]).read_text())
    runtime_tree = ast.parse(Path(sys.argv[2]).read_text())
    helper_cases(tree)
    caller_cases(tree, runtime_tree)
    print("recovery-status-contract-ok")


if __name__ == "__main__":
    main()
