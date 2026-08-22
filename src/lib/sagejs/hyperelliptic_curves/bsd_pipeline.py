"""Atomic automatic assembly of hyperelliptic BSD analytic quotients.

The low-level `sagejs.hyperelliptic_curves.bsd` module deliberately
accepts normalized arithmetic factors.  This module is the orchestration
layer which computes those factors, records their independent provenance, and
constructs a quotient only after every contract has succeeded.

The resulting quantity for a supplied full-rank subgroup `Gamma` is

`#Sha(J) / [J(Q)/torsion : Gamma]^2`.

An analytic rank is never promoted to an algebraic-rank proof.  Callers must
supply (or eventually obtain from a separate arithmetic implementation) an
independent `rank`.  Likewise, a model period is never silently relabelled
as a Neron period.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping, Sequence

from sagejs.hyperelliptic_curves.bsd import (
    ArithmeticScalar,
    BSDAnalyticQuotient,
    BSDArithmeticInput,
    BSDIncompleteDataError,
    BSDValidationError,
    LeadingTermData,
    PeriodData,
    PolarizationData,
    Provenance,
    RankEvidence,
    RegulatorData,
    SubgroupIndexData,
    TamagawaData,
    TamagawaFactor,
    TorsionData,
)


PIPELINE_SCHEMA = "sagejs.hyperelliptic-bsd-pipeline/v1"

__all__ = [
    "BSDPipelineFactor",
    "BSDPipelineIncompleteError",
    "BSDPipelineReport",
    "compute_bsd_analytic_quotient",
]


class BSDPipelineIncompleteError(BSDIncompleteDataError):
    """The automatic pipeline could not assemble every required factor."""

    def __init__(self, report: BSDPipelineReport) -> None:
        self.report = report
        super().__init__(
            "BSD analytic quotient is incomplete: "
            + ", ".join(report.missing_factors())
        )


def _checked_integer(value: Any, name: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or isinstance(value, float) or isinstance(value, str):
        raise TypeError(name + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an exact integer") from error
    if not bool(value == answer) or answer < minimum:
        raise ValueError(name + " must be at least " + str(minimum))
    return answer


def _json_value(value: Any) -> Any:
    """Return a detached, deterministic JSON value for a public report."""
    if value is None or isinstance(value, (bool, str, int, float)):
        return value
    if isinstance(value, dict):
        answer: dict[str, Any] = {}
        for key in sorted(value):
            if not isinstance(key, str):
                raise TypeError("pipeline report keys must be strings")
            answer[key] = _json_value(value[key])
        return answer
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return str(value)


def _json_clone(value: Any) -> Any:
    return json.loads(
        json.dumps(_json_value(value), sort_keys=True, separators=(",", ":"))
    )


def _error_details(error: BaseException) -> dict[str, Any]:
    diagnostics = getattr(error, "diagnostics", {})
    if not isinstance(diagnostics, dict):
        diagnostics = {"value": str(diagnostics)}
    return {
        "error_type": type(error).__name__,
        "message": str(error),
        "diagnostics": _json_value(diagnostics),
    }


def _coerce_provenance(
    value: Any,
    *,
    default_status: str,
    default_source: str,
    required: bool = False,
) -> Provenance:
    if isinstance(value, Provenance):
        return value
    if isinstance(value, dict):
        return Provenance.from_dict(value)
    if value is None and not required:
        return Provenance(default_status, default_source)
    if value is None:
        raise BSDValidationError(
            "an explicit provenance record is required for " + default_source
        )
    raise TypeError("provenance must be a Provenance object or serialized record")


class BSDPipelineFactor:
    """One independently sourced factor or capability result."""

    def __init__(
        self,
        name: str,
        status: str,
        *,
        provenance: Provenance,
        data: Any = None,
        reason: str = "",
        diagnostics: Any = None,
    ) -> None:
        if status not in ("complete", "incomplete", "error"):
            raise ValueError("unknown pipeline factor status")
        self.name = str(name)
        self.status = status
        self.provenance = provenance
        self._data = _json_clone({} if data is None else data)
        self.reason = str(reason)
        self._diagnostics = _json_clone({} if diagnostics is None else diagnostics)

    @property
    def complete(self) -> bool:
        return self.status == "complete"

    def to_dict(self) -> dict[str, Any]:
        return _json_clone(
            {
                "name": self.name,
                "status": self.status,
                "complete": self.complete,
                "provenance": self.provenance.to_dict(),
                "data": self._data,
                "reason": self.reason,
                "diagnostics": self._diagnostics,
            }
        )

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> BSDPipelineFactor:
        status = str(value["status"])
        result = cls(
            str(value["name"]),
            status,
            provenance=Provenance.from_dict(value["provenance"]),
            data=value.get("data", {}),
            reason=str(value.get("reason", "")),
            diagnostics=value.get("diagnostics", {}),
        )
        if bool(value.get("complete", False)) != result.complete:
            raise BSDValidationError(
                "serialized pipeline factor completeness disagrees with status"
            )
        return result

    def __repr__(self) -> str:
        return "BSDPipelineFactor(" + repr(self.name) + ", " + repr(self.status) + ")"


class BSDPipelineReport:
    """Complete quotient or an atomic factor-by-factor capability report."""

    def __init__(
        self,
        curve_model: Mapping[str, Any],
        factors: Sequence[BSDPipelineFactor],
        *,
        arithmetic_input: BSDArithmeticInput | None = None,
        quotient: BSDAnalyticQuotient | None = None,
    ) -> None:
        self._curve_model = _json_clone(dict(curve_model))
        self._factors = tuple(factors)
        if len({factor.name for factor in self._factors}) != len(self._factors):
            raise ValueError("duplicate BSD pipeline factor name")
        self._arithmetic_input = arithmetic_input
        self._quotient = quotient
        factor_complete = all(factor.complete for factor in self._factors)
        if (arithmetic_input is None) != (quotient is None):
            raise ValueError("pipeline input and quotient must be present atomically")
        if quotient is not None and not factor_complete:
            raise ValueError("an incomplete factor report cannot carry a quotient")
        self._complete = quotient is not None and factor_complete

    @property
    def complete(self) -> bool:
        return self._complete

    def factor(self, name: str) -> BSDPipelineFactor:
        for factor in self._factors:
            if factor.name == name:
                return factor
        raise KeyError(name)

    def factors(self) -> tuple[BSDPipelineFactor, ...]:
        return self._factors

    def missing_factors(self) -> tuple[str, ...]:
        return tuple(
            sorted(factor.name for factor in self._factors if not factor.complete)
        )

    def arithmetic_input(self) -> BSDArithmeticInput:
        if self._arithmetic_input is None:
            raise BSDPipelineIncompleteError(self)
        return self._arithmetic_input

    def quotient(self) -> BSDAnalyticQuotient:
        if self._quotient is None:
            raise BSDPipelineIncompleteError(self)
        return self._quotient

    def leading_derivative(self) -> ArithmeticScalar:
        return self.quotient().leading_derivative()

    def leading_taylor_coefficient(self) -> ArithmeticScalar:
        return self.quotient().leading_taylor_coefficient()

    def regulator(self) -> ArithmeticScalar:
        return self.quotient().regulator()

    def tamagawa_product(self) -> int:
        return self.quotient().tamagawa_product()

    def sha_over_index_squared(self) -> ArithmeticScalar:
        return self.quotient().sha_over_index_squared()

    def with_subgroup_index(
        self,
        value: Any,
        *,
        certificate: Any,
        provenance: Provenance | None = None,
    ) -> BSDAnalyticQuotient:
        """Attach a replayable index certificate to a complete quotient."""
        return self.quotient().with_subgroup_index(
            value, certificate=certificate, provenance=provenance
        )

    def diagnostics(self) -> dict[str, Any]:
        return self.quotient().diagnostics()

    def to_dict(self) -> dict[str, Any]:
        answer = {
            "schema": PIPELINE_SCHEMA,
            "complete": self.complete,
            "curve_model": self._curve_model,
            "factors": {factor.name: factor.to_dict() for factor in self._factors},
            "missing_factors": list(self.missing_factors()),
            "claim": (
                "sha_over_index_squared" if self.complete else "no_bsd_quotient_claimed"
            ),
        }
        if self._quotient is not None and self._arithmetic_input is not None:
            answer["arithmetic_input"] = self._arithmetic_input.to_dict()
            answer["quotient"] = self._quotient.to_dict()
        return _json_clone(answer)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))

    def sqlite_record(self) -> dict[str, str | int]:
        """Return a flat complete result or resumable incomplete checkpoint."""
        pipeline_payload = self.to_json()
        pipeline_digest = hashlib.sha256(pipeline_payload.encode("utf-8")).hexdigest()
        curve_payload = json.dumps(
            self._curve_model, sort_keys=True, separators=(",", ":")
        )
        curve_digest = hashlib.sha256(curve_payload.encode("utf-8")).hexdigest()
        missing_json = json.dumps(list(self.missing_factors()), separators=(",", ":"))
        if self._quotient is not None:
            answer = dict(self._quotient.sqlite_record())
            answer["complete"] = 1
            answer["missing_factors_json"] = missing_json
            answer["pipeline_schema"] = PIPELINE_SCHEMA
            answer["pipeline_sha256"] = pipeline_digest
            answer["pipeline_payload_json"] = pipeline_payload
            return answer
        rank = -1
        try:
            rank = int(self.factor("leading_term").to_dict()["data"]["rank"]["value"])
        except (KeyError, TypeError, ValueError):
            rank = -1
        return {
            "schema": "sagejs.hyperelliptic-bsd-sqlite/v1",
            "record_sha256": pipeline_digest,
            "curve_sha256": curve_digest,
            "object_kind": "hyperelliptic_jacobian",
            "rank": rank,
            "rigorous": 0,
            "quotient_name": "",
            "quotient_kind": "",
            "quotient_numerator": "",
            "quotient_denominator": "",
            "payload_json": pipeline_payload,
            "complete": 0,
            "missing_factors_json": missing_json,
            "pipeline_schema": PIPELINE_SCHEMA,
            "pipeline_sha256": pipeline_digest,
            "pipeline_payload_json": pipeline_payload,
        }

    def verify(self) -> dict[str, Any]:
        """Replay completeness and, when present, exact quotient assembly."""
        factor_complete = all(factor.complete for factor in self._factors)
        quotient_replayed = False
        if self._quotient is not None and self._arithmetic_input is not None:
            replayed = BSDAnalyticQuotient.from_dict(self._quotient.to_dict())
            quotient_replayed = replayed.to_dict() == self._quotient.to_dict()
        expected_complete = (
            factor_complete
            and self._quotient is not None
            and self._arithmetic_input is not None
            and quotient_replayed
        )
        return {
            "factor_completeness_recomputed": factor_complete,
            "quotient_replayed": quotient_replayed,
            "stored_complete_matches": self._complete == expected_complete,
            "verified": self._complete == expected_complete,
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> BSDPipelineReport:
        if value.get("schema") != PIPELINE_SCHEMA:
            raise BSDValidationError("unknown BSD pipeline report schema")
        factor_record = value.get("factors")
        if not isinstance(factor_record, dict):
            raise BSDValidationError("pipeline factors must be a record")
        factors = tuple(
            BSDPipelineFactor.from_dict(factor_record[name])
            for name in sorted(factor_record)
        )
        serialized_complete = value.get("complete")
        if not isinstance(serialized_complete, bool):
            raise BSDValidationError("pipeline completeness must be a boolean")
        if serialized_complete:
            if "arithmetic_input" not in value or "quotient" not in value:
                raise BSDValidationError(
                    "a complete pipeline report must carry its replayable quotient"
                )
            arithmetic_input = BSDArithmeticInput.from_dict(value["arithmetic_input"])
            quotient = BSDAnalyticQuotient.from_dict(value["quotient"])
            if quotient.input.to_dict() != arithmetic_input.to_dict():
                raise BSDValidationError(
                    "pipeline arithmetic input and quotient input disagree"
                )
        else:
            if "arithmetic_input" in value or "quotient" in value:
                raise BSDValidationError(
                    "an incomplete pipeline report cannot serialize a quotient"
                )
            arithmetic_input = None
            quotient = None
        result = cls(
            value["curve_model"],
            factors,
            arithmetic_input=arithmetic_input,
            quotient=quotient,
        )
        if result.complete != serialized_complete:
            raise BSDValidationError(
                "serialized pipeline completeness disagrees with factor replay"
            )
        if result.to_dict() != dict(value):
            raise BSDValidationError(
                "serialized pipeline report disagrees with exact reconstruction"
            )
        return result

    @classmethod
    def from_json(cls, value: str) -> BSDPipelineReport:
        try:
            record = json.loads(value)
        except (TypeError, json.JSONDecodeError) as error:
            raise BSDValidationError("unable to decode BSD pipeline JSON") from error
        if not isinstance(record, dict):
            raise BSDValidationError("BSD pipeline JSON must contain an object")
        return cls.from_dict(record)

    def __repr__(self) -> str:
        if self.complete:
            return "Complete hyperelliptic BSD analytic quotient report"
        return "Incomplete hyperelliptic BSD report: " + ", ".join(
            self.missing_factors()
        )


def _curve_model(curve: Any) -> dict[str, Any]:
    genus = _checked_integer(curve.genus(), "curve genus", minimum=0)
    if genus not in (2, 3):
        raise NotImplementedError("the BSD pipeline currently supports genus 2 and 3")
    f_value, h_value = curve.hyperelliptic_polynomials()
    return {
        "schema": "sagejs.hyperelliptic-curve-model/v1",
        "genus": str(genus),
        "equation": "y^2+h(x)*y=f(x)",
        "f_coefficients_ascending": [str(value) for value in f_value.list()],
        "h_coefficients_ascending": [str(value) for value in h_value.list()],
    }


def _complete_factor(
    name: str, value: Any, provenance: Provenance, data: Any = None
) -> BSDPipelineFactor:
    serialized = value.to_dict() if data is None else data
    return BSDPipelineFactor(name, "complete", provenance=provenance, data=serialized)


def _incomplete_factor(
    name: str,
    reason: str,
    *,
    source: str,
    status: str = "indeterminate",
    diagnostics: Any = None,
) -> BSDPipelineFactor:
    return BSDPipelineFactor(
        name,
        "incomplete",
        provenance=Provenance(status, source),
        reason=reason,
        diagnostics=diagnostics,
    )


def _error_factor(name: str, error: BaseException, source: str) -> BSDPipelineFactor:
    return BSDPipelineFactor(
        name,
        "error",
        provenance=Provenance("unsupported", source),
        reason=str(error),
        diagnostics=_error_details(error),
    )


def _terminating_decimal(numerator: int, denominator: int) -> str:
    if denominator <= 0:
        raise ValueError("a rational endpoint denominator must be positive")
    if numerator == 0:
        return "0"
    twos = 0
    fives = 0
    remaining = denominator
    while remaining % 2 == 0:
        twos += 1
        remaining //= 2
    while remaining % 5 == 0:
        fives += 1
        remaining //= 5
    if remaining != 1:
        raise BSDValidationError(
            "a height enclosure endpoint has a non-terminating decimal expansion"
        )
    scale = max(twos, fives)
    scaled = abs(numerator) * 2 ** (scale - twos) * 5 ** (scale - fives)
    digits = str(scaled).rjust(scale + 1, "0")
    if scale:
        text = (digits[:-scale] + "." + digits[-scale:]).rstrip("0").rstrip(".")
    else:
        text = digits
    return ("-" if numerator < 0 else "") + text


def _endpoint_decimal(value: Any) -> str:
    numerator = getattr(value, "numerator", None)
    denominator = getattr(value, "denominator", None)
    if numerator is None or denominator is None:
        raise TypeError("a height endpoint is not an exact rational")
    return _terminating_decimal(int(numerator), int(denominator))


def _ball_scalar(ball: Any) -> ArithmeticScalar:
    return ArithmeticScalar.interval(
        _endpoint_decimal(ball.lower),
        _endpoint_decimal(ball.upper),
        precision_bits=_checked_integer(
            ball.precision_bits, "height precision", minimum=2
        ),
        rigorous=bool(ball.rigorous),
    )


def _rank_evidence(rank: Any, overrides: dict[str, Any]) -> RankEvidence:
    if isinstance(rank, RankEvidence):
        return rank
    if rank is None:
        return RankEvidence.indeterminate("algebraic-rank-not-supplied")
    source = _coerce_provenance(
        overrides.get("rank_provenance"),
        default_status="supplied",
        default_source="user-supplied-algebraic-rank",
    )
    status = "proved" if source.status in ("certified", "proved") else "supplied"
    return RankEvidence(status, _checked_integer(rank, "algebraic rank"), source)


def _subgroup_sequence(subgroup: Any) -> tuple[Any, ...]:
    if subgroup is None:
        return ()
    if hasattr(subgroup, "uv"):
        return (subgroup,)
    if isinstance(subgroup, (str, bytes)):
        raise TypeError("subgroup must be a sequence of rational Jacobian divisors")
    return tuple(subgroup)


def _period_factor(
    curve: Any, prec: int, overrides: dict[str, Any]
) -> tuple[PeriodData | None, BSDPipelineFactor]:
    supplied = overrides.get("period_data")
    if supplied is not None:
        if not isinstance(supplied, PeriodData):
            error = TypeError("period_data must be a PeriodData object")
            return None, _error_factor("period", error, "period-data-override")
        if supplied.normalization != "neron" or not supplied.component_factor_included:
            return None, _incomplete_factor(
                "period",
                "the supplied period is not total Neron-normalized Omega",
                source=supplied.provenance.source,
            )
        return supplied, _complete_factor("period", supplied, supplied.provenance)
    direct = overrides.get("period")
    if direct is not None:
        try:
            if "period_is_total" not in overrides or not isinstance(
                overrides["period_is_total"], bool
            ):
                raise BSDValidationError(
                    "a direct period requires an explicit boolean period_is_total"
                )
            if "real_component_factor" not in overrides:
                raise BSDValidationError(
                    "a direct period requires an explicit real_component_factor"
                )
            if "period_differential_basis" not in overrides:
                raise BSDValidationError(
                    "a direct period requires an explicit period_differential_basis"
                )
            provenance = _coerce_provenance(
                overrides.get("period_provenance"),
                default_status="supplied",
                default_source="user-supplied-neron-period",
                required=True,
            )
            scalar = (
                direct
                if isinstance(direct, ArithmeticScalar)
                else ArithmeticScalar.decimal(direct, precision_bits=prec)
            )
            result = PeriodData.supplied_neron(
                scalar,
                provenance=provenance,
                real_component_factor=_checked_integer(
                    overrides["real_component_factor"],
                    "real component factor",
                    minimum=1,
                ),
                differential_basis=str(overrides["period_differential_basis"]),
                total_omega=overrides["period_is_total"],
            )
            if not result.component_factor_included:
                return None, _incomplete_factor(
                    "period",
                    "the supplied period excludes the real-component factor",
                    source=provenance.source,
                )
            return result, _complete_factor("period", result, provenance)
        except Exception as error:
            return None, _error_factor("period", error, "supplied-neron-period")
    determinant = overrides.get("neron_differential_determinant")
    lattice_index = overrides.get("neron_lattice_index")
    if determinant is None and lattice_index is None:
        return None, _incomplete_factor(
            "period",
            "Neron normalization is unavailable; supply a differential determinant, "
            "lattice index, or total Neron period",
            source="sagejs.real_period",
        )
    try:
        module = __import__(
            "sagejs.hyperelliptic_curves.periods", fromlist=["real_period"]
        )
        period_provenance = overrides.get("period_normalization_provenance")
        if period_provenance is None:
            raise BSDValidationError(
                "a supplied Neron differential normalization needs provenance"
            )
        if isinstance(period_provenance, Provenance):
            engine_provenance = period_provenance.to_dict()
        elif isinstance(period_provenance, dict):
            engine_provenance = _json_value(period_provenance)
        else:
            raise TypeError(
                "period_normalization_provenance must be a Provenance object or record"
            )
        computed = module.real_period(
            curve,
            prec=prec,
            normalization="neron",
            neron_differential_determinant=determinant,
            neron_lattice_index=lattice_index,
            provenance=engine_provenance,
        )
        provenance = _coerce_provenance(
            overrides.get("period_provenance"),
            default_status="computed",
            default_source="sagejs.real_period-with-supplied-neron-normalization",
        )
        result = PeriodData(
            ArithmeticScalar.decimal(computed.value(), precision_bits=prec),
            "neron",
            int(computed.real_components()),
            True,
            "wedge x^i dx/(2y+h), scaled by supplied Neron determinant",
            provenance,
        )
        return result, _complete_factor(
            "period",
            result,
            provenance,
            {"period": result.to_dict(), "engine": computed.to_dict()},
        )
    except Exception as error:
        return None, _error_factor("period", error, "sagejs.real_period")


def _tamagawa_factor(
    curve: Any,
    global_data: Any,
    overrides: dict[str, Any],
) -> tuple[TamagawaData | None, BSDPipelineFactor]:
    bad_primes = tuple(int(prime) for prime in global_data.bad_primes)
    supplied = overrides.get("tamagawa_data")
    if supplied is not None:
        if not isinstance(supplied, TamagawaData):
            error = TypeError("tamagawa_data must be a BSD TamagawaData object")
            return None, _error_factor("tamagawa", error, "tamagawa-data-override")
        try:
            if supplied.certified_bad_primes != bad_primes:
                raise BSDValidationError(
                    "supplied Tamagawa bad primes do not match certified global reduction"
                )
            supplied.validate_complete()
            return supplied, _complete_factor("tamagawa", supplied, supplied.provenance)
        except Exception as error:
            return None, _error_factor("tamagawa", error, "tamagawa-data-override")
    try:
        module = __import__(
            "sagejs.hyperelliptic_curves.tamagawa",
            fromlist=["local_tamagawa_data"],
        )
        factors = []
        local_rows = []
        for prime in bad_primes:
            row = module.local_tamagawa_data(curve, prime)
            if not bool(row.certified) or not bool(row.curve_certified):
                raise BSDIncompleteDataError(
                    "the rational component group is not curve-certified at p="
                    + str(prime)
                )
            if row.rational_order is None:
                raise BSDIncompleteDataError(
                    "the rational component-group order is missing at p=" + str(prime)
                )
            local_provenance = Provenance(
                "certified",
                "sagejs.local_tamagawa_data",
                details={
                    "prime": str(prime),
                    "method": str(row.method),
                    "certificate_schema": str(row.to_dict().get("schema", "")),
                },
            )
            factors.append(
                TamagawaFactor(prime, int(row.rational_order), local_provenance)
            )
            local_rows.append(row.to_dict())
        provenance = Provenance(
            "certified",
            "sagejs.global_reduction",
            details={
                "conductor": str(global_data.conductor),
                "root_number": str(global_data.root_number),
                "bad_primes": [str(prime) for prime in bad_primes],
            },
        )
        result = TamagawaData(
            tuple(factors),
            bad_primes,
            "complete",
            provenance,
            Provenance("indeterminate", "no-global-tamagawa-override"),
        )
        result.validate_complete()
        return result, _complete_factor(
            "tamagawa",
            result,
            provenance,
            {"tamagawa": result.to_dict(), "local_certificates": local_rows},
        )
    except BSDIncompleteDataError as error:
        return None, _incomplete_factor(
            "tamagawa", str(error), source="sagejs.local_tamagawa_data"
        )
    except Exception as error:
        return None, _error_factor("tamagawa", error, "sagejs.local_tamagawa_data")


def _torsion_factor(
    curve: Any, overrides: dict[str, Any]
) -> tuple[TorsionData | None, BSDPipelineFactor]:
    supplied = overrides.get("torsion_data")
    if isinstance(supplied, TorsionData):
        try:
            replayed = TorsionData.from_dict(supplied.to_dict())
            if replayed.to_dict() != supplied.to_dict():
                raise BSDValidationError("torsion_data did not replay exactly")
            return supplied, _complete_factor("torsion", supplied, supplied.provenance)
        except Exception as error:
            return None, _error_factor("torsion", error, "torsion-data-override")
    if supplied is not None and not hasattr(supplied, "lower_bound"):
        return None, _error_factor(
            "torsion",
            TypeError("torsion_data must be TorsionData or RationalTorsionData"),
            "torsion-data-override",
        )
    try:
        module = __import__(
            "sagejs.hyperelliptic_curves.torsion", fromlist=["torsion_bound"]
        )
        result_data = supplied
        if result_data is None:
            options = overrides.get("torsion_options", {})
            if not isinstance(options, dict):
                raise TypeError("torsion_options must be a dictionary")
            result_data = module.torsion_bound(curve.jacobian(), **options)
        lower = int(result_data.lower_bound)
        upper = int(result_data.upper_bound)
        if lower != upper:
            return None, _incomplete_factor(
                "torsion",
                "the rational torsion order is only bounded",
                source="sagejs.torsion_bound",
                status="bounded",
                diagnostics={"lower_bound": str(lower), "upper_bound": str(upper)},
            )
        provenance = Provenance(
            "certified",
            "sagejs.torsion_bound",
            details={
                "lower_bound": str(lower),
                "upper_bound": str(upper),
                "certificate_schema": str(result_data.to_dict().get("schema", "")),
            },
        )
        result = TorsionData(upper, provenance)
        return result, _complete_factor(
            "torsion",
            result,
            provenance,
            {"torsion": result.to_dict(), "certificate": result_data.to_dict()},
        )
    except Exception as error:
        return None, _error_factor("torsion", error, "sagejs.torsion_bound")


def _regulator_factor(
    curve: Any,
    subgroup: tuple[Any, ...],
    analytic_rank: int,
    algebraic_rank: RankEvidence,
    basis_records: tuple[Any, ...],
    prec: int,
    overrides: dict[str, Any],
) -> tuple[RegulatorData | None, BSDPipelineFactor]:
    supplied = overrides.get("regulator_data")
    if supplied is not None:
        if not isinstance(supplied, RegulatorData):
            error = TypeError("regulator_data must be a RegulatorData object")
            return None, _error_factor("regulator", error, "regulator-data-override")
        if supplied.rank != analytic_rank:
            return None, _incomplete_factor(
                "regulator",
                "the supplied regulator rank differs from the analytic leading order",
                source=supplied.provenance.source,
            )
        return supplied, _complete_factor("regulator", supplied, supplied.provenance)
    provenance_override = overrides.get("regulator_provenance")
    if "height_pairing" in overrides or "regulator" in overrides:
        try:
            provenance = _coerce_provenance(
                provenance_override,
                default_status="supplied",
                default_source="user-supplied-regulator",
                required=True,
            )
            if "height_pairing" in overrides and "regulator" in overrides:
                raise BSDValidationError(
                    "supply exactly one of height_pairing and regulator"
                )
            if "height_pairing" in overrides:
                result = RegulatorData.from_pairing(
                    analytic_rank,
                    overrides["height_pairing"],
                    symmetric=True,
                    provenance=provenance,
                )
            else:
                result = RegulatorData.supplied_scalar(
                    analytic_rank,
                    overrides["regulator"],
                    symmetric=True,
                    provenance=provenance,
                )
            return result, _complete_factor("regulator", result, provenance)
        except Exception as error:
            return None, _error_factor("regulator", error, "supplied-regulator")
    if analytic_rank == 0:
        provenance = Provenance(
            "proved",
            "rank-zero-regulator-convention",
            details={"empty_determinant": "1"},
        )
        result = RegulatorData.supplied_scalar(
            0, 1, symmetric=True, provenance=provenance
        )
        return result, _complete_factor("regulator", result, provenance)
    if algebraic_rank.status == "indeterminate":
        return None, _incomplete_factor(
            "regulator",
            "an independent algebraic-rank status is required before a subgroup "
            "regulator can enter BSD",
            source="algebraic-rank-not-supplied",
        )
    if algebraic_rank.value != analytic_rank:
        return None, _incomplete_factor(
            "regulator",
            "algebraic rank and analytic leading order disagree",
            source=algebraic_rank.provenance.source,
        )
    if len(subgroup) != analytic_rank or len(basis_records) != analytic_rank:
        return None, _incomplete_factor(
            "regulator",
            "a verified full-rank subgroup basis is required",
            source="subgroup-basis",
            diagnostics={
                "analytic_rank": str(analytic_rank),
                "basis_size": str(len(subgroup)),
            },
        )
    genus = int(curve.genus())
    try:
        options = overrides.get("height_options", {})
        if not isinstance(options, dict):
            raise TypeError("height_options must be a dictionary")
        options = dict(options)
        if genus == 3:
            options.pop("precision", None)
            options.pop("prec", None)
            computed = curve.jacobian().regulator(subgroup, prec=prec, **options)
            input_completeness = str(
                getattr(computed, "input_completeness", "not_recorded")
            )
            if input_completeness != "verified_complete":
                return None, _incomplete_factor(
                    "regulator",
                    "the genus-3 height pairing did not verify complete arithmetic inputs",
                    source="sagejs.genus3_heights",
                    diagnostics={"input_completeness": input_completeness},
                )
            record = computed.to_dict()
            entries = record.get("entries")
            if not isinstance(entries, (list, tuple)):
                raise TypeError("the genus-3 regulator did not return matrix entries")
            matrix = tuple(
                tuple(
                    ArithmeticScalar.decimal(entry, precision_bits=prec)
                    for entry in row
                )
                for row in entries
            )
            provenance = Provenance(
                "computed",
                "sagejs.genus3_heights.HeightPairingMatrixResult",
                details={
                    "input_completeness": input_completeness,
                    "input_rigor": str(
                        getattr(computed, "input_rigor", "not_recorded")
                    ),
                    "precision_bits": str(prec),
                    "rank": str(getattr(computed, "rank", len(matrix))),
                    "rigorous": False,
                },
            )
            result = RegulatorData.from_pairing(
                analytic_rank, matrix, symmetric=True, provenance=provenance
            )
            return result, _complete_factor(
                "regulator",
                result,
                provenance,
                {"regulator": result.to_dict(), "height_certificate": record},
            )
        module = __import__(
            "sagejs.hyperelliptic_curves.genus2_heights", fromlist=["regulator"]
        )
        options["precision"] = prec
        computed = module.regulator(subgroup, **options)
        matrix = tuple(
            tuple(_ball_scalar(entry) for entry in row)
            for row in computed.pairing.matrix
        )
        provenance = Provenance(
            "certified" if bool(computed.rigorous) else "computed",
            "sagejs.genus2_heights.regulator",
            details={
                "status": str(computed.status),
                "rigorous_height_enclosure": bool(computed.rigorous),
                "precision_bits": str(prec),
            },
        )
        result = RegulatorData.from_pairing(
            analytic_rank, matrix, symmetric=True, provenance=provenance
        )
        return result, _complete_factor(
            "regulator",
            result,
            provenance,
            {"regulator": result.to_dict(), "height_certificate": computed.to_dict()},
        )
    except Exception as error:
        return None, _error_factor(
            "regulator", error, "sagejs.genus2_heights.regulator"
        )


def compute_bsd_analytic_quotient(
    curve: Any,
    subgroup: Any = None,
    *,
    rank: Any = None,
    prec: Any = 128,
    overrides: Mapping[str, Any] | None = None,
    lfunction_init: Any = None,
    max_order: Any = 6,
    algorithm: str = "auto",
    on_incomplete: str = "return",
) -> BSDPipelineReport:
    """Compute every available BSD factor and assemble atomically.

    `rank` is independent algebraic evidence and is never inferred from the
    probable analytic leading order.  `subgroup` is a sequence of rational
    Mumford divisors.  The optional `overrides` dictionary admits typed
    factor objects or explicitly provenanced arithmetic data; unknown keys are
    rejected so that misspellings cannot silently alter a scientific run.

    With the default `on_incomplete='return'` the result is a structured
    capability report.  `on_incomplete='raise'` raises
    `BSDPipelineIncompleteError` carrying that same report.
    """
    bits = _checked_integer(prec, "precision", minimum=32)
    order = _checked_integer(max_order, "maximum derivative order", minimum=0)
    if not isinstance(algorithm, str) or not algorithm:
        raise TypeError("algorithm must be a nonempty string")
    if on_incomplete not in ("return", "raise"):
        raise ValueError("on_incomplete must be 'return' or 'raise'")
    supplied_overrides = {} if overrides is None else dict(overrides)
    allowed = {
        "backend_versions",
        "height_options",
        "height_pairing",
        "leading_term",
        "neron_differential_determinant",
        "neron_lattice_index",
        "period",
        "period_data",
        "period_differential_basis",
        "period_is_total",
        "period_normalization_provenance",
        "period_provenance",
        "rank_provenance",
        "real_component_factor",
        "regulator",
        "regulator_data",
        "regulator_provenance",
        "subgroup_provenance",
        "subgroup_index",
        "tamagawa_data",
        "torsion_data",
        "torsion_options",
    }
    unknown = sorted(set(supplied_overrides) - allowed)
    if unknown:
        raise ValueError("unknown BSD pipeline override keys " + repr(tuple(unknown)))
    model = _curve_model(curve)
    subgroup_values = _subgroup_sequence(subgroup)
    factors: list[BSDPipelineFactor] = []

    global_data = None
    try:
        global_data = curve.global_reduction()
        global_provenance = Provenance(
            "certified",
            "sagejs.global_reduction",
            details={
                "conductor": str(global_data.conductor),
                "root_number": str(global_data.root_number),
                "bad_primes": [str(value) for value in global_data.bad_primes],
            },
        )
        factors.append(
            _complete_factor(
                "global_reduction",
                global_data,
                global_provenance,
                {
                    "conductor": str(global_data.conductor),
                    "root_number": str(global_data.root_number),
                    "bad_primes": [str(value) for value in global_data.bad_primes],
                    "certified": bool(global_data.certified),
                },
            )
        )
    except Exception as error:
        factors.append(
            _error_factor("global_reduction", error, "sagejs.global_reduction")
        )

    leading = None
    try:
        supplied_leading = supplied_overrides.get("leading_term")
        if supplied_leading is not None:
            if lfunction_init is not None:
                raise ValueError("supply leading_term or lfunction_init, not both")
            if not isinstance(supplied_leading, LeadingTermData):
                raise TypeError("leading_term must be a LeadingTermData object")
            leading = supplied_leading
        else:
            initialized = lfunction_init
            if initialized is None:
                initialized = curve.lseries().init(
                    prec=bits,
                    max_order=order,
                    algorithm=algorithm,
                )
            leading = LeadingTermData.from_lfunction_init(initialized)
        if global_data is None:
            raise BSDIncompleteDataError(
                "the leading term cannot be bound to a certified functional-equation sign"
            )
        if leading.functional_equation_sign != int(global_data.root_number):
            raise BSDValidationError(
                "the leading-term sign disagrees with certified global reduction"
            )
        factors.append(_complete_factor("leading_term", leading, leading.provenance))
    except BSDIncompleteDataError as error:
        factors.append(
            _incomplete_factor(
                "leading_term", str(error), source="sagejs.LFunctionInit"
            )
        )
    except Exception as error:
        factors.append(_error_factor("leading_term", error, "sagejs.LFunctionInit"))

    algebraic = _rank_evidence(rank, supplied_overrides)
    if algebraic.status == "indeterminate":
        factors.append(
            _incomplete_factor(
                "algebraic_rank",
                "an independent algebraic rank was not supplied or proved",
                source=algebraic.provenance.source,
            )
        )
    elif leading is not None and algebraic.value != leading.rank.value:
        factors.append(
            _incomplete_factor(
                "algebraic_rank",
                "algebraic rank disagrees with the probable analytic leading order",
                source=algebraic.provenance.source,
                diagnostics={
                    "algebraic_rank": str(algebraic.value),
                    "analytic_order": str(leading.rank.value),
                },
            )
        )
    else:
        factors.append(
            _complete_factor("algebraic_rank", algebraic, algebraic.provenance)
        )

    basis_records: tuple[Any, ...] = ()
    subgroup_provenance = _coerce_provenance(
        supplied_overrides.get("subgroup_provenance"),
        default_status="supplied",
        default_source="user-supplied-rational-Mumford-basis",
    )
    try:
        torsion_module = __import__(
            "sagejs.hyperelliptic_curves.torsion",
            fromlist=["rational_mumford_data"],
        )
        jacobian = curve.jacobian()
        basis_records = tuple(
            torsion_module.rational_mumford_data(jacobian, point)
            for point in subgroup_values
        )
        if leading is not None and len(basis_records) != leading.rank.value:
            raise BSDIncompleteDataError(
                "the verified subgroup basis size differs from the analytic leading order"
            )
        if (
            algebraic.status != "indeterminate"
            and len(basis_records) != algebraic.value
        ):
            raise BSDIncompleteDataError(
                "the verified subgroup basis size differs from the algebraic rank"
            )
        factors.append(
            _complete_factor(
                "subgroup",
                subgroup_provenance,
                subgroup_provenance,
                {"basis_size": str(len(basis_records)), "basis": list(basis_records)},
            )
        )
    except BSDIncompleteDataError as error:
        factors.append(
            _incomplete_factor(
                "subgroup",
                str(error),
                source=subgroup_provenance.source,
                diagnostics={"basis_size": str(len(basis_records))},
            )
        )
    except Exception as error:
        factors.append(_error_factor("subgroup", error, "rational-mumford-validation"))

    period, period_row = _period_factor(curve, bits, supplied_overrides)
    factors.append(period_row)

    tamagawa = None
    if global_data is None:
        factors.append(
            _incomplete_factor(
                "tamagawa",
                "the complete certified bad-prime list is unavailable",
                source="sagejs.global_reduction",
            )
        )
    else:
        tamagawa, tamagawa_row = _tamagawa_factor(
            curve, global_data, supplied_overrides
        )
        factors.append(tamagawa_row)

    torsion, torsion_row = _torsion_factor(curve, supplied_overrides)
    factors.append(torsion_row)

    regulator = None
    if leading is None:
        factors.append(
            _incomplete_factor(
                "regulator",
                "the analytic leading order is unavailable",
                source="sagejs.LFunctionInit",
            )
        )
    else:
        regulator, regulator_row = _regulator_factor(
            curve,
            subgroup_values,
            leading.rank.value,
            algebraic,
            basis_records,
            bits,
            supplied_overrides,
        )
        factors.append(regulator_row)

    required_names = {
        "global_reduction",
        "leading_term",
        "algebraic_rank",
        "subgroup",
        "period",
        "tamagawa",
        "torsion",
        "regulator",
    }
    all_complete = all(
        factor.complete for factor in factors if factor.name in required_names
    ) and required_names == {factor.name for factor in factors}
    arithmetic_input = None
    quotient = None
    if (
        all_complete
        and leading is not None
        and period is not None
        and tamagawa is not None
        and torsion is not None
        and regulator is not None
    ):
        try:
            backend_versions = supplied_overrides.get("backend_versions", {})
            if not isinstance(backend_versions, dict):
                raise TypeError("backend_versions must be a dictionary")
            versions = {
                "pipeline": PIPELINE_SCHEMA,
                "analytic_engine": "sagejs.LFunctionInit",
                "period_engine": period.provenance.source,
                "tamagawa_engine": tamagawa.provenance.source,
                "torsion_engine": torsion.provenance.source,
                "regulator_engine": regulator.provenance.source,
                **backend_versions,
            }
            subgroup_index = supplied_overrides.get("subgroup_index")
            if subgroup_index is None:
                subgroup_index = SubgroupIndexData.unknown()
            if not isinstance(subgroup_index, SubgroupIndexData):
                raise TypeError("subgroup_index must be a SubgroupIndexData object")
            arithmetic_input = BSDArithmeticInput(
                "hyperelliptic_jacobian",
                "supplied",
                model,
                leading,
                algebraic,
                period,
                regulator,
                tamagawa,
                torsion,
                torsion,
                PolarizationData.canonical_jacobian(),
                "full_rank_finite_index",
                subgroup_provenance,
                "supplied",
                basis_records,
                subgroup_index,
                versions,
            )
            quotient = BSDAnalyticQuotient(arithmetic_input)
        except Exception as error:
            factors.append(_error_factor("assembly", error, "sagejs.bsd"))
            arithmetic_input = None
            quotient = None

    report = BSDPipelineReport(
        model, factors, arithmetic_input=arithmetic_input, quotient=quotient
    )
    if not report.complete and on_incomplete == "raise":
        raise BSDPipelineIncompleteError(report)
    return report
