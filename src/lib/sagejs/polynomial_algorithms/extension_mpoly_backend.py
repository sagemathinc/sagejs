"""Resident FLINT multivariates with bounded, exact, parent-owned spill.

Only the existing public polynomial classes use this private delegate. Native
contexts are reconstructed from canonical modulus data, never scalar handles.
Values stay resident for arithmetic; terms are decoded only on demand. A
context closes when its last resident child and operation pin disappear.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime
from sagejs.polynomial_algorithms import groebner_contract as engine
from sagejs.polynomial_algorithms.exact_field import ExactField
from sagejs.polynomial_algorithms.fq_mpoly_transfer import (
    ORDERS,
    _unpack_rows,
    pack_terms,
    unpack_factorization,
    unpack_terms,
)
from sagejs.polynomial_algorithms.generic_sparse_mpoly import (
    SparseContext,
    SparsePolynomial,
)

_MAX_VALUES = 64
_MAX_BYTES = 16777216
_RESIDENT: list[Any] = []
_retained_bytes = 0


def _ffi() -> Any:
    return __import__("sagejs.ffi.flint", fromlist=["fq_mpoly_context"])


def _trim() -> None:
    while len(_RESIDENT) > _MAX_VALUES or _retained_bytes > _MAX_BYTES:
        victim = next((value for value in _RESIDENT if value.pins == 0), None)
        if victim is None:
            return  # bounded operands of the current synchronous operation
        victim.spill()


def cache_status() -> Any:
    """Return resident value count and conservatively charged retained bytes."""
    return len(_RESIDENT), _retained_bytes


class _Value:
    def __init__(self, owner: Any, resource: Any = None, sparse: Any = None) -> None:
        self.owner = owner
        self.resource_value: Any = None
        self.sparse = sparse
        self.snapshot: Any = None
        self.pins = 0
        self.weight = 0
        if resource is not None:
            self.adopt(resource)

    def adopt(self, resource: Any) -> None:
        global _retained_bytes
        try:
            weight = int(_ffi().fq_mpoly_cache_bytes(resource))
        except BaseException:
            resource.close()
            raise
        self.resource_value = resource
        self.weight = weight
        self.owner.children += 1
        _RESIDENT.append(self)
        _retained_bytes += weight
        try:
            _trim()
        except BaseException:
            self.discard()
            raise

    def discard(self) -> None:
        global _retained_bytes
        if self.resource_value is None:
            return
        self.resource_value.close()
        self.resource_value = None
        self.owner.children -= 1
        _RESIDENT.remove(self)
        _retained_bytes -= self.weight
        self.weight = 0
        self.owner.close_unused_context()

    def packet(self) -> Any:
        if self.snapshot is None:
            if self.resource_value is None:
                raise RuntimeError("resident polynomial has no packet source")
            region = _ffi().fq_mpoly_term_bytes(self.resource_value)
            try:
                self.snapshot = bytes(region.take_bytes())
            finally:
                region.close()
        return self.snapshot

    def spill(self) -> None:
        if self.resource_value is not None:
            # Do not discard the live value if serialization fails.
            self.packet()
            self.discard()

    def terms(self) -> Any:
        if self.sparse is None:
            self.sparse = SparsePolynomial(
                self.owner.context,
                unpack_terms(
                    self.packet(),
                    self.owner.field,
                    self.owner.context.variables,
                    self.owner.context.order,
                ),
            )
        return self.sparse.terms()

    def reference(self) -> SparsePolynomial:
        self.terms()
        return self.sparse

    def resource(self) -> Any:
        if self.pins < 1 or self.owner.pins < 1:
            raise RuntimeError("a resident polynomial borrow requires an operation pin")
        if self.resource_value is None:
            if self.snapshot is not None:
                rows = _unpack_rows(
                    self.snapshot,
                    self.owner.field,
                    self.owner.context.variables,
                    self.owner.context.order,
                )
                # Rehydrate directly from prime-field words, without allocating
                # scalar field elements or borrowing another reactor's pointers.
                words = [word for coordinates, _ in rows for word in coordinates]
                words.extend(word for _, powers in rows for word in powers)
                count = len(rows)
            else:
                words, count = pack_terms(
                    self.sparse.terms(),
                    self.owner.field,
                    self.owner.context.variables,
                    self.owner.context.order,
                )
            self.adopt(
                _ffi().fq_mpoly_from_terms(
                    self.owner.resource_context(),
                    runtime.uint64_buffer(words),
                    len(words),
                    count,
                )
            )
        _RESIDENT.remove(self)
        _RESIDENT.append(self)
        return self.resource_value


class ExtensionMpolyBackend:
    """A private parent-specific delegate for canonical finite extensions."""

    def __init__(self, base: Any, variables: int, order: str) -> None:
        self.field = ExactField(base)
        pack_terms((), self.field, variables, order)  # common native/Wasm gate
        self.context = SparseContext(self.field, variables, order)
        self.context_value: Any = None
        self.children = 0
        self.pins = 0

    def resource_context(self) -> Any:
        if self.pins == 0:
            raise RuntimeError("a foreign context requires an active operation")
        if self.context_value is None:
            modulus = [int(c) for c in self.field.descriptor()["modulus"]]
            self.context_value = _ffi().fq_mpoly_context(
                runtime.uint64_buffer(modulus),
                len(modulus),
                self.field.characteristic,
                self.context.variables,
                ORDERS[self.context.order],
            )
        return self.context_value

    def close_unused_context(self) -> None:
        if self.children == 0 and self.pins == 0 and self.context_value is not None:
            self.context_value.close()
            self.context_value = None

    def owned(self, value: Any) -> _Value:
        if not isinstance(value, _Value) or value.owner is not self:
            raise TypeError(
                "multivariate operands require the same parent-owned context"
            )
        return value

    def foreign(
        self, name: str, values: Any, arguments: Any = (), output: str = "polynomial"
    ) -> Any:
        operands = [self.owned(value) for value in values]
        self.pins += 1
        for value in operands:
            value.pins += 1
        try:
            resources = [value.resource() for value in operands]
            result = getattr(_ffi(), name)(*resources, *arguments)
            if output == "scalar":
                return result
            if output == "bytes":
                try:
                    return bytes(result.take_bytes())
                finally:
                    result.close()
            return _Value(self, resource=result)
        finally:
            for value in operands:
                value.pins -= 1
            self.pins -= 1
            try:
                _trim()
            finally:
                self.close_unused_context()

    def from_terms(self, terms: Any) -> Any:
        return _Value(self, sparse=self.context.polynomial(terms))

    def mpolyGen(self, context: Any, index: int) -> Any:
        if context is not self.context:
            raise TypeError("wrong multivariate context")
        return _Value(self, sparse=self.context.generator(index))

    def mpolyConstant(self, context: Any, numerator: Any, denominator: Any) -> Any:
        if context is not self.context:
            raise TypeError("wrong multivariate context")
        return _Value(
            self,
            sparse=self.context.constant(
                self.field.divide(
                    self.field.coerce(numerator), self.field.coerce(denominator)
                )
            ),
        )

    def binary(self, left: Any, right: Any, operation: int) -> Any:
        self.owned(left)
        self.owned(right)
        try:
            return self.foreign("fq_mpoly_binary", (left, right), (operation,))
        except ValueError:
            # Expanded-term preflight can reject a product whose cancellations
            # fit the exact sparse envelope. Only arithmetic has this fallback.
            first, second = left.reference(), right.reference()
            result = (
                first.add(second)
                if operation == 0
                else (
                    first.subtract(second) if operation == 1 else first.multiply(second)
                )
            )
            return _Value(self, sparse=result)

    def mpolyAdd(self, left: Any, right: Any) -> Any:
        return self.binary(left, right, 0)

    def mpolySub(self, left: Any, right: Any) -> Any:
        return self.binary(left, right, 1)

    def mpolyMul(self, left: Any, right: Any) -> Any:
        return self.binary(left, right, 2)

    def mpolyNeg(self, value: Any) -> Any:
        return self.foreign("fq_mpoly_neg", (value,))

    def mpolyPow(self, value: Any, exponent: Any) -> Any:
        self.owned(value)
        exponent = int(exponent)
        if exponent < 0 or exponent > 1048576:
            raise ValueError(
                "polynomial exponent is outside the sparse resource envelope"
            )
        result = self.mpolyConstant(self.context, 1, 1)
        while exponent:
            if exponent % 2:
                result = self.mpolyMul(result, value)
            exponent //= 2
            if exponent:
                value = self.mpolyMul(value, value)
        return result

    def mpolyDivExact(self, left: Any, right: Any) -> Any:
        quotient, remainder = (
            self.owned(left).reference().divide(self.owned(right).reference())
        )
        if remainder.terms():
            raise ValueError("polynomial division is not exact")
        return _Value(self, sparse=quotient)

    def mpolyEqual(self, left: Any, right: Any) -> bool:
        return self.foreign("fq_mpoly_equal", (left, right), output="scalar")

    def mpolyTerms(self, value: Any) -> Any:
        return self.owned(value).terms()

    def mpolyLength(self, value: Any) -> int:
        return len(self.owned(value).terms())

    def mpolyTotalDegree(self, value: Any) -> int:
        return self.owned(value).reference().degree()

    def mpolyDegree(self, value: Any, index: int) -> int:
        return self.owned(value).reference().degree(index)

    def mpolyReduce(self, value: Any, basis: Any) -> Any:
        return self.from_terms(
            engine.normal_form(
                self.owned(value).terms(),
                [self.owned(g).terms() for g in basis],
                self.context.workspace(),
            )
        )

    def mpolyLeadingMonomial(self, value: Any) -> Any:
        terms = self.owned(value).terms()
        return self.from_terms(((self.field.one(), terms[0][1]),) if terms else ())

    def mpolyComposeGen(self, value: Any, context: Any, mapping: Any) -> Any:
        if (
            context is not self.context
            or value.owner.field.parent is not self.field.parent
        ):
            raise TypeError(
                "generator composition needs an explicit coefficient embedding"
            )
        if len(mapping) != value.owner.context.variables:
            raise ValueError("invalid multivariate generator map")
        for index in mapping:
            self.context.generator(index)
        terms = []
        for coefficient, powers in value.terms():
            target = [0] * self.context.variables
            for index, exponent in zip(mapping, powers, strict=True):
                target[index] += exponent
            terms.append((coefficient, tuple(target)))
        return self.from_terms(terms)

    def mpolyToString(self, value: Any, names: Any) -> str:
        pieces = []
        for coefficient, exponents in self.owned(value).terms():
            powers = [
                names[i] if exponent == 1 else names[i] + "^" + str(exponent)
                for i, exponent in enumerate(exponents)
                if exponent
            ]
            monomial = "*".join(powers)
            pieces.append(
                str(coefficient)
                if not monomial
                else monomial
                if coefficient == self.field.one()
                else "(" + str(coefficient) + ")*" + monomial
            )
        return " + ".join(pieces) if pieces else "0"

    def mpolyGcd(self, left: Any, right: Any) -> Any:
        return self.foreign("fq_mpoly_gcd", (left, right))

    def mpolyResultant(self, left: Any, right: Any, variable: Any) -> Any:
        return self.foreign("fq_mpoly_resultant", (left, right), (int(variable),))

    def mpolyIrreducibleFactors(self, value: Any) -> Any:
        packet = self.foreign("fq_mpoly_factor_bytes", (value,), output="bytes")
        _, factors = unpack_factorization(
            packet, self.field, self.context.variables, self.context.order
        )
        return [(self.from_terms(terms), exponent) for terms, exponent in factors]
