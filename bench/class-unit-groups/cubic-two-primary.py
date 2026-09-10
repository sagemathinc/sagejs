# sagejs: native-bitwise
"""Exact parity-quotient discovery hints; never class-group certification.

The rows are an append-only, independently authenticated principal-relation
ledger. The caller owns a zero-initialized 1 by (factor_count + 2) matrix:
one arbitrary-precision bitset per pivot, followed by rank and processed count.
Its entries are private state, not a certificate accepted from an untrusted
caller. See docs/cubic-analytic-schedule.md for the invariant and limitations.

These are research helpers. The arbitrary-precision reference still requires
exact-integer bitwise lowering. The word implementation uses existing uint64
operations; no production dispatch or compiler guard is changed here.
"""

from sagejs.ffi.flint import FmpzMatrix
from sagejs.native import UInt64Buffer, checked_uint64, uint64


def parity_word_prepare(
    relations: FmpzMatrix,
    state: UInt64Buffer,
    row: uint64,
    factor_count: uint64,
    base: uint64,
    capacity: uint64,
) -> uint64:
    """Reduce a proposal without modifying the retained-ledger parity basis.

    Private state has `capacity` pivot rows and one proposal row, each with
    `ceil(capacity / 64)` words. The caller checks dimensions and zeroes state
    before the first retained row. Return `factor_count` for dependence, or
    the new pivot column. Only `parity_word_commit` publishes a pivot, after
    the caller decides to retain this exact proposal. No intervening prepare
    may overwrite the proposal scratch before its commit.
    """
    words: uint64 = (capacity + 63) // 64
    scratch: uint64 = base + capacity * words
    word: uint64 = 0
    while word < words:
        state[scratch + word] = 0
        word += 1
    column: uint64 = 0
    one: uint64 = 1
    while column < factor_count:
        if relations[row, column] % 2 != 0:
            word = column // 64
            bit: uint64 = one << (column % 64)
            state[scratch + word] = state[scratch + word] | bit
        column += 1
    column = 0
    while column < factor_count:
        word = column // 64
        bit = one << (column % 64)
        if state[scratch + word] & bit != 0:
            pivot: uint64 = base + column * words
            if state[pivot + word] & bit == 0:
                return column
            while word < words:
                state[scratch + word] = state[scratch + word] ^ state[pivot + word]
                word += 1
        column += 1
    return factor_count


def parity_word_commit(
    state: UInt64Buffer,
    pivot: uint64,
    factor_count: uint64,
    base: uint64,
    capacity: uint64,
) -> bool:
    """Publish the prepared residual only for an actually retained relation."""
    if pivot < factor_count:
        words: uint64 = (capacity + 63) // 64
        scratch: uint64 = base + capacity * words
        destination: uint64 = base + pivot * words
        word: uint64 = 0
        while word < words:
            state[destination + word] = state[scratch + word]
            word += 1
        return True
    return False


def parity_relation_basis(
    relations: FmpzMatrix,
    basis: FmpzMatrix,
    relation_count: uint64,
    factor_count: uint64,
) -> int:
    """Extend a private row-echelon basis over F_2 without replaying old rows.

    Each nonzero pivot has its least set bit at that pivot's column. XOR with
    an earlier pivot removes a leading entry and preserves the accumulated
    row span. Appending a nonzero residual increases rank by exactly one.
    The old ledger prefix and basis must be unchanged between calls. Basic
    cursor checks below do not authenticate a forged or modified basis.
    """
    rank = basis[0, factor_count]
    processed = basis[0, factor_count + 1]
    if rank < 0 or rank > factor_count or processed < 0 or processed > relation_count:
        return -1
    row: uint64 = checked_uint64(processed)
    while row < relation_count:
        encoded = 0
        bit = 1
        column: uint64 = 0
        while column < factor_count:
            if relations[row, column] % 2 != 0:
                encoded += bit
            bit *= 2
            column += 1
        bit = 1
        column = 0
        while encoded != 0 and column < factor_count:
            if encoded & bit != 0:
                pivot = basis[0, column]
                if pivot == 0:
                    basis[0, column] = encoded
                    rank += 1
                    break
                encoded = encoded ^ pivot
            bit *= 2
            column += 1
        row += 1
    basis[0, factor_count] = rank
    basis[0, factor_count + 1] = relation_count
    return rank


def parity_quotient_reduce(
    basis: FmpzMatrix, encoded: int, factor_count: uint64
) -> int:
    """Return the unique representative supported on nonpivot columns.

    This tests membership only in the parity span of the retained relations.
    A zero residual does not establish integer-lattice membership. A nonzero
    residual does not establish a missing principal relation: genuine class
    group two-torsion may survive in this quotient.
    """
    if encoded < 0:
        return -1
    bit = 1
    column: uint64 = 0
    while column < factor_count:
        pivot = basis[0, column]
        if encoded & bit != 0 and pivot != 0:
            encoded = encoded ^ pivot
        bit *= 2
        column += 1
    if encoded >= bit:
        return -1
    return encoded
