from __future__ import annotations


def _cubic_dependency_logs_certify_torsion(
    dependencies: FmpzMatrix,
    logs: FmpzMatrix,
    dependency_count: uint64,
    relation_count: uint64,
    scale: int,
) -> bool:
    """Check the one-fifth log certificate for an authenticated kernel basis.

    This arithmetic predicate does not authenticate the principal equalities,
    kernel basis, or log enclosures. The caller must establish those facts.
    False is inconclusive, never a proof of a non-torsion unit.
    """
    if scale <= 0 or dependency_count == 0 or relation_count == 0:
        return False
    relation_index: uint64 = 0
    while relation_index < relation_count:
        if logs[relation_index, 0] > logs[relation_index, 1]:
            return False
        relation_index += 1
    dependency_row: uint64 = 0
    while dependency_row < dependency_count:
        lower = 0
        upper = 0
        relation_index = 0
        while relation_index < relation_count:
            exponent = dependencies[dependency_row, relation_index]
            if exponent > 0:
                lower += exponent * logs[relation_index, 0]
                upper += exponent * logs[relation_index, 1]
            elif exponent < 0:
                lower += exponent * logs[relation_index, 1]
                upper += exponent * logs[relation_index, 0]
            relation_index += 1
        if 5 * lower < -scale or 5 * upper > scale:
            return False
        dependency_row += 1
    return True
