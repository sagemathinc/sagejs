r"""Parented classical modular forms for $\Gamma_0$ and $\Gamma_1$ spaces.

The public mathematical state is a parent and an exact coordinate vector.
Power-series expansions are deterministic, extendable realizations obtained
from the canonical basis of that parent.  This keeps display precision and the
choice of construction engine out of element identity.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    value = runtime.normalize_integer(value)
    if runtime.jstype(value) != "number" or not runtime.number.isSafeInteger(value):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(value)


def _nonnegative(value: Any, label: str) -> int:
    answer = _integer(value, label)
    if answer < 0:
        raise ValueError(label + " must be nonnegative")
    return answer


def _positive(value: Any, label: str) -> int:
    answer = _integer(value, label)
    if answer < 1:
        raise ValueError(label + " must be positive")
    return answer


def _kind(value: Any) -> Any:
    return getattr(value, "_kind", None)


def _space_kind(space: Any) -> str:
    kind = _kind(space)
    if kind == "ModularForms":
        return "Ambient"
    if kind == "EisensteinSubspace":
        return "Eisenstein"
    if kind == "OldModularFormsSubspace":
        return "Old"
    value = runtime.reflect.get(space, "_subspace_kind")
    if isinstance(value, str):
        return value
    raise TypeError("unsupported classical modular-form parent")


def _ambient(space: Any) -> Any:
    if _space_kind(space) == "Ambient":
        return space
    return space.ambient_space()


def _is_gamma1(space: Any) -> bool:
    return _ambient(space).group()._family == "Gamma1"


def _ambient_signature(space: Any) -> tuple[Any, ...]:
    ambient = _ambient(space)
    character = runtime.reflect.get(ambient, "_character")
    character_number = 1 if character is None else character.conrey_number()
    return (
        ambient.group()._family,
        ambient.level(),
        ambient.weight(),
        ambient.base_ring(),
        character_number,
    )


def _same_ambient(left: Any, right: Any) -> bool:
    left_signature = _ambient_signature(left)
    right_signature = _ambient_signature(right)
    return (
        left_signature[0] == right_signature[0]
        and left_signature[1] == right_signature[1]
        and left_signature[2] == right_signature[2]
        and left_signature[3] is right_signature[3]
        and left_signature[4] == right_signature[4]
    )


def _same_parent(left: Any, right: Any) -> bool:
    return _same_ambient(left, right) and _space_kind(left) == _space_kind(right)


def _display_precision(space: Any, precision: Any = None) -> int:
    if precision is None:
        return _nonnegative(space.precision(), "display precision")
    return _nonnegative(precision, "display precision")


def _sturm_precision(space: Any) -> int:
    """Return an absolute precision containing the full Sturm prefix."""
    return max(1, _nonnegative(space.sturm_bound(), "Sturm bound") + 1)


def _zero_series(space: Any, precision: int, variable: str = "q") -> Any:
    ring = _global("PowerSeriesRing")(
        space.base_ring(),
        variable,
        default_prec=max(1, precision),
    )
    return ring(0).add_bigoh(precision)


def _series_precision(series: Any) -> int:
    if not hasattr(series, "precision_absolute"):
        raise TypeError("expected an exact power series or modular-form element")
    return _nonnegative(series.precision_absolute(), "series precision")


def _matrix_from_series(
    series: list[Any],
    precision: int,
    coefficient_ring: Any = None,
) -> Any:
    matrix = _global("matrix")
    if coefficient_ring is None:
        coefficient_ring = (
            sage.QQ if len(series) == 0 else series[0].parent().base_ring()
        )
    if len(series) == 0:
        return matrix(coefficient_ring, 0, precision)
    return matrix(
        coefficient_ring,
        [
            [coefficient_ring(form[index]) for index in range(precision)]
            for form in series
        ],
    )


def _basis_cache(space: Any) -> Any:
    cache = runtime.reflect.get(space, "_classical_qexp_basis_cache")
    if cache is runtime.undefined or cache is None:
        cache = runtime.map()
        runtime.reflect.set(space, "_classical_qexp_basis_cache", cache)
    return cache


def _hecke_cache(space: Any) -> Any:
    cache = runtime.reflect.get(space, "_classical_hecke_cache")
    if cache is runtime.undefined or cache is None:
        cache = runtime.map()
        runtime.reflect.set(space, "_classical_hecke_cache", cache)
    return cache


def _space_q_expansion_basis(
    space: Any,
    precision: int,
    variable: str = "q",
) -> list[Any]:
    key = variable + "|" + str(precision)
    cache = _basis_cache(space)
    cached = cache.get(key)
    if cached is not runtime.undefined:
        return list(cached)

    proof_precision = _sturm_precision(space)
    if precision < proof_precision:
        certified_basis = _space_q_expansion_basis(
            space,
            proof_precision,
            variable,
        )
        result = [series.add_bigoh(precision) for series in certified_basis]
        cache.set(key, runtime.math_tuple(result))
        return list(result)

    if _is_gamma1(space):
        from . import gamma1

        result = gamma1.q_expansion_basis(space, precision, variable)
        if len(result) != space.dimension():
            raise ArithmeticError(
                "the canonical Gamma1 q-expansion basis has dimension "
                + str(len(result))
                + " instead of "
                + str(space.dimension())
            )
        cache.set(key, runtime.math_tuple(result))
        return list(result)

    kind = _space_kind(space)
    if kind == "Ambient":
        eisenstein = space.eisenstein_subspace().q_expansion_basis(
            precision,
            variable=variable,
        )
        cusp = space.cuspidal_subspace().q_expansion_basis(
            precision,
            algorithm="auto",
            variable=variable,
        )
        result = list(eisenstein) + list(cusp)
    elif kind == "Eisenstein":
        result = space.q_expansion_basis(precision, variable=variable)
    elif kind == "Cuspidal":
        result = space.q_expansion_basis(
            precision,
            algorithm="auto",
            variable=variable,
        )
    elif kind == "New":
        result = space.q_expansion_basis(
            precision,
            algorithm="modular_symbols",
            variable=variable,
        )
    elif kind == "Old":
        result = space.q_expansion_basis(
            precision,
            algorithm="modular_symbols",
            variable=variable,
        )
    else:
        raise NotImplementedError("this modular-form subspace has no object basis")

    if len(result) != space.dimension():
        raise ArithmeticError(
            "the canonical q-expansion basis has dimension "
            + str(len(result))
            + " instead of "
            + str(space.dimension())
        )
    cache.set(key, runtime.math_tuple(result))
    return list(result)


def q_expansion_basis(
    space: Any,
    prec: Any = None,
    variable: str = "q",
) -> list[Any]:
    """Return the canonical exact power-series basis of `space`."""
    return _space_q_expansion_basis(
        space,
        _display_precision(space, prec),
        variable,
    )


def _basis_matrix(space: Any, precision: int) -> Any:
    return _matrix_from_series(
        _space_q_expansion_basis(space, precision),
        precision,
        space.base_ring(),
    )


def _coordinate_vector(space: Any, values: Any) -> Any:
    answer = _global("vector")(space.base_ring(), values)
    if len(answer) != space.dimension():
        raise ValueError(
            "coordinate vector has length "
            + str(len(answer))
            + "; expected "
            + str(space.dimension())
        )
    answer.set_immutable()
    return answer


def _looks_like_coordinates(space: Any, value: Any) -> bool:
    if isinstance(value, (list, tuple)):
        return len(value) == space.dimension()
    return (
        hasattr(value, "list")
        and not hasattr(value, "nrows")
        and not hasattr(value, "q_expansion")
        and not hasattr(value, "precision_absolute")
        and len(value) == space.dimension()
    )


def _series_from_value(value: Any, precision: int) -> Any:
    if hasattr(value, "q_expansion"):
        return value.q_expansion(precision)
    if hasattr(value, "qexp"):
        return value.qexp(precision)
    if hasattr(value, "precision_absolute"):
        available = _series_precision(value)
        if available < precision:
            raise ValueError(
                "q-expansion precision "
                + str(available)
                + " is below the required Sturm precision "
                + str(precision)
            )
        return value.add_bigoh(precision)
    raise TypeError("cannot obtain an exact q-expansion from this value")


def _recover_coordinates(space: Any, value: Any) -> Any:
    required = _sturm_precision(space)
    if hasattr(value, "precision_absolute"):
        supplied_precision = _series_precision(value)
        if supplied_precision < required:
            raise ValueError(
                "q-expansion precision "
                + str(supplied_precision)
                + " is below the required Sturm precision "
                + str(required)
            )
        precision = supplied_precision
        series = value
    else:
        precision = required
        series = _series_from_value(value, precision)
    basis = _basis_matrix(space, precision)
    coefficient_ring = space.base_ring()
    target = _global("vector")(
        coefficient_ring,
        [coefficient_ring(series[index]) for index in range(precision)],
    )
    if space.dimension() == 0:
        if any(coefficient != 0 for coefficient in target):
            raise ValueError("q-expansion is not in this zero-dimensional space")
        return _coordinate_vector(space, [])
    try:
        if _is_gamma1(space):
            from . import gamma1

            certificate = gamma1.descent_certificate(space)
            if certificate.uses_rank_profile_basis():
                pivot_target = _global("vector")(
                    coefficient_ring,
                    [target[index] for index in certificate.pivot_columns()],
                )
                solution = certificate.pivot_matrix().solve_left(pivot_target)
            else:
                solution = basis.solve_left(target)
        else:
            solution = basis.solve_left(target)
    except Exception as error:
        raise ValueError("q-expansion is not in this modular-form space") from error
    coordinates = _coordinate_vector(space, solution.list())
    if coordinates * basis != target:
        raise ValueError("q-expansion is not in this modular-form space")
    return coordinates


def coordinates(space: Any, value: Any) -> Any:
    """Return exact coordinates of `value` in `space`."""
    if isinstance(value, ClassicalModularFormElement):
        if _same_parent(space, value.parent()):
            return _coordinate_vector(space, value.vector())
        if not _same_ambient(space, value.parent()):
            raise TypeError("modular form has a different ambient space")
    if runtime.is_exact_integer(value) and value == 0:
        coefficient_ring = space.base_ring()
        return _coordinate_vector(
            space,
            [coefficient_ring(0) for _index in range(space.dimension())],
        )
    if _looks_like_coordinates(space, value):
        return _coordinate_vector(space, value)
    return _recover_coordinates(space, value)


def construct_element(
    space: Any,
    value: Any = 0,
    display_precision: Any = None,
) -> ClassicalModularFormElement:
    """Construct an exact parented element of `space`."""
    precision = _display_precision(space, display_precision)
    if isinstance(value, ClassicalModularFormElement) and value.parent() is space:
        if value.precision() == precision:
            return value
        return ClassicalModularFormElement(space, value.vector(), precision)
    return ClassicalModularFormElement(space, coordinates(space, value), precision)


def contains(space: Any, value: Any) -> bool:
    """Return whether exact coordinate recovery puts `value` in `space`."""
    try:
        coordinates(space, value)
        return True
    except (ArithmeticError, TypeError, ValueError):
        return False


def basis(space: Any, prec: Any = None) -> list[ClassicalModularFormElement]:
    """Return the canonical parented basis of `space`."""
    precision = _display_precision(space, prec)
    _space_q_expansion_basis(space, _sturm_precision(space))
    result = []
    coefficient_ring = space.base_ring()
    for row in range(space.dimension()):
        values = [coefficient_ring(0) for _column in range(space.dimension())]
        values[row] = coefficient_ring(1)
        result.append(ClassicalModularFormElement(space, values, precision))
    return result


def zero(space: Any) -> ClassicalModularFormElement:
    """Return the zero element of `space`."""
    coefficient_ring = space.base_ring()
    return ClassicalModularFormElement(
        space,
        [coefficient_ring(0) for _index in range(space.dimension())],
        space.precision(),
    )


def _common_additive_parent(left: Any, right: Any) -> Any:
    if not _same_ambient(left, right):
        raise TypeError("modular forms must have the same ambient space")
    if _same_parent(left, right):
        return left
    left_kind = _space_kind(left)
    right_kind = _space_kind(right)
    if left_kind == "Ambient":
        return left
    if right_kind == "Ambient":
        return right
    cuspidal = ["Cuspidal", "Old", "New"]
    if left_kind in cuspidal and right_kind in cuspidal:
        return _ambient(left).cuspidal_subspace()
    return _ambient(left)


def _as_classical(value: Any, precision: int) -> ClassicalModularFormElement:
    if isinstance(value, ClassicalModularFormElement):
        return value
    if not all(hasattr(value, name) for name in ["level", "weight", "q_expansion"]):
        raise TypeError("expected a classical modular form")
    character = value.character() if hasattr(value, "character") else None
    if hasattr(value, "group") and value.group()._family == "Gamma1":
        defining_data = value.group()
    else:
        defining_data = (
            character
            if runtime.reflect.get(runtime.reflect.get(character, "_parent"), "_kind")
            == "DirichletGroup"
            else value.level()
        )
    parent = _global("ModularForms")(
        defining_data,
        value.weight(),
        value.base_ring() if hasattr(value, "base_ring") else sage.QQ,
        True,
        precision,
    )
    return construct_element(parent, value, precision)


def _lcm(left: int, right: int) -> int:
    gcd = runtime.number(_global("gcd")(left, right))
    return left * right // gcd


def _induced_character(character: Any, level: int) -> Any:
    """Return the character induced to a divisible target modulus."""
    if level % runtime.number(character.modulus()) != 0:
        raise ValueError("target level must be divisible by the character modulus")
    group = _global("DirichletGroup")(level)
    units = group.unit_gens()
    for candidate in group:
        if all(
            runtime.flint_backend().qqbarEqual(
                candidate(unit)._native,
                character(unit)._native,
            )
            for unit in units
        ):
            return candidate
    raise ArithmeticError("could not induce the Dirichlet character")


def _product_character(left: Any, right: Any, level: int) -> Any:
    return _induced_character(left, level) * _induced_character(right, level)


@runtime.lightweight_math_class
class ClassicalModularFormElement(sage.Element):
    """An exact coordinate element in a classical modular-form parent."""

    def __init__(
        self,
        parent: Any,
        coordinates: Any,
        display_precision: Any = None,
    ) -> None:
        self._kind = "ClassicalModularFormElement"
        self._parent = parent
        self._coordinates = _coordinate_vector(parent, coordinates)
        self._display_precision = _display_precision(parent, display_precision)
        self._qexp_cache = runtime.map()
        runtime.object.freeze(self)

    def parent(self) -> Any:
        return self._parent

    def ambient_space(self) -> Any:
        return _ambient(self._parent)

    def group(self) -> Any:
        return self.ambient_space().group()

    def level(self) -> int:
        return self.ambient_space().level()

    def weight(self) -> int:
        return self.ambient_space().weight()

    def base_ring(self) -> Any:
        return self.ambient_space().base_ring()

    def character(self) -> Any:
        return self.ambient_space().character()

    def vector(self) -> Any:
        return self._coordinates

    coordinates = vector
    element = vector

    def ambient_coordinates(self) -> Any:
        return coordinates(self.ambient_space(), self)

    def precision(self) -> int:
        return self._display_precision

    prec = precision

    def q_expansion(self, prec: Any = None, variable: str = "q") -> Any:
        r"""Return the `q`-expansion to exact absolute precision `prec`.

        The series is reconstructed lazily from exact canonical coordinates.
        The parent selects the available certified basis engine; coefficient
        arithmetic uses the exact Sage.js/FLINT power-series backend.
        """
        precision = (
            self._display_precision
            if prec is None
            else _nonnegative(prec, "display precision")
        )
        key = variable + "|" + str(precision)
        cached = self._qexp_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        basis_series = _space_q_expansion_basis(self._parent, precision, variable)
        answer = _zero_series(self._parent, precision, variable)
        series_ring = answer.parent()
        coefficient_ring = self.base_ring()
        for index in range(len(basis_series)):
            coefficient = self._coordinates[index]
            if coefficient != 0:
                answer += series_ring(
                    [
                        coefficient * coefficient_ring(basis_series[index][exponent])
                        for exponent in range(precision)
                    ]
                ).add_bigoh(precision)
        answer = answer.add_bigoh(precision)
        self._qexp_cache.set(key, answer)
        return answer

    qexp = q_expansion

    def __getitem__(self, exponent: Any) -> Any:
        index = _nonnegative(exponent, "coefficient exponent")
        return self.q_expansion(index + 1)[index]

    def is_zero(self) -> bool:
        return all(value == 0 for value in self._coordinates)

    def constant_coefficient(self) -> Any:
        return self.q_expansion(1)[0]

    def is_cuspidal(self) -> bool:
        if _space_kind(self._parent) in ["Cuspidal", "Old", "New"]:
            return True
        return contains(self.ambient_space().cuspidal_subspace(), self)

    def valuation(self) -> int:
        r"""Return the exact order of vanishing at $q=0$."""
        if self.is_zero():
            raise ValueError("the valuation of zero is infinity")
        precision = _sturm_precision(self.ambient_space()) + 1
        expansion = self.q_expansion(precision)
        for exponent in range(precision):
            if expansion[exponent] != 0:
                return exponent
        raise ArithmeticError("the Sturm valuation bound failed")

    def provenance(self) -> str:
        return "canonical-parent-coordinates"

    def _as_exact_level_one_form(self) -> Any:
        if self.level() != 1:
            return None
        from .qexp import ExactModularForm, level_one_basis_certificate

        parent = self.ambient_space()
        precision = max(self.precision(), parent.sturm_bound() + 1)
        certificate = level_one_basis_certificate(parent, precision, False)
        expansion_basis = certificate.q_expansion_basis(precision)
        coefficient_matrix = _matrix_from_series(expansion_basis, precision)
        expansion = self.q_expansion(precision)
        target = _global("vector")(
            sage.QQ,
            [expansion[index] for index in range(precision)],
        )
        construction_coordinates = coefficient_matrix.solve_left(target)
        terms = []
        for row, form in enumerate(certificate.basis()):
            for coefficient, exponent_four, exponent_six in form.construction():
                terms.append(
                    (
                        construction_coordinates[row] * coefficient,
                        exponent_four,
                        exponent_six,
                    )
                )
        return ExactModularForm(
            parent,
            terms,
            self.precision(),
            "coerced-parented-level-one-form",
        )

    def hecke(self, index: Any) -> ClassicalModularFormElement:
        return hecke_operator(self._parent, index)(self)

    def _classical_other(self, other: Any) -> ClassicalModularFormElement:
        return _as_classical(other, self._display_precision)

    def __add__(self, other: Any) -> ClassicalModularFormElement:
        if not isinstance(other, ClassicalModularFormElement):
            try:
                scalar = self.base_ring()(other)
            except Exception:
                scalar = None
            if scalar is not None:
                if scalar == 0:
                    return self
                raise TypeError(
                    "a positive-weight modular form cannot be added to a scalar"
                )
            other = self._classical_other(other)
        target = _common_additive_parent(self._parent, other.parent())
        return ClassicalModularFormElement(
            target,
            construct_element(target, self).vector()
            + construct_element(target, other).vector(),
            min(self._display_precision, other.precision()),
        )

    def __radd__(self, other: Any) -> ClassicalModularFormElement:
        return self.__add__(other)

    def __sub__(self, other: Any) -> ClassicalModularFormElement:
        if isinstance(other, ClassicalModularFormElement):
            return self.__add__(-other)
        try:
            scalar = self.base_ring()(other)
        except Exception:
            return self.__add__(-self._classical_other(other))
        if scalar == 0:
            return self
        raise TypeError(
            "a positive-weight modular form cannot be subtracted from a scalar"
        )

    def __rsub__(self, other: Any) -> ClassicalModularFormElement:
        return (-self).__add__(other)

    def __neg__(self) -> ClassicalModularFormElement:
        return ClassicalModularFormElement(
            self._parent,
            -self._coordinates,
            self._display_precision,
        )

    def __mul__(self, other: Any) -> ClassicalModularFormElement:
        if not isinstance(other, ClassicalModularFormElement):
            try:
                scalar = self.base_ring()(other)
                return ClassicalModularFormElement(
                    self._parent,
                    self._coordinates * scalar,
                    self._display_precision,
                )
            except Exception:
                other = self._classical_other(other)
        level = _lcm(self.level(), other.level())
        display_precision = min(self._display_precision, other.precision())
        left_gamma1 = self.group()._family == "Gamma1"
        right_gamma1 = other.group()._family == "Gamma1"
        if left_gamma1 or right_gamma1:
            if not (left_gamma1 and right_gamma1):
                raise NotImplementedError(
                    "products mixing Gamma1 and fixed-character parents are "
                    "not yet represented over a common coefficient ring"
                )
            defining_data = _global("Gamma1")(level)
        else:
            defining_data = _product_character(
                self.character(), other.character(), level
            )
        target = _global("ModularForms")(
            defining_data,
            self.weight() + other.weight(),
            None,
            True,
            display_precision,
        )
        proof_precision = _sturm_precision(target)
        target_ring = target.base_ring()
        power_series_ring = _global("PowerSeriesRing")(
            target_ring,
            "q",
            default_prec=max(1, proof_precision),
        )
        left = self.q_expansion(proof_precision)
        right = other.q_expansion(proof_precision)
        product = power_series_ring(
            [target_ring(left[index]) for index in range(proof_precision)]
        ) * power_series_ring(
            [target_ring(right[index]) for index in range(proof_precision)]
        )
        product = product.add_bigoh(proof_precision)
        return construct_element(target, product, display_precision)

    def __rmul__(self, other: Any) -> ClassicalModularFormElement:
        return self.__mul__(other)

    def __truediv__(self, other: Any) -> ClassicalModularFormElement:
        if isinstance(other, ClassicalModularFormElement) or hasattr(
            other, "q_expansion"
        ):
            raise TypeError("division by a modular form is not holomorphic arithmetic")
        scalar = self.base_ring()(other)
        if scalar == 0:
            raise sage.ZeroDivisionError("division by zero")
        return ClassicalModularFormElement(
            self._parent,
            self._coordinates * (self.base_ring()(1) / scalar),
            self._display_precision,
        )

    def __pow__(self, exponent: Any) -> ClassicalModularFormElement:
        power = _nonnegative(exponent, "exponent")
        if power == 0:
            raise NotImplementedError(
                "the degree-zero modular-form parent is not in this slice"
            )
        answer = self
        for _index in range(1, power):
            answer = answer * self
        return answer

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
        if not isinstance(other, ClassicalModularFormElement):
            return False
        if not _same_ambient(self._parent, other.parent()):
            return False
        common_parent = _common_additive_parent(self._parent, other.parent())
        try:
            return (
                construct_element(common_parent, self).vector()
                == construct_element(common_parent, other).vector()
            )
        except (ArithmeticError, TypeError, ValueError):
            return False

    def __hash__(self) -> int:
        coordinates_value = self.ambient_coordinates()
        character = self.character()
        character_number = None if character is None else character.conrey_number()
        return hash(
            (
                self.level(),
                self.weight(),
                character_number,
                tuple(str(value) for value in coordinates_value),
            )
        )

    def __repr__(self) -> str:
        return str(self.q_expansion())

    __str__ = __repr__
    toString = __repr__


def _hecke_image_matrix(space: Any, index: int, precision: int) -> Any:
    required = index * (precision - 1) + 1
    source = _space_q_expansion_basis(space, required)
    rows = []
    weight = space.weight()
    if weight < 1:
        raise NotImplementedError("Hecke action currently requires positive weight")
    level = space.level()
    divisors = _global("divisors")
    gcd = _global("gcd")
    coefficient_ring = space.base_ring()
    character = space.character()
    for form in source:
        row = []
        for exponent in range(precision):
            common = index if exponent == 0 else runtime.number(gcd(index, exponent))
            coefficient = coefficient_ring(0)
            for divisor_value in divisors(common):
                divisor = runtime.number(divisor_value)
                if runtime.number(gcd(divisor, level)) != 1:
                    continue
                source_index = exponent * index // (divisor * divisor)
                character_value = character(divisor)
                if coefficient_ring is sage.QQ:
                    if character_value.is_zero():
                        character_value = sage.QQ(0)
                    elif character_value.is_one():
                        character_value = sage.QQ(1)
                    elif (-character_value).is_one():
                        character_value = sage.QQ(-1)
                    else:
                        raise ArithmeticError(
                            "a rational character produced a nonrational value"
                        )
                else:
                    character_value = coefficient_ring(character_value)
                coefficient += (
                    character_value
                    * sage.ZZ(divisor) ** (weight - 1)
                    * form[source_index]
                )
            row.append(coefficient)
        rows.append(row)
    return (
        _global("matrix")(coefficient_ring, rows)
        if rows
        else _global("matrix")(coefficient_ring, 0, precision)
    )


def _modular_symbols_qexp_source(space: Any) -> Any:
    """Return the symbol space underlying this canonical coordinate basis."""
    kind = _space_kind(space)
    if kind == "New":
        return space._modular_symbols_cusp_space()
    if kind != "Cuspidal":
        return None
    if runtime.reflect.get(_ambient(space), "_character") is not None:
        return space._modular_symbols_cusp_space()
    if space.level() != 1:
        dimension = space.dimension()
        divisors = [runtime.number(value) for value in sage.divisors(space.level())]
        formula_bound = runtime.number(
            _global("dimension_cusp_forms")(1, space.weight())
        ) * len(divisors)
        if formula_bound < dimension and len(divisors) <= 4:
            current = [0 for _divisor in divisors]
            exponent_sum = 2 * space.weight()

            def count_eta_vectors(position: int, remaining: int) -> None:
                nonlocal formula_bound
                if formula_bound >= dimension:
                    return
                if position == len(divisors) - 1:
                    current[position] = remaining
                    left = 0
                    right = 0
                    level = space.level()
                    for vector_index, divisor in enumerate(divisors):
                        left += divisor * current[vector_index]
                        right += (level // divisor) * current[vector_index]
                    if left % 24 == 0 and right % 24 == 0:
                        formula_bound += 1
                    return
                for exponent in range(remaining + 1):
                    current[position] = exponent
                    count_eta_vectors(position + 1, remaining - exponent)
                    if formula_bound >= dimension:
                        return

            count_eta_vectors(0, exponent_sum)
            if formula_bound < dimension:
                return space._modular_symbols_cusp_space()
        from .qexp_algebra import formula_candidate_upper_bound

        if formula_candidate_upper_bound(space, dimension) < dimension:
            return space._modular_symbols_cusp_space()
    receipt = space.q_expansion_algorithm_receipt(
        "auto",
        _sturm_precision(space),
    )
    if receipt.selected_algorithm() != "modular_symbols":
        return None
    return space._modular_symbols_cusp_space()


def hecke_matrix(space: Any, index: Any) -> Any:
    """Return the exact matrix of $T_n$ or the appropriate bad-prime action."""
    hecke_index = _positive(index, "Hecke index")
    cache = _hecke_cache(space)
    key = str(hecke_index)
    cached = cache.get(key)
    if cached is not runtime.undefined:
        return cached
    if _is_gamma1(space):
        from . import gamma1

        answer = gamma1.hecke_matrix(space, hecke_index)
        cache.set(key, answer)
        return answer
    precision = _sturm_precision(space)
    symbol_source = _modular_symbols_qexp_source(space)
    if symbol_source is not None:
        answer = symbol_source._q_expansion_hecke_matrix(hecke_index, precision)
        cache.set(key, answer)
        return answer
    basis_matrix = _basis_matrix(space, precision)
    image_matrix = _hecke_image_matrix(space, hecke_index, precision)
    if space.dimension() == 0:
        answer = _global("matrix")(space.base_ring(), 0, 0)
    else:
        try:
            answer = basis_matrix.solve_left(image_matrix)
        except Exception as error:
            raise ValueError(
                "this modular-form subspace is not stable under T_" + str(hecke_index)
            ) from error
        if answer * basis_matrix != image_matrix:
            raise ValueError(
                "this modular-form subspace is not stable under T_" + str(hecke_index)
            )
    cache.set(key, answer)
    return answer


@runtime.lightweight_math_class
class ClassicalModularFormsHeckeOperator:
    """An exact Hecke operator on a parented classical modular-form space."""

    def __init__(self, space: Any, index: Any) -> None:
        self._kind = "ClassicalModularFormsHeckeOperator"
        self._space = space
        self._index = _positive(index, "Hecke index")
        self._matrix = hecke_matrix(space, self._index)
        runtime.object.freeze(self)

    def domain(self) -> Any:
        return self._space

    codomain = domain

    def index(self) -> int:
        return self._index

    def matrix(self) -> Any:
        return self._matrix

    def charpoly(self, variable: str = "x") -> Any:
        return self._matrix.charpoly(variable)

    characteristic_polynomial = charpoly

    def __call__(self, value: Any) -> ClassicalModularFormElement:
        element = construct_element(self._space, value)
        return ClassicalModularFormElement(
            self._space,
            element.vector() * self._matrix,
            element.precision(),
        )

    def __repr__(self) -> str:
        return "Hecke operator T_" + str(self._index) + " on " + str(self._space)

    __str__ = __repr__
    toString = __repr__


def hecke_operator(space: Any, index: Any) -> ClassicalModularFormsHeckeOperator:
    """Return the exact parented Hecke operator $T_n$ on `space`."""
    return ClassicalModularFormsHeckeOperator(space, index)


def diamond_bracket_matrix(space: Any, value: Any) -> Any:
    r"""Return the exact diamond-bracket matrix on a $\Gamma_1$ space."""
    if not _is_gamma1(space):
        raise NotImplementedError(
            "diamond operators on parented modular forms currently require Gamma1"
        )
    from . import gamma1

    return gamma1.diamond_bracket_matrix(space, value)


@runtime.lightweight_math_class
class ClassicalModularFormsDiamondOperator:
    r"""An exact diamond operator on a parented $\Gamma_1$ space."""

    def __init__(self, space: Any, value: Any) -> None:
        self._kind = "ClassicalModularFormsDiamondOperator"
        self._space = space
        self._value = _integer(value, "diamond-bracket index")
        self._matrix = diamond_bracket_matrix(space, self._value)
        runtime.object.freeze(self)

    def domain(self) -> Any:
        return self._space

    codomain = domain

    def index(self) -> int:
        return self._value

    def matrix(self) -> Any:
        return self._matrix

    def charpoly(self, variable: str = "x") -> Any:
        return self._matrix.charpoly(variable)

    characteristic_polynomial = charpoly

    def __call__(self, value: Any) -> ClassicalModularFormElement:
        element = construct_element(self._space, value)
        return ClassicalModularFormElement(
            self._space,
            element.vector() * self._matrix,
            element.precision(),
        )

    def __repr__(self) -> str:
        return (
            "Diamond bracket operator <" + str(self._value) + "> on " + str(self._space)
        )

    __str__ = __repr__
    toString = __repr__


def diamond_bracket_operator(
    space: Any,
    value: Any,
) -> ClassicalModularFormsDiamondOperator:
    """Return the exact parented diamond operator `<value>` on `space`."""
    return ClassicalModularFormsDiamondOperator(space, value)


_element_prototype = runtime.reflect.get(ClassicalModularFormElement, "prototype")
_q_expansion_method = runtime.reflect.get(_element_prototype, "q_expansion")
runtime.reflect.set(
    _q_expansion_method,
    "__module__",
    "sage.modular.modform.element",
)
runtime.register_doc(
    "ClassicalModularFormElement.q_expansion",
    _q_expansion_method,
    {
        "kind": "method",
        "module": "sage.modular.modform.element",
        "tags": ["modular forms", "q-expansions", "power series"],
        "backends": ["FLINT", "Sage.js certified basis engines"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": (
                "Returns an exact power series with Sage-style absolute "
                "precision notation."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath modular-form element API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/"
                    "modfrm/sage/modular/modform/element.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": "Canonical-coordinate reconstruction layer",
            },
        ],
        "implementation": {
            "algorithm": (
                "Exact linear combination of a cached certified canonical basis"
            ),
        },
        "limitations": [
            (
                "The current object layer supports integral-weight Gamma0 "
                "spaces with trivial or Dirichlet character and Gamma1 spaces "
                "over QQ; weight one and general GammaH parents remain outside "
                "this slice."
            ),
        ],
    },
)


__all__ = [
    "ClassicalModularFormElement",
    "ClassicalModularFormsDiamondOperator",
    "ClassicalModularFormsHeckeOperator",
    "basis",
    "construct_element",
    "contains",
    "coordinates",
    "diamond_bracket_matrix",
    "diamond_bracket_operator",
    "hecke_matrix",
    "hecke_operator",
    "q_expansion_basis",
    "zero",
]
