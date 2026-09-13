"""Sage-compatible foundations for linear codes over finite fields."""

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def _global_function(name: str) -> Any:
    value = runtime.reflect.get(runtime.global_object, name)
    if runtime.jstype(value) != "function":
        raise RuntimeError(name + " is unavailable")
    return value


def _coefficient_tuples(
    values: list[Any],
    length: int,
    prefix: list[Any],
) -> Iterator[list[Any]]:
    if len(prefix) == length:
        yield list(prefix)
    else:
        for value in values:
            prefix.append(value)
            for answer in _coefficient_tuples(values, length, prefix):
                yield answer
            prefix.pop()


def _index_permutations(
    size: int,
    used: list[bool],
    prefix: list[int],
) -> Iterator[list[int]]:
    if len(prefix) == size:
        yield list(prefix)
    else:
        for value in range(size):
            if used[value]:
                continue
            used[value] = True
            prefix.append(value)
            for answer in _index_permutations(size, used, prefix):
                yield answer
            prefix.pop()
            used[value] = False


def _mapping_cycles(mapping: list[int]) -> list[list[int]]:
    seen = [False for _value in mapping]
    cycles = []
    for start in range(len(mapping)):
        if seen[start] or mapping[start] == start:
            seen[start] = True
            continue
        cycle = []
        current = start
        while not seen[current]:
            seen[current] = True
            cycle.append(current + 1)
            current = mapping[current]
        cycles.append(cycle)
    return cycles


class LinearCodeParent(sage.Parent):
    """A row-generated linear code over a finite field."""

    def __init__(self, generator_matrix: Any) -> None:
        if not hasattr(generator_matrix, "nrows") or not hasattr(
            generator_matrix, "base_ring"
        ):
            raise TypeError("LinearCode() requires a generator matrix")
        base = generator_matrix.base_ring()
        if not base.is_field() or not hasattr(base, "cardinality"):
            raise TypeError("a linear code must be defined over a finite field")
        self._base = base
        self._generator = generator_matrix.row_space().basis_matrix()
        self._length = generator_matrix.ncols()
        self._space = self._generator.row_space()

    def base_ring(self) -> Any:
        return self._base

    base_field = base_ring

    def length(self) -> int:
        return self._length

    def dimension(self) -> int:
        return self._generator.nrows()

    def generator_matrix(self) -> Any:
        return self._generator

    def basis(self) -> list[Any]:
        return self._generator.rows()

    gens = basis

    def cardinality(self) -> Any:
        return self._base.cardinality() ** self.dimension()

    def dual_code(self) -> LinearCodeParent:
        return LinearCodeParent(self._generator.right_kernel().basis_matrix())

    dual = dual_code

    def is_self_dual(self) -> bool:
        if 2 * self.dimension() != self.length():
            return False
        return self._space == self.dual_code()._space

    def __contains__(self, word: Any) -> bool:
        vector_function = _global_function("vector")
        try:
            candidate = vector_function(self._base, word)
        except Exception:
            return False
        return candidate in self._space

    def encode(self, message: Any) -> Any:
        vector_function = _global_function("vector")
        coefficients = vector_function(self._base, message)
        if len(coefficients) != self.dimension():
            raise ValueError("message length must equal the code dimension")
        return coefficients * self._generator

    def __iter__(self) -> Iterator[Any]:
        vector_function = _global_function("vector")
        field_values = list(self._base)
        for coefficients in _coefficient_tuples(field_values, self.dimension(), []):
            yield vector_function(self._base, coefficients) * self._generator

    def list(self) -> list[Any]:
        return list(self)

    def minimum_distance(self) -> int:
        if int(self.cardinality()) > 1000000:
            raise RuntimeError(
                "exhaustive minimum distance is limited to one million codewords"
            )
        best = self.length() + 1
        zero = self._base(0)
        for word in self:
            weight = 0
            for value in word:
                if value != zero:
                    weight += 1
            if weight > 0 and weight < best:
                best = weight
        return 0 if best == self.length() + 1 else best

    def permutation_automorphism_group(self) -> Any:
        """Return the coordinate-permutation automorphism group by enumeration."""
        if self.length() > 9:
            raise RuntimeError(
                "permutation automorphisms are currently exhaustive and limited to length 9"
            )
        matrix_function = _global_function("matrix")
        group_function = _global_function("PermutationGroup")
        automorphisms = []
        for mapping in _index_permutations(
            self.length(),
            [False for _index in range(self.length())],
            [],
        ):
            entries = []
            for row in range(self.dimension()):
                for column in mapping:
                    entries.append(self._generator[row, column])
            permuted = matrix_function(
                self._base,
                self.dimension(),
                self.length(),
                entries,
            )
            if permuted.row_space() == self._space:
                automorphisms.append(_mapping_cycles(mapping))
        generators = []
        order = 1
        group = None
        for cycles in automorphisms:
            if len(cycles) == 0:
                continue
            candidate = group_function(generators + [cycles])
            candidate_order = int(candidate.order())
            if candidate_order > order:
                generators.append(cycles)
                group = candidate
                order = candidate_order
            if order == len(automorphisms):
                break
        if group is None:
            group = group_function([[]])
        return group

    def __repr__(self) -> str:
        field_size = self._base.cardinality()
        return (
            "["
            + str(self.length())
            + ", "
            + str(self.dimension())
            + "] linear code over GF("
            + str(field_size)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


def LinearCode(generator_matrix: Any) -> LinearCodeParent:
    """Construct the row span of a generator matrix as a linear code."""
    return LinearCodeParent(generator_matrix)
