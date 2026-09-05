"""Execute the production two-attempt control flow with adversarial phase doubles."""

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


def scenario(statuses, growth=2, online_failure=False, rank_status=1, quotient=3):
    names = {
        n.id for n in ast.walk(branch) if isinstance(n, ast.Name) and n.id != "True"
    }
    namespace = dict.fromkeys(names, 0)
    namespace.update(
        uint64=int,
        fmpz_matrix=object(),
        factor_count=8,
        relation_count=14,
        online_relation_count=14,
        online_relation_status=1,
        presentation_storage_rows=38,
        class_number_upper=3,
        relation_rank=8,
        reuse_online_relation_hnf=True,
        output=[0] * 64,
        arena=Arena(),
        CubicProofWorkspace=ProofBundle,
    )
    events = []
    seen_owners = []
    pending = iter(statuses)
    invariant_current = True

    def proof(*values):
        args = dict(zip((arg.arg for arg in helper.args.args), values))
        assert invariant_current, "resumption must not publish stale Smith invariants"
        assert args["relation_count"] in (14, 14 + growth)
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
        namespace["output"][63] = 8
        status = next(pending)
        if status == 1:
            namespace["output"][0] = 2
        return status

    def collect(*values):
        nonlocal invariant_current
        args = dict(zip((arg.arg for arg in collector.args.args), values))
        assert args["relation_collection_target"] == 30
        assert args["relation_count"] == args["online_relation_count"] == 14
        assert len(seen_owners) == 1
        events.append("resume")
        invariant_current = False
        count = 14 + growth
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

    def prepare(*values):
        events.append("prepare")
        assert values[-1] is True
        return rank_status, 8

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
print("20 actual-root scheduler scenarios pass; no arithmetic claims from doubles")
