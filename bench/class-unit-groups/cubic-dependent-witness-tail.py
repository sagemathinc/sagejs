"""Select a bounded tail of non-support witnesses in a cubic research copy.

Exact HNF support preserves the entire principal-relation lattice. The extra
tail helps reconstruct its unit dependencies; a bounded tail need not preserve
the full unit lattice. This experiment changes only which redundant witnesses
are retained, not their maximum count, any allocation or final certification.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


def transform(source):
    tree = ast.parse(source)
    targets = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_cubic_compact_relation_plan"
    ]
    if len(targets) != 1:
        raise ValueError("expected one compact relation planner")
    target = targets[0]
    text = ast.get_source_segment(source, target)
    marker = "    compact_tail_start: uint64 = 0"
    if text.count(marker) != 1:
        raise ValueError("unexpected or already transformed compact planner")
    start = text.index(marker)
    replacement = """    compact_tail_start: uint64 = relation_count
    compact_tail_count: uint64 = 0
    while (
        compact_tail_start > 0
        and compact_tail_count < _CUBIC_RELATION_REDUNDANCY_TAIL
    ):
        compact_tail_start -= 1
        if proof_relation_support[compact_tail_start, 0] == 0:
            compact_tail_count += 1
    compact_relation_count: uint64 = support_count + compact_tail_count
    return compact_tail_start, compact_relation_count"""
    if source.count(text) != 1:
        raise ValueError("ambiguous compact planner source")
    result = source.replace(text, text[:start] + replacement)
    after = ast.parse(result)
    replaced = next(
        node
        for node in after.body
        if isinstance(node, ast.FunctionDef) and node.name == target.name
    )
    after.body[after.body.index(replaced)] = target
    if ast.dump(after) != ast.dump(tree):
        raise ValueError("unexpected change outside the compact planner")
    return result


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
