"""Certified reference heights on odd-degree genus-2 Jacobians over `QQ`.

The production envelope in this module is intentionally explicit.

* Exact Flynn quartic Kummer duplication supports every checked
  odd-degree genus-2 Mumford divisor over `QQ`, including generalized
  equations `y^2 + h*y = f`.
* A factorization-free modular-gcd finite local-correction engine and an
  exact real-place correction iteration implement the practical
  Müller--Stoll path for primitive integral classical quintics.
* An automatic, conservative, proved height-difference enclosure is supplied
  for primitive integral classical quintics `y^2=f(x)`.  It combines Stoll's
  root-partition bound at infinity with an audited coefficient bound for the
  classical Flynn duplication quartics.
* Other checked odd-degree models retain a source-transparent repeated-
  doubling reference path.  It is labelled non-rigorous unless the caller
  supplies a proved absolute bound for `|h_K-hhat|`.

Generalized `h` models use exact direct Kummer quartics but remain a clearly
labelled numerical reference unless the caller supplies a proved global
height-difference bound. Even-degree transformations are not inferred.
"""

from __future__ import annotations

from typing import Any, cast

from sagejs.hyperelliptic_curves.genus2_kummer import (
    KummerCoordinates,
    classical_duplication_l1_bound,
    classical_duplication_raw,
    divisor_provenance,
    exact_divisor_capability,
    exact_model_capability,
    kummer_coordinates,
)
from sagejs.number_fields.class_unit_analytic import IntervalBallField, RealBall


class Genus2HeightCapabilityError(NotImplementedError):
    """The requested rigorous height operation is outside its envelope."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = dict(diagnostics)


class Genus2HeightResolutionError(ArithmeticError):
    """A regulator or torsion claim was not certified by the available data."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = dict(diagnostics)


def _gcd(left: int, right: int) -> int:
    left = abs(int(left))
    right = abs(int(right))
    while right:
        left, right = right, left % right
    return left


def _rational_pair(value: Any) -> tuple[int, int]:
    numerator_method = getattr(value, "numerator", None)
    denominator_method = getattr(value, "denominator", None)
    if callable(numerator_method) and callable(denominator_method):
        return int(str(numerator_method())), int(str(denominator_method()))
    if isinstance(value, int) and not isinstance(value, bool):
        return int(value), 1
    raise TypeError("an exact height bound must be rational")


def _exact_ball(value: Any, precision: int, source: str) -> RealBall:
    if isinstance(value, RealBall):
        if not value.rigorous:
            raise ValueError("a supplied rigorous height bound must be rigorous")
        if value.lower < RealBall(0).lower:
            raise ValueError("a supplied absolute height bound must be nonnegative")
        return value
    numerator, denominator = _rational_pair(value)
    if denominator <= 0 or numerator < 0:
        raise ValueError("a supplied absolute height bound must be nonnegative")
    return RealBall(
        value,
        precision_bits=precision,
        rigorous=True,
        source=source,
    )


def _zero_ball(precision: int, source: str = "exact-zero") -> RealBall:
    return RealBall(0, precision_bits=precision, rigorous=True, source=source)


def _one_ball(precision: int, source: str = "exact-one") -> RealBall:
    return RealBall(1, precision_bits=precision, rigorous=True, source=source)


def _integer_coefficients(polynomial: Any, length: int) -> tuple[int, ...] | None:
    answer: list[int] = []
    zero = polynomial.parent().base_ring()(0)
    for index in range(length):
        value = polynomial[index] if index <= polynomial.degree() else zero
        numerator, denominator = _rational_pair(value)
        if denominator != 1:
            return None
        answer.append(numerator)
    return tuple(answer)


class AutomaticHeightBounds:
    """A proved two-sided bound for the naive/canonical height correction."""

    def __init__(
        self,
        correction_lower: RealBall,
        correction_upper: RealBall,
        diagnostics: dict[str, Any],
    ) -> None:
        self.correction_lower = correction_lower
        self.correction_upper = correction_upper
        self.diagnostics = dict(diagnostics)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-height-bounds.v1",
            "meaning": "correction_lower <= h_K(P)-hhat(P) <= correction_upper",
            "correction_lower": self.correction_lower.to_dict(),
            "correction_upper": self.correction_upper.to_dict(),
            "diagnostics": dict(self.diagnostics),
        }

    def __repr__(self) -> str:
        return (
            "AutomaticHeightBounds(lower="
            + repr(self.correction_lower)
            + ", upper="
            + repr(self.correction_upper)
            + ")"
        )


class FiniteHeightCorrectionResult:
    """Certified factorization-free finite local-height correction."""

    def __init__(
        self,
        ball: RealBall,
        partial_sum: RealBall,
        tail_bound: RealBall,
        steps: int,
        diagnostics: dict[str, Any],
    ) -> None:
        self.ball = ball
        self.partial_sum = partial_sum
        self.tail_bound = tail_bound
        self.steps = int(steps)
        self.diagnostics = dict(diagnostics)
        self.rigorous = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-finite-height-correction.v1",
            "meaning": "sum_p mu_p(P)*log(p)",
            "algorithm": "mueller-stoll-proposition-14.2-factorization-free",
            "rigorous": True,
            "steps": self.steps,
            "enclosure": self.ball.to_dict(),
            "partial_sum": self.partial_sum.to_dict(),
            "tail_bound": self.tail_bound.to_dict(),
            "diagnostics": dict(self.diagnostics),
        }

    def __repr__(self) -> str:
        return "FiniteHeightCorrectionResult(" + repr(self.ball) + ")"


def automatic_height_bounds(
    jacobian: Any, *, precision: int = 100
) -> AutomaticHeightBounds:
    """Return automatic certified bounds for a primitive integral quintic.

    The upper bound is Stoll's equation (7.1) / Mueller--Stoll Section 10
    root-partition bound, evaluated without approximate roots.  Cauchy's root
    radius and the discriminant identity give a proved lower bound for every
    cross-pair resultant.  All transcendental operations use outward-rounded
    interval logarithms.

    For the other direction, the checked-in sparse Flynn quartics are
    specialized to this exact model. The maximum L1 coefficient norm is
    computed without approximation. Telescoping then proves
    `h_K(P)-hhat(P) >= -log(A_delta)/3`.
    """
    precision = int(precision)
    if precision < 16:
        raise ValueError("height precision must be at least 16 bits")
    capability = exact_model_capability(jacobian)
    capability.require()
    f_value = jacobian.f()
    h_value = jacobian.h()
    diagnostics = dict(capability.diagnostics)
    diagnostics.update(
        {
            "schema": "sagejs.hyperelliptic.genus2-auto-height-bound.v1",
            "precision_bits": precision,
            "archimedean_method": ("stoll-root-partition-bound-with-cauchy-separation"),
            "duplication_coefficient_method": ("flynn-appendix-c-l1-monomial-audit"),
        }
    )
    if not h_value.is_zero():
        diagnostics["automatic_bound"] = "unsupported-generalized-h"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds currently require h=0",
            diagnostics,
        )
    if int(f_value.degree()) != 5:
        diagnostics["automatic_bound"] = "unsupported-nonquintic"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds currently require degree(f)=5",
            diagnostics,
        )
    coefficients = _integer_coefficients(f_value, 6)
    if coefficients is None:
        diagnostics["automatic_bound"] = "unsupported-rational-denominators"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds require an integral model",
            diagnostics,
        )
    content = 0
    for coefficient in coefficients:
        content = _gcd(content, coefficient)
    if content != 1:
        diagnostics["content"] = str(content)
        diagnostics["automatic_bound"] = "unsupported-nonprimitive-model"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds require primitive f",
            diagnostics,
        )
    discriminant = int(str(f_value.discriminant()))
    if discriminant == 0:
        diagnostics["automatic_bound"] = "singular-model"
        raise Genus2HeightCapabilityError(
            "a canonical height requires a squarefree quintic", diagnostics
        )

    field = IntervalBallField(precision)
    coefficient_height = max(abs(value) for value in coefficients)
    leading = abs(coefficients[5])
    root_radius = 1 + coefficient_height
    # Five finite roots give ten pairwise differences.  The discriminant
    # identity and the upper bound 2R on the other nine differences imply the
    # following lower bound on each individual separation.
    log_separation = (
        field.log_integer(abs(discriminant)) / RealBall(2)
        - field.log_integer(leading) * RealBall(4)
        - field.log_integer(2 * root_radius) * RealBall(9)
    )
    # Each 3+2 partition has six cross differences and leading coefficient^3.
    log_pair_resultant_lower = field.log_integer(leading) * RealBall(
        3
    ) + log_separation * RealBall(6)
    # Every coefficient of either root-product factor is bounded by S.
    symmetric_bound = 8 * max(1, leading) * root_radius**3
    log_symmetric_bound = field.log_integer(symmetric_bound)
    # Inspection of equation (7.1) gives |a_i| <= 64*S^6/|R| and
    # sqrt(sum_j |b_j|) <= 6*S^2.  There are ten 3+2 partitions.
    log_a_bound = (
        field.log_integer(64)
        + log_symmetric_bound * RealBall(6)
        - log_pair_resultant_lower
    )
    log_sqrt_b_bound = field.log_integer(6) + log_symmetric_bound * RealBall(2)
    log_infinite_bound = (
        field.log_integer(10) + log_a_bound + log_sqrt_b_bound
    ) * RealBall(2)
    upper_raw = (
        field.log_integer(2) * RealBall(4) / RealBall(3)
        + field.log_integer(abs(discriminant)) / RealBall(3)
        + log_infinite_bound / RealBall(3)
    )
    zero = _zero_ball(precision)
    upper = RealBall(
        zero.lower if upper_raw.lower < zero.lower else upper_raw.lower,
        zero.upper if upper_raw.upper < zero.upper else upper_raw.upper,
        precision_bits=precision,
        rigorous=True,
        source=(
            "Mueller--Stoll/Stoll root-partition height bound; "
            "Cauchy-discriminant separation; outward interval logs"
        ),
    )

    duplication_l1_bound = classical_duplication_l1_bound(jacobian)
    lower_magnitude = field.log_integer(duplication_l1_bound) / RealBall(3)
    lower = -lower_magnitude
    diagnostics.update(
        {
            "automatic_bound": "certified",
            "coefficient_height": str(coefficient_height),
            "leading_coefficient_abs": str(leading),
            "discriminant_abs": str(abs(discriminant)),
            "cauchy_root_radius": str(root_radius),
            "root_pair_count": 10,
            "cross_differences_per_partition": 6,
            "duplication_l1_bound": str(duplication_l1_bound),
            "duplication_l1_audit": "exact-specialized-sparse-term-sum",
            "references": (
                "Stoll, On the height constant for curves of genus two II, Eq. 7.1",
                "Flynn, The group law on the Jacobian of a curve of genus 2, Appendix C",
                "Mueller--Stoll, Canonical Heights on Genus Two Jacobians, Sections 10 and 17",
            ),
        }
    )
    return AutomaticHeightBounds(lower, upper, diagnostics)


def _common_content(values: tuple[int, int, int, int]) -> int:
    common = 0
    for value in values:
        common = _gcd(common, value)
    return common


def _finite_correction_steps(discriminant_bound: int, precision: int) -> int:
    # log(D) < bit_length(D), so this integer test conservatively enforces
    # log(D)/(3*4^steps) <= 2^-precision without a floating comparison.
    steps = 0
    target = discriminant_bound.bit_length() * (2**precision)
    scale = 3
    while scale < target:
        scale *= 4
        steps += 1
    return steps


def factorization_free_finite_correction(
    divisor: Any,
    *,
    precision: int = 80,
    steps: int | None = None,
) -> FiniteHeightCorrectionResult:
    """Certify the finite height correction without factoring a discriminant.

    This is the modular gcd algorithm preceding Müller--Stoll Proposition
    14.2. For a primitive integral quintic, the raw duplication content at
    every stage divides `D=16*abs(disc(f))`. Working modulo `D^(m+2)` keeps
    all intermediate integers polynomial in the requested accuracy. The
    omitted tail is enclosed by `log(D)/(3*4^m)`.
    """
    capability = exact_divisor_capability(divisor)
    capability.require()
    jacobian = divisor.parent()
    f_value = jacobian.f()
    h_value = jacobian.h()
    diagnostics = dict(capability.diagnostics)
    if not h_value.is_zero() or int(f_value.degree()) != 5:
        diagnostics["finite_correction"] = "unsupported-nonclassical-model"
        raise Genus2HeightCapabilityError(
            "factorization-free finite correction requires h=0 and degree(f)=5",
            diagnostics,
        )
    coefficients = _integer_coefficients(f_value, 6)
    if coefficients is None:
        diagnostics["finite_correction"] = "unsupported-rational-denominators"
        raise Genus2HeightCapabilityError(
            "factorization-free finite correction requires an integral model",
            diagnostics,
        )
    precision = int(precision)
    if precision < 16:
        raise ValueError("finite-correction precision must be at least 16 bits")
    discriminant = abs(int(str(f_value.discriminant())))
    if discriminant == 0:
        raise Genus2HeightCapabilityError(
            "finite correction requires a squarefree quintic", diagnostics
        )
    discriminant_bound = 16 * discriminant
    if steps is None:
        steps = _finite_correction_steps(discriminant_bound, precision)
    else:
        steps = int(steps)
        if steps < 0:
            raise ValueError("finite-correction steps must be nonnegative")

    field = IntervalBallField(precision)
    coordinates = kummer_coordinates(divisor).coordinates()
    partial = _zero_ball(precision, "empty-finite-correction-sum")
    gcd_values: list[str] = []
    modulus = discriminant_bound ** (steps + 2)
    for index in range(steps):
        raw = classical_duplication_raw(jacobian, coordinates, modulus=modulus)
        content = _common_content(raw)
        common = _gcd(discriminant_bound, content)
        if common == 0:
            raise ArithmeticError("modular Kummer duplication lost all precision")
        gcd_values.append(str(common))
        if common > 1:
            partial = partial + field.log_integer(common) / RealBall(
                4 ** (index + 1), precision_bits=precision
            )
        coordinates = cast(
            tuple[int, int, int, int],
            tuple(int(value // common) for value in raw),
        )

    tail = field.log_integer(discriminant_bound) / RealBall(
        3 * 4**steps, precision_bits=precision
    )
    ball = RealBall(
        partial.lower,
        (partial + tail).upper,
        precision_bits=precision,
        rigorous=True,
        source=("Mueller--Stoll factorization-free modular gcd finite correction"),
    )
    diagnostics.update(
        {
            "finite_correction": "certified",
            "discriminant_bound_D": str(discriminant_bound),
            "modulus_exponent": steps + 2,
            "raw_duplication_gcds": tuple(gcd_values),
            "factorization_used": False,
            "tail_formula": "log(D)/(3*4^steps)",
            "reference": (
                "Mueller--Stoll, Canonical Heights on Genus Two Jacobians, "
                "Section 14 and Proposition 14.2"
            ),
        }
    )
    return FiniteHeightCorrectionResult(ball, partial, tail, steps, diagnostics)


class HeightContext:
    """Reusable exact doubling chains, Kummer points, logs, and model bounds."""

    def __init__(self, jacobian: Any) -> None:
        capability = exact_model_capability(jacobian)
        capability.require()
        self.jacobian = jacobian
        self._chains: dict[Any, list[KummerCoordinates]] = {}
        self._kummer: dict[Any, Any] = {}
        self._fields: dict[int, IntervalBallField] = {}
        self._automatic_bounds: dict[int, AutomaticHeightBounds | None] = {}
        self._automatic_bound_errors: dict[int, dict[str, Any]] = {}
        self._local_corrections: dict[Any, dict[str, Any]] = {}
        self._chain_hits = 0
        self._chain_misses = 0
        self._doublings = 0
        self._kummer_hits = 0
        self._kummer_misses = 0
        self._local_correction_hits = 0
        self._local_correction_misses = 0

    def _key(self, divisor: Any) -> Any:
        if divisor.parent() is not self.jacobian:
            raise ValueError("all height points must belong to the context Jacobian")
        # MumfordDivisor hashes its exact parent/u/v triple.  Keeping the exact
        # object as the cache key avoids repeatedly serializing large rational
        # coefficients on warm height and pairing calls.
        return divisor

    def field(self, precision: int) -> IntervalBallField:
        precision = int(precision)
        cached = self._fields.get(precision)
        if cached is None:
            cached = IntervalBallField(precision)
            self._fields[precision] = cached
        return cached

    def kummer(self, divisor: Any) -> Any:
        key = self._key(divisor)
        cached = self._kummer.get(key)
        if cached is not None:
            self._kummer_hits += 1
            return cached
        self._kummer_misses += 1
        answer = kummer_coordinates(divisor)
        self._kummer[key] = answer
        return answer

    def chain(self, divisor: Any, steps: int) -> list[KummerCoordinates]:
        steps = int(steps)
        if steps < 0:
            raise ValueError("height doubling steps must be nonnegative")
        key = self._key(divisor)
        chain = self._chains.get(key)
        if chain is None:
            chain = [self.kummer(divisor)]
            self._chains[key] = chain
            self._chain_misses += 1
        else:
            self._chain_hits += 1
        while len(chain) <= steps:
            chain.append(chain[-1].duplicate())
            self._doublings += 1
        return chain

    def automatic_bounds(self, precision: int) -> AutomaticHeightBounds | None:
        precision = int(precision)
        if precision in self._automatic_bounds:
            return self._automatic_bounds[precision]
        try:
            answer = automatic_height_bounds(self.jacobian, precision=precision)
            self._automatic_bound_errors[precision] = {}
        except Genus2HeightCapabilityError as error:
            answer = None
            self._automatic_bound_errors[precision] = dict(error.diagnostics)
        self._automatic_bounds[precision] = answer
        return answer

    def diagnostics(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-height-context.v1",
            "chain_cache_entries": len(self._chains),
            "chain_cache_hits": self._chain_hits,
            "chain_cache_misses": self._chain_misses,
            "direct_kummer_quartic_doublings": self._doublings,
            "kummer_cache_entries": len(self._kummer),
            "kummer_cache_hits": self._kummer_hits,
            "kummer_cache_misses": self._kummer_misses,
            "local_correction_cache_entries": len(self._local_corrections),
            "local_correction_cache_hits": self._local_correction_hits,
            "local_correction_cache_misses": self._local_correction_misses,
            "precision_fields": tuple(sorted(self._fields)),
            "automatic_bound_precisions": tuple(
                sorted(
                    precision
                    for precision, value in self._automatic_bounds.items()
                    if value is not None
                )
            ),
            "automatic_bound_failures": {
                str(precision): dict(value)
                for precision, value in self._automatic_bound_errors.items()
                if value
            },
        }


class CanonicalHeightResult:
    """A canonical-height enclosure or explicitly numerical reference value."""

    def __init__(
        self,
        ball: RealBall,
        *,
        status: str,
        steps: int,
        provenance: dict[str, Any],
        bounds: AutomaticHeightBounds | None,
        diagnostics: dict[str, Any],
    ) -> None:
        self.ball = ball
        self.status = str(status)
        self.steps = int(steps)
        self.provenance = dict(provenance)
        self.bounds = bounds
        self.diagnostics = dict(diagnostics)
        self.rigorous = bool(ball.rigorous)

    def midpoint(self) -> Any:
        return self.ball.midpoint()

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-canonical-height.v1",
            "normalization": "Cassels-Flynn 2Theta Kummer canonical height",
            "pairing_convention": "<P,Q>=(hhat(P+Q)-hhat(P)-hhat(Q))/2",
            "status": self.status,
            "rigorous": self.rigorous,
            "steps": self.steps,
            "enclosure": self.ball.to_dict(),
            "divisor": self.provenance,
            "height_bounds": None if self.bounds is None else self.bounds.to_dict(),
            "diagnostics": dict(self.diagnostics),
        }

    def __repr__(self) -> str:
        return (
            "CanonicalHeightResult("
            + repr(self.ball)
            + ", status="
            + repr(self.status)
            + ")"
        )


def _find_kummer_repeat(chain: list[KummerCoordinates]) -> bool:
    seen: set[tuple[int, int, int, int]] = set()
    for point in chain:
        coordinates = point.coordinates()
        if coordinates == (0, 0, 0, 1):
            return True
        if coordinates in seen:
            # Equality on J/{+-1} gives 2^i P = +/- 2^j P and hence an exact
            # nonzero integer annihilator for P.
            return True
        seen.add(coordinates)
    return False


def _local_correction_breakdown(
    context: HeightContext,
    chain: list[KummerCoordinates],
    bounds: AutomaticHeightBounds | None,
    precision: int,
) -> dict[str, Any]:
    """Audit finite and real correction partial sums along an exact chain."""
    cache_key: Any = None
    if bounds is not None:
        cache_key = (
            chain[0],
            len(chain) - 1,
            precision,
            str(bounds.correction_lower.lower),
            str(bounds.correction_upper.upper),
        )
        cached = context._local_corrections.get(cache_key)
        if cached is not None:
            context._local_correction_hits += 1
            return dict(cached)
    context._local_correction_misses += 1
    jacobian = context.jacobian
    if (
        bounds is None
        or not jacobian.h().is_zero()
        or int(jacobian.f().degree()) != 5
        or _integer_coefficients(jacobian.f(), 6) is None
    ):
        answer = {
            "status": "unavailable-outside-classical-integral-envelope",
        }
        if cache_key is not None:
            context._local_corrections[cache_key] = answer
        return answer
    field = context.field(precision)
    finite = _zero_ball(precision, "empty-finite-local-correction")
    archimedean = _zero_ball(precision, "empty-archimedean-local-correction")
    gcd_values: list[str] = []
    epsilon_data: list[dict[str, str]] = []
    for index in range(len(chain) - 1):
        raw_pairs = [
            _rational_pair(value)
            for value in chain[index + 1].raw_coordinates_before_normalization()
        ]
        if any(denominator != 1 for _numerator, denominator in raw_pairs):
            answer = {"status": "unavailable-nonintegral-raw-duplication"}
            if cache_key is not None:
                context._local_corrections[cache_key] = answer
            return answer
        raw = tuple(numerator for numerator, _denominator in raw_pairs)
        content = 0
        for value in raw:
            content = _gcd(content, value)
        raw_height = max(abs(value) for value in raw)
        source_height = chain[index].naive_height_integer()
        weight = RealBall(4 ** (index + 1), precision_bits=precision)
        finite_term = field.log_integer(content) / weight
        archimedean_term = (
            field.log_integer(source_height) * RealBall(4)
            - field.log_integer(raw_height)
        ) / weight
        finite = finite + finite_term
        archimedean = archimedean + archimedean_term
        gcd_values.append(str(content))
        epsilon_data.append(
            {
                "step": str(index),
                "raw_content": str(content),
                "source_height": str(source_height),
                "raw_height": str(raw_height),
            }
        )

    steps = len(chain) - 1
    discriminant_bound = 16 * abs(int(str(jacobian.f().discriminant())))
    finite_tail = field.log_integer(discriminant_bound) / RealBall(
        3 * 4**steps, precision_bits=precision
    )
    # The automatic lower bound is exactly -log(A_delta)/3. Its scaled
    # version bounds the remaining real-place tail below. Removing the
    # finite log(D)/3 contribution from the automatic upper bound gives the
    # corresponding real-place upper tail.
    archimedean_tail_lower = bounds.correction_lower / RealBall(
        4**steps, precision_bits=precision
    )
    archimedean_global_upper = bounds.correction_upper - field.log_integer(
        discriminant_bound
    ) / RealBall(3, precision_bits=precision)
    archimedean_tail_upper = archimedean_global_upper / RealBall(
        4**steps, precision_bits=precision
    )
    answer = {
        "status": "certified-partial-sums-and-tails",
        "finite_partial": finite.to_dict(),
        "finite_tail_interval": RealBall(
            0,
            finite_tail.upper,
            precision_bits=precision,
            rigorous=True,
            source="Mueller--Stoll finite correction tail",
        ).to_dict(),
        "archimedean_partial": archimedean.to_dict(),
        "archimedean_tail_interval": RealBall(
            archimedean_tail_lower.lower,
            archimedean_tail_upper.upper,
            precision_bits=precision,
            rigorous=True,
            source="Stoll root-partition and Flynn L1 archimedean tail",
        ).to_dict(),
        "raw_duplication_gcds": tuple(gcd_values),
        "step_data": tuple(epsilon_data),
        "factorization_used": False,
        "telescoping_identity": (
            "h_K(P)-4^-n*h_K(2^nP)=finite_partial+archimedean_partial"
        ),
    }
    if cache_key is not None:
        context._local_corrections[cache_key] = answer
    return answer


def canonical_height(
    divisor: Any,
    *,
    steps: int = 6,
    precision: int = 100,
    height_difference_bound: Any = None,
    torsion_order: Any = None,
    context: HeightContext | None = None,
) -> CanonicalHeightResult:
    """Compute a genus-2 canonical-height enclosure by exact doubling.

    `height_difference_bound`, when supplied, must be a proved exact bound for
    `|h_K-hhat|`; binary floating-point values are rejected.  The default
    classical integral envelope derives a generally sharper asymmetric bound
    automatically.  Outside those two cases the returned point estimate is
    explicitly non-rigorous.
    """
    capability = exact_divisor_capability(divisor)
    capability.require()
    steps = int(steps)
    precision = int(precision)
    if steps < 0:
        raise ValueError("height doubling steps must be nonnegative")
    if precision < 16:
        raise ValueError("height precision must be at least 16 bits")
    if context is None:
        context = HeightContext(divisor.parent())
    elif context.jacobian is not divisor.parent():
        raise ValueError("the height context belongs to a different Jacobian")

    if torsion_order is not None:
        if isinstance(torsion_order, bool):
            raise TypeError("torsion_order must be a positive exact integer")
        order = int(torsion_order)
        if (
            order <= 0
            or not divisor.scalar_multiple(order, algorithm="reference").is_zero()
        ):
            raise Genus2HeightResolutionError(
                "the supplied torsion order does not annihilate the divisor",
                {"torsion_order": str(order)},
            )
        return CanonicalHeightResult(
            _zero_ball(precision, "verified-torsion-canonical-height"),
            status="exact-torsion-zero",
            steps=0,
            provenance=divisor_provenance(divisor),
            bounds=None,
            diagnostics={
                "torsion_certificate": "verified-annihilating-multiple",
                "annihilating_multiple": str(order),
                "context": context.diagnostics(),
            },
        )

    chain = context.chain(divisor, steps)
    if _find_kummer_repeat(chain):
        return CanonicalHeightResult(
            _zero_ball(precision, "exact-kummer-cycle-torsion-height"),
            status="exact-torsion-zero",
            steps=steps,
            provenance=divisor_provenance(divisor),
            bounds=None,
            diagnostics={
                "torsion_certificate": "repeated-exact-kummer-coordinate",
                "context": context.diagnostics(),
            },
        )

    terminal = chain[steps]
    height_integer = terminal.naive_height_integer()
    field = context.field(precision)
    naive_height = field.log_integer(height_integer)
    scale = RealBall(4**steps, precision_bits=precision)
    bounds = None
    if height_difference_bound is not None:
        absolute = _exact_ball(
            height_difference_bound,
            precision,
            "caller-supplied-proved-absolute-height-difference-bound",
        )
        bounds = AutomaticHeightBounds(
            -absolute,
            absolute,
            {
                "automatic_bound": "caller-supplied",
                "required_meaning": "proved |h_K-hhat| bound",
            },
        )
    else:
        bounds = context.automatic_bounds(precision)

    if bounds is None:
        estimate = naive_height / scale
        ball = RealBall(
            estimate.lower,
            estimate.upper,
            precision_bits=precision,
            rigorous=False,
            source=(
                "repeated-doubling-reference-without-global-height-difference-bound"
            ),
        )
        status = "numerical-reference"
    else:
        raw_lower = (naive_height - bounds.correction_upper) / scale
        raw_upper = (naive_height - bounds.correction_lower) / scale
        zero = _zero_ball(precision)
        lower = zero.lower if raw_lower.lower < zero.lower else raw_lower.lower
        ball = RealBall(
            lower,
            raw_upper.upper,
            precision_bits=precision,
            rigorous=True,
            source=(
                "exact Kummer repeated doubling plus certified global "
                "naive/canonical height-difference bounds"
            ),
        )
        status = "certified-enclosure"

    return CanonicalHeightResult(
        ball,
        status=status,
        steps=steps,
        provenance=divisor_provenance(divisor),
        bounds=bounds,
        diagnostics={
            "terminal_naive_height_integer": str(height_integer),
            "terminal_kummer_coordinates": tuple(
                str(value) for value in terminal.coordinates()
            ),
            "scale": str(4**steps),
            "algorithm": "direct-flynn-kummer-quartic-limit",
            "local_corrections": _local_correction_breakdown(
                context, chain, bounds, precision
            ),
            "context": context.diagnostics(),
        },
    )


class HeightPairingResult:
    """A symmetric Neron--Tate pairing matrix with proof state."""

    def __init__(
        self,
        matrix: tuple[tuple[RealBall, ...], ...],
        height_results: tuple[CanonicalHeightResult, ...],
        diagnostics: dict[str, Any],
    ) -> None:
        self.matrix = matrix
        self.height_results = height_results
        self.diagnostics = dict(diagnostics)
        self.rigorous = all(entry.rigorous for row in self.matrix for entry in row)

    def transform(self, basis_matrix: Any) -> HeightPairingResult:
        """Return `M^T H M` for an exact integral change-of-basis matrix."""
        size = len(self.matrix)
        rows = [list(row) for row in basis_matrix]
        if len(rows) != size or any(len(row) != size for row in rows):
            raise ValueError("a pairing basis transform must be square of full rank")
        integers: list[list[int]] = []
        for row in rows:
            values: list[int] = []
            for entry in row:
                if isinstance(entry, bool):
                    raise TypeError("a pairing basis transform must be integral")
                value = int(entry)
                if value != entry:
                    raise TypeError("a pairing basis transform must be integral")
                values.append(value)
            integers.append(values)
        precision = 100
        if size:
            precision = self.matrix[0][0].precision_bits
        transformed: list[list[RealBall]] = []
        for left in range(size):
            output_row: list[RealBall] = []
            for right in range(size):
                total = _zero_ball(precision)
                for first in range(size):
                    for second in range(size):
                        coefficient = integers[first][left] * integers[second][right]
                        if coefficient:
                            total = total + self.matrix[first][second] * RealBall(
                                coefficient, precision_bits=precision
                            )
                output_row.append(total)
            transformed.append(output_row)
        return HeightPairingResult(
            tuple(tuple(row) for row in transformed),
            self.height_results,
            {
                "algorithm": "exact-integral-M-transpose-H-M",
                "basis_matrix": tuple(tuple(row) for row in integers),
                "source_pairing": dict(self.diagnostics),
            },
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-height-pairing.v1",
            "normalization": "Cassels-Flynn 2Theta principal-polarization pairing",
            "convention": "<P,Q>=(hhat(P+Q)-hhat(P)-hhat(Q))/2",
            "rigorous": self.rigorous,
            "matrix": tuple(
                tuple(entry.to_dict() for entry in row) for row in self.matrix
            ),
            "diagnostics": dict(self.diagnostics),
        }

    def __getitem__(self, index: int) -> tuple[RealBall, ...]:
        return self.matrix[index]

    def __len__(self) -> int:
        return len(self.matrix)

    def __repr__(self) -> str:
        return "HeightPairingResult(" + repr(self.matrix) + ")"


def height_pairing(
    points: Any,
    *,
    steps: int = 6,
    precision: int = 100,
    height_difference_bound: Any = None,
    context: HeightContext | None = None,
) -> HeightPairingResult:
    """Return the symmetric canonical pairing on rational genus-2 divisors."""
    values = tuple(points)
    if not values:
        return HeightPairingResult((), (), {"algorithm": "empty-pairing"})
    jacobian = values[0].parent()
    for value in values:
        if value.parent() is not jacobian:
            raise ValueError("all pairing points must lie on the same Jacobian")
    if context is None:
        context = HeightContext(jacobian)
    diagonal = tuple(
        canonical_height(
            value,
            steps=steps,
            precision=precision,
            height_difference_bound=height_difference_bound,
            context=context,
        )
        for value in values
    )
    two = RealBall(2, precision_bits=int(precision))
    matrix: list[list[RealBall]] = [
        [_zero_ball(int(precision)) for _right in values] for _left in values
    ]
    off_diagonal: list[dict[str, Any]] = []
    for left, _left_value in enumerate(values):
        matrix[left][left] = diagonal[left].ball
        for right in range(left + 1, len(values)):
            sum_height = canonical_height(
                values[left] + values[right],
                steps=steps,
                precision=precision,
                height_difference_bound=height_difference_bound,
                context=context,
            )
            entry = (sum_height.ball - diagonal[left].ball - diagonal[right].ball) / two
            matrix[left][right] = entry
            matrix[right][left] = entry
            off_diagonal.append(
                {
                    "left": left,
                    "right": right,
                    "sum_height": sum_height.to_dict(),
                }
            )
    return HeightPairingResult(
        tuple(tuple(row) for row in matrix),
        diagonal,
        {
            "algorithm": "quadratic-height-polarization",
            "steps": int(steps),
            "precision_bits": int(precision),
            "off_diagonal_height_data": tuple(off_diagonal),
            "context": context.diagnostics(),
        },
    )


def _interval_determinant(matrix: tuple[tuple[RealBall, ...], ...]) -> RealBall:
    size = len(matrix)
    if size == 0:
        return _one_ball(100, "rank-zero-regulator")
    precision = matrix[0][0].precision_bits
    states: dict[int, RealBall] = {0: _one_ball(precision)}

    def popcount(value: int) -> int:
        count = 0
        while value:
            count += value & 1
            value >>= 1
        return count

    for row in range(size):
        next_states: dict[int, RealBall] = {}
        for mask, coefficient in states.items():
            for column in range(size):
                bit = 1 << column
                if mask & bit:
                    continue
                inversions = row - popcount(mask & (bit - 1))
                term = coefficient * matrix[row][column]
                if inversions % 2:
                    term = -term
                new_mask = mask | bit
                previous = next_states.get(new_mask)
                next_states[new_mask] = term if previous is None else previous + term
        states = next_states
    return states[(1 << size) - 1]


class RegulatorResult:
    """The determinant of a computed canonical height pairing."""

    def __init__(
        self,
        ball: RealBall,
        pairing: HeightPairingResult,
        status: str,
        diagnostics: dict[str, Any],
    ) -> None:
        self.ball = ball
        self.pairing = pairing
        self.status = str(status)
        self.diagnostics = dict(diagnostics)
        self.rigorous = bool(ball.rigorous)

    def transform_index(self, index: Any) -> RegulatorResult:
        """Scale for a subgroup basis of determinant/index `index`."""
        if isinstance(index, bool):
            raise TypeError("a subgroup index must be a positive exact integer")
        value = int(index)
        if value <= 0 or value != index:
            raise ValueError("a subgroup index must be a positive exact integer")
        scaled = self.ball * RealBall(
            value * value, precision_bits=self.ball.precision_bits
        )
        return RegulatorResult(
            scaled,
            self.pairing,
            self.status,
            {
                "algorithm": "regulator-index-square-scaling",
                "subgroup_index": str(value),
                "source_regulator": dict(self.diagnostics),
            },
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-regulator.v1",
            "status": self.status,
            "rigorous": self.rigorous,
            "rank": len(self.pairing),
            "enclosure": self.ball.to_dict(),
            "pairing": self.pairing.to_dict(),
            "diagnostics": dict(self.diagnostics),
        }

    def __repr__(self) -> str:
        return (
            "RegulatorResult(" + repr(self.ball) + ", status=" + repr(self.status) + ")"
        )


def regulator(
    points: Any,
    *,
    steps: int = 6,
    precision: int = 100,
    height_difference_bound: Any = None,
    context: HeightContext | None = None,
) -> RegulatorResult:
    """Return the canonical regulator, rejecting certified degeneracy."""
    pairing = height_pairing(
        points,
        steps=steps,
        precision=precision,
        height_difference_bound=height_difference_bound,
        context=context,
    )
    determinant = _interval_determinant(pairing.matrix)
    if pairing.rigorous and determinant.contains_zero():
        raise Genus2HeightResolutionError(
            "the certified pairing enclosure does not prove independence; "
            "increase doubling steps or supply a sharper proved height bound",
            {
                "status": "unresolved-independence",
                "determinant": determinant.to_dict(),
                "pairing": pairing.to_dict(),
            },
        )
    if determinant.is_negative():
        raise Genus2HeightResolutionError(
            "the computed pairing is provably not positive semidefinite",
            {"determinant": determinant.to_dict(), "pairing": pairing.to_dict()},
        )
    status = "certified-positive" if pairing.rigorous else "numerical-reference"
    return RegulatorResult(
        determinant,
        pairing,
        status,
        {
            "algorithm": "subset-dynamic-programming-interval-determinant",
            "pairing_rigorous": pairing.rigorous,
        },
    )


__all__ = [
    "AutomaticHeightBounds",
    "CanonicalHeightResult",
    "FiniteHeightCorrectionResult",
    "Genus2HeightCapabilityError",
    "Genus2HeightResolutionError",
    "HeightContext",
    "HeightPairingResult",
    "RegulatorResult",
    "automatic_height_bounds",
    "canonical_height",
    "factorization_free_finite_correction",
    "height_pairing",
    "regulator",
]
