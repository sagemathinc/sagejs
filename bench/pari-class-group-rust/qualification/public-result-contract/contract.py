"""Fail-closed adapter for the canonical Rust class-group result schema.

Portable JSON is producer evidence, never live Sage.js authority. This module
binds the existing `result-evidence-v1` envelope to a caller-supplied live
field, canonical prepared-input identity, and the digest of the artifact that
was actually loaded. Public completion additionally requires fresh,
process-local replay objects and an exact `ClassUnitComputation` containing
an exact `IdealClassGroup` built from those same objects.
"""

from __future__ import annotations

import hashlib
import json
from types import MappingProxyType
from typing import Any, Callable, Mapping, Sequence

from sagejs.number_fields.class_group_maps import IdealClassGroup
from sagejs.number_fields.class_unit_groups import (
    ClassUnitComputation,
    UnitGroupComputation,
)


RESULT_EVIDENCE_SCHEMA = "sagejs.rust-class-group.result-evidence/v1"
HASH_DOMAIN_SCHEMA = "sagejs.rust-class-group/evidence-component-hash-v1"

CANDIDATE = "candidate"
UPSTREAM_ASSUMED = "upstream-assumed-correspondence"
PUBLICLY_COMPLETE = "publicly-complete"

CONDITIONAL_GRH = "conditional-grh"
UNCONDITIONAL = "unconditional"
EXACT_RELATIONS_CONDITIONAL_GRH = "exact-relations-conditional-grh"
EXACT_UNCONDITIONAL = "exact-unconditional"
INCOMPLETE_RESOURCE_LIMIT = "incomplete-resource-limit"

RELATION_LATTICE = "relation-lattice"
PRESENTATION = "compact-presentation"
GENERATORS_MAP = "generators-and-maps"
COMPLETION = "completion-proof"
UPSTREAM_CORRESPONDENCE = "upstream-correspondence"
_PUBLIC_ROLES = (RELATION_LATTICE, PRESENTATION, GENERATORS_MAP, COMPLETION)
_ROLES = _PUBLIC_ROLES + (UPSTREAM_CORRESPONDENCE,)
_EVIDENCE_KEYS = {
    RELATION_LATTICE: "relationLattice",
    PRESENTATION: "smith",
    GENERATORS_MAP: "generatorsAndMaps",
    COMPLETION: "completion",
}

_MAX_DEPTH = 64
_MAX_NODES = 4_000_000
_MAX_STRING_BYTES = 1 << 20
_MAX_BYTES = 64 << 20
_BOUNDARY_TOKEN = object()
_REQUEST_TOKEN = object()
_ACCEPTANCE_TOKEN = object()
_MATERIAL_TOKEN = object()
_BUILT_TOKEN = object()


class _Sealed:
    __slots__ = ("_sealed",)

    def __init__(self) -> None:
        object.__setattr__(self, "_sealed", False)

    def __setattr__(self, name: str, value: Any) -> None:
        if getattr(self, "_sealed", False):
            raise AttributeError("a process-local authority object is sealed")
        object.__setattr__(self, name, value)

    def _finish(self) -> None:
        object.__setattr__(self, "_sealed", True)


def _canonical_json(value: Any) -> str:
    try:
        return json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise TypeError("result evidence must be canonical JSON data") from error


def _strict_json(text: str) -> Any:
    def object_from_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise ValueError("result evidence repeats a JSON key")
            answer[key] = value
        return answer

    try:
        return json.loads(text, object_pairs_hook=object_from_pairs)
    except (TypeError, ValueError) as error:
        raise ValueError("invalid result-evidence JSON") from error


def _bounded_json(value: Any) -> None:
    stack = [(value, 0)]
    nodes = 0
    size = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > _MAX_NODES or depth > _MAX_DEPTH:
            raise ValueError("result evidence exceeds structural limits")
        if item is None or isinstance(item, bool):
            size += 4
        elif isinstance(item, int):
            size += max(1, (item.bit_length() + 7) // 8)
        elif isinstance(item, str):
            encoded = len(item.encode("utf-8"))
            if encoded > _MAX_STRING_BYTES:
                raise ValueError("result evidence contains an oversized string")
            size += encoded
        elif isinstance(item, list):
            stack.extend((entry, depth + 1) for entry in item)
        elif isinstance(item, dict):
            if any(not isinstance(key, str) for key in item):
                raise TypeError("result evidence keys must be strings")
            stack.extend((key, depth + 1) for key in item)
            stack.extend((entry, depth + 1) for entry in item.values())
        else:
            raise TypeError("result evidence contains a non-JSON value")
        if size > _MAX_BYTES:
            raise ValueError("result evidence exceeds its byte budget")


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(entry) for key, entry in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(entry) for entry in value)
    return value


def _thaw(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _thaw(entry) for key, entry in value.items()}
    if isinstance(value, tuple):
        return [_thaw(entry) for entry in value]
    return value


def _deep_frozen_copy(value: Any) -> Any:
    _bounded_json(value)
    return _freeze(json.loads(_canonical_json(value)))


def _exact_keys(value: Any, expected: set[str], purpose: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise TypeError(purpose + " must be an object")
    if set(value) != expected:
        raise ValueError(purpose + " has unknown or missing fields")
    return value


def _bounded_keys(
    value: Any,
    required: set[str],
    allowed: set[str],
    purpose: str,
) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise TypeError(purpose + " must be an object")
    keys = set(value)
    if not required <= keys or not keys <= allowed:
        raise ValueError(purpose + " has unknown or missing fields")
    return value


def _sha256(value: Any, purpose: str, *, content_id: bool = False) -> str:
    if not isinstance(value, str):
        raise TypeError(purpose + " must be a SHA-256 string")
    digest = value
    if content_id:
        if not digest.startswith("sha256:"):
            raise ValueError(purpose + " must start with sha256:")
        digest = digest[7:]
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError(purpose + " must contain a lowercase SHA-256 digest")
    return value


def _integer_string(value: Any, purpose: str, *, positive: bool = False) -> int:
    if not isinstance(value, str) or value in ("", "-0"):
        raise TypeError(purpose + " must be a canonical integer string")
    try:
        answer = int(value)
    except ValueError as error:
        raise ValueError(purpose + " must be a canonical integer string") from error
    if str(answer) != value or (positive and answer < 1):
        raise ValueError(purpose + " must be a canonical integer string")
    return answer


def _invariants(value: Any, purpose: str) -> tuple[int, ...]:
    if not isinstance(value, (list, tuple)):
        raise TypeError(purpose + " must be a list")
    answer = tuple(
        _integer_string(entry, purpose + " entry", positive=True) for entry in value
    )
    previous = 1
    for entry in answer:
        if entry <= 1 or entry % previous != 0:
            raise ValueError(
                "invariant factors must exceed one and divide successively"
            )
        previous = entry
    return answer


def _nonempty(value: Any, purpose: str) -> str:
    if not isinstance(value, str) or value == "":
        raise ValueError(purpose + " must be a nonempty string")
    return value


def _nonnegative_integer(value: Any, purpose: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise TypeError(purpose + " must be a nonnegative JSON integer")
    return value


def _unsigned_decimal(value: Any, purpose: str) -> int:
    answer = _integer_string(value, purpose)
    if answer < 0:
        raise ValueError(purpose + " must be unsigned")
    return answer


def _evidence_binding(value: Any, purpose: str) -> Mapping[str, Any]:
    binding = _bounded_keys(
        value,
        {"kind", "sha256", "replayable", "verified"},
        {"kind", "sha256", "replayable", "verified", "path"},
        purpose,
    )
    _nonempty(binding["kind"], purpose + " kind")
    _sha256(binding["sha256"], purpose + " digest")
    if type(binding["replayable"]) is not bool or type(binding["verified"]) is not bool:
        raise TypeError(purpose + " replay flags must be JSON booleans")
    if "path" in binding and binding["path"] is not None:
        _nonempty(binding["path"], purpose + " path")
    return binding


def _ideal(value: Any, purpose: str) -> Mapping[str, Any]:
    ideal = _exact_keys(
        value,
        {"basisNumeratorsRowMajor", "basisDenominator", "norm"},
        purpose,
    )
    basis = ideal["basisNumeratorsRowMajor"]
    if not isinstance(basis, (list, tuple)) or not basis:
        raise ValueError(purpose + " basis must be a nonempty array")
    for entry in basis:
        _integer_string(entry, purpose + " basis entry")
    _integer_string(ideal["basisDenominator"], purpose + " denominator", positive=True)
    _integer_string(ideal["norm"], purpose + " norm", positive=True)
    return ideal


def _polynomial(value: Any, purpose: str) -> tuple[int, ...]:
    if not isinstance(value, (list, tuple)) or len(value) < 3:
        raise ValueError(purpose + " must have degree at least two")
    answer_list = []
    for entry in value:
        if isinstance(entry, str):
            answer_list.append(_integer_string(entry, purpose))
            continue
        if isinstance(entry, (bool, float, bytes, bytearray)):
            raise TypeError(purpose + " coefficients must be exact integers")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise TypeError(purpose + " coefficients must be exact integers") from error
        if integer != entry:
            raise TypeError(purpose + " coefficients must be exact integers")
        answer_list.append(integer)
    answer = tuple(answer_list)
    if answer[-1] != 1:
        raise ValueError(purpose + " must be a monic integral polynomial")
    return answer


def component_sha256(role: str, payload: Any) -> str:
    """Hash a component with schema and role domain separation."""
    if role not in _ROLES:
        raise ValueError("unknown result-evidence component role")
    _bounded_json(payload)
    domain = {"schema": HASH_DOMAIN_SCHEMA, "role": role, "payload": payload}
    return hashlib.sha256(_canonical_json(domain).encode("utf-8")).hexdigest()


class TrustedBoundary(_Sealed):
    """Process-local authority supplied independently of producer JSON."""

    __slots__ = (
        "live_field",
        "prepared_input_id",
        "loaded_artifact_sha256",
        "requested_proof",
        "field_id",
        "polynomial_ascending",
        "_polynomial_reader",
        "_field_id_reader",
        "_identity",
    )

    def __init__(
        self,
        token: object,
        live_field: Any,
        prepared_input_id: str,
        loaded_artifact_sha256: str,
        requested_proof: str,
        field_id: str,
        polynomial_ascending: tuple[int, ...],
        polynomial_reader: Callable[[Any], Sequence[Any]],
        field_id_reader: Callable[[Any], str],
    ) -> None:
        super().__init__()
        if token is not _BOUNDARY_TOKEN:
            raise TypeError("TrustedBoundary must be created by trusted_boundary")
        self.live_field = live_field
        self.prepared_input_id = prepared_input_id
        self.loaded_artifact_sha256 = loaded_artifact_sha256
        self.requested_proof = requested_proof
        self.field_id = field_id
        self.polynomial_ascending = polynomial_ascending
        self._polynomial_reader = polynomial_reader
        self._field_id_reader = field_id_reader
        self._identity = object()
        self._finish()

    def verify_live_identity(self) -> None:
        if self._field_id_reader(self.live_field) != self.field_id:
            raise ArithmeticError("the live number-field identity changed")
        if (
            _polynomial(
                self._polynomial_reader(self.live_field), "live defining polynomial"
            )
            != self.polynomial_ascending
        ):
            raise ArithmeticError("the live defining polynomial changed")


def trusted_boundary(
    *,
    live_field: Any,
    canonical_prepared_input_id: str,
    loaded_artifact_sha256: str,
    requested_proof: str,
    trusted_field_id: str,
    trusted_polynomial_ascending: Sequence[Any],
    polynomial_reader: Callable[[Any], Sequence[Any]],
    field_id_reader: Callable[[Any], str],
) -> TrustedBoundary:
    """Create the explicit trusted side of the adapter boundary."""
    input_id = _sha256(
        canonical_prepared_input_id, "canonical prepared-input ID", content_id=True
    )
    artifact = _sha256(loaded_artifact_sha256, "loaded artifact digest")
    if requested_proof not in (CONDITIONAL_GRH, UNCONDITIONAL):
        raise ValueError("unknown requested proof mode")
    if not isinstance(trusted_field_id, str) or trusted_field_id == "":
        raise ValueError("the trusted field ID must be nonempty")
    if not callable(polynomial_reader) or not callable(field_id_reader):
        raise TypeError("live field readers must be callable")
    polynomial = _polynomial(
        trusted_polynomial_ascending, "trusted defining polynomial"
    )
    answer = TrustedBoundary(
        _BOUNDARY_TOKEN,
        live_field,
        input_id,
        artifact,
        requested_proof,
        trusted_field_id,
        polynomial,
        polynomial_reader,
        field_id_reader,
    )
    answer.verify_live_identity()
    return answer


class EvidenceAttachment(_Sealed):
    __slots__ = ("role", "sha256", "payload", "_canonical_payload")

    def __init__(self, role: str, binding: Mapping[str, Any], payload: Any) -> None:
        super().__init__()
        if role not in _ROLES:
            raise ValueError("unknown evidence attachment role")
        _evidence_binding(binding, "evidence binding")
        if binding["kind"] != role:
            raise ValueError("an evidence binding has the wrong role")
        digest = _sha256(binding["sha256"], "evidence binding digest")
        if binding["replayable"] is not True or binding["verified"] is not True:
            raise ValueError(
                "a public component must be replayable and producer-verified"
            )
        frozen = _deep_frozen_copy(payload)
        canonical_payload = _canonical_json(_thaw(frozen))
        if component_sha256(role, _thaw(frozen)) != digest:
            raise ValueError("an evidence attachment does not match its binding")
        self.role = role
        self.sha256 = digest
        self.payload = frozen
        self._canonical_payload = canonical_payload
        self._finish()

    def verify(self) -> None:
        if _canonical_json(_thaw(self.payload)) != self._canonical_payload:
            raise ArithmeticError("an evidence attachment changed after parsing")
        if component_sha256(self.role, _thaw(self.payload)) != self.sha256:
            raise ArithmeticError("an evidence attachment digest changed")


def _identity(attachment: EvidenceAttachment) -> Mapping[str, Any]:
    payload = attachment.payload
    if not isinstance(payload, Mapping):
        raise TypeError(attachment.role + " payload must be an object")
    return _exact_keys(
        payload.get("identity"),
        {
            "preparedInputId",
            "fieldId",
            "polynomialAscending",
            "artifactSha256",
            "presentationId",
            "generatorMapId",
        },
        attachment.role + " identity",
    )


def _validate_maps(value: Any) -> None:
    maps = _exact_keys(
        value,
        {"construction", "idealToClass", "principality", "verified"},
        "map result",
    )
    if maps["construction"] not in ("eager", "lazy-state-retained"):
        raise ValueError("map construction is unknown")
    _evidence_binding(maps["idealToClass"], "ideal-to-class binding")
    _evidence_binding(maps["principality"], "principality binding")
    if maps["verified"] is not True:
        raise ValueError("map result is not producer-verified")


def _validate_units(value: Any) -> None:
    units = _exact_keys(
        value,
        {
            "scope",
            "rank",
            "torsionOrder",
            "compactGenerators",
            "regulator",
            "saturation",
            "completeForClaim",
        },
        "unit result",
    )
    if units["scope"] not in (
        "completion-only",
        "compact-complete",
        "expanded-complete",
    ):
        raise ValueError("unit scope is unknown")
    _nonnegative_integer(units["rank"], "unit rank")
    _integer_string(units["torsionOrder"], "unit torsion order", positive=True)
    generators = units["compactGenerators"]
    if not isinstance(generators, (list, tuple)):
        raise TypeError("compact unit generators must be an array")
    for index, entry in enumerate(generators):
        _evidence_binding(entry, f"compact unit generator {index}")
    _evidence_binding(units["regulator"], "unit regulator binding")
    _evidence_binding(units["saturation"], "unit saturation binding")
    if units["completeForClaim"] is not True:
        raise ValueError("unit result is not complete for its claim")


class PortableResultEvidence(_Sealed):
    """Frozen canonical `result-evidence-v1` plus detached components."""

    __slots__ = (
        "boundary",
        "raw",
        "attachments",
        "invariant_factors",
        "class_number",
        "generator_ideal_payloads",
        "portable_claim_status",
        "proof_status",
        "presentation_id",
        "generator_map_id",
        "_canonical_raw",
    )

    def __init__(
        self,
        boundary: TrustedBoundary,
        raw: Any,
        attachment_payloads: Mapping[str, Any],
    ) -> None:
        super().__init__()
        if type(boundary) is not TrustedBoundary:
            raise TypeError("the result parser requires an exact TrustedBoundary")
        boundary.verify_live_identity()
        frozen = _deep_frozen_copy(raw)
        top = _exact_keys(
            frozen,
            {
                "schema",
                "resultId",
                "inputId",
                "fieldId",
                "outcome",
                "requestedProof",
                "claim",
                "classGroup",
                "maps",
                "units",
                "evidence",
                "resourceUse",
                "implementation",
                "failure",
            },
            "result evidence",
        )
        if top["schema"] != RESULT_EVIDENCE_SCHEMA or top["outcome"] != "completed":
            raise ValueError("the adapter requires completed result-evidence-v1")
        _sha256(top["resultId"], "result ID", content_id=True)
        if top["inputId"] != boundary.prepared_input_id:
            raise ValueError("the result is not bound to the canonical prepared input")
        if top["fieldId"] != boundary.field_id:
            raise ValueError("the result is not bound to the live number field")
        if top["requestedProof"] != boundary.requested_proof:
            raise ValueError("the result changed the requested proof mode")
        if top["failure"] is not None:
            raise ValueError("a completed result must not contain a failure")

        implementation = _exact_keys(
            top["implementation"],
            {
                "backend",
                "version",
                "artifactSha256",
                "linksPari",
                "usesOracleInput",
            },
            "implementation",
        )
        if (
            implementation["backend"] != "sagejs-rust-class-group"
            or implementation["artifactSha256"] != boundary.loaded_artifact_sha256
            or implementation["linksPari"] is not False
            or implementation["usesOracleInput"] is not False
        ):
            raise ValueError(
                "the implementation does not match the loaded Rust artifact"
            )
        _nonempty(implementation["version"], "implementation version")

        resource_use = _exact_keys(
            top["resourceUse"],
            {"wallNanoseconds", "peakLiveBytes", "peakRssBytes", "retries"},
            "resource use",
        )
        for key in ("wallNanoseconds", "peakLiveBytes", "peakRssBytes"):
            _unsigned_decimal(resource_use[key], "resource use " + key)
        _nonnegative_integer(resource_use["retries"], "resource retries")

        claim = top["claim"]
        if not isinstance(claim, Mapping):
            raise TypeError("a completed result needs a claim")
        status = claim.get("status")
        if status not in (CANDIDATE, UPSTREAM_ASSUMED, PUBLICLY_COMPLETE):
            raise ValueError("the producer claim has an unknown status")
        if status == PUBLICLY_COMPLETE:
            _exact_keys(
                claim,
                {
                    "status",
                    "publicComplete",
                    "proofAuthority",
                    "proofMode",
                    "verificationSha256",
                },
                "public producer claim",
            )
            if claim.get("publicComplete") is not True:
                raise ValueError("the producer public claim is inconsistent")
            if claim.get("proofMode") != boundary.requested_proof:
                raise ValueError("the producer public claim changed proof mode")
            if claim.get("proofAuthority") != boundary.requested_proof:
                raise ValueError("the producer public claim changed proof authority")
            _sha256(claim.get("verificationSha256"), "verification digest")
            if not isinstance(top["maps"], Mapping) or not isinstance(
                top["units"], Mapping
            ):
                raise ValueError(
                    "a portable public claim needs canonical map and unit records"
                )
        elif status == CANDIDATE:
            _exact_keys(
                claim,
                {"status", "publicComplete", "proofAuthority", "reason"},
                "candidate producer claim",
            )
            if (
                claim.get("publicComplete") is not False
                or claim.get("proofAuthority") != "none"
                or not isinstance(claim.get("reason"), str)
                or claim.get("reason") == ""
            ):
                raise ValueError("the candidate producer claim is inconsistent")
        else:
            _exact_keys(
                claim,
                {
                    "status",
                    "publicComplete",
                    "proofAuthority",
                    "reason",
                    "upstream",
                    "assumptionsSha256",
                },
                "upstream producer claim",
            )
            if (
                claim.get("publicComplete") is not False
                or claim.get("proofAuthority") != "upstream-assumption"
                or not isinstance(claim.get("reason"), str)
                or claim.get("reason") == ""
            ):
                raise ValueError("the upstream producer claim is inconsistent")
            _sha256(claim.get("assumptionsSha256"), "upstream assumptions digest")
            upstream = _exact_keys(
                claim.get("upstream"),
                {"project", "version", "sourceSha256", "algorithm"},
                "upstream identity",
            )
            if upstream["project"] != "PARI" or upstream["version"] != "2.17.4":
                raise ValueError("the upstream identity is not the qualified PARI")
            _sha256(upstream["sourceSha256"], "upstream source digest")
            _nonempty(upstream["algorithm"], "upstream algorithm")

        class_group = _exact_keys(
            top["classGroup"],
            {"classNumber", "invariantFactors", "generatorIdeals"},
            "class-group candidate",
        )
        invariants = _invariants(class_group["invariantFactors"], "invariant factors")
        class_number = _integer_string(
            class_group["classNumber"], "class number", positive=True
        )
        product = 1
        for invariant in invariants:
            product *= invariant
        if product != class_number:
            raise ArithmeticError("the invariant factors have the wrong product")
        ideals = class_group["generatorIdeals"]
        if not isinstance(ideals, tuple) or len(ideals) != len(invariants):
            raise ValueError("the result needs one generator ideal per invariant")
        for index, ideal in enumerate(ideals):
            _ideal(ideal, f"generator ideal {index}")

        evidence = _bounded_keys(
            top["evidence"],
            {"relationLattice", "smith", "independentChecks"},
            {
                "relationLattice",
                "smith",
                "completion",
                "generatorsAndMaps",
                "independentChecks",
            },
            "result evidence bindings",
        )
        for key in ("relationLattice", "smith", "completion", "generatorsAndMaps"):
            if key in evidence:
                _evidence_binding(evidence[key], key + " binding")
        independent = evidence["independentChecks"]
        if not isinstance(independent, tuple) or not independent:
            raise ValueError("independent checks must be a nonempty array")
        for index, check in enumerate(independent):
            _evidence_binding(check, f"independent check {index}")

        if status == PUBLICLY_COMPLETE:
            if "completion" not in evidence or "generatorsAndMaps" not in evidence:
                raise ValueError("a public producer claim lacks public evidence")
            _validate_maps(top["maps"])
            _validate_units(top["units"])
        elif top["maps"] is not None or top["units"] is not None:
            # The canonical schema permits these producer records, so validate them
            # whenever present even though they cannot confer public authority.
            if top["maps"] is not None:
                _validate_maps(top["maps"])
            if top["units"] is not None:
                _validate_units(top["units"])

        unknown_attachments = set(attachment_payloads) - set(_ROLES)
        if unknown_attachments:
            raise ValueError("unknown detached evidence attachments")
        attachments: dict[str, EvidenceAttachment] = {}
        for role, payload in attachment_payloads.items():
            if role == UPSTREAM_CORRESPONDENCE:
                matches = tuple(
                    entry
                    for entry in independent
                    if entry.get("kind") == UPSTREAM_CORRESPONDENCE
                )
                if len(matches) != 1:
                    raise ValueError(
                        "upstream correspondence needs one independent binding"
                    )
                binding = matches[0]
            else:
                binding = evidence.get(_EVIDENCE_KEYS[role])
            if not isinstance(binding, Mapping):
                raise ValueError(role + " has no canonical result-evidence binding")
            attachments[role] = EvidenceAttachment(role, binding, payload)
        if status == UPSTREAM_ASSUMED and UPSTREAM_CORRESPONDENCE not in attachments:
            raise ValueError(
                "an upstream-assumed claim needs detached replayable correspondence"
            )

        self.boundary = boundary
        self.raw = frozen
        self.attachments = MappingProxyType(attachments)
        self.invariant_factors = invariants
        self.class_number = class_number
        self.generator_ideal_payloads = ideals
        self.portable_claim_status = status
        self.proof_status = (
            EXACT_UNCONDITIONAL
            if boundary.requested_proof == UNCONDITIONAL
            else EXACT_RELATIONS_CONDITIONAL_GRH
        )
        self._canonical_raw = _canonical_json(_thaw(frozen))
        self._verify_cross_bindings()
        self._finish()

    def _verify_cross_bindings(self) -> None:
        self.boundary.verify_live_identity()
        common: tuple[str, str] | None = None
        for role, attachment in self.attachments.items():
            attachment.verify()
            identity = _identity(attachment)
            if identity["preparedInputId"] != self.boundary.prepared_input_id:
                raise ValueError(role + " changed the prepared-input identity")
            if identity["fieldId"] != self.boundary.field_id:
                raise ValueError(role + " changed the field identity")
            if (
                _polynomial(identity["polynomialAscending"], role + " polynomial")
                != self.boundary.polynomial_ascending
            ):
                raise ValueError(role + " changed the defining polynomial")
            if identity["artifactSha256"] != self.boundary.loaded_artifact_sha256:
                raise ValueError(role + " changed the loaded artifact identity")
            pair = (
                _sha256(
                    identity["presentationId"],
                    role + " presentation ID",
                    content_id=True,
                ),
                _sha256(
                    identity["generatorMapId"],
                    role + " generator-map ID",
                    content_id=True,
                ),
            )
            if common is None:
                common = pair
            elif common != pair:
                raise ValueError(
                    "result components have inconsistent semantic identities"
                )
        resolved_ids = common or ("", "")
        if hasattr(self, "presentation_id"):
            if (self.presentation_id, self.generator_map_id) != resolved_ids:
                raise ArithmeticError(
                    "result component identities changed after parsing"
                )
        else:
            self.presentation_id, self.generator_map_id = resolved_ids

        presentation = self.attachments.get(PRESENTATION)
        if (
            presentation is not None
            and _invariants(
                presentation.payload.get("invariantFactors"),
                "presentation invariant factors",
            )
            != self.invariant_factors
        ):
            raise ArithmeticError("the compact presentation changed the invariants")
        generators = self.attachments.get(GENERATORS_MAP)
        if generators is not None:
            if (
                _invariants(
                    generators.payload.get("invariantFactors"),
                    "generator-map invariant factors",
                )
                != self.invariant_factors
            ):
                raise ArithmeticError("generator-map evidence changed the invariants")
            if (
                generators.payload.get("generatorIdeals")
                != self.generator_ideal_payloads
            ):
                raise ArithmeticError(
                    "generator-map evidence changed the generator ideals"
                )
            if generators.payload.get("mapPolicy") != "exact-witness-per-query":
                raise ValueError("generator-map evidence has no exact witness policy")
        completion = self.attachments.get(COMPLETION)
        if completion is not None:
            payload = completion.payload
            if (
                payload.get("complete") is not True
                or payload.get("proofStatus") != self.proof_status
            ):
                raise ValueError(
                    "completion evidence is incompatible with requested proof"
                )
            expected = {
                role: self.attachments[role].sha256
                for role in (RELATION_LATTICE, PRESENTATION, GENERATORS_MAP)
                if role in self.attachments
            }
            if (
                set(expected) != {RELATION_LATTICE, PRESENTATION, GENERATORS_MAP}
                or payload.get("dependencyDigests") != expected
            ):
                raise ValueError(
                    "completion evidence has missing or stale dependencies"
                )

    def verify_integrity(self) -> None:
        if _canonical_json(_thaw(self.raw)) != self._canonical_raw:
            raise ArithmeticError("the portable result changed after parsing")
        self._verify_cross_bindings()

    def to_json(self) -> str:
        """Serialize producer evidence, never a complete adapter decision."""
        if self.portable_claim_status == PUBLICLY_COMPLETE:
            raise ValueError(
                "the adapter will not serialize a producer public-complete claim"
            )
        return self._canonical_raw

    @classmethod
    def from_json(
        cls,
        text: str,
        attachment_payloads: Mapping[str, Any],
        boundary: TrustedBoundary,
    ) -> "PortableResultEvidence":
        return cls(boundary, _strict_json(text), attachment_payloads)


class ReplayRequest(_Sealed):
    __slots__ = (
        "boundary",
        "role",
        "payload",
        "sha256",
        "presentation_id",
        "generator_map_id",
        "_identity",
    )

    def __init__(
        self,
        token: object,
        evidence: PortableResultEvidence,
        attachment: EvidenceAttachment,
    ) -> None:
        super().__init__()
        if token is not _REQUEST_TOKEN:
            raise TypeError("ReplayRequest is adapter-owned")
        self.boundary = evidence.boundary
        self.role = attachment.role
        self.payload = attachment.payload
        self.sha256 = attachment.sha256
        self.presentation_id = evidence.presentation_id
        self.generator_map_id = evidence.generator_map_id
        self._identity = evidence.boundary._identity
        self._finish()


class _PresentationMaterial(_Sealed):
    __slots__ = ("presentation",)

    def __init__(self, presentation: Any) -> None:
        super().__init__()
        self.presentation = presentation
        self._finish()


class _GeneratorMapMaterial(_Sealed):
    __slots__ = ("generator_ideals", "ideal_log")

    def __init__(self, generator_ideals: Sequence[Any], ideal_log: Any) -> None:
        super().__init__()
        self.generator_ideals = tuple(generator_ideals)
        self.ideal_log = ideal_log
        self._finish()


class _CompletionMaterial(_Sealed):
    __slots__ = ("proof_record", "proof_context", "unit_completion_evidence")

    def __init__(
        self, proof_record: Any, proof_context: Any, unit_completion_evidence: Any
    ) -> None:
        super().__init__()
        self.proof_record = proof_record
        self.proof_context = proof_context
        self.unit_completion_evidence = unit_completion_evidence
        self._finish()


class _RelationMaterial(_Sealed):
    __slots__ = ("relation_lattice",)

    def __init__(self, relation_lattice: Any) -> None:
        super().__init__()
        self.relation_lattice = relation_lattice
        self._finish()


class _UpstreamMaterial(_Sealed):
    __slots__ = ("correspondence",)

    def __init__(self, correspondence: Any) -> None:
        super().__init__()
        self.correspondence = correspondence
        self._finish()


class ReplayAcceptance(_Sealed):
    __slots__ = (
        "role",
        "sha256",
        "prepared_input_id",
        "field_id",
        "polynomial_ascending",
        "artifact_sha256",
        "presentation_id",
        "generator_map_id",
        "live_value",
        "_identity",
    )

    def __init__(self, token: object, request: ReplayRequest, live_value: Any) -> None:
        super().__init__()
        if token is not _ACCEPTANCE_TOKEN:
            raise TypeError(
                "ReplayAcceptance must be created by a role-specific acceptor"
            )
        self.role = request.role
        self.sha256 = request.sha256
        self.prepared_input_id = request.boundary.prepared_input_id
        self.field_id = request.boundary.field_id
        self.polynomial_ascending = request.boundary.polynomial_ascending
        self.artifact_sha256 = request.boundary.loaded_artifact_sha256
        self.presentation_id = request.presentation_id
        self.generator_map_id = request.generator_map_id
        self.live_value = live_value
        self._identity = request._identity
        self._finish()


def accept_relation_lattice(
    request: ReplayRequest, relation_lattice: Any
) -> ReplayAcceptance:
    if (
        type(request) is not ReplayRequest
        or request.role != RELATION_LATTICE
        or relation_lattice is None
    ):
        raise TypeError("relation-lattice replay acceptance is invalid")
    return ReplayAcceptance(
        _ACCEPTANCE_TOKEN, request, _RelationMaterial(relation_lattice)
    )


def accept_presentation(request: ReplayRequest, presentation: Any) -> ReplayAcceptance:
    if (
        type(request) is not ReplayRequest
        or request.role != PRESENTATION
        or presentation is None
    ):
        raise TypeError("presentation replay acceptance is invalid")
    return ReplayAcceptance(
        _ACCEPTANCE_TOKEN, request, _PresentationMaterial(presentation)
    )


def accept_generators_and_maps(
    request: ReplayRequest, generator_ideals: Sequence[Any], ideal_log: Any
) -> ReplayAcceptance:
    if (
        type(request) is not ReplayRequest
        or request.role != GENERATORS_MAP
        or not callable(ideal_log)
    ):
        raise TypeError("generator-map replay acceptance is invalid")
    expected_ideals = request.payload.get("generatorIdeals")
    if not isinstance(expected_ideals, tuple) or len(generator_ideals) != len(
        expected_ideals
    ):
        raise ValueError("generator-map replay returned the wrong generator count")
    return ReplayAcceptance(
        _ACCEPTANCE_TOKEN,
        request,
        _GeneratorMapMaterial(generator_ideals, ideal_log),
    )


def accept_completion(
    request: ReplayRequest,
    proof_record: Any,
    proof_context: Any,
    unit_completion_evidence: Any,
) -> ReplayAcceptance:
    if (
        type(request) is not ReplayRequest
        or request.role != COMPLETION
        or proof_record is None
        or proof_context is None
        or unit_completion_evidence is None
    ):
        raise TypeError("completion replay acceptance is invalid")
    return ReplayAcceptance(
        _ACCEPTANCE_TOKEN,
        request,
        _CompletionMaterial(proof_record, proof_context, unit_completion_evidence),
    )


def accept_upstream_correspondence(
    request: ReplayRequest, correspondence: Any
) -> ReplayAcceptance:
    if (
        type(request) is not ReplayRequest
        or request.role != UPSTREAM_CORRESPONDENCE
        or correspondence is None
    ):
        raise TypeError("upstream correspondence replay acceptance is invalid")
    return ReplayAcceptance(
        _ACCEPTANCE_TOKEN, request, _UpstreamMaterial(correspondence)
    )


class VerifiedPublicMaterial(_Sealed):
    __slots__ = (
        "relation_lattice",
        "presentation",
        "generator_ideals",
        "ideal_log",
        "proof_record",
        "proof_context",
        "unit_completion_evidence",
        "_identity",
    )

    def __init__(self, token: object, accepted: Mapping[str, ReplayAcceptance]) -> None:
        super().__init__()
        if token is not _MATERIAL_TOKEN:
            raise TypeError("VerifiedPublicMaterial is adapter-owned")
        self.relation_lattice = accepted[RELATION_LATTICE].live_value.relation_lattice
        self.presentation = accepted[PRESENTATION].live_value.presentation
        self.generator_ideals = accepted[GENERATORS_MAP].live_value.generator_ideals
        self.ideal_log = accepted[GENERATORS_MAP].live_value.ideal_log
        self.proof_record = accepted[COMPLETION].live_value.proof_record
        self.proof_context = accepted[COMPLETION].live_value.proof_context
        self.unit_completion_evidence = accepted[
            COMPLETION
        ].live_value.unit_completion_evidence
        self._identity = accepted[PRESENTATION]._identity
        self._finish()


class BuiltPublicResult(_Sealed):
    __slots__ = ("computation", "_material")

    def __init__(
        self,
        token: object,
        material: VerifiedPublicMaterial,
        computation: Any,
    ) -> None:
        super().__init__()
        if token is not _BUILT_TOKEN:
            raise TypeError("BuiltPublicResult must be created by seal_public_result")
        self.computation = computation
        self._material = material
        self._finish()


def seal_public_result(
    material: VerifiedPublicMaterial, computation: Any
) -> BuiltPublicResult:
    if type(material) is not VerifiedPublicMaterial:
        raise TypeError("a public result must consume exact verified material")
    return BuiltPublicResult(_BUILT_TOKEN, material, computation)


def _incomplete(
    evidence: PortableResultEvidence, accepted: Mapping[str, ReplayAcceptance]
) -> Any:
    boundary = evidence.boundary
    adapter_status = (
        UPSTREAM_ASSUMED
        if evidence.portable_claim_status == UPSTREAM_ASSUMED
        and UPSTREAM_CORRESPONDENCE in accepted
        else CANDIDATE
    )
    answer = ClassUnitComputation(
        boundary.live_field,
        proof_status=INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason="Rust class-group evidence is not publicly complete",
        algorithm="rust-class-group-qualification",
        stages=(),
        tentative_invariants=evidence.invariant_factors,
        diagnostics={
            "schema": "sagejs.rust-class-group/public-adapter-diagnostics-v1",
            "adapterStatus": adapter_status,
            "portableClaimStatus": evidence.portable_claim_status,
            "acceptedRoles": tuple(sorted(accepted)),
            "publicComplete": False,
        },
    )
    if type(answer) is not ClassUnitComputation or answer.complete is not False:
        raise TypeError("the incomplete adapter result has the wrong exact type")
    return answer


def _validate_acceptance(
    evidence: PortableResultEvidence,
    role: str,
    attachment: EvidenceAttachment,
    acceptance: Any,
) -> ReplayAcceptance:
    if type(acceptance) is not ReplayAcceptance:
        raise TypeError(role + " replay returned an unsealed result")
    if (
        acceptance.role != role
        or acceptance.sha256 != attachment.sha256
        or acceptance.prepared_input_id != evidence.boundary.prepared_input_id
        or acceptance.field_id != evidence.boundary.field_id
        or acceptance.polynomial_ascending != evidence.boundary.polynomial_ascending
        or acceptance.artifact_sha256 != evidence.boundary.loaded_artifact_sha256
        or acceptance.presentation_id != evidence.presentation_id
        or acceptance.generator_map_id != evidence.generator_map_id
        or acceptance._identity is not evidence.boundary._identity
    ):
        raise ArithmeticError(role + " replay returned evidence for another result")
    expected_material = {
        RELATION_LATTICE: _RelationMaterial,
        PRESENTATION: _PresentationMaterial,
        GENERATORS_MAP: _GeneratorMapMaterial,
        COMPLETION: _CompletionMaterial,
        UPSTREAM_CORRESPONDENCE: _UpstreamMaterial,
    }[role]
    if type(acceptance.live_value) is not expected_material:
        raise TypeError(role + " replay returned the wrong sealed material")
    return acceptance


def _validate_complete_result(
    evidence: PortableResultEvidence,
    material: VerifiedPublicMaterial,
    built: Any,
) -> Any:
    boundary = evidence.boundary
    if type(built) is not BuiltPublicResult or built._material is not material:
        raise TypeError("the builder did not consume the supplied verified material")
    computation = built.computation
    if type(computation) is not ClassUnitComputation:
        raise TypeError("the builder returned the wrong exact computation type")
    if computation.field is not boundary.live_field or computation.complete is not True:
        raise ArithmeticError("the builder changed the live field or completion state")
    if computation.proof_status != evidence.proof_status:
        raise ArithmeticError("the builder changed the requested proof authority")
    group = computation.class_group()
    if type(group) is not IdealClassGroup:
        raise TypeError("the builder returned the wrong exact class-group type")
    if (
        tuple(group.invariants()) != evidence.invariant_factors
        or int(group.order()) != evidence.class_number
    ):
        raise ArithmeticError("the live class group changed the checked presentation")
    if group.proof_status != evidence.proof_status or group.verify() is not True:
        raise ArithmeticError("the live class group failed its proof contract")
    if getattr(group, "_presentation_evidence", None) is not material.presentation:
        raise ArithmeticError(
            "the live class group did not consume the checked presentation"
        )
    actual_ideals = tuple(group.gens_ideals())
    if len(actual_ideals) != len(material.generator_ideals) or any(
        actual is not expected
        for actual, expected in zip(
            actual_ideals, material.generator_ideals, strict=True
        )
    ):
        raise ArithmeticError(
            "the live class group did not consume the checked generator ideals"
        )
    if getattr(group, "_ideal_log", None) is not material.ideal_log:
        raise ArithmeticError(
            "the live class group did not consume the checked ideal map"
        )
    if group.proof_record is not material.proof_record:
        raise ArithmeticError(
            "the live class group did not consume the checked completion proof"
        )
    if getattr(group, "_proof_context", None) is not material.proof_context:
        raise ArithmeticError(
            "the live class group did not consume the checked proof context"
        )
    if (
        getattr(material.proof_context, "relation_lattice", None)
        is not material.relation_lattice
    ):
        raise ArithmeticError(
            "the completion proof context did not consume the replayed relation lattice"
        )
    unit_group = computation.unit_group()
    if (
        type(unit_group) is not UnitGroupComputation
        or getattr(unit_group, "_completion_evidence", None)
        is not material.unit_completion_evidence
        or getattr(material.unit_completion_evidence, "_field", None)
        is not boundary.live_field
        or unit_group.proof_status != evidence.proof_status
        or getattr(unit_group, "complete", None) is not True
        or unit_group.verify_completion() is not True
    ):
        raise ArithmeticError(
            "the class/unit result has no complete verified unit group"
        )
    return computation


def adapt_public_result(
    evidence: PortableResultEvidence,
    replayers: Mapping[str, Callable[[ReplayRequest], ReplayAcceptance]],
    *,
    builder: Callable[[VerifiedPublicMaterial], BuiltPublicResult] | None = None,
) -> Any:
    """Return an existing `ClassUnitComputation` contract, never a parallel group."""
    if type(evidence) is not PortableResultEvidence:
        raise TypeError("the adapter requires exact PortableResultEvidence")
    evidence.verify_integrity()
    accepted: dict[str, ReplayAcceptance] = {}
    for role in _ROLES:
        attachment = evidence.attachments.get(role)
        callback = replayers.get(role)
        if attachment is None or callback is None:
            continue
        request = ReplayRequest(_REQUEST_TOKEN, evidence, attachment)
        acceptance = callback(request)
        # A hostile callback cannot switch the publication target.
        evidence.verify_integrity()
        accepted[role] = _validate_acceptance(evidence, role, attachment, acceptance)
    if not set(_PUBLIC_ROLES) <= set(accepted) or builder is None:
        evidence.verify_integrity()
        return _incomplete(evidence, accepted)

    material = VerifiedPublicMaterial(_MATERIAL_TOKEN, accepted)
    built = builder(material)
    # Final time-of-check/time-of-publication barrier.
    evidence.verify_integrity()
    answer = _validate_complete_result(evidence, material, built)
    evidence.verify_integrity()
    return answer


__all__ = [
    "BuiltPublicResult",
    "CANDIDATE",
    "COMPLETION",
    "CONDITIONAL_GRH",
    "EXACT_RELATIONS_CONDITIONAL_GRH",
    "EXACT_UNCONDITIONAL",
    "GENERATORS_MAP",
    "PRESENTATION",
    "PUBLICLY_COMPLETE",
    "PortableResultEvidence",
    "RELATION_LATTICE",
    "ReplayAcceptance",
    "ReplayRequest",
    "TrustedBoundary",
    "UNCONDITIONAL",
    "UPSTREAM_ASSUMED",
    "UPSTREAM_CORRESPONDENCE",
    "VerifiedPublicMaterial",
    "accept_completion",
    "accept_generators_and_maps",
    "accept_presentation",
    "accept_relation_lattice",
    "accept_upstream_correspondence",
    "adapt_public_result",
    "component_sha256",
    "seal_public_result",
    "trusted_boundary",
]
