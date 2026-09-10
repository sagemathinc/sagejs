"""Separate rank-recovery admission quotas from physical visit limits.

The modular admission predicate already bounds the ordinary dependent tail
and extra parity-independent rows. Its target is not a maximum physical row
count: after extra parity admissions that ledger may legitimately be larger.
Discovery still has the same physical capacity, virtual work budget, candidate
cap and exact support-change stopping rule. No certification test is changed.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


def transform(source):
    tree = ast.parse(source)
    functions = [
        n
        for n in tree.body
        if isinstance(n, ast.FunctionDef)
        and n.name == "_cubic_resume_powered_rank_search"
    ]
    if len(functions) != 1:
        raise ValueError("expected one powered-rank search helper")
    fn = functions[0]
    if any(
        isinstance(n, ast.Name) and n.id == "rank_visit_limit" for n in ast.walk(fn)
    ):
        raise ValueError("visit limit already separated")
    calls = [
        n
        for n in ast.walk(fn)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Name)
        and n.func.id == "_cubic_append_initial_volume_ellipsoid"
    ]
    if len(calls) != 1 or len(calls[0].args) != 24:
        raise ValueError("unexpected ellipsoid call shape")
    call = calls[0]
    if ast.unparse(call.args[11]) != "limit" or ast.unparse(call.args[22]) != "limit":
        raise ValueError("expected the same admission and visit limit")
    lines = source.encode().splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    assignment = next(
        n for n in ast.walk(fn) if isinstance(n, ast.Assign) and n.value is call
    )
    insertion = offsets[assignment.lineno - 1]
    indent = " " * assignment.col_offset
    setup = (
        "\n".join(
            indent + line
            for line in [
                "# Admission target retains the global dependent/parity quota.",
                "# Rank discovery must still visit when that target was exceeded.",
                "rank_visit_limit: uint64 = relation_capacity",
                "if quotient_mode:",
                "    rank_visit_limit = limit",
            ]
        )
        + "\n"
    )
    arg = call.args[22]
    start = offsets[arg.lineno - 1] + arg.col_offset
    end = offsets[arg.end_lineno - 1] + arg.end_col_offset
    data = source.encode()
    changed = data[:start] + b"rank_visit_limit" + data[end:]
    changed = changed[:insertion] + setup.encode() + changed[insertion:]
    result = changed.decode()
    ast.parse(result)
    # Mechanically undo exactly the two edits; preserve all other source.
    restored = changed[:insertion] + changed[insertion + len(setup.encode()) :]
    restored = (
        restored[:start]
        + data[start:end]
        + restored[start + len(b"rank_visit_limit") :]
    )
    if restored != data:
        raise AssertionError("unexpected source edit")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.source.read_text()
    result = transform(source)
    with args.output.open("x") as output:
        output.write(result)
    print(
        json.dumps(
            dict(
                source_sha256=hashlib.sha256(source.encode()).hexdigest(),
                output_sha256=hashlib.sha256(result.encode()).hexdigest(),
            )
        )
    )


if __name__ == "__main__":
    main()
