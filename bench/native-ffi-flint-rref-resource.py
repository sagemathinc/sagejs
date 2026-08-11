"""Mixed packed-matrix and retained-resource FFI witness."""

from typing import Tuple

from sagejs.ffi.flint import (
    fmpq_rref_result,
    fmpq_rref_result_compute,
    fmpq_rref_result_denominator_word_capacity,
    fmpq_rref_result_export,
    fmpq_rref_result_numerator_word_capacity,
    fmpq_rref_result_rank,
)
from sagejs.native import IntegerBuffer, native, uint64


@native
def retained_rref_summary(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> Tuple[uint64, uint64, uint64]:
    result = fmpq_rref_result(rows, columns)
    computed = fmpq_rref_result_compute(
        result,
        source_numerators,
        source_denominators,
        rows,
        columns,
    )
    numerator_capacity = fmpq_rref_result_numerator_word_capacity(result)
    denominator_capacity = fmpq_rref_result_denominator_word_capacity(result)
    exported = fmpq_rref_result_export(
        output_numerators,
        output_denominators,
        result,
        rows,
        columns,
    )
    return (
        fmpq_rref_result_rank(result),
        numerator_capacity,
        denominator_capacity,
    )
