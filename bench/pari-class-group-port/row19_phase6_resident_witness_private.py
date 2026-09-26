"""Exact factored principal witnesses for row 19's Smith generators."""

from typing import TypedDict

from sagejs.native import Int64Buffer, IntegerBuffer, native, uint64


class Row19WitnessManifest(TypedDict):
    factor_count: uint64
    relation_count: uint64
    class_dimension: uint64


@native
def pari_row19_phase6_resident_witness_private(
    manifest: Row19WitnessManifest,
    raw_presentation: IntegerBuffer,
    m1: IntegerBuffer,
    uir: IntegerBuffer,
    invariants: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_generators: IntegerBuffer,
    terminal_permutation: Int64Buffer,
    coefficients_output: IntegerBuffer,
    valuations_output: IntegerBuffer,
    support_output: Int64Buffer,
    state_output: Int64Buffer,
) -> int:
    """Compose `rawPresentation * M1` and replay all principal equalities."""
    if (
        manifest["factor_count"] != 424
        or manifest["relation_count"] != 430
        or manifest["class_dimension"] != 9
        or len(raw_presentation) < 3870
        or len(m1) < 81
        or len(uir) < 81
        or len(invariants) < 9
        or len(relation_records) < 182320
        or len(relation_generators) < 1290
        or len(terminal_permutation) < 424
        or len(coefficients_output) < 3870
        or len(valuations_output) < 3816
        or len(support_output) < 9
        or len(state_output) < 10
    ):
        raise ValueError("unsupported row-19 resident witness boundary")
    total_support = 0
    maximum_bits = 0
    for generator in range(9):
        support = 0
        for relation in range(430):
            coefficient = 0
            for column in range(9):
                coefficient += (
                    raw_presentation[column * 430 + relation]
                    * m1[generator * 9 + column]
                )
            coefficients_output[generator * 430 + relation] = coefficient
            if coefficient != 0:
                support += 1
                if (
                    relation_generators[3 * relation] == 0
                    and relation_generators[3 * relation + 1] == 0
                    and relation_generators[3 * relation + 2] == 0
                ):
                    state_output[0] = 1
                    state_output[1] = generator
                    state_output[2] = relation
                    return 1
                absolute = coefficient
                if absolute < 0:
                    absolute = -absolute
                bits = 0
                while absolute != 0:
                    absolute //= 2
                    bits += 1
                if bits > maximum_bits:
                    maximum_bits = bits
        if support == 0:
            state_output[0] = 2
            state_output[1] = generator
            return 2
        support_output[generator] = support
        total_support += support
        for row in range(424):
            valuation = 0
            for relation in range(430):
                valuation += (
                    relation_records[relation * 424 + row]
                    * coefficients_output[generator * 430 + relation]
                )
            valuations_output[generator * 424 + row] = valuation
            expected = 0
            for coordinate in range(9):
                if terminal_permutation[coordinate] - 1 == row:
                    expected = invariants[generator] * uir[generator * 9 + coordinate]
            if valuation != expected:
                state_output[0] = 3
                state_output[1] = generator
                state_output[2] = row
                return 3
    for i in range(10):
        state_output[i] = 0
    state_output[0] = 0
    state_output[1] = 9
    state_output[2] = 430
    state_output[3] = 424
    state_output[4] = total_support
    state_output[5] = maximum_bits
    state_output[6] = 9 * 424
    state_output[7] = 9 * 430
    state_output[8] = 1
    state_output[9] = 1
    return 0


__all__ = ["pari_row19_phase6_resident_witness_private"]
