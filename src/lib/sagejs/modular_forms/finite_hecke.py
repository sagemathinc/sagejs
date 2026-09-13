"""Reusable exact sparse operators on finite Hecke sets.

Arithmetic constructors retain their own vertex and neighbor representations.
This module factors only the contract shared by supersingular, icosian, and
general algebraic-modular-form finite sets: exact masses, sparse Hecke rows,
constant degree, mass adjointness, and commuting good operators.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

from .sparse_hecke import SparseHeckeOperator


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


class FiniteHeckeSet:
    """Abstract exact finite set with sparse mass-adjoint Hecke rows."""

    def __init__(
        self,
        *,
        base_ring: Any = None,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        if base_ring is None:
            base_ring = sage.ZZ
        limit = _integer(dense_entry_limit, "dense entry limit")
        if limit < 0:
            raise ValueError("dense entry limit must be nonnegative")
        self._finite_hecke_base_ring = base_ring
        self._finite_hecke_dense_limit = limit
        self._finite_hecke_cache: list[tuple[Any, SparseHeckeOperator]] = []

    def cardinality(self) -> int:
        raise NotImplementedError("a finite Hecke set must define cardinality")

    def mass(self, index: Any) -> Any:
        raise NotImplementedError("a finite Hecke set must define exact masses")

    def hecke_degree(self, index: Any) -> int:
        raise NotImplementedError("a finite Hecke set must define Hecke degrees")

    def hecke_row(self, index: Any, row: Any) -> tuple[tuple[int, int], ...]:
        raise NotImplementedError("a finite Hecke set must define sparse Hecke rows")

    def hecke_label(self, index: Any) -> str:
        return str(index)

    def base_ring(self) -> Any:
        return self._finite_hecke_base_ring

    def mass_weights(self) -> tuple[Any, ...]:
        return tuple(self.mass(index) for index in range(self.cardinality()))

    def eisenstein_vector(self) -> Any:
        return _global("vector")(
            self._finite_hecke_base_ring,
            [self._finite_hecke_base_ring(1) for _ in range(self.cardinality())],
        )

    def mass_inner_product(self, left: Any, right: Any) -> Any:
        left_entries = list(left)
        right_entries = list(right)
        if (
            len(left_entries) != self.cardinality()
            or len(right_entries) != self.cardinality()
        ):
            raise ValueError("mass-pairing vectors have the wrong length")
        total = sage.QQ(0)
        for position, mass in enumerate(self.mass_weights()):
            total += (
                mass
                * sage.QQ(left_entries[position])
                * sage.QQ(right_entries[position])
            )
        return total

    def is_cuspidal(self, vector: Any) -> bool:
        return self.mass_inner_product(vector, self.eisenstein_vector()) == 0

    def _cached_operator(self, index: Any) -> SparseHeckeOperator | None:
        for cached_index, operator in self._finite_hecke_cache:
            if cached_index == index:
                return operator
        return None

    def hecke_operator(self, index: Any) -> SparseHeckeOperator:
        """Construct, certify, and cache the operator from sparse rows."""
        cached = self._cached_operator(index)
        if cached is not None:
            return cached
        size = self.cardinality()
        degree = _integer(self.hecke_degree(index), "Hecke degree")
        if degree < 1:
            raise ValueError("Hecke degree must be positive")
        row_offsets = [0]
        columns = []
        values = []
        for row in range(size):
            sparse_row = self.hecke_row(index, row)
            if sum(multiplicity for _column, multiplicity in sparse_row) != degree:
                raise ArithmeticError("a finite Hecke row has the wrong degree")
            for column, multiplicity in sparse_row:
                columns.append(column)
                values.append(multiplicity)
            row_offsets.append(len(columns))
        operator = SparseHeckeOperator(
            self._finite_hecke_base_ring,
            size,
            size,
            row_offsets,
            columns,
            values,
            index=index,
            name="Sparse Hecke operator " + self.hecke_label(index),
            dense_entry_limit=self._finite_hecke_dense_limit,
        )
        masses = self.mass_weights()
        for row in range(size):
            for column, multiplicity in operator.row(row):
                opposite = int(operator[column, row])
                if masses[row] * multiplicity != masses[column] * opposite:
                    raise ArithmeticError("finite Hecke mass adjointness failed")
        for _previous_index, previous in self._finite_hecke_cache:
            if not operator.commutes_with(previous):
                raise ArithmeticError("good finite Hecke operators do not commute")
        self._finite_hecke_cache.append((index, operator))
        return operator

    T = hecke_operator


class SupersingularFiniteHeckeSet(FiniteHeckeSet):
    """Adapter from a classical `SupersingularModule` to `FiniteHeckeSet`."""

    def __init__(self, module: Any) -> None:
        if not hasattr(module, "supersingular_points") or not hasattr(module, "T"):
            raise TypeError("a SupersingularModule-compatible object is required")
        self._module = module
        super().__init__(base_ring=module.base_ring())

    def cardinality(self) -> int:
        return int(self._module.dimension())

    def mass(self, index: Any) -> Any:
        position = _integer(index, "finite-set index")
        if position < 0 or position >= self.cardinality():
            raise IndexError("finite-set index is out of range")
        return self._module.mass_weights()[position]

    def hecke_degree(self, index: Any) -> int:
        return _integer(index, "Hecke index") + 1

    def hecke_row(self, index: Any, row: Any) -> tuple[tuple[int, int], ...]:
        return self._module.T(index).row(row)

    def hecke_operator(self, index: Any) -> SparseHeckeOperator:
        return self._module.T(index)

    T = hecke_operator

    def hecke_label(self, index: Any) -> str:
        return "T_" + str(index)


def finite_hecke_set(value: Any) -> FiniteHeckeSet:
    """Return the reusable finite-Hecke-set view of a supported object."""
    if isinstance(value, FiniteHeckeSet):
        return value
    if hasattr(value, "supersingular_points") and hasattr(value, "T"):
        return SupersingularFiniteHeckeSet(value)
    method = getattr(value, "finite_hecke_set", None)
    if method is not None:
        answer = method()
        if isinstance(answer, FiniteHeckeSet):
            return answer
    raise TypeError("the object has no supported finite Hecke set")


__all__ = ["FiniteHeckeSet", "SupersingularFiniteHeckeSet", "finite_hecke_set"]
