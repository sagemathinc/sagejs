"""Source-copy diagnostic: bundle existing search owners, with no new storage."""

import ast
import copy
import sys


FIELDS = {
    "workspace": ("integers", "NativeIntegerVector"),
    "adjacent_order": ("order", "FmpzMatrix"),
    "adjacent_transforms": ("transforms", "FmpzMatrix"),
    "adjacent_ellipsoid_parameters": ("parameters", "FmpzMatrix"),
    "relation_candidates": ("relations", "FmpzMatrix"),
    "relation_elements": ("elements", "FmpzMatrix"),
    "hnf_source": ("hnf_source", "FmpzMatrix"),
    "hnf_result": ("hnf_result", "FmpzMatrix"),
    "online_relation_basis": ("online_basis", "FmpzMatrix"),
    "online_relation_source": ("online_source", "FmpzMatrix"),
    "online_relation_hnf": ("online_hnf", "FmpzMatrix"),
    "relation_support": ("support", "FmpzMatrix"),
    "online_membership_coordinates": ("membership", "FmpzMatrix"),
}
EXPANDED_NAMES = dict(
    zip(
        [
            "workspace",
            "order",
            "transforms",
            "parameters",
            "candidates",
            "elements",
            "source",
            "result",
            "online_basis",
            "online_source",
            "online_hnf",
            "support",
            "membership",
        ],
        FIELDS,
        strict=True,
    )
)
HELPERS = {
    "_cubic_collect_adjacent_relation_prefix": {name: name for name in FIELDS},
    "_cubic_collect_expanded_shell_prefix": EXPANDED_NAMES,
    "_cubic_append_reduced_ideal_ellipsoid": {
        "workspace": "workspace",
        "transforms": "adjacent_transforms",
        "relation_matrix": "relation_candidates",
        "relation_elements": "relation_elements",
        "hnf_source": "hnf_source",
        "hnf_result": "hnf_result",
        "online_relation_basis": "online_relation_basis",
        "online_relation_source": "online_relation_source",
        "online_relation_hnf": "online_relation_hnf",
        "online_relation_support": "relation_support",
        "online_membership_coordinates": "online_membership_coordinates",
    },
}


def transform(source):
    tree = ast.parse(source)
    assert not any(
        isinstance(n, ast.Name) and n.id == "search" for n in ast.walk(tree)
    ), "search binding already exists"
    assert "class CubicSearchWorkspace" not in source
    raw = source.encode()
    lines = raw.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))

    def start(node):
        return offsets[node.lineno - 1] + node.col_offset

    def end(node):
        return offsets[node.end_lineno - 1] + node.end_col_offset

    edits = []
    functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    calls = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Name)
        and n.func.id in HELPERS
    ]
    call_argument_nodes = {
        id(n) for call in calls for arg in call.args for n in ast.walk(arg)
    }
    for name, mapping in HELPERS.items():
        fn = functions[name]
        assert not fn.decorator_list
        assert set(mapping).issubset({arg.arg for arg in fn.args.args})
        insert = offsets[fn.lineno]
        edits.append((insert, insert, b"    search: CubicSearchWorkspace,\n"))
        for arg in fn.args.args:
            if arg.arg in mapping:
                assert ast.unparse(arg.annotation) == FIELDS[mapping[arg.arg]][1]
                assert arg.lineno == arg.end_lineno
                edits.append((offsets[arg.lineno - 1], offsets[arg.lineno], b""))
        for statement in fn.body:
            for node in ast.walk(statement):
                if isinstance(node, ast.Name) and node.id in mapping:
                    assert isinstance(node.ctx, ast.Load), (
                        "cannot rebind borrowed owner"
                    )
                    if id(node) in call_argument_nodes:
                        continue
                    field = FIELDS[mapping[node.id]][0]
                    edits.append((start(node), end(node), f"search.{field}".encode()))

    assert len(calls) == 5
    root = functions["certified_complex_cubic_class_group_v1"]
    root_nodes = {id(n) for n in ast.walk(root)}
    first_call = min((call for call in calls if id(call) in root_nodes), key=start)
    for call in calls:
        assert not call.keywords
        fn = functions[call.func.id]
        assert len(call.args) == len(fn.args.args)
        mapping = HELPERS[call.func.id]
        caller = next(
            fn for fn in functions.values() if start(fn) <= start(call) < end(fn)
        )
        caller_mapping = HELPERS.get(caller.name, {})
        assert caller is root or caller.name in HELPERS

        class Project(ast.NodeTransformer):
            def visit_Name(self, node):
                if node.id in caller_mapping:
                    return ast.Attribute(
                        value=ast.Name(id="search", ctx=ast.Load()),
                        attr=FIELDS[caller_mapping[node.id]][0],
                        ctx=node.ctx,
                    )
                return node

        remaining = []
        for arg, parameter in zip(call.args, fn.args.args, strict=True):
            if parameter.arg in mapping:
                assert isinstance(arg, ast.Name)
                assert caller_mapping.get(arg.id, arg.id) == mapping[parameter.arg]
            else:
                remaining.append(ast.unparse(Project().visit(copy.deepcopy(arg))))
        # Preserve the enclosing statement indentation, independent of the
        # long tuple assignment on the call's first line.
        indent = lines[call.lineno - 1][
            : len(lines[call.lineno - 1]) - len(lines[call.lineno - 1].lstrip())
        ]
        body = (
            b"\n"
            + b"".join(
                indent + b"    " + value.encode() + b",\n"
                for value in ["search", *remaining]
            )
            + indent
        )
        edits.append((end(call.func) + 1, end(call) - 1, body))

    enclosing = [
        n
        for n in ast.walk(root)
        if isinstance(n, ast.stmt) and start(n) <= start(first_call) < end(n)
    ]
    statement = min(enclosing, key=lambda n: end(n) - start(n))
    indent = b" " * statement.col_offset
    constructor = indent + b"search = CubicSearchWorkspace(\n"
    for owner in FIELDS:
        constructor += indent + b"    " + owner.encode() + b",\n"
    constructor += indent + b")\n"
    edits.append(
        (offsets[statement.lineno - 1], offsets[statement.lineno - 1], constructor)
    )
    first_helper = min((functions[name] for name in HELPERS), key=start)
    schema = 'class CubicSearchWorkspace(NativeWorkspace):\n    """Borrow the resident adjacent/expanded relation-search owners."""\n\n'
    schema += "".join(f"    {field}: {kind}\n" for field, kind in FIELDS.values())
    edits.append((start(first_helper), start(first_helper), (schema + "\n\n").encode()))
    # Insertions precede deletions at equal offsets; reverse application then
    # makes the original argument deletion happen before its replacement.
    edits.sort(key=lambda item: (item[0], item[1]))
    previous_end = 0
    for begin, finish, _ in edits:
        assert begin >= previous_end, "overlapping source edits"
        previous_end = finish
    for begin, finish, replacement in reversed(edits):
        raw = raw[:begin] + replacement + raw[finish:]
    result = raw.decode()
    ast.parse(result)
    return result


if __name__ == "__main__":
    sys.stdout.write(transform(sys.stdin.read()))
