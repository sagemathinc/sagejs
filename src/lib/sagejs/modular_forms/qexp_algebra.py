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
_eta_products_module_cache: Any = runtime.undefined


def _eta_products_module() -> Any:
    """Load the higher-layer eta-product registry without a startup edge."""
    global _eta_products_module_cache
    if _eta_products_module_cache is runtime.undefined:
        _eta_products_module_cache = __import__(
            "sagejs.modular_forms.eta_products",
            fromlist=["CertifiedEtaProduct"],
        )
    return _eta_products_module_cache


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

    def extend_precision(self, prec: Any) -> CertifiedModularForm:
        """Replay the finite construction tree at a larger exact precision."""
        return _extend_certified_modular_form(self, prec)

    def __getitem__(self, exponent: Any) -> Any:
        exponent = _nonnegative(exponent, "coefficient exponent")
        if exponent >= self._precision:
            raise IndexError("coefficient lies beyond the certified precision")
        return self._series[exponent]

    def certificate(self) -> Any:
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
            "ClassicalModularFormElement",
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
        "ClassicalModularFormElement",
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


def _extend_certified_modular_form(
    form: CertifiedModularForm,
    prec: Any,
) -> CertifiedModularForm:
    """Replay a certified construction at exactly the requested precision."""
    precision = _nonnegative(prec, "precision")
    if precision <= form.precision():
        return certified_modular_form(form, precision)
    recipe = form.construction()
    kind = recipe[0]
    if kind == "source":
        replay = certified_modular_form(recipe[1], precision)
    elif kind == "character-eisenstein":
        replay = character_eisenstein_series(
            recipe[1],
            recipe[2],
            recipe[3],
            precision,
            recipe[4],
            recipe[5],
            recipe[6],
        )
    elif kind == "sum":
        replay = _extend_certified_modular_form(
            recipe[1], precision
        ) + _extend_certified_modular_form(recipe[2], precision)
    elif kind == "product":
        replay = _extend_certified_modular_form(
            recipe[1], precision
        ) * _extend_certified_modular_form(recipe[2], precision)
    elif kind == "scale":
        replay = _extend_certified_modular_form(recipe[1], precision) * recipe[2]
    elif kind == "level-lift":
        replay = _extend_certified_modular_form(recipe[1], precision).lift_level(
            recipe[2]
        )
    elif kind == "V":
        replay = _extend_certified_modular_form(recipe[1], precision).V(recipe[2])
    elif kind == "twist":
        replay = _extend_certified_modular_form(recipe[1], precision).twist(recipe[2])
    elif kind == "truncate":
        replay = _extend_certified_modular_form(recipe[1], precision)
    elif kind == "eta-product":
        replay = _eta_products_module().CertifiedEtaProduct(
            recipe[1], recipe[2], precision
        )
    else:
        raise NotImplementedError(
            "this certified modular-form construction cannot be extended"
        )
    if replay.precision() < precision:
        raise ArithmeticError(
            "construction replay did not reach the requested precision"
        )
    return certified_modular_form(replay, precision)


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


def _candidate_coefficient_matrix(
    candidates: list[CertifiedModularForm], precision: int
) -> Any:
    matrix_constructor = _global("matrix")
    if len(candidates) == 0:
        return matrix_constructor(sage.QQ, 0, precision)
    return matrix_constructor(
        sage.QQ,
        [[candidate[index] for index in range(precision)] for candidate in candidates],
    )


def _series_from_matrix(matrix: Any, precision: int, variable: str) -> list[Any]:
    ring = _series_ring(matrix.base_ring(), variable, precision)
    return [ring(row.list()).add_bigoh(precision) for row in matrix.rows()]


def _matrix_from_series(forms: list[Any], precision: int) -> Any:
    matrix_constructor = _global("matrix")
    if len(forms) == 0:
        return matrix_constructor(sage.QQ, 0, precision)
    return matrix_constructor(
        sage.QQ,
        [[form[index] for index in range(precision)] for form in forms],
    )


def _hecke_image_matrix(
    source: Any,
    index: int,
    weight: int,
    character: ExactNebentypus,
    output_precision: int,
) -> Any:
    r"""Apply the exact $q$-expansion formula for $T_n$ to matrix rows."""
    required = index * max(0, output_precision - 1) + 1
    if source.ncols() < required:
        raise ValueError(
            "Hecke action requires source precision at least " + str(required)
        )
    rows = []
    for row in source.rows():
        coefficients = [sage.QQ(0)]
        for exponent in range(1, output_precision):
            common = _integer(_global("gcd")(exponent, index), "Hecke gcd")
            coefficient = sage.QQ(0)
            for divisor_value in sage.divisors(common):
                divisor = _positive(divisor_value, "Hecke divisor")
                character_value = character(divisor)
                if character_value == 0:
                    continue
                source_index = exponent * index // (divisor * divisor)
                coefficient += (
                    character_value
                    * (sage.ZZ(divisor) ** (weight - 1))
                    * row[source_index]
                )
            coefficients.append(coefficient)
        rows.append(coefficients)
    return (
        _matrix_from_series([], output_precision)
        if not rows
        else _global("matrix")(sage.QQ, rows)
    )


class FormulaAmbientComparisonCertificate(sage.Parent):
    r"""An exact Sturm comparison with the modular-symbol ambient space.

    The formula rows are expressed in the independently reconstructed
    modular-symbol basis.  A deterministic subset of ambient basis rows then
    completes them to the full cusp space.  Thus a proper formula span comes
    with explicit missing directions, not only a dimension deficit.
    """

    def __init__(self, formula_subspace: Any) -> None:
        self._formula_subspace = formula_subspace
        self._precision = formula_subspace.proof_precision()
        ambient = formula_subspace.ambient_space()
        ambient_basis = ambient.q_expansion_basis(
            self._precision,
            algorithm="modular_symbols",
        )
        matrix_constructor = _global("matrix")
        ambient_rows = [
            [series[index] for index in range(self._precision)]
            for series in ambient_basis
        ]
        self._ambient_matrix = (
            matrix_constructor(sage.QQ, ambient_rows)
            if len(ambient_rows)
            else matrix_constructor(sage.QQ, 0, self._precision)
        )
        if self._ambient_matrix.nrows() != ambient.dimension():
            raise ArithmeticError(
                "the modular-symbol basis has the wrong ambient dimension"
            )
        formula_matrix = formula_subspace.coefficient_matrix()
        if formula_matrix.nrows() == 0:
            self._formula_coordinates = matrix_constructor(
                sage.QQ,
                0,
                self._ambient_matrix.nrows(),
            )
        else:
            self._formula_coordinates = self._ambient_matrix.solve_left(formula_matrix)

        selected: list[int] = []
        spanning_rows = [row.list() for row in formula_matrix.rows()]
        current_rank = formula_matrix.rank()
        for index, row in enumerate(self._ambient_matrix.rows()):
            trial_rows = spanning_rows + [row.list()]
            trial = matrix_constructor(sage.QQ, trial_rows)
            trial_rank = trial.rank()
            if trial_rank > current_rank:
                selected.append(index)
                spanning_rows.append(row.list())
                current_rank = trial_rank
            if current_rank == self._ambient_matrix.nrows():
                break
        self._missing_indices = runtime.math_tuple(selected)
        self._missing_matrix = self._ambient_matrix.matrix_from_rows(selected)
        identity = _global("identity_matrix")(
            sage.QQ,
            self._ambient_matrix.nrows(),
        )
        self._missing_ambient_coordinates = identity.matrix_from_rows(selected)
        self._verified = self._verify()
        if not self._verified:
            raise ArithmeticError(
                "formula/modular-symbol ambient comparison certificate failed"
            )
        runtime.object.freeze(self)

    def formula_subspace(self) -> Any:
        return self._formula_subspace

    def ambient_space(self) -> Any:
        return self._formula_subspace.ambient_space()

    def precision(self) -> int:
        return self._precision

    def sturm_bound(self) -> int:
        return self._formula_subspace.sturm_bound()

    def formula_dimension(self) -> int:
        return self._formula_subspace.dimension()

    def ambient_dimension(self) -> int:
        return self._formula_subspace.ambient_dimension()

    def missing_dimension(self) -> int:
        return self.ambient_dimension() - self.formula_dimension()

    def is_equal(self) -> bool:
        return self.missing_dimension() == 0

    def formula_coordinates_in_ambient(self) -> Any:
        r"""Return $C$ such that $C A=B$ for ambient/formula row bases."""
        return self._formula_coordinates

    def ambient_coefficient_matrix(self) -> Any:
        """Return the independently reconstructed ambient coefficient rows."""
        return self._ambient_matrix

    def missing_ambient_coordinates(self) -> Any:
        """Return ambient-basis rows completing the formula span."""
        return self._missing_ambient_coordinates

    def missing_q_expansion_basis(
        self,
        prec: Any = None,
        variable: str = "q",
    ) -> list[Any]:
        """Return deterministic modular-symbol directions outside the span."""
        precision = self._precision if prec is None else _nonnegative(prec, "precision")
        if precision > self._precision:
            raise ValueError("requested precision exceeds the comparison data")
        return [
            series.add_bigoh(precision)
            for series in _series_from_matrix(
                self._missing_matrix,
                self._precision,
                variable,
            )
        ]

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def _verify(self) -> bool:
        formula_matrix = self._formula_subspace.coefficient_matrix()
        if self._precision <= self.sturm_bound():
            return False
        if self._ambient_matrix.rank() != self.ambient_dimension():
            return False
        if self._formula_coordinates * self._ambient_matrix != formula_matrix:
            return False
        if len(self._missing_indices) != self.missing_dimension():
            return False
        if (
            self._missing_ambient_coordinates * self._ambient_matrix
            != self._missing_matrix
        ):
            return False
        combined = formula_matrix.stack(self._missing_matrix)
        return (
            combined.rank() == self.ambient_dimension()
            and combined.row_space() == self._ambient_matrix.row_space()
        )

    def __repr__(self) -> str:
        if self.is_equal():
            result = "exact span equality"
        else:
            result = str(self.missing_dimension()) + " missing direction"
            if self.missing_dimension() != 1:
                result += "s"
        return (
            "Verified formula/modular-symbol comparison through q^"
            + str(self._precision - 1)
            + ": "
            + result
        )

    __str__ = __repr__
    toString = __repr__


class FormulaHeckeObstruction(sage.Parent):
    """An exact witness that one formula basis vector leaves the subspace."""

    def __init__(self, certificate: Any, basis_index: int) -> None:
        self._certificate = certificate
        self._basis_index = basis_index
        runtime.object.freeze(self)

    def certificate(self) -> Any:
        return self._certificate

    def hecke_index(self) -> int:
        return self._certificate.hecke_index()

    def source_basis_index(self) -> int:
        return self._basis_index

    def ambient_coordinates(self) -> Any:
        return self._certificate.image_ambient_coordinates().row(self._basis_index)

    def q_expansion(self, prec: Any = None, variable: str = "q") -> Any:
        precision = (
            self._certificate.precision()
            if prec is None
            else _nonnegative(prec, "precision")
        )
        if precision > self._certificate.precision():
            raise ValueError("requested precision exceeds the obstruction data")
        matrix = self._certificate.image_coefficient_matrix().matrix_from_rows(
            [self._basis_index]
        )
        return _series_from_matrix(
            matrix,
            self._certificate.precision(),
            variable,
        )[0].add_bigoh(precision)

    qexp = q_expansion

    def verify(self) -> bool:
        if self._certificate.is_stable():
            return False
        formula = self._certificate.formula_subspace().coefficient_matrix()
        image = self._certificate.image_coefficient_matrix().row(self._basis_index)
        return formula.stack(image).rank() > formula.rank()

    def __repr__(self) -> str:
        return (
            "Hecke-stability obstruction: T_"
            + str(self.hecke_index())
            + " sends formula basis vector "
            + str(self._basis_index)
            + " outside the certified span"
        )

    __str__ = __repr__
    toString = __repr__


class FormulaHeckeActionCertificate(sage.Parent):
    r"""A Sturm certificate for $T_n$ on a formula-generated subspace.

    The canonical formula basis is first expressed in the certified candidate
    rows, whose construction trees are replayed at the larger precision needed
    by $T_n$.  The standard coefficient formula

    $$
    a_m(T_n f)=\sum_{d\mid(m,n)}\chi(d)d^{k-1}a_{mn/d^2}(f)
    $$

    is then evaluated through the Sturm precision.  The independently
    reconstructed modular-symbol basis certifies that every image remains in
    the ambient cusp space. Stability produces an exact matrix. Failure
    produces a particular image whose rank modulo the formula rows is nonzero.
    """

    def __init__(self, formula_subspace: Any, index: Any) -> None:
        self._formula_subspace = formula_subspace
        self._index = _positive(index, "Hecke index")
        self._precision = formula_subspace.proof_precision()
        self._required_precision = self._index * (self._precision - 1) + 1
        comparison = formula_subspace.ambient_comparison()
        candidates = formula_subspace.candidates()
        candidate_prefix = _candidate_coefficient_matrix(
            candidates,
            self._precision,
        )
        matrix_constructor = _global("matrix")
        if formula_subspace.dimension() == 0:
            self._formula_candidate_coordinates = matrix_constructor(
                sage.QQ,
                0,
                len(candidates),
            )
        else:
            self._formula_candidate_coordinates = candidate_prefix.solve_left(
                formula_subspace.coefficient_matrix()
            )
        extended_candidates = [
            _extend_certified_modular_form(candidate, self._required_precision)
            for candidate in candidates
        ]
        self._extended_candidate_matrix = _candidate_coefficient_matrix(
            extended_candidates,
            self._required_precision,
        )
        self._formula_extended_matrix = (
            self._formula_candidate_coordinates * self._extended_candidate_matrix
        )
        self._image_matrix = _hecke_image_matrix(
            self._formula_extended_matrix,
            self._index,
            formula_subspace.weight(),
            ExactNebentypus.trivial(formula_subspace.level()),
            self._precision,
        )
        ambient_matrix = comparison.ambient_coefficient_matrix()
        if self._image_matrix.nrows() == 0:
            self._image_ambient_coordinates = matrix_constructor(
                sage.QQ,
                0,
                ambient_matrix.nrows(),
            )
        else:
            self._image_ambient_coordinates = ambient_matrix.solve_left(
                self._image_matrix
            )
        formula_matrix = formula_subspace.coefficient_matrix()
        self._stable = (
            formula_matrix.stack(self._image_matrix).rank()
            == formula_subspace.dimension()
        )
        self._matrix = None
        self._obstruction_index = None
        if self._stable:
            if formula_subspace.dimension() == 0:
                self._matrix = matrix_constructor(sage.QQ, 0, 0)
            else:
                self._matrix = formula_matrix.solve_left(self._image_matrix)
        else:
            for basis_index, row in enumerate(self._image_matrix.rows()):
                if formula_matrix.stack(row).rank() > formula_subspace.dimension():
                    self._obstruction_index = basis_index
                    break
        self._verified = self._verify()
        if not self._verified:
            raise ArithmeticError("formula Hecke-action certificate failed")
        runtime.object.freeze(self)

    def formula_subspace(self) -> Any:
        return self._formula_subspace

    def hecke_index(self) -> int:
        return self._index

    index = hecke_index

    def precision(self) -> int:
        return self._precision

    def required_source_precision(self) -> int:
        return self._required_precision

    def is_stable(self) -> bool:
        return self._stable

    def image_coefficient_matrix(self) -> Any:
        return self._image_matrix

    def image_ambient_coordinates(self) -> Any:
        return self._image_ambient_coordinates

    def matrix(self) -> Any:
        if not self._stable:
            raise ValueError(str(self.obstruction()))
        return self._matrix

    def obstruction(self) -> Any:
        if self._stable:
            return None
        basis_index = self._obstruction_index
        if basis_index is None:
            raise ArithmeticError("missing Hecke-stability obstruction index")
        return FormulaHeckeObstruction(self, basis_index)

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def _verify(self) -> bool:
        subspace = self._formula_subspace
        comparison = subspace.ambient_comparison()
        if self._precision <= subspace.sturm_bound():
            return False
        if self._required_precision != self._index * (self._precision - 1) + 1:
            return False
        candidate_prefix = self._extended_candidate_matrix.matrix_from_columns(
            list(range(self._precision))
        )
        if (
            self._formula_candidate_coordinates * candidate_prefix
            != subspace.coefficient_matrix()
        ):
            return False
        if (
            self._formula_candidate_coordinates * self._extended_candidate_matrix
            != self._formula_extended_matrix
        ):
            return False
        replay = _hecke_image_matrix(
            self._formula_extended_matrix,
            self._index,
            subspace.weight(),
            ExactNebentypus.trivial(subspace.level()),
            self._precision,
        )
        if replay != self._image_matrix:
            return False
        ambient_matrix = comparison.ambient_coefficient_matrix()
        if self._image_ambient_coordinates * ambient_matrix != self._image_matrix:
            return False
        formula_matrix = subspace.coefficient_matrix()
        stable = formula_matrix.stack(self._image_matrix).rank() == subspace.dimension()
        if stable != self._stable:
            return False
        if stable:
            return self._matrix * formula_matrix == self._image_matrix
        if self._obstruction_index is None:
            return False
        return FormulaHeckeObstruction(
            self,
            self._obstruction_index,
        ).verify()

    def __repr__(self) -> str:
        result = "stable" if self._stable else "not stable"
        return (
            "Verified T_"
            + str(self._index)
            + " formula-subspace action through q^"
            + str(self._precision - 1)
            + ": "
            + result
        )

    __str__ = __repr__
    toString = __repr__


class FormulaHeckeSubspace(sage.Parent):
    """An exact Hecke-stable subspace in formula-basis coordinates."""

    def __init__(
        self,
        ambient: Any,
        basis_matrix: Any,
        simple: bool = False,
    ) -> None:
        self._ambient = ambient
        if basis_matrix.ncols() != ambient.dimension():
            raise ValueError("constituent basis has the wrong ambient degree")
        self._basis_matrix = basis_matrix.row_space().basis_matrix()
        self._simple = bool(simple)
        self._hecke_cache = runtime.map()
        runtime.object.freeze(self)

    def ambient_space(self) -> Any:
        return self._ambient

    def formula_subspace(self) -> Any:
        return self._ambient

    def level(self) -> int:
        return self._ambient.level()

    def weight(self) -> int:
        return self._ambient.weight()

    def character(self) -> ExactNebentypus:
        return ExactNebentypus.trivial(self.level())

    def base_ring(self) -> Any:
        return sage.QQ

    def dimension(self) -> int:
        return self._basis_matrix.nrows()

    degree = dimension

    def basis_matrix(self) -> Any:
        """Return rows in the canonical basis of the formula subspace."""
        return self._basis_matrix

    def coefficient_matrix(self) -> Any:
        return self._basis_matrix * self._ambient.coefficient_matrix()

    def is_simple(self) -> bool:
        return self._simple

    def q_expansion_basis(self, prec: Any = None, variable: str = "q") -> list[Any]:
        precision = (
            self._ambient._display_precision
            if prec is None
            else _nonnegative(prec, "precision")
        )
        if precision > self._ambient.proof_precision():
            raise ValueError("requested precision exceeds the certified formula data")
        return [
            series.add_bigoh(precision)
            for series in _series_from_matrix(
                self.coefficient_matrix(),
                self._ambient.proof_precision(),
                variable,
            )
        ]

    basis = q_expansion_basis

    def hecke_matrix(self, index: Any) -> Any:
        hecke_index = _positive(index, "Hecke index")
        cached = self._hecke_cache.get(hecke_index)
        if cached is not runtime.undefined:
            return cached
        ambient_matrix = self._ambient.hecke_matrix(hecke_index)
        images = self._basis_matrix * ambient_matrix
        result = self._basis_matrix.solve_left(images)
        if result * self._basis_matrix != images:
            raise ArithmeticError(
                "the Hecke operator did not preserve this formula constituent"
            )
        self._hecke_cache.set(hecke_index, result)
        return result

    T = hecke_matrix
    hecke_operator = hecke_matrix

    def eigenpacket(self, name: str = "a") -> FormulaEigenpacket:
        if not self._simple:
            raise ValueError("an eigenpacket requires a certified simple constituent")
        return FormulaEigenpacket(self, name)

    def __repr__(self) -> str:
        label = "simple Hecke constituent" if self._simple else "Hecke subspace"
        return (
            "Certified formula-generated "
            + label
            + " of dimension "
            + str(self.dimension())
            + " in weight "
            + str(self.weight())
            + " and level "
            + str(self.level())
        )

    __str__ = __repr__
    toString = __repr__


def _formula_space_dimension(space: FormulaHeckeSubspace) -> int:
    return space.dimension()


def _formula_primitive_operator(
    constituent: FormulaHeckeSubspace,
) -> tuple[Any, Any, tuple[Any, ...]]:
    dimension = constituent.dimension()
    bound = max(7, constituent.ambient_space().sturm_bound() + 1)
    operators = []
    for index in range(2, bound + 2):
        operator = constituent.hecke_matrix(index)
        operators.append((index, operator))
        polynomial = operator.charpoly("x")
        factors = list(polynomial.factor())
        if (
            polynomial.degree() == dimension
            and len(factors) == 1
            and factors[0][1] == 1
        ):
            return operator, polynomial, runtime.math_tuple([(index, 1)])
    for left_index in range(len(operators)):
        for right_index in range(left_index + 1, len(operators)):
            for coefficient in [1, 2, 3, 4]:
                operator = (
                    operators[left_index][1] + coefficient * operators[right_index][1]
                )
                polynomial = operator.charpoly("x")
                factors = list(polynomial.factor())
                if (
                    polynomial.degree() == dimension
                    and len(factors) == 1
                    and factors[0][1] == 1
                ):
                    return (
                        operator,
                        polynomial,
                        runtime.math_tuple(
                            [
                                (operators[left_index][0], 1),
                                (operators[right_index][0], coefficient),
                            ]
                        ),
                    )
    raise ArithmeticError("could not find a primitive formula Hecke operator")


@runtime.lightweight_math_class
class FormulaEigenpacket(sage.Element):
    """A normalized exact eigenpacket recovered from a formula Hecke module."""

    def __init__(self, constituent: FormulaHeckeSubspace, name: str = "a") -> None:
        self._kind = "FormulaEigenpacket"
        self._constituent = constituent
        self._dimension = constituent.dimension()
        primitive, polynomial, recipe = _formula_primitive_operator(constituent)
        self._primitive_operator = primitive
        self._defining_polynomial = polynomial
        self._primitive_recipe = recipe
        self._coefficient_field: Any = (
            sage.QQ
            if self._dimension == 1
            else _global("NumberField")(polynomial, name)
        )
        identity = _global("identity_matrix")(sage.QQ, self._dimension)
        powers = [identity]
        for _index in range(1, self._dimension):
            powers.append(powers[-1] * primitive)
        self._powers = runtime.math_tuple(powers)
        self._power_rows = _global("matrix")(
            sage.QQ,
            [power.list() for power in powers],
        )
        if self._power_rows.rank() != self._dimension:
            raise ArithmeticError("primitive formula Hecke powers are dependent")
        self._coefficient_cache = runtime.map()
        self._coefficient_cache.set(1, self._coefficient_field(1))
        runtime.object.freeze(self)

    def parent(self) -> FormulaHeckeSubspace:
        return self._constituent

    hecke_constituent = parent

    def level(self) -> int:
        return self._constituent.level()

    def weight(self) -> int:
        return self._constituent.weight()

    def character(self) -> ExactNebentypus:
        return self._constituent.character()

    def base_ring(self) -> Any:
        return self._coefficient_field

    coefficient_field = base_ring

    def defining_polynomial(self) -> Any:
        return self._defining_polynomial

    def primitive_hecke_recipe(self) -> Any:
        return self._primitive_recipe

    def _coordinates_for_operator(self, operator: Any) -> Any:
        solution = self._power_rows.solve_left(
            _global("vector")(sage.QQ, operator.list())
        )
        return _global("vector")(sage.QQ, solution.list())

    def hecke_eigenvalue(self, index: Any) -> Any:
        hecke_index = _nonnegative(index, "Hecke index")
        if hecke_index == 0:
            return self._coefficient_field(0)
        cached = self._coefficient_cache.get(hecke_index)
        if cached is not runtime.undefined:
            return cached
        coordinates = self._coordinates_for_operator(
            self._constituent.hecke_matrix(hecke_index)
        )
        if self._coefficient_field is sage.QQ:
            answer = coordinates[0]
        else:
            answer = self._coefficient_field._from_coefficients(coordinates.list())
        self._coefficient_cache.set(hecke_index, answer)
        return answer

    __getitem__ = hecke_eigenvalue
    an = hecke_eigenvalue

    def q_expansion(self, prec: Any = None, variable: str = "q") -> Any:
        precision = (
            self._constituent.ambient_space()._display_precision
            if prec is None
            else _nonnegative(prec, "precision")
        )
        ring = _series_ring(self._coefficient_field, variable, precision)
        return ring(
            [self.hecke_eigenvalue(index) for index in range(precision)]
        ).add_bigoh(precision)

    qexp = q_expansion

    def certificate(self, prec: Any = None) -> FormulaEigenpacketCertificate:
        precision = (
            max(2, self._constituent.ambient_space().sturm_bound() + 1)
            if prec is None
            else _positive(prec, "precision")
        )
        return FormulaEigenpacketCertificate(self, precision)

    def lseries_input(self, coefficient_bound: Any = None) -> Any:
        r"""Return exact arithmetic-normalized input for $L(f,s)$."""
        from .newforms import ModularFormLSeriesInput

        bound = (
            max(1, self._constituent.ambient_space().sturm_bound() + 1)
            if coefficient_bound is None
            else _nonnegative(coefficient_bound, "coefficient bound")
        )
        return ModularFormLSeriesInput(self, bound)

    def __repr__(self) -> str:
        return (
            "q + ... (normalized eigenpacket in a certified formula subspace "
            + "of level "
            + str(self.level())
            + ", weight "
            + str(self.weight())
            + ", and coefficient field "
            + str(self._coefficient_field)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


class FormulaEigenpacketCertificate(sage.Parent):
    """Replayable exact certificate for a formula-derived eigenpacket."""

    def __init__(self, packet: FormulaEigenpacket, precision: int) -> None:
        self._packet = packet
        self._precision = precision
        self._sturm_bound = packet.parent().ambient_space().sturm_bound()
        if precision <= self._sturm_bound:
            raise ValueError("certificate precision must exceed the Sturm bound")
        self._verified = self._verify()
        if not self._verified:
            raise ArithmeticError("formula eigenpacket certificate failed")
        runtime.object.freeze(self)

    def packet(self) -> FormulaEigenpacket:
        return self._packet

    def precision(self) -> int:
        return self._precision

    def sturm_bound(self) -> int:
        return self._sturm_bound

    def verify(self) -> bool:
        return self._verify()

    def is_verified(self) -> bool:
        return self._verified

    def _verify(self) -> bool:
        packet = self._packet
        if packet.hecke_eigenvalue(1) != packet.coefficient_field()(1):
            return False
        for index in range(1, self._precision):
            operator = packet.parent().hecke_matrix(index)
            coordinates = packet._coordinates_for_operator(operator)
            replay = packet._powers[0] * coordinates[0]
            for exponent in range(1, packet._dimension):
                replay += packet._powers[exponent] * coordinates[exponent]
            if replay != operator:
                return False
        return self._precision > self._sturm_bound

    def __repr__(self) -> str:
        return "Sturm-certified formula eigenpacket through q^" + str(
            self._precision - 1
        )

    __str__ = __repr__
    toString = __repr__


class CertifiedFormulaSubspace(sage.Parent):
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
        self._ambient_comparison = FormulaAmbientComparisonCertificate(self)
        self._hecke_certificate_cache = runtime.map()
        self._decomposition_cache = runtime.map()
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

    def ambient_comparison(self) -> FormulaAmbientComparisonCertificate:
        """Return the exact modular-symbol span comparison certificate."""
        return self._ambient_comparison

    comparison_certificate = ambient_comparison

    def missing_dimension(self) -> int:
        return self._ambient_comparison.missing_dimension()

    def missing_q_expansion_basis(
        self,
        prec: Any = None,
        variable: str = "q",
    ) -> list[Any]:
        """Return deterministic ambient directions missing from the span."""
        return self._ambient_comparison.missing_q_expansion_basis(prec, variable)

    def _member_coefficient_row(self, value: Any) -> Any:
        form = certified_modular_form(value, self._proof_precision)
        if form.weight() != self.weight():
            raise ValueError("the modular form has the wrong weight")
        if self.level() % form.level():
            raise ValueError("the modular form level does not divide the ambient level")
        if form.level() != self.level():
            form = form.lift_level(self.level())
        if not form.is_cuspidal():
            raise ValueError("membership requires a certified cusp form")
        if not form.character().is_trivial():
            raise ValueError("the modular form has nontrivial nebentypus")
        if form.base_ring() is not sage.QQ:
            raise TypeError("formula-subspace membership currently requires QQ")
        vector_constructor = _global("vector")
        return vector_constructor(
            sage.QQ,
            [form[index] for index in range(self._proof_precision)],
        )

    def contains(self, value: Any) -> bool:
        r"""Test certified mathematical membership through the Sturm bound.

        Bare power series are intentionally rejected: matching finitely many
        coefficients does not by itself certify that a series is a modular
        form in the ambient space.
        """
        try:
            row = self._member_coefficient_row(value)
        except (TypeError, ValueError, NotImplementedError):
            return False
        return self._matrix.stack(row).rank() == self.dimension()

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def coordinates(self, value: Any) -> Any:
        """Return exact coordinates in the canonical formula row basis."""
        row = self._member_coefficient_row(value)
        if self._matrix.stack(row).rank() != self.dimension():
            raise ValueError("the certified modular form is not in this subspace")
        answer = self._matrix.solve_left(row)
        if answer * self._matrix != row.row():
            raise ArithmeticError("formula-subspace coordinate verification failed")
        return answer.row(0)

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

    def hecke_action_certificate(self, index: Any) -> FormulaHeckeActionCertificate:
        """Return an exact stability or obstruction certificate for $T_n$."""
        hecke_index = _positive(index, "Hecke index")
        cached = self._hecke_certificate_cache.get(hecke_index)
        if cached is not runtime.undefined:
            return cached
        certificate = FormulaHeckeActionCertificate(self, hecke_index)
        self._hecke_certificate_cache.set(hecke_index, certificate)
        return certificate

    def is_hecke_stable(self, index: Any) -> bool:
        return self.hecke_action_certificate(index).is_stable()

    def hecke_obstruction(self, index: Any) -> Any:
        """Return an exact escaping image, or `None` when $T_n$ is stable."""
        return self.hecke_action_certificate(index).obstruction()

    def hecke_matrix(self, index: Any) -> Any:
        r"""Return $T_n$ in the canonical formula basis when it is stable."""
        return self.hecke_action_certificate(index).matrix()

    T = hecke_matrix
    hecke_operator = hecke_matrix

    def _good_hecke_primes(self, bound: int) -> list[int]:
        answer = []
        for candidate in range(2, bound + 1):
            if sage.is_prime(candidate) and self.level() % candidate:
                answer.append(candidate)
        return answer

    def _refine_hecke_spaces(
        self,
        spaces: list[FormulaHeckeSubspace],
        operator_index: int,
    ) -> tuple[list[FormulaHeckeSubspace], list[FormulaHeckeSubspace]]:
        finished = []
        remaining = []
        for space in spaces:
            if space.dimension() <= 1:
                finished.append(FormulaHeckeSubspace(self, space.basis_matrix(), True))
                continue
            operator = space.hecke_matrix(operator_index)
            factors = list(operator.charpoly().factor())
            if len(factors) == 1 and factors[0][1] == 1:
                finished.append(FormulaHeckeSubspace(self, space.basis_matrix(), True))
                continue
            for factor_value, exponent in factors:
                local_basis = factor_value(operator).left_kernel_matrix()
                if local_basis.nrows() == 0:
                    continue
                constituent = FormulaHeckeSubspace(
                    self,
                    local_basis * space.basis_matrix(),
                    exponent == 1,
                )
                if exponent == 1:
                    finished.append(constituent)
                else:
                    remaining.append(constituent)
        return finished, remaining

    def hecke_decomposition(
        self,
        bound: Any = None,
        anemic: bool = True,
    ) -> list[FormulaHeckeSubspace]:
        r"""Decompose a Hecke-stable formula span into exact constituents.

        Good-prime operators are used first.  With `anemic=False`, every
        bad-prime $U_p$ is also used to separate repeated oldform packets.
        Any operator which does not preserve the formula span raises with its
        exact `FormulaHeckeObstruction` rather than manufacturing a restriction.
        """
        decomposition_bound = (
            max(7, self.sturm_bound() + 1)
            if bound is None
            else _positive(bound, "decomposition bound")
        )
        key = str(decomposition_bound) + (":1" if anemic else ":0")
        cached = self._decomposition_cache.get(key)
        if cached is not runtime.undefined:
            return list(cached)
        if self.dimension() == 0:
            self._decomposition_cache.set(key, runtime.math_tuple([]))
            return []
        identity = _global("identity_matrix")(sage.QQ, self.dimension())
        active = [FormulaHeckeSubspace(self, identity)]
        finished = []
        for prime in self._good_hecke_primes(decomposition_bound):
            if not self.is_hecke_stable(prime):
                raise ValueError(str(self.hecke_obstruction(prime)))
            newly_finished, active = self._refine_hecke_spaces(active, prime)
            finished.extend(newly_finished)
            if len(active) == 0:
                break
        answer = finished + active
        if not anemic:
            for prime_value, _exponent in sage.factor(self.level()):
                prime = _positive(prime_value, "bad Hecke prime")
                if not self.is_hecke_stable(prime):
                    raise ValueError(str(self.hecke_obstruction(prime)))
                already_simple = [space for space in answer if space.is_simple()]
                unresolved = [space for space in answer if not space.is_simple()]
                newly_finished, unresolved = self._refine_hecke_spaces(
                    unresolved,
                    prime,
                )
                answer = already_simple + newly_finished + unresolved
        answer.sort(key=_formula_space_dimension)
        frozen = runtime.math_tuple(answer)
        self._decomposition_cache.set(key, frozen)
        return list(frozen)

    decomposition = hecke_decomposition

    def eigenforms(
        self,
        names: str = "a",
        bound: Any = None,
        anemic: bool = False,
    ) -> list[FormulaEigenpacket]:
        """Return normalized exact packets from the certified Hecke span."""
        constituents = self.hecke_decomposition(bound=bound, anemic=anemic)
        if any(not constituent.is_simple() for constituent in constituents):
            raise ArithmeticError(
                "the selected Hecke operators did not separate every constituent"
            )
        return [
            constituent.eigenpacket(str(names) + str(index))
            for index, constituent in enumerate(constituents)
        ]

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
            and self._ambient_comparison.verify()
        )

    def certificate(self) -> CertifiedFormulaSubspace:
        return self

    def __repr__(self) -> str:
        label = "full subspace" if self.is_full_ambient() else "proper subspace"
        return (
            "Certified formula-generated "
            + label
            + " of dimension "
            + str(self.dimension())
            + " of "
            + str(self._ambient)
        )

    __str__ = __repr__
    toString = __repr__


def _default_formula_candidates(
    space: Any, precision: int
) -> list[CertifiedModularForm]:
    if space.base_ring() is not sage.QQ or space.group()._family != "Gamma0":
        raise NotImplementedError("formula candidates currently require Gamma0 over QQ")
    level_one = _global("CuspForms")(1, space.weight(), sage.QQ, True, precision)
    source_forms = [] if level_one.dimension() == 0 else level_one.basis(precision)
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
    candidates.extend(
        _eta_products_module().registry_eta_product_candidates(space, precision)
    )
    return candidates


def formula_candidate_upper_bound(space: Any, cutoff: Any = None) -> int:
    """Bound the default formula span without constructing expansions."""
    if space.base_ring() is not sage.QQ or space.group()._family != "Gamma0":
        return 0
    stopping_count = (
        None if cutoff is None else _nonnegative(cutoff, "formula candidate cutoff")
    )
    if stopping_count == 0:
        return 0
    level_one_dimension = _global("dimension_cusp_forms")(1, space.weight())
    count = runtime.number(level_one_dimension) * len(sage.divisors(space.level()))
    if stopping_count is not None and count >= stopping_count:
        return stopping_count
    eta_cutoff = None if stopping_count is None else stopping_count - count
    count += _eta_products_module().registry_eta_product_candidate_upper_bound(
        space,
        eta_cutoff,
    )
    return count if stopping_count is None else min(count, stopping_count)


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
        and (
            space.base_ring() is sage.QQ
            or runtime.reflect.get(space.ambient_space(), "_character") is not None
        )
        and runtime.reflect.get(space, "_subspace_kind") in ["Cuspidal", "New"]
    )


def _formula_auto_domain(space: Any) -> bool:
    return _formula_explicit_domain(space) and space.level() == 1


def _formula_explicit_domain(space: Any) -> bool:
    return (
        space.group()._family == "Gamma0"
        and space.base_ring() is sage.QQ
        and runtime.reflect.get(space.ambient_space(), "_character") is None
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
    "FormulaEigenpacket",
    "FormulaEigenpacketCertificate",
    "FormulaAmbientComparisonCertificate",
    "FormulaHeckeActionCertificate",
    "FormulaHeckeObstruction",
    "FormulaHeckeSubspace",
    "MAX_EXACT_TWIST_CONDUCTOR",
    "OldformMetadata",
    "QExpansionAlgebraCertificate",
    "QExpansionAlgorithmReceipt",
    "certified_modular_form",
    "character_eisenstein_series",
    "formula_generated_subspace",
    "formula_candidate_upper_bound",
    "q_expansion_algorithm_receipt",
]
