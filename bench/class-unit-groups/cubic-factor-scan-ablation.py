"""Isolate factor-group scans and machine-sized offsets in cubic research code.

Neither transformation changes production dispatch. The range variant requires
the root's contiguous factor-group partition; bounds checks alone do not prove
that invariant. It retains per-factor membership tests, valuation logic, and
iteration order. The offset variant requires the caller's bounded workspace
layout, so positive machine-sized index additions cannot overflow. It is not
a proposal to change arbitrary Python integer addition into word arithmetic.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path

HELPER = "_cubic_append_smooth_principal_relation"
RANGE_SETUP = """        group_start_exact = workspace[group_base + 1]
        group_count_exact = workspace[group_base + 2]
        group_end_exact = group_start_exact + group_count_exact
        if (
            group_start_exact < 0
            or group_count_exact < 0
            or group_end_exact > factor_count
        ):
            return relation_capacity + 1
        group_factor_start: uint64 = checked_uint64(group_start_exact)
        group_factor_end: uint64 = checked_uint64(group_end_exact)
"""


def target(source):
    """Require one unambiguous source helper."""
    tree = ast.parse(source)
    matches = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == HELPER
    ]
    if len(matches) != 1:
        raise ValueError("expected one smooth principal relation helper")
    return tree, matches[0]


def ranges(source):
    """Limit two scans to the root-built contiguous range, without reordering."""
    tree, fn = target(source)
    reserved = {
        "group_start_exact",
        "group_count_exact",
        "group_end_exact",
        "group_factor_start",
        "group_factor_end",
    }
    if any(isinstance(n, ast.Name) and n.id in reserved for n in ast.walk(fn)):
        raise ValueError("group-range locals already present")
    loops = [
        n
        for n in fn.body
        if isinstance(n, ast.While)
        and ast.unparse(n.test) == "valid_relation and group_index < group_count"
    ]
    if len(loops) != 1:
        raise ValueError("expected one group-valuation loop")
    lines = source.splitlines(keepends=True)
    loop = loops[0]
    original = "".join(lines[loop.lineno - 1 : loop.end_lineno])
    anchor = "        rational_valuation = workspace[group_base + 3]\n"
    scan = "        factor_index = 0\n        while factor_index < factor_count:\n"
    replacement = "        factor_index = group_factor_start\n        while factor_index < group_factor_end:\n"
    if original.count(anchor) != 1 or original.count(scan) != 2:
        raise ValueError("unexpected factor scan source shape")
    changed = original.replace(anchor, anchor + RANGE_SETUP).replace(scan, replacement)
    result = (
        "".join(lines[: loop.lineno - 1]) + changed + "".join(lines[loop.end_lineno :])
    )
    if ast.dump(ast.parse(result.replace(changed, original, 1))) != ast.dump(tree):
        raise AssertionError("unexpected source change")
    ast.parse(result)
    return result


def indices(source):
    """Make the ten bounded group/factor offsets explicitly machine-sized."""
    tree, fn = target(source)
    if any(
        isinstance(n, ast.Name) and n.id.startswith("workspace_offset_")
        for n in ast.walk(fn)
    ):
        raise ValueError("word-offset locals already present")
    lines = source.encode().splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    edits, constants = [], set()
    for node in ast.walk(fn):
        if not (
            isinstance(node, ast.Subscript)
            and isinstance(node.value, ast.Name)
            and node.value.id == "workspace"
        ):
            continue
        index = node.slice
        if not (
            isinstance(index, ast.BinOp)
            and isinstance(index.op, ast.Add)
            and isinstance(index.left, ast.Name)
            and index.left.id in {"group_base", "factor_base"}
            and isinstance(index.right, ast.Constant)
            and type(index.right.value) is int
            and index.right.value >= 0
        ):
            continue
        value = index.right.value
        constants.add(value)
        edits.append(
            (
                offsets[index.right.lineno - 1] + index.right.col_offset,
                offsets[index.right.end_lineno - 1] + index.right.end_col_offset,
                f"workspace_offset_{value}".encode(),
            )
        )
    if len(edits) != 10:
        raise ValueError("expected exactly ten workspace offsets")
    insertion = offsets[fn.body[0].end_lineno]
    declarations = "".join(
        f"    workspace_offset_{k}: uint64 = {k}\n" for k in sorted(constants)
    ).encode()
    edits.append((insertion, insertion, declarations))
    result = source.encode()
    for start, end, text in sorted(edits, reverse=True):
        result = result[:start] + text + result[end:]
    candidate = result.decode()

    class Undo(ast.NodeTransformer):
        def visit_Name(self, node):
            if node.id.startswith("workspace_offset_"):
                return ast.Constant(
                    value=int(node.id.removeprefix("workspace_offset_"))
                )
            return node

    after, changed = target(candidate)
    changed.body = [
        n
        for n in changed.body
        if not (
            isinstance(n, ast.AnnAssign)
            and isinstance(n.target, ast.Name)
            and n.target.id.startswith("workspace_offset_")
        )
    ]
    Undo().visit(changed)
    if ast.dump(tree) != ast.dump(after):
        raise AssertionError("unexpected source change")
    return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["ranges", "indices"])
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.source.read_text()
    result = {"ranges": ranges, "indices": indices}[args.mode](source)
    with args.output.open("x") as stream:
        stream.write(result)
    print(
        json.dumps(
            {
                "mode": args.mode,
                "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
                "output_sha256": hashlib.sha256(result.encode()).hexdigest(),
                "output_bytes": len(result.encode()),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
