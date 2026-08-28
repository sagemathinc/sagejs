"""Warm-profile entry for the authentic cubic Minkowski factor-base phase."""

import hashlib
import json

EXPECTED_RATIONAL_PRIMES = 94
EXPECTED_FACTOR_RECORDS = 91
EXPECTED_PAYLOAD_SHA256 = (
    "4de40d4659dadeda0b2e2ce8d06362bc15de9367bc173273cd0c74bd0e28fc04"
)
EXPECTED_SMALL_CLASS_NUMBERS = (1, 1, 1)

_CUBIC = None
_FACTOR_BASES = None
_OM_TYPES = None
_PLAN = None
_EQUATION_COEFFICIENTS = None
_RATIONAL_PRIMES = None


def _pure_cubic_field(prime, name):
    ring = PolynomialRing(QQ, "x")
    x = ring.gen()
    return NumberField(x**3 - prime, name)


def __profile_prepare__():
    """Build the field, maximal order, and plan outside the sampled phase."""
    global _CUBIC
    global _FACTOR_BASES
    global _OM_TYPES
    global _PLAN
    global _EQUATION_COEFFICIENTS
    global _RATIONAL_PRIMES

    _CUBIC = __import__(
        "sagejs.number_fields.cubic_class_number",
        fromlist=["packed_cubic_factor_records"],
    )
    _FACTOR_BASES = __import__(
        "sagejs.number_fields.class_group_factor_base",
        fromlist=["factor_base_plan"],
    )
    prime_ideals = __import__(
        "sagejs.number_fields.prime_ideals",
        fromlist=["integral_equation_polynomial"],
    )
    _OM_TYPES = prime_ideals._om

    field = _pure_cubic_field(1_009, "factor_base_1009")
    order = field.maximal_order()
    _PLAN = _FACTOR_BASES.factor_base_plan(
        order,
        proof=True,
        theorem="minkowski",
    )
    equation = prime_ideals._maximal.integral_equation_polynomial(field)
    _EQUATION_COEFFICIENTS = tuple(int(value) for value in equation.list())
    _RATIONAL_PRIMES = tuple(
        int(value)
        for value in prime_ideals._nf_global("prime_range")(
            2,
            int(_PLAN.bound) + 1,
        )
    )
    assert len(_RATIONAL_PRIMES) == EXPECTED_RATIONAL_PRIMES
    return (int(_PLAN.bound), len(_RATIONAL_PRIMES), _EQUATION_COEFFICIENTS)


def _production_once():
    if _PLAN is None:
        raise RuntimeError("call __profile_prepare__ before the production entry")
    return _CUBIC.packed_cubic_factor_records(_PLAN)


def _exact_output(packed):
    assert packed is not None
    payload = [record.to_dict() for record in packed]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    assert len(payload) == EXPECTED_FACTOR_RECORDS
    assert digest == EXPECTED_PAYLOAD_SHA256

    for prime in _RATIONAL_PRIMES:
        fast = _OM_TYPES.factor_cubic_mod_prime(_EQUATION_COEFFICIENTS, prime)
        generic = _OM_TYPES.factor_mod_prime(_EQUATION_COEFFICIENTS, prime)
        assert fast == generic
    return (len(_RATIONAL_PRIMES), len(payload), digest, True)


def _cost_gate_once():
    """Retain three tiny public class-number calls as a no-regression gate."""
    answers = tuple(
        int(_pure_cubic_field(prime, "small_" + str(prime)).class_number(proof=False))
        for prime in (2, 3, 5)
    )
    assert answers == EXPECTED_SMALL_CLASS_NUMBERS
    return answers


def __profile_run__():
    """Run the production factor phase and exact modular replay."""
    return _exact_output(_production_once())
