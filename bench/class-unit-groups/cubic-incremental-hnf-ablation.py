"""Replace only the online cubic HNF update in an inspectable source copy.

The input may be the production source or a separately identified research
variant. This operation does not change any search bound, resource allocation,
support-transcript rule, certification test, or result publication.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


def transform(source):
    tree = ast.parse(source)
    helper_file = Path(__file__).with_name("cubic-incremental-hnf.py")
    helper_source = helper_file.read_text()
    helper = next(
        node
        for node in ast.parse(helper_source).body
        if isinstance(node, ast.FunctionDef)
    )
    if any(
        isinstance(node, ast.Name)
        and node.id == helper.name
        or isinstance(node, ast.FunctionDef)
        and node.name == helper.name
        for node in ast.walk(tree)
    ):
        raise ValueError("incremental helper already present")
    target = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_cubic_online_relation_lattice_update"
    )
    calls = [
        node
        for node in ast.walk(target)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "fmpz_matrix_hnf_into"
    ]
    if (
        len(calls) != 1
        or ast.unparse(calls[0]) != "fmpz_matrix_hnf_into(reduced, source)"
    ):
        raise ValueError("unexpected online HNF call shape")
    lines = source.encode().splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    call = calls[0]
    start = offsets[call.lineno - 1] + call.col_offset
    end = offsets[call.end_lineno - 1] + call.end_col_offset
    insertion_line = min([target.lineno] + [d.lineno for d in target.decorator_list])
    insertion = offsets[insertion_line - 1]
    helper_text = ast.get_source_segment(helper_source, helper).encode() + b"\n\n\n"
    body = source.encode()
    body = (
        body[:start] + b"_cubic_insert_row_hnf(reduced, source, dimension)" + body[end:]
    )
    body = body[:insertion] + helper_text + body[insertion:]
    ast.parse(body)
    return body.decode()


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
