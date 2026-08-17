"""Certified public maximal-order orchestration for simple number fields.

This module is the only path from `NumberField.maximal_order()` to the local
algorithms.  It never completely factors the equation discriminant.  Instead
it refines pairwise-coprime components, handles unresolved square support with
the composite Buchmann--Lenstra step, and sends only independently proven
primes to prime-field algorithms.

The public cache receives a result only after the representation-neutral
certificate checker has recomputed lattice containment, multiplication
closure, the discriminant/index identity, component coverage, and local
maximality evidence.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.number_fields.buchmann_lenstra import (
    BuchmannLenstraResult,
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_result,
)
from sagejs.number_fields.discriminant_components import (
    certify_decomposition_component,
    check_decomposition_certificate,
    check_prime_proof_state,
    decompose_discriminant,
    prime_proof_budget,
    prove_prime_resumable,
    split_decomposition_component,
)
from sagejs.number_fields.maximal_order_certification import (
    certify_global_order,
    check_discriminant_coprime_component_witness,
    make_composite_local_maximality_witness,
    make_local_maximality_witness,
)
from sagejs.number_fields.maximal_order_contracts import (
    DiscriminantComponent,
    MaximalOrderTrace,
    OrderBasis,
)
from sagejs.number_fields.order_resource import native_order_from_polynomial

_nf_module = __import__("sagejs._baselib.number_fields", fromlist=["number_fields"])
NumberFieldOrder = _nf_module.NumberFieldOrder
_nf_lcm = _nf_module._nf_lcm
_untyped = _nf_module._untyped

_MAX_WORD_PRIME = 0xFFFFFFFFFFFFFFFF


def _maximal_order_module() -> Any:
    return __import__(
        "sagejs.number_fields.maximal_order",
        fromlist=["maximal_order"],
    )


def _exact_integer(value: Any) -> int:
    """Return an exact host integer without passing through a JS number."""
    return runtime.integer_bigint(value)


def _integral_polynomial_data(field: Any) -> tuple[list[int], int]:
    polynomial = _maximal_order_module().integral_equation_polynomial(field)
    coefficients = [_exact_integer(value) for value in polynomial.list()]
    degree = field.degree()
    while len(coefficients) < degree + 1:
        coefficients.append(0)
    if len(coefficients) != degree + 1 or coefficients[-1] != 1:
        raise ArithmeticError("the integral equation polynomial is not monic")
    scale = 1
    for coefficient in field._defining_coefficients:
        scale = _exact_integer(_nf_lcm(scale, coefficient._denominator))
    return coefficients, scale


def _order_from_basis(
    field: Any,
    basis: OrderBasis,
    scale: int,
    discriminant: int,
) -> Any:
    """Materialize a basis in powers of `scale*a` in the public generator."""
    rows = []
    for numerator_row in basis.numerator:
        row = []
        power = 1
        for numerator in numerator_row:
            row.append(_untyped(sage.QQ)(numerator * power, basis.denominator))
            power *= scale
        rows.append(row)
    order = NumberFieldOrder(field, rows, False, False)
    order._discriminant_cache = runtime.normalize_integer(discriminant)
    return order


def _basis_from_order(order: Any, scale: int) -> OrderBasis:
    """Describe a public order in the integral equation generator basis."""
    if order._basis_rows == order.number_field().equation_order()._basis_rows:
        return _identity_basis(order.degree())
    rational_rows = []
    common_denominator = 1
    for source_row in order._basis_rows:
        row = []
        power = 1
        for value in source_row:
            coordinate = sage.QQ(value) / power
            row.append(coordinate)
            common_denominator = _exact_integer(
                _nf_lcm(common_denominator, coordinate._denominator)
            )
            power *= scale
        rational_rows.append(row)
    numerator = []
    for row in rational_rows:
        numerator.append(
            [
                _exact_integer(value._numerator)
                * (common_denominator // _exact_integer(value._denominator))
                for value in row
            ]
        )
    return OrderBasis(numerator, common_denominator, canonical=False)


def _integer_square_root(value: int) -> int:
    number = int(value)
    if number < 0:
        raise ValueError("an integer square root needs a nonnegative value")
    if number < 2:
        return number
    current = number
    following = (current + 1) // 2
    while following < current:
        current = following
        following = (current + number // current) // 2
    return current


def _index_from_discriminants(equation: int, order: int) -> int:
    if order == 0 or equation % order != 0:
        raise ArithmeticError(
            "order discriminant does not divide equation discriminant"
        )
    square = equation // order
    if square < 1:
        raise ArithmeticError(
            "order and equation discriminants have incompatible signs"
        )
    index = _integer_square_root(square)
    if index * index != square:
        raise ArithmeticError("order discriminant quotient is not an index square")
    return index


def _valuation(value: int, prime: int) -> int:
    remaining = abs(int(value))
    answer = 0
    while remaining and remaining % prime == 0:
        remaining //= prime
        answer += 1
    return answer


def _gcd(left: int, right: int) -> int:
    first = abs(int(left))
    second = abs(int(right))
    while second:
        first, second = second, first % second
    return first


def _identity_basis(degree: int) -> OrderBasis:
    return OrderBasis(
        [
            [1 if row == column else 0 for column in range(degree)]
            for row in range(degree)
        ],
        1,
    )


def _same_order(left: Any, right: Any) -> bool:
    return left._basis_rows == right._basis_rows


def _merge_orders(field: Any, left: Any, right: Any) -> Any:
    if left._basis_rows == field.equation_order()._basis_rows:
        return right
    if right._basis_rows == field.equation_order()._basis_rows:
        return left
    return NumberFieldOrder(
        field,
        list(left._basis_rows) + list(right._basis_rows),
        False,
        False,
    )


def _cache_discriminant_from_basis(
    order: Any,
    basis: OrderBasis,
    equation_discriminant: int,
) -> int:
    """Cache the discriminant forced by an exact equation-order index."""
    determinant = abs(basis.determinant_numerator)
    denominator_power = basis.denominator**basis.degree
    if determinant == 0 or denominator_power % determinant != 0:
        raise ArithmeticError("an overorder basis does not have an integral index")
    index = denominator_power // determinant
    square = index * index
    if equation_discriminant % square != 0:
        raise ArithmeticError("an overorder index square does not divide discriminant")
    discriminant = equation_discriminant // square
    order._discriminant_cache = runtime.normalize_integer(discriminant)
    return discriminant


def _forced_local_order(
    field: Any,
    coefficients: list[int],
    scale: int,
    equation_order: Any,
    equation_discriminant: int,
    prime: int,
    algorithm: str,
) -> tuple[Any, str, dict[str, Any]]:
    """Run one inspectable local algorithm with a certified Round-2 fallback."""
    local_valuation = _valuation(equation_discriminant, prime)
    if algorithm == "round2":
        return (
            _maximal_order_module().p_maximal_overorder_dynamic(equation_order, prime),
            "round2",
            {"selection": "forced"},
        )
    if algorithm == "round4":
        module = __import__("sagejs.number_fields.round4", fromlist=["round4"])
        result = module.modified_round4_local_order(
            equation_order,
            prime,
            "dynamic-round2",
            False,
        )
        return (
            result.order,
            result.certificate.algorithm,
            {
                "selection": "forced",
                "fallback_reason": result.certificate.fallback_reason,
                "local_index_valuation": result.certificate.local_index_valuation,
            },
        )
    component = DiscriminantComponent(
        prime,
        "proven-prime",
        evidence={"source": "certified public decomposition"},
    )
    if algorithm == "polygon":
        module = __import__(
            "sagejs.number_fields.local_polygons",
            fromlist=["local_polygons"],
        )
        result = module.analyze_local_component(
            coefficients,
            component,
            local_valuation,
            equation_discriminant,
        )
        if result.state == "complete" and result.basis is not None:
            discriminant = (
                equation_discriminant // (result.index * result.index)
                if result.discriminant is None
                else int(result.discriminant)
            )
            return (
                _order_from_basis(field, result.basis, scale, discriminant),
                "polygon",
                {"selection": "forced", "fallback": False},
            )
        return (
            _maximal_order_module().p_maximal_overorder_dynamic(equation_order, prime),
            "round2",
            {
                "selection": "forced-polygon",
                "fallback": True,
                "reason": result.message,
            },
        )
    if algorithm == "om-maxmin":
        module = __import__(
            "sagejs.number_fields.om_maxmin",
            fromlist=["om_maxmin"],
        )
        result = module.regular_local_basis(
            tuple(coefficients),
            prime,
            local_discriminant_valuation=local_valuation,
            differential_evidence=True,
        )
        if result.status == "complete" and result.order_basis is not None:
            discriminant = equation_discriminant // (
                result.local_result.index * result.local_result.index
            )
            return (
                _order_from_basis(field, result.order_basis, scale, discriminant),
                "om-maxmin",
                {
                    "selection": "forced",
                    "certificate_id": result.type_tree.certificate_id,
                },
            )
        return (
            _maximal_order_module().p_maximal_overorder_dynamic(equation_order, prime),
            "round2",
            {
                "selection": "forced-om-maxmin",
                "fallback": True,
                "reason": result.reason,
            },
        )
    raise ValueError("unknown forced local algorithm")


def _arbitrary_prime_local_order(
    field: Any,
    coefficients: list[int],
    scale: int,
    equation_discriminant: int,
    prime: int,
) -> tuple[Any, str, dict[str, Any]]:
    """Use exact integer polynomial arithmetic beyond FLINT word matrices."""
    component = DiscriminantComponent(
        prime,
        "proven-prime",
        evidence={"source": "resumable deterministic prime proof"},
    )
    polygon_module = __import__(
        "sagejs.number_fields.local_polygons",
        fromlist=["local_polygons"],
    )
    result = polygon_module.analyze_local_component(
        coefficients,
        component,
        _valuation(equation_discriminant, prime),
        equation_discriminant,
    )
    if result.state != "complete" or result.basis is None:
        raise ArithmeticError(
            "arbitrary-prime polygon fallback did not certify a complete local order"
        )
    discriminant = (
        equation_discriminant // (result.index * result.index)
        if result.discriminant is None
        else int(result.discriminant)
    )
    return (
        _order_from_basis(field, result.basis, scale, discriminant),
        "polygon",
        {
            "selection": "arbitrary-prime-exact-fallback",
            "word_prime_cap": _MAX_WORD_PRIME,
            "local_index": result.index,
        },
    )


class _CertificateAdapter:
    """Independent checker adapter closed over one candidate and its evidence."""

    def __init__(
        self,
        coefficients: list[int],
        scale: int,
        equation_discriminant: int,
        composite_results: dict[int, BuchmannLenstraResult],
        replay_primes: list[int],
    ) -> None:
        self.coefficients = list(coefficients)
        self.scale = scale
        self.equation_disc = equation_discriminant
        self.composite_results = composite_results
        self.replay_primes = list(replay_primes)
        self._candidate: Any = None

    def defining_polynomial(self, candidate: Any) -> list[int]:
        return list(self.coefficients)

    def basis_data(self, candidate: Any) -> tuple[list[list[int]], int]:
        basis = _basis_from_order(candidate, self.scale)
        return [list(row) for row in basis.numerator], basis.denominator

    def equation_discriminant(self, candidate: Any) -> int:
        return self.equation_disc

    def order_discriminant(self, candidate: Any) -> int:
        return _exact_integer(candidate.discriminant())

    def index(self, candidate: Any) -> int:
        return _index_from_discriminants(
            self.equation_disc,
            _exact_integer(candidate.discriminant()),
        )

    def verify_local_witness(
        self, witness: dict[str, Any], certificate: dict[str, Any]
    ) -> bool:
        candidate = certificate.get("_candidate")
        if candidate is None:
            # `certify_global_order` deliberately serializes the certificate.
            # The candidate is therefore supplied by the short-lived adapter.
            candidate = self._candidate
        if "component_value" in witness:
            component_value = abs(int(witness.get("component_value", 0)))
            result = self.composite_results.get(component_value)
            if result is None or result.state != "complete":
                return False
            proof = witness.get("proof", {})
            if int(proof.get("support", 0)) != result.component.value:
                return False
            if int(proof.get("index", 0)) != result.index:
                return False
            if (
                result.evidence.get("certificate")
                == "composite-dedekind-obstruction-one"
            ):
                if not check_buchmann_lenstra_result(self.coefficients, result):
                    return False
                final_index = _index_from_discriminants(
                    self.equation_disc,
                    _exact_integer(candidate.discriminant()),
                )
                return _gcd(final_index, result.component.value) == 1
            matching_components = [
                component
                for component in certificate.get("component_certificate", {}).get(
                    "components", []
                )
                if abs(int(component.get("value", 0))) == component_value
            ]
            return len(matching_components) == 1 and (
                check_discriminant_coprime_component_witness(
                    _exact_integer(candidate.discriminant()),
                    matching_components[0],
                    witness,
                )
            )

        prime = int(witness.get("prime", 0))
        if prime < 2:
            return False
        order_discriminant = _exact_integer(candidate.discriminant())
        if _valuation(order_discriminant, prime) <= 1:
            return True
        if prime in self.replay_primes:
            try:
                replay = native_order_from_polynomial(self.coefficients, [prime])
                if (
                    replay.complete
                    and replay.equation_discriminant == self.equation_disc
                    and _valuation(replay.order_discriminant, prime)
                    == _valuation(order_discriminant, prime)
                ):
                    return True
            except Exception:
                pass
        field = candidate.number_field()
        if candidate._basis_rows == field.equation_order()._basis_rows:
            return bool(
                _maximal_order_module().equation_order_is_p_maximal(field, prime)
            )
        checked = _maximal_order_module().p_maximal_overorder_dynamic(candidate, prime)
        return _same_order(checked, candidate)

    def bind_candidate(self, candidate: Any) -> None:
        self._candidate = candidate


def _proven_prime_components(
    decomposition: dict[str, Any], requested: list[int] | None
) -> list[int]:
    if requested is not None:
        return list(requested)
    answer = []
    for record in decomposition["components"]:
        if record["state"] == "proven-prime" and int(record["exponent"]) >= 2:
            answer.append(int(record["base"]))
    return answer


def _validate_requested_primes(primes: list[int]) -> None:
    for prime in primes:
        proof = decompose_discriminant(None, prime, small_prime_bound=1000)
        components = proof["components"]
        if (
            len(components) != 1
            or components[0]["state"] != "proven-prime"
            or int(components[0]["base"]) != prime
            or int(components[0]["exponent"]) != 1
        ):
            raise ValueError(str(prime) + " is not a certified prime")


def _normalize_requested_primes(value: Any) -> list[int] | None:
    if value is None:
        return None
    raw = list(value) if runtime.array.isArray(value) else [value]
    primes = sorted({_exact_integer(item) for item in raw})
    if any(prime < 2 for prime in primes):
        raise ValueError("local maximal-order primes must be at least two")
    _validate_requested_primes(primes)
    return primes


def _replace_composite_by_certified_primes(
    decomposition: dict[str, Any],
    record: dict[str, Any],
    trace: MaximalOrderTrace,
) -> None:
    """Factor only a lazy component after composite local work cannot finish.

    This deliberately is not the entry path: prefactorization and collective
    Buchmann--Lenstra work already had the opportunity to avoid factorization.
    It is the completeness fallback for the remaining supported exact input.
    """
    support = int(record["base"])
    outer_exponent = int(record["exponent"])
    token = trace.begin(
        "component-factorization-fallback",
        {"component_bits": support.bit_length()},
    )
    factors: list[tuple[int, int]] = []
    for prime_value, multiplicity_value in sage.factor(support):
        prime = _exact_integer(prime_value)
        multiplicity = int(multiplicity_value)
        factors.append((prime, multiplicity))
    if not factors:
        raise ArithmeticError("fallback component factorization was empty")

    # Install every known factor by splitting only the affected residual
    # branch.  Previously completed siblings and their evidence stay intact.
    for prime, _multiplicity in factors[:-1]:
        targets = [
            component
            for component in decomposition["components"]
            if int(component["value"]) % prime == 0 and int(component["value"]) != prime
        ]
        if len(targets) != 1:
            raise ArithmeticError("fallback factor has no unique residual branch")
        split = split_decomposition_component(
            decomposition,
            int(targets[0]["value"]),
            prime,
            reason="component-factorization-fallback",
        )
        updated = split["decomposition"]
        decomposition.clear()
        decomposition.update(updated)

    proof_budget = prime_proof_budget(
        trial_divisions=30_000,
        rho_steps=100_000,
        witness_trials=1_024,
        max_recursion_depth=64,
        rho_bit_limit=256,
    )
    for prime, multiplicity in factors:
        proof_state = None
        for _resume in range(32):
            proof_state = prove_prime_resumable(
                prime,
                proof_budget,
                proof_state,
            )
            if not check_prime_proof_state(proof_state):
                raise ArithmeticError("resumable prime proof checkpoint is invalid")
            if proof_state["status"] == "complete":
                break
            if proof_state["status"] == "composite":
                raise ArithmeticError("fallback factorization returned a composite")
        if proof_state is None or proof_state["status"] != "complete":
            raise ArithmeticError("fallback prime proof exhausted its resume bound")
        expected_exponent = multiplicity * outer_exponent
        matches = [
            component
            for component in decomposition["components"]
            if int(component["base"]) == prime
            and int(component["exponent"]) == expected_exponent
        ]
        if len(matches) != 1:
            raise ArithmeticError("fallback prime branch has the wrong multiplicity")
        updated = certify_decomposition_component(
            decomposition,
            int(matches[0]["value"]),
            proof_state["certificate"],
        )
        decomposition.clear()
        decomposition.update(updated)

    if not check_decomposition_certificate(decomposition, require_proven=False):
        raise ArithmeticError("fallback component refinement failed certification")
    trace.end(
        token,
        "complete",
        {"prime_count": len(factors), "proof_mode": "resumable-deterministic"},
    )


def compute_maximal_order(
    field: Any,
    *,
    requested_primes: Any = None,
    algorithm: str = "auto",
    trace_enabled: bool = False,
) -> Any:
    """Compute and certify a global or explicitly local maximal order."""
    if algorithm not in (
        "auto",
        "round2",
        "native",
        "polygon",
        "round4",
        "om-maxmin",
    ):
        raise ValueError(
            "algorithm must be 'auto', 'native', 'round2', 'polygon', "
            "'round4', or 'om-maxmin'"
        )
    requested = _normalize_requested_primes(requested_primes)
    trace = MaximalOrderTrace(trace_enabled)
    coefficients, scale = _integral_polynomial_data(field)
    equation_order = field.equation_order()
    equation_discriminant = _exact_integer(equation_order.discriminant())

    decomposition_token = trace.begin(
        "discriminant-decomposition",
        {"bits": abs(equation_discriminant).bit_length()},
    )
    decomposition = decompose_discriminant(
        coefficients,
        equation_discriminant,
        hints=requested,
    )
    trace.end(
        decomposition_token,
        details={"component_count": len(decomposition["components"])},
    )

    order = equation_order
    current_basis = _identity_basis(field.degree())
    composite_results: dict[int, BuchmannLenstraResult] = {}
    composite_witnesses: list[dict[str, Any]] = []

    if requested is None:
        for record in decomposition["components"]:
            if record["state"] == "proven-prime":
                continue
            component_value = int(record["value"])
            support = int(record["base"])
            component = DiscriminantComponent(
                support,
                str(record["state"]),
                evidence={"source_component": component_value},
            )
            token = trace.begin(
                "composite-local-order",
                {"component_bits": support.bit_length()},
            )
            result = buchmann_lenstra_overorder(
                coefficients,
                component,
                basis=current_basis,
                equation_discriminant=equation_discriminant,
            )
            trace.end(token, result.state, {"index": result.index})
            if result.state != "complete" or result.basis is None:
                _replace_composite_by_certified_primes(
                    decomposition,
                    record,
                    trace,
                )
                continue
            if result.discriminant is None:
                raise ArithmeticError(
                    "composite local-order result omitted discriminant"
                )
            current_basis = result.basis
            order = _order_from_basis(
                field,
                current_basis,
                scale,
                int(result.discriminant),
            )
            composite_results[component_value] = result
            composite_witnesses.append(
                make_composite_local_maximality_witness(
                    component_value,
                    "buchmann-lenstra",
                    {
                        "support": support,
                        "index": result.index,
                        "discriminant": result.discriminant,
                        "theorem": "order-discriminant-coprime-component",
                    },
                )
            )

    primes = _proven_prime_components(decomposition, requested)
    relevant_primes = [
        prime for prime in primes if _valuation(equation_discriminant, prime) >= 2
    ]
    used_native = False
    if len(relevant_primes) and algorithm in ("auto", "native"):
        token = trace.begin(
            "native-local-orders", {"prime_count": len(relevant_primes)}
        )
        try:
            native = native_order_from_polynomial(coefficients, relevant_primes)
            if native.complete:
                prime_order = _order_from_basis(
                    field,
                    native.basis,
                    scale,
                    native.order_discriminant,
                )
                if (
                    current_basis.canonical_key()
                    == _identity_basis(field.degree()).canonical_key()
                ):
                    order = prime_order
                else:
                    # Local overorders at coprime supports merge as the order
                    # generated by their two lattices.  Coprimality makes the
                    # sum a ring; the global certificate independently checks
                    # closure from the resulting canonical basis.
                    order = _merge_orders(field, order, prime_order)
                current_basis = _basis_from_order(order, scale)
                _cache_discriminant_from_basis(
                    order,
                    current_basis,
                    equation_discriminant,
                )
                used_native = True
                trace.end(
                    token,
                    "complete",
                    {
                        "index": native.index,
                        "merged_composite_lattice": len(composite_results) > 0,
                    },
                )
            else:
                trace.end(
                    token,
                    "fallback",
                    {"status": native.status, "fallback_prime": native.fallback_prime},
                )
        except Exception as error:
            trace.end(token, "unavailable", {"message": str(error)})
            if algorithm == "native":
                raise

    if not used_native and algorithm in ("auto", "native", "round2"):
        for prime in relevant_primes:
            if prime > _MAX_WORD_PRIME:
                token = trace.begin(
                    "arbitrary-prime-local-order",
                    {"prime": prime, "word_prime_cap": _MAX_WORD_PRIME},
                )
                local_order, used_algorithm, details = _arbitrary_prime_local_order(
                    field,
                    coefficients,
                    scale,
                    equation_discriminant,
                    prime,
                )
                order = _merge_orders(field, order, local_order)
                current_basis = _basis_from_order(order, scale)
                _cache_discriminant_from_basis(
                    order,
                    current_basis,
                    equation_discriminant,
                )
                details["used_algorithm"] = used_algorithm
                details["order_discriminant"] = _exact_integer(order.discriminant())
                trace.end(token, "complete", details)
                continue
            token = trace.begin("round2-local-order", {"prime": prime})
            order = _maximal_order_module().p_maximal_overorder_dynamic(order, prime)
            current_basis = _basis_from_order(order, scale)
            trace.end(
                token,
                "complete",
                {"order_discriminant": _exact_integer(order.discriminant())},
            )
    elif not used_native:
        for prime in relevant_primes:
            token = trace.begin(
                "selected-local-order",
                {"prime": prime, "requested_algorithm": algorithm},
            )
            local_order, used_algorithm, details = _forced_local_order(
                field,
                coefficients,
                scale,
                equation_order,
                equation_discriminant,
                prime,
                algorithm,
            )
            order = _merge_orders(field, order, local_order)
            current_basis = _basis_from_order(order, scale)
            _cache_discriminant_from_basis(
                order,
                current_basis,
                equation_discriminant,
            )
            details["used_algorithm"] = used_algorithm
            details["order_discriminant"] = _exact_integer(order.discriminant())
            trace.end(token, "complete", details)

    order_discriminant = _exact_integer(order.discriminant())
    index = _index_from_discriminants(equation_discriminant, order_discriminant)
    if requested is not None:
        order._maximal_order_certificate = runtime.undefined
        order._maximal_order_local_evidence = {
            "schema": "sagejs.number-fields/local-maximal-order-v1",
            "requested_primes": list(requested),
            "equation_discriminant": equation_discriminant,
            "order_discriminant": order_discriminant,
            "index": index,
            "certified": True,
        }
        order._maximal_order_trace = trace.to_dict()
        return order

    prime_witnesses = []
    for record in decomposition["components"]:
        if record["state"] != "proven-prime":
            continue
        prime = int(record["base"])
        if _valuation(equation_discriminant, prime) < 2:
            continue
        prime_witnesses.append(
            make_local_maximality_witness(
                prime,
                "round2",
                _valuation(equation_discriminant, prime),
                _valuation(order_discriminant, prime),
                _valuation(index, prime),
                {"check": "independent-round2-fixed-point"},
            )
        )

    certification_token = trace.begin("global-certification")
    adapter = _CertificateAdapter(
        coefficients,
        scale,
        equation_discriminant,
        composite_results,
        relevant_primes,
    )
    adapter.bind_candidate(order)
    certificate = certify_global_order(
        adapter,
        order,
        decomposition,
        composite_witnesses + prime_witnesses,
    )
    trace.end(
        certification_token,
        "certified",
        {"index": index, "order_discriminant": order_discriminant},
    )
    order._maximal_order_certificate = certificate
    order._maximal_order_local_evidence = runtime.undefined
    order._maximal_order_trace = trace.to_dict()
    return order


__all__ = ["compute_maximal_order"]
