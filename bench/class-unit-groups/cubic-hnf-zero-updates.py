"""Avoid identity row updates at zero coefficients in exact HNF insertion.

This is a research source ablation, not a compiler-wide zero simplification.
The private helper requires valid matrix dimensions and distinct basis and
residual owners. An update x -= q * 0 leaves x unchanged, and a Bezout pair
maps (0, 0) to (0, 0). All nonzero operations retain their original order.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


def transform(source):
    tree = ast.parse(source)
    functions = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_cubic_insert_row_hnf_inplace"
    ]
    if len(functions) != 1:
        raise ValueError("expected one in-place HNF insertion helper")
    body = ast.get_source_segment(source, functions[0])
    if "row_coefficient" in body:
        raise ValueError("zero-update guard already present or name collision")
    replacements = [
        (
            "                        residual[0, j] = residual[0, j] - quotient * basis[pivot_row, j]",
            "                        row_coefficient = basis[pivot_row, j]\n"
            "                        if row_coefficient != 0:\n"
            "                            residual[0, j] = residual[0, j] - quotient * row_coefficient",
        ),
        (
            "                            basis[row, j] = basis[row, j] - quotient * basis[pivot_row, j]",
            "                            row_coefficient = basis[pivot_row, j]\n"
            "                            if row_coefficient != 0:\n"
            "                                basis[row, j] = basis[row, j] - quotient * row_coefficient",
        ),
        (
            "                        basis[pivot_row, j] = old_s * old + old_t * extra\n"
            "                        residual[0, j] = left * old + right * extra",
            "                        if old != 0 or extra != 0:\n"
            "                            basis[pivot_row, j] = old_s * old + old_t * extra\n"
            "                            residual[0, j] = left * old + right * extra",
        ),
    ]
    changed = body
    for before, after in replacements:
        if changed.count(before) != 1:
            raise ValueError("unexpected clean-prefix HNF shape: " + before.strip())
        changed = changed.replace(before, after, 1)
    restored = changed
    for before, after in reversed(replacements):
        restored = restored.replace(after, before, 1)
    if restored != body or source.count(body) != 1:
        raise AssertionError("unexpected nonlocal HNF edit")
    result = source.replace(body, changed, 1)
    ast.parse(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    before = args.source.read_text()
    after = transform(before)
    with args.output.open("x") as stream:
        stream.write(after)
    print(
        json.dumps(
            {
                "source_sha256": hashlib.sha256(before.encode()).hexdigest(),
                "output_sha256": hashlib.sha256(after.encode()).hexdigest(),
            }
        )
    )


if __name__ == "__main__":
    main()
