r"""Certified half-integral-weight modular forms and theta constructions.

The cuspidal-space constructor implements Basmaji's exact theta-kernel
algorithm.  It deliberately uses the existing modular-symbol engine for the
integral-weight source space and ordinary exact linear algebra for the
half-integral step.  Cohen's level-$4$ Eisenstein series supplies an
independent constructive family and a useful Hecke oracle.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _nonnegative(value: Any, label: str) -> int:
    result = _integer(value, label)
    if result < 0:
        raise ValueError(label + " must be nonnegative")
    return result


def _positive(value: Any, label: str) -> int:
    result = _nonnegative(value, label)
    if result == 0:
        raise ValueError(label + " must be positive")
    return result


def _isqrt(value: int) -> int:
    if value < 0:
        raise ValueError("integer square root requires a nonnegative integer")
    if value < 2:
        return value
    previous = value
    current = (previous + 1) // 2
    while current < previous:
        previous = current
        current = (current + value // current) // 2
    return previous


def _is_squarefree(value: int) -> bool:
    if value <= 0:
        return False
    for _prime, raw_exponent in _global("factor")(value):
        if _integer(raw_exponent, "factor exponent") > 1:
            return False
    return True


def _integer_divisors(value: int) -> list[int]:
    return [_integer(divisor, "divisor") for divisor in _global("divisors")(value)]


def _coerce_character_value(character: Any, value: int, target: Any) -> Any:
    evaluated = character(value)
    if target is sage.QQ or target is sage.ZZ:
        if evaluated.is_zero():
            return target(0)
        if evaluated.is_one():
            return target(1)
        if (-evaluated).is_one():
            return target(-1)
        raise ArithmeticError("the character value does not lie in the base ring")
    return target(evaluated)


def _series_from_rows(
    rows: Any, target: Any, precision: int, variable: str
) -> list[Any]:
    ring = _global("PowerSeriesRing")(
        target,
        variable,
        default_prec=max(1, precision),
    )
    return [ring(list(row)).add_bigoh(precision) for row in rows]


def _standard_theta_coefficients(
    kind: str,
    precision: int,
    target: Any,
) -> list[Any]:
    coefficients = [target(0) for _index in range(precision)]
    if kind == "theta":
        if precision:
            coefficients[0] = target(1)
        value = 1
        while value * value < precision:
            coefficients[value * value] = target(2)
            value += 1
        return coefficients
    if kind == "theta2":
        value = 1
        while value * value < precision:
            coefficients[value * value] = target(1)
            value += 2
        return coefficients
    raise ValueError("unknown theta-series family")


class UnaryThetaSeriesCertificate:
    r"""Replayable certificate for one of Basmaji's unary theta series."""

    def __init__(
        self,
        kind: str,
        precision: int,
        target: Any,
        variable: str,
    ) -> None:
        self._kind = kind
        self._precision = precision
        self._target = target
        self._variable = variable
        self._coefficients = tuple(
            _standard_theta_coefficients(kind, precision, target)
        )
        self._verified = self._verify()
        runtime.object.freeze(self)

    def family(self) -> str:
        return self._kind

    def level(self) -> int:
        return 4 if self._kind == "theta" else 16

    def weight(self) -> Any:
        return sage.QQ(1) / 2

    def precision(self) -> int:
        return self._precision

    def formula(self) -> str:
        if self._kind == "theta":
            return "sum_(n in ZZ) q^(n^2)"
        return "sum_(n >= 1, n odd) q^(n^2)"

    def provenance(self) -> str:
        return "Basmaji theta-kernel building block"

    def q_expansion(self) -> Any:
        return _series_from_rows(
            [self._coefficients],
            self._target,
            self._precision,
            self._variable,
        )[0]

    def _verify(self) -> bool:
        replay = _standard_theta_coefficients(
            self._kind,
            self._precision,
            self._target,
        )
        return tuple(replay) == self._coefficients

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def __repr__(self) -> str:
        return (
            "Verified unary theta-series certificate for "
            + self._kind
            + " through O(q^"
            + str(self._precision)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


def theta_qexp_certificate(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> UnaryThetaSeriesCertificate:
    r"""Return a replayable certificate for $\sum_{n\in\ZZ}q^{n^2}$."""
    if "var" in opts:
        variable = opts["var"]
    if "ρσ_py_var" in opts:
        variable = opts["ρσ_py_var"]
    precision = _nonnegative(prec, "precision")
    target = sage.ZZ if K is None else K
    return UnaryThetaSeriesCertificate("theta", precision, target, variable)


def theta2_qexp_certificate(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> UnaryThetaSeriesCertificate:
    r"""Return a replayable certificate for $\sum_{n>0,\ n\text{ odd}}q^{n^2}$."""
    if "var" in opts:
        variable = opts["var"]
    if "ρσ_py_var" in opts:
        variable = opts["ρσ_py_var"]
    precision = _nonnegative(prec, "precision")
    target = sage.ZZ if K is None else K
    return UnaryThetaSeriesCertificate("theta2", precision, target, variable)


def theta_qexp(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> Any:
    r"""Return $\Theta_3=\sum_{n\in\ZZ}q^{n^2}$ exactly."""
    return theta_qexp_certificate(prec, K, variable, **opts).q_expansion()


def theta2_qexp(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> Any:
    r"""Return $\Theta_2=\sum_{n>0,\ n\text{ odd}}q^{n^2}$ exactly."""
    return theta2_qexp_certificate(prec, K, variable, **opts).q_expansion()


def _bernoulli_polynomial(index: int, value: Any) -> Any:
    answer = sage.QQ(0)
    bernoulli = _global("bernoulli")
    binomial = _global("binomial")
    for degree in range(index + 1):
        bernoulli_value = sage.QQ(-1) / 2 if degree == 1 else bernoulli(degree)
        answer += binomial(index, degree) * bernoulli_value * value ** (index - degree)
    return answer


def _quadratic_generalized_bernoulli(index: int, discriminant: int) -> Any:
    if discriminant == 1:
        return _global("bernoulli")(index)
    conductor = abs(discriminant)
    answer = sage.QQ(0)
    for residue in range(1, conductor + 1):
        character_value = _global("kronecker")(discriminant, residue)
        if character_value:
            answer += character_value * _bernoulli_polynomial(
                index,
                sage.QQ(residue) / conductor,
            )
    return conductor ** (index - 1) * answer


def _cohen_discriminant_and_conductor(signed_index: int) -> tuple[int, int] | None:
    if signed_index % 4 not in (0, 1):
        return None
    sign = -1 if signed_index < 0 else 1
    remaining = abs(signed_index)
    squarefree = 1
    for raw_prime, raw_exponent in _global("factor")(remaining):
        prime = _integer(raw_prime, "prime")
        exponent = _integer(raw_exponent, "factor exponent")
        if exponent % 2:
            squarefree *= prime
    squarefree *= sign
    discriminant = squarefree if squarefree % 4 == 1 else 4 * squarefree
    quotient = signed_index // discriminant
    if quotient < 0:
        return None
    conductor = _isqrt(quotient)
    if conductor * conductor != quotient:
        raise ArithmeticError("Cohen coefficient discriminant decomposition failed")
    return discriminant, conductor


def _cohen_coefficient(r: int, index: int) -> Any:
    if index == 0:
        return -_global("bernoulli")(2 * r) / (2 * r)
    decomposition = _cohen_discriminant_and_conductor((-1 if r % 2 else 1) * index)
    if decomposition is None:
        return sage.QQ(0)
    discriminant, conductor = decomposition
    l_value = -_quadratic_generalized_bernoulli(r, discriminant) / r
    divisor_sum = sage.QQ(0)
    for raw_divisor in _global("divisors")(conductor):
        divisor = _integer(raw_divisor, "divisor")
        divisor_sum += (
            _global("moebius")(divisor)
            * _global("kronecker")(discriminant, divisor)
            * divisor ** (r - 1)
            * _global("sigma")(conductor // divisor, 2 * r - 1)
        )
    return l_value * divisor_sum


class CohenEisensteinSeriesCertificate:
    r"""Replayable coefficient-formula certificate for Cohen's series."""

    def __init__(self, r: int, precision: int, variable: str) -> None:
        self._r = r
        self._precision = precision
        self._variable = variable
        self._coefficients = tuple(
            _cohen_coefficient(r, index) for index in range(precision)
        )
        self._verified = self._verify()
        runtime.object.freeze(self)

    def weight(self) -> Any:
        return sage.QQ(2 * self._r + 1) / 2

    def level(self) -> int:
        return 4

    def precision(self) -> int:
        return self._precision

    def normalization(self) -> str:
        return "cohen"

    def provenance(self) -> str:
        return "Cohen's exact L-value and divisor-sum coefficient formula"

    def q_expansion(self) -> Any:
        return _series_from_rows(
            [self._coefficients],
            sage.QQ,
            self._precision,
            self._variable,
        )[0]

    def has_kohnen_plus_support(self) -> bool:
        sign = -1 if self._r % 2 else 1
        for index in range(1, self._precision):
            if (sign * index) % 4 not in (0, 1) and self._coefficients[index] != 0:
                return False
        return True

    def hecke_eigenvalue(self, prime: Any) -> Any:
        p = _positive(prime, "prime")
        if not _global("is_prime")(p):
            raise ValueError("prime must be prime")
        return sage.ZZ(1) + sage.ZZ(p) ** (2 * self._r - 1)

    def _verify(self) -> bool:
        replay = tuple(
            _cohen_coefficient(self._r, index) for index in range(self._precision)
        )
        return replay == self._coefficients and self.has_kohnen_plus_support()

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def __repr__(self) -> str:
        return (
            "Verified Cohen Eisenstein-series certificate in weight "
            + str(self.weight())
            + " through O(q^"
            + str(self._precision)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


def cohen_eisenstein_series_certificate(
    r: Any,
    prec: Any = 20,
    variable: str = "q",
    **opts: Any,
) -> CohenEisensteinSeriesCertificate:
    r"""Certify Cohen's Eisenstein series of weight $r+\tfrac12$."""
    index = _integer(r, "r")
    if index < 2:
        raise ValueError("r must be at least 2")
    if "var" in opts:
        variable = opts["var"]
    if "ρσ_py_var" in opts:
        variable = opts["ρσ_py_var"]
    return CohenEisensteinSeriesCertificate(
        index,
        _nonnegative(prec, "precision"),
        variable,
    )


def cohen_eisenstein_series_qexp(
    r: Any,
    prec: Any = 20,
    variable: str = "q",
    normalization: str = "cohen",
    **opts: Any,
) -> Any:
    r"""Return Cohen's exact Eisenstein series of weight $r+\tfrac12$.

    The default normalization has constant coefficient $\zeta(1-2r)$.
    `normalization="constant"` scales a nonzero series to constant term $1$.
    """
    certificate = cohen_eisenstein_series_certificate(r, prec, variable, **opts)
    series = certificate.q_expansion()
    if normalization == "cohen":
        return series
    if normalization == "constant":
        return series / series[0]
    raise ValueError("normalization must be 'cohen' or 'constant'")


def _series_coefficients(series: Any, precision: int) -> list[Any]:
    return [series[index] for index in range(precision)]


def _formal_divide_by_theta(
    numerator: list[Any],
    target: Any,
) -> list[Any]:
    precision = len(numerator)
    theta = _standard_theta_coefficients("theta", precision, target)
    quotient = [target(0) for _index in range(precision)]
    for index in range(precision):
        value = numerator[index]
        for shift in range(1, index + 1):
            if theta[shift] != 0:
                value -= theta[shift] * quotient[index - shift]
        quotient[index] = value
    return quotient


def _basmaji_character(character: Any, numerator: int) -> Any:
    psi = None
    for candidate in character.parent():
        if (
            _integer(candidate.conductor(), "character conductor") == 4
            and candidate.order() == 2
            and candidate.is_odd()
        ):
            psi = candidate
            break
    if psi is None:
        raise ArithmeticError("the induced nontrivial character modulo 4 is missing")
    return character * psi ** ((numerator + 1) // 2)


def _basmaji_data(
    space: Any,
    precision: int,
) -> tuple[Any, Any, Any, Any, Any, int]:
    target = space.base_ring()
    relation_bound = space.relation_sturm_bound()
    work_precision = max(precision, relation_bound + 1)
    epsilon = _basmaji_character(space.character(), space.weight_numerator())
    source = _global("ModularSymbols")(
        epsilon,
        (space.weight_numerator() + 1) // 2,
        sign=1,
    ).cuspidal_submodule()
    source_certificate = source.q_expansion_basis_certificate(work_precision)
    source_basis = source_certificate.basis()
    source_coefficients = [
        _series_coefficients(series, work_precision) for series in source_basis
    ]
    theta2 = _standard_theta_coefficients("theta2", work_precision, target)
    theta = _standard_theta_coefficients("theta", work_precision, target)
    relation_rows = []
    for coefficients in source_coefficients:
        product = [target(0) for _index in range(work_precision)]
        for index in range(work_precision):
            total = target(0)
            for shift in range(index + 1):
                if theta2[shift] != 0:
                    total += theta2[shift] * coefficients[index - shift]
            product[index] = total
        relation_rows.append(product)
    for coefficients in source_coefficients:
        product = [target(0) for _index in range(work_precision)]
        for index in range(work_precision):
            total = target(0)
            for shift in range(index + 1):
                if theta[shift] != 0:
                    total -= theta[shift] * coefficients[index - shift]
            product[index] = total
        relation_rows.append(product)
    matrix = _global("matrix")
    relation_matrix = matrix(target, relation_rows)
    kernel_matrix = relation_matrix.left_kernel_matrix()
    quotient_rows = []
    source_dimension = len(source_coefficients)
    for kernel_row in kernel_matrix.rows():
        numerator = [target(0) for _index in range(work_precision)]
        for basis_index in range(source_dimension):
            scalar = kernel_row[basis_index]
            if scalar != 0:
                for exponent in range(work_precision):
                    numerator[exponent] += (
                        scalar * source_coefficients[basis_index][exponent]
                    )
        quotient_rows.append(_formal_divide_by_theta(numerator, target))
    # Preserve Basmaji's kernel-basis ordering.  This is the convention used
    # by SageMath's public function and is deterministic because the exact
    # left-kernel implementation returns a canonical echelon basis.
    coefficient_matrix = matrix(target, quotient_rows)
    return (
        source,
        source_certificate,
        relation_matrix,
        kernel_matrix,
        coefficient_matrix,
        work_precision,
    )


class HalfIntegralWeightBasisCertificate:
    r"""Replayable Basmaji kernel and Sturm certificate for a cusp basis."""

    def __init__(self, space: Any, precision: int) -> None:
        self._space = space
        (
            self._source_space,
            self._source_certificate,
            self._relation_matrix,
            self._kernel_matrix,
            self._coefficient_matrix,
            self._precision,
        ) = _basmaji_data(space, precision)
        self._verified = self._verify()
        runtime.object.freeze(self)

    def space(self) -> Any:
        return self._space

    def source_space(self) -> Any:
        return self._source_space

    def source_certificate(self) -> Any:
        return self._source_certificate

    def relation_matrix(self) -> Any:
        return self._relation_matrix

    def kernel_matrix(self) -> Any:
        return self._kernel_matrix

    def coefficient_matrix(self) -> Any:
        return self._coefficient_matrix

    def precision(self) -> int:
        return self._precision

    def dimension(self) -> int:
        return self._coefficient_matrix.nrows()

    def sturm_bound(self) -> int:
        return self._space.sturm_bound()

    def relation_sturm_bound(self) -> int:
        return self._space.relation_sturm_bound()

    def algorithm(self) -> str:
        return "basmaji-theta-kernel"

    def provenance(self) -> str:
        return "Basmaji, Essen thesis, page 55; SageMath half_integral.py"

    def q_expansion_basis(
        self,
        prec: Any = None,
        variable: str = "q",
    ) -> list[Any]:
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        if precision <= self._precision:
            rows = [list(row)[:precision] for row in self._coefficient_matrix.rows()]
            return _series_from_rows(rows, self._space.base_ring(), precision, variable)
        return self._space.q_expansion_basis(precision, variable=variable)

    basis = q_expansion_basis

    def is_sturm_certified(self) -> bool:
        return (
            self._precision > self.relation_sturm_bound()
            and self._source_certificate.is_sturm_certified()
        )

    def _verify(self) -> bool:
        if not self._source_certificate.verify():
            return False
        if self._relation_matrix.left_kernel_matrix() != self._kernel_matrix:
            return False
        if self._kernel_matrix.nrows() != self._coefficient_matrix.nrows():
            return False
        if self._coefficient_matrix.rank() != self._coefficient_matrix.nrows():
            return False
        if not self.is_sturm_certified():
            return False
        relation_cutoff = self.relation_sturm_bound() + 1
        zero = self._space.base_ring()(0)
        for row in self._kernel_matrix.rows():
            for column in range(relation_cutoff):
                total = zero
                for index in range(self._relation_matrix.nrows()):
                    total += row[index] * self._relation_matrix[index, column]
                if total != 0:
                    return False
        (
            _replay_source,
            replay_source_certificate,
            replay_relation,
            replay_kernel,
            replay_coefficients,
            replay_precision,
        ) = _basmaji_data(self._space, self._precision)
        return (
            replay_source_certificate.coefficient_matrix()
            == self._source_certificate.coefficient_matrix()
            and replay_relation == self._relation_matrix
            and replay_kernel == self._kernel_matrix
            and replay_coefficients == self._coefficient_matrix
            and replay_precision == self._precision
        )

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def __repr__(self) -> str:
        return (
            "Sturm-certified Basmaji half-integral cusp basis of dimension "
            + str(self.dimension())
            + " in weight "
            + str(self._space.weight())
        )

    __str__ = __repr__
    toString = __repr__


def half_integral_weight_hecke_qexp(
    series: Any,
    k: Any,
    p: Any,
    chi: Any = None,
    prec: Any = None,
    variable: str = "q",
) -> Any:
    r"""Apply $T_{p^2}$ to a weight-$k/2$ expansion.

    Only odd good primes are accepted.  The input must contain the
    coefficients through $p^2(\mathrm{prec}-1)$ required by Shimura's exact
    coefficient formula.
    """
    numerator = _positive(k, "weight numerator")
    prime = _positive(p, "prime")
    if numerator < 3 or numerator % 2 == 0:
        raise ValueError("the weight numerator must be odd and at least 3")
    if prime == 2 or not _global("is_prime")(prime):
        raise ValueError("p must be an odd prime")
    if chi is not None and _integer(chi.modulus(), "character modulus") % prime == 0:
        raise ValueError("p must not divide the character modulus")
    input_precision = _integer(series.precision_absolute(), "input precision")
    maximum_precision = (
        0 if input_precision == 0 else (input_precision - 1) // (prime * prime) + 1
    )
    output_precision = (
        maximum_precision if prec is None else _nonnegative(prec, "precision")
    )
    if output_precision > maximum_precision:
        raise ValueError("the input q-expansion has insufficient precision")
    target = series.parent().base_ring()
    character_p = (
        target(1) if chi is None else _coerce_character_value(chi, prime, target)
    )
    character_p2 = (
        target(1)
        if chi is None
        else _coerce_character_value(chi, prime * prime, target)
    )
    exponent = (numerator - 1) // 2
    sign = -1 if exponent % 2 else 1
    coefficients = []
    for index in range(output_precision):
        value = series[prime * prime * index]
        symbol = _global("kronecker")(sign * index, prime)
        if symbol:
            value += (
                character_p * symbol * sage.ZZ(prime) ** (exponent - 1) * series[index]
            )
        if index % (prime * prime) == 0:
            value += (
                character_p2
                * sage.ZZ(prime) ** (numerator - 2)
                * series[index // (prime * prime)]
            )
        coefficients.append(value)
    return _series_from_rows([coefficients], target, output_precision, variable)[0]


def shimura_lift_qexp(
    series: Any,
    k: Any,
    t: Any = 1,
    chi: Any = None,
    level: Any = None,
    prec: Any = None,
    variable: str = "q",
) -> Any:
    r"""Return the exact cuspidal Shimura lift attached to squarefree $t$.

    Here `series` has weight $k/2$. This bounded coefficient-level API
    requires a cuspidal input and a positive squarefree $t$. Its output has
    weight $k-1$.
    """
    numerator = _positive(k, "weight numerator")
    squarefree_index = _positive(t, "Shimura index")
    if numerator < 3 or numerator % 2 == 0:
        raise ValueError("the weight numerator must be odd and at least 3")
    if not _is_squarefree(squarefree_index):
        raise ValueError("the Shimura index must be positive and squarefree")
    if series[0] != 0:
        raise NotImplementedError(
            "the bounded Shimura lift currently requires a cusp form"
        )
    if level is None:
        if chi is None:
            raise ValueError("level is required when chi is omitted")
        source_level = _positive(chi.modulus(), "character modulus")
    else:
        source_level = _positive(level, "level")
    if source_level % 4:
        raise ValueError("the half-integral source level must be divisible by 4")
    if chi is not None and source_level % _positive(chi.modulus(), "character modulus"):
        raise ValueError("the character modulus must divide the source level")
    input_precision = _integer(series.precision_absolute(), "input precision")
    maximum_precision = (
        0
        if input_precision == 0
        else _isqrt((input_precision - 1) // squarefree_index) + 1
    )
    output_precision = (
        maximum_precision if prec is None else _nonnegative(prec, "precision")
    )
    if output_precision > maximum_precision:
        raise ValueError("the input q-expansion has insufficient precision")
    target = series.parent().base_ring()
    exponent = (numerator - 1) // 2
    signed_index = -squarefree_index if exponent % 2 else squarefree_index
    excluded = (
        source_level
        // _integer(_global("gcd")(source_level, squarefree_index), "gcd")
        * squarefree_index
    )
    coefficients = [target(0)] if output_precision else []
    for index in range(1, output_precision):
        total = target(0)
        for divisor in _integer_divisors(index):
            if _global("gcd")(divisor, excluded) != 1:
                continue
            character_value = (
                target(1)
                if chi is None
                else _coerce_character_value(chi, divisor, target)
            )
            symbol = _global("kronecker")(signed_index, divisor)
            if symbol:
                quotient = index // divisor
                total += (
                    character_value
                    * symbol
                    * sage.ZZ(divisor) ** (exponent - 1)
                    * series[squarefree_index * quotient * quotient]
                )
        coefficients.append(total)
    return _series_from_rows([coefficients], target, output_precision, variable)[0]


def _kohnen_plus_epsilon(space: Any) -> int:
    level_fourth = space.level() // 4
    character = space.character()
    conductor = _integer(character.conductor(), "character conductor")
    if level_fourth % conductor == 0:
        epsilon = 1
    else:
        twisted = _basmaji_character(character, 1)
        twisted_conductor = _integer(twisted.conductor(), "twisted conductor")
        if level_fourth % twisted_conductor:
            raise ValueError(
                "neither chi nor chi*(-4/.) has conductor dividing level/4"
            )
        epsilon = -1
    if ((space.weight_numerator() - 1) // 2) % 2:
        epsilon = -epsilon
    return epsilon


class KohnenPlusBasisCertificate:
    r"""Replayable forbidden-coefficient kernel certificate for $S^+_{k/2}$."""

    def __init__(self, space: Any, precision: int) -> None:
        self._space = space
        self._epsilon = _kohnen_plus_epsilon(space)
        self._bound = (
            space.weight_numerator()
            * _global("Gamma0")(4 * space.level()).index()
            // 24
        )
        self._precision = max(precision, self._bound + 1)
        ambient = space.q_expansion_basis_certificate(self._precision)
        self._ambient_certificate = ambient
        ambient_matrix = ambient.coefficient_matrix()
        forbidden = [
            index
            for index in range(1, self._bound + 1)
            if index % 4 in (2, (2 + self._epsilon) % 4)
        ]
        matrix = _global("matrix")
        obstruction = matrix(
            space.base_ring(),
            [
                [ambient_matrix[row, column] for column in forbidden]
                for row in range(ambient_matrix.nrows())
            ],
        )
        self._forbidden = tuple(forbidden)
        self._obstruction_matrix = obstruction
        self._kernel_matrix = obstruction.left_kernel_matrix()
        self._coefficient_matrix = self._kernel_matrix * ambient_matrix
        self._verified = self._verify()
        runtime.object.freeze(self)

    def ambient_certificate(self) -> Any:
        return self._ambient_certificate

    def epsilon(self) -> int:
        return self._epsilon

    def sturm_bound(self) -> int:
        return self._bound

    def precision(self) -> int:
        return self._precision

    def dimension(self) -> int:
        return self._kernel_matrix.nrows()

    def forbidden_indices(self) -> tuple[int, ...]:
        return self._forbidden

    def ambient_basis_matrix(self) -> Any:
        return self._kernel_matrix

    def obstruction_matrix(self) -> Any:
        return self._obstruction_matrix

    def coefficient_matrix(self) -> Any:
        return self._coefficient_matrix

    def q_expansion_basis(self, prec: Any = None, variable: str = "q") -> list[Any]:
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        if precision > self._precision:
            return self._space.kohnen_plus_subspace(precision).q_expansion_basis(
                precision, variable
            )
        rows = [list(row)[:precision] for row in self._coefficient_matrix.rows()]
        return _series_from_rows(rows, self._space.base_ring(), precision, variable)

    basis = q_expansion_basis

    def _verify(self) -> bool:
        if not self._ambient_certificate.verify():
            return False
        if self._kernel_matrix * self._obstruction_matrix != 0:
            return False
        if self._coefficient_matrix.rank() != self._kernel_matrix.nrows():
            return False
        zero = self._space.base_ring()(0)
        for row in self._coefficient_matrix.rows():
            for index in self._forbidden:
                if row[index] != zero:
                    return False
        return self._precision > self._bound

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def __repr__(self) -> str:
        return (
            "Sturm-certified Kohnen plus basis of dimension "
            + str(self.dimension())
            + " in weight "
            + str(self._space.weight())
        )

    __str__ = __repr__
    toString = __repr__


class KohnenPlusSpace:
    r"""The certified Kohnen $+$-subspace of a Basmaji cusp space."""

    def __init__(self, ambient: Any, precision: int) -> None:
        self._ambient = ambient
        self._precision = precision
        self._certificate_cache = runtime.map()
        self._hecke_cache = runtime.map()
        self._shimura_cache = runtime.map()
        runtime.object.freeze(self)

    def ambient_space(self) -> Any:
        return self._ambient

    def level(self) -> int:
        return self._ambient.level()

    def weight(self) -> Any:
        return self._ambient.weight()

    def weight_numerator(self) -> int:
        return self._ambient.weight_numerator()

    def character(self) -> Any:
        return self._ambient.character()

    def base_ring(self) -> Any:
        return self._ambient.base_ring()

    def basis_certificate(self, prec: Any = None) -> KohnenPlusBasisCertificate:
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        cached = self._certificate_cache.get(precision)
        if cached is not runtime.undefined:
            return cached
        certificate = KohnenPlusBasisCertificate(self._ambient, precision)
        self._certificate_cache.set(precision, certificate)
        return certificate

    q_expansion_basis_certificate = basis_certificate

    def dimension(self) -> int:
        return self.basis_certificate().dimension()

    def q_expansion_basis(self, prec: Any = None, variable: str = "q") -> list[Any]:
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        return self.basis_certificate(precision).q_expansion_basis(precision, variable)

    basis = q_expansion_basis

    def hecke_matrix(self, index: Any) -> Any:
        hecke_index = _positive(index, "Hecke index")
        cached = self._hecke_cache.get(hecke_index)
        if cached is not runtime.undefined:
            return cached
        inclusion = self.basis_certificate().ambient_basis_matrix()
        images = inclusion * self._ambient.hecke_matrix(hecke_index)
        result = inclusion.solve_left(images)
        if result * inclusion != images:
            raise ArithmeticError(
                "the Hecke operator did not preserve the Kohnen plus space"
            )
        self._hecke_cache.set(hecke_index, result)
        return result

    T = hecke_matrix
    hecke_operator = hecke_matrix

    def shimura_lift_basis(
        self, t: Any = 1, prec: Any = None, variable: str = "q"
    ) -> list[Any]:
        squarefree_index = _positive(t, "Shimura index")
        if prec is None:
            if _integer(self.character().order(), "character order") != 1:
                raise NotImplementedError(
                    "automatic Shimura target precision currently requires "
                    "trivial character"
                )
            target = _global("CuspForms")(
                self.level() // 4, self.weight_numerator() - 1
            )
            output_precision = max(2, target.sturm_bound())
        else:
            output_precision = _nonnegative(prec, "precision")
        input_precision = squarefree_index * (output_precision - 1) ** 2 + 1
        return [
            shimura_lift_qexp(
                form,
                self.weight_numerator(),
                squarefree_index,
                self.character(),
                self.level(),
                output_precision,
                variable,
            )
            for form in self.q_expansion_basis(input_precision, variable)
        ]

    def shimura_lift_matrix(self, t: Any = 1) -> Any:
        return self.shimura_lift_certificate(t).matrix()

    def shimura_lift_certificate(self, t: Any = 1) -> Any:
        squarefree_index = _positive(t, "Shimura index")
        cached = self._shimura_cache.get(squarefree_index)
        if cached is not runtime.undefined:
            return cached
        if _integer(self.character().order(), "character order") != 1:
            raise NotImplementedError(
                "certified target coordinates currently require trivial character"
            )
        certificate = ShimuraLiftCertificate(self, squarefree_index)
        self._shimura_cache.set(squarefree_index, certificate)
        return certificate

    def __repr__(self) -> str:
        return (
            "Kohnen plus subspace of dimension "
            + str(self.dimension())
            + " in weight "
            + str(self.weight())
            + " and level "
            + str(self.level())
        )

    __str__ = __repr__
    toString = __repr__


class ShimuraLiftCertificate:
    r"""Sturm and Hecke certificate for a Kohnen-plus Shimura map."""

    def __init__(self, source: Any, squarefree_index: int) -> None:
        self._source = source
        self._index = squarefree_index
        self._target = _global("CuspForms")(
            source.level() // 4, source.weight_numerator() - 1
        )
        self._precision = max(2, self._target.sturm_bound())
        self._images = tuple(
            source.shimura_lift_basis(squarefree_index, self._precision)
        )
        target_basis = self._target.q_expansion_basis(self._precision)
        matrix = _global("matrix")
        self._target_coefficients = matrix(
            source.base_ring(),
            [
                [form[index] for index in range(self._precision)]
                for form in target_basis
            ],
        )
        self._image_coefficients = matrix(
            source.base_ring(),
            [
                [form[index] for index in range(self._precision)]
                for form in self._images
            ],
        )
        self._matrix = self._target_coefficients.solve_left(self._image_coefficients)
        self._verified = self._verify()
        runtime.object.freeze(self)

    def source_space(self) -> Any:
        return self._source

    def target_space(self) -> Any:
        return self._target

    def squarefree_index(self) -> int:
        return self._index

    def precision(self) -> int:
        return self._precision

    def matrix(self) -> Any:
        return self._matrix

    def image_basis(self) -> tuple[Any, ...]:
        return self._images

    def _verify(self) -> bool:
        if self._matrix * self._target_coefficients != self._image_coefficients:
            raise ArithmeticError(
                "the Shimura lift did not lie in the target cusp space"
            )
        return self._precision >= self._target.sturm_bound()

    def verify_hecke(self, prime: Any) -> bool:
        p = _positive(prime, "prime")
        if p == 2 or not _global("is_prime")(p):
            raise ValueError("p must be an odd prime")
        if self._source.level() % p == 0:
            raise ValueError("p must not divide the source level")
        source_operator = self._source.hecke_matrix(p * p)
        target_operator = self._target._modular_symbols_cusp_space().hecke_matrix(p)
        return source_operator * self._matrix == self._matrix * target_operator

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def __repr__(self) -> str:
        return (
            "Sturm-certified Shimura lift from weight "
            + str(self._source.weight())
            + " to weight "
            + str(self._source.weight_numerator() - 1)
        )

    __str__ = __repr__
    toString = __repr__


class HalfIntegralWeightModularFormsSpace:
    r"""A certified Basmaji cusp space of weight $k/2$ and character $\chi$."""

    def __init__(self, character: Any, numerator: int, precision: int) -> None:
        if not all(
            hasattr(character, method)
            for method in ["modulus", "parent", "order", "is_even"]
        ):
            raise TypeError("chi must be a Dirichlet character")
        modulus = _integer(character.modulus(), "character modulus")
        if modulus % 16:
            raise ValueError("the character modulus must be divisible by 16")
        if numerator < 3 or numerator % 2 == 0:
            raise ValueError("the weight numerator must be odd and at least 3")
        self._kind = "HalfIntegralWeightModularFormsSpace"
        self._character = character
        self._numerator = numerator
        self._precision = precision
        epsilon = _basmaji_character(character, numerator)
        self._base = _global("ModularSymbols")(
            epsilon,
            (numerator + 1) // 2,
            sign=1,
        ).base_ring()
        self._certificate_cache = runtime.map()
        self._hecke_cache = runtime.map()
        self._plus_cache = runtime.map()
        runtime.object.freeze(self)

    def character(self) -> Any:
        return self._character

    def level(self) -> int:
        return _integer(self._character.modulus(), "character modulus")

    def weight_numerator(self) -> int:
        return self._numerator

    def weight(self) -> Any:
        return sage.QQ(self._numerator) / 2

    def base_ring(self) -> Any:
        return self._base

    def is_cuspidal(self) -> bool:
        return True

    def sturm_bound(self) -> int:
        return self._numerator * _global("Gamma0")(self.level()).index() // 24

    def relation_sturm_bound(self) -> int:
        return (self._numerator + 2) * _global("Gamma0")(self.level()).index() // 24

    def q_expansion_basis_certificate(
        self,
        prec: Any = None,
    ) -> HalfIntegralWeightBasisCertificate:
        precision = (
            max(self._precision, self.relation_sturm_bound() + 1)
            if prec is None
            else max(
                _nonnegative(prec, "precision"),
                self.relation_sturm_bound() + 1,
            )
        )
        cached = self._certificate_cache.get(precision)
        if cached is not runtime.undefined:
            return cached
        certificate = HalfIntegralWeightBasisCertificate(self, precision)
        self._certificate_cache.set(precision, certificate)
        return certificate

    basis_certificate = q_expansion_basis_certificate

    def q_expansion_basis(
        self,
        prec: Any = None,
        variable: str = "q",
        **opts: Any,
    ) -> list[Any]:
        if "var" in opts:
            variable = opts["var"]
        if "ρσ_py_var" in opts:
            variable = opts["ρσ_py_var"]
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        certificate = self.q_expansion_basis_certificate(precision)
        return certificate.q_expansion_basis(precision, variable)

    basis = q_expansion_basis

    def dimension(self) -> int:
        return self.q_expansion_basis_certificate().dimension()

    def hecke_matrix(self, index: Any) -> Any:
        r"""Return the exact matrix of $T_m$ for $m=p^2$ at an odd good prime."""
        hecke_index = _positive(index, "Hecke index")
        prime = _isqrt(hecke_index)
        if prime * prime != hecke_index or prime == 2 or not _global("is_prime")(prime):
            raise NotImplementedError(
                "half-integral Hecke matrices currently require m=p^2 "
                "for an odd prime p"
            )
        if self.level() % prime == 0:
            raise NotImplementedError(
                "bad-prime half-integral Hecke operators are excluded"
            )
        cached = self._hecke_cache.get(hecke_index)
        if cached is not runtime.undefined:
            return cached
        proof_precision = self.sturm_bound() + 1
        input_precision = prime * prime * (proof_precision - 1) + 1
        basis = self.q_expansion_basis(input_precision)
        images = [
            half_integral_weight_hecke_qexp(
                form,
                self._numerator,
                prime,
                self._character,
                proof_precision,
            )
            for form in basis
        ]
        matrix = _global("matrix")
        basis_matrix = matrix(
            self._base,
            [[form[column] for column in range(proof_precision)] for form in basis],
        )
        image_matrix = matrix(
            self._base,
            [[form[column] for column in range(proof_precision)] for form in images],
        )
        result = basis_matrix.solve_left(image_matrix)
        if result * basis_matrix != image_matrix:
            raise ArithmeticError("the half-integral Hecke image left the cusp space")
        self._hecke_cache.set(hecke_index, result)
        return result

    def T(self, index: Any) -> Any:
        return self.hecke_matrix(index)

    hecke_operator = T

    def kohnen_plus_subspace(self, prec: Any = None) -> KohnenPlusSpace:
        r"""Return the certified Kohnen $+$-subspace."""
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        cached = self._plus_cache.get(precision)
        if cached is not runtime.undefined:
            return cached
        plus = KohnenPlusSpace(self, precision)
        self._plus_cache.set(precision, plus)
        return plus

    kohnen_plus_space = kohnen_plus_subspace

    def __repr__(self) -> str:
        return (
            "Cuspidal half-integral weight modular forms of dimension "
            + str(self.dimension())
            + " and weight "
            + str(self.weight())
            + " for Gamma0("
            + str(self.level())
            + ") over "
            + str(self.base_ring())
        )

    __str__ = __repr__
    toString = __repr__


def HalfIntegralWeightModularForms(
    chi: Any,
    k: Any,
    prec: Any = 10,
) -> HalfIntegralWeightModularFormsSpace:
    r"""Construct the certified cusp space $S_{k/2}(\Gamma_0(N),\chi)$."""
    return HalfIntegralWeightModularFormsSpace(
        chi,
        _integer(k, "weight numerator"),
        _nonnegative(prec, "precision"),
    )


def half_integral_weight_modform_basis(
    chi: Any,
    k: Any,
    prec: Any,
) -> list[Any]:
    """Return Sage-compatible Basmaji cusp-form expansions."""
    return HalfIntegralWeightModularForms(chi, k, prec).q_expansion_basis()


def half_integral_formula_registry() -> tuple[dict[str, Any], ...]:
    """Return the bounded, auditable Slice-6 formula registry."""
    return (
        {
            "name": "theta",
            "weight": sage.QQ(1) / 2,
            "level": 4,
            "constructor": "theta_qexp",
            "certificate": "UnaryThetaSeriesCertificate",
        },
        {
            "name": "theta2",
            "weight": sage.QQ(1) / 2,
            "level": 16,
            "constructor": "theta2_qexp",
            "certificate": "UnaryThetaSeriesCertificate",
        },
        {
            "name": "cohen-eisenstein",
            "weight": "r+1/2 for r>=2",
            "level": 4,
            "constructor": "cohen_eisenstein_series_qexp",
            "certificate": "CohenEisensteinSeriesCertificate",
        },
        {
            "name": "basmaji-cusp-space",
            "weight": "k/2 for odd k>=3",
            "level": "character modulus divisible by 16",
            "constructor": "HalfIntegralWeightModularForms",
            "certificate": "HalfIntegralWeightBasisCertificate",
        },
    )


__all__ = [
    "CohenEisensteinSeriesCertificate",
    "HalfIntegralWeightBasisCertificate",
    "HalfIntegralWeightModularForms",
    "HalfIntegralWeightModularFormsSpace",
    "UnaryThetaSeriesCertificate",
    "cohen_eisenstein_series_certificate",
    "cohen_eisenstein_series_qexp",
    "half_integral_formula_registry",
    "half_integral_weight_hecke_qexp",
    "half_integral_weight_modform_basis",
    "theta2_qexp",
    "theta2_qexp_certificate",
    "theta_qexp",
    "theta_qexp_certificate",
]
