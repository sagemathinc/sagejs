"""Certified lazy decomposition of number-field discriminant components.

This module is the ordinary-Python reference layer for maximal-order factor
discovery.  In particular, it never promotes a probable prime or an opaque
coprime component to a prime.  Modular polynomial arithmetic returns a factor
of the modulus whenever an attempted inversion encounters a zero divisor.

The prefactorization strategy follows the implementation in Hecke's
BSD-2-Clause `MaxOrd/MaxOrd.jl`: perfect-power reduction, polynomial gcd over
composite residue rings, coprime-base refinement, and branch-local restarts.
The representation and certificate format here are Sage.js-specific.
"""

from __future__ import annotations

from typing import Any


PROVEN_PRIME = "proven-prime"
PROBABLE_PRIME = "probable-prime-awaiting-proof"
COMPOSITE = "composite"
UNRESOLVED = "unresolved-coprime-component"


class CertificationError(ArithmeticError):
    """Raised when bounded work cannot produce the requested proof."""


def integer_gcd(left: int, right: int) -> int:
    """Return the nonnegative greatest common divisor."""
    a = abs(int(left))
    b = abs(int(right))
    while b:
        a, b = b, a % b
    return a


def integer_lcm(left: int, right: int) -> int:
    """Return the nonnegative least common multiple."""
    if left == 0 or right == 0:
        return 0
    return abs((int(left) // integer_gcd(left, right)) * int(right))


def _modular_inverse(value: int, modulus: int) -> int:
    """Return an inverse using exact Euclid arithmetic on every host."""
    old_remainder = int(value) % int(modulus)
    remainder = int(modulus)
    old_coefficient = 1
    coefficient = 0
    while remainder:
        quotient = old_remainder // remainder
        old_remainder, remainder = remainder, old_remainder - quotient * remainder
        old_coefficient, coefficient = (
            coefficient,
            old_coefficient - quotient * coefficient,
        )
    if old_remainder != 1:
        raise ValueError("base is not invertible for the given modulus")
    return old_coefficient % int(modulus)


def _integer_nth_root(value: int, exponent: int) -> int:
    """Return `floor(value^(1/exponent))` using integer arithmetic only."""
    if value < 0 or exponent < 1:
        raise ValueError("an integer root needs a nonnegative value and exponent")
    if value < 2 or exponent == 1:
        return value
    low = 1
    high = 1 << ((value.bit_length() + exponent - 1) // exponent)
    while low <= high:
        middle = (low + high) // 2
        power = middle**exponent
        if power == value:
            return middle
        if power < value:
            low = middle + 1
        else:
            high = middle - 1
    return high


def perfect_power_data(value: int) -> tuple[int, int]:
    """Return `(base, exponent)` with maximal exponent and exact witness.

    Non-powers return `(value, 1)`.  For negative inputs only odd exponents
    are considered.  The maximal-exponent convention makes the result stable
    across factor-discovery order.
    """
    number = int(value)
    if number in (-1, 0, 1):
        return number, 1
    magnitude = abs(number)
    maximum = magnitude.bit_length()
    for exponent in range(maximum, 1, -1):
        if number < 0 and exponent % 2 == 0:
            continue
        root = _integer_nth_root(magnitude, exponent)
        if root**exponent == magnitude:
            if number < 0:
                root = -root
            return root, exponent
    return number, 1


def _small_primes(bound: int) -> list[int]:
    """Return the primes at most `bound` by a compact deterministic sieve."""
    if bound < 2:
        return []
    composite = [False for _index in range(bound + 1)]
    answer = []
    for candidate in range(2, bound + 1):
        if composite[candidate]:
            continue
        answer.append(candidate)
        if candidate * candidate <= bound:
            multiple = candidate * candidate
            while multiple <= bound:
                composite[multiple] = True
                multiple += candidate
    return answer


_MR64_BASES = [2, 325, 9375, 28178, 450775, 9780504, 1795265022]
_PROBABLE_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]


def _miller_rabin_witness(number: int, base: int) -> bool:
    """Return whether `base` proves `number` composite."""
    # A theorem base may be larger than n (and occasionally a multiple of n).
    # The zero residue is uninformative, not a compositeness witness.
    if base % number == 0:
        return False
    odd = number - 1
    shifts = 0
    while odd % 2 == 0:
        odd //= 2
        shifts += 1
    value = pow(base % number, odd, number)
    if value == 1 or value == number - 1:
        return False
    for _index in range(shifts - 1):
        value = value * value % number
        if value == number - 1:
            return False
    return True


def primality_status(number: int) -> tuple[str, dict[str, Any]]:
    """Classify an integer without making an unproved primality claim.

    The seven-base Miller--Rabin theorem is deterministic below `2^64`.
    Larger survivors are deliberately only probable primes until a recursive
    Pocklington certificate is constructed.
    """
    value = int(number)
    if value < 2:
        return COMPOSITE, {"kind": "less-than-two", "value": value}
    for prime in _small_primes(47):
        if value == prime:
            return PROVEN_PRIME, {"kind": "trial-prime", "prime": value}
        if value % prime == 0:
            return COMPOSITE, {"kind": "factor", "factor": prime}
    bases = _MR64_BASES if value < 1 << 64 else _PROBABLE_BASES
    for base in bases:
        if _miller_rabin_witness(value, base):
            return COMPOSITE, {"kind": "miller-rabin-witness", "base": base}
    if value < 1 << 64:
        return PROVEN_PRIME, {
            "kind": "deterministic-miller-rabin-64",
            "prime": value,
            "bases": list(_MR64_BASES),
        }
    return PROBABLE_PRIME, {
        "kind": "strong-probable-prime",
        "value": value,
        "bases": list(_PROBABLE_BASES),
    }


def _pollard_rho_factor(number: int, work_limit: int) -> int | None:
    """Return a deterministic nontrivial factor within a bounded budget."""
    if number % 2 == 0:
        return 2
    steps = 0
    constant = 1
    while constant <= 32 and steps < work_limit:
        slow = 2 + constant
        fast = slow
        divisor = 1
        while divisor == 1 and steps < work_limit:
            slow = (slow * slow + constant) % number
            fast = (fast * fast + constant) % number
            fast = (fast * fast + constant) % number
            divisor = integer_gcd(slow - fast, number)
            steps += 1
        if divisor != 1 and divisor != number:
            return divisor
        constant += 1
    return None


def bounded_factor(
    number: int, trial_bound: int = 1000, rho_steps: int = 20000
) -> int | None:
    """Find one factor without requesting a complete integer factorization."""
    value = abs(int(number))
    if value < 4:
        return None
    for prime in _small_primes(max(2, int(trial_bound))):
        if value % prime == 0:
            return prime if value != prime else None
    base, exponent = perfect_power_data(value)
    if exponent > 1 and abs(base) not in (1, value):
        return abs(base)
    # Rho is useful for modest accidental composites, but spending its whole
    # budget on the enormous residual component of a bad primitive generator
    # delays the local Buchmann--Lenstra branch without useful evidence.
    if value.bit_length() > 192:
        return None
    return _pollard_rho_factor(value, max(0, int(rho_steps)))


def _factor_for_pocklington(
    number: int, work_limit: int
) -> tuple[list[tuple[int, int]], int]:
    """Factor as much as needed by recursive bounded deterministic work."""
    pending = [int(number)]
    factors = []
    remaining = 1
    budget = max(0, int(work_limit))
    while pending:
        value = pending.pop()
        status, _evidence = primality_status(value)
        if status == PROVEN_PRIME:
            found = False
            for index in range(len(factors)):
                if factors[index][0] == value:
                    factors[index] = (value, factors[index][1] + 1)
                    found = True
                    break
            if not found:
                factors.append((value, 1))
            continue
        divisor = bounded_factor(value, 1000, min(20000, budget))
        budget -= min(20000, budget)
        if divisor is None or divisor in (1, value):
            remaining *= value
            continue
        pending.append(divisor)
        pending.append(value // divisor)
    factors.sort()
    return factors, remaining


def prove_prime(number: int, work_limit: int = 200000) -> dict[str, Any] | None:
    """Return a deterministic recursive prime certificate, or `None`.

    Values below `2^64` use the proved deterministic Miller--Rabin base set.
    Larger values use Pocklington's theorem.  Failure to factor enough of
    `n-1` is an ordinary bounded-resource outcome, never a primality claim.
    """
    value = int(number)
    status, evidence = primality_status(value)
    if status == COMPOSITE:
        return None
    if status == PROVEN_PRIME:
        return evidence
    factors, _remaining = _factor_for_pocklington(value - 1, work_limit)
    certified = []
    product = 1
    for prime, exponent in factors:
        certificate = prove_prime(prime, max(1000, work_limit // 4))
        if certificate is None:
            continue
        certified.append(
            {"prime": prime, "exponent": exponent, "certificate": certificate}
        )
        product *= prime**exponent
    if product * product <= value:
        return None
    witnesses = []
    for entry in certified:
        prime = entry["prime"]
        witness = 2
        while witness < 128:
            if (
                pow(witness, value - 1, value) == 1
                and integer_gcd(
                    pow(witness, (value - 1) // prime, value) - 1,
                    value,
                )
                == 1
            ):
                break
            witness += 1
        if witness == 128:
            return None
        witnesses.append({"prime": prime, "base": witness})
    return {
        "kind": "pocklington",
        "prime": value,
        "factored_part": product,
        "factors": certified,
        "witnesses": witnesses,
    }


def check_prime_certificate(certificate: dict[str, Any]) -> bool:
    """Independently check a certificate emitted by `prove_prime`."""
    kind = certificate.get("kind")
    if kind == "trial-prime":
        prime = int(certificate.get("prime", 0))
        return prime in _small_primes(47)
    if kind == "deterministic-miller-rabin-64":
        prime = int(certificate.get("prime", 0))
        if prime < 2 or prime >= 1 << 64:
            return False
        for divisor in _small_primes(47):
            if prime != divisor and prime % divisor == 0:
                return False
        for base in _MR64_BASES:
            if _miller_rabin_witness(prime, base):
                return False
        return True
    if kind != "pocklington":
        return False
    prime = int(certificate.get("prime", 0))
    if prime < 3 or prime % 2 == 0:
        return False
    factors = certificate.get("factors", [])
    witnesses = certificate.get("witnesses", [])
    product = 1
    seen = {}
    for entry in factors:
        factor = int(entry.get("prime", 0))
        exponent = int(entry.get("exponent", 0))
        if exponent < 1 or not check_prime_certificate(entry.get("certificate", {})):
            return False
        if int(entry["certificate"].get("prime", 0)) != factor:
            return False
        product *= factor**exponent
        seen[factor] = True
    if product != int(certificate.get("factored_part", 0)):
        return False
    if (prime - 1) % product != 0 or product * product <= prime:
        return False
    for witness_entry in witnesses:
        factor = int(witness_entry.get("prime", 0))
        base = int(witness_entry.get("base", 0))
        if factor not in seen:
            return False
        if pow(base, prime - 1, prime) != 1:
            return False
        if integer_gcd(pow(base, (prime - 1) // factor, prime) - 1, prime) != 1:
            return False
        del seen[factor]
    return len(seen) == 0


def _strip_polynomial(coefficients: list[int], modulus: int) -> list[int]:
    answer = [int(value) % modulus for value in coefficients]
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    if not answer:
        return [0]
    return answer


def polynomial_derivative(coefficients: list[int]) -> list[int]:
    """Return the formal derivative of low-to-high integer coefficients."""
    if len(coefficients) < 2:
        return [0]
    return [index * int(coefficients[index]) for index in range(1, len(coefficients))]


def _polynomial_coefficients(polynomial: Any) -> list[int]:
    """Normalize a coefficient list or an ordinary Sage-style polynomial."""
    if isinstance(polynomial, list) or isinstance(polynomial, tuple):
        values = list(polynomial)
    else:
        coefficient_list = getattr(polynomial, "list", None)
        if coefficient_list is None:
            raise TypeError(
                "a defining polynomial must provide low-to-high coefficients"
            )
        values = list(coefficient_list())
    if len(values) < 2:
        raise ValueError("a defining polynomial must have positive degree")
    return [int(value) for value in values]


def polynomial_gcd_mod_composite(
    left: list[int], right: list[int], modulus: int
) -> dict[str, Any]:
    """Compute a polynomial gcd or expose a zero divisor of `modulus`.

    The return value has status `gcd` with a monic coefficient list, or status
    `split` with a proper divisor.  No field algorithm is continued after a
    failed inversion.
    """
    q = abs(int(modulus))
    if q < 2:
        raise ValueError("the polynomial modulus must be at least two")
    old = _strip_polynomial(left, q)
    current = _strip_polynomial(right, q)
    while current != [0]:
        divisor = integer_gcd(current[-1], q)
        if divisor != 1:
            if divisor != q:
                return {
                    "status": "split",
                    "divisor": divisor,
                    "reason": "nonunit-leading-coefficient",
                }
            content = 0
            for coefficient in current:
                content = integer_gcd(content, coefficient)
            split = integer_gcd(content, q)
            if split not in (1, q):
                return {"status": "split", "divisor": split, "reason": "content"}
            return {
                "status": "unresolved",
                "reason": "zero-leading-coefficient",
                "polynomial": current,
            }
        inverse = _modular_inverse(current[-1], q)
        remainder = list(old)
        while remainder != [0] and len(remainder) >= len(current):
            shift = len(remainder) - len(current)
            scale = remainder[-1] * inverse % q
            for index in range(len(current)):
                target = index + shift
                remainder[target] = (remainder[target] - scale * current[index]) % q
            remainder = _strip_polynomial(remainder, q)
        old, current = current, remainder
    divisor = integer_gcd(old[-1], q)
    if divisor != 1:
        if divisor != q:
            return {
                "status": "split",
                "divisor": divisor,
                "reason": "gcd-normalization",
            }
        return {"status": "unresolved", "reason": "nonmonic-gcd", "polynomial": old}
    inverse = _modular_inverse(old[-1], q)
    gcd_polynomial = [(coefficient * inverse) % q for coefficient in old]
    return {"status": "gcd", "polynomial": _strip_polynomial(gcd_polynomial, q)}


def _support_split(number: int, divisor: int) -> tuple[int, int]:
    """Split `number` into the part supported on `divisor` and its complement."""
    remaining = abs(int(number))
    probe = abs(int(divisor))
    supported = 1
    common = integer_gcd(remaining, probe)
    while common != 1:
        supported *= common
        remaining //= common
        common = integer_gcd(remaining, probe)
    return supported, remaining


def coprime_decomposition(values: list[int]) -> list[int]:
    """Return deterministic pairwise-coprime support components.

    Multiplicities are intentionally discarded: the result is a coprime base
    for factor discovery, not a factorization identity.
    """
    components = []
    for raw in values:
        value = abs(int(raw))
        base, _exponent = perfect_power_data(value)
        value = abs(base)
        if value > 1:
            components.append(value)
    changed = True
    while changed:
        changed = False
        for left_index in range(len(components)):
            for right_index in range(left_index + 1, len(components)):
                left = components[left_index]
                right = components[right_index]
                common = integer_gcd(left, right)
                if common == 1:
                    continue
                replacements = [common]
                left_rest = left // common
                right_rest = right // common
                if left_rest > 1:
                    replacements.append(left_rest)
                if right_rest > 1:
                    replacements.append(right_rest)
                components = (
                    components[:left_index]
                    + components[left_index + 1 : right_index]
                    + components[right_index + 1 :]
                    + replacements
                )
                changed = True
                break
            if changed:
                break
    unique = []
    for value in sorted(components):
        if value not in unique:
            unique.append(value)
    return unique


class DiscriminantComponent:
    """One exact coprime factor of a discriminant under lazy refinement."""

    def __init__(
        self,
        value: int,
        state: str = UNRESOLVED,
        base: int | None = None,
        exponent: int = 1,
        evidence: dict[str, Any] | None = None,
    ):
        self.value = abs(int(value))
        self.state = state
        self.base = abs(int(base if base is not None else value))
        self.exponent = int(exponent)
        self.evidence = {} if evidence is None else evidence

    def to_dict(self) -> dict[str, Any]:
        """Return a stable, host-neutral certificate record."""
        return {
            "value": self.value,
            "state": self.state,
            "base": self.base,
            "exponent": self.exponent,
            "evidence": self.evidence,
        }


def _classify_component(
    value: int, prove_large: bool, proof_work: int
) -> DiscriminantComponent:
    base, exponent = perfect_power_data(value)
    base = abs(base)
    state, evidence = primality_status(base)
    if state == PROBABLE_PRIME and prove_large:
        proof = prove_prime(base, proof_work)
        if proof is not None:
            state = PROVEN_PRIME
            evidence = proof
    return DiscriminantComponent(value, state, base, exponent, evidence)


def split_component(
    component: DiscriminantComponent, divisor: int
) -> list[DiscriminantComponent]:
    """Split only the affected branch using a witnessed modulus divisor."""
    factor = integer_gcd(component.value, int(divisor))
    if factor in (1, component.value):
        return [component]
    supported, complement = _support_split(component.value, factor)
    if complement == 1:
        return [component]
    return [
        _classify_component(supported, False, 0),
        _classify_component(complement, False, 0),
    ]


def prefactorization_hints(
    polynomial: list[int], components: list[DiscriminantComponent]
) -> tuple[list[DiscriminantComponent], list[dict[str, Any]]]:
    """Refine components by Hecke-style gcds modulo composite integers."""
    derivative = polynomial_derivative(polynomial)
    pending = list(components)
    final: list[DiscriminantComponent] = []
    events: list[dict[str, Any]] = []
    while pending:
        component = pending.pop(0)
        if component.state == PROVEN_PRIME:
            final.append(component)
            continue
        result = polynomial_gcd_mod_composite(polynomial, derivative, component.base)
        if result["status"] == "split":
            divisor = int(result["divisor"])
            branches = split_component(component, divisor)
            if len(branches) > 1:
                events.append(
                    {
                        "kind": "modular-inversion-split",
                        "parent": component.value,
                        "divisor": divisor,
                        "reason": result["reason"],
                        "children": [branch.value for branch in branches],
                    }
                )
                pending = branches + pending
                continue
        final.append(component)
    final.sort(key=lambda item: item.value)
    return final, events


def decompose_discriminant(
    polynomial: Any,
    discriminant: int,
    *,
    hints: list[int] | None = None,
    trace: Any = None,
    small_prime_bound: int = 1000,
    rho_steps: int = 20000,
    prove_large_primes: bool = True,
    proof_work: int = 200000,
) -> dict[str, Any]:
    """Build a bounded, certified decomposition without full factorization.

    The component values always multiply exactly to `abs(discriminant)` and
    are pairwise coprime.  A caller that requires a global proof must reject a
    certificate containing any state other than `proven-prime`.
    """
    original = abs(int(discriminant))
    if original == 0:
        raise ValueError("a zero discriminant does not define a number field")
    remaining = original
    components = []
    events = []
    for prime in _small_primes(max(2, int(small_prime_bound))):
        if remaining % prime != 0:
            continue
        power = 1
        exponent = 0
        while remaining % prime == 0:
            remaining //= prime
            power *= prime
            exponent += 1
        proof = prove_prime(prime, 0)
        components.append(
            DiscriminantComponent(power, PROVEN_PRIME, prime, exponent, proof)
        )
        events.append({"kind": "small-prime", "prime": prime, "exponent": exponent})
    if remaining > 1:
        components.append(
            _classify_component(remaining, prove_large_primes, proof_work)
        )

    supplied_hints = [] if hints is None else list(hints)
    for hint in supplied_hints:
        next_components = []
        for component in components:
            branches = split_component(component, int(hint))
            if len(branches) > 1:
                events.append(
                    {
                        "kind": "factor-hint-split",
                        "parent": component.value,
                        "divisor": integer_gcd(component.value, int(hint)),
                        "children": [branch.value for branch in branches],
                    }
                )
            next_components.extend(branches)
        components = next_components

    if polynomial is not None:
        components, polynomial_events = prefactorization_hints(
            _polynomial_coefficients(polynomial), components
        )
        events.extend(polynomial_events)

    changed = True
    while changed:
        changed = False
        next_components = []
        for component in components:
            if component.state != COMPOSITE:
                next_components.append(component)
                continue
            factor = bounded_factor(component.base, small_prime_bound, rho_steps)
            if factor is None:
                next_components.append(component)
                continue
            branches = split_component(component, factor)
            if len(branches) == 1:
                next_components.append(component)
                continue
            events.append(
                {
                    "kind": "bounded-composite-split",
                    "parent": component.value,
                    "divisor": factor,
                    "children": [branch.value for branch in branches],
                }
            )
            next_components.extend(branches)
            changed = True
        components = next_components

    components.sort(key=lambda item: item.value)
    certificate = {
        "version": 1,
        "original": original,
        "components": [component.to_dict() for component in components],
        "events": events,
        "certified": all(component.state == PROVEN_PRIME for component in components),
    }
    if not check_decomposition_certificate(certificate, require_proven=False):
        raise ArithmeticError("internal discriminant decomposition certificate failed")
    if trace is not None:
        for event in events:
            _emit_trace(trace, "discriminant-decomposition", event["kind"], event)
    return certificate


def check_decomposition_certificate(
    certificate: dict[str, Any], require_proven: bool = True
) -> bool:
    """Independently verify exact coverage, coprimality, powers, and proofs."""
    if int(certificate.get("version", 0)) != 1:
        return False
    original = int(certificate.get("original", 0))
    if original < 1:
        return False
    product = 1
    seen_values = []
    all_proven = True
    for entry in certificate.get("components", []):
        value = int(entry.get("value", 0))
        base = int(entry.get("base", 0))
        exponent = int(entry.get("exponent", 0))
        state = entry.get("state")
        if value < 2 or base < 2 or exponent < 1 or base**exponent != value:
            return False
        for previous in seen_values:
            if integer_gcd(previous, value) != 1:
                return False
        seen_values.append(value)
        product *= value
        if state == PROVEN_PRIME:
            proof = entry.get("evidence", {})
            if int(proof.get("prime", 0)) != base or not check_prime_certificate(proof):
                return False
        elif state == PROBABLE_PRIME:
            status, _evidence = primality_status(base)
            if status not in (PROBABLE_PRIME, PROVEN_PRIME):
                return False
            all_proven = False
        elif state == COMPOSITE:
            status, _evidence = primality_status(base)
            if status != COMPOSITE:
                return False
            all_proven = False
        elif state == UNRESOLVED:
            all_proven = False
        else:
            return False
    if product != original:
        return False
    if bool(certificate.get("certified", False)) != all_proven:
        return False
    return all_proven or not require_proven


def require_certified_decomposition(certificate: dict[str, Any]) -> None:
    """Fail closed unless every component has an independently checked proof."""
    if not check_decomposition_certificate(certificate, require_proven=True):
        unresolved = []
        for component in certificate.get("components", []):
            if component.get("state") != PROVEN_PRIME:
                unresolved.append(str(component.get("value")))
        detail = ", ".join(unresolved) if unresolved else "invalid certificate"
        raise CertificationError("discriminant components are not certified: " + detail)


def _adapter_operation(adapter: Any, name: str) -> Any:
    if isinstance(adapter, dict):
        operation = adapter.get(name)
    else:
        operation = getattr(adapter, name, None)
    if operation is None:
        raise TypeError("the Buchmann--Lenstra adapter does not provide " + name)
    return operation


def _emit_trace(trace: Any, stage: str, state: str, details: dict[str, Any]) -> None:
    emitter = getattr(trace, "emit", None)
    if emitter is not None:
        emitter(stage, state, details)
    else:
        trace({"stage": stage, "state": state, "details": details})


def _bl_event(
    events: list[dict[str, Any]], trace: Any, stage: str, details: dict[str, Any]
) -> None:
    event = {"sequence": len(events), "stage": stage, "details": details}
    events.append(event)
    if trace is not None:
        _emit_trace(trace, "buchmann-lenstra", stage, event)


def _bl_split_result(
    order: Any,
    component: DiscriminantComponent,
    divisor: int,
    stage: str,
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    factor = integer_gcd(component.value, divisor)
    branches = split_component(component, factor)
    if len(branches) == 1:
        return {
            "state": "certification-error",
            "order": order,
            "component": component.to_dict(),
            "events": events,
            "message": stage + " returned a non-splitting divisor",
        }
    return {
        "state": "split",
        "order": order,
        "component": component.to_dict(),
        "split": {
            "source": component.value,
            "divisor": factor,
            "children": [branch.to_dict() for branch in branches],
            "stage": stage,
        },
        "events": events,
    }


def buchmann_lenstra_cycle(
    order: Any,
    component: DiscriminantComponent,
    adapter: Any,
    *,
    trace: Any = None,
    max_steps: int = 128,
) -> dict[str, Any]:
    """Run the readable Buchmann--Lenstra unresolved-component cycle.

    This is an executable algorithm, not certificate plumbing.  Its adapter
    contains only the order/ideal primitives that depend on Sage.js's current
    representation:

    - `degree(order)` and `discriminant(order)`;
    - `q_radical(order, q) -> {ideal, divisor, trivial}`;
    - `multiplier_ring(order, ideal)` and `orders_equal(left, right)`;
    - `colon_freeness_obstruction(order, ideal, q)`;
    - `ideal_multiply`, `ideal_add_integer`, and `ideals_equal`;
    - `relation_freeness_obstruction(left, right, q)`.

    Every obstruction is gcd-checked before it can split a branch.  A stable
    cycle that neither certifies nor splits returns `resource-error`; it never
    treats `q` as prime.  This follows Hecke's BSD-2-Clause `_cycleBL` and
    `_cycleBL2` stages while keeping host objects outside certificate records.
    """
    if not isinstance(component, DiscriminantComponent):
        raise TypeError("the Buchmann--Lenstra component has the wrong type")
    if component.state == PROVEN_PRIME:
        return {
            "state": "not-applicable",
            "order": order,
            "component": component.to_dict(),
            "events": [],
            "message": "a proven-prime component belongs in a prime-local solver",
        }
    limit = int(max_steps)
    if limit < 1:
        raise ValueError("the Buchmann--Lenstra step bound must be positive")
    degree = int(_adapter_operation(adapter, "degree")(order))
    if degree < 1:
        raise ValueError("an order must have positive degree")
    discriminant = _adapter_operation(adapter, "discriminant")
    q_radical = _adapter_operation(adapter, "q_radical")
    multiplier_ring = _adapter_operation(adapter, "multiplier_ring")
    orders_equal = _adapter_operation(adapter, "orders_equal")
    colon_obstruction = _adapter_operation(adapter, "colon_freeness_obstruction")
    ideal_multiply = _adapter_operation(adapter, "ideal_multiply")
    ideal_add_integer = _adapter_operation(adapter, "ideal_add_integer")
    ideals_equal = _adapter_operation(adapter, "ideals_equal")
    relation_obstruction = _adapter_operation(adapter, "relation_freeness_obstruction")

    q = component.base
    current = order
    events: list[dict[str, Any]] = []
    steps = 0
    while steps < limit:
        q = integer_gcd(q, abs(int(discriminant(current))))
        _bl_event(events, trace, "component-reduction", {"q": q})
        if q == 1:
            return {
                "state": "complete",
                "order": current,
                "component": component.to_dict(),
                "events": events,
                "evidence": {"kind": "buchmann-lenstra", "component_removed": True},
            }

        radical = q_radical(current, q)
        steps += 1
        divisor = integer_gcd(q, int(radical.get("divisor", 1)))
        _bl_event(
            events,
            trace,
            "q-radical",
            {
                "q": q,
                "divisor": divisor,
                "trivial": bool(radical.get("trivial", False)),
            },
        )
        if divisor not in (1, q):
            return _bl_split_result(current, component, divisor, "q-radical", events)
        if bool(radical.get("trivial", False)):
            return {
                "state": "complete",
                "order": current,
                "component": component.to_dict(),
                "events": events,
                "evidence": {"kind": "buchmann-lenstra", "trivial_radical": True},
            }
        ideal = radical.get("ideal")
        if ideal is None:
            return {
                "state": "certification-error",
                "order": current,
                "component": component.to_dict(),
                "events": events,
                "message": "q-radical returned no ideal",
            }

        enlarged = multiplier_ring(current, ideal)
        _bl_event(
            events,
            trace,
            "multiplier-ring",
            {"enlarged": not orders_equal(enlarged, current)},
        )
        if not orders_equal(enlarged, current):
            current = enlarged
            continue

        divisor = integer_gcd(q, int(colon_obstruction(current, ideal, q)))
        _bl_event(events, trace, "colon-freeness", {"divisor": divisor})
        if divisor not in (1, q):
            return _bl_split_result(
                current, component, divisor, "colon-freeness", events
            )

        ideal_one = ideal
        ideal_two = ideal_multiply(ideal, ideal)
        ideal_three = ideal_multiply(ideal_two, ideal)
        height = 2
        while height <= degree and steps < limit:
            left = ideal_multiply(
                ideal_add_integer(ideal_one, q),
                ideal_add_integer(ideal_three, q),
            )
            middle = ideal_add_integer(ideal_two, q)
            right = ideal_multiply(middle, middle)
            steps += 1
            equal = bool(ideals_equal(left, right))
            _bl_event(
                events,
                trace,
                "power-freeness",
                {"height": height, "equal": equal},
            )
            if not equal:
                divisor = integer_gcd(q, int(relation_obstruction(left, right, q)))
                if divisor not in (1, q):
                    return _bl_split_result(
                        current,
                        component,
                        divisor,
                        "power-freeness",
                        events,
                    )
                root = _integer_nth_root(q, height)
                return {
                    "state": "resource-error",
                    "order": current,
                    "component": component.to_dict(),
                    "events": events,
                    "message": (
                        "stable Buchmann--Lenstra component needs prime-power refinement"
                        if root**height == q
                        else "stable Buchmann--Lenstra component needs further factor discovery"
                    ),
                    "perfect_power": (
                        {"base": root, "exponent": height}
                        if root**height == q
                        else None
                    ),
                }
            height += 1
            ideal_one, ideal_two, ideal_three = (
                ideal_two,
                ideal_three,
                ideal_multiply(ideal_three, ideal),
            )
        return {
            "state": "resource-error",
            "order": current,
            "component": component.to_dict(),
            "events": events,
            "message": "Buchmann--Lenstra freeness cycle exhausted its certified bound",
        }
    return {
        "state": "resource-error",
        "order": current,
        "component": component.to_dict(),
        "events": events,
        "message": "Buchmann--Lenstra multiplier cycle exhausted its certified bound",
    }


__all__ = [
    "COMPOSITE",
    "PROBABLE_PRIME",
    "PROVEN_PRIME",
    "UNRESOLVED",
    "CertificationError",
    "DiscriminantComponent",
    "bounded_factor",
    "buchmann_lenstra_cycle",
    "check_decomposition_certificate",
    "check_prime_certificate",
    "coprime_decomposition",
    "decompose_discriminant",
    "integer_gcd",
    "integer_lcm",
    "perfect_power_data",
    "polynomial_derivative",
    "polynomial_gcd_mod_composite",
    "prefactorization_hints",
    "primality_status",
    "prove_prime",
    "require_certified_decomposition",
    "split_component",
]
