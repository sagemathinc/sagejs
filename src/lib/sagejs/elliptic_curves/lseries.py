"""Readable numerical evaluation of elliptic-curve `L`-series.

For an elliptic curve over `QQ` of conductor `N`, this module uses

`Lambda(E,s) = A^s Gamma(s) L(E,s)`, where `A = sqrt(N)/(2*pi)`.

Put `a=1/A` and `f(y)=sum(a_n*exp(-a*n*y), n>=1)`.  Splitting the
Mellin transform at one and applying the functional equation gives

```text
Lambda(E,s) = integral_0^infinity exp(u) f(exp(u))
              * (exp((s-1)u) + w*exp(-(s-1)u)) du.
```

The implementation below evaluates this integral with deterministic
composite Gauss--Legendre quadrature.  It is ordinary CPython-parseable
Python and is intended both as a portable fallback and as an independent
oracle for the accelerated Acb implementation.

This is deliberately **not** a rigorous enclosure.  The coefficient tail,
the per-node coefficient omission, and the omitted upper integral are
bounded using `|a_n| <= n`, but the Gauss--Legendre discretization is checked
only by independent refinement.  Results and diagnostics never label that
refinement check as a proof.
"""

from __future__ import annotations

from math import ceil, exp, log, log1p, pi, sqrt
from typing import Any, TypedDict

from mpmath import mp

__all__ = [
    "CoefficientPrefix",
    "DirectLseriesPlan",
    "ReferenceLseriesLimits",
    "ReferenceLseriesNumericalIndeterminacyError",
    "ReferenceLseriesResourceError",
    "lseries_values",
    "plan_direct_lseries",
    "plan_reference_lseries",
    "reference_incomplete_gamma_value",
    "reference_lseries_value",
    "reference_lseries_values",
]


# Positive nodes and weights for the 16-point Gauss--Legendre rule on [-1,1].
# The same fixed rule is used by the central-derivative reference evaluator.
_GL16 = (
    (
        "0.0950125098376374401853193354249580631303530556890654566972198172251252982445921329847586929757833520996553912423163124483074773224487565507552825376683317590042639430675226808621968298306398385834094062354452738853673370952242716875153912021891680290435986783119557067235",
        "0.189450610455068496285396723208283105146908988395902975037513245200022890769133006300133977833533952282533805643209642329708365217540400731169038818943184441159581561276711845961617349817597427978336891209019602629426490614729343981816403794061883841216345087440356964647",
    ),
    (
        "0.281603550779258913230460501460496106486069490770599800548834733955925179499130770441440229152040159284337367075667679943958608231731859592427781740737461652997267317253218182999323504712804139056838901612216710295650017782508839689124831507619987030673289319607769930008",
        "0.182603415044923588866763667969219939383556223654649282418495144379430464950111174960400425116985275314045024746816472035932341453176750367723128790193985504959328898036777933983526094546329357687103938118464303596748875141302288811161357351978863066074946500951991488132",
    ),
    (
        "0.458016777657227386342419442983577573540031613035523490901154750947759174290293607735435527935988093250889048880252410981937838726387574837437245680248141865615320954226737392097436317324094222204031261233053265312320550120442111110407476217618631666705702234642200753367",
        "0.169156519395002538189312079030359962211639473416028281745082935680803664209930530932155322542078228047561666302917431130107024519401748567734525095856277629889126427742673505930431984799165331915253374075225714752944289644099596165744893049441308633212849006636356165964",
    ),
    (
        "0.617876244402643748446671764048791018991882217765657794103797355541733317754811424456911030427958503112200056927562415107693692572784801040259587690327324717951779891436251146410287663884856270141407139522242799658052450289707423746241939384051849138442880667652732358538",
        "0.149595988816576732081501730547478548970491068207836466805421962187360404020417982451778638403059258074066697871098155201744160882394780436933273510870768389277556385847859811279100254785473938753417415963264645336667666655852496503102021131682735147573308936279429959085",
    ),
    (
        "0.755404408355003033895101194847442268353813656457503009781757176922296861031271677720622056919249443421653922625775767897977695175560629164439783379772236988524324204690679886634995082921719758892531043716808436951136968926137627113210371753896434818023445773729725803534",
        "0.124628971255533872052476282192016420144886859222202679944750590429410963921465353597969190017655684360215049447227692316329874335616675995121980302753079395038117730273119473818553648417085338204981585755734162926525796558645613377565128381071046788453182664999381211102",
    ),
    (
        "0.865631202387831743880467897712393132387335384847526708103511425567760397712490558257132494364772354203821428331341464301386002990866175024061842106069569135788506000044642568396185726655607946093020656455010215324186946875986673906662683677019924493315721108336550609714",
        "0.0951585116824927848099251076022462263552635031837126581568222872296317595776819594470249573208049864890125891496209414830603481210533228470521726818393631052313960626642025883937935575862183078092754984560926424378606161380726146645506474202051743093462038386816818873937",
    ),
    (
        "0.944575023073232576077988415534608345091139272591072600925553652066609788902682304219565728738158318949328931100907318886410952680610249479819600771779911178859167648841949072781417014484322049432347858125788197212092768569983767713535900969047797698658140281925051278387",
        "0.0622535239386478928628438369943776942749865083529068579013035158195357388870438190612117095368517345326677408437010587484095102733930688584375043469278735539030250578328671232854442125221885072444734914927471878528529881785852210014369332953413853555572557051831454875622",
    ),
    (
        "0.989400934991649932596154173450332627426274071657645130051223904731324137215825396938536431906798181013513435859897866508253023707879179735930382232441399969509571107808772790530719908063571954612679838095993881138043500973565299223064246463993858934792537582800905112706",
        "0.0271524594117540948517805724560181035122673755667607979906103190738041136642161732493257792290308808998974259954086067547083751974232521958283764526154679805418678763257877173475328975259417904071578049294517404669732770687128254946226155762176028585659082598276568361141",
    ),
)

_GAUSS_RULE_CACHE: dict[tuple[int, int], list[tuple[Any, Any]]] = {}


class ReferenceLseriesLimits:
    """Resource limits applied before requesting an `a_n` prefix."""

    def __init__(
        self,
        *,
        maximum_precision_bits: int = 512,
        maximum_points: int = 64,
        maximum_abs_imaginary: float = 100.0,
        maximum_abs_real_offset: float = 16.0,
        maximum_coefficients: int = 5_000_000,
        maximum_grid_points: int = 100_000,
        maximum_coefficient_terms: int = 100_000_000,
        maximum_batch_points: int = 10_000,
    ) -> None:
        self.maximum_precision_bits = maximum_precision_bits
        self.maximum_points = maximum_points
        self.maximum_abs_imaginary = maximum_abs_imaginary
        self.maximum_abs_real_offset = maximum_abs_real_offset
        self.maximum_coefficients = maximum_coefficients
        self.maximum_grid_points = maximum_grid_points
        self.maximum_coefficient_terms = maximum_coefficient_terms
        self.maximum_batch_points = maximum_batch_points


class DirectLseriesPlan(TypedDict):
    """A proved absolute-convergence plan for one point with `Re(s)>2`."""

    precision_bits: int
    work_precision_bits: int
    cutoff: int
    real_part: str
    tail_bound: str
    tail_bound_log: str
    rigorous_tail: bool


class CoefficientPrefix:
    """An extendable exact `a_n` prefix owned by one curve computation.

    Both analytic-rank and general-value evaluation use this intentionally
    small contract.  Extending the prefix replaces it with the curve's exact
    `a_0,...,a_K` list; consumers never splice prefixes from distinct models.
    """

    def __init__(self, curve: Any) -> None:
        self.curve = curve
        self.values: list[int] = [0, 1]
        self.backend = "elliptic-curve anlist"
        self.extensions = 0

    def through(self, cutoff: int) -> list[int]:
        """Return `a_0,...,a_cutoff`, extending this exact prefix if needed."""
        if cutoff < 1:
            cutoff = 1
        if cutoff >= len(self.values):
            provider = getattr(self.curve, "_anlist_native", None)
            native_values = provider(cutoff) if provider is not None else None
            if native_values is None:
                self.values = [int(value) for value in self.curve.anlist(cutoff)]
            else:
                self.values = native_values
                self.backend = "elliptic-curve native anlist"
            self.extensions += 1
        # An extension computes exactly the requested prefix, so the common
        # path can return it without another O(cutoff) copy. Some consumers
        # precompute a larger prefix and later request a smaller view.
        if len(self.values) == cutoff + 1:
            return self.values
        return self.values[: cutoff + 1]


class ReferenceLseriesPlan(TypedDict):
    """Serializable work plan produced before coefficient generation."""

    conductor: int
    precision_bits: int
    work_precision_bits: int
    cutoff: int
    required_cutoff: int
    quadrature_degree: int
    quadrature_rule_order: int
    upper_u: str
    grid_points: int
    estimated_coefficient_terms: int
    point_count: int
    maximum_abs_imaginary: str
    maximum_abs_real_offset: str
    coefficient_tail_bound: str
    node_omission_bound: str
    upper_integral_bound: str
    analytic_error_bound: str
    raw_analytic_error_bound: str
    conversion_amplification_bound: str
    rigorous: bool
    analytic_error_status: str


class ReferenceLseriesPointResult(TypedDict):
    """One raw and completed value represented by decimal strings."""

    s_real: str
    s_imag: str
    raw_real: str
    raw_imag: str
    completed_real: str
    completed_imag: str


class ReferenceLseriesBatchResult(TypedDict):
    """Batched reference values together with reproducible diagnostics."""

    algorithm: str
    status: str
    precision_bits: int
    work_precision_bits: int
    cutoff: int
    required_cutoff: int
    quadrature_degree: int
    quadrature_rule_order: int
    grid_points: int
    coefficient_terms: int
    coefficient_backend: str
    coefficient_prefix_extensions: int
    coefficient_horner: str
    coefficient_roundoff_status: str
    values: list[ReferenceLseriesPointResult]
    point_diagnostics: list[dict[str, Any]]
    coefficient_tail_bound: str
    node_omission_bound: str
    upper_integral_bound: str
    analytic_error_bound: str
    raw_analytic_error_bound: str
    conversion_amplification_bound: str
    refinement_difference: str
    refinement_tolerance: str
    refinement_runs: list[Any]
    refinement_stable: bool
    rigorous: bool
    analytic_error_status: str
    quadrature_error_status: str


class ReferenceLseriesResourceError(ValueError):
    """A reference evaluation exceeded a limit before expensive work."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


class ReferenceLseriesNumericalIndeterminacyError(ArithmeticError):
    """Independent refinements did not determine the requested value."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


class _PreparedPlan:
    """Internal plan retaining binary64 parameters used only for planning."""

    def __init__(
        self,
        public: ReferenceLseriesPlan,
        upper_u: float,
        maximum_abs_real_offset: float,
    ) -> None:
        self.public = public
        self.upper_u = upper_u
        self.maximum_abs_real_offset = maximum_abs_real_offset


def _effective_limits(limits: ReferenceLseriesLimits | None) -> ReferenceLseriesLimits:
    return ReferenceLseriesLimits() if limits is None else limits


def _internal_refinement_limits(
    limits: ReferenceLseriesLimits, precision_bits: int
) -> ReferenceLseriesLimits:
    """Permit guard precision above the public requested-precision ceiling."""
    return ReferenceLseriesLimits(
        maximum_precision_bits=max(limits.maximum_precision_bits, precision_bits + 32),
        maximum_points=limits.maximum_points,
        maximum_abs_imaginary=limits.maximum_abs_imaginary,
        maximum_abs_real_offset=limits.maximum_abs_real_offset,
        maximum_coefficients=limits.maximum_coefficients,
        maximum_grid_points=limits.maximum_grid_points,
        maximum_coefficient_terms=limits.maximum_coefficient_terms,
        maximum_batch_points=limits.maximum_batch_points,
    )


def _coerce_point(value: Any) -> Any:
    """Coerce a Python, mpmath, or `(real, imag)` value to `mpc`."""
    if isinstance(value, (tuple, list)):
        if len(value) != 2:
            raise ValueError(
                "an L-series point pair must contain real and imaginary parts"
            )
        point = mp.mpc(value[0], value[1])
    else:
        try:
            point = mp.mpc(value)
        except (TypeError, ValueError):
            real_part = value.real
            imaginary_part = value.imag
            if callable(real_part):
                real_part = real_part()
            if callable(imaginary_part):
                imaginary_part = imaginary_part()
            point = mp.mpc(str(real_part), str(imaginary_part))
    if not mp.isfinite(point.real) or not mp.isfinite(point.imag):
        raise ValueError("L-series points must have finite real and imaginary parts")
    return point


def _coerce_points(points: list[Any] | tuple[Any, ...]) -> list[Any]:
    if not isinstance(points, (list, tuple)):
        raise TypeError("points must be a list or tuple")
    if not points:
        raise ValueError("at least one L-series point is required")
    return [_coerce_point(point) for point in points]


def _decimal_digits(bits: int) -> int:
    return max(18, int(ceil(bits * log(2.0) / log(10.0))) + 12)


def _number_string(value: Any, bits: int) -> str:
    return str(mp.nstr(value, n=_decimal_digits(bits), strip_zeros=False))


def _direct_tail_log(real_part: Any, cutoff: int) -> Any:
    """Return `log(sum(n^(1-sigma), n>K))` via the integral bound."""
    exponent = real_part - 2
    return -exponent * mp.log(cutoff) - mp.log(exponent)


def plan_direct_lseries(
    point: Any,
    precision_bits: int = 53,
    *,
    maximum_coefficients: int = 5_000_000,
) -> DirectLseriesPlan | None:
    """Plan direct Dirichlet-series evaluation using `|a_n| <= n`.

    For `sigma=Re(s)>2`,

    `sum_{n>K} |a_n*n^(-s)| <= K^(2-sigma)/(sigma-2)`.

    `None` means that this deliberately conservative bound cannot meet the
    requested target within the supplied coefficient limit.  The caller may
    then use the functional-equation/Mellin route.
    """
    precision_bits = int(precision_bits)
    if precision_bits < 16:
        raise ValueError("precision must be at least 16 bits")
    if maximum_coefficients < 1:
        raise ValueError("maximum_coefficients must be positive")
    old_precision = mp.prec
    mp.prec = max(96, precision_bits + 48)
    try:
        prepared = _coerce_point(point)
        real_part = prepared.real
        if real_part <= 2:
            return None
        # The explicit coefficient tail is placed well below the public
        # target so that arithmetic refinement, rather than truncation, is the
        # limiting numerical check.
        tail_bits = precision_bits + 20
        exponent = real_part - 2
        logarithmic_cutoff = (tail_bits * mp.log(2) - mp.log(exponent)) / exponent
        if logarithmic_cutoff > mp.log(maximum_coefficients):
            return None
        cutoff = max(1, int(mp.ceil(mp.exp(logarithmic_cutoff))))
        while cutoff <= maximum_coefficients and _direct_tail_log(
            real_part, cutoff
        ) > -tail_bits * mp.log(2):
            cutoff += 1
        if cutoff > maximum_coefficients:
            return None
        tail_log = _direct_tail_log(real_part, cutoff)
        return {
            "precision_bits": precision_bits,
            "work_precision_bits": precision_bits + 32,
            "cutoff": cutoff,
            "real_part": _number_string(real_part, precision_bits),
            "tail_bound": _number_string(mp.exp(tail_log), precision_bits),
            "tail_bound_log": _number_string(tail_log, precision_bits),
            "rigorous_tail": True,
        }
    finally:
        mp.prec = old_precision


def _direct_series_sum(
    coefficients: list[int], point: Any, cutoff: int, work_precision_bits: int
) -> Any:
    """Evaluate a finite Dirichlet prefix at explicit working precision."""
    old_precision = mp.prec
    mp.prec = work_precision_bits
    try:
        total = mp.mpc(0)
        for index in range(1, cutoff + 1):
            coefficient = coefficients[index]
            if coefficient != 0:
                total += coefficient * mp.exp(-point * mp.log(index))
        return +total
    finally:
        mp.prec = old_precision


def _bound_string(logarithm: float) -> str:
    if logarithm < -745.0:
        return "0"
    if logarithm > 709.0:
        return "+inf"
    return str(exp(logarithm))


def _quadrature_rule_order(precision_bits: int) -> int:
    """Use a higher-order local rule before GL16 discretization can saturate."""
    return 64 if precision_bits > 128 else 16


def _positive_gauss_rule(order: int, precision_bits: int) -> list[tuple[Any, Any]]:
    """Return positive Gauss--Legendre nodes generated at working precision."""
    if order == 16:
        return [(mp.mpf(node), mp.mpf(weight)) for node, weight in _GL16]
    key = (order, precision_bits)
    cached = _GAUSS_RULE_CACHE.get(key)
    if cached is not None:
        return cached
    nodes, weights = mp.gauss_quadrature(order, "legendre")
    rule = [
        (mp.mpf(nodes[index]), mp.mpf(weights[index]))
        for index in range(order)
        if nodes[index] > 0
    ]
    _GAUSS_RULE_CACHE[key] = rule
    return rule


def _coefficient_tail_log(
    conductor: int, cutoff: int, maximum_abs_real_offset: float
) -> float:
    """Bound the completed-value tail from coefficients above `cutoff`."""
    a_value = 2.0 * pi / sqrt(float(conductor))
    denominator = a_value - maximum_abs_real_offset / (cutoff + 1)
    if denominator <= 0.0:
        return float("inf")
    return log(2.0) - a_value * (cutoff + 1) - log(denominator) - log1p(-exp(-a_value))


def _harmonic_sum_bound_log(cutoff: int, exponent: float) -> float:
    """Bound `log(sum(n^-exponent, 1<=n<=cutoff))`."""
    if exponent == 0.0:
        return log(float(cutoff))
    if exponent < 1.0:
        bound = 1.0 + (cutoff ** (1.0 - exponent) - 1.0) / (1.0 - exponent)
    elif exponent == 1.0:
        bound = 1.0 + log(float(cutoff))
    else:
        bound = 1.0 + 1.0 / (exponent - 1.0)
    return log(bound)


def _node_omission_log(
    conductor: int, cutoff: int, maximum_abs_real_offset: float
) -> float:
    """Bound omissions caused by `ceil(cutoff*exp(-u))` at each node."""
    a_value = 2.0 * pi / sqrt(float(conductor))
    denominator = a_value - maximum_abs_real_offset / cutoff
    if denominator <= 0.0:
        return float("inf")
    return (
        log(2.0)
        + maximum_abs_real_offset * log(float(cutoff))
        - a_value * cutoff
        - log(denominator)
        + _harmonic_sum_bound_log(cutoff, maximum_abs_real_offset)
    )


def _upper_integral_log(
    conductor: int, upper_u: float, maximum_abs_real_offset: float
) -> float:
    """Bound the split-Mellin integral omitted above `upper_u`."""
    a_value = 2.0 * pi / sqrt(float(conductor))
    y_value = exp(upper_u)
    denominator = a_value - maximum_abs_real_offset / y_value
    if denominator <= 0.0:
        return float("inf")
    q_value = exp(-a_value * y_value)
    return (
        log(2.0)
        + maximum_abs_real_offset * log(y_value)
        - a_value * y_value
        - log(denominator)
        - log1p(-q_value)
    )


def _sum_logs(*logarithms: float) -> float:
    maximum = max(logarithms)
    if maximum == float("inf"):
        return maximum
    return maximum + log(sum(exp(value - maximum) for value in logarithms))


def _conversion_guard_bits(conductor: int, points: list[Any]) -> int:
    """Estimate loss in `Lambda -> L` conversion over the requested points."""
    old_precision = mp.prec
    mp.prec = 96
    try:
        a_value = 2 * mp.pi / mp.sqrt(mp.mpf(conductor))
        largest = mp.mpf(1)
        for point in points:
            multiplier = abs(mp.power(a_value, point) * mp.rgamma(point))
            if mp.isfinite(multiplier):
                largest = max(largest, multiplier)
        return max(0, int(mp.ceil(mp.log(largest, 2))))
    finally:
        mp.prec = old_precision


def _prepare_plan(
    conductor: int,
    points: list[Any],
    precision_bits: int,
    quadrature_degree: int,
    cutoff: int | None,
    limits: ReferenceLseriesLimits,
) -> _PreparedPlan:
    """Construct and validate a plan before generating coefficients."""
    if conductor <= 0:
        raise ValueError("conductor must be a positive integer")
    if precision_bits < 32:
        raise ValueError("precision must be at least 32 bits")
    if precision_bits > limits.maximum_precision_bits:
        raise ReferenceLseriesResourceError(
            "L-series precision exceeds the reference resource limit",
            {"precision_bits": precision_bits, "limit": limits.maximum_precision_bits},
        )
    if quadrature_degree < 16 or quadrature_degree > 512:
        raise ValueError("quadrature degree must lie between 16 and 512")
    if len(points) > limits.maximum_points:
        raise ReferenceLseriesResourceError(
            "L-series point count exceeds the reference resource limit",
            {"point_count": len(points), "limit": limits.maximum_points},
        )

    maximum_abs_imaginary = max(float(abs(point.imag)) for point in points)
    maximum_abs_real_offset = max(float(abs(point.real - 1)) for point in points)
    if maximum_abs_imaginary > limits.maximum_abs_imaginary:
        raise ReferenceLseriesResourceError(
            "L-series imaginary height exceeds the moderate-height limit",
            {
                "maximum_abs_imaginary": maximum_abs_imaginary,
                "limit": limits.maximum_abs_imaginary,
            },
        )
    if maximum_abs_real_offset > limits.maximum_abs_real_offset:
        raise ReferenceLseriesResourceError(
            "L-series real part exceeds the split-Mellin reference limit",
            {
                "maximum_abs_real_offset": maximum_abs_real_offset,
                "limit": limits.maximum_abs_real_offset,
            },
        )

    conversion_bits = _conversion_guard_bits(conductor, points)
    target_log = -(precision_bits + conversion_bits + 20) * log(2.0)
    a_value = 2.0 * pi / sqrt(float(conductor))
    required_cutoff = max(
        8,
        int(
            ceil(
                max(
                    2.0 * maximum_abs_real_offset / a_value,
                    (-(target_log) + 8.0) / a_value,
                )
            )
        ),
    )
    while (
        _sum_logs(
            _coefficient_tail_log(conductor, required_cutoff, maximum_abs_real_offset),
            _node_omission_log(conductor, required_cutoff, maximum_abs_real_offset),
        )
        > target_log
    ):
        required_cutoff = int(required_cutoff * 1.15) + 1
        if required_cutoff > limits.maximum_coefficients:
            raise ReferenceLseriesResourceError(
                "L-series coefficient cutoff exceeds the reference resource limit",
                {
                    "required_cutoff": required_cutoff,
                    "limit": limits.maximum_coefficients,
                },
            )
    chosen_cutoff = required_cutoff if cutoff is None else int(cutoff)
    if chosen_cutoff < required_cutoff:
        raise ReferenceLseriesResourceError(
            "explicit L-series cutoff is below the planned requirement",
            {"cutoff": chosen_cutoff, "required_cutoff": required_cutoff},
        )
    if chosen_cutoff > limits.maximum_coefficients:
        raise ReferenceLseriesResourceError(
            "L-series coefficient cutoff exceeds the reference resource limit",
            {"cutoff": chosen_cutoff, "limit": limits.maximum_coefficients},
        )

    upper_u = max(8.0, log(max(2.0, (-target_log + 8.0) / a_value)))
    while _upper_integral_log(conductor, upper_u, maximum_abs_real_offset) > target_log:
        upper_u += 0.25
        if upper_u > 64.0:
            raise ReferenceLseriesResourceError(
                "L-series integration range exceeds the reference resource limit",
                {"upper_u": upper_u, "limit": 64.0},
            )

    # A fixed 16-point rule still needs progressively shorter panels as the
    # requested precision grows.  `quadrature_degree` is an independent mesh
    # refinement knob rather than a claim that the local rule changes degree.
    base_mesh = max(
        1,
        int(ceil(precision_bits / 32.0)) + int(ceil(quadrature_degree / 32.0)),
    )
    oscillation_mesh = max(1, int(ceil((maximum_abs_imaginary + 1.0) / 8.0)))
    panels_per_unit = max(base_mesh, oscillation_mesh)
    interval_count = max(1, int(ceil(upper_u)) * panels_per_unit)
    quadrature_rule_order = _quadrature_rule_order(precision_bits + conversion_bits)
    grid_points = quadrature_rule_order * interval_count
    estimated_terms = int(ceil(chosen_cutoff * (1.0 + grid_points / max(1.0, upper_u))))
    if grid_points > limits.maximum_grid_points:
        raise ReferenceLseriesResourceError(
            "L-series grid exceeds the reference resource limit",
            {"grid_points": grid_points, "limit": limits.maximum_grid_points},
        )
    if estimated_terms > limits.maximum_coefficient_terms:
        raise ReferenceLseriesResourceError(
            "L-series coefficient-node work exceeds the reference resource limit",
            {
                "estimated_coefficient_terms": estimated_terms,
                "limit": limits.maximum_coefficient_terms,
            },
        )

    coefficient_log = _coefficient_tail_log(
        conductor, chosen_cutoff, maximum_abs_real_offset
    )
    node_log = _node_omission_log(conductor, chosen_cutoff, maximum_abs_real_offset)
    upper_log = _upper_integral_log(conductor, upper_u, maximum_abs_real_offset)
    analytic_log = _sum_logs(coefficient_log, node_log, upper_log)
    real_growth_bits = int(ceil(maximum_abs_real_offset * upper_u / log(2.0)))
    accumulation_bits = max(0, int(ceil(-2.0 * log(a_value) / log(2.0))))
    work_precision_bits = (
        precision_bits + conversion_bits + real_growth_bits + accumulation_bits + 24
    )
    raw_analytic_log = analytic_log + conversion_bits * log(2.0)
    public: ReferenceLseriesPlan = {
        "conductor": conductor,
        "precision_bits": precision_bits,
        "work_precision_bits": work_precision_bits,
        "cutoff": chosen_cutoff,
        "required_cutoff": required_cutoff,
        "quadrature_degree": quadrature_degree,
        "quadrature_rule_order": quadrature_rule_order,
        "upper_u": str(upper_u),
        "grid_points": grid_points,
        "estimated_coefficient_terms": estimated_terms,
        "point_count": len(points),
        "maximum_abs_imaginary": str(maximum_abs_imaginary),
        "maximum_abs_real_offset": str(maximum_abs_real_offset),
        "coefficient_tail_bound": _bound_string(coefficient_log),
        "node_omission_bound": _bound_string(node_log),
        "upper_integral_bound": _bound_string(upper_log),
        "analytic_error_bound": _bound_string(analytic_log),
        "raw_analytic_error_bound": _bound_string(raw_analytic_log),
        "conversion_amplification_bound": _bound_string(conversion_bits * log(2.0)),
        "rigorous": False,
        "analytic_error_status": "coefficient_grid_and_upper_omission_only",
    }
    return _PreparedPlan(public, upper_u, maximum_abs_real_offset)


def plan_reference_lseries(
    conductor: int,
    points: list[Any] | tuple[Any, ...],
    precision_bits: int,
    *,
    quadrature_degree: int = 32,
    cutoff: int | None = None,
    limits: ReferenceLseriesLimits | None = None,
) -> ReferenceLseriesPlan:
    """Plan reference work without requesting any `a_n` coefficients."""
    old_precision = mp.prec
    mp.prec = max(80, int(precision_bits) + 16)
    try:
        prepared_points = _coerce_points(points)
        return _prepare_plan(
            int(conductor),
            prepared_points,
            int(precision_bits),
            int(quadrature_degree),
            cutoff,
            _effective_limits(limits),
        ).public
    finally:
        mp.prec = old_precision


def _coefficient_values(
    curve: Any, coefficient_prefix: Any | None, cutoff: int
) -> tuple[list[int], str, int]:
    if coefficient_prefix is None:
        values = [int(value) for value in curve.anlist(cutoff)]
        backend = "elliptic-curve anlist"
        extensions = 1
    else:
        values = [int(value) for value in coefficient_prefix.through(cutoff)]
        backend = str(getattr(coefficient_prefix, "backend", "coefficient prefix"))
        extensions = int(getattr(coefficient_prefix, "extensions", 0))
    if len(values) <= cutoff:
        raise ValueError("the coefficient provider returned an incomplete a_n prefix")
    return values, backend, extensions


def _evaluate_plan(
    coefficients: list[int],
    conductor: int,
    root_number: int,
    points: list[Any],
    plan: _PreparedPlan,
    limits: ReferenceLseriesLimits,
) -> tuple[list[Any], list[Any], int]:
    """Evaluate one prepared composite-quadrature plan."""
    public = plan.public
    cutoff = int(public["cutoff"])
    work_precision = int(public["work_precision_bits"])
    upper = mp.mpf(plan.upper_u)
    coefficient_terms = 0

    old_precision = mp.prec
    mp.prec = work_precision
    try:
        rule_order = int(public["quadrature_rule_order"])
        interval_count = int(public["grid_points"]) // rule_order
        positive_rule = _positive_gauss_rule(rule_order, work_precision)
        # Binary64 is only an acceleration for deliberately low-precision
        # diagnostic runs.  Every supported public result (>=32 bits) whose
        # refinement is returned uses an arbitrary-precision final run.
        fast_horner = int(public["precision_bits"]) <= 40
        exact = [
            float(value) if fast_horner else mp.mpf(value)
            for value in coefficients[1 : cutoff + 1]
        ]
        a_value = 2 * mp.pi / mp.sqrt(mp.mpf(conductor))
        completed = [mp.mpc(0) for _point in points]
        for interval in range(interval_count):
            left = mp.mpf(interval) * upper / interval_count
            right = mp.mpf(interval + 1) * upper / interval_count
            midpoint = (left + right) / 2
            radius = (right - left) / 2
            for positive_node, weight in positive_rule:
                for sign in (-1, 1):
                    u_value = midpoint + sign * radius * positive_node
                    y_value = mp.exp(u_value)
                    node_cutoff = max(
                        1,
                        min(cutoff, int(mp.ceil(mp.mpf(cutoff) / y_value))),
                    )
                    coefficient_terms += node_cutoff
                    if coefficient_terms > limits.maximum_coefficient_terms:
                        raise ReferenceLseriesResourceError(
                            "L-series coefficient-node work exceeded its planned limit",
                            {
                                "coefficient_terms": coefficient_terms,
                                "limit": limits.maximum_coefficient_terms,
                            },
                        )
                    q_value = (
                        exp(-float(a_value) * float(y_value))
                        if fast_horner
                        else mp.exp(-a_value * y_value)
                    )
                    modular_value = 0.0 if fast_horner else mp.mpf(0)
                    for index in range(node_cutoff - 1, -1, -1):
                        modular_value = (modular_value + exact[index]) * q_value
                    common = radius * weight * y_value * modular_value
                    for point_index, point in enumerate(points):
                        exponent = (point - 1) * u_value
                        completed[point_index] += common * (
                            mp.exp(exponent) + root_number * mp.exp(-exponent)
                        )
        raw = [
            value * mp.power(a_value, point) * mp.rgamma(point)
            for value, point in zip(completed, points, strict=True)
        ]
        return raw, completed, coefficient_terms
    finally:
        mp.prec = old_precision


def _maximum_refinement_difference(
    first_raw: list[Any],
    first_completed: list[Any],
    second_raw: list[Any],
    second_completed: list[Any],
) -> Any:
    differences = [
        abs(left - right) for left, right in zip(first_raw, second_raw, strict=True)
    ]
    differences.extend(
        abs(left - right)
        for left, right in zip(first_completed, second_completed, strict=True)
    )
    return max(differences) if differences else mp.mpf(0)


def _refinement_tolerance(
    raw: list[Any], completed: list[Any], precision_bits: int
) -> Any:
    scale = max(
        [
            mp.mpf(1),
            *(abs(value) for value in raw),
            *(abs(value) for value in completed),
        ]
    )
    return mp.power(2, -precision_bits + 6) * scale


def _refinement_is_stable(
    first_raw: list[Any],
    first_completed: list[Any],
    second_raw: list[Any],
    second_completed: list[Any],
    precision_bits: int,
) -> bool:
    """Apply a mixed absolute/relative target to every returned component."""
    relative_target = mp.power(2, -precision_bits + 6)
    pairs = list(zip(first_raw, second_raw, strict=True))
    pairs.extend(zip(first_completed, second_completed, strict=True))
    return all(
        abs(first - second) <= relative_target * max(1, abs(second))
        for first, second in pairs
    )


def _result_values(
    points: list[Any], raw: list[Any], completed: list[Any], precision_bits: int
) -> list[ReferenceLseriesPointResult]:
    values: list[ReferenceLseriesPointResult] = []
    for point, raw_value, completed_value in zip(points, raw, completed, strict=True):
        values.append(
            {
                "s_real": _number_string(point.real, precision_bits),
                "s_imag": _number_string(point.imag, precision_bits),
                "raw_real": _number_string(raw_value.real, precision_bits),
                "raw_imag": _number_string(raw_value.imag, precision_bits),
                "completed_real": _number_string(completed_value.real, precision_bits),
                "completed_imag": _number_string(completed_value.imag, precision_bits),
            }
        )
    return values


def reference_lseries_values(
    curve: Any,
    points: list[Any] | tuple[Any, ...],
    root_number: int,
    precision_bits: int = 53,
    *,
    coefficient_prefix: Any | None = None,
    cutoff: int | None = None,
    quadrature_degree: int = 32,
    refine: bool = True,
    limits: ReferenceLseriesLimits | None = None,
) -> ReferenceLseriesBatchResult:
    """Return non-rigorous raw and completed values at several points.

    The common real Mellin grid is built once per refinement and shared by
    every point.  If `refine` is true, a denser mesh and stronger coefficient
    cutoff must agree to the requested absolute-or-relative target.  A
    mismatch raises :class:`ReferenceLseriesNumericalIndeterminacyError`
    rather than returning a value with a misleading precision.

    `coefficient_prefix`, when supplied, must provide `through(cutoff)`.  This
    narrow interface lets a future `Lseries_ell` object share its exact prefix
    with analytic-rank computations without coupling this module to either
    cache implementation.
    """
    if root_number not in (-1, 1):
        raise ValueError("root number must be +1 or -1")
    precision_bits = int(precision_bits)
    effective_limits = _effective_limits(limits)
    old_precision = mp.prec
    mp.prec = max(80, precision_bits + 32)
    try:
        prepared_points = _coerce_points(points)
        conductor = int(curve.conductor())
        first_plan = _prepare_plan(
            conductor,
            prepared_points,
            precision_bits,
            int(quadrature_degree),
            cutoff,
            effective_limits,
        )
        if refine:
            refined_precision = precision_bits + 32
            refined_degree = min(int(quadrature_degree) + 32, 512)
            second_plan = _prepare_plan(
                conductor,
                prepared_points,
                refined_precision,
                refined_degree,
                None,
                _internal_refinement_limits(effective_limits, precision_bits),
            )
            maximum_cutoff = max(
                int(first_plan.public["cutoff"]),
                int(second_plan.public["cutoff"]),
            )
        else:
            second_plan = first_plan
            maximum_cutoff = int(first_plan.public["cutoff"])

        coefficients, backend, extensions = _coefficient_values(
            curve, coefficient_prefix, maximum_cutoff
        )
        first_raw, first_completed, first_terms = _evaluate_plan(
            coefficients,
            conductor,
            root_number,
            prepared_points,
            first_plan,
            effective_limits,
        )
        if refine:
            final_raw, final_completed, final_terms = _evaluate_plan(
                coefficients,
                conductor,
                root_number,
                prepared_points,
                second_plan,
                effective_limits,
            )
            difference = _maximum_refinement_difference(
                first_raw, first_completed, final_raw, final_completed
            )
            tolerance = _refinement_tolerance(
                final_raw, final_completed, precision_bits
            )
            stable = _refinement_is_stable(
                first_raw,
                first_completed,
                final_raw,
                final_completed,
                precision_bits,
            )
            refinement_runs = [first_plan.public, second_plan.public]
            selected_plan = second_plan
        else:
            final_raw = first_raw
            final_completed = first_completed
            final_terms = first_terms
            difference = mp.mpf(0)
            tolerance = _refinement_tolerance(
                final_raw, final_completed, precision_bits
            )
            stable = True
            refinement_runs = [first_plan.public]
            selected_plan = first_plan

        diagnostics: dict[str, Any] = {
            "precision_bits": precision_bits,
            "difference": _number_string(difference, precision_bits),
            "tolerance": _number_string(tolerance, precision_bits),
            "runs": refinement_runs,
            "rigorous": False,
            "quadrature_error_status": "estimated_by_independent_refinement",
        }
        if not stable:
            raise ReferenceLseriesNumericalIndeterminacyError(
                "split-Mellin refinements did not determine the requested precision",
                diagnostics,
            )

        public = selected_plan.public
        return {
            "algorithm": "reference",
            "status": "ok",
            "precision_bits": precision_bits,
            "work_precision_bits": int(public["work_precision_bits"]),
            "cutoff": int(public["cutoff"]),
            "required_cutoff": int(public["required_cutoff"]),
            "quadrature_degree": int(public["quadrature_degree"]),
            "quadrature_rule_order": int(public["quadrature_rule_order"]),
            "grid_points": int(public["grid_points"]),
            "coefficient_terms": final_terms,
            "coefficient_backend": backend,
            "coefficient_prefix_extensions": extensions,
            "coefficient_horner": (
                "binary64"
                if int(public["precision_bits"]) <= 40
                else "arbitrary precision"
            ),
            "coefficient_roundoff_status": (
                "controlled only by independent refinement"
                if int(public["precision_bits"]) <= 40
                else "mpmath working precision"
            ),
            "values": _result_values(
                prepared_points,
                final_raw,
                final_completed,
                precision_bits,
            ),
            "point_diagnostics": [
                {
                    "coefficient_tail_bound": public["coefficient_tail_bound"],
                    "node_omission_bound": public["node_omission_bound"],
                    "upper_integral_bound": public["upper_integral_bound"],
                    "analytic_error_bound": public["analytic_error_bound"],
                    "raw_analytic_error_bound": public["raw_analytic_error_bound"],
                    "conversion_amplification_bound": public[
                        "conversion_amplification_bound"
                    ],
                    "rigorous": False,
                }
                for _point in prepared_points
            ],
            "coefficient_tail_bound": public["coefficient_tail_bound"],
            "node_omission_bound": public["node_omission_bound"],
            "upper_integral_bound": public["upper_integral_bound"],
            "analytic_error_bound": public["analytic_error_bound"],
            "raw_analytic_error_bound": public["raw_analytic_error_bound"],
            "conversion_amplification_bound": public["conversion_amplification_bound"],
            "refinement_difference": _number_string(difference, precision_bits),
            "refinement_tolerance": _number_string(tolerance, precision_bits),
            "refinement_runs": refinement_runs,
            "refinement_stable": stable,
            "rigorous": False,
            "analytic_error_status": "coefficient_grid_and_upper_omission_only",
            "quadrature_error_status": "estimated_by_independent_refinement",
        }
    finally:
        mp.prec = old_precision


def reference_lseries_value(
    curve: Any,
    point: Any,
    root_number: int,
    precision_bits: int = 53,
    **options: Any,
) -> ReferenceLseriesBatchResult:
    """Return the one-element batch result for a single complex point."""
    return reference_lseries_values(
        curve,
        [point],
        root_number,
        precision_bits,
        **options,
    )


def _mapping_value(mapping: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if name in mapping:
            return mapping[name]
    return default


def _normalized_point_pairs(points: list[Any], precision_bits: int) -> list[list[str]]:
    return [
        [
            _number_string(point.real, precision_bits),
            _number_string(point.imag, precision_bits),
        ]
        for point in points
    ]


def _direct_lseries_values(
    curve: Any,
    points: list[Any],
    conductor: int,
    precision_bits: int,
    prefix: CoefficientPrefix,
    limits: ReferenceLseriesLimits,
    algorithm: str,
) -> ReferenceLseriesBatchResult:
    """Evaluate a batch in the absolutely convergent half-plane."""
    first_plans: list[DirectLseriesPlan] = []
    final_plans: list[DirectLseriesPlan] = []
    for point in points:
        first = plan_direct_lseries(
            point,
            precision_bits,
            maximum_coefficients=limits.maximum_coefficients,
        )
        final = plan_direct_lseries(
            point,
            precision_bits + 32,
            maximum_coefficients=limits.maximum_coefficients,
        )
        if first is None or final is None:
            raise ReferenceLseriesResourceError(
                "direct L-series convergence exceeds the coefficient limit",
                {
                    "point": [str(point.real), str(point.imag)],
                    "precision_bits": precision_bits,
                    "maximum_coefficients": limits.maximum_coefficients,
                },
            )
        first_plans.append(first)
        final_plans.append(final)

    maximum_cutoff = max(plan["cutoff"] for plan in final_plans)
    coefficients = prefix.through(maximum_cutoff)
    first_raw = []
    first_completed = []
    final_raw = []
    final_completed = []
    final_native_entries: list[Any] = []
    native_provider = (
        None
        if algorithm == "reference"
        else getattr(curve, "_lseries_direct_values_native", None)
    )
    native_used = False
    if native_provider is not None:
        normalized = _normalized_point_pairs(points, precision_bits + 64)
        try:
            first_native = native_provider(
                coefficients,
                normalized,
                [plan["cutoff"] for plan in first_plans],
                precision_bits,
            )
            final_native = native_provider(
                coefficients,
                normalized,
                [plan["cutoff"] for plan in final_plans],
                precision_bits + 32,
            )
            first_native_entries = list(
                _mapping_value(first_native, "values", default=[])
            )
            final_native_entries = list(
                _mapping_value(final_native, "values", default=[])
            )
            if len(first_native_entries) != len(points) or len(
                final_native_entries
            ) != len(points):
                raise ReferenceLseriesNumericalIndeterminacyError(
                    "the native direct evaluator returned the wrong point count",
                    {
                        "expected": len(points),
                        "first": len(first_native_entries),
                        "final": len(final_native_entries),
                    },
                )
            for first_entry, final_entry in zip(
                first_native_entries, final_native_entries, strict=True
            ):
                first_raw.append(
                    mp.mpc(first_entry["raw_real"], first_entry["raw_imag"])
                )
                first_completed.append(
                    mp.mpc(
                        first_entry["completed_real"],
                        first_entry["completed_imag"],
                    )
                )
                final_raw.append(
                    mp.mpc(final_entry["raw_real"], final_entry["raw_imag"])
                )
                final_completed.append(
                    mp.mpc(
                        final_entry["completed_real"],
                        final_entry["completed_imag"],
                    )
                )
            native_used = True
        except (AttributeError, NotImplementedError):
            native_used = False
    if not native_used:
        if algorithm == "native":
            raise NotImplementedError(
                "the native direct elliptic L-series evaluator is unavailable"
            )
        a_value = 2 * mp.pi / mp.sqrt(mp.mpf(conductor))
        for point, first, final in zip(points, first_plans, final_plans, strict=True):
            raw0 = _direct_series_sum(
                coefficients,
                point,
                first["cutoff"],
                first["work_precision_bits"],
            )
            raw1 = _direct_series_sum(
                coefficients,
                point,
                final["cutoff"],
                final["work_precision_bits"],
            )
            first_raw.append(raw0)
            final_raw.append(raw1)
            first_completed.append(
                mp.power(1 / a_value, point) * mp.gamma(point) * raw0
            )
            final_completed.append(
                mp.power(1 / a_value, point) * mp.gamma(point) * raw1
            )

    difference = _maximum_refinement_difference(
        first_raw, first_completed, final_raw, final_completed
    )
    tolerance = _refinement_tolerance(final_raw, final_completed, precision_bits)
    stable = _refinement_is_stable(
        first_raw,
        first_completed,
        final_raw,
        final_completed,
        precision_bits,
    )
    if native_used:
        relative_target = mp.power(2, -precision_bits + 6)
        for entry, raw, completed in zip(
            final_native_entries, final_raw, final_completed, strict=True
        ):
            radii = (
                (mp.mpf(entry["raw_real_radius"]), raw.real),
                (mp.mpf(entry["raw_imag_radius"]), raw.imag),
                (mp.mpf(entry["completed_real_radius"]), completed.real),
                (mp.mpf(entry["completed_imag_radius"]), completed.imag),
            )
            if not all(
                radius <= relative_target * max(1, abs(midpoint))
                for radius, midpoint in radii
            ):
                stable = False
            if int(entry["raw_accuracy_bits"]) < precision_bits - 8:
                stable = False
            if int(entry["completed_accuracy_bits"]) < precision_bits - 8:
                stable = False
    if not stable:
        raise ReferenceLseriesNumericalIndeterminacyError(
            "direct L-series refinements did not determine the requested precision",
            {
                "difference": _number_string(difference, precision_bits),
                "tolerance": _number_string(tolerance, precision_bits),
                "cutoffs": [plan["cutoff"] for plan in final_plans],
                "rigorous": False,
            },
        )

    values: list[ReferenceLseriesPointResult] = []
    diagnostics: list[dict[str, Any]] = []
    for index, (point, raw, completed, plan) in enumerate(
        zip(points, final_raw, final_completed, final_plans, strict=True)
    ):
        native_entry = final_native_entries[index] if native_used else None
        values.append(
            {
                "s_real": _number_string(point.real, precision_bits + 32),
                "s_imag": _number_string(point.imag, precision_bits + 32),
                "raw_real": _number_string(raw.real, precision_bits),
                "raw_imag": _number_string(raw.imag, precision_bits),
                "completed_real": _number_string(completed.real, precision_bits),
                "completed_imag": _number_string(completed.imag, precision_bits),
            }
        )
        diagnostics.append(
            {
                "route": "direct",
                "cutoff": plan["cutoff"],
                "coefficient_tail_bound": plan["tail_bound"],
                "node_omission_bound": "0",
                "upper_integral_bound": "0",
                "analytic_error_bound": plan["tail_bound"],
                "known_error_target_met": True,
                "conversion_amplification_bound": "1",
                "raw_real_radius": "0"
                if native_entry is None
                else str(native_entry["raw_real_radius"]),
                "raw_imag_radius": "0"
                if native_entry is None
                else str(native_entry["raw_imag_radius"]),
                "raw_accuracy_bits": precision_bits
                if native_entry is None
                else int(native_entry["raw_accuracy_bits"]),
                "completed_real_radius": "0"
                if native_entry is None
                else str(native_entry["completed_real_radius"]),
                "completed_imag_radius": "0"
                if native_entry is None
                else str(native_entry["completed_imag_radius"]),
                "completed_accuracy_bits": precision_bits
                if native_entry is None
                else int(native_entry["completed_accuracy_bits"]),
                "rigorous": False,
            }
        )
    maximum_tail = max(mp.mpf(plan["tail_bound"]) for plan in final_plans)
    maximum_tail_string = _number_string(maximum_tail, precision_bits)
    return {
        "algorithm": "direct",
        "status": "ok",
        "precision_bits": precision_bits,
        "work_precision_bits": precision_bits + 64,
        "cutoff": maximum_cutoff,
        "required_cutoff": maximum_cutoff,
        "quadrature_degree": 0,
        "quadrature_rule_order": 0,
        "grid_points": 0,
        "coefficient_terms": sum(plan["cutoff"] for plan in final_plans),
        "coefficient_backend": prefix.backend,
        "coefficient_prefix_extensions": prefix.extensions,
        "coefficient_horner": "Acb direct Dirichlet series"
        if native_used
        else "mpmath direct Dirichlet series",
        "coefficient_roundoff_status": "estimated_by_independent_precision",
        "values": values,
        "point_diagnostics": diagnostics,
        "coefficient_tail_bound": maximum_tail_string,
        "node_omission_bound": "0",
        "upper_integral_bound": "0",
        "analytic_error_bound": maximum_tail_string,
        "raw_analytic_error_bound": maximum_tail_string,
        "conversion_amplification_bound": "1",
        "refinement_difference": _number_string(difference, precision_bits),
        "refinement_tolerance": _number_string(tolerance, precision_bits),
        "refinement_runs": [
            {
                "precision_bits": precision_bits,
                "cutoffs": [plan["cutoff"] for plan in first_plans],
            },
            {
                "precision_bits": precision_bits + 32,
                "cutoffs": [plan["cutoff"] for plan in final_plans],
            },
        ],
        "refinement_stable": True,
        "rigorous": False,
        "analytic_error_status": "proved_direct_coefficient_tail_only",
        "quadrature_error_status": "not_applicable",
    }


def _native_point_results(
    normalized_points: list[list[str]], native_values: list[Any]
) -> tuple[list[ReferenceLseriesPointResult], list[dict[str, Any]]]:
    if len(normalized_points) != len(native_values):
        raise ReferenceLseriesNumericalIndeterminacyError(
            "the native L-series evaluator returned the wrong point count",
            {"expected": len(normalized_points), "actual": len(native_values)},
        )
    answer: list[ReferenceLseriesPointResult] = []
    diagnostics: list[dict[str, Any]] = []
    for point, value in zip(normalized_points, native_values, strict=True):
        raw = _mapping_value(value, "raw", default=value)
        completed = _mapping_value(value, "completed", default=value)
        answer.append(
            {
                "s_real": point[0],
                "s_imag": point[1],
                "raw_real": str(
                    _mapping_value(
                        raw,
                        "realMidpoint",
                        "real_midpoint",
                        "raw_real",
                        "rawReal",
                        default="0",
                    )
                ),
                "raw_imag": str(
                    _mapping_value(
                        raw,
                        "imagMidpoint",
                        "imag_midpoint",
                        "raw_imag",
                        "rawImag",
                        default="0",
                    )
                ),
                "completed_real": str(
                    _mapping_value(
                        completed,
                        "realMidpoint",
                        "real_midpoint",
                        "completed_real",
                        "completedReal",
                        default="0",
                    )
                ),
                "completed_imag": str(
                    _mapping_value(
                        completed,
                        "imagMidpoint",
                        "imag_midpoint",
                        "completed_imag",
                        "completedImag",
                        default="0",
                    )
                ),
            }
        )
        diagnostics.append(
            {
                "raw_real_radius": str(
                    _mapping_value(
                        raw,
                        "realRadius",
                        "real_radius",
                        "raw_real_radius",
                        default="+inf",
                    )
                ),
                "raw_imag_radius": str(
                    _mapping_value(
                        raw,
                        "imagRadius",
                        "imag_radius",
                        "raw_imag_radius",
                        default="+inf",
                    )
                ),
                "raw_accuracy_bits": int(
                    _mapping_value(
                        raw,
                        "accuracyBits",
                        "accuracy_bits",
                        "raw_accuracy_bits",
                        default=-1,
                    )
                ),
                "completed_real_radius": str(
                    _mapping_value(
                        completed,
                        "realRadius",
                        "real_radius",
                        "completed_real_radius",
                        default="+inf",
                    )
                ),
                "completed_imag_radius": str(
                    _mapping_value(
                        completed,
                        "imagRadius",
                        "imag_radius",
                        "completed_imag_radius",
                        default="+inf",
                    )
                ),
                "completed_accuracy_bits": int(
                    _mapping_value(
                        completed,
                        "accuracyBits",
                        "accuracy_bits",
                        "completed_accuracy_bits",
                        default=-1,
                    )
                ),
                "coefficient_tail_bound": str(
                    _mapping_value(
                        value,
                        "coefficientTailBound",
                        "coefficient_tail_bound",
                        default="+inf",
                    )
                ),
                "node_omission_bound": str(
                    _mapping_value(
                        value,
                        "gridOmissionBound",
                        "grid_omission_bound",
                        default="+inf",
                    )
                ),
                "upper_integral_bound": str(
                    _mapping_value(
                        value,
                        "outerTailBound",
                        "outer_tail_bound",
                        default="+inf",
                    )
                ),
                "analytic_error_bound": str(
                    _mapping_value(
                        value,
                        "analyticErrorBound",
                        "analytic_error_bound",
                        default="+inf",
                    )
                ),
                "known_error_target_met": bool(
                    _mapping_value(
                        value,
                        "knownErrorTargetMet",
                        "known_error_target_met",
                        default=True,
                    )
                ),
                "conversion_amplification_bound": str(
                    _mapping_value(
                        value,
                        "rawConversionMagnitude",
                        "raw_conversion_magnitude",
                        "conversionAmplificationBound",
                        "conversion_amplification_bound",
                        default="+inf",
                    )
                ),
                "rigorous": False,
            }
        )
    return answer, diagnostics


def _native_midpoint_lists(
    values: list[ReferenceLseriesPointResult],
) -> tuple[list[Any], list[Any]]:
    raw = [mp.mpc(value["raw_real"], value["raw_imag"]) for value in values]
    completed = [
        mp.mpc(value["completed_real"], value["completed_imag"]) for value in values
    ]
    return raw, completed


def _native_point_accuracy_is_stable(
    values: list[ReferenceLseriesPointResult],
    diagnostics: list[dict[str, Any]],
    precision_bits: int,
) -> bool:
    """Check arithmetic radii and known analytic omissions point by point."""
    relative_target = mp.power(2, -precision_bits + 6)
    for value, diagnostic in zip(values, diagnostics, strict=True):
        if not bool(diagnostic["known_error_target_met"]):
            return False
        raw = mp.mpc(value["raw_real"], value["raw_imag"])
        completed = mp.mpc(value["completed_real"], value["completed_imag"])
        component_checks = (
            (mp.mpf(diagnostic["raw_real_radius"]), mp.mpf(value["raw_real"])),
            (mp.mpf(diagnostic["raw_imag_radius"]), mp.mpf(value["raw_imag"])),
            (
                mp.mpf(diagnostic["completed_real_radius"]),
                mp.mpf(value["completed_real"]),
            ),
            (
                mp.mpf(diagnostic["completed_imag_radius"]),
                mp.mpf(value["completed_imag"]),
            ),
        )
        if not all(
            radius <= relative_target * max(1, abs(midpoint))
            for radius, midpoint in component_checks
        ):
            return False
        if int(diagnostic["raw_accuracy_bits"]) < precision_bits - 8:
            return False
        if int(diagnostic["completed_accuracy_bits"]) < precision_bits - 8:
            return False
        analytic_error = mp.mpf(diagnostic["analytic_error_bound"])
        if analytic_error > relative_target * max(1, abs(raw)):
            return False
        if analytic_error > relative_target * max(1, abs(completed)):
            return False
    return True


def _maximum_diagnostic_bound(diagnostics: list[dict[str, Any]], field: str) -> str:
    maximum = max(mp.mpf(diagnostic[field]) for diagnostic in diagnostics)
    return str(mp.nstr(maximum, n=30))


def _native_required_cutoff(
    curve: Any,
    normalized_points: list[list[str]],
    precision_bits: int,
    limits: ReferenceLseriesLimits,
) -> tuple[Any, int]:
    """Ask the early-return native planner before generating coefficients."""
    native = curve._lseries_values_native([0, 1], normalized_points, precision_bits)
    status = str(_mapping_value(native, "status", default="ok"))
    if status not in ("ok", "insufficient_coefficients"):
        raise ReferenceLseriesResourceError(
            "the native L-series evaluator rejected its work plan", native
        )
    required = int(
        _mapping_value(native, "requiredCutoff", "required_cutoff", default=1)
    )
    if required < 1 or required > limits.maximum_coefficients:
        raise ReferenceLseriesResourceError(
            "L-series coefficient cutoff exceeds the resource limit",
            {"required_cutoff": required, "limit": limits.maximum_coefficients},
        )
    return native, required


def _call_native_ready(
    curve: Any,
    normalized_points: list[list[str]],
    precision_bits: int,
    coefficients: list[int],
) -> tuple[Any, list[ReferenceLseriesPointResult], list[dict[str, Any]]]:
    """Run a previously planned native request with one shared prefix."""
    native = curve._lseries_values_native(
        coefficients, normalized_points, precision_bits
    )
    status = str(_mapping_value(native, "status", default="ok"))
    if status != "ok":
        raise ReferenceLseriesNumericalIndeterminacyError(
            "the planned native L-series cutoff was not accepted",
            native,
        )
    if not bool(
        _mapping_value(
            native,
            "knownErrorTargetMet",
            "known_error_target_met",
            default=True,
        )
    ):
        raise ReferenceLseriesNumericalIndeterminacyError(
            "the native L-series analytic error target was not met", native
        )
    raw_values = _mapping_value(native, "values", default=[])
    values, diagnostics = _native_point_results(normalized_points, list(raw_values))
    return native, values, diagnostics


def _call_native_nested_refinement(
    curve: Any,
    normalized_points: list[list[str]],
    precision_bits: int,
    prefix: CoefficientPrefix,
    limits: ReferenceLseriesLimits,
) -> tuple[
    Any,
    list[ReferenceLseriesPointResult],
    list[dict[str, Any]],
    list[ReferenceLseriesPointResult],
    list[dict[str, Any]],
]:
    """Plan and run one nested coarse/fine native grid."""
    refinement_bits = 32
    planned = curve._lseries_values_native(
        [0, 1], normalized_points, precision_bits, refinement_bits
    )
    status = str(_mapping_value(planned, "status", default="ok"))
    if status not in ("ok", "insufficient_coefficients"):
        raise ReferenceLseriesResourceError(
            "the nested native L-series planner rejected its request", planned
        )
    required = int(
        _mapping_value(planned, "requiredCutoff", "required_cutoff", default=0)
    )
    if required < 1 or required > limits.maximum_coefficients:
        raise ReferenceLseriesResourceError(
            "L-series coefficient cutoff exceeds the resource limit",
            {"required_cutoff": required, "limit": limits.maximum_coefficients},
        )
    coefficients = prefix.through(required)
    native = curve._lseries_values_native(
        coefficients, normalized_points, precision_bits, refinement_bits
    )
    if str(_mapping_value(native, "status", default="ok")) != "ok":
        raise ReferenceLseriesNumericalIndeterminacyError(
            "the nested native L-series cutoff was not accepted", native
        )
    if not bool(
        _mapping_value(
            native,
            "knownErrorTargetMet",
            "known_error_target_met",
            default=True,
        )
    ):
        raise ReferenceLseriesNumericalIndeterminacyError(
            "the nested native L-series analytic error target was not met", native
        )
    final_entries = list(_mapping_value(native, "values", default=[]))
    coarse_entries = list(
        _mapping_value(native, "coarseValues", "coarse_values", default=[])
    )
    if len(coarse_entries) != len(normalized_points):
        raise NotImplementedError("the native nested-refinement result is unavailable")
    final_values, final_diagnostics = _native_point_results(
        normalized_points, final_entries
    )
    coarse_values, coarse_diagnostics = _native_point_results(
        normalized_points, coarse_entries
    )
    # Known coefficient/local-grid/outer omissions are those of the shared
    # stronger fine plan.  Coarse arithmetic radii and accuracy remain its own.
    shared_fields = (
        "coefficient_tail_bound",
        "node_omission_bound",
        "upper_integral_bound",
        "analytic_error_bound",
        "known_error_target_met",
        "conversion_amplification_bound",
    )
    for coarse, final in zip(coarse_diagnostics, final_diagnostics, strict=True):
        for field in shared_fields:
            coarse[field] = final[field]
    return native, coarse_values, coarse_diagnostics, final_values, final_diagnostics


def _native_batch_result(
    first_native: Any,
    first_values: list[ReferenceLseriesPointResult],
    first_point_diagnostics: list[dict[str, Any]],
    final_native: Any,
    final_values: list[ReferenceLseriesPointResult],
    final_point_diagnostics: list[dict[str, Any]],
    precision_bits: int,
    prefix: CoefficientPrefix,
) -> ReferenceLseriesBatchResult:
    first_raw, first_completed = _native_midpoint_lists(first_values)
    final_raw, final_completed = _native_midpoint_lists(final_values)
    difference = _maximum_refinement_difference(
        first_raw, first_completed, final_raw, final_completed
    )
    tolerance = _refinement_tolerance(final_raw, final_completed, precision_bits)
    stable = (
        _refinement_is_stable(
            first_raw,
            first_completed,
            final_raw,
            final_completed,
            precision_bits,
        )
        and _native_point_accuracy_is_stable(
            first_values, first_point_diagnostics, precision_bits
        )
        and _native_point_accuracy_is_stable(
            final_values, final_point_diagnostics, precision_bits
        )
    )
    runs: list[dict[str, Any]] = []
    for native in (first_native, final_native):
        runs.append(
            {
                "precision_bits": int(
                    _mapping_value(native, "precisionBits", "precision_bits", default=0)
                ),
                "work_precision_bits": int(
                    _mapping_value(
                        native, "workPrecisionBits", "work_precision_bits", default=0
                    )
                ),
                "cutoff": int(_mapping_value(native, "cutoff", default=0)),
                "required_cutoff": int(
                    _mapping_value(
                        native, "requiredCutoff", "required_cutoff", default=0
                    )
                ),
                "grid_points": int(
                    _mapping_value(native, "gridPoints", "grid_points", default=0)
                ),
            }
        )
    if not stable:
        raise ReferenceLseriesNumericalIndeterminacyError(
            "native L-series refinements did not determine the requested precision",
            {
                "difference": _number_string(difference, precision_bits),
                "tolerance": _number_string(tolerance, precision_bits),
                "runs": runs,
                "point_diagnostics": final_point_diagnostics,
                "rigorous": False,
            },
        )

    coefficient_tail = _maximum_diagnostic_bound(
        final_point_diagnostics, "coefficient_tail_bound"
    )
    grid_omission = _maximum_diagnostic_bound(
        final_point_diagnostics, "node_omission_bound"
    )
    outer_tail = _maximum_diagnostic_bound(
        final_point_diagnostics, "upper_integral_bound"
    )
    analytic_error = _maximum_diagnostic_bound(
        final_point_diagnostics, "analytic_error_bound"
    )
    return {
        "algorithm": "native",
        "status": "ok",
        "precision_bits": precision_bits,
        "work_precision_bits": int(
            _mapping_value(
                final_native,
                "workPrecisionBits",
                "work_precision_bits",
                default=precision_bits,
            )
        ),
        "cutoff": int(_mapping_value(final_native, "cutoff", default=0)),
        "required_cutoff": int(
            _mapping_value(final_native, "requiredCutoff", "required_cutoff", default=0)
        ),
        "quadrature_degree": 0,
        "quadrature_rule_order": int(
            _mapping_value(
                final_native,
                "quadratureRuleOrder",
                "quadrature_rule_order",
                default=0,
            )
        ),
        "grid_points": int(
            _mapping_value(final_native, "gridPoints", "grid_points", default=0)
        ),
        "coefficient_terms": int(
            _mapping_value(
                final_native, "coefficientTerms", "coefficient_terms", default=0
            )
        ),
        "coefficient_backend": prefix.backend,
        "coefficient_prefix_extensions": prefix.extensions,
        "coefficient_horner": "Acb arbitrary precision",
        "coefficient_roundoff_status": "Acb arithmetic radii checked per point",
        "values": final_values,
        "point_diagnostics": final_point_diagnostics,
        "coefficient_tail_bound": coefficient_tail,
        "node_omission_bound": grid_omission,
        "upper_integral_bound": outer_tail,
        "analytic_error_bound": analytic_error,
        "raw_analytic_error_bound": str(
            _mapping_value(
                final_native,
                "rawAnalyticErrorBound",
                "raw_analytic_error_bound",
                default=analytic_error,
            )
        ),
        "conversion_amplification_bound": str(
            _maximum_diagnostic_bound(
                final_point_diagnostics, "conversion_amplification_bound"
            )
        ),
        "refinement_difference": _number_string(difference, precision_bits),
        "refinement_tolerance": _number_string(tolerance, precision_bits),
        "refinement_runs": runs,
        "refinement_stable": True,
        "rigorous": False,
        "analytic_error_status": str(
            _mapping_value(
                final_native,
                "analyticErrorStatus",
                "analytic_error_status",
                default="coefficient_grid_and_upper_omission_only",
            )
        ),
        "quadrature_error_status": "estimated_by_independent_refinement",
    }


def _mellin_lseries_values(
    curve: Any,
    points: list[Any] | tuple[Any, ...],
    root_number: int,
    precision_bits: int = 53,
    *,
    algorithm: str = "auto",
    coefficient_prefix: CoefficientPrefix | None = None,
    limits: ReferenceLseriesLimits | None = None,
) -> ReferenceLseriesBatchResult:
    """Evaluate a batch through the native kernel or readable reference.

    The stable return shape is identical for both backends: `values` contains
    decimal strings for raw and completed values, while all remaining fields
    are non-rigorous diagnostics.  `auto` falls back only when the optional
    native boundary is unavailable; numerical and resource failures are never
    hidden by silently changing algorithms.
    """
    if algorithm not in ("auto", "native", "reference"):
        raise ValueError("algorithm must be 'auto', 'native', or 'reference'")
    if root_number not in (-1, 1):
        raise ValueError("root number must be +1 or -1")
    precision_bits = int(precision_bits)
    effective_limits = _effective_limits(limits)
    if precision_bits < 32:
        raise ValueError("precision must be at least 32 bits")
    if precision_bits > effective_limits.maximum_precision_bits:
        raise ReferenceLseriesResourceError(
            "L-series precision exceeds the resource limit",
            {
                "precision_bits": precision_bits,
                "limit": effective_limits.maximum_precision_bits,
            },
        )
    prefix = (
        CoefficientPrefix(curve) if coefficient_prefix is None else coefficient_prefix
    )

    old_precision = mp.prec
    mp.prec = max(80, precision_bits + 32)
    try:
        prepared_points = _coerce_points(points)
        normalized = _normalized_point_pairs(prepared_points, precision_bits + 32)
        if algorithm in ("auto", "native"):
            try:
                (
                    native,
                    first_values,
                    first_point_diagnostics,
                    final_values,
                    final_point_diagnostics,
                ) = _call_native_nested_refinement(
                    curve,
                    normalized,
                    precision_bits,
                    prefix,
                    effective_limits,
                )
                result = _native_batch_result(
                    native,
                    first_values,
                    first_point_diagnostics,
                    native,
                    final_values,
                    final_point_diagnostics,
                    precision_bits,
                    prefix,
                )
                result["quadrature_error_status"] = "estimated_by_nested_refinement"
                return result
            except (AttributeError, NotImplementedError, TypeError):
                # Older optional backends may expose the original five-argument
                # call but not the nested-refinement extension.  Keep that
                # mathematically independent two-pass path as a capability
                # fallback and as a useful differential oracle.
                try:
                    refined_precision = precision_bits + 32
                    _first_plan, first_required = _native_required_cutoff(
                        curve, normalized, precision_bits, effective_limits
                    )
                    _final_plan, final_required = _native_required_cutoff(
                        curve,
                        normalized,
                        refined_precision,
                        _internal_refinement_limits(effective_limits, precision_bits),
                    )
                    coefficients = prefix.through(max(first_required, final_required))
                    first_native, first_values, first_point_diagnostics = (
                        _call_native_ready(
                            curve, normalized, precision_bits, coefficients
                        )
                    )
                    final_native, final_values, final_point_diagnostics = (
                        _call_native_ready(
                            curve, normalized, refined_precision, coefficients
                        )
                    )
                    return _native_batch_result(
                        first_native,
                        first_values,
                        first_point_diagnostics,
                        final_native,
                        final_values,
                        final_point_diagnostics,
                        precision_bits,
                        prefix,
                    )
                except (AttributeError, NotImplementedError):
                    if algorithm == "native":
                        raise NotImplementedError(
                            "the native elliptic L-series evaluator is unavailable"
                        ) from None
        return reference_lseries_values(
            curve,
            normalized,
            root_number,
            precision_bits,
            coefficient_prefix=prefix,
            refine=True,
            limits=effective_limits,
        )
    finally:
        mp.prec = old_precision


def _maximum_bound_from_batches(
    batches: list[ReferenceLseriesBatchResult], field: str
) -> str:
    return str(max(mp.mpf(batch[field]) for batch in batches))


def _merge_lseries_batches(
    batches: list[ReferenceLseriesBatchResult],
    placements: list[list[int]],
    point_count: int,
    precision_bits: int,
    prefix: CoefficientPrefix,
) -> ReferenceLseriesBatchResult:
    """Merge independently planned route groups without changing point order."""
    if len(batches) == 1 and placements[0] == list(range(point_count)):
        return batches[0]
    values: list[Any] = [None for _index in range(point_count)]
    diagnostics: list[Any] = [None for _index in range(point_count)]
    for batch, indices in zip(batches, placements, strict=True):
        for local, original in enumerate(indices):
            values[original] = batch["values"][local]
            point_diagnostic = dict(batch["point_diagnostics"][local])
            point_diagnostic["route"] = batch["algorithm"]
            diagnostics[original] = point_diagnostic
    if any(value is None for value in values):
        raise ReferenceLseriesNumericalIndeterminacyError(
            "an L-series route group did not return every requested point",
            {"point_count": point_count, "placements": placements},
        )
    algorithms = sorted({batch["algorithm"] for batch in batches})
    refinement_difference = max(
        mp.mpf(batch["refinement_difference"]) for batch in batches
    )
    refinement_tolerance = min(
        mp.mpf(batch["refinement_tolerance"]) for batch in batches
    )
    return {
        "algorithm": algorithms[0] if len(algorithms) == 1 else "mixed",
        "status": "ok",
        "precision_bits": precision_bits,
        "work_precision_bits": max(batch["work_precision_bits"] for batch in batches),
        "cutoff": max(batch["cutoff"] for batch in batches),
        "required_cutoff": max(batch["required_cutoff"] for batch in batches),
        "quadrature_degree": max(batch["quadrature_degree"] for batch in batches),
        "quadrature_rule_order": max(
            batch["quadrature_rule_order"] for batch in batches
        ),
        "grid_points": sum(batch["grid_points"] for batch in batches),
        "coefficient_terms": sum(batch["coefficient_terms"] for batch in batches),
        "coefficient_backend": prefix.backend,
        "coefficient_prefix_extensions": prefix.extensions,
        "coefficient_horner": "+".join(
            sorted({batch["coefficient_horner"] for batch in batches})
        ),
        "coefficient_roundoff_status": "+".join(
            sorted({batch["coefficient_roundoff_status"] for batch in batches})
        ),
        "values": values,
        "point_diagnostics": diagnostics,
        "coefficient_tail_bound": _maximum_bound_from_batches(
            batches, "coefficient_tail_bound"
        ),
        "node_omission_bound": _maximum_bound_from_batches(
            batches, "node_omission_bound"
        ),
        "upper_integral_bound": _maximum_bound_from_batches(
            batches, "upper_integral_bound"
        ),
        "analytic_error_bound": _maximum_bound_from_batches(
            batches, "analytic_error_bound"
        ),
        "raw_analytic_error_bound": _maximum_bound_from_batches(
            batches, "raw_analytic_error_bound"
        ),
        "conversion_amplification_bound": _maximum_bound_from_batches(
            batches, "conversion_amplification_bound"
        ),
        "refinement_difference": str(refinement_difference),
        "refinement_tolerance": str(refinement_tolerance),
        "refinement_runs": [
            {"algorithm": batch["algorithm"], "runs": batch["refinement_runs"]}
            for batch in batches
        ],
        "refinement_stable": all(batch["refinement_stable"] for batch in batches),
        "rigorous": False,
        "analytic_error_status": "+".join(
            sorted({batch["analytic_error_status"] for batch in batches})
        ),
        "quadrature_error_status": "+".join(
            sorted({batch["quadrature_error_status"] for batch in batches})
        ),
    }


def _route_bucket(point: Any) -> tuple[int, int]:
    """Keep an exceptional point from enlarging every ordinary Mellin grid."""
    return (
        int(abs(float(point.imag)) // 10.0),
        int(abs(float(point.real - 1)) // 2.0),
    )


def lseries_values(
    curve: Any,
    points: list[Any] | tuple[Any, ...],
    root_number: int,
    precision_bits: int = 53,
    *,
    algorithm: str = "auto",
    coefficient_prefix: CoefficientPrefix | None = None,
    limits: ReferenceLseriesLimits | None = None,
) -> ReferenceLseriesBatchResult:
    """Evaluate, deduplicate, route, and regroup an arbitrary moderate batch."""
    if algorithm not in ("auto", "native", "reference"):
        raise ValueError("algorithm must be 'auto', 'native', or 'reference'")
    if root_number not in (-1, 1):
        raise ValueError("root number must be +1 or -1")
    precision_bits = int(precision_bits)
    effective_limits = _effective_limits(limits)
    if precision_bits < 32:
        raise ValueError("precision must be at least 32 bits")
    prepared = _coerce_points(points)
    if len(prepared) > effective_limits.maximum_batch_points:
        raise ReferenceLseriesResourceError(
            "L-series batch exceeds the point-grid resource limit",
            {
                "point_count": len(prepared),
                "limit": effective_limits.maximum_batch_points,
            },
        )
    prefix = (
        CoefficientPrefix(curve) if coefficient_prefix is None else coefficient_prefix
    )

    # Exact decimal pairs give deterministic deduplication without relying on
    # mpmath object identity.  The expansion below restores duplicates and the
    # caller's original order.
    old_precision = mp.prec
    mp.prec = max(96, precision_bits + 48)
    try:
        normalized = _normalized_point_pairs(prepared, precision_bits + 40)
        unique_points: list[Any] = []
        unique_keys: list[str] = []
        key_to_unique: dict[str, int] = {}
        expansion: list[int] = []
        for point, pair in zip(prepared, normalized, strict=True):
            key = pair[0] + "|" + pair[1]
            unique_index = key_to_unique.get(key)
            if unique_index is None:
                unique_index = len(unique_points)
                key_to_unique[key] = unique_index
                unique_points.append(point)
                unique_keys.append(key)
            expansion.append(unique_index)

        direct_indices: list[int] = []
        mellin_buckets: dict[tuple[int, int], list[int]] = {}
        for index, point in enumerate(unique_points):
            direct_plan = None
            direct_plan = plan_direct_lseries(
                point,
                precision_bits + 32,
                maximum_coefficients=effective_limits.maximum_coefficients,
            )
            if direct_plan is not None:
                direct_indices.append(index)
            else:
                bucket = _route_bucket(point)
                mellin_buckets.setdefault(bucket, []).append(index)

        batches: list[ReferenceLseriesBatchResult] = []
        placements: list[list[int]] = []
        if direct_indices:
            direct_points = [unique_points[index] for index in direct_indices]
            batches.append(
                _direct_lseries_values(
                    curve,
                    direct_points,
                    int(curve.conductor()),
                    precision_bits,
                    prefix,
                    effective_limits,
                    algorithm,
                )
            )
            placements.append(direct_indices)

        chunk_size = 64 if algorithm == "reference" else 10_000
        for indices in mellin_buckets.values():
            for start in range(0, len(indices), chunk_size):
                chunk = indices[start : start + chunk_size]
                batches.append(
                    _mellin_lseries_values(
                        curve,
                        [unique_points[index] for index in chunk],
                        root_number,
                        precision_bits,
                        algorithm=algorithm,
                        coefficient_prefix=prefix,
                        limits=effective_limits,
                    )
                )
                placements.append(chunk)
        unique_result = _merge_lseries_batches(
            batches,
            placements,
            len(unique_points),
            precision_bits,
            prefix,
        )
        if expansion == list(range(len(unique_points))):
            return unique_result
        expanded_values = [unique_result["values"][index] for index in expansion]
        expanded_diagnostics = [
            unique_result["point_diagnostics"][index] for index in expansion
        ]
        unique_result["values"] = expanded_values
        unique_result["point_diagnostics"] = expanded_diagnostics
        return unique_result
    finally:
        mp.prec = old_precision


def reference_incomplete_gamma_value(
    coefficients: list[int],
    conductor: int,
    root_number: int,
    point: Any,
    precision_bits: int = 80,
) -> ReferenceLseriesPointResult:
    """Evaluate the independent finite incomplete-gamma coefficient sum.

    The caller chooses the explicit coefficient prefix.  This helper does not
    claim a tail bound and is intended only for focused differential checks.
    """
    if root_number not in (-1, 1):
        raise ValueError("root number must be +1 or -1")
    if precision_bits < 32:
        raise ValueError("precision must be at least 32 bits")
    old_precision = mp.prec
    mp.prec = int(precision_bits) + 24
    try:
        s_value = _coerce_point(point)
        a_value = 2 * mp.pi / mp.sqrt(mp.mpf(int(conductor)))
        completed = mp.mpc(0)
        for index in range(1, len(coefficients)):
            coefficient = mp.mpf(int(coefficients[index]))
            x_value = a_value * index
            completed += coefficient * (
                mp.power(x_value, -s_value) * mp.gammainc(s_value, x_value, mp.inf)
                + root_number
                * mp.power(x_value, s_value - 2)
                * mp.gammainc(2 - s_value, x_value, mp.inf)
            )
        raw = completed * mp.power(a_value, s_value) * mp.rgamma(s_value)
        return _result_values([s_value], [raw], [completed], int(precision_bits))[0]
    finally:
        mp.prec = old_precision
