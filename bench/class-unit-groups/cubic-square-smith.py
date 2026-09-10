"""Use the authenticated square HNF for cubic research Smith invariants.

The caller has established full column rank and computed the exact row HNF
of the live principal-relation prefix. Its first n rows generate the same
lattice as the tall matrix, so both matrices present the same abelian group.
This substitution leaves raw relations, unit dependencies, support checks,
resource allocations and final certification unchanged.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


def transform(source):
    tree = ast.parse(source)
    target = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_cubic_finish_full_relation_presentation"
    )
    params = [arg.arg for arg in target.args.args]
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == target.name
    ]
    if len(calls) != 2:
        raise ValueError("expected two audited full-rank presentation calls")
    lines = source.encode().splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    replacements = [
        ("relation_matrix", "relation_matrix", "relation_hnf"),
        ("relation_count", "relation_count", "factor_count"),
    ]
    edits = []
    for call in calls:
        if call.keywords or len(call.args) != len(params):
            raise ValueError("unexpected Smith call arguments")
        for param, old, new in replacements:
            arg = call.args[params.index(param)]
            if not isinstance(arg, ast.Name) or arg.id != old:
                raise ValueError("unexpected or already transformed Smith call")
            edits.append(
                (
                    offsets[arg.lineno - 1] + arg.col_offset,
                    offsets[arg.end_lineno - 1] + arg.end_col_offset,
                    new.encode(),
                )
            )
    result = source.encode()
    for start, end, value in sorted(edits, reverse=True):
        result = result[:start] + value + result[end:]
    after = ast.parse(result)
    for call in ast.walk(after):
        if (
            isinstance(call, ast.Call)
            and isinstance(call.func, ast.Name)
            and call.func.id == target.name
        ):
            for param, old, _new in replacements:
                call.args[params.index(param)].id = old
    if ast.dump(after) != ast.dump(tree):
        raise ValueError("unexpected change outside the two Smith calls")
    return result.decode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.source.read_text()
    result = transform(source)
    with args.output.open("x") as stream:
        stream.write(result)
    print(
        json.dumps(
            {
                "parent_sha256": hashlib.sha256(source.encode()).hexdigest(),
                "source_sha256": hashlib.sha256(result.encode()).hexdigest(),
                "bytes": len(result.encode()),
            }
        )
    )


if __name__ == "__main__":
    main()
