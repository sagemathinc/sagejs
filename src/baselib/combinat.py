"""Readable Sage-compatible enumerative combinatorics foundations.

The combinatorics area follows the same shape as the rest of Sage.js: an
enumerated set is an ordinary parent, its members are ordinary elements, and
every count is exact.  A combinatorial class therefore answers `cardinality`
without materializing its members, iterates in Sage's documented order, and
supports the `rank`/`unrank` pair so a member can be addressed by position.
Alongside the partition classes, this module also provides Sage's classical
counting functions -- `fibonacci`, the Lucas sequences, `catalan_number`,
`bell_number`, the two kinds of Stirling numbers, `multinomial`, the falling
and rising factorials, `number_of_derangements`, `euler_number`,
`harmonic_number`, and `q_binomial` -- as exact scalar functions rather than
combinatorial classes.

Constrained counting and addressing share one bounded dynamic-programming
table, so `cardinality`, `unrank`, `rank`, and `random_element` all agree by
construction.  Unconstrained counts use FLINT's Rademacher implementation;
Euler's pentagonal recurrence remains an explicit exact capability fallback.
The scalar counting functions instead fill a small triangular table (Stirling
numbers, Bell numbers, Euler numbers) or an `O(log n)`/`O(n)` linear
recurrence (Fibonacci, Lucas sequences, derangements) with the same
bigint-safe accumulation pattern.

### Provenance

The public API, the enumeration order, and the documentation prose follow
SageMath's `sage.combinat.partition` and `sage.combinat.combinat`, checked
against SageMath 10.9.  No SageMath source was transliterated: the algorithms
are implemented from their published descriptions, recorded per name in the
documentation registry.

- Counting `p(n)` uses the recurrence from Euler's pentagonal number theorem
  (Andrews, *The Theory of Partitions*, 1976).
- Constrained counting, `rank`, and `unrank` use counting-driven ranking over
  a recursively counted set (Kreher and Stinson, *Combinatorial Algorithms*,
  1999).
- `random_element` selects a uniform index and descends the same count table
  (the classical technique described by Nijenhuis and Wilf, *Combinatorial
  Algorithms for Computers and Calculators*, 1978).
- `fibonacci` uses Dijkstra's fast-doubling identities (*In Honour of
  Fibonacci*, EWD654, 1978).
- `lucas_number1` and `lucas_number2` use the linear Lucas-sequence
  recurrences (Crandall and Pomerance, *Prime Numbers: A Computational
  Perspective*, 2005).
- `catalan_number` uses the closed form `binomial(2n, n) / (n + 1)` (Stanley,
  *Catalan Numbers*, 2015).
- `bell_number` uses the Bell triangle (Rota, *The Number of Partitions of a
  Set*, 1964).
- `stirling_number1`, `stirling_number2`, `multinomial`, the falling and
  rising factorials, and `harmonic_number` use the classical triangular
  recurrences and notation of Graham, Knuth, and Patashnik, *Concrete
  Mathematics*, 1994.
- `number_of_derangements` and `euler_number` follow Comtet, *Advanced
  Combinatorics*, 1974.
- `q_binomial` (`gaussian_binomial`) uses the q-Pascal recurrence for
  Gaussian binomial coefficients (Andrews, *The Theory of Partitions*, 1976,
  Chapter 3).

Sharing a single memo across all four partition operations is a Sage.js
choice, not one inherited from any of those sources.

### Performance

Counting is delegated to FLINT's `arith_number_of_partitions`, the same
Hardy-Ramanujan-Rademacher implementation SageMath uses.  Once the routine is
bound, `p(10^6)` costs about 4 ms here against SageMath's 3 ms and PARI/GP's
7 ms; the first count in a process pays about 150 ms to bind it.  A host
without FLINT falls back to the pentagonal recurrence, which is `O(n^(3/2))`
big-integer additions because it computes every partition number below its
argument.  Both paths are exact, and `Partitions_n._portable_cardinality`
exposes the second one for differential testing.

Enumeration, ranking, and sampling stay in ordinary Python.  Enumeration walks
from one member to the next in place instead of descending a fresh recursion,
and constrained counting fills a table iteratively rather than memoizing a
recursion, so ranking and sampling pay for one table and then answer in
milliseconds.  `bench/compare-partitions.cjs` measures all of it against
SageMath and PARI/GP.

The scalar counting functions are ordinary Python with no native or FFI
backend.  `fibonacci` is `O(log n)` big-integer multiplications; the Lucas
sequences and `number_of_derangements` are `O(n)` big-integer operations;
`bell_number`, `stirling_number1`, `stirling_number2`, and `euler_number`
fill an `O(n*k)` (respectively `O(n^2)`) triangular table of big integers per
call, with no cross-call memoization.  None of these paths call FLINT, so
they stay well below FLINT-backed partition counting for large `n`; the
`bignum` regression cases in `test/combinat-counting.cjs` exist precisely to
keep every one of them exact past the `2^53` double-precision boundary rather
than fast at unbounded `n`.
"""

# Ruff's WASM build reports I001 while proposing this same import block.
# ruff: noqa: I001

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime


# A uniform random index is drawn from 30-bit words so the rejection loop
# stays exact for cardinalities far above the double-precision range.
_COMBINAT_RANDOM_WORD = 1073741824

# The triangular size table stores arbitrary-precision counts and persists on
# a cached `Partitions(n)` parent.  One million cells is already a substantial
# long-lived allocation, while covering all ranking/sampling workloads through
# n=1,412.  Larger requests fail before allocating; cardinality remains
# available through FLINT and enumeration remains streaming.
_PARTITION_TABLE_MAX_CELLS = 1000000


class _CombinatPositiveInfinity:
    def __repr__(self) -> str:
        return "+Infinity"

    __str__ = __repr__
    toString = __repr__

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _CombinatPositiveInfinity)

    def __lt__(self, other: object) -> bool:
        del other
        return False

    def __gt__(self, other: object) -> bool:
        return not isinstance(other, _CombinatPositiveInfinity)


_combinat_infinity = _CombinatPositiveInfinity()


class _CombinatState:
    """Module-level caches shared by every combinatorial class."""

    def __init__(self) -> None:
        # Exact `p(0), p(1), ...` extended by the pentagonal recurrence.
        self.partition_counts = [runtime.bigint(1)]
        self.partitions_all: Any = None
        self.partitions_by_size = {}
        # None until the generated backend's declared operation is inspected.
        self.native_counts: Any = None
        self.last_count_route: Any = None


_combinat_state = _CombinatState()


def _partition_extend_counts(limit: int) -> None:
    """Extend the cached partition numbers so `p(limit)` is available."""
    for value in range(len(_combinat_state.partition_counts), limit + 1):
        total = runtime.bigint(0)
        index = 1
        while True:
            first = index * (3 * index - 1) // 2
            if first > value:
                break
            term = _combinat_state.partition_counts[value - first]
            second = first + index
            if second <= value:
                term = runtime.native_add(
                    term, _combinat_state.partition_counts[value - second]
                )
            if index % 2 == 1:
                total = runtime.native_add(total, term)
            else:
                total = runtime.native_sub(total, term)
            index += 1
        _combinat_state.partition_counts.append(total)


def _partition_count_native(value: int) -> Any:
    """Return `p(value)` from declared FLINT, or undefined when absent.

    Capability absence is checked before calling the generated declaration.
    Once the operation exists, every binding, marshalling, and FLINT failure
    propagates.  In particular, a broken accelerator can never silently and
    permanently turn a large count into the much slower recurrence.
    """
    backend = runtime.flint_backend()
    operation = runtime.reflect.get(backend, "numberOfPartitions")
    available = runtime.jstype(operation) == "function"
    _combinat_state.native_counts = available
    if not available:
        _combinat_state.last_count_route = "portable-capability-unavailable"
        return runtime.undefined

    module = __import__("sagejs.ffi.flint", fromlist=["flint"])
    answer = module.arith_number_of_partitions(value)
    _combinat_state.last_count_route = "declared-flint"
    return answer


def _partition_count_portable(value: int) -> Any:
    """Return `p(value)` from the pentagonal recurrence, never from FLINT."""
    _partition_extend_counts(value)
    return _combinat_state.partition_counts[value]


def _combinat_exact_integer(value: Any, name: str) -> int:
    """Return one exact machine integer or reject coercive truncation."""
    if not runtime.is_exact_integer(value):
        raise TypeError(name + " must be an integer")
    return int(value)


def _partition_count(value: int) -> Any:
    """
    Return the exact number of partitions of `value`.

    FLINT evaluates the Hardy-Ramanujan-Rademacher formula, which stays fast
    for arguments far past the reach of the recurrence.  The pentagonal
    recurrence remains the explicit capability-unavailable answer, and both
    are exact, so an exceptional host differs in speed and not in results.
    """
    native = _partition_count_native(value)
    if native is not runtime.undefined:
        return native
    return _partition_count_portable(value)


def _combinat_random_word() -> int:
    """Draw one 30-bit word from the process-wide Sage random source."""
    random_function = runtime.reflect.get(runtime.global_object, "random")
    value = float(runtime.reflect.apply(random_function, runtime.undefined, []))
    if value < 0.0:
        value = 0.0
    if value >= 1.0:
        value = 0.99999999
    return int(runtime.math.floor(value * float(_COMBINAT_RANDOM_WORD)))


def _combinat_random_below(bound: Any) -> Any:
    """Return a uniform big integer in `[0, bound)` by rejection sampling."""
    word = runtime.bigint(_COMBINAT_RANDOM_WORD)
    span = word
    words = 1
    while runtime.native_lt(span, bound):
        span = runtime.native_mul(span, word)
        words += 1
    # Reject the incomplete final block so every residue stays equally likely.
    usable = runtime.native_mul(runtime.native_div(span, bound), bound)
    while True:
        draw = runtime.bigint(0)
        for _index in range(words):
            draw = runtime.native_add(
                runtime.native_mul(draw, word),
                runtime.bigint(_combinat_random_word()),
            )
        if runtime.native_lt(draw, usable):
            return runtime.native_mod(draw, bound)


def _partition_entries(value: Any) -> list[int]:
    """Return the parts of a partition, a list, or a tuple as plain integers."""
    if isinstance(value, Partition):
        return value._entries[:]
    if not isinstance(value, (list, tuple)):
        raise TypeError("a partition is built from a list or tuple of parts")
    entries = []
    for part in value:
        if not runtime.is_exact_integer(part):
            raise TypeError("partition parts must be integers")
        entries.append(int(part))
    return entries


def _partition_validate(entries: list[int]) -> None:
    """Reject anything which is not a weakly decreasing sequence of parts."""
    previous = None
    for part in entries:
        if part <= 0:
            raise ValueError("partition parts must be positive")
        if previous is not None and part > previous:
            raise ValueError("partition parts must be weakly decreasing")
        previous = part


def _partition_is_weakly_decreasing(entries: list[int]) -> bool:
    previous = None
    for part in entries:
        if part <= 0:
            return False
        if previous is not None and part > previous:
            return False
        previous = part
    return True


class Partition(sage.Element):
    r"""
    A partition of a nonnegative integer.

    A partition is a weakly decreasing list of positive integers.  Its parts
    are ordinary Sage.js integers, so a partition interoperates with the rest
    of the library without a conversion step.

    ### Input

    - `entries` -- a list or tuple of weakly decreasing positive integers
    - `parent` -- optional owning combinatorial class

    ### Examples

    ```sage
        sage: Partition([3, 1])
        [3, 1]
        sage: Partition([3, 1]).size()
        4
        sage: Partition([3, 1]).conjugate()
        [2, 1, 1]
    ```

    Parts must be weakly decreasing, exactly as in Sage; `Partition([1, 3])`
    raises `ValueError`.

    This API and documentation are adapted from
    `sage.combinat.partition.Partition` (GPL-2.0-or-later).
    """

    def __init__(self, entries: Any, parent: Any = None) -> None:
        parts = _partition_entries(entries)
        _partition_validate(parts)
        self._entries = parts
        self._parent = _partitions_all() if parent is None else parent

    def __repr__(self) -> str:
        return "[" + ", ".join([str(part) for part in self._entries]) + "]"

    __str__ = __repr__
    toString = __repr__

    def _latex_(self) -> str:
        return "(" + ", ".join([str(part) for part in self._entries]) + ")"

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Partition):
            return self._entries == other._entries
        if isinstance(other, (list, tuple)):
            return self._entries == [part for part in other]
        return False

    def __ne__(self, other: object) -> bool:
        return not self.__eq__(other)

    def __len__(self) -> int:
        return len(self._entries)

    def __iter__(self) -> Iterator[int]:
        return iter(self._entries)

    def __getitem__(self, index: Any) -> Any:
        return self._entries[index]

    def __contains__(self, part: object) -> bool:
        return part in self._entries

    def size(self) -> int:
        """
        Return the integer partitioned by `self`.

        ### Examples

        ```sage
            sage: Partition([4, 2, 1]).size()
            7
        ```
        """
        total = 0
        for part in self._entries:
            total += part
        return total

    def length(self) -> int:
        """
        Return the number of parts.

        ### Examples

        ```sage
            sage: Partition([4, 2, 1]).length()
            3
        ```
        """
        return len(self._entries)

    def to_list(self) -> list[int]:
        """
        Return the parts as an ordinary list.

        ### Examples

        ```sage
            sage: Partition([4, 2, 1]).to_list()
            [4, 2, 1]
        ```
        """
        return self._entries[:]

    def conjugate(self) -> Partition:
        """
        Return the conjugate partition, the transpose of the Ferrers diagram.

        ### Examples

        ```sage
            sage: Partition([4, 2, 1]).conjugate()
            [3, 2, 1, 1]
            sage: Partition([4, 2, 1]).conjugate().conjugate()
            [4, 2, 1]
        ```
        """
        if not self._entries:
            return Partition([], self._parent)
        columns = []
        for index in range(self._entries[0]):
            height = 0
            for part in self._entries:
                if part > index:
                    height += 1
            columns.append(height)
        return Partition(columns, self._parent)

    def to_exp(self, minimum_length: int = 0) -> list[int]:
        """
        Return part multiplicities, where entry `i` counts the parts equal to
        `i + 1`.

        ### Input

        - `minimum_length` -- pad the result to at least this length

        ### Examples

        ```sage
            sage: Partition([3, 2, 2, 1]).to_exp()
            [1, 2, 1]
            sage: Partition([3, 2, 2, 1]).to_exp(5)
            [1, 2, 1, 0, 0]
        ```
        """
        minimum = _combinat_exact_integer(minimum_length, "minimum_length")
        if minimum < 0:
            raise ValueError("minimum_length must be nonnegative")
        largest = self._entries[0] if self._entries else 0
        width = largest if largest > minimum else minimum
        counts = [0] * width
        for part in self._entries:
            counts[part - 1] += 1
        return counts

    def cells(self) -> list[tuple[int, int]]:
        """
        Return the coordinates of the cells of the Ferrers diagram.

        ### Examples

        ```sage
            sage: Partition([2, 1]).cells()
            [(0, 0), (0, 1), (1, 0)]
        ```
        """
        coordinates = []
        for row in range(len(self._entries)):
            for column in range(self._entries[row]):
                coordinates.append(runtime.math_tuple([row, column]))
        return coordinates

    def hook_length(self, row: int, column: int) -> int:
        """
        Return the hook length of the cell in the given row and column.

        ### Examples

        ```sage
            sage: Partition([3, 2, 1]).hook_length(0, 0)
            5
            sage: Partition([3, 2, 1]).hook_length(1, 1)
            1
        ```
        """
        index_row = _combinat_exact_integer(row, "row")
        index_column = _combinat_exact_integer(column, "column")
        if (
            index_row < 0
            or index_row >= len(self._entries)
            or index_column < 0
            or index_column >= self._entries[index_row]
        ):
            raise IndexError("the cell is outside the Ferrers diagram")
        arm = self._entries[index_row] - index_column - 1
        leg = 0
        for part in self._entries[index_row + 1 :]:
            if part > index_column:
                leg += 1
        return arm + leg + 1

    def hook_lengths(self) -> list[list[int]]:
        """
        Return the hook lengths of every cell, row by row.

        ### Examples

        ```sage
            sage: Partition([3, 2, 1]).hook_lengths()
            [[5, 3, 1], [3, 1], [1]]
        ```
        """
        rows = []
        for row in range(len(self._entries)):
            lengths = []
            for column in range(self._entries[row]):
                lengths.append(self.hook_length(row, column))
            rows.append(lengths)
        return rows

    def dominates(self, other: Any) -> bool:
        """
        Return whether `self` dominates `other` in the dominance order.

        ### Examples

        ```sage
            sage: Partition([3, 1]).dominates([2, 2])
            True
            sage: Partition([2, 2]).dominates([3, 1])
            False
        ```
        """
        entries = _partition_entries(other)
        _partition_validate(entries)
        width = len(self._entries)
        if len(entries) > width:
            width = len(entries)
        left = 0
        right = 0
        for index in range(width):
            if index < len(self._entries):
                left += self._entries[index]
            if index < len(entries):
                right += entries[index]
            if left < right:
                return False
        return True

    def ferrers_diagram(self) -> str:
        """
        Return the Ferrers diagram as text, one row of asterisks per part.

        ### Examples

        ```sage
            sage: print(Partition([3, 1]).ferrers_diagram())
            ***
            *
        ```
        """
        return "\n".join(["*" * part for part in self._entries])


def _partition_trusted(entries: list[int], parent: Any) -> Partition:
    """
    Build a partition from parts this module generated.

    The public constructor copies and validates its input, which is right for a
    caller's list and pure overhead for parts an enumerator just produced in
    order.
    """
    answer = Partition([], parent)
    answer._entries = entries
    return answer


class _PartitionsBase(sage.Parent):
    """Shared behavior for the combinatorial classes of partitions."""

    def _element(self, entries: list[int]) -> Partition:
        return _partition_trusted(entries, self)

    def __contains__(self, value: object) -> bool:
        raise NotImplementedError("membership is defined by each partition class")

    def __iter__(self) -> Iterator[Partition]:
        raise NotImplementedError("enumeration is defined by each partition class")

    def __call__(self, entries: Any = None) -> Partition:
        if entries is None:
            raise TypeError("a partition is built from a list or tuple of parts")
        candidate = _partition_entries(entries)
        _partition_validate(candidate)
        if candidate not in self:
            raise ValueError("the partition is not a member of " + repr(self))
        return self._element(candidate)

    def list(self) -> list[Partition]:
        """
        Return every member of a finite combinatorial class.

        ### Examples

        ```sage
            sage: Partitions(3).list()
            [[3], [2, 1], [1, 1, 1]]
        ```
        """
        return [entry for entry in self]

    def __str__(self) -> str:
        return self.__repr__()

    def toString(self) -> str:
        return self.__repr__()


class Partitions_all(_PartitionsBase):
    r"""
    The combinatorial class of every partition of every nonnegative integer.

    ### Examples

    ```sage
        sage: Partitions()
        Partitions
        sage: Partitions().cardinality()
        +Infinity
        sage: Partitions().unrank(6)
        [1, 1, 1]
    ```
    """

    def __repr__(self) -> str:
        return "Partitions"

    def cardinality(self) -> Any:
        """Return `+Infinity`; the class of all partitions is infinite."""
        return _combinat_infinity

    def __contains__(self, value: object) -> bool:
        if isinstance(value, Partition):
            return True
        if not isinstance(value, (list, tuple)):
            return False
        entries = []
        for part in value:
            if not runtime.is_exact_integer(part):
                return False
            entries.append(int(part))
        return _partition_is_weakly_decreasing(entries)

    def __iter__(self) -> Iterator[Partition]:
        size = 0
        while True:
            for entry in Partitions(size):
                yield Partition(entry.to_list(), self)
            size += 1

    def first(self) -> Partition:
        """Return the empty partition, the first in the enumeration order."""
        return self._element([])

    def unrank(self, index: Any) -> Partition:
        """
        Return the partition at position `index` of the enumeration.

        ### Examples

        ```sage
            sage: [Partitions().unrank(index) for index in range(5)]
            [[], [1], [2], [1, 1], [3]]
        ```
        """
        position = _combinat_exact_integer(index, "a rank")
        if position < 0:
            raise ValueError("a rank must be nonnegative")
        size = 0
        while True:
            available = Partitions(size)
            count = int(available.cardinality())
            if position < count:
                return Partition(available.unrank(position).to_list(), self)
            position -= count
            size += 1

    def rank(self, value: Any) -> Any:
        """
        Return the position of `value` in the enumeration.

        ### Examples

        ```sage
            sage: Partitions().rank([2, 1])
            5
        ```
        """
        entries = _partition_entries(value)
        _partition_validate(entries)
        total = 0
        for part in entries:
            total += part
        position = 0
        for size in range(total):
            position += int(Partitions(size).cardinality())
        return position + int(Partitions(total).rank(entries))


class Partitions_n(_PartitionsBase):
    r"""
    The combinatorial class of the partitions of a fixed integer.

    Partitions are enumerated in Sage's order: reverse lexicographic, so the
    single largest part comes first and the all-ones partition comes last.

    ### Examples

    ```sage
        sage: Partitions(4)
        Partitions of the integer 4
        sage: Partitions(4).list()
        [[4], [3, 1], [2, 2], [2, 1, 1], [1, 1, 1, 1]]
        sage: Partitions(4).cardinality()
        5
    ```
    """

    def __init__(
        self,
        size: int,
        min_part: int = 1,
        max_part: Any = None,
        min_length: int = 0,
        max_length: Any = None,
        parts_in: Any = None,
    ) -> None:
        self._size = size
        self._min_part = min_part
        self._max_part = size if max_part is None else max_part
        self._min_length = min_length
        self._max_length = size if max_length is None else max_length
        self._parts_in = parts_in
        self._count_memo = {}
        self._table: Any = None

    def _constrained(self) -> bool:
        return (
            self._min_part != 1
            or self._max_part != self._size
            or self._min_length != 0
            or self._max_length != self._size
            or self._parts_in is not None
        )

    def __repr__(self) -> str:
        text = "Partitions of the integer " + str(self._size)
        conditions = []
        if self._min_part != 1:
            conditions.append("min_part=" + str(self._min_part))
        if self._max_part != self._size:
            conditions.append("max_part=" + str(self._max_part))
        if self._min_length == self._max_length and self._min_length != 0:
            conditions.append("length=" + str(self._min_length))
        else:
            if self._min_length != 0:
                conditions.append("min_length=" + str(self._min_length))
            if self._max_length != self._size:
                conditions.append("max_length=" + str(self._max_length))
        if self._parts_in is not None:
            conditions.append(
                "parts_in=[" + ", ".join([str(part) for part in self._parts_in]) + "]"
            )
        if conditions:
            text += " satisfying constraints " + ", ".join(conditions)
        return text

    def _allows(self, part: int) -> bool:
        return self._parts_in is None or part in self._parts_in

    def _length_free(self) -> bool:
        """Return whether only the part sizes, and not the count, constrain."""
        return (
            self._min_length == 0
            and self._max_length >= self._size
            and self._parts_in is None
        )

    def _size_table(self) -> Any:
        """
        Return `f[m][k]`, the partitions of `m` into parts in `[min_part, k]`.

        Filling the triangular table iteratively costs one big-integer addition
        per useful cell.  A reviewed work ceiling rejects quadratic persistent
        allocations before any table row is created.
        """
        if self._table is not None:
            return self._table
        size = self._size
        bound = self._max_part if self._max_part < size else size
        # Sum `min(bound, remaining) + 1` without allocating any rows.
        if size <= bound:
            cells = (size + 1) * (size + 2) // 2
        else:
            cells = (bound + 1) * (bound + 2) // 2
            cells += (size - bound) * (bound + 1)
        if cells > _PARTITION_TABLE_MAX_CELLS:
            raise RuntimeError(
                "partition ranking table requires "
                + str(cells)
                + " cells, exceeding the reviewed maximum "
                + str(_PARTITION_TABLE_MAX_CELLS)
            )
        table = []
        for remaining in range(size + 1):
            row_bound = bound if bound < remaining else remaining
            row = [runtime.bigint(0)] * (row_bound + 1)
            if remaining == 0:
                for part in range(row_bound + 1):
                    row[part] = runtime.bigint(1)
            table.append(row)
        for part in range(self._min_part, bound + 1):
            for remaining in range(part, size + 1):
                total = table[remaining][part - 1]
                previous = remaining - part
                previous_bound = part if part < previous else previous
                total = runtime.native_add(total, table[previous][previous_bound])
                table[remaining][part] = total
        self._table = table
        return table

    def _count(
        self,
        remaining: int,
        max_part: int,
        min_length: int,
        max_length: int,
    ) -> Any:
        """Count the completions of a partially chosen partition."""
        if self._length_free():
            if remaining == 0:
                return runtime.bigint(1)
            if max_part < self._min_part:
                return runtime.bigint(0)
            table = self._size_table()
            bound = max_part if max_part < remaining else remaining
            if bound >= len(table[remaining]):
                bound = len(table[remaining]) - 1
            return table[remaining][bound]
        if remaining == 0:
            return runtime.bigint(1) if min_length <= 0 else runtime.bigint(0)
        if max_length <= 0 or max_part < self._min_part:
            return runtime.bigint(0)
        required = min_length if min_length > 0 else 0
        key = (
            str(remaining)
            + ":"
            + str(max_part)
            + ":"
            + str(required)
            + ":"
            + str(max_length)
        )
        if key in self._count_memo:
            return self._count_memo[key]
        upper = max_part if max_part < remaining else remaining
        total = runtime.bigint(0)
        for first in range(upper, self._min_part - 1, -1):
            if self._allows(first):
                total = runtime.native_add(
                    total,
                    self._count(
                        remaining - first,
                        first,
                        min_length - 1,
                        max_length - 1,
                    ),
                )
        self._count_memo[key] = total
        return total

    def _generate(
        self,
        remaining: int,
        max_part: int,
        min_length: int,
        max_length: int,
    ) -> Iterator[list[int]]:
        """Enumerate the completions of a partially chosen partition."""
        if remaining == 0:
            if min_length <= 0:
                yield []
        elif max_length > 0:
            upper = max_part if max_part < remaining else remaining
            for first in range(upper, self._min_part - 1, -1):
                if self._allows(first):
                    for rest in self._generate(
                        remaining - first,
                        first,
                        min_length - 1,
                        max_length - 1,
                    ):
                        yield [first] + rest

    def _successors(self) -> Iterator[list[int]]:
        """
        Enumerate every partition of the size by repeated succession.

        Each member is produced from the previous one in place rather than by
        descending a fresh recursion, so the cost per member does not grow with
        the depth of the partition.  The order is the same reverse
        lexicographic order the recursive generator produces.
        """
        size = self._size
        if size == 0:
            yield []
        else:
            current = [size]
            while True:
                yield current[:]
                # The tail of ones is what the next member redistributes.
                index = len(current) - 1
                while index >= 0 and current[index] == 1:
                    index -= 1
                if index < 0:
                    break
                total = current[index] + (len(current) - index - 1)
                value = current[index] - 1
                whole = total // value
                rest = total - whole * value
                tail = [value] * whole
                if rest:
                    tail.append(rest)
                current = current[:index] + tail

    def __iter__(self) -> Iterator[Partition]:
        # An unconstrained class is every partition of its size, which the
        # successor walk produces without recursion.
        if not self._constrained():
            for entries in self._successors():
                yield self._element(entries)
        else:
            for entries in self._generate(
                self._size,
                self._max_part,
                self._min_length,
                self._max_length,
            ):
                yield self._element(entries)

    def cardinality(self) -> Any:
        """
        Return the exact number of partitions in this class.

        The unconstrained count uses FLINT's exact Rademacher implementation,
        so it stays fast well beyond the range where listing the partitions is
        practical.  Hosts that explicitly lack the declared operation retain
        the exact pentagonal recurrence.

        ### Examples

        ```sage
            sage: Partitions(4).cardinality()
            5
            sage: Partitions(100).cardinality()
            190569292
            sage: Partitions(5, max_part=3).cardinality()
            5
        ```
        """
        if not self._constrained():
            return runtime.normalize_integer(_partition_count(self._size))
        return runtime.normalize_integer(
            self._count(
                self._size,
                self._max_part,
                self._min_length,
                self._max_length,
            )
        )

    def _portable_cardinality(self) -> Any:
        """
        Return the cardinality without FLINT, for differential testing.

        Unconstrained classes answer from the pentagonal recurrence and
        constrained ones from the memoized recursion over the largest
        remaining part.  Both are exact, so this must agree with
        `cardinality` on every host.
        """
        if not self._constrained():
            return runtime.normalize_integer(_partition_count_portable(self._size))
        return self.cardinality()

    def __contains__(self, value: object) -> bool:
        if isinstance(value, Partition):
            entries = value.to_list()
        elif isinstance(value, (list, tuple)):
            entries = []
            for part in value:
                if not runtime.is_exact_integer(part):
                    return False
                entries.append(int(part))
        else:
            return False
        if not _partition_is_weakly_decreasing(entries):
            return False
        total = 0
        for part in entries:
            total += part
        if total != self._size:
            return False
        if len(entries) < self._min_length or len(entries) > self._max_length:
            return False
        for part in entries:
            if part < self._min_part or part > self._max_part:
                return False
            if not self._allows(part):
                return False
        return True

    def first(self) -> Partition:
        """
        Return the first partition in the enumeration order.

        ### Examples

        ```sage
            sage: Partitions(5).first()
            [5]
        ```
        """
        return self.unrank(0)

    def last(self) -> Partition:
        """
        Return the last partition in the enumeration order.

        ### Examples

        ```sage
            sage: Partitions(5).last()
            [1, 1, 1, 1, 1]
        ```
        """
        count = self._count(
            self._size,
            self._max_part,
            self._min_length,
            self._max_length,
        )
        if not runtime.native_lt(runtime.bigint(0), count):
            raise ValueError("the combinatorial class is empty")
        return self._element(self._select(runtime.native_sub(count, runtime.bigint(1))))

    def _select(self, position: Any) -> list[int]:
        """Return the partition at big-integer position `position`."""
        remaining = self._size
        max_part = self._max_part
        min_length = self._min_length
        max_length = self._max_length
        index = position
        entries = []
        while remaining > 0:
            upper = max_part if max_part < remaining else remaining
            chosen = None
            for first in range(upper, self._min_part - 1, -1):
                if self._allows(first):
                    block = self._count(
                        remaining - first,
                        first,
                        min_length - 1,
                        max_length - 1,
                    )
                    if runtime.native_lt(index, block):
                        chosen = first
                        break
                    index = runtime.native_sub(index, block)
            if chosen is None:
                raise ValueError("a rank must be smaller than the cardinality")
            entries.append(chosen)
            remaining -= chosen
            max_part = chosen
            min_length -= 1
            max_length -= 1
        return entries

    def unrank(self, index: Any) -> Partition:
        """
        Return the partition at position `index` of the enumeration.

        ### Examples

        ```sage
            sage: Partitions(5).unrank(0)
            [5]
            sage: Partitions(5).unrank(3)
            [3, 1, 1]
        ```
        """
        if not runtime.is_exact_integer(index):
            raise TypeError("a rank must be an integer")
        position = runtime.bigint(index)
        if runtime.native_lt(position, runtime.bigint(0)):
            raise ValueError("a rank must be nonnegative")
        count = self._count(
            self._size,
            self._max_part,
            self._min_length,
            self._max_length,
        )
        if not runtime.native_lt(position, count):
            raise ValueError("a rank must be smaller than the cardinality")
        return self._element(self._select(position))

    def rank(self, value: Any) -> Any:
        """
        Return the position of `value` in the enumeration.

        ### Examples

        ```sage
            sage: Partitions(5).rank([3, 1, 1])
            3
            sage: Partitions(5).unrank(Partitions(5).rank([2, 2, 1]))
            [2, 2, 1]
        ```
        """
        entries = _partition_entries(value)
        if entries not in self:
            raise ValueError("the partition is not a member of " + repr(self))
        position = runtime.bigint(0)
        remaining = self._size
        max_part = self._max_part
        min_length = self._min_length
        max_length = self._max_length
        for part in entries:
            upper = max_part if max_part < remaining else remaining
            for first in range(upper, part, -1):
                if self._allows(first):
                    position = runtime.native_add(
                        position,
                        self._count(
                            remaining - first,
                            first,
                            min_length - 1,
                            max_length - 1,
                        ),
                    )
            remaining -= part
            max_part = part
            min_length -= 1
            max_length -= 1
        return runtime.normalize_integer(position)

    def random_element(self) -> Partition:
        """
        Return a uniformly random member of this class.

        The part sizes are chosen one at a time with probability proportional
        to the exact number of completions, so every partition is equally
        likely without enumerating the class.

        ### Examples

        ```sage
            sage: Partitions(6).random_element() in Partitions(6)
            True
            sage: Partitions(6, max_part=2).random_element().to_list()[0] <= 2
            True
        ```
        """
        count = self._count(
            self._size,
            self._max_part,
            self._min_length,
            self._max_length,
        )
        if not runtime.native_lt(runtime.bigint(0), count):
            raise ValueError("the combinatorial class is empty")
        return self._element(self._select(_combinat_random_below(count)))


def _partitions_all() -> Any:
    """Return the shared class of all partitions."""
    if _combinat_state.partitions_all is None:
        _combinat_state.partitions_all = Partitions_all()
    return _combinat_state.partitions_all


def _combinat_setting(constraints: Any, name: str) -> Any:
    """Read one keyword constraint, treating an absent name as `None`."""
    value = runtime.reflect.get(constraints, name)
    return None if value is runtime.undefined else value


def _partitions_sequence(value: Any) -> list[int]:
    entries = []
    if not isinstance(value, (list, tuple)):
        raise TypeError("parts_in must be a list or tuple of positive integers")
    for part in value:
        if not runtime.is_exact_integer(part):
            raise TypeError("parts_in must contain integers")
        if int(part) <= 0:
            raise ValueError("parts_in must contain positive integers")
        entries.append(int(part))
    return entries


def Partitions(size: Any = None, **constraints: Any) -> Any:
    r"""
    Return the combinatorial class of partitions described by the arguments.

    With no argument this is the class of all partitions of all nonnegative
    integers.  With an integer argument it is the class of partitions of that
    integer, optionally restricted by the supported keyword constraints.

    ### Input

    - `size` -- optional nonnegative integer to partition
    - `min_part` -- smallest allowed part
    - `max_part` -- largest allowed part
    - `length` -- exact number of parts
    - `min_length` -- smallest allowed number of parts
    - `max_length` -- largest allowed number of parts
    - `parts_in` -- restrict parts to the given collection of integers

    ### Examples

    ```sage
        sage: Partitions(4).list()
        [[4], [3, 1], [2, 2], [2, 1, 1], [1, 1, 1, 1]]
        sage: Partitions(5, max_part=3).list()
        [[3, 2], [3, 1, 1], [2, 2, 1], [2, 1, 1, 1], [1, 1, 1, 1, 1]]
        sage: Partitions(5, length=2).list()
        [[4, 1], [3, 2]]
        sage: Partitions(5, min_part=2).list()
        [[5], [3, 2]]
        sage: Partitions(5, parts_in=[1, 2]).list()
        [[2, 2, 1], [2, 1, 1, 1], [1, 1, 1, 1, 1]]
    ```

    Counting never enumerates:

    ```sage
        sage: Partitions(1000).cardinality()
        24061467864032622473692149727991
    ```

    ### Limitations

    The `inner`, `outer`, `regular`, and `restricted` keyword constraints of
    Sage are not implemented yet and raise `NotImplementedError`.

    This API and documentation are adapted from
    `sage.combinat.partition.Partitions` (GPL-2.0-or-later).
    """
    known = [
        "min_part",
        "max_part",
        "length",
        "min_length",
        "max_length",
        "parts_in",
    ]
    supplied = [name for name in runtime.object.keys(constraints)]
    for name in supplied:
        if name not in known:
            raise NotImplementedError(
                "the Partitions constraint '" + str(name) + "' is not implemented"
            )
    if size is None:
        if len(supplied) > 0:
            raise NotImplementedError(
                "constrained classes of all partitions are not implemented"
            )
        return _partitions_all()
    if not runtime.is_exact_integer(size):
        raise TypeError("the partitioned size must be an integer")
    value = int(size)
    if value < 0:
        raise ValueError("the partitioned size must be nonnegative")

    min_part = 1
    max_part = None
    min_length = 0
    max_length = None
    parts_in = None
    given = _combinat_setting(constraints, "min_part")
    if given is not None:
        min_part = _combinat_exact_integer(given, "min_part")
        if min_part < 1:
            raise ValueError("min_part must be positive")
    given = _combinat_setting(constraints, "max_part")
    if given is not None:
        max_part = _combinat_exact_integer(given, "max_part")
        if max_part < 0:
            raise ValueError("max_part must be nonnegative")
    given = _combinat_setting(constraints, "length")
    if given is not None:
        if "min_length" in supplied or "max_length" in supplied:
            raise ValueError("length cannot be combined with min_length/max_length")
        min_length = _combinat_exact_integer(given, "length")
        max_length = min_length
        if min_length < 0:
            raise ValueError("length must be nonnegative")
    given = _combinat_setting(constraints, "min_length")
    if given is not None:
        min_length = _combinat_exact_integer(given, "min_length")
        if min_length < 0:
            raise ValueError("min_length must be nonnegative")
    given = _combinat_setting(constraints, "max_length")
    if given is not None:
        max_length = _combinat_exact_integer(given, "max_length")
        if max_length < 0:
            raise ValueError("max_length must be nonnegative")
    given = _combinat_setting(constraints, "parts_in")
    if given is not None:
        parts_in = _partitions_sequence(given)

    if (
        min_part == 1
        and max_part is None
        and min_length == 0
        and max_length is None
        and parts_in is None
    ):
        key = str(value)
        if key not in _combinat_state.partitions_by_size:
            _combinat_state.partitions_by_size[key] = Partitions_n(value)
        return _combinat_state.partitions_by_size[key]
    return Partitions_n(
        value,
        min_part,
        max_part,
        min_length,
        max_length,
        parts_in,
    )


def number_of_partitions(size: Any) -> Any:
    r"""
    Return the number of partitions of a nonnegative integer.

    The value comes from FLINT's exact Hardy-Ramanujan-Rademacher
    implementation in production native and WebAssembly hosts.  A host that
    explicitly lacks the declared capability retains Euler's exact pentagonal
    recurrence; binding and execution failures are never hidden by fallback.

    ### Input

    - `size` -- a nonnegative integer

    ### Examples

    ```sage
        sage: number_of_partitions(10)
        42
        sage: number_of_partitions(100)
        190569292
        sage: number_of_partitions(1000)
        24061467864032622473692149727991
        sage: number_of_partitions(4) == Partitions(4).cardinality()
        True
    ```

    This API and documentation are adapted from
    `sage.combinat.partition.number_of_partitions` (GPL-2.0-or-later).
    """
    if not runtime.is_exact_integer(size):
        raise TypeError("number_of_partitions() requires an integer")
    value = int(size)
    if value < 0:
        raise ValueError("number_of_partitions() requires a nonnegative integer")
    return runtime.normalize_integer(_partition_count(value))


def _combinat_choose(n: int, k: int) -> Any:
    """
    Return `binomial(n, k)` as an unnormalized bigint, for internal callers.

    `n` and `k` are ordinary Python integers, small enough that comparing and
    subtracting them stays exact; the returned bigint is exact regardless of
    how large `binomial(n, k)` itself grows.  The multiplicative formula
    divides out one term at a time, and that intermediate quotient is always
    exact because a product of `k` consecutive integers is always divisible
    by `k!`.
    """
    if k < 0 or k > n:
        return runtime.bigint(0)
    smaller = k if k < n - k else n - k
    result = runtime.bigint(1)
    for index in range(smaller):
        result = runtime.native_div(
            runtime.native_mul(result, runtime.bigint(n - index)),
            runtime.bigint(index + 1),
        )
    return result


def _fibonacci_pair(n: int) -> tuple[Any, Any]:
    """Return `(F(n), F(n+1))` by Dijkstra's fast-doubling identities."""
    if n == 0:
        return runtime.bigint(0), runtime.bigint(1)
    low, high = _fibonacci_pair(n // 2)
    doubled = runtime.native_sub(runtime.native_mul(runtime.bigint(2), high), low)
    even_term = runtime.native_mul(low, doubled)
    odd_term = runtime.native_add(
        runtime.native_mul(low, low), runtime.native_mul(high, high)
    )
    if n % 2 == 0:
        return even_term, odd_term
    return odd_term, runtime.native_add(even_term, odd_term)


def fibonacci(n: Any, *extra: Any) -> Any:
    r"""
    Return the `n`-th Fibonacci number, for any integer `n`.

    `F(0) = 0`, `F(1) = 1`, and `F(n) = F(n-1) + F(n-2)`.  Negative indices
    use the standard extension `F(-n) = (-1)^(n+1) F(n)`.

    The value comes from Dijkstra's fast-doubling identities
    `F(2k) = F(k) (2 F(k+1) - F(k))` and `F(2k+1) = F(k)^2 + F(k+1)^2`,
    which halve the index at every step, so the cost is `O(log n)`
    big-integer multiplications rather than `O(n)` additions.

    ### Input

    - `n` -- an integer, positive, negative, or zero

    ### Examples

    ```sage
        sage: [fibonacci(n) for n in range(10)]
        [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
        sage: [fibonacci(-n) for n in range(1, 6)]
        [1, -1, 2, -3, 5]
        sage: fibonacci(200)
        280571172992510140037611932413038677189525
    ```

    ### Limitations

    Sage's two-argument `fibonacci(n, algorithm=...)` form and the Wolfram
    Language `Fibonacci[n, x]` Fibonacci polynomials are not implemented.

    This API and documentation are adapted from
    `sage.combinat.combinat.fibonacci` (GPL-2.0-or-later).
    """
    if extra:
        raise NotImplementedError(
            "fibonacci(n, x, ...) is not implemented; the Wolfram Language's "
            "Fibonacci polynomials and Sage's algorithm keyword are out of "
            "scope, and a second argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    magnitude = value if value >= 0 else -value
    result = _fibonacci_pair(magnitude)[0]
    if value < 0 and magnitude % 2 == 0:
        result = runtime.native_neg(result)
    return runtime.normalize_integer(result)


def _lucas_sequence(count: int, p: int, q: int, u0: int, u1: int) -> Any:
    """Return term `count` of `x_0 = u0`, `x_1 = u1`, `x_k = p x_{k-1} - q x_{k-2}`."""
    p_value = runtime.bigint(p)
    q_value = runtime.bigint(q)
    low = runtime.bigint(u0)
    high = runtime.bigint(u1)
    for _index in range(count):
        low, high = (
            high,
            runtime.native_sub(
                runtime.native_mul(p_value, high), runtime.native_mul(q_value, low)
            ),
        )
    return runtime.normalize_integer(low)


def lucas_number1(n: Any, P: Any, Q: Any, *extra: Any) -> Any:
    r"""
    Return the `n`-th Lucas sequence number of the first kind, `U_n(P, Q)`.

    Defined by `U_0 = 0`, `U_1 = 1`, and `U_k = P U_{k-1} - Q U_{k-2}`.  The
    ordinary Fibonacci numbers are `U_n(1, -1)`.

    ### Input

    - `n` -- a nonnegative integer index
    - `P`, `Q` -- integer sequence parameters

    ### Examples

    ```sage
        sage: [lucas_number1(n, 1, -1) for n in range(8)]
        [0, 1, 1, 2, 3, 5, 8, 13]
        sage: lucas_number1(5, 1, -1) == fibonacci(5)
        True
        sage: lucas_number1(10, 2, 1)
        10
    ```

    ### Limitations

    Only nonnegative `n` and integer `P`, `Q` are implemented; Sage also
    accepts symbolic or algebraic `P`, `Q`, and PARI's `lucas` extension to
    negative `n`, neither of which is implemented here.  A fourth
    positional argument raises `TypeError` rather than being silently
    ignored.

    This API and documentation are adapted from
    `sage.combinat.combinat.lucas_number1` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "lucas_number1() takes exactly three arguments; an extra "
            "positional argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    p_value = _combinat_exact_integer(P, "P")
    q_value = _combinat_exact_integer(Q, "Q")
    if value < 0:
        raise ValueError("lucas_number1() requires a nonnegative index")
    return _lucas_sequence(value, p_value, q_value, 0, 1)


def lucas_number2(n: Any, P: Any, Q: Any, *extra: Any) -> Any:
    r"""
    Return the `n`-th Lucas sequence number of the second kind, `V_n(P, Q)`.

    Defined by `V_0 = 2`, `V_1 = P`, and `V_k = P V_{k-1} - Q V_{k-2}`.  The
    ordinary Lucas numbers are `V_n(1, -1)`.

    ### Input

    - `n` -- a nonnegative integer index
    - `P`, `Q` -- integer sequence parameters

    ### Examples

    ```sage
        sage: [lucas_number2(n, 1, -1) for n in range(8)]
        [2, 1, 3, 4, 7, 11, 18, 29]
        sage: lucas_number2(5, 1, -1)
        11
    ```

    ### Limitations

    Only nonnegative `n` and integer `P`, `Q` are implemented, matching
    `lucas_number1`.  A fourth positional argument raises `TypeError`
    rather than being silently ignored; the Wolfram Language's two-term
    `LucasL[n, x]` polynomial form is handled by the `_wolfram` wrapper,
    not here.

    This API and documentation are adapted from
    `sage.combinat.combinat.lucas_number2` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "lucas_number2() takes exactly three arguments; an extra "
            "positional argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    p_value = _combinat_exact_integer(P, "P")
    q_value = _combinat_exact_integer(Q, "Q")
    if value < 0:
        raise ValueError("lucas_number2() requires a nonnegative index")
    return _lucas_sequence(value, p_value, q_value, 2, p_value)


def catalan_number(n: Any, *extra: Any) -> Any:
    r"""
    Return the `n`-th Catalan number, `binomial(2n, n) / (n + 1)`.

    Matching Sage, `catalan_number` returns `0` for every negative `n`; this
    is a convenient convention rather than the value of an analytic
    continuation, and it disagrees with the Wolfram Language, whose
    `CatalanNumber` continues the sequence through the Gamma function and is
    generally nonzero at negative integers.

    ### Input

    - `n` -- an integer

    ### Examples

    ```sage
        sage: [catalan_number(n) for n in range(7)]
        [1, 1, 2, 5, 14, 42, 132]
        sage: catalan_number(-3)
        0
        sage: catalan_number(60)
        1583850964596120042686772779038896
        sage: catalan_number(5) == binomial(10, 5) // 6
        True
    ```

    ### Limitations

    A second positional argument raises `TypeError` rather than being
    silently ignored.

    This API and documentation are adapted from
    `sage.combinat.combinat.catalan_number` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "catalan_number() takes exactly one argument; an extra "
            "positional argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    if value < 0:
        return 0
    result = _combinat_choose(2 * value, value)
    result = runtime.native_div(result, runtime.bigint(value + 1))
    return runtime.normalize_integer(result)


def bell_number(n: Any, *extra: Any) -> Any:
    r"""
    Return the `n`-th Bell number, the number of partitions of an `n`-set.

    The value comes from the Bell triangle (also called Aitken's array or
    the Peirce triangle): each row starts with the last entry of the row
    before it, and each further entry is the running sum of that start with
    the entries of the previous row; the first entry of row `n` is `B(n)`.

    ### Input

    - `n` -- a nonnegative integer

    ### Examples

    ```sage
        sage: [bell_number(n) for n in range(8)]
        [1, 1, 2, 5, 15, 52, 203, 877]
        sage: bell_number(50)
        185724268771078270438257767181908917499221852770
        sage: bell_number(6) == sum(stirling_number2(6, k) for k in range(7))
        True
    ```

    ### Limitations

    The Wolfram Language's two-argument `BellB[n, x]` Bell polynomials are
    not implemented; a second argument raises `NotImplementedError` rather
    than being silently ignored.

    This API and documentation are adapted from
    `sage.combinat.combinat.bell_number` (GPL-2.0-or-later).
    """
    if extra:
        raise NotImplementedError(
            "bell_number(n, x, ...) is not implemented; the Wolfram "
            "Language's Bell polynomials are out of scope, and a second "
            "argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    if value < 0:
        raise ValueError("bell_number() requires a nonnegative integer")
    row = [runtime.bigint(1)]
    for _index in range(value):
        new_row = [row[-1]]
        for item in row:
            new_row.append(runtime.native_add(new_row[-1], item))
        row = new_row
    return runtime.normalize_integer(row[0])


def _stirling_table(n: int, k: int, second_kind: bool) -> Any:
    """
    Return one Stirling number, unsigned first kind or second kind.

    Both kinds obey a two-term triangular recurrence, so a single table
    walk serves both: the first kind multiplies the term above by `i - 1`
    (one fewer than the current row) and the second kind multiplies it by
    the column `j` itself.
    """
    if k < 0 or k > n:
        return runtime.bigint(0)
    row = [runtime.bigint(1)] + [runtime.bigint(0)] * k
    for i in range(1, n + 1):
        new_row = [runtime.bigint(0)] * (k + 1)
        upper = i if i < k else k
        multiplier = runtime.bigint(i if second_kind else i - 1)
        for j in range(1, upper + 1):
            column_multiplier = runtime.bigint(j) if second_kind else multiplier
            term = runtime.native_mul(column_multiplier, row[j])
            new_row[j] = runtime.native_add(term, row[j - 1])
        row = new_row
    return row[k]


def stirling_number1(n: Any, k: Any, *extra: Any) -> Any:
    r"""
    Return the unsigned Stirling number of the first kind, `c(n, k)`.

    `c(n, k)` counts the permutations of `n` elements with exactly `k`
    cycles.  **This is the unsigned convention**: Sage's `stirling_number1`
    always returns a nonnegative integer, unlike the Wolfram Language's
    `StirlingS1`, which is signed as `(-1)^(n - k) c(n, k)`.

    ### Input

    - `n`, `k` -- nonnegative integers

    ### Examples

    ```sage
        sage: [stirling_number1(5, k) for k in range(6)]
        [0, 24, 50, 35, 10, 1]
        sage: stirling_number1(0, 0)
        1
        sage: stirling_number1(6, 8)
        0
    ```

    ### Limitations

    A third positional argument raises `TypeError` rather than being
    silently ignored.

    This API and documentation are adapted from
    `sage.combinat.combinat.stirling_number1` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "stirling_number1() takes exactly two arguments; an extra "
            "positional argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    index = _combinat_exact_integer(k, "k")
    if value < 0:
        raise ValueError("stirling_number1() requires a nonnegative n")
    if index < 0:
        raise ValueError("stirling_number1() requires a nonnegative k")
    return runtime.normalize_integer(_stirling_table(value, index, False))


def stirling_number2(n: Any, k: Any, *extra: Any) -> Any:
    r"""
    Return the Stirling number of the second kind, `S(n, k)`.

    `S(n, k)` counts the ways to partition an `n`-set into exactly `k`
    nonempty, unlabeled blocks.

    ### Input

    - `n`, `k` -- nonnegative integers

    ### Examples

    ```sage
        sage: [stirling_number2(5, k) for k in range(6)]
        [0, 1, 15, 25, 10, 1]
        sage: stirling_number2(0, 0)
        1
        sage: sum(stirling_number2(6, k) for k in range(7)) == bell_number(6)
        True
    ```

    ### Limitations

    A third positional argument raises `TypeError` rather than being
    silently ignored.

    This API and documentation are adapted from
    `sage.combinat.combinat.stirling_number2` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "stirling_number2() takes exactly two arguments; an extra "
            "positional argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    index = _combinat_exact_integer(k, "k")
    if value < 0:
        raise ValueError("stirling_number2() requires a nonnegative n")
    if index < 0:
        raise ValueError("stirling_number2() requires a nonnegative k")
    return runtime.normalize_integer(_stirling_table(value, index, True))


def multinomial(*args: Any) -> Any:
    r"""
    Return the multinomial coefficient of the given nonnegative integers.

    `multinomial(k_1, ..., k_m) = (k_1 + ... + k_m)! / (k_1! ... k_m!)`,
    the number of ways to split a labeled set of that total size into
    labeled blocks of those sizes.  As in Sage, the entries may be passed
    either as separate arguments or as one list or tuple.

    ### Input

    - `args` -- nonnegative integers, or a single list/tuple of them

    ### Examples

    ```sage
        sage: multinomial(2, 3, 4)
        1260
        sage: multinomial([2, 3, 4])
        1260
        sage: multinomial(5, 0)
        1
        sage: multinomial() == 1
        True
    ```

    Unlike the other counting functions in this module, `multinomial` has
    no fixed arity to guard: every positional argument is significant
    data, not an optional or unsupported extension point, so there is no
    "extra" argument to reject.

    This API and documentation are adapted from
    `sage.combinat.combinat.multinomial` (GPL-2.0-or-later).
    """
    if len(args) == 1 and isinstance(args[0], (list, tuple)):
        values = list(args[0])
    else:
        values = list(args)
    counts = []
    total = 0
    for value in values:
        count = _combinat_exact_integer(value, "multinomial() arguments")
        if count < 0:
            raise ValueError("multinomial() arguments must be nonnegative")
        counts.append(count)
        total += count
    result = runtime.bigint(1)
    remaining = total
    for count in counts:
        result = runtime.native_mul(result, _combinat_choose(remaining, count))
        remaining -= count
    return runtime.normalize_integer(result)


def _combinat_factor_count(value: Any, name: str) -> int:
    """Return a nonnegative factor count, or reject a non-integer or negative one."""
    count = _combinat_exact_integer(value, name)
    if count < 0:
        raise NotImplementedError(
            name + " must be a nonnegative integer; negative counts are not implemented"
        )
    return count


def falling_factorial(x: Any, a: Any, *extra: Any) -> Any:
    r"""
    Return the falling factorial `x (x - 1) (x - 2) ... (x - a + 1)`.

    `a` counts the factors and must be a nonnegative integer; `x` may be
    any Sage.js number that supports subtraction and multiplication, so the
    result stays exact for exact `x` (an integer or a `Rational`) and is
    otherwise whatever `x`'s own arithmetic produces.

    ### Input

    - `x` -- the starting value
    - `a` -- a nonnegative integer, the number of descending factors

    ### Examples

    ```sage
        sage: falling_factorial(5, 3)
        60
        sage: falling_factorial(5, 0)
        1
        sage: falling_factorial(10, 10) == factorial(10)
        True
    ```

    ### Limitations

    Sage extends `a` to negative integers through `1 / rising_factorial`;
    that extension is not implemented here and raises `NotImplementedError`.
    A third positional argument raises `TypeError` rather than being
    silently ignored.

    This API and documentation are adapted from
    `sage.arith.misc.falling_factorial` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "falling_factorial() takes exactly two arguments; an extra "
            "positional argument is never silently ignored"
        )
    count = _combinat_factor_count(a, "falling_factorial() the factor count")
    if runtime.is_exact_integer(x):
        base = runtime.integer_bigint(x)
        result = runtime.bigint(1)
        for index in range(count):
            result = runtime.native_mul(
                result, runtime.native_sub(base, runtime.bigint(index))
            )
        return runtime.normalize_integer(result)
    result = 1
    for index in range(count):
        result = result * (x - index)
    return result


def rising_factorial(x: Any, a: Any, *extra: Any) -> Any:
    r"""
    Return the rising factorial `x (x + 1) (x + 2) ... (x + a - 1)`.

    Also called the Pochhammer symbol.  `a` counts the factors and must be
    a nonnegative integer; `x` may be any Sage.js number that supports
    addition and multiplication.

    ### Input

    - `x` -- the starting value
    - `a` -- a nonnegative integer, the number of ascending factors

    ### Examples

    ```sage
        sage: rising_factorial(5, 3)
        210
        sage: rising_factorial(5, 0)
        1
        sage: rising_factorial(1, 10) == factorial(10)
        True
    ```

    ### Limitations

    Sage extends `a` to negative integers through `1 / falling_factorial`;
    that extension is not implemented here and raises `NotImplementedError`.
    A third positional argument raises `TypeError` rather than being
    silently ignored.

    This API and documentation are adapted from
    `sage.arith.misc.rising_factorial` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "rising_factorial() takes exactly two arguments; an extra "
            "positional argument is never silently ignored"
        )
    count = _combinat_factor_count(a, "rising_factorial() the factor count")
    if runtime.is_exact_integer(x):
        base = runtime.integer_bigint(x)
        result = runtime.bigint(1)
        for index in range(count):
            result = runtime.native_mul(
                result, runtime.native_add(base, runtime.bigint(index))
            )
        return runtime.normalize_integer(result)
    result = 1
    for index in range(count):
        result = result * (x + index)
    return result


def number_of_derangements(n: Any, *extra: Any) -> Any:
    r"""
    Return the number of derangements of `n` elements, the subfactorial `!n`.

    A derangement is a permutation with no fixed point.  The value comes
    from the linear recurrence `D(0) = 1`, `D(1) = 0`,
    `D(n) = (n - 1) (D(n-1) + D(n-2))`.

    ### Input

    - `n` -- a nonnegative integer

    ### Examples

    ```sage
        sage: [number_of_derangements(n) for n in range(7)]
        [1, 0, 1, 2, 9, 44, 265]
        sage: number_of_derangements(20)
        895014631192902121
        sage: sum((-1)^k * binomial(6, k) * factorial(6 - k) for k in range(7))
        265
    ```

    ### Limitations

    A second positional argument raises `TypeError` rather than being
    silently ignored.

    This API and documentation are adapted from
    `sage.combinat.derangements.number_of_derangements` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "number_of_derangements() takes exactly one argument; an extra "
            "positional argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    if value < 0:
        raise ValueError("number_of_derangements() requires a nonnegative integer")
    if value == 0:
        return 1
    if value == 1:
        return 0
    low = runtime.bigint(1)
    high = runtime.bigint(0)
    for index in range(2, value + 1):
        low, high = (
            high,
            runtime.native_mul(
                runtime.bigint(index - 1), runtime.native_add(high, low)
            ),
        )
    return runtime.normalize_integer(high)


def _euler_number_even(half: int) -> Any:
    """
    Return `E(2 * half)`, the alternating-sign secant number.

    `E(0) = 1` and `sum_{j=0}^{k} binomial(2k, 2j) E(2j) = 0` for `k >= 1`,
    which is solved for the newest term at each step.
    """
    even_values = [runtime.bigint(1)]
    for k in range(1, half + 1):
        total = runtime.bigint(0)
        for j in range(k):
            term = runtime.native_mul(_combinat_choose(2 * k, 2 * j), even_values[j])
            total = runtime.native_add(total, term)
        even_values.append(runtime.native_neg(total))
    return even_values[half]


def euler_number(n: Any, *extra: Any) -> Any:
    r"""
    Return the `n`-th Euler number (the secant/zigzag number `E_n`).

    `E_n` is `0` for odd `n`, and the even-indexed values alternate in
    sign: `E_0 = 1`, `E_2 = -1`, `E_4 = 5`, `E_6 = -61`, matching both
    Sage's `euler_number` and the Wolfram Language's `EulerE`.

    ### Input

    - `n` -- a nonnegative integer

    ### Examples

    ```sage
        sage: [euler_number(n) for n in range(9)]
        [1, 0, -1, 0, 5, 0, -61, 0, 1385]
        sage: euler_number(11)
        0
    ```

    ### Limitations

    The Wolfram Language's two-argument `EulerE[n, x]` Euler polynomials are
    not implemented; a second argument raises `NotImplementedError` rather
    than being silently ignored.

    This API and documentation are adapted from
    `sage.combinat.combinat.euler_number` (GPL-2.0-or-later).
    """
    if extra:
        raise NotImplementedError(
            "euler_number(n, x, ...) is not implemented; the Wolfram "
            "Language's Euler polynomials are out of scope, and a second "
            "argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    if value < 0:
        raise ValueError("euler_number() requires a nonnegative integer")
    if value % 2 == 1:
        return 0
    return runtime.normalize_integer(_euler_number_even(value // 2))


def harmonic_number(n: Any, m: Any = 1, *extra: Any) -> Any:
    r"""
    Return the generalized harmonic number `H_n^{(m)} = sum_{k=1}^{n} 1/k^m`.

    The ordinary harmonic number is `m = 1`.  The result is an exact
    `Rational`, never a float, so it stays exact past any floating-point
    precision.

    ### Input

    - `n` -- a nonnegative integer
    - `m` -- a nonnegative integer power, default `1`

    ### Examples

    ```sage
        sage: harmonic_number(5)
        137/60
        sage: harmonic_number(0)
        0
        sage: harmonic_number(5, 2)
        5269/3600
    ```

    ### Limitations

    A third positional argument raises `TypeError` rather than being
    silently ignored.

    This API and documentation are adapted from
    `sage.functions.other.harmonic_number` (GPL-2.0-or-later).
    """
    if extra:
        raise TypeError(
            "harmonic_number() takes at most two arguments; an extra "
            "positional argument is never silently ignored"
        )
    value = _combinat_exact_integer(n, "n")
    power = _combinat_exact_integer(m, "m")
    if value < 0:
        raise ValueError("harmonic_number() requires a nonnegative n")
    if power < 0:
        raise NotImplementedError("harmonic_number() requires a nonnegative m")
    total = runtime.rational_class(0, 1)
    for k in range(1, value + 1):
        denominator = runtime.native_pow(runtime.bigint(k), runtime.bigint(power))
        total = total + runtime.rational_class(1, denominator)
    return total


def _q_binomial_table(n: int, k: int, q: Any, integer_mode: bool) -> Any:
    """
    Return the Gaussian binomial coefficient `binom(n, k)_q`.

    The q-Pascal recurrence `binom(i, j)_q = binom(i-1, j-1)_q + q^j
    binom(i-1, j)_q` never divides, so it is exact for an integer `q` and
    stays a well-formed expression for a polynomial-ring `q` as well.
    """
    one = runtime.bigint(1) if integer_mode else 1
    q_value = runtime.integer_bigint(q) if integer_mode else q
    table = {}
    for i in range(n + 1):
        upper = i if i < k else k
        for j in range(upper + 1):
            if j == 0 or j == i:
                table[(i, j)] = one
                continue
            if integer_mode:
                power = runtime.native_pow(q_value, runtime.bigint(j))
                term = runtime.native_mul(power, table[(i - 1, j)])
                table[(i, j)] = runtime.native_add(table[(i - 1, j - 1)], term)
            else:
                table[(i, j)] = table[(i - 1, j - 1)] + q_value**j * table[(i - 1, j)]
    return table[(n, k)]


def q_binomial(n: Any, k: Any, q: Any, *extra: Any) -> Any:
    r"""
    Return the Gaussian binomial coefficient `binom(n, k)_q`.

    `binom(n, k)_q` counts `k`-dimensional subspaces of an `n`-dimensional
    vector space over a field with `q` elements when `q` is a prime power,
    and is the natural q-analogue of `binomial(n, k)` for every `q`:
    `binom(n, k)_1 = binomial(n, k)`.

    `q` may be an exact integer, in which case the result is an exact
    integer, or a polynomial-ring indeterminate, in which case the result
    is the Gaussian polynomial itself.

    ### Input

    - `n`, `k` -- nonnegative integers
    - `q` -- an exact integer or a polynomial-ring element

    ### Examples

    ```sage
        sage: q_binomial(4, 2, 1) == binomial(4, 2)
        True
        sage: q_binomial(4, 2, 2)
        35
        sage: q_binomial(5, 0, 3)
        1
        sage: q_binomial(5, 7, 3)
        0
    ```

    ### Limitations

    Unlike Sage, `q` must be supplied explicitly: Sage.js does not
    auto-construct a default polynomial ring and indeterminate when `q` is
    omitted, so `q_binomial(n, k)` is not implemented.  A fourth positional
    argument raises `TypeError` rather than being silently ignored.

    This API and documentation are adapted from
    `sage.combinat.q_analogues.q_binomial` (GPL-2.0-or-later).  `gaussian_binomial`
    is Sage's own alias for the same function.
    """
    if extra:
        raise TypeError(
            "q_binomial() takes exactly three arguments; an extra "
            "positional argument is never silently ignored"
        )
    n_value = _combinat_exact_integer(n, "n")
    k_value = _combinat_exact_integer(k, "k")
    if n_value < 0:
        raise ValueError("q_binomial() requires a nonnegative n")
    if k_value < 0 or k_value > n_value:
        return 0
    integer_mode = runtime.is_exact_integer(q)
    result = _q_binomial_table(n_value, k_value, q, integer_mode)
    if integer_mode:
        return runtime.normalize_integer(result)
    return result


gaussian_binomial = q_binomial


# Every algorithm here is implemented from its published description; no
# SageMath source was transliterated.  What is adapted from Sage is the public
# API, the enumeration order, and the documentation prose.
_SAGE_PROVENANCE = {
    "kind": "sage-derived",
    "source": "SageMath `sage.combinat.partition`",
    "revision": "SageMath 10.9",
    "url": (
        "https://doc.sagemath.org/html/en/reference/combinat/"
        "sage/combinat/partition.html"
    ),
    "license": "GPL-2.0-or-later",
}
_PENTAGONAL_PROVENANCE = {
    "kind": "literature-implemented",
    "source": (
        "Euler's pentagonal number theorem recurrence for `p(n)`, the "
        "portable path when FLINT is unavailable"
    ),
}
_FLINT_PROVENANCE = {
    "kind": "library-backed",
    "source": "FLINT `arith_number_of_partitions`",
    "url": "https://flintlib.org/doc/arith.html",
    "license": "LGPL-3.0-or-later",
}
_RANKING_PROVENANCE = {
    "kind": "literature-implemented",
    "source": (
        "Counting-driven ranking, unranking, and uniform random selection "
        "over a recursively counted set"
    ),
}
_SHARED_MEMO_PROVENANCE = {
    "kind": "sagejs-original",
    "source": (
        "One bounded triangular count table over the largest remaining part "
        "serves constrained cardinality, rank, unrank, and random_element, "
        "so the four agree by construction rather than by separate "
        "implementations"
    ),
}
_ANDREWS_REFERENCE = {
    "id": "andrews-theory-of-partitions",
    "type": "book",
    "title": "The Theory of Partitions",
    "authors": ["George E. Andrews"],
    "year": 1976,
    "relevant_sections": "Chapter 1, the pentagonal number theorem",
}
_KREHER_STINSON_REFERENCE = {
    "id": "kreher-stinson-combinatorial-algorithms",
    "type": "book",
    "title": "Combinatorial Algorithms: Generation, Enumeration, and Search",
    "authors": ["Donald L. Kreher", "Douglas R. Stinson"],
    "year": 1999,
    "relevant_sections": "Chapter 2, ranking and unranking",
}
_NIJENHUIS_WILF_REFERENCE = {
    "id": "nijenhuis-wilf-combinatorial-algorithms",
    "type": "book",
    "title": "Combinatorial Algorithms for Computers and Calculators",
    "authors": ["Albert Nijenhuis", "Herbert S. Wilf"],
    "year": 1978,
    "relevant_sections": "Uniform random selection from a counted set",
}


def _register_combinat_doc(
    name: str,
    value: Any,
    kind: str,
    provenance: list[Any],
    references: list[Any],
    limitations: list[Any],
) -> None:
    runtime.register_doc(
        name,
        value,
        {
            "kind": kind,
            "module": "sage.combinat",
            "tags": [
                "combinatorics",
                "enumerative combinatorics",
                "partitions",
                "integer sequences",
            ],
            "backends": ["Sage.js exact enumeration", "FLINT"],
            "sage_compatibility": {
                "status": "partial",
                "notes": (
                    "Construction, enumeration order, exact counting, and the "
                    "rank/unrank protocol match Sage.  The inner, outer, "
                    "regular, and restricted constraints are not implemented."
                ),
            },
            "provenance": provenance,
            "references": references,
            "limitations": limitations,
        },
    )


def _register_combinat_function_doc(
    name: str,
    value: Any,
    provenance: list[Any],
    references: list[Any],
    limitations: list[Any],
    tags: list[Any],
    status: str,
    notes: str,
    aliases: list[Any],
) -> None:
    """Register a scalar counting function, one call per name, no keyword args."""
    runtime.register_doc(
        name,
        value,
        {
            "kind": "function",
            "module": "sage.combinat",
            "tags": tags,
            "backends": ["Sage.js exact arithmetic"],
            "sage_compatibility": {"status": status, "notes": notes},
            "provenance": provenance,
            "references": references,
            "limitations": limitations,
            "aliases": aliases,
        },
    )


_ENUMERATION_LIMITATION = (
    "Enumeration is exact but explicit, so listing a class is practical only "
    "while its cardinality is small.  Counting, ranking, and uniform sampling "
    "avoid enumeration."
)
_COUNTING_LIMITATION = (
    "Production native and WebAssembly hosts use FLINT's exact "
    "Hardy-Ramanujan-Rademacher implementation.  Only explicit capability "
    "absence selects the pentagonal recurrence; binding or execution failures "
    "propagate.  The recurrence computes every smaller partition number and "
    "is therefore intentionally rejected by release route telemetry for large "
    "workloads.  See `bench/compare-partitions.cjs`."
)
_RANKING_LIMITATION = (
    "Ranking, unranking, and random selection retain a triangular table of "
    "arbitrary-precision completion counts.  Requests above the reviewed "
    "one-million-cell persistent-work ceiling raise `RuntimeError` before "
    "allocating; cardinality and streaming enumeration remain available."
)

_register_combinat_doc(
    "Partition",
    Partition,
    "class",
    [_SAGE_PROVENANCE],
    [],
    [_ENUMERATION_LIMITATION],
)
_register_combinat_doc(
    "Partitions",
    Partitions,
    "function",
    [
        _SAGE_PROVENANCE,
        _FLINT_PROVENANCE,
        _PENTAGONAL_PROVENANCE,
        _RANKING_PROVENANCE,
        _SHARED_MEMO_PROVENANCE,
    ],
    [
        _ANDREWS_REFERENCE,
        _KREHER_STINSON_REFERENCE,
        _NIJENHUIS_WILF_REFERENCE,
    ],
    [_ENUMERATION_LIMITATION, _COUNTING_LIMITATION, _RANKING_LIMITATION],
)
_register_combinat_doc(
    "number_of_partitions",
    number_of_partitions,
    "function",
    [_SAGE_PROVENANCE, _FLINT_PROVENANCE, _PENTAGONAL_PROVENANCE],
    [_ANDREWS_REFERENCE],
    [_COUNTING_LIMITATION],
)

# The counting functions below are likewise implemented from their published
# recurrences rather than transliterated from SageMath; what is adapted from
# Sage is the public API, argument order, and the documentation prose.
_SAGE_COMBINAT_FUNCTIONS_PROVENANCE = {
    "kind": "sage-derived",
    "source": "SageMath `sage.combinat.combinat`",
    "revision": "SageMath 10.9",
    "url": (
        "https://doc.sagemath.org/html/en/reference/combinat/"
        "sage/combinat/combinat.html"
    ),
    "license": "GPL-2.0-or-later",
}
_SAGE_ARITH_PROVENANCE = {
    "kind": "sage-derived",
    "source": "SageMath `sage.arith.misc`",
    "revision": "SageMath 10.9",
    "url": (
        "https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html"
    ),
    "license": "GPL-2.0-or-later",
}
_SAGE_DERANGEMENTS_PROVENANCE = {
    "kind": "sage-derived",
    "source": "SageMath `sage.combinat.derangements`",
    "revision": "SageMath 10.9",
    "url": (
        "https://doc.sagemath.org/html/en/reference/combinat/"
        "sage/combinat/derangements.html"
    ),
    "license": "GPL-2.0-or-later",
}
_SAGE_Q_ANALOGUES_PROVENANCE = {
    "kind": "sage-derived",
    "source": "SageMath `sage.combinat.q_analogues`",
    "revision": "SageMath 10.9",
    "url": (
        "https://doc.sagemath.org/html/en/reference/combinat/"
        "sage/combinat/q_analogues.html"
    ),
    "license": "GPL-2.0-or-later",
}
_SAGE_FUNCTIONS_PROVENANCE = {
    "kind": "sage-derived",
    "source": "SageMath `sage.functions.other`",
    "revision": "SageMath 10.9",
    "url": (
        "https://doc.sagemath.org/html/en/reference/functions/sage/functions/other.html"
    ),
    "license": "GPL-2.0-or-later",
}

_DIJKSTRA_REFERENCE = {
    "id": "dijkstra-in-honour-of-fibonacci",
    "type": "technical-report",
    "title": "In Honour of Fibonacci (EWD654)",
    "authors": ["Edsger W. Dijkstra"],
    "year": 1978,
    "relevant_sections": (
        "The fast-doubling identities F(2k) = F(k) (2 F(k+1) - F(k)) and "
        "F(2k+1) = F(k)^2 + F(k+1)^2"
    ),
}
_CRANDALL_POMERANCE_REFERENCE = {
    "id": "crandall-pomerance-prime-numbers",
    "type": "book",
    "title": "Prime Numbers: A Computational Perspective",
    "authors": ["Richard Crandall", "Carl Pomerance"],
    "year": 2005,
    "relevant_sections": "Section 3.6, the Lucas sequences U_n(P, Q) and V_n(P, Q)",
}
_STANLEY_CATALAN_REFERENCE = {
    "id": "stanley-catalan-numbers",
    "type": "book",
    "title": "Catalan Numbers",
    "authors": ["Richard P. Stanley"],
    "year": 2015,
    "relevant_sections": "Chapter 1, C(n) = binomial(2n, n) / (n + 1)",
}
_ROTA_BELL_REFERENCE = {
    "id": "rota-number-of-partitions-of-a-set",
    "type": "article",
    "title": (
        "The Number of Partitions of a Set (American Mathematical Monthly "
        "71:5, 498-504)"
    ),
    "authors": ["Gian-Carlo Rota"],
    "year": 1964,
    "relevant_sections": "The Bell triangle recurrence used to compute B(n)",
}
_CONCRETE_MATH_REFERENCE = {
    "id": "graham-knuth-patashnik-concrete-mathematics",
    "type": "book",
    "title": "Concrete Mathematics: A Foundation for Computer Science",
    "authors": ["Ronald L. Graham", "Donald E. Knuth", "Oren Patashnik"],
    "year": 1994,
    "relevant_sections": (
        "Chapter 2 for falling/rising factorial notation, Chapter 5 for "
        "multinomial coefficients, Chapter 6 for Stirling numbers and "
        "harmonic numbers"
    ),
}
_COMTET_REFERENCE = {
    "id": "comtet-advanced-combinatorics",
    "type": "book",
    "title": "Advanced Combinatorics: The Art of Finite and Infinite Expansions",
    "authors": ["Louis Comtet"],
    "year": 1974,
    "relevant_sections": "Chapter IV for derangements, Chapter V for Euler numbers",
}

_FIBONACCI_LIMITATION = (
    "Sage's `algorithm` keyword is not implemented, and the Wolfram "
    "Language's two-argument `Fibonacci[n, x]` Fibonacci polynomials are a "
    "different function that is not implemented; a second positional "
    "argument raises `TypeError` rather than being silently ignored."
)
_LUCAS_LIMITATION = (
    "Only a nonnegative `n` and integer `P`, `Q` are implemented.  Sage also "
    "accepts symbolic or algebraic `P`, `Q`, and PARI's extension to "
    "negative `n`; neither is implemented here."
)
_CATALAN_NEGATIVE_LIMITATION = (
    "`catalan_number` returns `0` for every negative `n`, matching Sage's "
    "convention.  This is not the value of the Wolfram Language's analytic "
    "continuation of `CatalanNumber` through the Gamma function, which is "
    "generally nonzero at negative integers and is not reproduced here."
)
_STIRLING1_SIGN_LIMITATION = (
    "`stirling_number1` is the UNSIGNED Stirling number of the first kind, "
    "matching Sage's own convention.  It is not the signed convention used "
    "by the Wolfram Language's `StirlingS1`; the `_wolfram.StirlingS1` "
    "wrapper applies the `(-1)^(n-k)` sign explicitly."
)
_FACTORIAL_POWER_LIMITATION = (
    "The factor count `a` must be a nonnegative integer.  Sage extends `a` "
    "to negative integers through the reciprocal identity "
    "`falling_factorial(x, -a) = 1 / rising_factorial(x, a)`; that "
    "extension is not implemented and raises `NotImplementedError`."
)
_QBINOMIAL_LIMITATION = (
    "`q` must be supplied explicitly.  Sage defaults `q` to the generator "
    "of a freshly constructed `ZZ['q']` polynomial ring when omitted; "
    "Sage.js does not auto-construct that ring, so `q_binomial(n, k)` "
    "without a `q` is not implemented."
)
_HARMONIC_LIMITATION = (
    "`n` and `m` must both be nonnegative integers, so `harmonic_number` "
    "always returns an exact `Rational`.  Sage's symbolic evaluation for "
    "non-integer or symbolic `n` is not implemented."
)

_register_combinat_function_doc(
    "fibonacci",
    fibonacci,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_DIJKSTRA_REFERENCE],
    [_FIBONACCI_LIMITATION],
    ["combinatorics", "integer sequences", "Fibonacci numbers"],
    "partial",
    "The one-argument form matches Sage for every integer `n`.",
    [],
)
_register_combinat_function_doc(
    "lucas_number1",
    lucas_number1,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_CRANDALL_POMERANCE_REFERENCE],
    [_LUCAS_LIMITATION],
    ["combinatorics", "integer sequences", "Lucas sequences"],
    "partial",
    "Matches Sage for nonnegative `n` and integer `P`, `Q`.",
    [],
)
_register_combinat_function_doc(
    "lucas_number2",
    lucas_number2,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_CRANDALL_POMERANCE_REFERENCE],
    [_LUCAS_LIMITATION],
    ["combinatorics", "integer sequences", "Lucas sequences"],
    "partial",
    "Matches Sage for nonnegative `n` and integer `P`, `Q`.",
    [],
)
_register_combinat_function_doc(
    "catalan_number",
    catalan_number,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_STANLEY_CATALAN_REFERENCE],
    [_CATALAN_NEGATIVE_LIMITATION],
    ["combinatorics", "integer sequences", "Catalan numbers"],
    "compatible",
    "Matches Sage for every integer `n`, including negative `n`.",
    [],
)
_register_combinat_function_doc(
    "bell_number",
    bell_number,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_ROTA_BELL_REFERENCE],
    [],
    ["combinatorics", "integer sequences", "set partitions"],
    "compatible",
    "Matches Sage for every nonnegative `n`.",
    [],
)
_register_combinat_function_doc(
    "stirling_number1",
    stirling_number1,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_CONCRETE_MATH_REFERENCE],
    [_STIRLING1_SIGN_LIMITATION],
    ["combinatorics", "integer sequences", "Stirling numbers"],
    "compatible",
    "Matches Sage's unsigned convention for nonnegative `n`, `k`.",
    [],
)
_register_combinat_function_doc(
    "stirling_number2",
    stirling_number2,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_CONCRETE_MATH_REFERENCE],
    [],
    ["combinatorics", "integer sequences", "Stirling numbers"],
    "compatible",
    "Matches Sage for nonnegative `n`, `k`.",
    [],
)
_register_combinat_function_doc(
    "multinomial",
    multinomial,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_CONCRETE_MATH_REFERENCE],
    [],
    ["combinatorics", "binomial coefficients"],
    "compatible",
    "Accepts both the variadic and single-list calling forms, as Sage does.",
    [],
)
_register_combinat_function_doc(
    "falling_factorial",
    falling_factorial,
    [_SAGE_ARITH_PROVENANCE],
    [_CONCRETE_MATH_REFERENCE],
    [_FACTORIAL_POWER_LIMITATION],
    ["combinatorics", "factorial powers"],
    "partial",
    "Matches Sage for a nonnegative integer factor count `a`.",
    [],
)
_register_combinat_function_doc(
    "rising_factorial",
    rising_factorial,
    [_SAGE_ARITH_PROVENANCE],
    [_CONCRETE_MATH_REFERENCE],
    [_FACTORIAL_POWER_LIMITATION],
    ["combinatorics", "factorial powers"],
    "partial",
    "Matches Sage for a nonnegative integer factor count `a`.",
    [],
)
_register_combinat_function_doc(
    "number_of_derangements",
    number_of_derangements,
    [_SAGE_DERANGEMENTS_PROVENANCE],
    [_COMTET_REFERENCE],
    [],
    ["combinatorics", "integer sequences", "derangements"],
    "compatible",
    "Matches Sage for every nonnegative `n`.",
    [],
)
_register_combinat_function_doc(
    "euler_number",
    euler_number,
    [_SAGE_COMBINAT_FUNCTIONS_PROVENANCE],
    [_COMTET_REFERENCE],
    [],
    ["combinatorics", "integer sequences", "Euler numbers"],
    "compatible",
    "Matches Sage, and the Wolfram Language's `EulerE`, for every nonnegative `n`.",
    [],
)
_register_combinat_function_doc(
    "harmonic_number",
    harmonic_number,
    [_SAGE_FUNCTIONS_PROVENANCE],
    [_CONCRETE_MATH_REFERENCE],
    [_HARMONIC_LIMITATION],
    ["combinatorics", "harmonic numbers"],
    "partial",
    "Matches Sage for nonnegative integer `n` and `m`.",
    [],
)
_register_combinat_function_doc(
    "q_binomial",
    q_binomial,
    [_SAGE_Q_ANALOGUES_PROVENANCE],
    [_ANDREWS_REFERENCE],
    [_QBINOMIAL_LIMITATION],
    ["combinatorics", "binomial coefficients", "q-analogues"],
    "partial",
    (
        "Matches Sage for an explicit integer or polynomial-ring `q`; "
        "the zero-argument polynomial-ring default is not implemented."
    ),
    ["gaussian_binomial"],
)
_register_combinat_function_doc(
    "gaussian_binomial",
    gaussian_binomial,
    [_SAGE_Q_ANALOGUES_PROVENANCE],
    [_ANDREWS_REFERENCE],
    [_QBINOMIAL_LIMITATION],
    ["combinatorics", "binomial coefficients", "q-analogues"],
    "partial",
    "Sage's own alias for `q_binomial`, documented under the same name.",
    ["q_binomial"],
)


_COMBINAT_PARTITION_METHODS = [
    ["Partition.size", "the integer partitioned by a partition"],
    ["Partition.length", "the number of parts of a partition"],
    ["Partition.to_list", "the parts of a partition as an ordinary list"],
    ["Partition.conjugate", "the transpose of the Ferrers diagram"],
    ["Partition.to_exp", "the multiplicities of the parts"],
    ["Partition.cells", "the coordinates of the Ferrers diagram cells"],
    ["Partition.hook_length", "the hook length of one cell"],
    ["Partition.hook_lengths", "the hook lengths of every cell"],
    ["Partition.dominates", "comparison in the dominance order"],
    ["Partition.ferrers_diagram", "the Ferrers diagram as text"],
    ["Partitions.cardinality", "the exact number of members"],
    ["Partitions.list", "every member of a finite class"],
    ["Partitions.first", "the first member in enumeration order"],
    ["Partitions.last", "the last member in enumeration order"],
    ["Partitions.unrank", "the member at a given position"],
    ["Partitions.rank", "the position of a given member"],
    ["Partitions.random_element", "a uniformly random member"],
]


def _combinat_method_value(owner: Any, name: str) -> Any:
    """Return a bound method definition from a class or its prototype."""
    prototype = runtime.reflect.get(owner, "prototype")
    if prototype is not runtime.undefined and prototype is not None:
        candidate = runtime.reflect.get(prototype, name)
        if candidate is not runtime.undefined:
            return candidate
    return runtime.reflect.get(owner, name)


def _register_combinat_method_docs() -> None:
    owners = {
        "Partition": Partition,
        "Partitions": Partitions_n,
    }
    for record in _COMBINAT_PARTITION_METHODS:
        parts = record[0].split(".")
        value = _combinat_method_value(owners[parts[0]], parts[1])
        # Prefer the method's own documentation; the table entry is the
        # one-line summary used when a method carries no docstring.
        authored = runtime.undefined
        if value is not runtime.undefined and value is not None:
            authored = runtime.reflect.get(value, "__doc__")
        text = record[1] if authored is runtime.undefined or not authored else authored
        runtime.register_doc(
            record[0],
            value,
            {
                "kind": "method",
                "module": "sage.combinat",
                "signature": record[0] + "()",
                "doc": text,
                "tags": ["combinatorics", "partitions"],
                "backends": ["Sage.js exact enumeration"],
                "sage_compatibility": {
                    "status": "partial",
                    "notes": "The implemented behavior matches Sage.",
                },
                "provenance": [
                    {
                        "kind": "sage-derived",
                        "source": "SageMath `sage.combinat.partition`",
                        "url": (
                            "https://doc.sagemath.org/html/en/reference/combinat/"
                            "sage/combinat/partition.html"
                        ),
                        "license": "GPL-2.0-or-later",
                    },
                ],
                "limitations": [],
            },
        )


_register_combinat_method_docs()
