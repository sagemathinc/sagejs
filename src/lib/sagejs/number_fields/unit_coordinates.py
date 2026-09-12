"""Bounded unit coordinates over an already authenticated fundamental system.

This is a correctness interface, not a new class/unit discovery engine. Compact
construction is exact. Nonreusable standard terminals require fresh bounded
completion replay; arbitrary detached factored membership remains unsupported.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

import sagejs.runtime as runtime
from sagejs.number_fields import class_unit_analytic as analytic
from sagejs.number_fields import class_unit_context as context_module
from sagejs.number_fields import class_unit_groups as groups
from sagejs.number_fields import embeddings
from sagejs.number_fields import units as unit_support
from sagejs.number_fields.factored_elements import (
    FactoredLogarithmWorkspace,
    FactoredNumberFieldElement,
    _checked_exponent,
)


class UnitCoordinateCapabilityError(NotImplementedError):
    """The bounded map does not support this authority or representation."""


class UnitCoordinateResourceError(RuntimeError):
    """A coordinate request exceeded its explicit arithmetic size policy."""


_MAP_TOKEN = object()


def _coordinates(
    values: Iterable[Any], rank: int, order: int, bits: int
) -> tuple[int, ...]:
    result = []
    for value in values:
        if len(result) >= rank + 1:
            raise ValueError("unit coordinates have the wrong dimension")
        exponent = _checked_exponent(value)
        if abs(exponent).bit_length() > bits:
            raise UnitCoordinateResourceError("unit coordinate exceeds its bit limit")
        result.append(exponent)
    if len(result) != rank + 1:
        raise ValueError("unit coordinates have the wrong dimension")
    result[0] %= order
    return tuple(result)


def _integer_log_solution(
    basis_logs: Sequence[Sequence[Any]], input_logs: Sequence[Any]
) -> tuple[int, ...] | None:
    """Enclose the true linear solution; require one integer in each interval.

    The caller must separately prove input membership and basis completeness.
    Without those premises, this is only an interval candidate computation.
    """
    rank = len(basis_logs)
    if len(input_logs) != rank or any(len(row) != rank for row in basis_logs):
        raise ValueError("logarithmic matrix has the wrong dimensions")
    if rank == 0:
        return ()
    if rank > 3:
        raise UnitCoordinateCapabilityError(
            "first-slice log solve supports rank at most three"
        )
    matrix = [
        [basis_logs[column][row] for column in range(rank)] for row in range(rank)
    ]
    if any(
        type(x) is not analytic.RealBall or not x.rigorous
        for row in matrix
        for x in row
    ):
        raise ArithmeticError("unit coordinates require rigorous logarithms")
    if any(type(x) is not analytic.RealBall or not x.rigorous for x in input_logs):
        raise ArithmeticError("unit coordinates require rigorous input logarithms")
    determinant = analytic._determinant_ball(matrix, maximum_states=8, cancelled=None)
    if determinant.contains_zero():
        return None
    result = []
    for column in range(rank):
        replaced = [list(row) for row in matrix]
        for row in range(rank):
            replaced[row][column] = input_logs[row]
        numerator = analytic._determinant_ball(
            replaced, maximum_states=8, cancelled=None
        )
        interval = numerator / determinant
        lower, upper = interval.lower.ceil(), interval.upper.floor()
        if lower > upper:
            raise ArithmeticError(
                "unit logarithms contradict the complete integer lattice"
            )
        if lower != upper:
            return None
        result.append(lower)
    return tuple(result)


def _element_snapshot(
    element: Any, degree: int, bits: int
) -> tuple[tuple[int, int], ...]:
    if len(element._coefficients) > degree:
        raise UnitCoordinateResourceError("unit element exceeds its field dimension")
    values = element.list()
    if len(values) != degree:
        raise TypeError("unit element has the wrong field degree")
    result = []
    for value in values:
        numerator, denominator = int(value._numerator), int(value._denominator)
        if max(abs(numerator).bit_length(), denominator.bit_length()) > bits:
            raise UnitCoordinateResourceError(
                "element coefficient exceeds its bit limit"
            )
        result.append((numerator, denominator))
    return tuple(result)


def _factored_snapshot(value: Any, field: Any, bits: int) -> Any:
    if type(value) is not FactoredNumberFieldElement or value.field() is not field:
        raise TypeError("compact units must belong to the exact map field")
    if len(value.factors()) > 4096:
        raise UnitCoordinateResourceError("compact unit exceeds the factor-count limit")
    if any(abs(exponent).bit_length() > 65536 for _, exponent in value.factors()):
        raise UnitCoordinateResourceError(
            "compact exponent exceeds the input bit limit"
        )
    return tuple(
        (_element_snapshot(factor, int(field.degree()), bits), exponent)
        for factor, exponent in value.factors()
    )


def _recognized_authority(source: Any) -> tuple[Any, Any, Any]:
    if type(source) is not groups.ClassUnitComputation or source.complete is not True:
        raise UnitCoordinateCapabilityError(
            "unit maps require a complete standard computation"
        )
    context = source.context
    if (
        type(context) is not context_module.ClassUnitGroupContext
        or context.field is not source.field
        or context.order.number_field() is not source.field
        or type(context.proof_state) is not context_module.ClassUnitProofState
        or context.proof_state.label != source.proof_status
    ):
        raise UnitCoordinateCapabilityError(
            "unit maps require the original field/order context"
        )
    units = source._unit_group
    if type(units) is not groups.UnitGroupComputation or units.complete is not True:
        raise UnitCoordinateCapabilityError(
            "unit maps require the standard complete unit wrapper"
        )
    if (
        source.proof_status
        not in (groups.EXACT_UNCONDITIONAL, groups.EXACT_RELATIONS_CONDITIONAL_GRH)
        or units.proof_status != source.proof_status
    ):
        raise UnitCoordinateCapabilityError("unit map proof policies disagree")
    if type(units.torsion) is not unit_support.RootsOfUnityResult:
        raise UnitCoordinateCapabilityError(
            "unit maps require canonical torsion evidence"
        )
    evidence = units._completion_evidence
    if type(evidence) is groups.ClassUnitSaturationRecord:
        if (
            type(evidence._analytic_certificate)
            is not analytic.UnitSaturationIndexCertificate
            or evidence._analytic_module is not analytic
            or evidence._field is not source.field
            or evidence._order is not context.order
            or not evidence.complete
            or not evidence.rigorous
            or not evidence.saturated
            or evidence.remaining_index_bound != 1
            or source.saturation_record is not evidence
            or not context_module.ClassUnitGroupContext._unit_coordinate_source_authenticated(
                context, context_module._LIVE_CLASS_UNIT_CONTEXT_TOKEN, source
            )
        ):
            raise UnitCoordinateCapabilityError(
                "unit map terminal authority is unavailable or changed"
            )
    elif (
        type(evidence) is unit_support.UnitSubgroupResult
        and type(evidence.completion_certificate)
        is unit_support.UnitCompletionCertificate
        and evidence.completion_certificate.kind == "rank-zero"
    ):
        if (
            source.proof_status != groups.EXACT_UNCONDITIONAL
            or evidence.field is not source.field
            or units.unit_rank != 0
            or units.generators != ()
            or evidence.torsion is not units.torsion
            or not context_module.ClassUnitGroupContext._unit_coordinate_source_authenticated(
                context,
                context_module._LIVE_CLASS_UNIT_CONTEXT_TOKEN,
                source,
                rank_zero=True,
            )
            or not unit_support.UnitCompletionCertificate.verify(
                evidence.completion_certificate, evidence
            )
        ):
            raise UnitCoordinateCapabilityError(
                "rank-zero unit authority failed exact replay"
            )
    else:
        raise UnitCoordinateCapabilityError(
            "this specialized unit authority is not supported yet"
        )
    return context.order, units, evidence


def _nonreusable_terminal(source: Any) -> bool:
    """Select a terminal replay path, never rescue an arbitrary live rejection."""
    if (
        type(source) is not groups.ClassUnitComputation
        or source.complete is not True
        or source.proof_status != groups.EXACT_RELATIONS_CONDITIONAL_GRH
        or type(source.context) is not context_module.ClassUnitGroupContext
        or type(source.context.proof_state) is not context_module.ClassUnitProofState
        or source.context.proof_state.label != source.proof_status
        or type(source._unit_group) is not groups.UnitGroupComputation
        or source._unit_group.complete is not True
        or source._unit_group.proof_status != source.proof_status
        or type(source.saturation_record) is not groups.ClassUnitSaturationRecord
        or source._unit_group._completion_evidence is not source.saturation_record
        or source.saturation_record.complete is not True
        or source.saturation_record.rigorous is not True
        or source.saturation_record.saturated is not True
        or source.saturation_record.remaining_index_bound != 1
    ):
        return False
    live = source.context._live_artifacts
    return bool(
        type(live) is context_module._LiveClassUnitArtifacts
        and live.sealed
        and live.reusable is False
        and live.field is source.field
        and source.context.field is source.field
        and live.order is source.context.order
        and live.unit_group is source._unit_group
        and live.class_group is source._class_group
        and live.saturation_record is source.saturation_record
        and live.terminal_proof_status == source.proof_status
    )


def _resumed_source_snapshot(source: Any, bits: int) -> Any:
    """Bind source semantics, not producer callbacks or complete flags alone."""
    from sagejs.number_fields import class_unit_replay as replay

    if not _nonreusable_terminal(source):
        raise UnitCoordinateCapabilityError("nonreusable terminal source changed")
    replay._component_claim_source(source, resumed_copy=True)
    certificate = source.saturation_record._analytic_certificate
    encoded = certificate._body_json
    # This private source snapshot, unlike the public compact export, retains
    # the producer certificate body for mutation detection. Bound it before
    # traversing it; never impose this extra retention on public export users.
    if type(encoded) is not str:
        raise UnitCoordinateCapabilityError("terminal analytic claim changed")
    if (
        len(encoded) > replay.MAX_BYTES
        or len(encoded.encode("utf-8")) > replay.MAX_BYTES
    ):
        raise replay.ComponentReplayResourceError("analytic claim exceeds byte limit")
    if not certificate._authenticated_body_matches():
        raise UnitCoordinateCapabilityError("terminal analytic claim changed")
    torsion = source._unit_group.torsion
    if (
        type(torsion) is not unit_support.RootsOfUnityResult
        or type(torsion.certificate) is not unit_support.RootsOfUnityCertificate
    ):
        raise UnitCoordinateCapabilityError("terminal torsion claim changed")
    field = source.field
    degree = int(field.degree())
    return (
        context_module.stable_component_hash(
            context_module._order_fingerprint(field, source.context.order)
        ),
        context_module.stable_component_hash(source.context.proof_state.to_dict()),
        tuple(
            _factored_snapshot(u, field, bits) for u in source._unit_group.generators
        ),
        source._unit_group.unit_rank,
        _element_snapshot(torsion.generator, degree, bits),
        tuple(_element_snapshot(u, degree, bits) for u in torsion.elements),
        torsion.order,
        torsion.complete,
        context_module.stable_component_hash(torsion.certificate.to_dict()),
        certificate._body_json,
        # Exact mutation comparison needs the bounded data, not another schema
        # replay. Full preflight remains at admission; no arithmetic is cached.
        replay._json(replay._terminal_component_body(source)),
    )


def _replay_resumed_units(source: Any, bits: int) -> tuple[Any, Any, Any]:
    """Replay once, then copy the verified ordered basis into the original field."""
    from sagejs.number_fields import class_unit_replay as replay
    from sagejs.number_fields.class_group_proof_contracts import (
        BDF_CLASS_CHARACTER_GRH,
        BELABAS_FRIEDMAN_ZETA_GRH,
    )

    theorem = source.context.proof_state.factor_base_theorem
    if theorem == "Belabas--Diaz y Diaz--Friedman":
        selector = "bdf"
        assumptions = sorted([BDF_CLASS_CHARACTER_GRH, BELABAS_FRIEDMAN_ZETA_GRH])
    elif theorem == "Minkowski":
        selector = "minkowski"
        assumptions = [BELABAS_FRIEDMAN_ZETA_GRH]
    else:
        raise UnitCoordinateCapabilityError("unsupported terminal generation theorem")
    if source.context.proof_state.assumptions != tuple(assumptions):
        raise UnitCoordinateCapabilityError("terminal theorem assumptions differ")
    replay._component_claim_source(source)
    before = _resumed_source_snapshot(source, bits)
    claims = replay._conditional_completion_claims(source, generation_theorem=selector)
    _, _, checked_units, checked_torsion, report = replay._replay_conditional_owned(
        claims
    )
    if (
        _resumed_source_snapshot(source, bits) != before
        or context_module._order_fingerprint(source.field, source.context.order)
        != report["field_order"]
        or list(source.context.proof_state.assumptions) != report["assumptions"]
        or source._unit_group.unit_rank != report["free_unit_rank"]
    ):
        raise UnitCoordinateCapabilityError("replayed terminal binding differs")
    # The fresh replay established these exact coefficient products in the
    # identical defining polynomial and maximal order. Transport is canonical,
    # not a field-isomorphism search, expansion, or producer-owned alias.
    basis = tuple(
        FactoredNumberFieldElement.from_dict(source.field, unit.to_dict())
        for unit in checked_units
    )
    certificate = unit_support.RootsOfUnityCertificate.from_dict(
        source.field, checked_torsion.certificate.to_dict()
    )
    roots = [
        source.field._from_coefficients(root.list())
        for root in checked_torsion.elements
    ]
    torsion = unit_support.RootsOfUnityResult(
        roots,
        source.field._from_coefficients(checked_torsion.generator.list()),
        checked_torsion.order,
        True,
        "fresh conditional completion replay",
        certificate,
    )
    claimed_torsion = source._unit_group.torsion
    if (
        claimed_torsion.complete is not True
        or torsion.order != claimed_torsion.order
        or torsion.generator != claimed_torsion.generator
        or torsion.elements != claimed_torsion.elements
    ):
        raise UnitCoordinateCapabilityError("replayed torsion differs from source")
    return basis, torsion, before


class UnitCoordinateMap:
    """A torsion-first map with explicit compact and expanded reconstruction."""

    def __init__(
        self,
        token: Any,
        source: Any,
        *,
        max_precision_bits: int,
        max_input_bits: int,
        max_exponent_bits: int,
        max_expansion_weight: int,
    ) -> None:
        if token is not _MAP_TOKEN:
            raise TypeError(
                "construct unit maps through ClassUnitComputation.unit_coordinate_map"
            )
        replayed = _nonreusable_terminal(source)
        if replayed:
            basis, torsion, source_snapshot = _replay_resumed_units(
                source, max_input_bits
            )
            order, units, evidence = (
                source.context.order,
                source._unit_group,
                source.saturation_record,
            )
        else:
            order, units, evidence = _recognized_authority(source)
            basis, torsion, source_snapshot = (
                tuple(units.generators),
                units.torsion,
                None,
            )
        self._source, self._field, self._order = source, source.field, order
        self._context = source.context
        self._units, self._evidence = units, evidence
        self._rank = units.unit_rank
        self._proof_status = source.proof_status
        self._max_precision_bits = max_precision_bits
        self._max_input_bits = max_input_bits
        self._max_exponent_bits = max_exponent_bits
        self._max_expansion_weight = max_expansion_weight
        self._replayed = replayed
        self._source_snapshot = source_snapshot
        self._source_basis = tuple(units.generators)
        self._source_torsion = units.torsion
        self._source_certificate = evidence._analytic_certificate if replayed else None
        self._source_components = (
            (
                tuple(source.conditional_factor_base),
                tuple(source.conditional_relation_records),
                source.conditional_presentation_evidence,
            )
            if replayed
            else None
        )
        self._torsion = torsion
        self._basis = basis
        if not 0 <= self._rank <= 3 or len(self._basis) != self._rank:
            raise UnitCoordinateCapabilityError(
                "unit maps support complete ranks zero through three"
            )
        if not unit_support.RootsOfUnityResult.verify(self._torsion):
            raise ArithmeticError("unit map torsion certificate failed replay")
        self._torsion_order = self._torsion.order
        self._torsion_generator = FactoredNumberFieldElement.from_element(
            self._field, self._torsion.generator
        )
        self._snapshot = self._semantic_snapshot()
        # Entries are hints only: every hit reconstructs and compares the exact
        # formal product against freshly read factor coefficients.
        self._constructed: list[Any] = []
        runtime.object.freeze(self)

    def _semantic_snapshot(self) -> Any:
        degree = int(self._field.degree())
        bits = self._max_input_bits
        if self._replayed:
            from sagejs.number_fields import class_unit_replay as replay

            if (
                type(self._torsion.certificate)
                is not unit_support.RootsOfUnityCertificate
                or len(self._torsion.elements) > 12
                or self._torsion.generator.parent() is not self._field
                or any(u.parent() is not self._field for u in self._torsion.elements)
            ):
                raise UnitCoordinateCapabilityError("replayed map torsion changed")
            replay._bounded_claim_tree(self._torsion.certificate._payload_tuple())
        snapshot = (
            context_module.stable_component_hash
            if self._replayed
            else context_module.canonical_component
        )
        return (
            tuple(
                (int(x._numerator), int(x._denominator))
                for x in self._field._defining_coefficients
            ),
            tuple(
                tuple((int(x._numerator), int(x._denominator)) for x in row)
                for row in self._order._basis_rows
            ),
            tuple(_factored_snapshot(u, self._field, bits) for u in self._basis),
            _element_snapshot(self._torsion.generator, degree, bits),
            tuple(_element_snapshot(u, degree, bits) for u in self._torsion.elements),
            self._torsion.order,
            self._torsion.complete,
            snapshot(self._source.context.proof_state.to_dict()),
            snapshot(self._torsion.certificate.to_dict()),
        )

    def _check(self) -> None:
        if self._replayed:
            components = self._source_components
            if components is None or (
                self._source.saturation_record._analytic_certificate
                is not self._source_certificate
                or self._source.conditional_presentation_evidence is not components[2]
                or any(
                    len(current) != len(original)
                    or any(a is not b for a, b in zip(current, original, strict=True))
                    for current, original in (
                        (self._source.conditional_factor_base, components[0]),
                        (self._source.conditional_relation_records, components[1]),
                        (self._source._unit_group.generators, self._source_basis),
                    )
                )
            ):
                raise UnitCoordinateCapabilityError(
                    "replayed component identity changed"
                )
            try:
                snapshot = _resumed_source_snapshot(self._source, self._max_input_bits)
            except (ValueError, TypeError, AttributeError, ArithmeticError) as error:
                raise UnitCoordinateCapabilityError(
                    "replayed unit map source changed"
                ) from error
            if snapshot != self._source_snapshot:
                raise UnitCoordinateCapabilityError("replayed unit map source changed")
            order, units, evidence = (
                self._source.context.order,
                self._source._unit_group,
                self._source.saturation_record,
            )
        else:
            order, units, evidence = _recognized_authority(self._source)
        if (
            self._source.field is not self._field
            or self._source.context is not self._context
            or order is not self._order
            or units is not self._units
            or evidence is not self._evidence
            or self._source.proof_status != self._proof_status
            or units.torsion is not self._source_torsion
            or units.generators != self._source_basis
            or self._semantic_snapshot() != self._snapshot
        ):
            raise UnitCoordinateCapabilityError(
                "unit coordinate authority changed after publication"
            )

    @property
    def proof_status(self) -> str:
        self._check()
        return self._proof_status

    def gens(self) -> tuple[Any, ...]:
        """Return compact generators, with the torsion generator first."""
        self._check()
        return (self._torsion_generator,) + self._basis

    def _product(self, coordinates: tuple[int, ...]) -> Any:
        result = self._torsion_generator ** coordinates[0]
        for unit, exponent in zip(self._basis, coordinates[1:], strict=True):
            result = result * (unit**exponent)
        return result

    def factored_exp(self, coordinates: Iterable[Any]) -> Any:
        """Construct an exact compact product and remember a checked hint."""
        self._check()
        checked = _coordinates(
            coordinates, self._rank, self._torsion_order, self._max_exponent_bits
        )
        result = self._product(checked)
        _factored_snapshot(result, self._field, self._max_input_bits)
        if len(self._constructed) >= 32:
            self._constructed.pop(0)
        self._constructed.append((result, checked))
        return result

    def exp(self, coordinates: Iterable[Any]) -> Any:
        """Expand only products admitted by a weighted arithmetic-size policy."""
        self._check()
        result = self.factored_exp(coordinates)
        # Include field reduction and factor coefficient heights before powers.
        degree = int(self._field.degree())
        height = max(
            1,
            *(
                abs(int(x._numerator)).bit_length() + int(x._denominator).bit_length()
                for x in self._field._defining_coefficients
            ),
        )
        weight = 0
        for factor, exponent in result.factors():
            payload = _element_snapshot(factor, degree, self._max_input_bits)
            factor_height = max(
                1, *(abs(a).bit_length() + b.bit_length() for a, b in payload)
            )
            weight += abs(exponent) * degree**4 * (height + factor_height + 1)
            if weight > self._max_expansion_weight:
                raise UnitCoordinateResourceError(
                    "explicit unit expansion exceeds its weighted size policy"
                )
        return result.evaluate()

    def log(self, value: Any) -> tuple[int, ...]:
        """Return exact coordinates or an explicit membership/capability failure."""
        self._check()
        if type(value) is FactoredNumberFieldElement:
            payload = _factored_snapshot(value, self._field, self._max_input_bits)
            for index, generator in enumerate((self._torsion_generator,) + self._basis):
                if (
                    _factored_snapshot(generator, self._field, self._max_input_bits)
                    == payload
                ):
                    coordinate = [0] * (self._rank + 1)
                    coordinate[index] = 1
                    coordinate[0] %= self._torsion_order
                    return tuple(coordinate)
            for original, hint in self._constructed:
                if original is value:
                    checked = _coordinates(
                        hint, self._rank, self._torsion_order, self._max_exponent_bits
                    )
                    if (
                        _factored_snapshot(
                            self._product(checked), self._field, self._max_input_bits
                        )
                        == payload
                    ):
                        return checked
            if not value.factors():
                return (0,) * (self._rank + 1)
            raise UnitCoordinateCapabilityError(
                "arbitrary factored membership is not implemented; no product was expanded"
            )
        if (
            type(value) is not type(self._field.one())
            or value.parent() is not self._field
        ):
            raise TypeError("unit input must belong to the exact map field")
        _element_snapshot(value, int(self._field.degree()), self._max_input_bits)
        if not embeddings.exact_norm_is_unit(
            self._field, value, integral_order=self._order
        )[0]:
            raise ValueError("input is not a unit of the maximal order")
        if self._rank == 0:
            for exponent, root in enumerate(self._torsion.elements):
                if value == root:
                    return (exponent,)
            raise ArithmeticError("rank-zero unit is absent from complete torsion")
        data = embeddings.archimedean_data(self._field)
        if self._torsion_order != 2 or not any(
            place.kind == "real" for place in data.embeddings
        ):
            raise UnitCoordinateCapabilityError(
                "positive-rank complex torsion coordinates are not implemented"
            )
        compact = FactoredNumberFieldElement.from_element(self._field, value)
        # Do not retain a publicly reachable mutable cache of trusted log balls.
        workspace = FactoredLogarithmWorkspace(self._field)
        precision = min(100, self._max_precision_bits)
        while True:
            rows = tuple(
                u.regulator_logarithms(precision, self._rank, workspace=workspace)
                for u in self._basis
            )
            logarithms = compact.regulator_logarithms(
                precision, self._rank, workspace=workspace
            )
            free = _integer_log_solution(rows, logarithms)
            if free is not None:
                for exponent in free:
                    if abs(exponent).bit_length() > self._max_exponent_bits:
                        raise UnitCoordinateResourceError(
                            "recovered coordinate exceeds its bit limit"
                        )
                place = next(p for p in data.embeddings if p.kind == "real")
                negative = bool(place(value) < 0)
                for unit, exponent in zip(self._basis, free, strict=True):
                    if exponent % 2:
                        for factor, power in unit.factors():
                            if power % 2 and place(factor) < 0:
                                negative = not negative
                self._check()
                return (int(negative),) + free
            if precision >= self._max_precision_bits:
                raise UnitCoordinateResourceError(
                    "unit logarithms did not isolate integer coordinates within precision limit"
                )
            precision = min(precision * 2, self._max_precision_bits)


def unit_coordinate_map(
    source: Any,
    *,
    max_precision_bits: int = 4096,
    max_input_bits: int = 4096,
    max_exponent_bits: int = 4096,
    max_expansion_weight: int = 1_000_000,
) -> UnitCoordinateMap:
    """Create a bounded map from recognized existing completeness authority."""
    for name, value, minimum, maximum in (
        ("max_precision_bits", max_precision_bits, 16, 16384),
        ("max_input_bits", max_input_bits, 1, 65536),
        ("max_exponent_bits", max_exponent_bits, 1, 65536),
        ("max_expansion_weight", max_expansion_weight, 1, 100_000_000),
    ):
        if (
            isinstance(value, bool)
            or not isinstance(value, int)
            or not minimum <= value <= maximum
        ):
            raise ValueError(name + " is outside the supported integer range")
    return UnitCoordinateMap(
        _MAP_TOKEN,
        source,
        max_precision_bits=max_precision_bits,
        max_input_bits=max_input_bits,
        max_exponent_bits=max_exponent_bits,
        max_expansion_weight=max_expansion_weight,
    )
