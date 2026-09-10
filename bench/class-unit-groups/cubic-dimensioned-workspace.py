"""Build an inspectable, runtime-dimensioned cubic research source copy.

This is an experiment, not a production-envelope qualification. The caller
selects storage capacity and a search ceiling, never a mathematical answer.
The original exact generator-bound and final certification tests remain in
the emitted source. NativeRecord carries only scalar layout information;
all exact owners retain their original arena and borrowing discipline.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


ROOT = "certified_complex_cubic_class_group_v1"
FIELDS = {
    "_CUBIC_MAX_FACTORS": "factors",
    "_CUBIC_MAX_GROUPS": "groups",
    "_CUBIC_WORKSPACE_LENGTH": "entries",
    "_CUBIC_MAX_FACTOR_SEARCH_BOUND": "search_limit",
    "_CUBIC_MODULAR_BASIS_ENTRIES": "modular_row",
    "_CUBIC_MODULAR_ROW_OFFSET": "modular_row",
    "_CUBIC_MODULAR_RANK_OFFSET": "modular_rank",
    "_CUBIC_MODULAR_WORKSPACE_LENGTH": "modular_entries",
    "_GROUP_OFFSET": "group",
    "_POWER_OFFSET": "power",
    "_HNF_SCRATCH_OFFSET": "hnf",
    "_MAP_SCRATCH_OFFSET": "maps",
    "_ROW_SCRATCH_OFFSET": "row",
    "_NORM_FORM_OFFSET": "norm",
    "_COMPOUND_MULTIPLIER_POWER_OFFSET": "compound",
}

SCHEMA = """
from sagejs.native import NativeRecord


class CubicStorageLayout(NativeRecord):
    factors: uint64
    groups: uint64
    entries: uint64
    search_limit: uint64
    modular_row: uint64
    modular_rank: uint64
    modular_entries: uint64
    group: uint64
    power: uint64
    hnf: uint64
    maps: uint64
    row: uint64
    norm: uint64
    compound: uint64


"""

# Guard before any machine-word multiplication or allocation. These are
# exploratory resource ceilings, not a claim that all admitted shapes work.
# The 238-entry tail preserves the existing reserved region exactly at F=64.
INITIALIZE = """    if factor_capacity < 1 or factor_capacity > 512:
        return False
    if search_limit < 32 or search_limit > 4096:
        return False
    layout_group: uint64 = 30 + 10 * factor_capacity
    layout_power: uint64 = layout_group + 4 * factor_capacity
    layout_hnf: uint64 = layout_power + 108 * factor_capacity + 2
    layout_maps: uint64 = layout_hnf + 27
    layout_row: uint64 = layout_maps + 13
    layout_norm: uint64 = layout_row + factor_capacity
    layout_compound: uint64 = layout_norm + 10
    layout_modular_row: uint64 = factor_capacity * factor_capacity
    layout_modular_rank: uint64 = layout_modular_row + factor_capacity
    layout = CubicStorageLayout(
        factor_capacity, factor_capacity, layout_compound + 238, search_limit,
        layout_modular_row, layout_modular_rank, layout_modular_rank + 1,
        layout_group, layout_power, layout_hnf, layout_maps, layout_row,
        layout_norm, layout_compound,
    )
    layout_search_limit: int = search_limit
"""


def transform(source):
    """Forward layout along the exact dependency closure, preserving formatting."""
    tree = ast.parse(source)
    if any(isinstance(n, ast.Name) and n.id == "layout" for n in ast.walk(tree)):
        raise ValueError("source already binds layout; refuse ambiguous rewrite")
    functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    if ROOT not in functions:
        raise ValueError("missing cubic root")
    dependent = {
        name
        for name, node in functions.items()
        if any(isinstance(n, ast.Name) and n.id in FIELDS for n in ast.walk(node))
    }
    calls = {
        name: {
            n.func.id
            for n in ast.walk(node)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
        }
        for name, node in functions.items()
    }
    while True:
        expanded = dependent | {name for name in functions if calls[name] & dependent}
        if expanded == dependent:
            break
        dependent = expanded
    # AST columns are UTF-8 bytes, not Python string character offsets.
    lines = source.encode().splitlines(keepends=True)
    starts = [0]
    for line in lines:
        starts.append(starts[-1] + len(line))

    def pos(node, end=False):
        return starts[(node.end_lineno if end else node.lineno) - 1] + (
            node.end_col_offset if end else node.col_offset
        )

    edits = []
    removed = set()
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name) and target.id in FIELDS:
                removed.add(target.id)
                edits.append((pos(node), pos(node, True), b""))
    if removed != set(FIELDS):
        raise ValueError(f"unexpected layout definitions: {sorted(removed)}")
    for name, node in functions.items():
        if name not in dependent:
            continue
        if node.args.vararg or node.args.kwarg or node.args.kwonlyargs:
            raise ValueError(f"unsupported signature {name}")
        if name == ROOT:
            # Append explicit resource policy arguments after the existing ABI.
            last = node.args.args[-1]
            edits.append(
                (
                    pos(last, True),
                    pos(last, True),
                    b", factor_capacity: uint64, search_limit: uint64",
                )
            )
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                insertion = starts[first.end_lineno]
            else:
                insertion = starts[first.lineno - 1]
            edits.append((insertion, insertion, INITIALIZE.encode()))
        else:
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Name) or decorator.id != "native":
                    raise ValueError("unexpected helper decorator")
                edits.append(
                    (starts[decorator.lineno - 1], starts[decorator.end_lineno], b"")
                )
            first_arg = node.args.args[0]
            edits.append(
                (pos(first_arg), pos(first_arg), b"layout: CubicStorageLayout, ")
            )
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and child.id in FIELDS:
                expression = "layout." + FIELDS[child.id]
                if child.id == "_CUBIC_MAX_FACTOR_SEARCH_BOUND":
                    # Bounds participate in exact discriminant arithmetic;
                    # preserve Integer locals instead of changing them to u64.
                    if name != ROOT:
                        raise ValueError("search ceiling escaped root")
                    expression = "layout_search_limit"
                edits.append((pos(child), pos(child, True), expression.encode()))
            if (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Name)
                and child.func.id in dependent
            ):
                if child.func.id == ROOT or not child.args or child.keywords:
                    raise ValueError("unsupported recursive or keyword native call")
                start = pos(child.args[0])
                edits.append((start, start, b"layout, "))
    first_function = next(n for n in tree.body if isinstance(n, ast.FunctionDef))
    first_line = min(
        [first_function.lineno] + [d.lineno for d in first_function.decorator_list]
    )
    insertion = starts[first_line - 1]
    edits.append((insertion, insertion, SCHEMA.encode()))
    data = source.encode()
    boundary = len(data) + 1
    # Equal-position insertion precedes a replacement in the resulting text.
    for start, end, replacement in sorted(
        edits, key=lambda e: (e[0], e[1]), reverse=True
    ):
        if end > boundary:
            raise ValueError("overlapping source edits")
        data = data[:start] + replacement + data[end:]
        boundary = start
    result = data.decode()
    parsed = ast.parse(result)
    if any(isinstance(n, ast.Name) and n.id in FIELDS for n in ast.walk(parsed)):
        raise ValueError("stale static layout reference")
    return result, sorted(dependent)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.source.read_text()
    result, dependent = transform(source)
    with args.output.open("x") as stream:
        stream.write(result)
    print(
        json.dumps(
            {
                "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
                "output_sha256": hashlib.sha256(result.encode()).hexdigest(),
                "layout_functions": dependent,
                "output_bytes": len(result.encode()),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
