"""Certified deficient-place tests for hyperelliptic curves over `QQ`.

A genus-`g` curve over a local field is deficient when it has no rational
divisor of degree `g - 1`.  This module keeps that definition separate from
local solubility and from numerical BSD recognition.  A successful local
test returns either a divisor witness or a replayable obstruction
certificate; an unsupported test has `decision=None`.

The exact finite-place envelope is deliberately bounded:

- odd-genus hyperelliptic curves are never deficient, since a fibre of the
  hyperelliptic map is a rational divisor of degree two;
- a rational point at infinity or a nonsingular residue point proves
  nondeficiency;
- at odd primes, Lemmas 15 and 16 of Poonen--Stoll certify a broad integral
  genus-2 envelope;
- certified good reduction and the ordinary nodal or split-cluster
  semistable certificates produced by `bad_reduction` are consumed without
  weakening their hypotheses;
- bad reduction at 2 and inconclusive almost-good cases remain unsupported
  unless an actual divisor witness is found.

The global diagnostic implements Corollary 12 of Poonen--Stoll only for the
recorded canonical principal polarization of a Jacobian.  It reports a
conditional square/twice-square theorem without changing, rounding, or
recognizing any numerical BSD quotient.

References:

- B. Poonen and M. Stoll, *The Cassels--Tate Pairing on Polarized Abelian
  Varieties*, Annals of Mathematics 150 (1999), Theorem 11, Corollary 12,
  and Lemmas 15--16.
- T. Dokchitser, V. Dokchitser, C. Maistret, and A. Morgan, *Arithmetic of
  hyperelliptic curves over local fields*, Math. Ann. 385 (2023),
  Lemma 12.3 and Theorem 12.4.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping


POONEN_STOLL_REFERENCE = (
    "Poonen--Stoll, The Cassels--Tate Pairing on Polarized Abelian Varieties (1999)"
)
CLUSTER_REFERENCE = (
    "Dokchitser--Dokchitser--Maistret--Morgan, Arithmetic of "
    "hyperelliptic curves over local fields, Theorem 12.4"
)


class DeficiencyUnsupportedError(NotImplementedError):
    """A boolean deficiency answer was requested outside the exact envelope."""

    def __init__(self, result: DeficiencyResult) -> None:
        self.result = result
        super().__init__(
            "deficiency is not certified at "
            + str(result.place)
            + ": "
            + str(result.reason)
        )


class DeficiencyResult:
    """One exact local decision, witness, obstruction, or unsupported state."""

    def __init__(
        self,
        place: Any,
        genus: int,
        decision: bool | None,
        *,
        theorem: str,
        witness: Mapping[str, Any] | None = None,
        obstruction: Mapping[str, Any] | None = None,
        certificate: Mapping[str, Any] | None = None,
        reason: str | None = None,
        provenance: str = "computed",
    ) -> None:
        if genus not in [2, 3]:
            raise ValueError("deficiency support is restricted to genus 2 and 3")
        if decision not in [True, False, None]:
            raise TypeError("decision must be true, false, or None")
        if decision is True and obstruction is None:
            raise ValueError("a deficient result requires an obstruction certificate")
        if decision is False and witness is None:
            raise ValueError("a nondeficient result requires a divisor witness")
        if decision is None and reason is None:
            raise ValueError("an unsupported result requires a reason")
        self.place = place
        self.genus = int(genus)
        self.divisor_degree = self.genus - 1
        self.decision = decision
        self.deficient = decision
        self.status = "certified" if decision is not None else "unsupported"
        self.certified = decision is not None
        self.theorem = str(theorem)
        self.witness = None if witness is None else dict(witness)
        self.obstruction = None if obstruction is None else dict(obstruction)
        self.certificate = dict({} if certificate is None else certificate)
        self.reason = None if reason is None else str(reason)
        self.provenance = str(provenance)

    def require_decision(self) -> bool:
        """Return the certified boolean or raise with the complete local result."""
        if self.decision is None:
            raise DeficiencyUnsupportedError(self)
        return bool(self.decision)

    def to_dict(self) -> dict[str, Any]:
        """Return a deterministic, JSON-friendly certificate record."""
        return {
            "schema": "sagejs.hyperelliptic-deficiency/v1",
            "place": self.place,
            "genus": self.genus,
            "divisor_degree": self.divisor_degree,
            "status": self.status,
            "deficient": self.decision,
            "theorem": self.theorem,
            "witness": self.witness,
            "obstruction": self.obstruction,
            "certificate": self.certificate,
            "reason": self.reason,
            "provenance": self.provenance,
        }

    def __getitem__(self, name: str) -> Any:
        if not hasattr(self, name):
            raise KeyError(name)
        return getattr(self, name)

    def __repr__(self) -> str:
        return (
            "DeficiencyResult(place="
            + repr(self.place)
            + ", status="
            + repr(self.status)
            + ", deficient="
            + repr(self.decision)
            + ")"
        )


class GlobalDeficiencyDiagnostic:
    """Parity assembly and its precisely conditional Cassels--Tate consequence."""

    def __init__(
        self,
        genus: int,
        local_results: Iterable[DeficiencyResult],
        *,
        bad_primes_complete: bool,
        bad_primes_provenance: str,
        canonical_principal_polarization: bool,
        sha_finite: bool | None,
        reason: str | None = None,
    ) -> None:
        self.genus = int(genus)
        self.local_results = tuple(local_results)
        self.bad_primes_complete = bool(bad_primes_complete)
        self.bad_primes_provenance = str(bad_primes_provenance)
        self.canonical_principal_polarization = bool(canonical_principal_polarization)
        self.sha_finite = sha_finite
        self.unsupported_places = tuple(
            result.place for result in self.local_results if not result.certified
        )
        self.complete = self.bad_primes_complete and not self.unsupported_places
        self.reason = reason
        self.deficient_places = tuple(
            result.place for result in self.local_results if result.decision is True
        )
        self.number_of_deficient_places = (
            len(self.deficient_places) if self.complete else None
        )
        self.deficiency_parity = (
            len(self.deficient_places) % 2 if self.complete else None
        )
        self.cassels_tate_pairing_class = None
        self.sha_order_shape = None
        self.theorem = None
        if self.complete and self.canonical_principal_polarization:
            self.cassels_tate_pairing_class = (
                "even" if self.deficiency_parity == 0 else "odd"
            )
            if sha_finite is not False:
                base = "square" if self.deficiency_parity == 0 else "twice_a_square"
                self.sha_order_shape = (
                    base if sha_finite is True else base + "_if_finite"
                )
            self.theorem = (
                POONEN_STOLL_REFERENCE
                + ", Corollary 12; the order statement additionally assumes finite Sha"
            )

    def to_dict(self) -> dict[str, Any]:
        """Return a deterministic record without a numerical recognition field."""
        return {
            "schema": "sagejs.hyperelliptic-global-deficiency/v1",
            "genus": self.genus,
            "complete": self.complete,
            "bad_primes_complete": self.bad_primes_complete,
            "bad_primes_provenance": self.bad_primes_provenance,
            "unsupported_places": list(self.unsupported_places),
            "deficient_places": list(self.deficient_places),
            "number_of_deficient_places": self.number_of_deficient_places,
            "deficiency_parity": self.deficiency_parity,
            "canonical_principal_polarization": self.canonical_principal_polarization,
            "sha_finite": self.sha_finite,
            "cassels_tate_pairing_class": self.cassels_tate_pairing_class,
            "sha_order_shape": self.sha_order_shape,
            "theorem": self.theorem,
            "reason": self.reason,
            "local_results": [result.to_dict() for result in self.local_results],
        }

    def __repr__(self) -> str:
        return (
            "GlobalDeficiencyDiagnostic(complete="
            + repr(self.complete)
            + ", deficient_places="
            + repr(self.deficient_places)
            + ", sha_order_shape="
            + repr(self.sha_order_shape)
            + ")"
        )


def _trim(values: list[int]) -> list[int]:
    answer = list(values)
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    return answer if answer else [0]


def _degree(values: list[int]) -> int:
    values = _trim(values)
    return -1 if values == [0] else len(values) - 1


def _multiply(left: list[int], right: list[int]) -> list[int]:
    answer = [0 for _index in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            answer[left_index + right_index] += left_value * right_value
    return _trim(answer)


def _multiply_mod(left: list[int], right: list[int], prime: int) -> list[int]:
    return _trim([value % prime for value in _multiply(left, right)])


def _evaluate_mod(values: list[int], argument: int, prime: int) -> int:
    answer = 0
    for value in reversed(values):
        answer = (answer * argument + value) % prime
    return answer


def _derivative(values: list[int]) -> list[int]:
    return _trim([index * values[index] for index in range(1, len(values))])


def _valuation(value: int, prime: int) -> int:
    if value == 0:
        return 10**9
    value = abs(value)
    answer = 0
    while value % prime == 0:
        value //= prime
        answer += 1
    return answer


def _is_prime(value: int) -> bool:
    if value >= 1 << 64:
        sage = __import__("sagejs", fromlist=["is_prime"])
        return bool(sage.is_prime(value))
    if value < 2:
        return False
    for small in [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]:
        if value == small:
            return True
        if value % small == 0:
            return False
    exponent = value - 1
    power_of_two = 0
    while exponent % 2 == 0:
        exponent //= 2
        power_of_two += 1
    bases = [2, 325, 9375, 28178, 450775, 9780504, 1795265022]
    for raw_base in bases:
        base = raw_base % value
        if base == 0:
            continue
        residue = pow(base, exponent, value)
        if residue in [1, value - 1]:
            continue
        composite = True
        for _index in range(power_of_two - 1):
            residue = residue * residue % value
            if residue == value - 1:
                composite = False
                break
        if composite:
            return False
    return True


def _integer_model(
    curve: Any,
) -> tuple[list[int], list[int], list[int], dict[str, Any]]:
    data = curve._smalljac_integral_model_data()
    f_values = _trim([int(value) for value in data["f_coefficients"]])
    h_values = _trim([int(value) for value in data["h_coefficients"]])
    branch = _multiply(h_values, h_values)
    if len(branch) < len(f_values):
        branch.extend([0 for _index in range(len(f_values) - len(branch))])
    for index, value in enumerate(f_values):
        branch[index] += 4 * value
    return (
        f_values,
        h_values,
        _trim(branch),
        {
            "transform": str(data["transform"]),
            "transform_scale": int(data["transform_scale"]),
            "y_weight": int(data["y_weight"]),
        },
    )


Rational = tuple[int, int]


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _rational(numerator: int, denominator: int = 1) -> Rational:
    if denominator == 0:
        raise ZeroDivisionError("rational denominator is zero")
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _rational_subtract(left: Rational, right: Rational) -> Rational:
    return _rational(left[0] * right[1] - right[0] * left[1], left[1] * right[1])


def _rational_multiply(left: Rational, right: Rational) -> Rational:
    return _rational(left[0] * right[0], left[1] * right[1])


def _rational_divide(left: Rational, right: Rational) -> Rational:
    if right[0] == 0:
        raise ZeroDivisionError("rational polynomial division by zero")
    return _rational(left[0] * right[1], left[1] * right[0])


def _trim_rational(values: list[Rational]) -> None:
    while len(values) > 1 and values[-1][0] == 0:
        values.pop()


def _rational_remainder(
    dividend: list[Rational], divisor: list[Rational]
) -> list[Rational]:
    remainder = dividend[:]
    while len(remainder) >= len(divisor) and not (
        len(remainder) == 1 and remainder[0][0] == 0
    ):
        offset = len(remainder) - len(divisor)
        scalar = _rational_divide(remainder[-1], divisor[-1])
        for index, coefficient in enumerate(divisor):
            position = offset + index
            remainder[position] = _rational_subtract(
                remainder[position], _rational_multiply(scalar, coefficient)
            )
        _trim_rational(remainder)
    return remainder


def _sturm_sequence(values: list[int]) -> list[list[Rational]]:
    polynomial = [_rational(value) for value in _trim(values)]
    derivative = [
        _rational_multiply(polynomial[index], _rational(index))
        for index in range(1, len(polynomial))
    ]
    _trim_rational(derivative)
    if derivative == [(0, 1)]:
        return [polynomial]
    sequence = [polynomial, derivative]
    while sequence[-1] != [(0, 1)]:
        remainder = _rational_remainder(sequence[-2], sequence[-1])
        remainder = [_rational(-value[0], value[1]) for value in remainder]
        if remainder == [(0, 1)]:
            break
        sequence.append(remainder)
        if len(remainder) == 1:
            break
    return sequence


def _variations(signs: Iterable[int]) -> int:
    previous = 0
    answer = 0
    for sign in signs:
        if sign == 0:
            continue
        if previous and sign != previous:
            answer += 1
        previous = sign
    return answer


def _sign_at_infinity(polynomial: list[Rational], positive: bool) -> int:
    sign = -1 if polynomial[-1][0] < 0 else 1
    if not positive and (len(polynomial) - 1) % 2:
        sign = -sign
    return sign


def _real_root_certificate(values: list[int]) -> dict[str, Any]:
    sequence = _sturm_sequence(values)
    negative_signs = [_sign_at_infinity(item, False) for item in sequence]
    positive_signs = [_sign_at_infinity(item, True) for item in sequence]
    negative_variations = _variations(negative_signs)
    positive_variations = _variations(positive_signs)
    return {
        "branch_coefficients_ascending": list(values),
        "sturm_degrees": [len(item) - 1 for item in sequence],
        "signs_at_negative_infinity": negative_signs,
        "signs_at_positive_infinity": positive_signs,
        "variations_at_negative_infinity": negative_variations,
        "variations_at_positive_infinity": positive_variations,
        "distinct_real_roots": negative_variations - positive_variations,
    }


def _real_deficiency(
    genus: int, branch: list[int], model: dict[str, Any]
) -> DeficiencyResult:
    if genus % 2 == 1:
        return _odd_genus_witness("infinity", genus)
    degree = _degree(branch)
    if degree % 2 == 1:
        return DeficiencyResult(
            "infinity",
            genus,
            False,
            theorem="odd-degree hyperelliptic model has a rational point at infinity",
            witness={"kind": "real_point_at_infinity", "divisor_degree": 1},
            certificate={"branch_degree": degree, **model},
        )
    root_certificate = _real_root_certificate(branch)
    if int(root_certificate["distinct_real_roots"]) > 0:
        return DeficiencyResult(
            "infinity",
            genus,
            False,
            theorem="exact Sturm theorem and a real branch point",
            witness={
                "kind": "real_branch_point",
                "root_count": int(root_certificate["distinct_real_roots"]),
            },
            certificate={**root_certificate, **model},
        )
    if branch[-1] > 0:
        return DeficiencyResult(
            "infinity",
            genus,
            False,
            theorem="positive leading branch coefficient gives real points at infinity",
            witness={
                "kind": "real_point_at_infinity",
                "completed_square_value": "sqrt(leading_coefficient)",
            },
            certificate={**root_certificate, **model},
        )
    return DeficiencyResult(
        "infinity",
        genus,
        True,
        theorem=(
            "a genus-2 real curve is deficient exactly when it has no real point; "
            "Sturm proves the completed-square branch polynomial is everywhere negative"
        ),
        obstruction={
            "kind": "empty_real_locus",
            "branch_leading_sign": -1,
            "real_root_count": 0,
        },
        certificate={**root_certificate, **model},
    )


def _square_root_mod(value: int, prime: int) -> int:
    value %= prime
    if value == 0:
        return 0
    if pow(value, (prime - 1) // 2, prime) != 1:
        raise ArithmeticError("a modular square root was requested for a nonsquare")
    if prime % 4 == 3:
        return pow(value, (prime + 1) // 4, prime)
    odd = prime - 1
    power = 0
    while odd % 2 == 0:
        odd //= 2
        power += 1
    nonresidue = 2
    while pow(nonresidue, (prime - 1) // 2, prime) != prime - 1:
        nonresidue += 1
    c_value = pow(nonresidue, odd, prime)
    root = pow(value, (odd + 1) // 2, prime)
    residue = pow(value, odd, prime)
    remaining = power
    while residue != 1:
        index = 1
        square = residue * residue % prime
        while index < remaining and square != 1:
            square = square * square % prime
            index += 1
        factor = pow(c_value, 1 << (remaining - index - 1), prime)
        root = root * factor % prime
        residue = residue * factor * factor % prime
        c_value = factor * factor % prime
        remaining = index
    return root


def _hensel_point_witness(
    prime: int,
    f_values: list[int],
    h_values: list[int],
    branch: list[int],
) -> dict[str, Any] | None:
    if prime == 2:
        f_derivative = _derivative(f_values)
        h_derivative = _derivative(h_values)
        for x_value in range(2):
            f_at_x = _evaluate_mod(f_values, x_value, 2)
            h_at_x = _evaluate_mod(h_values, x_value, 2)
            for y_value in range(2):
                equation = (y_value * y_value + h_at_x * y_value - f_at_x) % 2
                if equation:
                    continue
                derivative_x = (
                    _evaluate_mod(h_derivative, x_value, 2) * y_value
                    - _evaluate_mod(f_derivative, x_value, 2)
                ) % 2
                derivative_y = h_at_x
                if derivative_x or derivative_y:
                    return {
                        "kind": "hensel_affine_point",
                        "residue_point": [x_value, y_value],
                        "nonzero_partial": "x" if derivative_x else "y",
                        "prime": 2,
                    }
        return None
    derivative = _derivative(branch)
    inverse_two = (prime + 1) // 2
    for x_value in range(prime):
        value = _evaluate_mod(branch, x_value, prime)
        if value:
            if pow(value, (prime - 1) // 2, prime) != 1:
                continue
            completed_y = _square_root_mod(value, prime)
            h_at_x = _evaluate_mod(h_values, x_value, prime)
            y_value = (completed_y - h_at_x) * inverse_two % prime
            return {
                "kind": "hensel_affine_point",
                "residue_point": [x_value, y_value],
                "completed_square_y": completed_y,
                "nonzero_partial": "y",
                "prime": prime,
            }
        if _evaluate_mod(derivative, x_value, prime):
            h_at_x = _evaluate_mod(h_values, x_value, prime)
            y_value = (-h_at_x) * inverse_two % prime
            return {
                "kind": "hensel_branch_point",
                "residue_point": [x_value, y_value],
                "completed_square_y": 0,
                "nonzero_partial": "x",
                "prime": prime,
            }
    return None


def _padic_square_certificate(value: int, prime: int) -> dict[str, Any] | None:
    if value == 0:
        return {"valuation": "infinity", "unit_residue": 0, "exact_zero": True}
    valuation = _valuation(value, prime)
    if valuation % 2:
        return None
    unit = value // (prime**valuation)
    if prime == 2:
        residue = unit % 8
        if residue != 1:
            return None
        modulus = 8
    else:
        residue = unit % prime
        if pow(residue, (prime - 1) // 2, prime) != 1:
            return None
        modulus = prime
    return {
        "valuation": valuation,
        "unit_residue": residue,
        "unit_modulus": modulus,
        "exact_zero": False,
    }


def _small_integral_x_witness(
    prime: int, branch: list[int], bound: int = 256
) -> dict[str, Any] | None:
    """Find a proved local point; failure is never treated as an obstruction."""
    for absolute_value in range(bound + 1):
        arguments = [0] if absolute_value == 0 else [absolute_value, -absolute_value]
        for x_value in arguments:
            value = 0
            for coefficient in reversed(branch):
                value = value * x_value + coefficient
            square = _padic_square_certificate(value, prime)
            if square is not None:
                return {
                    "kind": "p_adic_point_from_integral_x",
                    "x_coordinate": x_value,
                    "completed_square_value": value,
                    "square_certificate": square,
                    "search_bound": bound,
                }
    return None


def _factor_mod(values: list[int], prime: int) -> list[dict[str, Any]]:
    module = __import__(
        "sagejs.number_fields.local_polygons", fromlist=["factor_mod_prime"]
    )
    return [dict(item) for item in module.factor_mod_prime(values, prime)]


def _divmod_mod(
    dividend: list[int], divisor: list[int], prime: int
) -> tuple[list[int], list[int]]:
    remainder = _trim([value % prime for value in dividend])
    divisor = _trim([value % prime for value in divisor])
    if divisor == [0]:
        raise ZeroDivisionError("finite-field polynomial division by zero")
    if _degree(remainder) < _degree(divisor):
        return [0], remainder
    quotient = [0 for _index in range(_degree(remainder) - _degree(divisor) + 1)]
    inverse = pow(divisor[-1], prime - 2, prime)
    while _degree(remainder) >= _degree(divisor) and remainder != [0]:
        offset = _degree(remainder) - _degree(divisor)
        scalar = remainder[-1] * inverse % prime
        quotient[offset] = scalar
        for index, value in enumerate(divisor):
            remainder[index + offset] = (
                remainder[index + offset] - scalar * value
            ) % prime
        remainder = _trim(remainder)
    return _trim(quotient), remainder


def _gcd_mod(left: list[int], right: list[int], prime: int) -> list[int]:
    left = _trim([value % prime for value in left])
    right = _trim([value % prime for value in right])
    while right != [0]:
        left, right = right, _divmod_mod(left, right, prime)[1]
    if left == [0]:
        return [0]
    inverse = pow(left[-1], prime - 2, prime)
    return _trim([value * inverse % prime for value in left])


def _smallest_nonsquare(prime: int) -> int:
    for value in range(2, prime):
        if pow(value, (prime - 1) // 2, prime) == prime - 1:
            return value
    raise ArithmeticError("an odd finite field has no nonsquare")


def _exceptional_square_reduction(
    values: list[int], projective_degree: int, prime: int
) -> dict[str, Any]:
    reduced = _trim([value % prime for value in values])
    if reduced == [0]:
        return {
            "exceptional": True,
            "unit": _smallest_nonsquare(prime),
            "square_root": [0],
            "factorization": [],
            "infinity_multiplicity": projective_degree + 1,
            "zero_reduction": True,
        }
    factorization = _factor_mod(reduced, prime)
    infinity_multiplicity = projective_degree - _degree(reduced)
    unit = reduced[-1] % prime
    exceptional = (
        infinity_multiplicity % 2 == 0
        and all(int(item["multiplicity"]) % 2 == 0 for item in factorization)
        and pow(unit, (prime - 1) // 2, prime) == prime - 1
    )
    square_root = [1]
    if exceptional:
        for item in factorization:
            factor = [int(value) for value in item["factor"]]
            for _index in range(int(item["multiplicity"]) // 2):
                square_root = _multiply_mod(square_root, factor, prime)
        expected = _multiply_mod(square_root, square_root, prime)
        expected = _trim([unit * value % prime for value in expected])
        if expected != reduced:
            raise ArithmeticError("failed to replay a square-reduction certificate")
    return {
        "exceptional": exceptional,
        "unit": unit,
        "square_root": square_root if exceptional else None,
        "factorization": factorization,
        "infinity_multiplicity": infinity_multiplicity,
        "zero_reduction": False,
    }


def _odd_common_homogeneous_factor_data(
    h_values: list[int],
    h_degree: int,
    j_values: list[int],
    j_degree: int,
    prime: int,
) -> dict[str, Any]:
    h_reduced = _trim([value % prime for value in h_values])
    j_reduced = _trim([value % prime for value in j_values])
    if h_reduced == [0]:
        gcd_values = j_reduced
        infinity_multiplicity = j_degree - _degree(j_reduced)
    else:
        gcd_values = _gcd_mod(h_reduced, j_reduced, prime)
        infinity_multiplicity = min(
            h_degree - _degree(h_reduced), j_degree - _degree(j_reduced)
        )
    factorization = _factor_mod(gcd_values, prime) if gcd_values != [0] else []
    odd_factors: list[dict[str, Any]] = (
        [{"kind": "infinity", "degree": 1, "multiplicity": infinity_multiplicity}]
        if infinity_multiplicity > 0
        else []
    )
    odd_factors.extend(
        {
            "kind": "finite",
            "factor": [int(value) for value in item["factor"]],
            "degree": int(item["degree"]),
            "multiplicity": int(item["multiplicity"]),
        }
        for item in factorization
        if int(item["degree"]) % 2 == 1
    )
    return {
        "gcd_mod_p_ascending": gcd_values,
        "gcd_factorization": factorization,
        "common_infinity_multiplicity": infinity_multiplicity,
        "odd_degree_common_factors": odd_factors,
        "has_odd_degree_common_factor": bool(odd_factors),
    }


def _poonen_stoll_odd_prime(
    genus: int,
    prime: int,
    branch: list[int],
    *,
    model_certificate: Mapping[str, Any],
    source: str,
) -> DeficiencyResult:
    projective_degree = 2 * genus + 2
    common = min(_valuation(value, prime) for value in branch if value != 0)
    removed = 2 * (common // 2)
    normalized = [value // (prime**removed) for value in branch]
    normalized = _trim(normalized)
    if _degree(normalized) < projective_degree:
        return DeficiencyResult(
            prime,
            genus,
            False,
            theorem="odd-degree hyperelliptic model has a rational point at infinity",
            witness={"kind": "p_adic_point_at_infinity", "divisor_degree": 1},
            certificate={
                "normalized_branch_coefficients_ascending": normalized,
                "removed_square_scalar_valuation": removed,
                "source": source,
                **dict(model_certificate),
            },
        )
    exceptional = _exceptional_square_reduction(normalized, projective_degree, prime)
    base_certificate = {
        "normalized_branch_coefficients_ascending": normalized,
        "removed_square_scalar_valuation": removed,
        "projective_degree": projective_degree,
        "reduction_test": exceptional,
        "source": source,
        **dict(model_certificate),
    }
    if not bool(exceptional["exceptional"]):
        return DeficiencyResult(
            prime,
            genus,
            False,
            theorem=POONEN_STOLL_REFERENCE + ", Lemma 15",
            witness={
                "kind": "odd_degree_local_divisor",
                "construction": "trace of a point over an odd unramified extension",
            },
            certificate=base_certificate,
        )

    unit = int(exceptional["unit"])
    h_bar = [int(value) for value in exceptional["square_root"]]
    h_lift = h_bar + [0 for _index in range(genus + 2 - len(h_bar))]
    square = _multiply(h_lift, h_lift)
    square.extend([0 for _index in range(projective_degree + 1 - len(square))])
    padded = normalized + [
        0 for _index in range(projective_degree + 1 - len(normalized))
    ]
    differences = [
        padded[index] - unit * square[index] for index in range(projective_degree + 1)
    ]
    if any(value % prime for value in differences):
        raise ArithmeticError("the lifted exceptional reduction is not divisible by p")
    j_lift = _trim([value // prime for value in differences])
    common_factor = _odd_common_homogeneous_factor_data(
        h_lift,
        genus + 1,
        j_lift,
        projective_degree,
        prime,
    )
    base_certificate["lemma16_decomposition"] = {
        "unit": unit,
        "unit_is_nonsquare": True,
        "h_coefficients_ascending": h_lift,
        "j_coefficients_ascending": j_lift,
        "identity": "F = unit*h^2 + p*j",
        **common_factor,
    }
    if not bool(common_factor["has_odd_degree_common_factor"]):
        return DeficiencyResult(
            prime,
            genus,
            True,
            theorem=POONEN_STOLL_REFERENCE + ", Lemma 16",
            obstruction={
                "kind": "no_points_over_odd_degree_extensions",
                "nonsquare_unit_mod_p": unit,
                "common_odd_degree_factor": False,
            },
            certificate=base_certificate,
        )
    return DeficiencyResult(
        prime,
        genus,
        None,
        theorem=POONEN_STOLL_REFERENCE + ", Lemmas 15--16 are inconclusive",
        certificate=base_certificate,
        reason=(
            "the reduction is a nonsquare times a square, but h and j have "
            "a common factor of odd degree"
        ),
    )


def _odd_genus_witness(place: Any, genus: int) -> DeficiencyResult:
    return DeficiencyResult(
        place,
        genus,
        False,
        theorem=CLUSTER_REFERENCE + ", Lemma 12.3",
        witness={
            "kind": "hyperelliptic_fibre_divisor",
            "degree": 2,
            "target_degree": genus - 1,
            "construction": "pullback of a rational point of P1",
        },
        certificate={"genus_is_odd": True},
    )


def _result_from_reduction(
    curve: Any,
    prime: int,
    reduction: Any,
    model_certificate: Mapping[str, Any],
) -> DeficiencyResult | None:
    genus = int(curve.genus())
    if int(reduction.prime) != prime:
        raise ValueError(
            "the supplied local-reduction certificate is for another prime"
        )
    if bool(reduction.curve_good_reduction):
        return DeficiencyResult(
            prime,
            genus,
            False,
            theorem="regular-model index formula (Poonen--Stoll, Remark after Lemma 16)",
            witness={
                "kind": "regular_model_component",
                "multiplicity": 1,
                "constant_field_degree": 1,
            },
            certificate={
                "reduction_type": str(reduction.reduction_type),
                "curve_good_reduction": True,
                "local_reduction_backend": str(reduction.backend),
                **dict(model_certificate),
            },
        )
    certificate = dict(reduction.certificate)
    reduction_type = str(reduction.reduction_type)
    if reduction_type == "semistable_split_cluster":
        roots = certificate.get("rational_roots", [])
        if roots:
            return DeficiencyResult(
                prime,
                genus,
                False,
                theorem="a rational branch root gives a local Weierstrass point",
                witness={
                    "kind": "p_adic_branch_point",
                    "x_coordinate": list(roots[0]),
                    "completed_square_y": 0,
                },
                certificate={
                    "reduction_type": reduction_type,
                    "local_reduction_backend": str(reduction.backend),
                    "cluster_picture": certificate.get("cluster_picture"),
                    **dict(model_certificate),
                },
            )
    if reduction_type == "semistable_nodal":
        return DeficiencyResult(
            prime,
            genus,
            False,
            theorem="semistable regular-model index formula",
            witness={
                "kind": "regular_model_component",
                "multiplicity": 1,
                "frobenius_orbit_length": 1,
                "geometrically_integral_normalization": True,
            },
            certificate={
                "reduction_type": reduction_type,
                "special_fibre_factorization": certificate.get(
                    "special_fibre_factorization"
                ),
                "local_reduction_backend": str(reduction.backend),
                **dict(model_certificate),
            },
        )
    if reduction_type == "semistable_nodal_two_components":
        sign = int(certificate["component_frobenius_sign"])
        component_orbit = 1 if sign == 1 else 2
        data = {
            "reduction_type": reduction_type,
            "normalization_components": 2,
            "component_frobenius_sign": sign,
            "component_orbit_length": component_orbit,
            "component_multiplicity": 1,
            "local_reduction_backend": str(reduction.backend),
            **dict(model_certificate),
        }
        if sign == 1:
            return DeficiencyResult(
                prime,
                genus,
                False,
                theorem="semistable regular-model index formula",
                witness={
                    "kind": "regular_model_component",
                    "multiplicity": 1,
                    "frobenius_orbit_length": 1,
                },
                certificate=data,
            )
        if genus == 2:
            return DeficiencyResult(
                prime,
                genus,
                None,
                theorem=CLUSTER_REFERENCE + ", Theorem 12.4",
                certificate=data,
                reason=(
                    "the two normalization components are exchanged, but the "
                    "ordinary-nodal Euler-factor certificate does not record "
                    "the node thicknesses needed to exclude fixed components "
                    "in the minimal regular model"
                ),
            )
    if reduction_type.startswith("almost_good_type_"):
        normalized = certificate.get("normalized_branch_coefficients_ascending")
        if normalized is not None:
            return _poonen_stoll_odd_prime(
                genus,
                prime,
                [int(value) for value in normalized],
                model_certificate={
                    "reduction_type": reduction_type,
                    "almost_good_type": certificate.get("almost_good_type"),
                    "local_reduction_backend": str(reduction.backend),
                    **dict(model_certificate),
                },
                source="Maistret--Sutherland normalized almost-good model",
            )
    return None


def _normalize_place(place: Any) -> Any:
    if place in ["infinity", "real", "oo", "Infinity"] or place == 0:
        return "infinity"
    if isinstance(place, bool):
        raise TypeError("a finite place must be a prime")
    try:
        prime = int(place)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError("place must be a prime or infinity") from error
    try:
        exact = place == prime
    except Exception:
        exact = False
    if exact is not True or not _is_prime(prime):
        raise ValueError("a finite place must be a prime")
    return prime


def _require_rational_curve(curve: Any) -> None:
    base = curve.base_ring()
    if getattr(base, "_kind", None) != "QQ":
        raise TypeError("deficiency over places of QQ requires a curve over QQ")


def local_deficiency(
    curve: Any,
    place: Any,
    algorithm: str = "auto",
    *,
    reduction: Any = None,
) -> DeficiencyResult:
    """Return the exact local deficiency decision and its certificate.

    `decision=None` is a first-class result.  Pass a previously computed
    `LocalReductionData` as `reduction` to reuse it.  Otherwise reduction is
    requested only when direct divisor and Poonen--Stoll tests are
    inconclusive.
    """
    _require_rational_curve(curve)
    normalized_place = _normalize_place(place)
    genus = int(curve.genus())
    if genus not in [2, 3]:
        raise NotImplementedError("only genus-2 and genus-3 curves are supported")
    if genus % 2 == 1:
        return _odd_genus_witness(normalized_place, genus)
    f_values, h_values, branch, model = _integer_model(curve)
    if normalized_place == "infinity":
        return _real_deficiency(genus, branch, model)
    prime = int(normalized_place)
    if _degree(branch) < 2 * genus + 2:
        return DeficiencyResult(
            prime,
            genus,
            False,
            theorem="odd-degree hyperelliptic model has a rational point at infinity",
            witness={"kind": "p_adic_point_at_infinity", "divisor_degree": 1},
            certificate={"branch_degree": _degree(branch), **model},
        )
    if reduction is not None:
        from_reduction = _result_from_reduction(curve, prime, reduction, model)
        if from_reduction is not None and bool(reduction.curve_good_reduction):
            return from_reduction
    integral_point = _small_integral_x_witness(prime, branch)
    if integral_point is not None:
        return DeficiencyResult(
            prime,
            genus,
            False,
            theorem="exact local square criterion and a Q_p-rational affine point",
            witness=integral_point,
            certificate={"branch_coefficients_ascending": branch, **model},
        )
    point = _hensel_point_witness(prime, f_values, h_values, branch)
    if point is not None:
        return DeficiencyResult(
            prime,
            genus,
            False,
            theorem="multivariate Hensel lemma",
            witness=point,
            certificate={
                "f_coefficients_ascending": f_values,
                "h_coefficients_ascending": h_values,
                **model,
            },
        )
    direct: DeficiencyResult | None = None
    if prime != 2:
        direct = _poonen_stoll_odd_prime(
            genus,
            prime,
            branch,
            model_certificate=model,
            source="cleared integral completed-square model",
        )
        if direct.certified:
            return direct
    reduction_error: dict[str, Any] | None = None
    if reduction is None:
        try:
            reduction = curve.local_reduction(prime, algorithm)
        except (ArithmeticError, NotImplementedError) as error:
            reduction_error = {
                "type": type(error).__name__,
                "message": str(error),
                "diagnostics": getattr(error, "diagnostics", None),
            }
    if reduction is not None:
        from_reduction = _result_from_reduction(curve, prime, reduction, model)
        if from_reduction is not None and from_reduction.certified:
            return from_reduction
        if direct is None and from_reduction is not None:
            direct = from_reduction
    certificate = {} if direct is None else dict(direct.certificate)
    if reduction is not None:
        certificate["local_reduction"] = {
            "reduction_type": str(reduction.reduction_type),
            "semistable": reduction.semistable,
            "backend": str(reduction.backend),
        }
    if reduction_error is not None:
        certificate["local_reduction_error"] = reduction_error
    if direct is not None:
        reason = str(direct.reason)
        theorem = str(direct.theorem)
    elif prime == 2:
        reason = (
            "no nonsingular residue point was found and certified bad-reduction "
            "deficiency at 2 is outside the current wild envelope"
        )
        theorem = "no applicable certified 2-adic deficiency theorem"
    else:
        reason = (
            "the available odd-prime local-reduction data does not determine the index"
        )
        theorem = "no applicable certified finite-place deficiency theorem"
    return DeficiencyResult(
        prime,
        genus,
        None,
        theorem=theorem,
        certificate=certificate,
        reason=reason,
    )


def is_deficient(
    curve: Any,
    place: Any,
    algorithm: str = "auto",
    *,
    reduction: Any = None,
) -> bool:
    """Return the certified boolean, raising outside the exact envelope."""
    return local_deficiency(
        curve, place, algorithm, reduction=reduction
    ).require_decision()


def global_deficiency_diagnostic(
    curve: Any,
    *,
    bad_primes: Iterable[Any] | None = None,
    bad_primes_certificate: Any = None,
    local_results: Iterable[DeficiencyResult] = (),
    algorithm: str = "auto",
    canonical_principal_polarization: bool = False,
    sha_finite: bool | None = None,
) -> GlobalDeficiencyDiagnostic:
    """Assemble deficient-place parity and the conditional Sha-shape theorem.

    When `bad_primes` is supplied, `bad_primes_certificate` must record why it
    is exhaustive before the global result is complete.  Omitting
    `bad_primes` asks the curve's certified global-reduction engine for the
    exhaustive list.  Supplied local results are reused by exact place.

    `canonical_principal_polarization=True` is mandatory for any Sha-shape
    conclusion.  `sha_finite=None` produces the literal suffix
    `_if_finite`; no numerical value is inspected.
    """
    if sha_finite not in [True, False, None]:
        raise TypeError("sha_finite must be true, false, or None")
    _require_rational_curve(curve)
    genus = int(curve.genus())
    if genus not in [2, 3]:
        raise NotImplementedError("only genus-2 and genus-3 curves are supported")
    supplied = {_normalize_place(result.place): result for result in local_results}
    if genus % 2 == 1:
        result = supplied.get("infinity", _odd_genus_witness("infinity", genus))
        return GlobalDeficiencyDiagnostic(
            genus,
            [result],
            bad_primes_complete=True,
            bad_primes_provenance="odd-genus hyperelliptic degree-2 divisor theorem",
            canonical_principal_polarization=canonical_principal_polarization,
            sha_finite=sha_finite,
        )

    complete_bad_primes = False
    bad_prime_provenance = "not supplied"
    discovery_error = None
    if bad_primes is None:
        try:
            bad_primes = list(curve.bad_primes())
            complete_bad_primes = True
            bad_prime_provenance = "curve.global_reduction().bad_primes"
        except Exception as error:
            bad_primes = []
            discovery_error = type(error).__name__ + ": " + str(error)
            bad_prime_provenance = "global bad-prime discovery failed"
    else:
        bad_primes = list(bad_primes)
        complete_bad_primes = bad_primes_certificate is not None
        bad_prime_provenance = (
            "uncertified supplied list"
            if bad_primes_certificate is None
            else str(bad_primes_certificate)
        )
    normalized_bad_primes = sorted({_normalize_place(prime) for prime in bad_primes})
    if any(prime == "infinity" for prime in normalized_bad_primes):
        raise ValueError("bad_primes must contain finite primes only")
    expected_places: list[Any] = ["infinity", *normalized_bad_primes]
    results = []
    for place in expected_places:
        if place in supplied:
            result = supplied[place]
            if result.genus != genus:
                raise ValueError("a supplied deficiency result has the wrong genus")
        else:
            result = local_deficiency(curve, place, algorithm)
        results.append(result)
    reason_parts = []
    if discovery_error is not None:
        reason_parts.append(discovery_error)
    if not complete_bad_primes:
        reason_parts.append("the finite bad-prime list is not certified exhaustive")
    if any(not result.certified for result in results):
        reason_parts.append("one or more local deficiency decisions are unsupported")
    return GlobalDeficiencyDiagnostic(
        genus,
        results,
        bad_primes_complete=complete_bad_primes,
        bad_primes_provenance=bad_prime_provenance,
        canonical_principal_polarization=canonical_principal_polarization,
        sha_finite=sha_finite,
        reason="; ".join(reason_parts) if reason_parts else None,
    )


__all__ = [
    "DeficiencyResult",
    "DeficiencyUnsupportedError",
    "GlobalDeficiencyDiagnostic",
    "global_deficiency_diagnostic",
    "is_deficient",
    "local_deficiency",
]
