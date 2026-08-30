r"""Certified exact algebra for truncated modular-form $q$-expansions.

The objects in this module distinguish a proved modular form from a bare power
series.  Each object retains an exact source or a finite construction tree;
its certificate replays that tree and checks the resulting weight, level,
nebentypus, precision, and coefficients.

The initial twisting domain is deliberately bounded: primitive real Dirichlet
characters of conductor at most $4096$.  In that domain all character values
are $0$ or $\pm1$, so twisting preserves the exact coefficient ring.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

MAX_EXACT_TWIST_CONDUCTOR = 4096


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


def _positive(value: Any, label: str) -> int:
    answer = _integer(value, label)
    if answer <= 0:
        raise ValueError(label + " must be positive")
    return answer


def _lcm(left: Any, right: Any) -> int:
    left = _positive(left, "left lcm argument")
    right = _positive(right, "right lcm argument")
    return left * right // _integer(_global("gcd")(left, right), "gcd")


def _kind(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if value_type != "object" and value_type != "function":
        return runtime.undefined
    return runtime.reflect.get(value, "_kind")


def _series_precision(series: Any) -> int:
    precision = series.precision_absolute()
    if precision is None:
        raise ValueError("a certified q-expansion must have finite precision")
    return _nonnegative(precision, "q-expansion precision")


def _series_ring(base_ring: Any, variable: str, precision: int) -> Any:
    return _global("PowerSeriesRing")(
        base_ring,
        variable,
        default_prec=max(1, precision),
    )


def _change_series_variable(series: Any, precision: int, variable: str) -> Any:
    ring = _series_ring(series.parent().base_ring(), variable, precision)
    return ring(series.padded_list(precision)).add_bigoh(precision)


def _character_key(character: Any) -> tuple[int, int]:
    modulus = _positive(character.modulus(), "character modulus")
    if hasattr(character, "conrey_number"):
        label = _positive(character.conrey_number(), "Conrey number")
    else:
        raise TypeError("Dirichlet characters must expose a Conrey number")
    return modulus, label


def _character_value_in_field(
    character: Any, value: int, field: Any, order: int
) -> Any:
    evaluated = character(value)
    if evaluated.is_zero():
        return field(0)
    source_order = _positive(character.parent().zeta_order(), "character value order")
    exponent = _nonnegative(evaluated._exponent, "root-of-unity exponent")
    return field.gen() ** (exponent * order // source_order)


@runtime.lightweight_math_class
class ExactNebentypus:
    """An exact symbolic product of Dirichlet characters at a stated modulus."""

    def __init__(self, modulus: Any, factors: Any = ()) -> None:
        self._kind = "ExactNebentypus"
        self._modulus = _positive(modulus, "nebentypus modulus")
        combined: dict[tuple[int, int], list[Any]] = {}
        for character, raw_exponent in factors:
            if not all(
                hasattr(character, method)
                for method in ["modulus", "order", "conrey_number", "__call__"]
            ):
                raise TypeError("nebentypus factors must be Dirichlet characters")
            character_modulus = _positive(character.modulus(), "character modulus")
            if self._modulus % character_modulus:
                raise ValueError("the nebentypus modulus must contain every factor")
            order = _positive(character.order(), "character order")
            exponent = _integer(raw_exponent, "character exponent") % order
            if exponent == 0 or character.is_principal():
                continue
            key = _character_key(character)
            if key in combined:
                combined[key][1] = (combined[key][1] + exponent) % order
            else:
                combined[key] = [character, exponent]
        normalized = []
        for key in sorted(combined):
            character, exponent = combined[key]
            if exponent:
                normalized.append((character, exponent))
        self._factors = runtime.math_tuple(normalized)
        value_order = 1
        for character, _exponent in self._factors:
            value_order = _lcm(value_order, character.parent().zeta_order())
        self._value_order = value_order
        self._value_field = (
            sage.QQ if value_order == 1 else _global("CyclotomicField")(value_order)
        )
        runtime.object.freeze(self)

    @classmethod
    def trivial(cls, modulus: Any) -> ExactNebentypus:
        return cls(modulus)

    @classmethod
    def from_character(cls, character: Any, modulus: Any) -> ExactNebentypus:
        if isinstance(character, ExactNebentypus):
            return character.lift(modulus)
        if character is None or character.is_principal():
            return cls.trivial(modulus)
        return cls(modulus, ((character, 1),))

    def modulus(self) -> int:
        return self._modulus

    def factors(self) -> tuple[tuple[Any, int], ...]:
        return self._factors

    def value_field(self) -> Any:
        return self._value_field

    def conductor_bound(self) -> int:
        """Return a certified multiple of the primitive conductor."""
        answer = 1
        for character, _exponent in self._factors:
            answer = _lcm(answer, character.conductor())
        return answer

    def is_trivial(self) -> bool:
        return len(self._factors) == 0

    is_principal = is_trivial

    def lift(self, modulus: Any) -> ExactNebentypus:
        target = _positive(modulus, "target character modulus")
        if target % self._modulus:
            raise ValueError("a nebentypus may only be lifted to a multiple modulus")
        return ExactNebentypus(target, self._factors)

    def __call__(self, value: Any) -> Any:
        value = _integer(value, "character argument")
        if _integer(_global("gcd")(value, self._modulus), "gcd") != 1:
            return self._value_field(0)
        answer = self._value_field(1)
        for character, exponent in self._factors:
            answer *= (
                _character_value_in_field(
                    character,
                    value,
                    self._value_field,
                    self._value_order,
                )
                ** exponent
            )
        return answer

    def __mul__(self, other: Any) -> ExactNebentypus:
        if not isinstance(other, ExactNebentypus):
            raise TypeError("nebentypus products require exact nebentypus objects")
        modulus = _lcm(self._modulus, other._modulus)
        return ExactNebentypus(modulus, self._factors + other._factors)

    def __pow__(self, exponent: Any) -> ExactNebentypus:
        exponent = _integer(exponent, "nebentypus exponent")
        return ExactNebentypus(
            self._modulus,
            tuple((character, power * exponent) for character, power in self._factors),
        )

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ExactNebentypus):
            return False
        if self._modulus != other._modulus or len(self._factors) != len(other._factors):
            return False
        for left, right in zip(self._factors, other._factors, strict=True):
            if (
                _character_key(left[0]) != _character_key(right[0])
                or left[1] != right[1]
            ):
                return False
        return True

    def __repr__(self) -> str:
        if self.is_trivial():
            return "Trivial character modulo " + str(self._modulus)
        pieces = []
        for character, exponent in self._factors:
            label = "chi_" + str(character.conrey_number())
            if exponent != 1:
                label += "^" + str(exponent)
            pieces.append(label)
        return "*".join(pieces) + " modulo " + str(self._modulus)

    __str__ = __repr__
    toString = __repr__


@runtime.lightweight_math_class
class OldformMetadata:
    """Exact provenance for one degeneracy image from a proper level."""

    def __init__(self, source_level: Any, target_level: Any, factor: Any) -> None:
        self._source_level = _positive(source_level, "oldform source level")
        self._target_level = _positive(target_level, "oldform target level")
        self._factor = _positive(factor, "degeneracy factor")
        if self._target_level % (self._source_level * self._factor):
            raise ValueError("oldform target level must contain source_level*factor")
        runtime.object.freeze(self)

    def source_level(self) -> int:
        return self._source_level

    def target_level(self) -> int:
        return self._target_level

    def factor(self) -> int:
        return self._factor

    def __repr__(self) -> str:
        return (
            "Oldform degeneracy image V_"
            + str(self._factor)
            + " from level "
            + str(self._source_level)
            + " to level "
            + str(self._target_level)
        )

    __str__ = __repr__
    toString = __repr__


@runtime.lightweight_math_class
class CertifiedModularForm(sage.Element):
    """A finite exact $q$-expansion with replayable modular-form provenance."""

    def __init__(
        self,
        series: Any,
        weight: Any,
        level: Any,
        character: ExactNebentypus,
        cuspidal: bool,
        recipe: Any,
        provenance: str,
        oldform_metadata: Any = None,
    ) -> None:
        self._kind = "CertifiedModularForm"
        self._series = series
        self._precision = _series_precision(series)
        self._weight = _nonnegative(weight, "weight")
        self._level = _positive(level, "level")
        if not isinstance(character, ExactNebentypus):
            raise TypeError(
                "a certified modular form requires exact nebentypus metadata"
            )
        if character.modulus() != self._level:
            raise ValueError("the nebentypus modulus must equal the certified level")
        self._character = character
        self._cuspidal = bool(cuspidal)
        self._recipe = runtime.math_tuple(recipe)
        self._provenance = str(provenance)
        self._oldform_metadata = oldform_metadata
        runtime.object.freeze(self)

    def weight(self) -> int:
        return self._weight

    def level(self) -> int:
        return self._level

    def group(self) -> Any:
        return _global("Gamma0")(self._level)

    def character(self) -> ExactNebentypus:
        return self._character

    nebentypus = character

    def base_ring(self) -> Any:
        return self._series.parent().base_ring()

    def precision(self) -> int:
        return self._precision

    prec = precision

    def valuation(self) -> int:
        return _nonnegative(self._series.valuation(), "q-expansion valuation")

    def relative_precision(self) -> int:
        return self._precision - self.valuation()

    def provenance(self) -> str:
        return self._provenance

    def is_cuspidal(self) -> bool:
        return self._cuspidal

    def is_oldform(self) -> bool:
        return self._oldform_metadata is not None

    def oldform_metadata(self) -> Any:
        return self._oldform_metadata

    def construction(self) -> Any:
        return self._recipe

    def q_expansion(self, prec: Any = None, variable: str = "q") -> Any:
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        if precision > self._precision:
            raise ValueError(
                "requested precision exceeds this certified finite q-expansion"
            )
        if variable == "q":
            return self._series.add_bigoh(precision)
        return _change_series_variable(self._series, precision, variable)

    qexp = q_expansion

    def __getitem__(self, exponent: Any) -> Any:
        exponent = _nonnegative(exponent, "coefficient exponent")
        if exponent >= self._precision:
            raise IndexError("coefficient lies beyond the certified precision")
        return self._series[exponent]

    def certificate(self) -> QExpansionAlgebraCertificate:
        return QExpansionAlgebraCertificate(self)

    def _same_coefficient_ring(self, other: CertifiedModularForm) -> None:
        if self.base_ring() is not other.base_ring():
            raise TypeError("q-expansion algebra requires one exact coefficient ring")

    def _common_character(
        self, other: CertifiedModularForm
    ) -> tuple[int, ExactNebentypus, ExactNebentypus]:
        level = _lcm(self._level, other._level)
        return level, self._character.lift(level), other._character.lift(level)

    def __add__(self, other: Any) -> CertifiedModularForm:
        other = certified_modular_form(
            other, min(self._precision, _source_precision(other))
        )
        self._same_coefficient_ring(other)
        if self._weight != other._weight:
            raise TypeError("modular-form sums require equal weights")
        level, left_character, right_character = self._common_character(other)
        if left_character != right_character:
            raise TypeError("modular-form sums require equal nebentypus")
        series = self._series + other._series
        return CertifiedModularForm(
            series,
            self._weight,
            level,
            left_character,
            self._cuspidal and other._cuspidal,
            ("sum", self, other),
            "certified-sum",
        )

    def __radd__(self, other: Any) -> CertifiedModularForm:
        return self.__add__(other)

    def __sub__(self, other: Any) -> CertifiedModularForm:
        precision = min(self._precision, _source_precision(other))
        return self.__add__(-certified_modular_form(other, precision))

    def __rsub__(self, other: Any) -> CertifiedModularForm:
        return certified_modular_form(other, self._precision).__sub__(self)

    def __neg__(self) -> CertifiedModularForm:
        return CertifiedModularForm(
            -self._series,
            self._weight,
            self._level,
            self._character,
            self._cuspidal,
            ("scale", self, self.base_ring()(-1)),
            "certified-scalar-multiple",
            self._oldform_metadata,
        )

    def __mul__(self, other: Any) -> CertifiedModularForm:
        if not isinstance(other, CertifiedModularForm) and _kind(other) not in [
            "ExactModularForm",
            "EisensteinSeriesElement",
            "NormalizedNewform",
        ]:
            scalar = self.base_ring()(other)
            return CertifiedModularForm(
                self._series * scalar,
                self._weight,
                self._level,
                self._character,
                self._cuspidal,
                ("scale", self, scalar),
                "certified-scalar-multiple",
                self._oldform_metadata,
            )
        # Do not truncate either operand before multiplication.  For
        # $f+O(q^P)$ and $g+O(q^Q)$ the exact product is known through
        # $q^{\min(P+v(g),Q+v(f))}$, which can be strictly farther than
        # $\min(P,Q)$.  The power-series engine computes this valuation-aware
        # bound from the two original finite expansions.
        other = certified_modular_form(other, _source_precision(other))
        self._same_coefficient_ring(other)
        level, left_character, right_character = self._common_character(other)
        character = left_character * right_character
        series = self._series * other._series
        return CertifiedModularForm(
            series,
            self._weight + other._weight,
            level,
            character,
            self._cuspidal or other._cuspidal,
            ("product", self, other),
            "certified-product",
        )

    def __rmul__(self, other: Any) -> CertifiedModularForm:
        return self.__mul__(other)

    def _sage_binop_(self, operator: str, other: Any, reflected: bool) -> Any:
        if operator == "add":
            return self.__radd__(other) if reflected else self.__add__(other)
        if operator == "sub":
            return self.__rsub__(other) if reflected else self.__sub__(other)
        if operator == "mul":
            return self.__rmul__(other) if reflected else self.__mul__(other)
        raise TypeError("unsupported certified modular-form operation " + operator)

    def lift_level(self, level: Any) -> CertifiedModularForm:
        target = _positive(level, "target level")
        if target % self._level:
            raise ValueError("a modular form may only be lifted to a multiple level")
        if target == self._level:
            return self
        metadata = OldformMetadata(self._level, target, 1)
        return CertifiedModularForm(
            self._series,
            self._weight,
            target,
            self._character.lift(target),
            self._cuspidal,
            ("level-lift", self, target),
            "certified-level-lift",
            metadata,
        )

    def V(self, factor: Any) -> CertifiedModularForm:
        r"""Return the exact degeneracy image $V_d f(q)=f(q^d)$."""
        factor = _positive(factor, "degeneracy factor")
        if factor == 1:
            return self
        target_level = self._level * factor
        target_precision = self._precision * factor
        series = self._series._inflate(factor, target_precision)
        metadata = OldformMetadata(self._level, target_level, factor)
        return CertifiedModularForm(
            series,
            self._weight,
            target_level,
            self._character.lift(target_level),
            self._cuspidal,
            ("V", self, factor),
            "certified-degeneracy-map",
            metadata,
        )

    def twist(self, character: Any) -> CertifiedModularForm:
        r"""Twist by a primitive real character in the bounded exact domain."""
        if not all(
            hasattr(character, method)
            for method in ["modulus", "conductor", "order", "is_real", "is_primitive"]
        ):
            raise TypeError("twists require a Dirichlet character")
        conductor = _positive(character.conductor(), "twist conductor")
        if conductor > MAX_EXACT_TWIST_CONDUCTOR:
            raise ValueError(
                "twist conductor exceeds the certified exact bound "
                + str(MAX_EXACT_TWIST_CONDUCTOR)
            )
        if not character.is_primitive():
            raise NotImplementedError(
                "the bounded exact twist domain requires a primitive character"
            )
        if (
            not character.is_real()
            or _positive(character.order(), "character order") > 2
        ):
            raise NotImplementedError(
                "the bounded exact twist domain requires a real character"
            )
        coefficients = []
        for index in range(self._precision):
            value = character(index)
            if value.is_zero():
                scalar = self.base_ring()(0)
            elif value.is_one():
                scalar = self.base_ring()(1)
            elif (-value).is_one():
                scalar = self.base_ring()(-1)
            else:
                raise ArithmeticError(
                    "a real quadratic character had a nonrational value"
                )
            coefficients.append(self._series[index] * scalar)
        ring = _series_ring(self.base_ring(), "q", self._precision)
        series = ring(coefficients).add_bigoh(self._precision)
        character_conductor = self._character.conductor_bound()
        target_level = _lcm(
            self._level,
            _lcm(character_conductor * conductor, conductor * conductor),
        )
        twist_character = ExactNebentypus.from_character(character, target_level) ** 2
        nebentypus = self._character.lift(target_level) * twist_character
        return CertifiedModularForm(
            series,
            self._weight,
            target_level,
            nebentypus,
            self._cuspidal,
            ("twist", self, character),
            "certified-quadratic-twist",
        )

    def __repr__(self) -> str:
        return (
            str(self._series)
            + " (weight "
            + str(self._weight)
            + ", level "
            + str(self._level)
            + ", "
            + str(self._character)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


def _source_precision(source: Any) -> int:
    if isinstance(source, CertifiedModularForm):
        return source.precision()
    if hasattr(source, "prec"):
        return _nonnegative(source.prec(), "source precision")
    if hasattr(source, "parent") and hasattr(source.parent(), "precision"):
        return _nonnegative(source.parent().precision(), "source precision")
    return 10


def _source_character(source: Any, level: int) -> ExactNebentypus:
    if hasattr(source, "character"):
        character = source.character()
        return ExactNebentypus.from_character(character, level)
    return ExactNebentypus.trivial(level)


def _recognized_source(source: Any) -> bool:
    return _kind(source) in [
        "ExactModularForm",
        "EisensteinSeriesElement",
        "NormalizedNewform",
    ]


def _oldform_signature(metadata: Any) -> Any:
    if metadata is None:
        return None
    return (
        metadata.source_level(),
        metadata.target_level(),
        metadata.factor(),
    )


def certified_modular_form(source: Any, prec: Any = None) -> CertifiedModularForm:
    """Certify a recognized exact modular-form element through finite precision."""
    if isinstance(source, CertifiedModularForm):
        if prec is None or _nonnegative(prec, "precision") == source.precision():
            return source
        precision = _nonnegative(prec, "precision")
        if precision > source.precision():
            raise ValueError("cannot extend a finite certified q-expansion")
        return CertifiedModularForm(
            source.q_expansion(precision),
            source.weight(),
            source.level(),
            source.character(),
            source.is_cuspidal(),
            ("truncate", source, precision),
            "certified-truncation",
            source.oldform_metadata(),
        )
    if not _recognized_source(source):
        raise TypeError(
            "certified_modular_form requires an exact Sage.js modular-form element"
        )
    precision = (
        _source_precision(source) if prec is None else _nonnegative(prec, "precision")
    )
    level = _positive(source.level(), "source level")
    series = source.q_expansion(precision)
    kind = _kind(source)
    cuspidal = (
        bool(source.is_cuspidal())
        if hasattr(source, "is_cuspidal")
        else kind == "NormalizedNewform"
    )
    return CertifiedModularForm(
        series,
        source.weight(),
        level,
        _source_character(source, level),
        cuspidal,
        ("source", source),
        "recognized-exact-source:" + str(kind),
    )


def character_eisenstein_series(
    chi: Any,
    psi: Any,
    weight: Any,
    prec: Any = 10,
    t: Any = 1,
    coefficient_ring: Any = None,
    normalization: str = "linear",
) -> CertifiedModularForm:
    r"""Return the certified form $E_k(\chi,\psi)(q^t)$."""
    from . import qexp

    precision = _nonnegative(prec, "precision")
    inflation = _positive(t, "inflation factor")
    series = qexp.character_eisenstein_series_qexp(
        chi,
        psi,
        weight,
        precision,
        inflation,
        "q",
        coefficient_ring,
        normalization,
    )
    # The coefficient formula uses primitive inducing characters.  Retaining
    # the supplied moduli gives a possibly nonminimal, but always valid, common
    # Gamma0 level and lets the exact symbolic nebentypus retain its sources.
    level = (
        _positive(chi.modulus(), "chi modulus")
        * _positive(psi.modulus(), "psi modulus")
        * inflation
    )
    nebentypus = ExactNebentypus(level, ((chi, 1), (psi, 1)))
    return CertifiedModularForm(
        series,
        weight,
        level,
        nebentypus,
        False,
        (
            "character-eisenstein",
            chi,
            psi,
            _nonnegative(weight, "weight"),
            inflation,
            coefficient_ring,
            normalization,
        ),
        "certified-character-eisenstein-series",
    )


@runtime.lightweight_math_class
class QExpansionAlgebraCertificate:
    """Replay certificate for one exact q-expansion construction tree."""

    def __init__(self, form: CertifiedModularForm) -> None:
        self._form = form
        self._verified = self._verify()
        if not self._verified:
            raise ArithmeticError("q-expansion algebra certificate replay failed")
        runtime.object.freeze(self)

    def form(self) -> CertifiedModularForm:
        return self._form

    def precision(self) -> int:
        return self._form.precision()

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def _verify(self) -> bool:
        form = self._form
        recipe = form.construction()
        kind = recipe[0]
        if kind == "source":
            source = recipe[1]
            if not _recognized_source(source):
                return False
            replay = certified_modular_form(source, form.precision())
        elif kind == "character-eisenstein":
            replay = character_eisenstein_series(
                recipe[1],
                recipe[2],
                recipe[3],
                form.precision(),
                recipe[4],
                recipe[5],
                recipe[6],
            )
        elif kind == "sum":
            if (
                not recipe[1].certificate().verify()
                or not recipe[2].certificate().verify()
            ):
                return False
            replay = recipe[1] + recipe[2]
        elif kind == "product":
            if (
                not recipe[1].certificate().verify()
                or not recipe[2].certificate().verify()
            ):
                return False
            replay = recipe[1] * recipe[2]
        elif kind == "scale":
            if not recipe[1].certificate().verify():
                return False
            replay = recipe[1] * recipe[2]
        elif kind == "level-lift":
            if not recipe[1].certificate().verify():
                return False
            replay = recipe[1].lift_level(recipe[2])
        elif kind == "V":
            if not recipe[1].certificate().verify():
                return False
            replay = recipe[1].V(recipe[2])
        elif kind == "twist":
            if not recipe[1].certificate().verify():
                return False
            replay = recipe[1].twist(recipe[2])
        elif kind == "truncate":
            if not recipe[1].certificate().verify():
                return False
            replay = certified_modular_form(recipe[1], recipe[2])
        else:
            return False
        return (
            replay.weight() == form.weight()
            and replay.level() == form.level()
            and replay.character() == form.character()
            and replay.is_cuspidal() == form.is_cuspidal()
            and _oldform_signature(replay.oldform_metadata())
            == _oldform_signature(form.oldform_metadata())
            and replay.precision() == form.precision()
            and replay.q_expansion() == form.q_expansion()
        )

    def __repr__(self) -> str:
        return (
            "Verified q-expansion algebra certificate in weight "
            + str(self._form.weight())
            + " and level "
            + str(self._form.level())
            + " through q^"
            + str(max(0, self._form.precision() - 1))
        )

    __str__ = __repr__
    toString = __repr__


def _matrix_from_candidates(
    candidates: list[CertifiedModularForm], precision: int
) -> Any:
    matrix_constructor = _global("matrix")
    if len(candidates) == 0:
        return matrix_constructor(sage.QQ, 0, precision)
    rows = [
        [candidate[index] for index in range(precision)] for candidate in candidates
    ]
    return matrix_constructor(sage.QQ, rows).row_space().basis_matrix()


def _series_from_matrix(matrix: Any, precision: int, variable: str) -> list[Any]:
    ring = _series_ring(matrix.base_ring(), variable, precision)
    return [ring(row.list()).add_bigoh(precision) for row in matrix.rows()]


@runtime.lightweight_math_class
class CertifiedFormulaSubspace:
    """The exact contained subspace spanned by certified formula candidates."""

    def __init__(
        self,
        ambient: Any,
        candidates: list[CertifiedModularForm],
        display_precision: int,
        proof_precision: int,
    ) -> None:
        self._kind = "CertifiedFormulaSubspace"
        self._ambient = ambient
        self._candidates = runtime.math_tuple(candidates)
        self._display_precision = display_precision
        self._proof_precision = proof_precision
        self._matrix = _matrix_from_candidates(candidates, proof_precision)
        self._verified = self._verify()
        if not self._verified:
            raise ArithmeticError("formula-generated subspace certificate failed")
        runtime.object.freeze(self)

    def ambient_space(self) -> Any:
        return self._ambient

    def level(self) -> int:
        return self._ambient.level()

    def weight(self) -> int:
        return self._ambient.weight()

    def base_ring(self) -> Any:
        return self._ambient.base_ring()

    def candidates(self) -> list[CertifiedModularForm]:
        return list(self._candidates)

    def dimension(self) -> int:
        return self._matrix.nrows()

    degree = dimension

    def ambient_dimension(self) -> int:
        return self._ambient.dimension()

    def proof_precision(self) -> int:
        return self._proof_precision

    def sturm_bound(self) -> int:
        return self._ambient.sturm_bound()

    def is_full_ambient(self) -> bool:
        return self.dimension() == self.ambient_dimension()

    def is_proper_subspace(self) -> bool:
        return self.dimension() < self.ambient_dimension()

    def coefficient_matrix(self) -> Any:
        return self._matrix

    def q_expansion_basis(self, prec: Any = None, variable: str = "q") -> list[Any]:
        precision = (
            self._display_precision if prec is None else _nonnegative(prec, "precision")
        )
        if precision > self._proof_precision:
            raise ValueError("requested precision exceeds the certified formula data")
        return [
            series.add_bigoh(precision)
            for series in _series_from_matrix(
                self._matrix, self._proof_precision, variable
            )
        ]

    basis = q_expansion_basis

    def q_expansion_module(self, R: Any = None) -> Any:
        """Return the exact coefficient module of the certified formula span."""
        coefficient_ring = sage.QQ if R is None else R
        displayed = self.q_expansion_basis(self._display_precision)
        matrix_constructor = _global("matrix")
        if len(displayed) == 0:
            matrix = matrix_constructor(sage.QQ, 0, self._display_precision)
        else:
            matrix = matrix_constructor(
                sage.QQ,
                [
                    [series[index] for index in range(self._display_precision)]
                    for series in displayed
                ],
            )
        if coefficient_ring is sage.QQ:
            return matrix.row_space()
        if coefficient_ring is sage.ZZ:
            from . import qexp

            return qexp._saturated_integer_row_basis(matrix).row_space()
        raise NotImplementedError("formula q-expansion modules support only QQ and ZZ")

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def _verify(self) -> bool:
        if self._proof_precision <= self.sturm_bound():
            return False
        for candidate in self._candidates:
            if (
                not candidate.certificate().verify()
                or candidate.level() != self.level()
                or candidate.weight() != self.weight()
                or not candidate.character().is_trivial()
                or candidate.base_ring() is not sage.QQ
                or candidate.precision() < self._proof_precision
            ):
                return False
        replay = _matrix_from_candidates(list(self._candidates), self._proof_precision)
        return (
            replay == self._matrix
            and self._matrix.rank() == self.dimension()
            and self.dimension() <= self.ambient_dimension()
        )

    def certificate(self) -> CertifiedFormulaSubspace:
        return self

    def __repr__(self) -> str:
        label = "full ambient space" if self.is_full_ambient() else "proper subspace"
        return (
            "Certified formula-generated "
            + label
            + " of dimension "
            + str(self.dimension())
            + " in a cusp space of dimension "
            + str(self.ambient_dimension())
            + " at level "
            + str(self.level())
            + " and weight "
            + str(self.weight())
        )

    __str__ = __repr__
    toString = __repr__


def _default_formula_candidates(
    space: Any, precision: int
) -> list[CertifiedModularForm]:
    if space.base_ring() is not sage.QQ or space.group()._family != "Gamma0":
        raise NotImplementedError("formula candidates currently require Gamma0 over QQ")
    level_one = _global("CuspForms")(1, space.weight(), sage.QQ, True, precision)
    if level_one.dimension() == 0:
        return []
    source_forms = level_one.basis(precision)
    candidates = []
    for divisor in sage.divisors(space.level()):
        factor = _positive(divisor, "level divisor")
        for source in source_forms:
            candidate = certified_modular_form(source, precision)
            if factor != 1:
                candidate = candidate.V(factor)
            if candidate.level() != space.level():
                candidate = candidate.lift_level(space.level())
            candidates.append(candidate)
    return candidates


def formula_generated_subspace(
    space: Any,
    candidates: Any = None,
    prec: Any = None,
) -> CertifiedFormulaSubspace:
    """Return the certified span of exact formula candidates inside `space`."""
    display_precision = (
        _nonnegative(space.precision(), "display precision")
        if prec is None
        else _nonnegative(prec, "precision")
    )
    proof_precision = max(display_precision, space.sturm_bound() + 1)
    if candidates is None:
        normalized = _default_formula_candidates(space, proof_precision)
    else:
        normalized = []
        for source in candidates:
            candidate = certified_modular_form(source, proof_precision)
            if candidate.weight() != space.weight():
                raise ValueError("a formula candidate has the wrong weight")
            if space.level() % candidate.level():
                raise ValueError(
                    "a formula candidate level does not divide the ambient level"
                )
            if candidate.level() != space.level():
                candidate = candidate.lift_level(space.level())
            if not candidate.character().is_trivial():
                raise ValueError(
                    "trivial-character formula spaces require trivial candidates"
                )
            if not candidate.is_cuspidal():
                raise ValueError(
                    "a cusp-space formula candidate is not certified cuspidal"
                )
            normalized.append(candidate)
    return CertifiedFormulaSubspace(
        space,
        normalized,
        display_precision,
        proof_precision,
    )


@runtime.lightweight_math_class
class QExpansionAlgorithmReceipt:
    """An inspectable exact-domain receipt for q-expansion algorithm selection."""

    def __init__(
        self,
        space: Any,
        requested: str = "auto",
        precision: Any = None,
    ) -> None:
        requested = "auto" if requested == "default" else str(requested)
        if requested not in ["auto", "formulas", "modular_symbols"]:
            raise ValueError(
                "q-expansion algorithm must be 'auto', 'formulas', or 'modular_symbols'"
            )
        self._space = space
        self._requested = requested
        self._precision = (
            _nonnegative(space.precision(), "selection precision")
            if precision is None
            else _nonnegative(precision, "selection precision")
        )
        self._formula_subspace = None
        if requested == "auto":
            if _formula_auto_domain(space):
                self._selected = "formulas"
                self._receipt_id = "qexp-auto-level-one-victor-miller-v1"
                self._reason = "complete Victor Miller basis with dimension certificate"
            elif _formula_explicit_domain(space):
                formula_subspace = formula_generated_subspace(
                    space,
                    prec=self._precision,
                )
                self._formula_subspace = formula_subspace
                if formula_subspace.is_full_ambient():
                    self._selected = "formulas"
                    self._receipt_id = "qexp-auto-certified-formula-span-v1"
                    self._reason = (
                        "formula rank equals the independently computed ambient "
                        "dimension through Sturm precision"
                    )
                elif _modular_symbols_auto_domain(space):
                    self._selected = "modular_symbols"
                    self._receipt_id = "qexp-auto-proper-formula-span-fallback-v1"
                    self._reason = (
                        "certified formula rank "
                        + str(formula_subspace.dimension())
                        + " is below ambient dimension "
                        + str(formula_subspace.ambient_dimension())
                    )
                else:
                    raise NotImplementedError(
                        "the formula candidates certify only a proper subspace and "
                        "no modular-symbol fallback covers this space"
                    )
            elif _modular_symbols_auto_domain(space):
                self._selected = "modular_symbols"
                self._receipt_id = "qexp-auto-gamma0-qq-modular-symbols-v1"
                self._reason = "formula completeness is unreceipted; use exact Hecke-dual reconstruction"
            else:
                raise NotImplementedError(
                    "no receipt-backed q-expansion algorithm covers this space"
                )
        else:
            self._selected = requested
            self._receipt_id = "explicit-user-selection-v1"
            self._reason = "explicit algorithm request"
        if not self.verify():
            raise ValueError(
                "the selected q-expansion algorithm does not cover this space"
            )
        runtime.object.freeze(self)

    def requested_algorithm(self) -> str:
        return self._requested

    def selected_algorithm(self) -> str:
        return self._selected

    algorithm = selected_algorithm

    def receipt_id(self) -> str:
        return self._receipt_id

    def reason(self) -> str:
        return self._reason

    def precision(self) -> int:
        return self._precision

    def formula_subspace(self) -> Any:
        """Return the formula-span certificate consulted by `auto`, if any."""
        return self._formula_subspace

    def verify(self) -> bool:
        if self._requested == "auto" and self._formula_subspace is not None:
            if not self._formula_subspace.verify():
                return False
            if self._selected == "formulas":
                return self._formula_subspace.is_full_ambient()
            return (
                self._formula_subspace.is_proper_subspace()
                and _modular_symbols_auto_domain(self._space)
            )
        if self._selected == "formulas":
            return _formula_explicit_domain(self._space)
        return _modular_symbols_auto_domain(self._space)

    def __repr__(self) -> str:
        return (
            "q-expansion selection receipt "
            + self._receipt_id
            + ": "
            + self._selected
            + " ("
            + self._reason
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


def _modular_symbols_auto_domain(space: Any) -> bool:
    return (
        space.group()._family == "Gamma0"
        and space.base_ring() is sage.QQ
        and runtime.reflect.get(space, "_subspace_kind") in ["Cuspidal", "New"]
    )


def _formula_auto_domain(space: Any) -> bool:
    return _formula_explicit_domain(space) and space.level() == 1


def _formula_explicit_domain(space: Any) -> bool:
    return (
        space.group()._family == "Gamma0"
        and space.base_ring() is sage.QQ
        and runtime.reflect.get(space, "_subspace_kind") == "Cuspidal"
    )


def q_expansion_algorithm_receipt(
    space: Any,
    algorithm: str = "auto",
    precision: Any = None,
) -> QExpansionAlgorithmReceipt:
    """Return the exact-domain receipt used to resolve `algorithm`."""
    return QExpansionAlgorithmReceipt(space, algorithm, precision)


__all__ = [
    "CertifiedFormulaSubspace",
    "CertifiedModularForm",
    "ExactNebentypus",
    "MAX_EXACT_TWIST_CONDUCTOR",
    "OldformMetadata",
    "QExpansionAlgebraCertificate",
    "QExpansionAlgorithmReceipt",
    "certified_modular_form",
    "character_eisenstein_series",
    "formula_generated_subspace",
    "q_expansion_algorithm_receipt",
]
