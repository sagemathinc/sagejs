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
        expansion_basis: Any,
        cusp_only: bool,
        display_precision: int,
        certificate_precision: int,
    ) -> None:
        self._kind = "LevelOneBasisCertificate"
        self._parent = parent
        self._basis = tuple(basis)
        self._expansion_basis = tuple(expansion_basis)
        self._cusp_only = bool(cusp_only)
        self._display_precision = display_precision
        self._certificate_precision = certificate_precision
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
        if precision <= self._certificate_precision:
            return [series.add_bigoh(precision) for series in self._expansion_basis]
        return _victor_miller_series_basis(
            self._parent.weight(),
            precision,
            "q",
            self._cusp_only,
        )

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
        if len(self._expansion_basis) != expected:
            raise ArithmeticError(
                "Victor Miller expansion basis has the wrong dimension"
            )
        first_exponent = 1 if self._cusp_only else 0
        precision = max(1, first_exponent + expected, self._sturm_bound + 2)
        if self._certificate_precision < precision:
            raise ArithmeticError("Victor Miller certificate precision is insufficient")
        for row, form in enumerate(self._basis):
            if form.parent().weight() != self._parent.weight() or form.level() != 1:
                raise ArithmeticError("Victor Miller basis has incompatible metadata")
            expansion = self._expansion_basis[row]
            for column in range(expected):
                wanted = sage.QQ(1 if row == column else 0)
                if expansion[first_exponent + column] != wanted:
                    raise ArithmeticError(
                        "Victor Miller leading coefficient certificate failed"
                    )
        replay_expansions, replay_operations = _victor_miller_series_data(
            self._parent.weight(),
            self._certificate_precision,
            "q",
            True,
        )
        replay_forms = _transformed_level_one_forms(
            self._parent,
            self._display_precision,
            replay_operations,
        )
        if self._cusp_only:
            replay_expansions = replay_expansions[1:]
            replay_forms = replay_forms[1:]
        for row in range(expected):
            if replay_forms[row] != self._basis[row]:
                raise ArithmeticError("Victor Miller formula replay failed")
            if replay_expansions[row] != self._expansion_basis[row]:
                raise ArithmeticError("Victor Miller expansion replay failed")
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
    if _kind(value) == "ClassicalModularFormElement":
        return value._as_exact_level_one_form()
    return None


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


def _victor_miller_series_data(
    weight: int,
    precision: int,
    variable: str,
    include_operations: bool = False,
) -> tuple[list[Any], list[tuple[int, int, Any]]]:
    r"""Construct the integral basis without publishing coefficient arrays."""
    if weight % 2 == 1 or weight == 2:
        return [], []
    residue, exponent_four, exponent_six = _residual_exponents(weight)
    cusp_dimension = (weight - residue) // 12
    dimension = cusp_dimension + 1
    if not include_operations and precision <= dimension:
        # The Victor Miller basis has leading terms 1, q, ..., q^(d-1).
        # Modulo q^prec with prec <= d, its entire visible coefficient matrix
        # is therefore the identity.  Construct that known truncation directly
        # instead of expanding E4, E6, and Delta to the full dimension.
        ring = _global("PowerSeriesRing")(
            sage.ZZ,
            variable,
            default_prec=max(1, precision),
        )
        zero = ring(0).add_bigoh(precision)
        basis = [zero for _index in range(dimension)]
        monomial = ring(1)
        generator = ring.gen()
        for exponent in range(precision):
            basis[exponent] = monomial.add_bigoh(precision)
            if exponent + 1 < precision:
                monomial = (monomial * generator).add_bigoh(precision)
        return basis, []
    work_precision = max(precision, dimension)
    ring = _global("PowerSeriesRing")(
        sage.ZZ,
        variable,
        default_prec=max(1, work_precision),
    )
    if weight == 0:
        return [ring(1).add_bigoh(precision)], []
    eisenstein = _global("eisenstein_series_qexp")
    e4 = eisenstein(4, work_precision, sage.ZZ, variable, "constant")
    e6 = eisenstein(6, work_precision, sage.ZZ, variable, "constant")
    residual = (e4**exponent_four) * (e6**exponent_six)
    delta = delta_qexp(work_precision, variable, sage.ZZ)
    delta_powers = [ring(1)]
    e6_square_powers = [ring(1)]
    e6_square = (e6 * e6).add_bigoh(work_precision)
    for _index in range(cusp_dimension):
        delta_powers.append((delta_powers[-1] * delta).add_bigoh(work_precision))
        e6_square_powers.append(
            (e6_square_powers[-1] * e6_square).add_bigoh(work_precision)
        )
    basis = [
        (
            residual * delta_powers[index] * e6_square_powers[cusp_dimension - index]
        ).add_bigoh(work_precision)
        for index in range(dimension)
    ]
    operations = []
    if include_operations:
        operation_basis = list(basis)
        for pivot in range(1, dimension):
            for previous in range(pivot):
                coefficient = operation_basis[previous][pivot]
                if coefficient != 0:
                    operation_basis[previous] = (
                        operation_basis[previous] - coefficient * operation_basis[pivot]
                    ).add_bigoh(work_precision)
                    operations.append((previous, pivot, coefficient))
    basis = ring._unitriangular_basis(basis)
    return [series.add_bigoh(precision) for series in basis], operations


def _transformed_level_one_forms(
    parent: Any,
    display_precision: int,
    operations: Any,
) -> list[Any]:
    forms = _raw_level_one_basis(parent, display_precision)
    for previous, pivot, coefficient in operations:
        forms[previous] = forms[previous] - coefficient * forms[pivot]
    return [
        form._with_parent_and_precision(
            parent,
            display_precision,
            "victor-miller-basis",
        )
        for form in forms
    ]


def _victor_miller_series_basis(
    weight: int,
    precision: int,
    variable: str,
    cusp_only: bool,
) -> list[Any]:
    basis, _operations = _victor_miller_series_data(weight, precision, variable)
    return basis[1:] if cusp_only and len(basis) else basis


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
    expected = (
        parent.cuspidal_subspace().dimension() if cusp_only else parent.dimension()
    )
    first_exponent = 1 if cusp_only else 0
    certificate_precision = max(
        1,
        first_exponent + expected,
        weight // 12 + 2,
    )
    expansions, operations = _victor_miller_series_data(
        weight,
        certificate_precision,
        "q",
        True,
    )
    forms = _transformed_level_one_forms(parent, display_precision, operations)
    if cusp_only and len(forms):
        forms = forms[1:]
        expansions = expansions[1:]
    certificate = LevelOneBasisCertificate(
        parent,
        forms,
        expansions,
        cusp_only,
        display_precision,
        certificate_precision,
    )
    if not certificate.is_verified():
        raise ArithmeticError("Victor Miller basis did not verify")
    return certificate


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
    return _victor_miller_series_basis(weight, precision, variable, cusp_only)


def _modular_symbols_precision(space: Any, prec: Any) -> int:
    if prec is None:
        return 8
    precision = _nonnegative(prec, "precision")
    if precision < 1:
        raise ValueError("precision must be at least 1")
    return precision


def _modular_symbols_q_expansion_data(
    source_space: Any,
    precision: int,
    use_cache: bool = True,
) -> tuple[Any, Any, Any, Any, Any]:
    """Return the Hecke-dual basis and its exact modular-symbol lift."""
    return source_space._q_expansion_data(precision, use_cache)


def _series_from_coefficient_matrix(
    coefficient_matrix: Any,
    variable: str,
) -> list[Any]:
    precision = coefficient_matrix.ncols()
    ring = _global("PowerSeriesRing")(
        coefficient_matrix.base_ring(),
        variable,
        default_prec=max(1, precision),
    )
    return [ring(row.list()).add_bigoh(precision) for row in coefficient_matrix.rows()]


def _saturated_integer_row_basis(rational_basis: Any) -> Any:
    r"""Return $\operatorname{rowspan}_{\QQ}(B)\cap\ZZ^n$ in HNF."""
    matrix_constructor = _global("matrix")
    if rational_basis.nrows() == 0:
        return matrix_constructor(sage.ZZ, 0, rational_basis.ncols())
    common_denominator = sage.ZZ(1)
    gcd_function = _global("gcd")
    for row in rational_basis.rows():
        for value in row:
            denominator = value.denominator()
            common_denominator = (
                common_denominator
                * denominator
                // gcd_function(common_denominator, denominator)
            )
    integral = (rational_basis * common_denominator).change_ring(sage.ZZ)
    _smith, _left, right = integral.smith_form()
    rank = integral.rank()
    inverse = right.inverse().change_ring(sage.ZZ)
    coordinate_rows = _global("identity_matrix")(
        sage.ZZ, rational_basis.ncols()
    ).matrix_from_prefix_rows(rank)
    saturated = coordinate_rows * inverse
    return saturated.hermite_form(include_zero_rows=False)


def formula_q_expansion_module(
    weight: Any,
    prec: Any = 10,
    R: Any = None,
) -> Any:
    r"""Return the $\QQ$-space or saturated $\ZZ$-module of a formula basis."""
    precision = _nonnegative(prec, "precision")
    if precision < 1:
        raise ValueError("precision must be at least 1")
    coefficient_ring = sage.QQ if R is None else R
    if coefficient_ring not in [sage.QQ, sage.ZZ]:
        raise NotImplementedError("q-expansion modules support only QQ and ZZ")
    basis = victor_miller_basis(weight, precision, True)
    rows = [[series[index] for index in range(precision)] for series in basis]
    matrix_constructor = _global("matrix")
    rational_basis = matrix_constructor(sage.QQ, rows)
    if coefficient_ring is sage.QQ:
        return rational_basis.row_space()
    return _saturated_integer_row_basis(rational_basis).row_space()


def character_eisenstein_series_qexp(
    chi: Any,
    psi: Any,
    weight: Any,
    prec: Any = 10,
    t: Any = 1,
    variable: str = "q",
    coefficient_ring: Any = None,
    normalization: str = "linear",
) -> Any:
    r"""Return the exact series $E_k(\chi,\psi)(q^t)$.

    The normalization is

    $$
    a_n=\sum_{d\mid n}\psi(d)\chi(n/d)d^{k-1}.
    $$

    Each supplied character is replaced mathematically by its primitive
    inducing character, so imprimitive inputs have the standard conductor-
    based meaning.  The parity condition is
    $\chi(-1)\psi(-1)=(-1)^k$. Coefficients default to a common exact
    cyclotomic field, so no numerical embeddings are used.
    """
    weight = _nonnegative(weight, "weight")
    precision = _nonnegative(prec, "precision")
    inflation = _nonnegative(t, "inflation factor")
    if weight < 1:
        raise ValueError("weight must be positive")
    if inflation < 1:
        raise ValueError("inflation factor must be positive")
    for character in [chi, psi]:
        if not all(
            hasattr(character, method)
            for method in ["modulus", "conductor", "bernoulli"]
        ):
            raise TypeError("chi and psi must be Dirichlet characters")
    left_order = runtime.number(chi._parent.zeta_order())
    right_order = runtime.number(psi._parent.zeta_order())
    gcd = runtime.number(_global("gcd")(left_order, right_order))
    value_order = left_order * right_order // gcd
    target = (
        _global("CyclotomicField")(value_order)
        if coefficient_ring is None
        else coefficient_ring
    )
    value_caches: list[dict[int, Any]] = [{}, {}]

    def character_value(character: Any, value: int) -> Any:
        conductor = runtime.number(character.conductor())
        residue = value % conductor
        cache = value_caches[0] if character is chi else value_caches[1]
        if residue in cache:
            return cache[residue]
        if runtime.number(_global("gcd")(residue, conductor)) != 1:
            cache[residue] = target(0)
            return cache[residue]
        modulus = runtime.number(character.modulus())
        evaluated = None
        lift = residue
        while lift < modulus:
            if runtime.number(_global("gcd")(lift, modulus)) == 1:
                evaluated = character(lift)
                break
            lift += conductor
        if evaluated is None:
            raise ArithmeticError("could not evaluate the primitive inducing character")
        if evaluated.is_zero():
            cache[residue] = target(0)
            return cache[residue]
        if coefficient_ring is not None:
            if coefficient_ring is sage.QQ:
                if evaluated.is_one():
                    cache[residue] = sage.QQ(1)
                elif (-evaluated).is_one():
                    cache[residue] = sage.QQ(-1)
                else:
                    raise ArithmeticError(
                        "a rational character produced a nonrational value"
                    )
            else:
                cache[residue] = target(evaluated)
        else:
            source_order = runtime.number(character._parent.zeta_order())
            exponent = runtime.number(evaluated._exponent)
            cache[residue] = target.gen() ** (exponent * value_order // source_order)
        return cache[residue]

    parity = character_value(chi, -1) * character_value(psi, -1)
    if parity != target(-1 if weight % 2 else 1):
        raise ValueError("chi(-1)*psi(-1) must equal (-1)^weight")
    if (
        weight == 2
        and runtime.number(chi.conductor()) == 1
        and runtime.number(psi.conductor()) == 1
    ):
        raise ValueError("E_2(1,1) is quasimodular, not a modular Eisenstein series")
    if normalization != "linear":
        raise NotImplementedError(
            "character Eisenstein series currently use linear normalization"
        )
    short_precision = 0 if precision == 0 else (precision - 1) // inflation + 1
    coefficients = [target(0) for _index in range(short_precision)]
    if short_precision and runtime.number(chi.conductor()) == 1:
        modulus = runtime.number(psi.conductor())
        if (
            getattr(target, "_kind", None) == "CyclotomicField"
            and runtime.number(psi.modulus()) == modulus
        ):
            # The Dirichlet layer already computes this exact primitive
            # generalized Bernoulli number in one FLINT call on native hosts.
            generalized = target(psi.bernoulli(weight))
        else:
            generalized = target(0)
            binomial = _global("binomial")
            bernoulli = _global("bernoulli")
            for residue in range(1, modulus + 1):
                polynomial_value = target(0)
                rational = sage.QQ(residue) / modulus
                for index in range(weight + 1):
                    bernoulli_value = (
                        sage.QQ(-1) / 2 if index == 1 else bernoulli(index)
                    )
                    polynomial_value += target(
                        binomial(weight, index) * bernoulli_value
                    ) * target(rational) ** (weight - index)
                generalized += character_value(psi, residue) * polynomial_value
            generalized *= target(modulus) ** (weight - 1)
        coefficients[0] = -generalized / (2 * weight)
    if getattr(target, "_kind", None) == "CyclotomicField":
        # Accumulate the divisor sums in the declared cyclotomic power basis.
        # Constructing and adding one QQbar object for every divisor dominates
        # high-precision character Eisenstein series, even though every term
        # is merely an integral multiple of a root of unity.  The coordinate
        # sieve below is the same formula, with roots reduced modulo Phi_n
        # once and exact algebraic elements materialized only at publication.
        target_order = runtime.number(target._order)
        target_degree = runtime.number(target.degree())

        def character_exponents(character: Any) -> list[Any]:
            conductor = runtime.number(character.conductor())
            modulus = runtime.number(character.modulus())
            source_order = runtime.number(character._parent.zeta_order())
            answer = []
            for residue in range(conductor):
                if runtime.number(_global("gcd")(residue, conductor)) != 1:
                    answer.append(None)
                    continue
                evaluated = None
                lift = residue
                while lift < modulus:
                    if runtime.number(_global("gcd")(lift, modulus)) == 1:
                        evaluated = character(lift)
                        break
                    lift += conductor
                if evaluated is None or evaluated.is_zero():
                    answer.append(None)
                    continue
                numerator = runtime.number(evaluated._exponent) * target_order
                if numerator % source_order != 0:
                    raise ArithmeticError(
                        "character value is not in the requested cyclotomic field"
                    )
                answer.append((numerator // source_order) % target_order)
            return answer

        left_exponents = character_exponents(chi)
        right_exponents = character_exponents(psi)
        backend = runtime.flint_backend()
        root_coordinates = []
        for exponent in range(target_order):
            raw = backend.cyclotomicRootCoefficients(
                runtime.integer_bigint(exponent),
                runtime.integer_bigint(target_order),
            )
            row = [runtime.normalize_integer(value) for value in raw]
            row.extend([0 for _index in range(target_degree - len(row))])
            root_coordinates.append(row)
        coordinate_rows = [
            [0 for _coordinate in range(target_degree)]
            for _index in range(short_precision)
        ]
        left_conductor = len(left_exponents)
        right_conductor = len(right_exponents)
        for divisor in range(1, short_precision):
            right_exponent = right_exponents[divisor % right_conductor]
            if right_exponent is None:
                continue
            scalar = divisor ** (weight - 1)
            quotient = 1
            while divisor * quotient < short_precision:
                left_exponent = left_exponents[quotient % left_conductor]
                if left_exponent is not None:
                    root_row = root_coordinates[
                        (right_exponent + left_exponent) % target_order
                    ]
                    output_row = coordinate_rows[divisor * quotient]
                    for coordinate in range(target_degree):
                        output_row[coordinate] += scalar * root_row[coordinate]
                quotient += 1
        publish = runtime.reflect.get(
            backend,
            "cyclotomicElementsFromIntegralCoordinates",
        )
        if runtime.jstype(publish) == "function" and short_precision > 1:
            flattened = []
            for index in range(1, short_precision):
                flattened.extend(
                    [runtime.integer_bigint(value) for value in coordinate_rows[index]]
                )
            native_values = runtime.reflect.apply(
                publish,
                backend,
                [flattened, runtime.integer_bigint(target_order)],
            )
            for index in range(1, short_precision):
                coefficients[index] = target._from_native(native_values[index - 1])
        else:
            for index in range(1, short_precision):
                coefficients[index] = target._from_coefficients(coordinate_rows[index])
    else:
        for index in range(1, short_precision):
            value = target(0)
            for divisor in sage.divisors(index):
                divisor = runtime.number(divisor)
                value += (
                    character_value(psi, divisor)
                    * character_value(chi, index // divisor)
                    * divisor ** (weight - 1)
                )
            coefficients[index] = value
    ring = _global("PowerSeriesRing")(
        target,
        variable,
        default_prec=max(1, short_precision),
    )
    series = ring(coefficients).add_bigoh(short_precision)
    return series._inflate(inflation, precision)


class ModularSymbolsQExpansionCertificate:
    r"""A replayable Hecke-dual and Sturm certificate for a cusp basis."""

    def __init__(
        self,
        source_space: Any,
        signed_space: Any,
        coefficient_matrix: Any,
        functional_indices: Any,
    ) -> None:
        self._source_space = source_space
        self._signed_space = signed_space
        self._coefficient_matrix = coefficient_matrix
        self._functional_indices = functional_indices
        self._precision = coefficient_matrix.ncols()
        self._sturm_bound = source_space.sturm_bound()
        expected = min(self._precision - 1, signed_space.dimension())
        if coefficient_matrix.nrows() != expected:
            raise ArithmeticError("q-expansion certificate has the wrong dimension")
        if coefficient_matrix.rank() != expected:
            raise ArithmeticError("q-expansion certificate basis is dependent")
        for row in range(coefficient_matrix.nrows()):
            if coefficient_matrix[row, 0] != 0:
                raise ArithmeticError("a certified cusp form has nonzero constant term")
        self._verified = True
        runtime.object.freeze(self)

    def source_space(self) -> Any:
        return self._source_space

    def signed_space(self) -> Any:
        return self._signed_space

    def precision(self) -> int:
        return self._precision

    def sturm_bound(self) -> int:
        return self._sturm_bound

    def dimension(self) -> int:
        return self._coefficient_matrix.nrows()

    def coefficient_matrix(self) -> Any:
        return self._coefficient_matrix

    def functional_indices(self) -> Any:
        return self._functional_indices

    def basis(self, variable: str = "q") -> list[Any]:
        return _series_from_coefficient_matrix(self._coefficient_matrix, variable)

    def is_sturm_certified(self) -> bool:
        return (
            self._precision > self._sturm_bound
            and self.dimension() == self._signed_space.dimension()
        )

    def is_verified(self) -> bool:
        return self._verified

    def verify(self) -> bool:
        replay_signed, replay, replay_indices, _raw, _lift = (
            _modular_symbols_q_expansion_data(
                self._source_space,
                self._precision,
                False,
            )
        )
        return (
            replay_signed is self._signed_space
            and replay == self._coefficient_matrix
            and replay_indices == self._functional_indices
            and self.is_sturm_certified()
        )

    def __repr__(self) -> str:
        status = "Sturm-certified" if self.is_sturm_certified() else "truncated"
        return (
            status
            + " Hecke-dual q-expansion basis of dimension "
            + str(self.dimension())
            + " for Gamma0("
            + str(self._source_space.level())
            + ") in weight "
            + str(self._source_space.weight())
        )

    __str__ = __repr__
    toString = __repr__


def modular_symbols_q_expansion_basis(
    space: Any,
    prec: Any = None,
    algorithm: str = "default",
    variable: str = "q",
) -> list[Any]:
    """Return the exact Hecke-dual cusp basis attached to `space`."""
    if algorithm == "default":
        algorithm = "modular_symbols"
    if algorithm != "modular_symbols":
        raise ValueError("only the exact Hecke-dual q-expansion algorithm is available")
    precision = _modular_symbols_precision(space, prec)
    cache_key = variable + "|" + str(precision)
    cached = space._q_expansion_basis_cache.get(cache_key)
    if cached is not runtime.undefined:
        return list(cached)
    _signed, coefficients, _indices, _raw, _lift = _modular_symbols_q_expansion_data(
        space, precision
    )
    basis = _series_from_coefficient_matrix(coefficients, variable)
    space._q_expansion_basis_cache.set(cache_key, runtime.math_tuple(basis))
    return list(basis)


def modular_symbols_q_expansion_module(
    space: Any,
    prec: Any = None,
    R: Any = None,
    algorithm: str = "default",
) -> Any:
    """Return the exact coefficient module, saturated over ZZ for QQ spaces."""
    if algorithm == "default":
        algorithm = "modular_symbols"
    if algorithm != "modular_symbols":
        raise ValueError("only the exact Hecke-dual q-expansion algorithm is available")
    precision = _modular_symbols_precision(space, prec)
    _signed, coefficients, _indices, _raw, _lift = _modular_symbols_q_expansion_data(
        space, precision
    )
    source_ring = coefficients.base_ring()
    coefficient_ring = source_ring if R is None else R
    if coefficient_ring is source_ring:
        return coefficients.row_space()
    if coefficient_ring is sage.ZZ and source_ring is sage.QQ:
        return _saturated_integer_row_basis(coefficients).row_space()
    raise NotImplementedError(
        "q-expansion modules support their exact coefficient field, and ZZ for QQ spaces"
    )


def modular_symbols_q_expansion_certificate(
    space: Any,
    prec: Any = None,
) -> ModularSymbolsQExpansionCertificate:
    """Return a replayable Sturm certificate at sufficient precision."""
    precision = (
        max(2, space.sturm_bound() + 1)
        if prec is None
        else _modular_symbols_precision(space, prec)
    )
    signed, coefficients, functional_indices, _raw, _lift = (
        _modular_symbols_q_expansion_data(space, precision)
    )
    certificate = ModularSymbolsQExpansionCertificate(
        space,
        signed,
        coefficients,
        functional_indices,
    )
    if not certificate.is_sturm_certified():
        raise ValueError(
            "certificate precision must exceed the Sturm bound and expose "
            "the full cusp-form dimension"
        )
    return certificate


def modular_forms_new_subspace(space: Any, prime: Any = None) -> Any:
    """Load and construct the exact new modular-form subspace."""
    from .newforms import modular_forms_new_subspace as construct

    return construct(space, prime)


def modular_forms_old_subspace(space: Any) -> Any:
    """Load and construct the exact old modular-form subspace."""
    from .newforms import modular_forms_old_subspace as construct

    return construct(space)


def modular_forms_newforms(space: Any, names: str = "a") -> list[Any]:
    """Load and reconstruct normalized newform Galois packets."""
    from .newforms import modular_forms_newforms as construct

    return construct(space, names)


def normalized_newform_from_data(
    parent: Any,
    constituent: Any,
    name: Any,
) -> Any:
    """Load a normalized newform from its exact constituent data."""
    from .newforms import normalized_newform_from_data as construct

    return construct(parent, constituent, name)


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
    "ModularSymbolsQExpansionCertificate",
    "character_eisenstein_series_qexp",
    "coerce_level_one_form",
    "delta_form",
    "delta_qexp",
    "from_serialized_element",
    "formula_q_expansion_module",
    "level_one_basis_certificate",
    "modular_symbols_q_expansion_basis",
    "modular_symbols_q_expansion_certificate",
    "modular_symbols_q_expansion_module",
    "modular_forms_new_subspace",
    "modular_forms_newforms",
    "modular_forms_old_subspace",
    "normalized_newform_from_data",
    "victor_miller_basis",
]
