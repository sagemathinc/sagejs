"""Execute the actual cubic proof suffix with synthetic helper contract faults.

This is a control-flow regression, not a claim that a real field produces the
injected data. The selected source statements are executed without rewriting
their body. Mathematical helpers and the pre-suffix state are deliberately
synthetic, with a downstream analytic enclosure that permits publication. Thus
an earlier authentication failure cannot hide behind an unrelated later check.
No native compiler, foreign library, or kernel cache is used.
"""

import ast
import json
from pathlib import Path
import sys


def extract_suffix(path):
    tree = ast.parse(path.read_text())
    entry = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "certified_complex_cubic_class_group_v1"
    )
    arena = next(node for node in entry.body if isinstance(node, ast.With))
    starts = [
        index
        for index, node in enumerate(arena.body)
        if isinstance(node, ast.If)
        and isinstance(node.test, ast.Name)
        and node.test.id == "dependency_scan_active"
        and any(
            isinstance(child, ast.Call)
            and isinstance(child.func, ast.Name)
            and child.func.id == "_cubic_materialize_dependency_unit"
            for child in ast.walk(node)
        )
    ]
    assert len(starts) == 1, "the reconstruction suffix must be unique"
    suffix = arena.body[starts[0] :]
    helper_names = {
        "_cubic_materialize_dependency_unit",
        "_cubic_analytic_index_bounds",
        "_cubic_classify_analytic_index",
        "_cubic_saturate_analytic_unit",
        "_cubic_publish_analytic_relation_presentation",
    }
    helpers = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in helper_names
    ]
    assert len(helpers) == len(helper_names)
    for helper in helpers:
        helper.decorator_list = []
        helper.returns = None
        for argument in helper.args.args:
            argument.annotation = None
    assert isinstance(suffix[-1], ast.Return)
    assert isinstance(suffix[-1].value, ast.Call)
    assert suffix[-1].value.func.id == "_cubic_publish_analytic_relation_presentation"
    names = sorted(
        {
            node.id
            for statement in [
                *suffix,
                *(statement for helper in helpers for statement in helper.body),
            ]
            for node in ast.walk(statement)
            if isinstance(node, ast.Name) and node.id not in helper_names
        }
    )
    function = ast.FunctionDef(
        name="extracted_suffix",
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
    namespace = {}
    exec(
        compile(
            ast.fix_missing_locations(
                ast.Module(body=[*helpers, function], type_ignores=[])
            ),
            str(path),
            "exec",
        ),
        namespace,
    )
    return namespace["extracted_suffix"], names


class Endpoints:
    def __getitem__(self, key):
        return {(12, 0): 100, (13, 0): 101, (16, 0): 100, (17, 0): 101}.get(key, 0)


class Arena:
    def foreign_resource(self, *args):
        return Endpoints()


def run_case(function, names, bounds, accepted, analytic_ready=True):
    calls = []

    def result(name, value):
        def stub(*args):
            calls.append(name)
            return value

        return stub

    def forbidden(*args):
        raise AssertionError("unexpected fallback, saturation, or other helper call")

    state = {name: forbidden if name.startswith("_cubic_") else 0 for name in names}
    output = [-991] * 64
    workspace = [0] * 8000
    workspace[7880] = 3
    state.update(
        dependency_scan_active=True,
        dependency_log_scale=10,
        analytic_scale=1,
        proof_regulator_lower=100,
        proof_regulator_upper=110,
        proof_unit_zero=1,
        proof_unit_one=0,
        proof_unit_two=0,
        identity_zero=1,
        identity_one=0,
        identity_two=0,
        denominator=1,
        factor_count=3,
        proof_relation_count=6,
        relation_rank=3,
        invariant_count=1,
        class_number_upper=3,
        output=output,
        workspace=workspace,
        arena=Arena(),
        one_column=1,
        uint64=int,
        len=len,
        order_discriminant=-12716,
        equation_discriminant=-114444,
        equation_order_index=3,
        _ROW_SCRATCH_OFFSET=7880,
        _CUBIC_ANALYTIC_PRECISION=64,
        _CUBIC_ANALYTIC_THRESHOLD=997,
        _CUBIC_ANALYTIC_REFINED_THRESHOLD=1494,
        _CUBIC_PROOF_ANALYTIC_GRH=1,
        _cubic_reconstruct_archimedean_unit=result("reconstruct", (1, 7, 8, 9)),
        _cubic_regulator_bounds=result("authenticate", bounds),
        _cubic_prepare_bf_plan=result("bf_plan", (analytic_ready, 1, 5)),
        _cubic_evaluate_bf_plan=result("bf_enclosure", (True, 350, 352, 1)),
        _cubic_log_interval_bounds=result("regulator_log", (100, 101)),
        _cubic_log_two_pi_bounds=result("two_pi_log", (200, 201)),
        _cubic_arb_log_positive_rational_bounds=result("log_two", (69, 70)),
        _cubic_dyadic_ceiling_quotient=lambda x, y: (x + y - 1) // y,
    )
    if not analytic_ready:
        state.update(
            transcript_mode=1,
            _cubic_publish_relation_factor_rows=result("publish_factors", True),
            _cubic_publish_relation_rows=result("publish_rows", True),
        )
    # The extracted caller and borrowed helper execute their actual bodies.
    # Only the external mathematical operations are the explicit test doubles.
    function.__globals__.update({name: state[name] for name in names})
    actual = function(**{name: state[name] for name in names})
    assert actual is accepted, (bounds, actual, output[25:28], calls)
    if not analytic_ready:
        assert output[0] == -991 and output[25:28] == [-991] * 3, output
        assert calls == ["reconstruct", "authenticate", "bf_plan"], calls
    elif accepted:
        assert output[25:28] == [7, 8, 9], output
        assert output[40:42] == list(bounds), output
        assert output[35] == 1 and output[44:46] == [-3, 3], output
        assert calls == [
            "reconstruct",
            "authenticate",
            "bf_plan",
            "bf_enclosure",
            "regulator_log",
            "two_pi_log",
            "log_two",
        ], calls
    else:
        assert output[59] == 44, output
        assert output[0] == -991 and output[25:28] == [-991] * 3, output
        assert calls == ["reconstruct", "authenticate"], calls


def main():
    path = Path(sys.argv[1])
    function, names = extract_suffix(path)
    # Equality at either overlap endpoint is intentionally valid.
    valid = [(10, 11), (9, 12), (9, 10), (11, 12), (10, 10)]
    invalid = [(12, 11), (20, 21), (8, 9), (0, 0), (0, 11), (-1, 11), (-2, -1)]
    for bounds in valid:
        run_case(function, names, bounds, True)
    for bounds in invalid:
        run_case(function, names, bounds, False)
    run_case(function, names, (10, 11), False, analytic_ready=False)
    print(
        json.dumps(
            {
                "accepted": len(valid),
                "rejected_before_publication": len(invalid),
                "analytic_failure_before_publication": 1,
            }
        )
    )


if __name__ == "__main__":
    main()
