"""Execute the production staged control flow with adversarial phase doubles."""

import ast
import copy
import sys


source = ast.parse(open(sys.argv[1]).read())
root = next(
    node
    for node in source.body
    if isinstance(node, ast.FunctionDef)
    and node.name == "certified_complex_cubic_class_group_v1"
)
branch = next(
    node
    for node in ast.walk(root)
    if isinstance(node, ast.If)
    and isinstance(node.test, ast.Name)
    and node.test.id == "staged_certification"
    and any(isinstance(child, ast.While) for child in node.body)
)
loop = next(node for node in branch.body if isinstance(node, ast.While))
assert not any(
    isinstance(node, ast.Call)
    and isinstance(node.func, ast.Attribute)
    and node.func.attr == "foreign_resource"
    for node in ast.walk(loop)
)
helper = next(
    node
    for node in source.body
    if isinstance(node, ast.FunctionDef)
    and node.name == "_cubic_try_bounded_exact_closure"
)
collector = next(
    node
    for node in source.body
    if isinstance(node, ast.FunctionDef)
    and node.name == "_cubic_collect_adjacent_relation_prefix"
)
expanded_collector = next(
    node
    for node in source.body
    if isinstance(node, ast.FunctionDef)
    and node.name == "_cubic_collect_expanded_shell_prefix"
)
assert not helper.decorator_list
assert not any(
    isinstance(node, ast.Call)
    and isinstance(node.func, ast.Attribute)
    and node.func.attr == "foreign_resource"
    for node in ast.walk(helper)
)


class Scratch:
    def __init__(self, rows, columns):
        self.rows = rows
        self.columns = columns


class Arena:
    def __init__(self):
        self.owners = []

    def foreign_resource(self, constructor, rows, columns):
        owner = Scratch(rows, columns)
        self.owners.append(owner)
        return owner


class ProofBundle:
    """Scheduler double; real bundle type/lifetime rules have compiler tests."""

    def __init__(self, *members):
        self.members = members


function = ast.FunctionDef(
    name="schedule",
    args=ast.arguments(
        posonlyargs=[],
        args=[ast.arg(arg="initial")],
        kwonlyargs=[],
        kw_defaults=[],
        defaults=[],
    ),
    body=copy.deepcopy(branch.body),
    decorator_list=[],
)
assigned = sorted(
    {
        n.id
        for n in ast.walk(branch)
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)
    }
)
function.body = (
    ast.parse("\n".join(f"{name} = initial.get({name!r}, 0)" for name in assigned)).body
    + function.body
)
program = compile(
    ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])),
    "<actual-cubic-stage-driver>",
    "exec",
)


def scenario(
    statuses,
    growth=2,
    online_failure=False,
    rank_status=1,
    quotient=3,
    factors=8,
    phase=8,
    reason=0,
    expanded_growth=None,
    storage=38,
):
    names = {
        n.id for n in ast.walk(branch) if isinstance(n, ast.Name) and n.id != "True"
    }
    namespace = dict.fromkeys(names, 0)
    namespace.update(
        uint64=int,
        fmpz_matrix=object(),
        factor_count=factors,
        relation_count=14,
        online_relation_count=14,
        online_relation_status=1,
        presentation_storage_rows=storage,
        class_number_upper=3,
        relation_rank=factors,
        reuse_online_relation_hnf=True,
        output=[0] * 64,
        arena=Arena(),
        CubicProofWorkspace=ProofBundle,
    )
    events = []
    seen_owners = []
    pending = iter(statuses)
    invariant_current = True
    current_count = 14
    expansion_widths = []
    expanded_owners = []

    def proof(*values):
        args = dict(zip((arg.arg for arg in helper.args.args), values))
        assert invariant_current, "resumption must not publish stale Smith invariants"
        assert args["relation_count"] == current_count
        bundle = args["proof"]
        assert isinstance(bundle, ProofBundle)
        owners = (id(bundle),) + tuple(
            id(v) for v in bundle.members if isinstance(v, Scratch)
        )
        assert len(owners) > 1, "the bundle must contain actual scratch owners"
        if seen_owners:
            assert owners == seen_owners[0], "attempts must borrow identical owners"
        seen_owners.append(owners)
        events.append("proof")
        # Diagnostic phase alone must not control continuation.
        namespace["output"][63] = phase
        namespace["output"][59] = reason
        status = next(pending)
        if status == 1:
            namespace["output"][0] = 2
        return status

    def collect(*values):
        nonlocal invariant_current, current_count
        args = dict(zip((arg.arg for arg in collector.args.args), values))
        assert args["relation_collection_target"] == 30
        assert args["relation_count"] == args["online_relation_count"] == 14
        assert len(seen_owners) == 1
        events.append("resume")
        invariant_current = False
        count = 14 + growth
        current_count = count
        return (
            count,
            count,
            -1 if online_failure else 1,
            2,
            8,
            2,
            1,
            0,
            1,
            2,
            3,
            8,
        )

    def expand(*values):
        nonlocal invariant_current, current_count
        args = dict(zip((arg.arg for arg in expanded_collector.args.args), values))
        assert args["relation_count"] == args["online_count"] == current_count
        width = (1, 3, 4)[len(expansion_widths)]
        assert args["target"] == min(current_count + width, storage - 1)
        assert args["relation_capacity"] == storage
        assert args["online_status"] == 1
        owners = (id(args["search"]), id(args["expanded"]), id(args["state"]))
        assert args["expanded"].rows == args["state"].rows == 1
        assert args["expanded"].columns == 11 and args["state"].columns == 6
        if expanded_owners:
            assert owners == expanded_owners[0], "shell state must remain resident"
        expanded_owners.append(owners)
        expansion_widths.append(width)
        events.append("expand")
        invariant_current = False
        current_count += (
            args["target"] - current_count
            if expanded_growth is None
            else expanded_growth
        )
        return current_count, current_count, -1 if online_failure else 1

    def prepare(*values):
        events.append("prepare")
        assert values[-1] is True
        return rank_status, factors

    def smith(*values):
        nonlocal invariant_current
        events.append("smith")
        invariant_current = True
        return 1, quotient, 1

    def trivial(*values):
        assert invariant_current
        events.append("trivial")
        namespace["output"][0] = 2
        return True

    namespace.update(
        _cubic_try_bounded_exact_closure=proof,
        _cubic_collect_adjacent_relation_prefix=collect,
        _cubic_collect_expanded_shell_prefix=expand,
        _cubic_prepare_full_relation_presentation=prepare,
        _cubic_finish_full_relation_presentation=smith,
        _cubic_publish_trivial_relation_presentation=trivial,
    )
    exec(program, namespace)
    accepted = namespace["schedule"](namespace)
    assert (namespace["output"][0] == 2) == accepted
    return accepted, events, namespace["output"][63]


assert scenario([1])[:2] == (True, ["proof"])
assert scenario([0, 1])[:2] == (
    True,
    ["proof", "resume", "prepare", "smith", "proof"],
)
assert scenario([0, 1], growth=24)[:2] == (
    True,
    ["proof", "resume", "prepare", "smith", "proof"],
)
assert scenario([0, 0])[:2] == (
    False,
    ["proof", "resume", "prepare", "smith", "proof"],
)
for failure in [-2, -1, 2, 17]:
    assert scenario([failure]) == (False, ["proof"], 44)
    assert scenario([0, failure]) == (
        False,
        ["proof", "resume", "prepare", "smith", "proof"],
        44,
    )
assert scenario([0], growth=0) == (False, ["proof", "resume"], 43)
for options in [dict(growth=-1), dict(growth=30), dict(online_failure=True)]:
    assert scenario([0], **options) == (False, ["proof", "resume"], 44)
for bad_rank in [-1, 0, 2]:
    assert scenario([0], rank_status=bad_rank) == (
        False,
        ["proof", "resume", "prepare"],
        44,
    )
assert scenario([0], quotient=1)[:2] == (
    True,
    ["proof", "resume", "prepare", "smith", "trivial"],
)
# Shell expansion requires explicit proof insufficiency AND its particular
# no-unit diagnosis. Successful or fatal statuses always take precedence.
for factors in (8, 12):
    resume = [] if factors == 12 else ["resume", "prepare", "smith", "proof"]
    prefix = ["proof"] + resume
    steps = 4 if factors == 12 else 5
    options = dict(factors=factors, phase=43, reason=434)
    assert scenario([0] * (steps - 1) + [1], **options)[:2] == (
        True,
        prefix + ["expand", "prepare", "smith", "proof"] * 3,
    )
    assert scenario([0] * steps, **options)[:2] == (
        False,
        prefix + ["expand", "prepare", "smith", "proof"] * 3,
    )
    before = [0] if factors == 12 else [0, 0]
    for code in (-2, -1, 2, 17):
        assert scenario(before + [code], **options) == (
            False,
            prefix + ["expand", "prepare", "smith", "proof"],
            44,
        )
    for changed in (dict(phase=8), dict(reason=435)):
        assert scenario(before, **(options | changed))[:2] == (False, prefix)
    assert scenario(before, **options, expanded_growth=0) == (
        False,
        prefix + ["expand"],
        43,
    )
    for delta in (-1, 30):
        assert scenario(before, **options, expanded_growth=delta) == (
            False,
            prefix + ["expand"],
            44,
        )
assert scenario([0], factors=12, phase=43, reason=434, online_failure=True) == (
    False,
    ["proof", "expand"],
    44,
)
assert scenario([0], factors=12, phase=43, reason=434, storage=15) == (
    False,
    ["proof", "expand"],
    43,
)
assert scenario([0], factors=12, phase=43, reason=434, quotient=1)[:2] == (
    True,
    ["proof", "expand", "prepare", "smith", "trivial"],
)
print("actual-root scheduler scenarios pass; no arithmetic claims from doubles")
