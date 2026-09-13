"""Mixed exact/binary64 source-transparent compiler witness."""

from __future__ import annotations

from sagejs.native import Float64Buffer, checked_float64, native


@native
def truncate_float(value: Float64Buffer) -> int:
    """Use Python truncation, including arbitrary-size integer results."""
    return int(value[0])


@native
def indexed_float(value: Float64Buffer, index: int) -> int:
    value[index] /= 2.0
    return int(value[index])


@native
def mutate_float(value: Float64Buffer) -> int:
    value[0] = 100.0
    return 0


@native
def assignment_order(value: Float64Buffer) -> int:
    value[mutate_float(value)] = value[0]
    return int(value[0])


@native
def augmented_order(value: Float64Buffer) -> int:
    value[0] += checked_float64(mutate_float(value))
    return int(value[0])


def approximate_score(left: float, right: float) -> float:
    """Compute one pure approximate scheduling score."""
    centered = left - right
    return centered * centered + (left + right) / 2.0


@native
def exact_with_float64_sidecar(
    coordinate: Integer,
    sidecar: Float64Buffer,
) -> Integer:
    """Schedule with binary64 while retaining exact publication authority."""
    approximate = checked_float64(coordinate)
    previous = sidecar[0]
    score = approximate_score(approximate, previous)
    sidecar[1] = score
    sidecar[2] = score / 2.0
    if score > 0.0:
        return coordinate + 1
    return coordinate - 1
