"""Insert an exact resident prime-support filter into a research cubic closure.

This is a source-transparent ablation, not production qualification. The
product occupies one newly reserved exact workspace entry after the ten norm
coefficients. Existing arena budgets, relation tests and output formats stay
unchanged. The Euclidean gcd uses the existing ordinary-Python native helper.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path


FILTER = '''def _cubic_norm_has_prime_support(norm: int, prime_product: int) -> bool:
    """Test support exactly; positive inputs need not be squarefree.

    Each division removes only prime factors present in the original product.
    Every nontrivial gcd strictly decreases the positive remaining norm. At
    termination the residue is coprime to the product, so it is one exactly
    when the original norm had no prime factor outside that product.
    """
    if norm < 1 or prime_product < 1:
        return False
    remaining = norm
    common = prime_product
    while remaining != 1:
        common = _cubic_gcd(remaining, common)
        if common == 1:
            return False
        remaining //= common
    return True


'''


def transform(source, gcd_backend="python"):
    if gcd_backend not in ("python", "flint"):
        raise ValueError("unknown gcd backend")
    tree = ast.parse(source)
    names = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
    target = "_cubic_append_smooth_principal_relation"
    root = "certified_complex_cubic_class_group_v1"
    if names.count(target) != 1 or names.count(root) != 1:
        raise ValueError("expected unique collector and root")
    if "_cubic_norm_has_prime_support" in names or "support_product_slot" in source:
        raise ValueError("prime-support filter already present or name collision")
    functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    if functions[target].decorator_list:
        raise ValueError("expected an undecorated private collector")

    replacements = [
        (
            "    layout_compound: uint64 = layout_norm + 10\n",
            "    # One new exact entry stores the immutable factor-base product.\n"
            "    layout_compound: uint64 = layout_norm + 11\n",
        ),
        (
            "        output[63] = 3\n",
            "        support_product_offset: uint64 = 10\n"
            "        support_product_slot: uint64 = layout.norm + support_product_offset\n"
            "        workspace[support_product_slot] = 1\n"
            "        support_group_index: uint64 = 0\n"
            "        while support_group_index < group_count:\n"
            "            support_group_base: uint64 = layout.group + _GROUP_STRIDE * support_group_index\n"
            "            workspace[support_product_slot] *= workspace[support_group_base]\n"
            "            support_group_index += 1\n"
            "        output[63] = 3\n",
        ),
        (
            "    remaining_norm = norm\n",
            "    support_product_offset: uint64 = 10\n"
            "    support_product_slot: uint64 = layout.norm + support_product_offset\n"
            "    if not _cubic_norm_has_prime_support(norm, workspace[support_product_slot]):\n"
            "        return relation_count\n"
            "    remaining_norm = norm\n",
        ),
        ("def " + target + "(\n", FILTER + "def " + target + "(\n"),
    ]
    # These anchors must belong to the intended root and collector, not merely
    # occur once somewhere in the source. Existing layout names are private to
    # the pinned research closure; production promotion needs its own review.
    lines = source.splitlines(keepends=True)
    for (before, _), owner in zip(replacements, [root, root, target, target]):
        fn = functions[owner]
        body = "".join(lines[fn.lineno - 1 : fn.end_lineno])
        if body.count(before) != 1:
            raise ValueError("insertion site outside intended function: " + owner)
    result = source
    for before, after in replacements:
        if result.count(before) != 1:
            raise ValueError(
                "unexpected or ambiguous insertion site: " + before.strip()
            )
        result = result.replace(before, after, 1)
    ast.parse(result)
    restored = result
    for before, after in reversed(replacements):
        restored = restored.replace(after, before, 1)
    if restored != source:
        raise AssertionError("nonlocal source modification")
    if gcd_backend == "flint":
        anchor = "from sagejs.ffi.flint import (\n"
        if source.count(anchor) != 1 or "fmpz_gcd" in source:
            raise ValueError("expected unique FLINT import without gcd binding")
        result = result.replace(anchor, anchor + "    fmpz_gcd,\n", 1)
        result = result.replace(
            "common = _cubic_gcd(remaining, common)",
            "common = fmpz_gcd(remaining, common)",
            1,
        )
        ast.parse(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--gcd", choices=("python", "flint"), default="python")
    args = parser.parse_args()
    source = args.source.read_text()
    result = transform(source, args.gcd)
    with args.output.open("x") as output:
        output.write(result)
    print(
        json.dumps(
            {
                "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
                "output_sha256": hashlib.sha256(result.encode()).hexdigest(),
            }
        )
    )


if __name__ == "__main__":
    main()
