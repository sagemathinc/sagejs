"""Readable Sage-compatible enumerative combinatorics foundations.

The combinatorics area follows the same shape as the rest of Sage.js: an
enumerated set is an ordinary parent, its members are ordinary elements, and
every count is exact.  A combinatorial class therefore answers `cardinality`
without materializing its members, iterates in Sage's documented order, and
supports the `rank`/`unrank` pair so a member can be addressed by position.

Counting and addressing share one memoized recursion over the largest
remaining part, so `cardinality`, `unrank`, `rank`, and `random_element` all
agree by construction.  Unconstrained counts instead use Euler's pentagonal
number recurrence, which stays exact for arguments far beyond the range where
enumeration is practical.

### Provenance

The public API, the enumeration order, and the documentation prose follow
SageMath's `sage.combinat.partition`, checked against SageMath 10.9.  No
SageMath source was transliterated: the algorithms are implemented from their
published descriptions, recorded per name in the documentation registry.

- Counting `p(n)` uses the recurrence from Euler's pentagonal number theorem
  (Andrews, *The Theory of Partitions*, 1976).
- Constrained counting, `rank`, and `unrank` use counting-driven ranking over
  a recursively counted set (Kreher and Stinson, *Combinatorial Algorithms*,
  1999).
- `random_element` selects a uniform index and descends the same count table
  (the classical technique described by Nijenhuis and Wilf, *Combinatorial
  Algorithms for Computers and Calculators*, 1978).

Sharing a single memo across all four operations is a Sage.js choice, not one
inherited from any of those sources.

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
        # None until a host is probed for FLINT's arithmetic module.
        self.native_counts: Any = None


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
    """Return `p(value)` from FLINT, or `runtime.undefined` when unavailable."""
    if _combinat_state.native_counts is False:
        return runtime.undefined
    try:
        module = __import__("sagejs.ffi.flint", fromlist=["flint"])
        answer = module.arith_number_of_partitions(value)
    except Exception:
        # A host without the arithmetic module keeps the portable recurrence.
        _combinat_state.native_counts = False
        return runtime.undefined
    _combinat_state.native_counts = True
    return answer


def _partition_count_portable(value: int) -> Any:
    """Return `p(value)` from the pentagonal recurrence, never from FLINT."""
    _partition_extend_counts(value)
    return _combinat_state.partition_counts[value]


def _partition_count(value: int) -> Any:
    """
    Return the exact number of partitions of `value`.

    FLINT evaluates the Hardy-Ramanujan-Rademacher formula, which stays fast
    for arguments far past the reach of the recurrence.  The pentagonal
    recurrence remains the portable answer, and both are exact, so a host
    without FLINT differs in speed and not in results.
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
        largest = self._entries[0] if self._entries else 0
        width = largest if largest > minimum_length else minimum_length
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
        index_row = int(row)
        index_column = int(column)
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
        position = int(index)
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

        Filling the table iteratively costs one big-integer addition per cell.
        The memoized recursion it replaces spent most of its time in dictionary
        traffic rather than arithmetic, and dictionary writes are an order of
        magnitude more expensive here than writing to a list.
        """
        if self._table is not None:
            return self._table
        size = self._size
        bound = self._max_part if self._max_part < size else size
        table = []
        for remaining in range(size + 1):
            row = [runtime.bigint(0)] * (bound + 1)
            if remaining == 0:
                for part in range(bound + 1):
                    row[part] = runtime.bigint(1)
            table.append(row)
        for part in range(self._min_part, bound + 1):
            for remaining in range(1, size + 1):
                total = table[remaining][part - 1]
                if part <= remaining:
                    total = runtime.native_add(total, table[remaining - part][part])
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

        The unconstrained count uses Euler's pentagonal number recurrence, so
        it stays exact and fast well beyond the range where listing the
        partitions is practical.

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
        min_part = int(given)
        if min_part < 1:
            raise ValueError("min_part must be positive")
    given = _combinat_setting(constraints, "max_part")
    if given is not None:
        max_part = int(given)
        if max_part < 0:
            raise ValueError("max_part must be nonnegative")
    given = _combinat_setting(constraints, "length")
    if given is not None:
        if "min_length" in supplied or "max_length" in supplied:
            raise ValueError("length cannot be combined with min_length/max_length")
        min_length = int(given)
        max_length = min_length
        if min_length < 0:
            raise ValueError("length must be nonnegative")
    given = _combinat_setting(constraints, "min_length")
    if given is not None:
        min_length = int(given)
        if min_length < 0:
            raise ValueError("min_length must be nonnegative")
    given = _combinat_setting(constraints, "max_length")
    if given is not None:
        max_length = int(given)
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

    The value comes from Euler's pentagonal number recurrence, which is exact
    and fast far past the point where listing partitions is possible.

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
        "One memoized recursion over the largest remaining part serves "
        "cardinality, rank, unrank, and random_element, so the four agree by "
        "construction rather than by separate implementation"
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


_ENUMERATION_LIMITATION = (
    "Enumeration is exact but explicit, so listing a class is practical only "
    "while its cardinality is small.  Counting, ranking, and uniform sampling "
    "avoid enumeration."
)
_COUNTING_LIMITATION = (
    "Counting uses FLINT's Hardy-Ramanujan-Rademacher implementation where it "
    "is available, and the pentagonal recurrence otherwise.  The recurrence "
    "computes every partition number below its argument, so a host without "
    "FLINT answers large arguments far more slowly; both paths are exact.  "
    "The first count in a process also pays about 150 ms to bind the native "
    "routine, after which a count costs a few milliseconds at any argument.  "
    "See `bench/compare-partitions.cjs`."
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
    [_ENUMERATION_LIMITATION, _COUNTING_LIMITATION],
)
_register_combinat_doc(
    "number_of_partitions",
    number_of_partitions,
    "function",
    [_SAGE_PROVENANCE, _FLINT_PROVENANCE, _PENTAGONAL_PROVENANCE],
    [_ANDREWS_REFERENCE],
    [_COUNTING_LIMITATION],
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
