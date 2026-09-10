"""Keep factor-base primes machine-sized during exact norm trial division.

This creates an inspectable research source copy, not production dispatch.
The cubic caller proves that group primes lie between 2 and its checked search
limit (at most 4096). Norms and valuations remain arbitrary-precision integers;
only the divisor is converted, with an explicit overflow check. The native
compiler can then lower `%` to `integer.mod_uint64` without changing exact
division, prime-power authentication, relation admission, or certification.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


def transform(source):
    """Change exactly one prime load; reject an unexpected source shape."""
    tree = ast.parse(source)
    targets = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_cubic_append_smooth_principal_relation"
    ]
    if len(targets) != 1:
        raise ValueError("expected one smooth principal relation helper")
    assignments = [
        node
        for node in ast.walk(targets[0])
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == "rational_prime"
    ]
    if len(assignments) != 1:
        raise ValueError("expected one unconverted rational-prime assignment")
    node = assignments[0]
    if ast.unparse(node.value) != "workspace[group_base]":
        raise ValueError("unexpected rational-prime source")
    lines = source.encode().splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    start = offsets[node.lineno - 1] + node.col_offset
    end = offsets[node.end_lineno - 1] + node.end_col_offset
    replacement = b"rational_prime: uint64 = checked_uint64(workspace[group_base])"
    original = source.encode()
    result = original[:start] + replacement + original[end:]
    ast.parse(result)
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
                "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
                "output_sha256": hashlib.sha256(result.encode()).hexdigest(),
                "output_bytes": len(result.encode()),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
