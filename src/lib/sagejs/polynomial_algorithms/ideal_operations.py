"""Exact ideal intersection, colon, and saturation by elimination.

These are ordinary field-parametric polynomial algorithms. They intentionally
know nothing about FLINT, msolve, scheme objects, or concrete coefficient
encodings; all arithmetic and Gröbner work crosses the public ring/ideal API.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_MAX_GENERATORS = 128
_MAX_SATURATION_STEPS = 32
_MAX_EXACT_QUOTIENT_STEPS = 1000000


def _fresh_variable_name(ring: Any, prefix: str) -> str:
    names = list(ring.variable_names())
    candidate = prefix
    index = 0
    while candidate in names:
        index += 1
        candidate = prefix + str(index)
    return candidate


def _extended_ring(ring: Any, prefix: str) -> Any:
    name = _fresh_variable_name(ring, prefix)
    names = list(ring.variable_names()) + [name]
    return sage.PolynomialRing(
        ring.base_ring(),
        len(names),
        names=names,
        order="lex",
    )


def _extend_polynomial(polynomial: Any, target: Any) -> Any:
    terms = []
    for coefficient, exponents_value in polynomial.terms():
        exponents = list(exponents_value) + [0]
        terms.append(runtime.math_tuple([coefficient, runtime.math_tuple(exponents)]))
    return target._from_sparse_terms(terms)


def _contract_polynomial(polynomial: Any, target: Any) -> Any:
    terms = []
    for coefficient, exponents_value in polynomial.terms():
        exponents = list(exponents_value)
        if exponents[-1] != 0:
            raise ArithmeticError("elimination result retained an auxiliary variable")
        del exponents[-1]
        terms.append(runtime.math_tuple([coefficient, runtime.math_tuple(exponents)]))
    return target._from_sparse_terms(terms)


def _validate_pair(left: Any, right: Any) -> Any:
    if right.ring() is not left.ring():
        raise TypeError("polynomial ideals must belong to the same ring")
    if len(left.gens()) + len(right.gens()) > _MAX_GENERATORS:
        raise OverflowError("ideal operation exceeds the 128-generator limit")
    return right


def _monomial_divides(divisor: Any, dividend: Any) -> bool:
    for index in range(len(divisor)):
        if divisor[index] > dividend[index]:
            return False
    return True


def _exact_polynomial_quotient(dividend: Any, divisor: Any) -> Any:
    """Return an exact field-polynomial quotient using sparse long division.

    Ideal intersection guarantees exact divisibility in the principal-colon
    construction below.  Keeping this small operation at the public sparse
    polynomial boundary is important: native FLINT exposes general exact
    multivariate division, but the reviewed browser/Wasm slice does not.
    """
    ring = dividend.parent()
    divisor = ring(divisor)
    divisor_terms = divisor.terms()
    if len(divisor_terms) == 0:
        raise ZeroDivisionError("polynomial division by zero")
    divisor_coefficient, divisor_exponents = divisor_terms[0]
    pending = ring(dividend)
    quotient = ring(0)
    step = 0
    while pending != ring(0):
        if step >= _MAX_EXACT_QUOTIENT_STEPS:
            raise OverflowError("exact polynomial quotient exceeds the step limit")
        step += 1
        dividend_coefficient, dividend_exponents = pending.terms()[0]
        if not _monomial_divides(divisor_exponents, dividend_exponents):
            raise ArithmeticError("polynomial quotient is not exact")
        quotient_exponents = []
        for index in range(len(divisor_exponents)):
            quotient_exponents.append(
                dividend_exponents[index] - divisor_exponents[index]
            )
        quotient_term = ring._from_sparse_terms(
            [
                runtime.math_tuple(
                    [
                        dividend_coefficient / divisor_coefficient,
                        runtime.math_tuple(quotient_exponents),
                    ]
                )
            ]
        )
        quotient += quotient_term
        pending -= quotient_term * divisor
    if quotient * divisor != dividend:
        raise ArithmeticError("polynomial quotient verification failed")
    return quotient


def intersection(
    left: Any,
    right: Any,
    algorithm: str = "buchberger",
    proof: Any = None,
) -> Any:
    """Return `left intersection right` via `t*left + (1-t)*right`."""
    right = _validate_pair(left, right)
    ring = left.ring()
    temporary = _extended_ring(ring, "_sagejs_intersection_t")
    t = temporary.gen(temporary.ngens() - 1)
    one = temporary(1)
    generators = []
    for generator in left.gens():
        generators.append(t * _extend_polynomial(generator, temporary))
    for generator in right.gens():
        generators.append((one - t) * _extend_polynomial(generator, temporary))
    eliminated = temporary.ideal(generators).elimination_ideal(
        t,
        algorithm=algorithm,
        proof=proof,
    )
    return ring.ideal(
        [_contract_polynomial(generator, ring) for generator in eliminated.gens()]
    )


def _principal_colon(
    ideal: Any,
    polynomial: Any,
    algorithm: str,
    proof: Any,
) -> Any:
    ring = ideal.ring()
    polynomial = ring(polynomial)
    if polynomial == ring(0):
        return ring.ideal(1)
    principal = ring.ideal(polynomial)
    common = intersection(ideal, principal, algorithm=algorithm, proof=proof)
    quotients = []
    for generator in common.gens():
        quotients.append(_exact_polynomial_quotient(generator, polynomial))
    return ring.ideal(quotients)


def colon(
    left: Any,
    right: Any,
    algorithm: str = "buchberger",
    proof: Any = None,
) -> Any:
    """Return the exact ideal quotient `(left : right)`.

    The identity `(I:J) = intersection_(f in generators(J)) (I:f)` is used,
    while each principal quotient follows from `I intersection (f) = f(I:f)`.
    This handles arbitrary finite generating sets without assuming that a
    convenient sum or product of generators represents the same quotient.
    """
    right = _validate_pair(left, right)
    ring = left.ring()
    nonzero = [generator for generator in right.gens() if generator != ring(0)]
    if len(nonzero) == 0:
        return ring.ideal(1)
    answer = _principal_colon(left, nonzero[0], algorithm, proof)
    for generator in nonzero[1:]:
        component = _principal_colon(left, generator, algorithm, proof)
        answer = intersection(answer, component, algorithm=algorithm, proof=proof)
    return answer


def _principal_saturation(
    ideal: Any,
    polynomial: Any,
    algorithm: str,
    proof: Any,
) -> Any:
    """Return `(ideal : polynomial^infinity)` by Rabinowitsch elimination."""
    ring = ideal.ring()
    polynomial = ring(polynomial)
    if polynomial == ring(0):
        return ring.ideal(1)
    temporary = _extended_ring(ring, "_sagejs_saturation_t")
    t = temporary.gen(temporary.ngens() - 1)
    generators = [_extend_polynomial(value, temporary) for value in ideal.gens()]
    generators.append(temporary(1) - t * _extend_polynomial(polynomial, temporary))
    eliminated = temporary.ideal(generators).elimination_ideal(
        t,
        algorithm=algorithm,
        proof=proof,
    )
    return ring.ideal(
        [_contract_polynomial(generator, ring) for generator in eliminated.gens()]
    )


def saturation(
    left: Any,
    right: Any,
    algorithm: str = "buchberger",
    proof: Any = None,
    max_steps: int = _MAX_SATURATION_STEPS,
) -> Any:
    """Return `(left : right^infinity)` with explicit stabilization."""
    right = _validate_pair(left, right)
    if not runtime.is_exact_integer(max_steps) or int(max_steps) <= 0:
        raise ValueError("saturation max_steps must be a positive integer")
    ring = left.ring()
    nonzero = [generator for generator in right.gens() if generator != ring(0)]
    if len(nonzero) == 0:
        return ring.ideal(1)
    if len(nonzero) == 1:
        return _principal_saturation(left, nonzero[0], algorithm, proof)
    current = left
    for _step in range(int(max_steps)):
        following = colon(current, right, algorithm=algorithm, proof=proof)
        if following.is_equal(current, algorithm=algorithm, proof=proof):
            return following
        current = following
    raise OverflowError(
        "ideal saturation did not stabilize within " + str(max_steps) + " steps"
    )
