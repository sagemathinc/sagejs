"""Exact operations on the existing generic public polynomial representation.

Canonical terms remain owned by the public element. Temporary sparse engine
values borrow those immutable terms and use fresh bounded workspaces.
"""

from __future__ import annotations

from time import monotonic
from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.polynomial_algorithms.exact_field import ExactField
from sagejs.polynomial_algorithms.generic_sparse_mpoly import (
    SparseContext,
    SparsePolynomial,
)
from sagejs.polynomial_algorithms.univariate_field import monic_gcd, monic_xgcd

MAX_BITS = 4096
MAX_TERMS = 4096
MAX_COORDINATE_CELLS = 65536
MAX_HEIGHT = sage.ZZ(2) ** MAX_BITS


class PolynomialField(ExactField):
    """Bound inputs and results, including intermediate sparse coefficients."""

    max_coordinate_bits = 0

    def coerce(self, value: Any) -> Any:
        value = self.parent(value)
        for coefficient in value.list():
            bits = max(
                int(coefficient.numerator()).bit_length(),
                int(coefficient.denominator()).bit_length(),
            )
            self.max_coordinate_bits = max(self.max_coordinate_bits, bits)
            if (
                abs(coefficient.numerator()) >= MAX_HEIGHT
                or coefficient.denominator() >= MAX_HEIGHT
            ):
                raise ValueError(
                    "number-field polynomial coefficient height exceeds 4096 bits; observed="
                    + str(bits)
                )
        return value

    def add(self, left: Any, right: Any) -> Any:
        return self.coerce(self.coerce(left) + self.coerce(right))

    def subtract(self, left: Any, right: Any) -> Any:
        return self.coerce(self.coerce(left) - self.coerce(right))

    def multiply(self, left: Any, right: Any) -> Any:
        return self.coerce(self.coerce(left) * self.coerce(right))

    def divide(self, left: Any, right: Any) -> Any:
        return self.coerce(self.coerce(left) / self.coerce(right))

    def inverse(self, value: Any) -> Any:
        return self.divide(self.one(), value)


class PolynomialContext(SparseContext):
    def workspace(self) -> Any:
        ring = super().workspace()
        ring.budget.max_terms = min(
            MAX_TERMS, MAX_COORDINATE_CELLS // self.field.degree
        )
        return ring

    def polynomial(self, terms: Any) -> SparsePolynomial:
        bounded = []
        for term in terms:
            if (
                len(bounded) >= MAX_TERMS
                or (len(bounded) + 1) * self.field.degree > MAX_COORDINATE_CELLS
            ):
                raise ValueError(
                    "number-field polynomial term/coordinate allocation limit exceeded"
                )
            bounded.append(term)
        return super().polynomial(bounded)


def context(base: Any, variables: Any, order: str) -> SparseContext:
    field = PolynomialField(base)
    if field.family != "number-field":
        raise NotImplementedError(
            "this exact sparse route requires a simple number field"
        )
    if base.variable_name() in variables:
        raise ValueError(
            "polynomial variable collides with the number-field generator name"
        )
    return PolynomialContext(field, len(variables), order)


def dense_coefficients(value: Any) -> Any:
    parent = _univariate(value)
    if (value.degree() + 1) * parent.base_ring().degree() > MAX_COORDINATE_CELLS:
        raise ValueError("number-field dense coefficient allocation limit exceeded")
    answer = [parent.base_ring()(0) for _ in range(value.degree() + 1)]
    for coefficient, exponents in value.terms():
        answer[exponents[0]] = coefficient
    return answer


def encode(value: Any) -> Any:
    """Explicit interchange, never an arithmetic representation."""
    field = _sparse(value).context.field
    return {
        "abi": "sagejs.number-field-polynomial/v1",
        "variables": list(value.parent().variable_names()),
        "order": value.parent()._order,
        "field": field.descriptor(),
        "terms": [[field.encode(c), list(e)] for c, e in value.terms()],
    }


def decode(parent: Any, record: Any) -> Any:
    field = parent._exact_context.field
    if (
        not isinstance(record, dict)
        or set(record) != {"abi", "variables", "order", "field", "terms"}
        or record["abi"] != "sagejs.number-field-polynomial/v1"
        or record["variables"] != list(parent.variable_names())
        or record["order"] != parent._order
        or record["field"] != field.descriptor()
    ):
        raise ValueError("number-field polynomial presentation mismatch")
    terms = record["terms"]
    if not isinstance(terms, list) or len(terms) > MAX_TERMS:
        raise ValueError("invalid polynomial term packet")
    value = parent._from_terms([(field.decode(c), e) for c, e in terms])
    if encode(value) != record:
        raise ValueError("polynomial packet is not canonical")
    return value


def _sparse(value: Any) -> SparsePolynomial:
    ctx = value.parent()._exact_context
    if ctx is None:
        raise NotImplementedError(
            "exact generic operations require a number-field parent"
        )
    return SparsePolynomial(ctx, value.terms())


def multiply(left: Any, right: Any) -> Any:
    return left.parent()._from_terms(_sparse(left).multiply(_sparse(right)).terms())


def evaluate(value: Any, coordinates: Any) -> Any:
    return _sparse(value).evaluate(coordinates)


def normal_form(value: Any, basis: Any) -> Any:
    from sagejs.polynomial_algorithms.groebner_contract import (
        normal_form as reduce_terms,
    )

    parent = value.parent()
    terms = reduce_terms(
        value.terms(),
        tuple(g.terms() for g in basis),
        parent._exact_context.workspace(),
    )
    return parent._from_terms(terms)


def term_dictionary(value: Any) -> Any:
    return {
        (e[0] if value.parent().ngens() == 1 else tuple(e)): c for c, e in value.terms()
    }


def from_dictionary(parent: Any, value: Any) -> Any:
    return parent._from_terms(
        [(c, (e,) if isinstance(e, int) else e) for e, c in value.items()]
    )


def power(value: Any, exponent: Any) -> Any:
    if isinstance(exponent, bool) or not isinstance(exponent, int):
        raise TypeError("polynomial exponent must be an integer")
    return value.parent()._from_terms(_sparse(value).power(exponent).terms())


def divide(left: Any, right: Any) -> Any:
    quotient, remainder = _sparse(left).divide(_sparse(right))
    parent = left.parent()
    return parent._from_terms(quotient.terms()), parent._from_terms(remainder.terms())


def _univariate(value: Any) -> Any:
    _sparse(value)
    if value.parent().ngens() != 1:
        raise NotImplementedError("this operation requires a univariate polynomial")
    if value.degree() > 4096:
        raise ValueError("exact univariate operation requires degree <= 4096")
    return value.parent()


def gcd(left: Any, right: Any) -> Any:
    _univariate(left)
    return monic_gcd(left, right)


def xgcd(left: Any, right: Any) -> Any:
    _univariate(left)
    return monic_xgcd(left, right)


def derivative(value: Any, variable: Any = None) -> Any:
    parent = value.parent()
    if variable is None:
        if parent.ngens() != 1:
            raise TypeError("specify the differentiation variable")
        index = 0
    else:
        index = parent._generator_index(variable)
    return parent._from_terms(_sparse(value).derivative(index).terms())


def substitute(value: Any, substitutions: Any, keywords: Any) -> Any:
    parent = value.parent()
    _sparse(value)
    replacements = list(parent.gens())
    entries = [] if substitutions is None else list(substitutions.items())
    entries.extend(
        (name, runtime.reflect.get(keywords, name))
        for name in runtime.object.keys(keywords)
    )
    target = parent
    for _variable, replacement in entries:
        if hasattr(replacement, "terms") and hasattr(replacement, "parent"):
            candidate = replacement.parent()
            if candidate.base_ring() is not parent.base_ring():
                raise TypeError("substitution coefficient fields must agree")
            if target is not parent and candidate is not target:
                raise TypeError("substitution polynomials must share a target parent")
            target = candidate
    if target is not parent:
        names = list(target.variable_names())
        replaced = [parent._generator_index(variable) for variable, _ in entries]
        replacements = [
            target.gen(names.index(name)) if name in names else target(0)
            for name in parent.variable_names()
        ]
        if any(
            i not in replaced and name not in names
            for i, name in enumerate(parent.variable_names())
        ):
            raise ValueError("substitution target is missing an unsubstituted variable")
    for variable, replacement in entries:
        replacements[parent._generator_index(variable)] = target(replacement)
    answer = target(0)
    started = monotonic()
    for coefficient, exponents in value.terms():
        if monotonic() - started > 30:
            raise RuntimeError("number-field substitution time limit exceeded")
        term = target(coefficient)
        for index, exponent in enumerate(exponents):
            term *= replacements[index] ** exponent
        answer += term
    return answer


def homogenize(value: Any, variable: Any, target: Any = None) -> Any:
    parent = value.parent()
    _sparse(value)
    supplied = target is not None
    if target is None:
        target = parent
    names = list(parent.variable_names())
    if not supplied and isinstance(variable, str) and variable not in names:
        target = sage.PolynomialRing(
            parent.base_ring(), names + [variable], order=parent._order
        )
        index = len(names)
    else:
        index = target._generator_index(variable)
    target_names = list(target.variable_names())
    if target.base_ring() is not parent.base_ring() or any(
        name not in target_names for name in names
    ):
        raise TypeError(
            "homogenization target must preserve source variables and field"
        )
    mapping = [target_names.index(name) for name in names]
    if target is not parent and (
        target.ngens() != parent.ngens() + 1 or index in mapping
    ):
        raise ValueError("homogenization target must add exactly one new coordinate")
    degree = value.total_degree()
    terms = []
    for coefficient, exponents in value.terms():
        powers = [0] * target.ngens()
        for i, exponent in enumerate(exponents):
            powers[mapping[i]] = exponent
        powers[index] += degree - sum(exponents)
        terms.append((coefficient, tuple(powers)))
    return target._from_terms(terms)


def dehomogenize(value: Any, variable: Any, target: Any = None) -> Any:
    parent = value.parent()
    index = parent._generator_index(variable)
    if target is None:
        return substitute(value, {parent.variable_names()[index]: 1}, {})
    names = list(target.variable_names())
    source_names = list(parent.variable_names())
    if target.base_ring() is not parent.base_ring() or names != [
        n for i, n in enumerate(source_names) if i != index
    ]:
        raise TypeError(
            "dehomogenization target must remove only the selected coordinate"
        )
    return target._from_terms(
        [
            (c, tuple(e for i, e in enumerate(exponents) if i != index))
            for c, exponents in value.terms()
        ]
    )


def factor(value: Any) -> Any:
    from sagejs.polynomial_algorithms.number_field_factor import (
        factor as implementation,
    )

    return implementation(value)


def is_irreducible(value: Any) -> bool:
    from sagejs.polynomial_algorithms.number_field_factor import (
        is_irreducible as implementation,
    )

    return implementation(value)


def resultant(left: Any, right: Any) -> Any:
    """Exact Sylvester determinant; bounded reference algorithm, not a fast path."""
    parent = _univariate(left)
    _univariate(right)
    field = parent._exact_context.field
    if not left or not right:
        return field.zero()
    n, m = left.degree(), right.degree()
    size = n + m
    if size > 64:
        raise ValueError("number-field resultant Sylvester dimension limit is 64")
    if size * size * field.degree > MAX_COORDINATE_CELLS:
        raise ValueError("number-field resultant coordinate allocation limit exceeded")
    started = monotonic()
    a, b = list(reversed(left.list())), list(reversed(right.list()))
    rows = [[field.zero()] * i + a + [field.zero()] * (m - i - 1) for i in range(m)] + [
        [field.zero()] * i + b + [field.zero()] * (n - i - 1) for i in range(n)
    ]
    answer = field.one()
    for j in range(size):
        if monotonic() - started > 30:
            raise RuntimeError("number-field resultant time limit exceeded")
        pivot = next((i for i in range(j, size) if rows[i][j] != field.zero()), None)
        if pivot is None:
            return field.zero()
        if pivot != j:
            rows[j], rows[pivot] = rows[pivot], rows[j]
            answer = -answer
        value = rows[j][j]
        answer = field.multiply(answer, value)
        for i in range(j + 1, size):
            ratio = field.divide(rows[i][j], value)
            for k in range(j + 1, size):
                rows[i][k] = field.subtract(
                    rows[i][k], field.multiply(ratio, rows[j][k])
                )
    return answer


def squarefree(value: Any) -> Any:
    """Characteristic-zero squarefree layers, retaining the exact leading unit."""
    parent = _univariate(value)
    if not value:
        raise ArithmeticError("squarefree decomposition of zero is undefined")
    unit = value.list()[-1]
    f = value / unit
    common = gcd(f, derivative(f))
    remaining = f / common
    factors = []
    multiplicity = 1
    started = monotonic()
    while remaining != parent(1):
        if monotonic() - started > 30:
            raise RuntimeError("number-field squarefree time limit exceeded")
        overlap = gcd(remaining, common)
        layer = remaining / overlap
        if layer != parent(1):
            factors.append((layer, multiplicity))
        remaining, common = overlap, common / overlap
        multiplicity += 1
    return sage.Factorization(factors, unit, False, False, False)
