"""Skip provably empty above-pivot reductions before the first HNF mutation.

The input basis must be canonical padded row HNF, as required by the existing
private helper. Until a basis row changes, all above-pivot entries are already
reduced. Mutating only the incoming residual does not invalidate that fact.
After the first basis change, retain the original normalization algorithm.
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
        if isinstance(n, ast.FunctionDef) and n.name == "_cubic_insert_row_hnf_inplace"
    ]
    if len(functions) != 1:
        raise ValueError("expected one in-place HNF insertion helper")
    fn = functions[0]
    body = ast.get_source_segment(source, fn)
    if "basis_changed" in body:
        raise ValueError("clean-prefix guard already present or name collision")
    reductions = """            row = 0
            while row < pivot_row:
                quotient = basis[row, column] // pivot
                if quotient != 0:
                    j: uint64 = column
                    while j < dimension:
                        basis[row, j] = basis[row, j] - quotient * basis[pivot_row, j]
                        j += 1
                row += 1"""
    replacements = [
        ("    row: uint64 = 0\n", "    basis_changed = False\n    row: uint64 = 0\n"),
        (
            "            if a == 0:\n",
            "            if a == 0:\n                basis_changed = True\n",
        ),
        (
            "                    # Bezout pair:",
            "                    basis_changed = True\n                    # Bezout pair:",
        ),
        (
            "            if pivot < 0:\n",
            "            if pivot < 0:\n                basis_changed = True\n",
        ),
        (
            reductions,
            "            # The untouched canonical prefix needs no renormalization.\n"
            "            if basis_changed:\n"
            + "\n".join("    " + line for line in reductions.splitlines()),
        ),
    ]
    changed = body
    for before, after in replacements:
        if changed.count(before) != 1:
            raise ValueError("unexpected HNF insertion shape: " + before.strip())
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
