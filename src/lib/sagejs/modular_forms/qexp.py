r"""Exact level-one modular forms and the Victor Miller basis.

The graded ring of level-one modular forms over $\QQ$ is

$$
M_*(\mathrm{SL}_2(\ZZ),\QQ)=\QQ[E_4,E_6].
$$

Elements in this module retain a homogeneous polynomial in $E_4$ and $E_6$.
Their displayed $q$-expansion is therefore a regenerable exact view, not the
mathematical representation.  The Victor Miller basis is obtained from the
standard $E_4,E_6,\Delta$ basis by exact triangular elimination.
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
    answer = _integer(value, label)
    if answer < 0:
        raise ValueError(label + " must be nonnegative")
    return answer


def _kind(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if value_type != "object" and value_type != "function":
        return runtime.undefined
    return runtime.reflect.get(value, "_kind")


def _normalize_terms(terms: Any) -> tuple[tuple[Any, int, int], ...]:
    combined: list[list[Any]] = []
    for item in terms:
        if len(item) != 3:
            raise ValueError(
                "a level-one term must be (coefficient, E4 exponent, E6 exponent)"
            )
        coefficient = sage.QQ(item[0])
        exponent_four = _nonnegative(item[1], "E4 exponent")
        exponent_six = _nonnegative(item[2], "E6 exponent")
        if coefficient == 0:
            continue
        found = False
        for stored in combined:
            if stored[1] == exponent_four and stored[2] == exponent_six:
                stored[0] += coefficient
                found = True
                break
        if not found:
            combined.append([coefficient, exponent_four, exponent_six])
    filtered = [item for item in combined if item[0] != 0]
    filtered.sort(key=lambda item: (item[1], item[2]))
    return tuple((item[0], item[1], item[2]) for item in filtered)


def _add_terms(left: Any, right: Any, sign: int = 1) -> Any:
    answer = list(left)
    for coefficient, exponent_four, exponent_six in right:
        answer.append((sign * coefficient, exponent_four, exponent_six))
    return _normalize_terms(answer)


def _scale_terms(terms: Any, scalar: Any) -> Any:
    scalar = sage.QQ(scalar)
    return _normalize_terms(
        [
            (scalar * coefficient, exponent_four, exponent_six)
            for coefficient, exponent_four, exponent_six in terms
        ]
    )


def _multiply_terms(left: Any, right: Any) -> Any:
    answer = []
    for left_coefficient, left_four, left_six in left:
        for right_coefficient, right_four, right_six in right:
            answer.append(
                (
                    left_coefficient * right_coefficient,
                    left_four + right_four,
                    left_six + right_six,
                )
            )
    return _normalize_terms(answer)


def _power_terms(terms: Any, exponent: int) -> Any:
    answer = ((sage.QQ(1), 0, 0),)
    factor = terms
    remaining = exponent
    while remaining:
        if remaining % 2 == 1:
            answer = _multiply_terms(answer, factor)
        remaining //= 2
        if remaining:
            factor = _multiply_terms(factor, factor)
    return answer


def _same_ambient(left: Any, right: Any) -> bool:
    return (
        left.level() == right.level()
        and left.weight() == right.weight()
        and left.base_ring() is right.base_ring()
        and left.group() == right.group()
    )


def _residual_exponents(weight: int) -> tuple[int, int, int]:
    residue = weight % 12
    if residue == 2:
        residue += 12
    table = {
        0: (0, 0),
        4: (1, 0),
        6: (0, 1),
        8: (2, 0),
        10: (1, 1),
        14: (2, 1),
    }
    if residue not in table:
        raise ValueError(
            "level-one modular forms require nonnegative even weight other than 2"
        )
    exponent_four, exponent_six = table[residue]
    return residue, exponent_four, exponent_six


def _ambient(weight: int, precision: int) -> Any:
    return _global("ModularForms")(
        1,
        weight,
        sage.QQ,
        True,
        precision,
    )


@runtime.lightweight_math_class
class ExactModularForm(sage.Element):
    r"""A level-one modular form with an exact formula in $E_4$ and $E_6$."""

    def __init__(
        self,
        parent: Any,
        terms: Any,
        display_precision: Any,
        provenance: str = "level-one-generators",
    ) -> None:
        if parent.level() != 1 or parent.base_ring() is not sage.QQ:
            raise NotImplementedError(
                "exact formula elements currently require level one over QQ"
            )
        self._kind = "ExactModularForm"
        self._parent = parent
        self._terms = _normalize_terms(terms)
        self._display_precision = _nonnegative(display_precision, "display precision")
        self._provenance = provenance
        expected_weight = parent.weight()
        for _coefficient, exponent_four, exponent_six in self._terms:
            if 4 * exponent_four + 6 * exponent_six != expected_weight:
                raise ValueError(
                    "the E4/E6 formula is not homogeneous of the parent weight"
                )
        runtime.object.freeze(self)

    def parent(self) -> Any:
        return self._parent

    ambient_space = parent

    def group(self) -> Any:
        return self._parent.group()

    def level(self) -> int:
        return self._parent.level()

    def weight(self) -> int:
        return self._parent.weight()

    def base_ring(self) -> Any:
        return self._parent.base_ring()

    def character(self) -> None:
        return None

    def prec(self) -> int:
        return self._display_precision

    def provenance(self) -> str:
        return self._provenance

    def construction(self) -> tuple[tuple[Any, int, int], ...]:
        return self._terms

    def formula(self) -> str:
        if len(self._terms) == 0:
            return "0"
        pieces = []
        for coefficient, exponent_four, exponent_six in self._terms:
            factors = []
            if exponent_four:
                factors.append(
                    "E4" + ("^" + str(exponent_four) if exponent_four != 1 else "")
                )
            if exponent_six:
                factors.append(
                    "E6" + ("^" + str(exponent_six) if exponent_six != 1 else "")
                )
            monomial = "*".join(factors) if factors else "1"
            pieces.append(str(coefficient) + "*" + monomial)
        return " + ".join(pieces).replace(" + -", " - ")

    def is_zero(self) -> bool:
        return len(self._terms) == 0

    def constant_coefficient(self) -> Any:
        answer = sage.QQ(0)
        for coefficient, _exponent_four, _exponent_six in self._terms:
            answer += coefficient
        return answer

    def is_cuspidal(self) -> bool:
        return self.weight() > 0 and self.constant_coefficient() == 0

    def valuation(self) -> int:
        r"""Return the exact order of vanishing at the cusp $\infty$."""
        if self.is_zero():
            raise ValueError("the valuation of zero is infinity")
        bound = self.weight() // 12
        expansion = self.q_expansion(bound + 2)
        for exponent in range(bound + 1):
            if expansion[exponent] != 0:
                return exponent
        raise ArithmeticError("the level-one Sturm valuation bound failed")

    def q_expansion(self, prec: Any = None, variable: str = "q") -> Any:
        if prec is None:
            precision = self._display_precision
        else:
            precision = _nonnegative(prec, "precision")
        ring = _global("PowerSeriesRing")(
            sage.QQ,
            variable,
            default_prec=max(1, precision),
        )
        answer = ring(0).add_bigoh(precision)
        if len(self._terms) == 0:
            return answer
        eisenstein = _global("eisenstein_series_qexp")
        e4 = eisenstein(
            4,
            precision,
            sage.QQ,
            variable,
            "constant",
        )
        e6 = eisenstein(
            6,
            precision,
            sage.QQ,
            variable,
            "constant",
        )
        for coefficient, exponent_four, exponent_six in self._terms:
            term = (e4**exponent_four) * (e6**exponent_six)
            answer = answer + term * coefficient
        return answer.add_bigoh(precision)

    qexp = q_expansion

    def __getitem__(self, exponent: Any) -> Any:
        index = _nonnegative(exponent, "coefficient exponent")
        return self.q_expansion(index + 1)[index]

    def _with_parent_and_precision(
        self,
        parent: Any,
        precision: int,
        provenance: Any = None,
    ) -> ExactModularForm:
        return ExactModularForm(
            parent,
            self._terms,
            precision,
            self._provenance if provenance is None else provenance,
        )

    def _compatible(self, other: Any) -> ExactModularForm:
        converted = coerce_level_one_form(other)
        if converted is None or not _same_ambient(self._parent, converted._parent):
            raise TypeError(
                "modular forms must have the same weight, group, and base ring"
            )
        return converted

    def __add__(self, other: Any) -> ExactModularForm:
        converted = coerce_level_one_form(other)
        if converted is None:
            try:
                scalar = sage.QQ(other)
            except Exception as error:
                raise TypeError(
                    "a positive-weight modular form cannot be added to this value"
                ) from error
            if scalar == 0:
                return self
            if self.weight() != 0:
                raise TypeError(
                    "a positive-weight modular form cannot be added to a scalar"
                )
            converted = ExactModularForm(
                self._parent,
                ((scalar, 0, 0),),
                self._display_precision,
                "scalar",
            )
        converted = self._compatible(converted)
        return ExactModularForm(
            self._parent,
            _add_terms(self._terms, converted._terms),
            min(self._display_precision, converted._display_precision),
            "exact-arithmetic",
        )

    def __radd__(self, other: Any) -> ExactModularForm:
        return self.__add__(other)

    def __sub__(self, other: Any) -> ExactModularForm:
        converted = coerce_level_one_form(other)
        if converted is None:
            try:
                scalar = sage.QQ(other)
            except Exception as error:
                raise TypeError(
                    "a positive-weight modular form cannot be subtracted from this value"
                ) from error
            return self.__add__(-scalar)
        converted = self._compatible(converted)
        return ExactModularForm(
            self._parent,
            _add_terms(self._terms, converted._terms, -1),
            min(self._display_precision, converted._display_precision),
            "exact-arithmetic",
        )

    def __rsub__(self, other: Any) -> ExactModularForm:
        return (-self).__add__(other)

    def __neg__(self) -> ExactModularForm:
        return ExactModularForm(
            self._parent,
            _scale_terms(self._terms, -1),
            self._display_precision,
            "exact-arithmetic",
        )

    def __mul__(self, other: Any) -> ExactModularForm:
        converted = coerce_level_one_form(other)
        if converted is None:
            scalar = sage.QQ(other)
            return ExactModularForm(
                self._parent,
                _scale_terms(self._terms, scalar),
                self._display_precision,
                "exact-arithmetic",
            )
        if (
            self.level() != converted.level()
            or self.base_ring() is not converted.base_ring()
        ):
            raise TypeError(
                "level-one modular-form products require compatible parents"
            )
        precision = min(self._display_precision, converted._display_precision)
        target = _ambient(self.weight() + converted.weight(), precision)
        return ExactModularForm(
            target,
            _multiply_terms(self._terms, converted._terms),
            precision,
            "exact-arithmetic",
        )

    def __rmul__(self, other: Any) -> ExactModularForm:
        return self.__mul__(other)

    def __truediv__(self, other: Any) -> ExactModularForm:
        if coerce_level_one_form(other) is not None:
            raise TypeError("division by a modular form is not holomorphic arithmetic")
        scalar = sage.QQ(other)
        if scalar == 0:
            raise sage.ZeroDivisionError("division by zero")
        return ExactModularForm(
            self._parent,
            _scale_terms(self._terms, sage.QQ(1) / scalar),
            self._display_precision,
            "exact-arithmetic",
        )

    def __pow__(self, exponent: Any) -> ExactModularForm:
        power = _nonnegative(exponent, "exponent")
        target = _ambient(self.weight() * power, self._display_precision)
        return ExactModularForm(
            target,
            _power_terms(self._terms, power),
            self._display_precision,
            "exact-arithmetic",
        )

    def _sage_binop_(self, operator: str, other: Any, reflected: bool) -> Any:
        if operator == "add":
            return self.__radd__(other) if reflected else self.__add__(other)
        if operator == "sub":
            return self.__rsub__(other) if reflected else self.__sub__(other)
        if operator == "mul":
            return self.__rmul__(other) if reflected else self.__mul__(other)
        if operator == "truediv" and not reflected:
            return self.__truediv__(other)
        raise TypeError("unsupported modular-form operation " + operator)

    def __eq__(self, other: object) -> bool:
        converted = coerce_level_one_form(other)
        return (
            converted is not None
            and _same_ambient(self._parent, converted._parent)
            and self._terms == converted._terms
        )

    def __repr__(self) -> str:
        return str(self.q_expansion())

    __str__ = __repr__
    toString = __repr__


class LevelOneBasisCertificate:
    """An independently replayable dimension-and-leading-coefficient proof."""

    def __init__(
        self,
        parent: Any,
        basis: Any,
        cusp_only: bool,
        display_precision: int,
    ) -> None:
        self._kind = "LevelOneBasisCertificate"
        self._parent = parent
        self._basis = tuple(basis)
        self._cusp_only = bool(cusp_only)
        self._display_precision = display_precision
        self._sturm_bound = parent.weight() // 12
        self._verified = self._verify()
        runtime.object.freeze(self)

    def parent(self) -> Any:
        return self._parent

    def basis(self) -> list[ExactModularForm]:
        return list(self._basis)

    def q_expansion_basis(self, prec: Any = None) -> list[Any]:
        precision = (
            self._display_precision if prec is None else _nonnegative(prec, "precision")
        )
        return [
            _series_over_ring(form.q_expansion(precision), sage.ZZ, "q", precision)
            for form in self._basis
        ]

    def cusp_only(self) -> bool:
        return self._cusp_only

    def dimension(self) -> int:
        return len(self._basis)

    def sturm_bound(self) -> int:
        return self._sturm_bound

    def algorithm(self) -> str:
        return "victor-miller-e4-e6-delta"

    def _verify(self) -> bool:
        expected = (
            self._parent.cuspidal_subspace().dimension()
            if self._cusp_only
            else self._parent.dimension()
        )
        if len(self._basis) != expected:
            raise ArithmeticError("Victor Miller basis has the wrong dimension")
        first_exponent = 1 if self._cusp_only else 0
        precision = max(1, first_exponent + expected, self._sturm_bound + 2)
        for row, form in enumerate(self._basis):
            if form.parent().weight() != self._parent.weight() or form.level() != 1:
                raise ArithmeticError("Victor Miller basis has incompatible metadata")
            expansion = form.q_expansion(precision)
            for column in range(expected):
                wanted = sage.QQ(1 if row == column else 0)
                if expansion[first_exponent + column] != wanted:
                    raise ArithmeticError(
                        "Victor Miller leading coefficient certificate failed"
                    )
        return True

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def __repr__(self) -> str:
        label = "cuspidal " if self._cusp_only else ""
        return (
            "Verified "
            + label
            + "Victor Miller basis certificate in weight "
            + str(self._parent.weight())
            + " of dimension "
            + str(len(self._basis))
        )

    __str__ = __repr__
    toString = __repr__


def coerce_level_one_form(value: Any) -> Any:
    if isinstance(value, ExactModularForm):
        return value
    if _kind(value) != "EisensteinSeriesElement":
        return None
    if value.level() != 1 or runtime.reflect.get(value, "_index") != 0:
        return None
    weight = value.weight()
    if weight not in (4, 6, 8, 10, 14):
        return None
    _residue, exponent_four, exponent_six = _residual_exponents(weight)
    return ExactModularForm(
        value.parent().ambient_space(),
        ((sage.QQ(1), exponent_four, exponent_six),),
        value.prec(),
        "normalized-level-one-eisenstein-series",
    )


def delta_form(parent: Any = None, prec: Any = 10) -> ExactModularForm:
    precision = _nonnegative(prec, "precision")
    if parent is None:
        parent = _ambient(12, precision)
    if (
        parent.level() != 1
        or parent.weight() != 12
        or parent.base_ring() is not sage.QQ
    ):
        raise TypeError("Delta requires ModularForms(1, 12) over QQ")
    denominator = sage.QQ(1728)
    return ExactModularForm(
        parent,
        (
            (sage.QQ(1) / denominator, 3, 0),
            (-sage.QQ(1) / denominator, 0, 2),
        ),
        precision,
        "Delta=(E4^3-E6^2)/1728",
    )


def _raw_level_one_basis(parent: Any, display_precision: int) -> list[Any]:
    weight = parent.weight()
    if weight % 2 == 1 or weight == 2:
        return []
    residue, exponent_four, exponent_six = _residual_exponents(weight)
    cusp_dimension = (weight - residue) // 12
    residual_parent = _ambient(residue, display_precision)
    residual = ExactModularForm(
        residual_parent,
        ((sage.QQ(1), exponent_four, exponent_six),),
        display_precision,
        "level-one-residual-generator",
    )
    delta = delta_form(prec=display_precision)
    e6 = ExactModularForm(
        _ambient(6, display_precision),
        ((sage.QQ(1), 0, 1),),
        display_precision,
        "normalized-level-one-eisenstein-series",
    )
    answer = []
    for index in range(cusp_dimension + 1):
        form = residual * (delta**index) * (e6 ** (2 * (cusp_dimension - index)))
        answer.append(
            form._with_parent_and_precision(
                parent,
                display_precision,
                "victor-miller-raw-generator",
            )
        )
    return answer


def level_one_basis_certificate(
    parent: Any,
    prec: Any = None,
    cusp_only: bool = False,
) -> LevelOneBasisCertificate:
    if parent.level() != 1 or parent.base_ring() is not sage.QQ:
        raise NotImplementedError("Victor Miller bases require level one over QQ")
    display_precision = (
        _nonnegative(runtime.reflect.get(parent, "_precision"), "precision")
        if prec is None
        else _nonnegative(prec, "precision")
    )
    weight = parent.weight()
    if weight < 0:
        raise ValueError("weight must be nonnegative")
    forms = _raw_level_one_basis(parent, display_precision)
    if len(forms) > 1:
        work_precision = max(2, len(forms) + 1, weight // 12 + 2)
        expansions = [form.q_expansion(work_precision) for form in forms]
        for pivot in range(1, len(forms)):
            for previous in range(pivot):
                coefficient = expansions[previous][pivot]
                if coefficient != 0:
                    forms[previous] = forms[previous] - coefficient * forms[pivot]
                    expansions[previous] = (
                        expansions[previous] - coefficient * expansions[pivot]
                    ).add_bigoh(work_precision)
    forms = [
        form._with_parent_and_precision(
            parent,
            display_precision,
            "victor-miller-basis",
        )
        for form in forms
    ]
    if cusp_only and len(forms):
        forms = forms[1:]
    certificate = LevelOneBasisCertificate(
        parent,
        forms,
        cusp_only,
        display_precision,
    )
    if not certificate.is_verified():
        raise ArithmeticError("Victor Miller basis did not verify")
    return certificate


def _series_over_ring(
    series: Any, coefficient_ring: Any, variable: str, precision: int
) -> Any:
    ring = _global("PowerSeriesRing")(
        coefficient_ring,
        variable,
        default_prec=max(1, precision),
    )
    coefficients = [coefficient_ring(series[index]) for index in range(precision)]
    return ring(coefficients).add_bigoh(precision)


def delta_qexp(
    prec: Any = 10,
    variable: str = "q",
    K: Any = None,
    **opts: Any,
) -> Any:
    r"""Return $\Delta=q\prod_{n\geq1}(1-q^n)^{24}$ to `O(q^prec)`."""
    if "var" in opts:
        variable = opts["var"]
    if "ρσ_py_var" in opts:
        variable = opts["ρσ_py_var"]
    precision = _nonnegative(prec, "precision")
    coefficient_ring = sage.ZZ if K is None else K
    ring = _global("PowerSeriesRing")(
        coefficient_ring,
        variable,
        default_prec=max(1, precision),
    )
    if precision == 0:
        return ring(0).add_bigoh(0)
    coefficients = [coefficient_ring(0) for _index in range(precision)]
    index = 0
    while index * (index + 1) // 2 < precision:
        exponent = index * (index + 1) // 2
        value = 2 * index + 1
        coefficients[exponent] = coefficient_ring(-value if index % 2 else value)
        index += 1
    theta = ring(coefficients).add_bigoh(precision)
    return (ring.gen() * (theta**8)).add_bigoh(precision)


def victor_miller_basis(
    k: Any,
    prec: Any = 10,
    cusp_only: bool = False,
    variable: str = "q",
    **opts: Any,
) -> list[Any]:
    r"""Return the integral Victor Miller basis of level $1$ and weight $k$."""
    if "var" in opts:
        variable = opts["var"]
    if "ρσ_py_var" in opts:
        variable = opts["ρσ_py_var"]
    weight = _integer(k, "weight")
    if weight < 0:
        raise ValueError("weight must be nonnegative")
    precision = _nonnegative(prec, "precision")
    if weight % 2 == 1 or weight == 2:
        return []
    parent = _ambient(weight, precision)
    certificate = level_one_basis_certificate(parent, precision, cusp_only)
    return [
        _series_over_ring(
            form.q_expansion(precision, variable), sage.ZZ, variable, precision
        )
        for form in certificate.basis()
    ]


def from_serialized_element(
    parent: Any,
    terms: Any,
    display_precision: Any,
    provenance: Any,
) -> ExactModularForm:
    return ExactModularForm(parent, terms, display_precision, str(provenance))


__all__ = [
    "ExactModularForm",
    "LevelOneBasisCertificate",
    "coerce_level_one_form",
    "delta_form",
    "delta_qexp",
    "from_serialized_element",
    "level_one_basis_certificate",
    "victor_miller_basis",
]
