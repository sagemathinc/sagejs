"""Bound cached higher ideal powers; keep every prime basis resident."""

import argparse
import ast
import hashlib
import json
import re
from pathlib import Path


HELPER = '''def _cubic_cached_ideal_power(
    layout: CubicStorageLayout, workspace: NativeIntegerVector,
    factor_index: uint64, exponent: uint64,
    hnf_source: FmpzMatrix, hnf_result: FmpzMatrix,
) -> uint64:
    """Borrow P^exponent until the next cache lookup or prime-basis mutation.

    P itself is permanently resident. Each direct-mapped cache slot owns a
    prefix P^2,...,P^depth and a factor identity. Eviction discards only
    derived lattices. The same exact ideal product reconstructs every miss;
    only a successful multiplication advances the published prefix depth.
    """
    missing: uint64 = 0
    if factor_index >= layout.factors or exponent < 1 or exponent > 12:
        return missing
    base: uint64 = layout.power + 9 * factor_index
    if base + 9 > len(workspace):
        return missing
    if exponent == 1:
        return base
    if layout.power_cache_slots == 0:
        return missing
    slot: uint64 = factor_index % layout.power_cache_slots
    header: uint64 = layout.power_cache + 101 * slot
    if header + 101 > len(workspace):
        return missing
    key = workspace[header]
    depth = workspace[header + 1]
    if key < 0 or key > layout.factors:
        return missing
    if (key == 0 and depth != 0) or (key != 0 and (depth < 1 or depth > 12)):
        return missing
    if key != factor_index + 1:
        workspace[header] = factor_index + 1
        workspace[header + 1] = 1
        depth = 1
    stored: uint64 = checked_uint64(depth)
    while stored < exponent:
        previous: uint64 = base
        if stored > 1:
            previous = header + 2 + 9 * (stored - 2)
        destination: uint64 = header + 2 + 9 * (stored - 1)
        if not _cubic_ideal_product(
            layout, workspace, previous, base, destination, hnf_source, hnf_result,
        ):
            return missing
        stored += 1
        workspace[header + 1] = stored
    return header + 2 + 9 * (exponent - 2)


'''


def transform(source):
    def once(old, new):
        nonlocal source
        if source.count(old) != 1:
            raise ValueError("unexpected source anchor: " + old[:100])
        source = source.replace(old, new)

    once(
        "    compound: uint64\n",
        "    compound: uint64\n    power_cache: uint64\n    power_cache_slots: uint64\n",
    )
    once(
        "    layout_hnf: uint64 = layout_power + 108 * factor_capacity + 2\n",
        """    layout_cache_slots: uint64 = 32
    if factor_capacity < layout_cache_slots:
        layout_cache_slots = factor_capacity
    layout_cache: uint64 = layout_power + 9 * factor_capacity
    layout_hnf: uint64 = layout_cache + 101 * layout_cache_slots + 2
""",
    )
    once(
        "        layout_norm, layout_compound,\n",
        "        layout_norm, layout_compound, layout_cache, layout_cache_slots,\n",
    )
    source, count = re.subn(r"(\b\w+) \* _CUBIC_MAX_POWERS \* 9", r"\1 * 9", source)
    if count not in (13, 16):
        raise ValueError(f"unexpected prime-basis references: {count}")

    start = source.index(
        "                while valid_relation and stored_valuation < rational_valuation:"
    )
    end = source.index("                residue_degree = ", start)
    source = (
        source[:start]
        + """                if valid_relation and rational_valuation > 0:
                    cached_power: uint64 = _cubic_cached_ideal_power(
                        layout, workspace, factor_index, checked_uint64(rational_valuation),
                        hnf_source, hnf_result,
                    )
                    if cached_power == 0:
                        valid_relation = False
                if rational_valuation > stored_valuation:
                    stored_valuation = checked_uint64(rational_valuation)
                workspace[factor_base + 6] = stored_valuation
"""
        + source[end:]
    )
    once(
        """                        power_base + 9 * power_index,
                        coordinate_zero,""",
        """                        _cubic_cached_ideal_power(
                            layout, workspace, factor_index, power_index + 1,
                            hnf_source, hnf_result,
                        ),
                        coordinate_zero,""",
    )
    # The first cache fill above succeeded; later lookups in the same slot do
    # not mutate/evict or perform another product while testing membership.
    once(
        """                            if not _cubic_ideal_product(
                                layout, workspace,
                                power_base,
                                power_base,
                                power_base + 9,
                                hnf_source,
                                hnf_result,
                            ):
                                return False
""",
        """                            square_basis: uint64 = _cubic_cached_ideal_power(
                                layout, workspace, local_factor, 2,
                                hnf_source, hnf_result,
                            )
                            if square_basis == 0:
                                return False
""",
    )
    once(
        """                                power_base + 9,
                                prime * identity_zero,""",
        """                                square_basis,
                                prime * identity_zero,""",
    )

    # Preserve prewarming and its failure semantics. These loops now warm a
    # bounded cache rather than reserving twelve powers for every ideal.
    tree = ast.parse(source)
    loops = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.While)
        and ast.unparse(n.test) == "power_index < planned_valuation"
    ]
    if len(loops) != 2:
        raise ValueError("expected two planned-power prewarming loops")
    lines = source.splitlines(keepends=True)
    for n in sorted(loops, key=lambda n: n.lineno, reverse=True):
        indent = " " * n.col_offset
        replacement = """if planned_valuation > 1:
    planned_power: uint64 = _cubic_cached_ideal_power(
        layout, workspace, factor_index, checked_uint64(planned_valuation),
        hnf_source, hnf_result,
    )
    if planned_power == 0:
        return False
"""
        lines[n.lineno - 1 : n.end_lineno] = [
            indent + l + "\n" for l in replacement.splitlines()
        ]
    source = "".join(lines)
    once(
        "def _cubic_prime_ideal_power_basis(",
        HELPER + "def _cubic_prime_ideal_power_basis(",
    )
    ast.parse(source)
    if re.search(r"power_base \+ 9 \*", source):
        raise ValueError("unconverted higher-power consumer")
    return source


if __name__ == "__main__":
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
                "result_sha256": hashlib.sha256(result.encode()).hexdigest(),
                "bytes": len(result.encode()),
                "cache_slots": 32,
                "scope": "Research source copy; unchanged exact certificates and arena budgets.",
            }
        )
    )
