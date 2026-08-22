"""Bounded exact class-number-only certificates for cubic number fields."""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.number_fields.class_groups import (
    _CUBIC_MINKOWSKI_REPLAY_MAX_BOUND,
    _CUBIC_MINKOWSKI_REPLAY_MAX_MEMORY_BYTES,
    _CUBIC_MINKOWSKI_REPLAY_MAX_PRIME_IDEALS,
    _CUBIC_MINKOWSKI_REPLAY_MAX_RATIONAL_PRIMES,
    DEFAULT_CUBIC_MINKOWSKI_MAX_BOUND,
    DEFAULT_CUBIC_MINKOWSKI_MAX_MEMORY_BYTES,
    DEFAULT_CUBIC_MINKOWSKI_MAX_PRIME_IDEALS,
    DEFAULT_CUBIC_MINKOWSKI_MAX_RATIONAL_PRIMES,
    _canonical_json,
    _content_hash,
    _cubic_minkowski_payload_within_caps,
    _positive_integer,
)

CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA = (
    "sagejs.number-fields/cubic-minkowski-class-number-v1"
)
AUTHENTICATED_CUBIC_CLASS_NUMBER_SCHEMA = (
    "sagejs.number-fields/authenticated-cubic-class-number-result-v1"
)
_AUTHENTICATED_CUBIC_CLASS_NUMBER_TOKEN = object()
DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATION_ATTEMPTS = 64
DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATIONS = 128
DEFAULT_CUBIC_CLASS_NUMBER_MAX_CANDIDATES_PER_IDEAL = 64
DEFAULT_CUBIC_CLASS_NUMBER_MAX_QUOTIENT_ORDER = 4096
DEFAULT_CUBIC_CLASS_NUMBER_MAX_PROJECTIVE_LINES = 128
DEFAULT_CUBIC_CLASS_NUMBER_MAX_MODULUS = 31
DEFAULT_CUBIC_CLASS_NUMBER_MAX_RESIDUE_STATES = 500_000
_CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATION_ATTEMPTS = 4096
_CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATIONS = 4096
_CUBIC_CLASS_NUMBER_REPLAY_MAX_CANDIDATES_PER_IDEAL = 65536
_CUBIC_CLASS_NUMBER_REPLAY_MAX_QUOTIENT_ORDER = 1_000_000
_CUBIC_CLASS_NUMBER_REPLAY_MAX_PROJECTIVE_LINES = 4096
_CUBIC_CLASS_NUMBER_REPLAY_MAX_MODULUS = 257
_CUBIC_CLASS_NUMBER_REPLAY_MAX_RESIDUE_STATES = 20_000_000


def _freeze_authentication_value(value: Any) -> Any:
    """Return an exact immutable snapshot of one JSON-safe value."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_authentication_value(item) for item in value)
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("authentication snapshot keys must be strings")
        return tuple(
            (key, _freeze_authentication_value(value[key])) for key in sorted(value)
        )
    raise TypeError("authentication snapshots require JSON-safe values")


def _check_cubic_cancelled(cancelled: Callable[[], bool] | None) -> None:
    runtime.check_interrupt()
    if cancelled is not None and cancelled():
        raise RuntimeError("class/unit computation cancelled")


def _integer_rational(value: Any, name: str) -> int:
    rational = sage.QQ(value)
    if rational._denominator != 1:
        raise ArithmeticError(name + " is not an integer")
    return int(rational._numerator)


def _cubic_norm_form_coefficients(ideal: Any) -> tuple[int, ...]:
    """Return the ten integral coefficients of an ideal's ternary norm form."""
    if not ideal.is_integral() or ideal.is_zero():
        raise ValueError("a cubic norm form requires a nonzero integral ideal")
    basis = tuple(ideal.basis())
    if len(basis) != 3:
        raise ValueError("a cubic ideal must have three basis elements")

    def norm(element: Any) -> int:
        return _integer_rational(element.norm(), "an integral element norm")

    b0, b1, b2 = basis
    c300, c030, c003 = norm(b0), norm(b1), norm(b2)

    def pair(left: Any, right: Any, left_cube: int, right_cube: int) -> tuple[int, int]:
        plus = norm(left + right) - left_cube - right_cube
        minus = norm(left - right) - left_cube + right_cube
        if (plus + minus) % 2 or (plus - minus) % 2:
            raise ArithmeticError("a cubic norm form did not interpolate integrally")
        return (plus - minus) // 2, (plus + minus) // 2

    c210, c120 = pair(b0, b1, c300, c030)
    c201, c102 = pair(b0, b2, c300, c003)
    c021, c012 = pair(b1, b2, c030, c003)
    c111 = norm(b0 + b1 + b2) - (
        c300 + c030 + c003 + c210 + c201 + c120 + c021 + c102 + c012
    )
    return (c300, c030, c003, c210, c201, c120, c021, c102, c012, c111)


def _cubic_norm_form_value(
    coefficients: tuple[int, ...], x: int, y: int, z: int
) -> int:
    c300, c030, c003, c210, c201, c120, c021, c102, c012, c111 = coefficients
    return (
        c300 * x * x * x
        + c030 * y * y * y
        + c003 * z * z * z
        + c210 * x * x * y
        + c201 * x * x * z
        + c120 * x * y * y
        + c021 * y * y * z
        + c102 * x * z * z
        + c012 * y * z * z
        + c111 * x * y * z
    )


def _prime_divisors_bounded(value: int) -> tuple[int, ...]:
    remaining = _positive_integer(value, "class-number quotient order")
    answer: list[int] = []
    prime = 2
    while prime * prime <= remaining:
        if remaining % prime == 0:
            answer.append(prime)
            while remaining % prime == 0:
                remaining //= prime
        prime = 3 if prime == 2 else prime + 2
    if remaining > 1:
        answer.append(remaining)
    return tuple(answer)


def _projective_line_specs(
    presentation: Any, *, max_lines: int
) -> tuple[dict[str, Any], ...]:
    """Enumerate canonical lines in `Q[p]` for every `p | |Q|`."""
    invariants = tuple(int(value) for value in presentation.invariants)
    order = _positive_integer(presentation.order, "class-number quotient order")
    answer: list[dict[str, Any]] = []
    for prime in _prime_divisors_bounded(order):
        active = tuple(
            index for index, value in enumerate(invariants) if value % prime == 0
        )
        dimension = len(active)
        if dimension == 0:
            raise ArithmeticError("quotient p-torsion has no invariant component")
        line_count = (prime**dimension - 1) // (prime - 1)
        if len(answer) + line_count > max_lines:
            raise ValueError("quotient p-torsion has too many projective lines")
        for pivot in range(dimension):
            tail_count = prime ** (dimension - pivot - 1)
            for tail_number in range(tail_count):
                line = [0] * dimension
                line[pivot] = 1
                cursor = tail_number
                for index in range(dimension - 1, pivot, -1):
                    line[index] = cursor % prime
                    cursor //= prime
                coordinates = [0] * len(invariants)
                for index, component in enumerate(active):
                    coordinates[component] = line[index] * (
                        invariants[component] // prime
                    )
                ambient = presentation.lift_class_coordinates(coordinates)
                answer.append(
                    {
                        "prime": prime,
                        "line": line,
                        "class_coordinates": coordinates,
                        "ambient_row": list(ambient),
                    }
                )
    return tuple(answer)


def _find_cubic_norm_obstruction(
    ideal: Any,
    line: dict[str, Any],
    *,
    max_modulus: int,
    remaining_states: int,
    cancelled: Callable[[], bool] | None,
) -> tuple[dict[str, Any] | None, int]:
    integral = ideal.numerator()
    norm = _integer_rational(integral.norm(), "an integral ideal norm")
    coefficients = _cubic_norm_form_coefficients(integral)
    used = 0
    for modulus in range(2, max_modulus + 1):
        if not sage.is_prime(modulus):
            continue
        states = modulus**3
        if used + states > remaining_states:
            return None, used
        targets = {norm % modulus, (-norm) % modulus}
        represented = False
        sequence = 0
        for x in range(modulus):
            for y in range(modulus):
                for z in range(modulus):
                    if sequence % 256 == 0:
                        _check_cubic_cancelled(cancelled)
                    sequence += 1
                    if (
                        _cubic_norm_form_value(coefficients, x, y, z) % modulus
                        in targets
                    ):
                        represented = True
                        break
                if represented:
                    break
            if represented:
                break
        used += states
        if not represented:
            return (
                {
                    **line,
                    "integral_ideal": integral.to_dict(),
                    "ideal_norm": norm,
                    "norm_form_coefficients": list(coefficients),
                    "modulus": modulus,
                    "residue_states": states,
                },
                used,
            )
    return None, used


def _verify_cubic_norm_obstruction(
    order: Any,
    factor_base: tuple[Any, ...],
    expected_line: dict[str, Any],
    evidence: dict[str, Any],
    *,
    max_modulus: int,
    cancelled: Callable[[], bool] | None,
) -> bool:
    try:
        if set(evidence) != {
            "prime",
            "line",
            "class_coordinates",
            "ambient_row",
            "integral_ideal",
            "ideal_norm",
            "norm_form_coefficients",
            "modulus",
            "residue_states",
        }:
            return False
        for name in ("prime", "line", "class_coordinates", "ambient_row"):
            if evidence[name] != expected_line[name]:
                return False
        modulus = _positive_integer(evidence["modulus"], "obstruction modulus")
        if modulus > max_modulus or not sage.is_prime(modulus):
            return False
        if evidence["residue_states"] != modulus**3:
            return False
        relations = __import__(
            "sagejs.number_fields.class_group_relations",
            fromlist=["class_group_relations"],
        )
        reconstructed = relations.reconstruct_factor_base_ideal(
            order, factor_base, evidence["ambient_row"]
        ).numerator()
        stored = order.ideal_from_dict(evidence["integral_ideal"])
        if stored != reconstructed or not stored.is_integral():
            return False
        norm = _integer_rational(stored.norm(), "an integral ideal norm")
        coefficients = _cubic_norm_form_coefficients(stored)
        if evidence["ideal_norm"] != norm or evidence["norm_form_coefficients"] != list(
            coefficients
        ):
            return False
        targets = {norm % modulus, (-norm) % modulus}
        sequence = 0
        for x in range(modulus):
            for y in range(modulus):
                for z in range(modulus):
                    if sequence % 256 == 0:
                        _check_cubic_cancelled(cancelled)
                    sequence += 1
                    if (
                        _cubic_norm_form_value(coefficients, x, y, z) % modulus
                        in targets
                    ):
                        return False
        return True
    except (
        ImportError,
        AttributeError,
        TypeError,
        ValueError,
        ArithmeticError,
        KeyError,
    ):
        return False


class CubicMinkowskiClassNumberCertificate:
    """Detached exact cubic class-number proof from relations and norm obstructions."""

    def __init__(
        self,
        field: Any,
        *,
        plan: dict[str, Any],
        factor_base: list[dict[str, Any]],
        relations: list[dict[str, Any]],
        presentation: dict[str, Any],
        obstructions: list[dict[str, Any]],
        caps: dict[str, Any],
    ) -> None:
        if int(field.degree()) != 3:
            raise ValueError("the Minkowski class-number certificate requires a cubic")
        tree = {
            "plan": plan,
            "factor_base": factor_base,
            "relations": relations,
            "presentation": presentation,
            "obstructions": obstructions,
            "caps": caps,
        }
        if not _cubic_minkowski_payload_within_caps(tree):
            raise ValueError("cubic class-number evidence exceeds replay limits")
        self.field = field
        self._plan_json = _canonical_json(plan)
        self._factor_base_json = _canonical_json(factor_base)
        self._relations_json = _canonical_json(relations)
        self._presentation_json = _canonical_json(presentation)
        self._obstructions_json = _canonical_json(obstructions)
        self._caps_json = _canonical_json(caps)
        self.proof_status = "exact-unconditional"
        self.source = "exact Minkowski relations with modular cubic norm obstructions"
        # Keep one canonical immutable body instead of reparsing all six
        # component strings and serializing the resulting tree again whenever
        # the certificate is hashed or exported.  The explicit key order below
        # is the lexicographic order used by `_canonical_json`, so this remains
        # byte-for-byte compatible with the detached certificate format.
        self._body_json = (
            '{"caps":'
            + self._caps_json
            + ',"factor_base":'
            + self._factor_base_json
            + ',"obstructions":'
            + self._obstructions_json
            + ',"plan":'
            + self._plan_json
            + ',"presentation":'
            + self._presentation_json
            + ',"proof_status":'
            + _canonical_json(self.proof_status)
            + ',"relations":'
            + self._relations_json
            + ',"schema":'
            + _canonical_json(CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA)
            + "}"
        )
        self._content_sha256 = hashlib.sha256(
            self._body_json.encode("utf-8")
        ).hexdigest()
        matrix_module = __import__(
            "sagejs.number_fields.class_group_matrix", fromlist=["class_group_matrix"]
        )
        presentation_replay = matrix_module.RelationPresentation.from_dict(presentation)
        if presentation_replay.order is None:
            raise ValueError("a cubic class-number certificate must have finite order")
        self._class_number = int(presentation_replay.order)
        runtime.object.freeze(self)

    @property
    def plan(self) -> dict[str, Any]:
        return json.loads(self._plan_json)

    @property
    def factor_base(self) -> list[dict[str, Any]]:
        return json.loads(self._factor_base_json)

    @property
    def relations(self) -> list[dict[str, Any]]:
        return json.loads(self._relations_json)

    @property
    def presentation(self) -> dict[str, Any]:
        return json.loads(self._presentation_json)

    @property
    def obstructions(self) -> list[dict[str, Any]]:
        return json.loads(self._obstructions_json)

    @property
    def caps(self) -> dict[str, Any]:
        return json.loads(self._caps_json)

    @property
    def class_number(self) -> int:
        return self._class_number

    def _body_dict(self) -> dict[str, Any]:
        return json.loads(self._body_json)

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = self._content_sha256
        return body

    def stable_hash(self) -> str:
        return self._content_sha256

    def verify(self, *, cancelled: Callable[[], bool] | None = None) -> bool:
        try:
            if (
                hashlib.sha256(self._body_json.encode("utf-8")).hexdigest()
                != self._content_sha256
            ):
                return False
            caps = self.caps
            replay_limits = {
                "max_relation_attempts": _CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATION_ATTEMPTS,
                "max_relations": _CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATIONS,
                "max_candidates_per_ideal": _CUBIC_CLASS_NUMBER_REPLAY_MAX_CANDIDATES_PER_IDEAL,
                "max_quotient_order": _CUBIC_CLASS_NUMBER_REPLAY_MAX_QUOTIENT_ORDER,
                "max_projective_lines": _CUBIC_CLASS_NUMBER_REPLAY_MAX_PROJECTIVE_LINES,
                "max_modulus": _CUBIC_CLASS_NUMBER_REPLAY_MAX_MODULUS,
                "max_residue_states": _CUBIC_CLASS_NUMBER_REPLAY_MAX_RESIDUE_STATES,
            }
            for name, limit in replay_limits.items():
                if _positive_integer(caps[name], name.replace("_", " ")) > limit:
                    return False
            factor_base_module = __import__(
                "sagejs.number_fields.class_group_factor_base",
                fromlist=["class_group_factor_base"],
            )
            stored_plan = self.plan
            plan_caps = stored_plan["caps"]
            for name, limit in (
                ("max_bound", _CUBIC_MINKOWSKI_REPLAY_MAX_BOUND),
                (
                    "max_rational_primes",
                    _CUBIC_MINKOWSKI_REPLAY_MAX_RATIONAL_PRIMES,
                ),
                ("max_prime_ideals", _CUBIC_MINKOWSKI_REPLAY_MAX_PRIME_IDEALS),
                ("max_memory_bytes", _CUBIC_MINKOWSKI_REPLAY_MAX_MEMORY_BYTES),
            ):
                if _positive_integer(plan_caps[name], name.replace("_", " ")) > limit:
                    return False
            plan = factor_base_module.factor_base_plan(
                self.field.maximal_order(),
                proof=True,
                theorem="minkowski",
                max_bound=_positive_integer(plan_caps["max_bound"], "maximum bound"),
                max_rational_primes=_positive_integer(
                    plan_caps["max_rational_primes"], "maximum rational primes"
                ),
                max_prime_ideals=_positive_integer(
                    plan_caps["max_prime_ideals"], "maximum prime ideals"
                ),
                max_memory_bytes=_positive_integer(
                    plan_caps["max_memory_bytes"], "maximum memory bytes"
                ),
            )
            if plan.to_dict() != stored_plan or tuple(plan.assumptions):
                return False
            factor_records = factor_base_module.build_factor_base(plan)
            if [record.to_dict() for record in factor_records] != self.factor_base:
                return False
            factor_base = tuple(record.prime_ideal for record in factor_records)
            relation_module = __import__(
                "sagejs.number_fields.class_group_relations",
                fromlist=["class_group_relations"],
            )
            relation_payloads = self.relations
            if len(relation_payloads) > int(caps["max_relations"]):
                return False
            relation_records = tuple(
                relation_module.RelationRecord.from_dict(payload)
                for payload in relation_payloads
            )
            order = self.field.maximal_order()
            reconstructor = relation_module.FactorBaseIdealReconstructor(
                order, factor_base
            )
            for sequence, record in enumerate(relation_records):
                if sequence % 4 == 0:
                    _check_cubic_cancelled(cancelled)
                if (
                    record.verify(order, factor_base, reconstructor=reconstructor)[
                        "certified"
                    ]
                    is not True
                ):
                    return False
            matrix_module = __import__(
                "sagejs.number_fields.class_group_matrix",
                fromlist=["class_group_matrix"],
            )
            presentation = matrix_module.RelationPresentation.from_dict(
                self.presentation
            )
            if (
                not presentation.verify()
                or presentation.column_count != len(factor_base)
                or presentation.rank != len(factor_base)
                or [row.dense() for row in presentation.relation_rows]
                != [list(record.row) for record in relation_records]
                or presentation.order is None
                or int(presentation.order) > int(caps["max_quotient_order"])
            ):
                return False
            expected_lines = _projective_line_specs(
                presentation, max_lines=int(caps["max_projective_lines"])
            )
            if len(expected_lines) > int(caps["max_projective_lines"]) or len(
                expected_lines
            ) != len(self.obstructions):
                return False
            used_states = 0
            for expected, evidence in zip(
                expected_lines, self.obstructions, strict=True
            ):
                used_states += _positive_integer(
                    evidence["residue_states"], "residue states"
                )
                if used_states > int(caps["max_residue_states"]):
                    return False
                if not _verify_cubic_norm_obstruction(
                    order,
                    factor_base,
                    expected,
                    evidence,
                    max_modulus=int(caps["max_modulus"]),
                    cancelled=cancelled,
                ):
                    return False
            return True
        except RuntimeError as error:
            if str(error) == "class/unit computation cancelled":
                raise
            return False
        except (
            ImportError,
            AttributeError,
            TypeError,
            ValueError,
            ArithmeticError,
            KeyError,
        ):
            return False

    @classmethod
    def from_dict(
        cls,
        field: Any,
        payload: dict[str, Any],
        *,
        cancelled: Callable[[], bool] | None = None,
    ) -> CubicMinkowskiClassNumberCertificate:
        if not isinstance(payload, dict):
            raise TypeError("a cubic class-number certificate must be a dictionary")
        if not _cubic_minkowski_payload_within_caps(payload):
            raise ValueError("cubic class-number evidence exceeds replay limits")
        expected = {
            "schema",
            "plan",
            "factor_base",
            "relations",
            "presentation",
            "obstructions",
            "caps",
            "proof_status",
            "content_sha256",
        }
        if set(payload) != expected:
            raise ValueError("a cubic class-number certificate has unexpected fields")
        if payload.get("schema") != CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA:
            raise ValueError("unsupported cubic class-number certificate schema")
        if payload.get("proof_status") != "exact-unconditional":
            raise ValueError(
                "a cubic class-number certificate has the wrong proof status"
            )
        content_hash = payload.get("content_sha256")
        if (
            not isinstance(content_hash, str)
            or len(content_hash) != 64
            or any(character not in "0123456789abcdef" for character in content_hash)
        ):
            raise ValueError("a cubic class-number certificate has an invalid hash")
        body = dict(payload)
        del body["content_sha256"]
        if _content_hash(body) != content_hash:
            raise ValueError("cubic class-number certificate content hash mismatch")
        answer = cls(
            field,
            plan=payload["plan"],
            factor_base=payload["factor_base"],
            relations=payload["relations"],
            presentation=payload["presentation"],
            obstructions=payload["obstructions"],
            caps=payload["caps"],
        )
        if answer.to_dict() != payload or not answer.verify(cancelled=cancelled):
            raise ValueError("cubic class-number certificate exact replay failed")
        return answer


class CubicClassNumberResult:
    """A bounded cubic class-number result with retained exact seed artifacts."""

    def __init__(
        self,
        field: Any,
        complete: bool,
        reason: str,
        minkowski_bound: int,
        *,
        certificate: CubicMinkowskiClassNumberCertificate | None = None,
        factor_base: tuple[Any, ...] = (),
        relation_records: tuple[Any, ...] = (),
        presentation: Any = None,
        diagnostics: dict[str, Any] | None = None,
    ) -> None:
        if complete and certificate is None:
            raise ValueError("a complete cubic class number needs a certificate")
        self.field = field
        self.complete = bool(complete)
        self.reason = str(reason)
        self.minkowski_bound = int(minkowski_bound)
        self.certificate = certificate
        self.factor_base = tuple(factor_base)
        self.relation_records = tuple(relation_records)
        self.presentation = presentation
        self.diagnostics = dict({} if diagnostics is None else diagnostics)
        self.proof_status = "exact-unconditional" if complete else "incomplete"

    def order(self) -> int:
        if not self.complete or self.certificate is None:
            raise ValueError("an incomplete cubic class-number search has no order")
        return int(self.certificate.class_number)

    def __repr__(self) -> str:
        if self.complete:
            return "Certified cubic class number " + str(self.order())
        return "Incomplete cubic class-number search (" + self.reason + ")"


def _cubic_class_number_result_snapshot(result: CubicClassNumberResult) -> Any:
    """Snapshot every mutable proof-bearing field of one live result."""
    certificate = result.certificate
    if type(certificate) is not CubicMinkowskiClassNumberCertificate:
        raise TypeError("a live cubic class-number result needs the exact certificate")
    factor_base = []
    for ideal in result.factor_base:
        serializer = getattr(ideal, "to_dict", None)
        if not callable(serializer):
            raise TypeError("a live cubic factor-base ideal is not serializable")
        factor_base.append(serializer())
    relations = []
    for record in result.relation_records:
        serializer = getattr(record, "to_dict", None)
        if not callable(serializer):
            raise TypeError("a live cubic relation record is not serializable")
        relations.append(serializer())
    presentation = result.presentation
    presentation_serializer = getattr(presentation, "to_dict", None)
    if not callable(presentation_serializer):
        raise TypeError("a live cubic presentation is not serializable")
    return _freeze_authentication_value(
        {
            "complete": result.complete,
            "reason": result.reason,
            "minkowski_bound": result.minkowski_bound,
            "proof_status": result.proof_status,
            # These strings are the certificate's canonical immutable source.
            # Snapshotting them avoids reparsing the potentially large exact
            # witness payload merely to compare it with itself.
            "certificate": {
                "plan_json": certificate._plan_json,
                "factor_base_json": certificate._factor_base_json,
                "relations_json": certificate._relations_json,
                "presentation_json": certificate._presentation_json,
                "obstructions_json": certificate._obstructions_json,
                "caps_json": certificate._caps_json,
                "body_json": certificate._body_json,
                "class_number": certificate._class_number,
                "proof_status": certificate.proof_status,
                "source": certificate.source,
                "content_sha256": certificate._content_sha256,
            },
            "factor_base": factor_base,
            "relations": relations,
            "presentation": presentation_serializer(),
            "diagnostics": result.diagnostics,
        }
    )


class _AuthenticatedCubicClassNumberResult:
    """Immutable producer-issued seal for one live exact cubic result."""

    def __init__(self, token: object, result: CubicClassNumberResult) -> None:
        if token is not _AUTHENTICATED_CUBIC_CLASS_NUMBER_TOKEN:
            raise TypeError("authenticated cubic class-number seals are module-issued")
        if type(result) is not CubicClassNumberResult or not result.complete:
            raise ValueError(
                "an authenticated cubic class-number result must be complete"
            )
        certificate = result.certificate
        if type(certificate) is not CubicMinkowskiClassNumberCertificate:
            raise TypeError("an authenticated cubic result needs the exact certificate")
        if (
            result.proof_status != "exact-unconditional"
            or certificate.proof_status != "exact-unconditional"
            or certificate.field is not result.field
        ):
            raise ValueError("an authenticated cubic result has inconsistent authority")
        self.schema = AUTHENTICATED_CUBIC_CLASS_NUMBER_SCHEMA
        self.class_number = int(certificate.class_number)
        self.minkowski_bound = int(result.minkowski_bound)
        self.proof_status = str(result.proof_status)
        self.certificate_sha256 = str(certificate.stable_hash())
        self.factor_base_size = len(result.factor_base)
        self.relation_count = len(result.relation_records)
        self.__dict__["_source_field"] = result.field
        self.__dict__["_source_result"] = result
        self.__dict__["_source_snapshot"] = _cubic_class_number_result_snapshot(result)
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("authenticated cubic class-number seals are immutable")
        self.__dict__[name] = value

    @property
    def certified(self) -> bool:
        try:
            source = self.__dict__.get("_source_result")
            return (
                type(source) is CubicClassNumberResult
                and source.field is self.__dict__.get("_source_field")
                and source.complete
                and self.proof_status == "exact-unconditional"
                and self.__dict__.get("_authentication_snapshot")
                == _authenticated_cubic_class_number_snapshot(self)
                and self.__dict__.get("_source_snapshot")
                == _cubic_class_number_result_snapshot(source)
            )
        except (AttributeError, TypeError, ValueError):
            return False


def _authenticated_cubic_class_number_snapshot(
    authentication: _AuthenticatedCubicClassNumberResult,
) -> tuple[Any, ...]:
    return (
        AUTHENTICATED_CUBIC_CLASS_NUMBER_SCHEMA,
        authentication.schema,
        authentication.class_number,
        authentication.minkowski_bound,
        authentication.proof_status,
        authentication.certificate_sha256,
        authentication.factor_base_size,
        authentication.relation_count,
    )


def _issue_cubic_class_number_result(
    result: CubicClassNumberResult,
) -> CubicClassNumberResult:
    """Attach a cheap live seal at the exact producer boundary."""
    authentication = _AuthenticatedCubicClassNumberResult(
        _AUTHENTICATED_CUBIC_CLASS_NUMBER_TOKEN, result
    )
    authentication.__dict__["_authentication_snapshot"] = (
        _authenticated_cubic_class_number_snapshot(authentication)
    )
    if not authentication.certified:
        raise ArithmeticError("failed to seal a live cubic class-number result")
    result.__dict__["_live_authentication"] = authentication
    return result


def authenticated_cubic_class_number_result_matches(result: Any, field: Any) -> bool:
    """Check a producer-issued live result without detached arithmetic replay."""
    if type(result) is not CubicClassNumberResult or result.field is not field:
        return False
    try:
        authentication = result.__dict__.get("_live_authentication")
        certificate = result.certificate
        return (
            type(authentication) is _AuthenticatedCubicClassNumberResult
            and type(certificate) is CubicMinkowskiClassNumberCertificate
            and authentication.__dict__.get("_source_result") is result
            and authentication.__dict__.get("_source_field") is field
            and authentication.certified
            and authentication.class_number == result.order()
            and authentication.certificate_sha256 == certificate.stable_hash()
        )
    except (AttributeError, TypeError, ValueError):
        return False


def bounded_cubic_minkowski_class_number(
    field: Any,
    *,
    max_bound: int = DEFAULT_CUBIC_MINKOWSKI_MAX_BOUND,
    max_rational_primes: int = DEFAULT_CUBIC_MINKOWSKI_MAX_RATIONAL_PRIMES,
    max_prime_ideals: int = DEFAULT_CUBIC_MINKOWSKI_MAX_PRIME_IDEALS,
    max_memory_bytes: int = DEFAULT_CUBIC_MINKOWSKI_MAX_MEMORY_BYTES,
    max_relation_attempts: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATION_ATTEMPTS,
    max_relations: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATIONS,
    max_candidates_per_ideal: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_CANDIDATES_PER_IDEAL,
    max_quotient_order: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_QUOTIENT_ORDER,
    max_projective_lines: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_PROJECTIVE_LINES,
    max_modulus: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_MODULUS,
    max_residue_states: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_RESIDUE_STATES,
    cancelled: Callable[[], bool] | None = None,
) -> CubicClassNumberResult:
    """Prove a cubic class number without computing units or a regulator.

    The exact Minkowski factor base generates the class group.  Exact principal
    relations give a finite quotient `Q` surjecting onto it.  For every prime
    `p | |Q|`, this producer proves that each projective line of `Q[p]` remains
    nonzero by an exhaustive modular obstruction for the associated ternary
    ideal norm form.  Therefore the surjection has trivial kernel.

    Every search is explicitly bounded.  Exhaustion returns an incomplete
    artifact whose factor base and relations may seed a later coupled engine;
    it never changes the class-number answer by itself.
    """
    if int(field.degree()) != 3:
        raise ValueError("the bounded Minkowski class-number path requires a cubic")
    checked_caps = {
        "max_relation_attempts": _positive_integer(
            max_relation_attempts, "maximum relation attempts"
        ),
        "max_relations": _positive_integer(max_relations, "maximum relations"),
        "max_candidates_per_ideal": _positive_integer(
            max_candidates_per_ideal, "maximum candidates per ideal"
        ),
        "max_quotient_order": _positive_integer(
            max_quotient_order, "maximum quotient order"
        ),
        "max_projective_lines": _positive_integer(
            max_projective_lines, "maximum projective lines"
        ),
        "max_modulus": _positive_integer(max_modulus, "maximum modulus"),
        "max_residue_states": _positive_integer(
            max_residue_states, "maximum residue states"
        ),
    }
    if checked_caps["max_modulus"] < 2:
        raise ValueError("maximum modulus must be at least two")
    phase_timings: dict[str, float] = {}
    relation_metrics: dict[str, int] = {}
    total_started = time.perf_counter()
    factor_base_module = __import__(
        "sagejs.number_fields.class_group_factor_base",
        fromlist=["class_group_factor_base"],
    )
    factor_started = time.perf_counter()
    plan = factor_base_module.factor_base_plan(
        field.maximal_order(),
        proof=True,
        theorem="minkowski",
        max_bound=_positive_integer(max_bound, "maximum factor-base bound"),
        max_rational_primes=_positive_integer(
            max_rational_primes, "maximum rational primes"
        ),
        max_prime_ideals=_positive_integer(max_prime_ideals, "maximum prime ideals"),
        max_memory_bytes=_positive_integer(max_memory_bytes, "maximum memory bytes"),
    )

    def incomplete(
        reason: str,
        *,
        factor_base: tuple[Any, ...] = (),
        relation_records: tuple[Any, ...] = (),
        presentation: Any = None,
        residue_states: int = 0,
    ) -> CubicClassNumberResult:
        phase_timings["total"] = time.perf_counter() - total_started
        return CubicClassNumberResult(
            field,
            False,
            reason,
            int(plan.bound),
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
            diagnostics={
                "algorithm": "bounded-cubic-minkowski-p-lines",
                "phase_timings": dict(phase_timings),
                "factor_base_size": len(factor_base),
                "relations": len(relation_records),
                "presentation_rank": int(getattr(presentation, "rank", 0)),
                "quotient_order": getattr(presentation, "order", None),
                "residue_states": int(residue_states),
                "relation_search": dict(relation_metrics),
                "caps": dict(checked_caps),
            },
        )

    try:
        _check_cubic_cancelled(cancelled)
        plan.require_feasible()
        factor_records = factor_base_module.build_factor_base(plan)
    except RuntimeError:
        raise
    except ValueError as error:
        phase_timings["factor_base"] = time.perf_counter() - factor_started
        return incomplete(
            "bounded cubic Minkowski factor base is unavailable: " + str(error)
        )
    phase_timings["factor_base"] = time.perf_counter() - factor_started
    factor_base = tuple(record.prime_ideal for record in factor_records)

    relation_module = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["class_group_relations"],
    )
    matrix_module = __import__(
        "sagejs.number_fields.class_group_matrix", fromlist=["class_group_matrix"]
    )
    engine_module = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )

    class _NoAnalyticComponents:
        def __init__(self) -> None:
            self.factor_base: Any = None
            self.relations: Any = None
            self.matrix: Any = None
            self.analytic: Any = None
            self.context: Any = None
            self.factored: Any = None

    components = _NoAnalyticComponents()
    components.factor_base = factor_base_module
    components.relations = relation_module
    components.matrix = matrix_module
    components.analytic = _NoAnalyticComponents()
    components.context = None
    components.factored = None
    limits = engine_module.ClassUnitEngineLimits(
        max_factor_base_bound=_positive_integer(max_bound, "maximum factor-base bound"),
        max_factor_base_size=_positive_integer(
            max_prime_ideals, "maximum prime ideals"
        ),
        max_relation_attempts=checked_caps["max_relation_attempts"],
        max_relations=checked_caps["max_relations"],
        max_candidates_per_ideal=checked_caps["max_candidates_per_ideal"],
        max_random_terms=5,
        max_coefficient_bound=3,
        max_partial_relations=checked_caps["max_relations"],
        max_memory_bytes=_positive_integer(max_memory_bytes, "maximum memory bytes"),
    )
    relation_started = time.perf_counter()
    engine = engine_module.ClassUnitGroupEngine(
        field,
        proof=True,
        algorithm="minkowski",
        limits=limits,
        cancelled=cancelled,
        components=components,
    )
    try:
        # This class-number-only quotient needs full factor-base rank but no
        # logarithmic unit dependencies.  One exact row per searched ideal is
        # sufficient; the loop continues until the exact presentation reaches
        # full rank, and the detached certificate replays every retained row.
        collector, presentation = engine._relations(
            factor_base, 0, relations_per_ideal=1
        )
    except RuntimeError:
        raise
    except ValueError as error:
        if "max_relations" not in str(error) and "resource" not in str(error):
            raise
        phase_timings["relations"] = time.perf_counter() - relation_started
        return incomplete(
            "bounded exact relation search exhausted: " + str(error),
            factor_base=factor_base,
        )
    phase_timings["relations"] = time.perf_counter() - relation_started
    relation_records = tuple(collector.records)
    engine_diagnostics = engine._diagnostics()
    engine_resources = engine_diagnostics.get("resources", {})
    for name in (
        "relation_attempts",
        "relation_candidates",
        "ideals_tested",
        "presentation_extractions",
    ):
        value = engine_resources.get(name)
        if isinstance(value, int) and not isinstance(value, bool):
            relation_metrics[name] = int(value)
    if presentation.rank != len(factor_base) or presentation.order is None:
        return incomplete(
            "bounded exact relation search did not reach full rank",
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
        )
    quotient_order = int(presentation.order)
    if quotient_order > checked_caps["max_quotient_order"]:
        return incomplete(
            "relation quotient order exceeds the bounded proof cap",
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
        )
    try:
        line_specs = _projective_line_specs(
            presentation, max_lines=checked_caps["max_projective_lines"]
        )
    except ValueError:
        return incomplete(
            "quotient p-torsion has too many projective lines",
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
        )
    obstruction_started = time.perf_counter()
    obstructions: list[dict[str, Any]] = []
    residue_states = 0
    for line in line_specs:
        _check_cubic_cancelled(cancelled)
        representative = relation_module.reconstruct_factor_base_ideal(
            field.maximal_order(), factor_base, line["ambient_row"]
        )
        obstruction, used = _find_cubic_norm_obstruction(
            representative,
            line,
            max_modulus=checked_caps["max_modulus"],
            remaining_states=checked_caps["max_residue_states"] - residue_states,
            cancelled=cancelled,
        )
        residue_states += used
        if obstruction is None:
            phase_timings["norm_obstructions"] = (
                time.perf_counter() - obstruction_started
            )
            return incomplete(
                "bounded modular norm-form search found no obstruction for a p-line",
                factor_base=factor_base,
                relation_records=relation_records,
                presentation=presentation,
                residue_states=residue_states,
            )
        obstructions.append(obstruction)
    phase_timings["norm_obstructions"] = time.perf_counter() - obstruction_started
    certificate = CubicMinkowskiClassNumberCertificate(
        field,
        plan=plan.to_dict(),
        factor_base=[record.to_dict() for record in factor_records],
        relations=[record.to_dict() for record in relation_records],
        presentation=presentation.to_dict(),
        obstructions=obstructions,
        caps=checked_caps,
    )
    encoding_started = time.perf_counter()
    if certificate.class_number != quotient_order:
        raise ArithmeticError("cubic class-number evidence changed during encoding")
    phase_timings["certificate_encoding"] = time.perf_counter() - encoding_started
    phase_timings["total"] = time.perf_counter() - total_started
    return _issue_cubic_class_number_result(
        CubicClassNumberResult(
            field,
            True,
            certificate.source,
            int(plan.bound),
            certificate=certificate,
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
            diagnostics={
                "algorithm": "bounded-cubic-minkowski-p-lines",
                "phase_timings": dict(phase_timings),
                "factor_base_size": len(factor_base),
                "relations": len(relation_records),
                "presentation_rank": int(presentation.rank),
                "quotient_order": quotient_order,
                "projective_lines": len(line_specs),
                "residue_states": residue_states,
                "relation_search": dict(relation_metrics),
                "caps": dict(checked_caps),
            },
        )
    )


__all__ = [
    "CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA",
    "CubicClassNumberResult",
    "CubicMinkowskiClassNumberCertificate",
    "authenticated_cubic_class_number_result_matches",
    "bounded_cubic_minkowski_class_number",
]
