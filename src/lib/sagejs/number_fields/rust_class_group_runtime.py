# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

"""Proof-aware synchronous dispatch for the Rust cubic class-group service.

The transport is deliberately coarse. `sagejs.runtime.class_group_backend()`
returns one object exposing `call(operation, request) -> dict`; this module owns request construction,
typed decline semantics, resident-session lifetime, independent publication
replay, and the unconditional Sage.js suffix.  No transport callback or Rust
object enters an authority-bearing receipt.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime
from sagejs.kernels.matrix.imaginary_map import validate_packed_imaginary_map


HOST_RESPONSE_SCHEMA = "sagejs.class-groups/service-response-v1"
MATHEMATICAL_REQUEST_SCHEMA = "sagejs.rust-class-group/public-cubic-e2e-request-v2"
IDEAL_QUERY_RECEIPT_SCHEMA = (
    "sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1"
)
COMPACT_SUMMARY_SCHEMA = "sagejs.class-groups/compact-summary-v1"
IMAGINARY_GROUP_SCHEMA = "sagejs.rust-class-group/complete-imaginary-quadratic-v2"

EXACT_UNCONDITIONAL = "exact-unconditional"
EXACT_RELATIONS_CONDITIONAL_GRH = "exact-relations-conditional-grh"

_DEFAULT_RESOURCES = {
    "maximumTrialDivisor": 10_000,
    "maximumIrreducibilityPrime": 257,
    "embeddingPrecisionBits": 192,
    "maximumVisitedIdeals": 1_000_000,
    "maximumCandidates": 1_000_000,
    "maximumNormalFormEntries": 10_000_000,
    "maximumNormalFormOperations": 50_000_000,
    "maximumRelationExponent": 256,
    "maximumVerificationMultiplyAdds": 100_000_000,
    "maximumPrincipalFactorTerms": 10_000_000,
    "maximumCompactGenerators": 16_384,
    "maximumCompactSurplusRows": 64,
    "maximumCompactSaturationMinorTrials": 32_768,
    "maximumCompactDependencyEntries": 1_000_000,
    "maximumCompactTargetCoefficientBits": 1_000_000,
    # These are ceilings, not eager working precisions. The service starts at
    # its lower adaptive levels, while hard real cubic fields such as row-6
    # need the higher ceiling to make the independently replayed regulator
    # enclosure overlap rigorously.
    "logarithmPrecisionBits": 8_192,
    "replayPrecisionBits": 4_096,
    "analyticPrecisionBits": 512,
    "maximumRelations": 10_000,
    "maximumDependencies": 1_000,
    "maximumKernelCoefficientBits": 4_080,
    "maximumUnitExponentBits": 8_192,
    "maximumReconstructionDenominatorBits": 4_096,
    "maximumAnalyticThreshold": 23_994,
}

_DEFAULT_QUERY_RESOURCES = {
    "embeddingPrecisionBits": 192,
    "maximumCandidates": 1_000_000,
    "maximumValuation": 256,
}


class RustClassGroupCapabilityDecline(NotImplementedError):
    """A typed pre-publication decline on which `algorithm="auto"` may fall back."""


class RustClassGroupServiceError(RuntimeError):
    """A non-fallback operational failure reported by the installed service."""

    def __init__(self, category: str, message: str) -> None:
        super().__init__(message)
        self.category = category


class RustClassGroupPublicationError(ArithmeticError):
    """A claimed Rust success which failed host validation or exact replay."""


def _canonical_sha256(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise RustClassGroupPublicationError(label + " is not a canonical SHA-256")
    return value


def _nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or value == "":
        raise RustClassGroupPublicationError(label + " must be a nonempty string")
    return value


def _positive_decimal(value: Any, label: str) -> str:
    value = _nonempty_string(value, label)
    if not value.isdigit() or value.startswith("0"):
        raise RustClassGroupPublicationError(
            label + " must be a canonical positive decimal integer"
        )
    return value


def _response(value: Any, operation: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RustClassGroupPublicationError(
            "the Rust class-group " + operation + " response is not a dictionary"
        )
    schema = value.get("schema")
    if (
        schema != HOST_RESPONSE_SCHEMA
        and not (operation == "query" and schema == IDEAL_QUERY_RECEIPT_SCHEMA)
        and not (operation == "summary" and schema == COMPACT_SUMMARY_SCHEMA)
    ):
        raise RustClassGroupPublicationError(
            "the Rust class-group " + operation + " response has the wrong schema"
        )
    outcome = value.get("outcome")
    if outcome in ("declined", "error"):
        category = value.get("category")
        message = str(value.get("message", "Rust class-group capability declined"))
        if category == "capability-declined":
            raise RustClassGroupCapabilityDecline(message)
        raise RustClassGroupServiceError(str(category), message)
    return value


def _call(backend: Any, operation: str, request: dict[str, Any]) -> dict[str, Any]:
    return _response(backend.call(operation, request), operation)


def _imaginary_host_call(operation: str, request: dict[str, Any]) -> dict[str, Any]:
    """Decode a resident service response without reparsing its JSON document.

    The worker's Rust loader has already parsed and checked its JSON envelope.
    This narrowly scoped host boundary accepts only safe integer scalars and
    creates ordinary Python lists/dictionaries in one native traversal.
    """
    host = runtime.reflect.get(runtime.global_object, "__sagejs_host__")
    encoded = runtime.canonical_json_exact(request)
    if not isinstance(encoded, str):
        raise TypeError("imaginary class-group request must be exact JSON data")
    envelope = runtime.reflect.apply(
        runtime.reflect.get(host, "call"),
        host,
        [
            "classGroupCompact"
            if operation == "imaginary-class-group"
            and runtime.strict_equal(
                runtime.reflect.get(host, "classGroupCompactTransport"), True
            )
            else "classGroup",
            [operation, runtime.json.parse(encoded)],
        ],
    )
    if not runtime.reflect.get(envelope, "ok"):
        error = runtime.reflect.get(envelope, "error")
        exception = RuntimeError(runtime.reflect.get(error, "message"))
        exception.code = runtime.reflect.get(error, "code")
        raise exception
    conversion = runtime.reflect.get(runtime.global_object, "ρσ_plain_json_to_python")
    result = runtime.reflect.apply(
        conversion, runtime.undefined, [runtime.reflect.get(envelope, "value")]
    )
    return _response(result, operation)


def _capability(backend: Any) -> dict[str, Any]:
    value = backend.call("capability", {})
    if not isinstance(value, dict):
        raise RustClassGroupPublicationError(
            "the Rust class-group capability response is not a dictionary"
        )
    if value.get("schema") == HOST_RESPONSE_SCHEMA:
        return _response(value, "capability")
    available = value.get("available")
    if available is False:
        raise RustClassGroupCapabilityDecline(
            str(value.get("reason", "the Rust class-group capability is unavailable"))
        )
    if available is True:
        return {
            "schema": HOST_RESPONSE_SCHEMA,
            "outcome": "available",
            "artifactSha256": value.get("artifactSha256"),
        }
    raise RustClassGroupPublicationError(
        "the Rust class-group capability response has the wrong schema"
    )


def _imaginary_backend(backend: Any = None) -> tuple[Any, dict[str, Any], bool]:
    if backend is None:
        try:
            backend = runtime.class_group_backend()
        except (AttributeError, ImportError, NotImplementedError) as error:
            raise RustClassGroupCapabilityDecline(
                "the Rust class-group service is not installed"
            ) from error
    if backend is None or not callable(getattr(backend, "call", None)):
        raise RustClassGroupCapabilityDecline(
            "the Rust class-group service is not installed"
        )
    resident_host = getattr(backend, "_backend", None)
    use_resident_host = resident_host is not None and runtime.strict_equal(
        resident_host, runtime.reflect.get(runtime.global_object, "__sagejs_host__")
    )
    capability = (
        _imaginary_host_call("capability", {})
        if use_resident_host
        else _capability(backend)
    )
    imaginary = capability.get("imaginaryQuadratic")
    if (
        capability.get("outcome") != "available"
        or not isinstance(imaginary, dict)
        or imaginary.get("proofMode") != "unconditional"
    ):
        raise RustClassGroupCapabilityDecline(
            "the installed Rust service does not advertise unconditional imaginary quadratic groups"
        )
    _canonical_sha256(capability.get("artifactSha256"), "capability artifact identity")
    return backend, imaginary, use_resident_host


def _imaginary_polynomial(field: Any) -> tuple[int, list[str]]:
    if int(field.degree()) != 2:
        raise RustClassGroupCapabilityDecline(
            "the Rust imaginary quadratic service requires an imaginary quadratic field"
        )
    discriminant = int(field.discriminant())
    if discriminant >= 0:
        raise RustClassGroupCapabilityDecline(
            "the Rust imaginary quadratic service requires an imaginary quadratic field"
        )
    if discriminant % 4 not in (0, 1):
        raise RustClassGroupPublicationError(
            "the field has an invalid quadratic discriminant"
        )
    if discriminant % 4 == 1:
        polynomial = [(1 - discriminant) // 4, -1, 1]
    else:
        polynomial = [-discriminant // 4, 0, 1]
    return discriminant, [str(value) for value in polynomial]


def rust_imaginary_result(
    field: Any,
    *,
    operation: str,
    algorithm: str = "auto",
    options: dict[str, Any] | None = None,
    backend: Any = None,
) -> dict[str, Any] | None:
    """Return an unconditional coefficient-bound imaginary quadratic receipt.

    Automatic selection uses the unconditional Rust service when available.
    An unsupported field or resource decline retains the established route;
    a malformed published result remains an error rather than a fallback.
    """
    if algorithm not in ("auto", "rust") or int(field.degree()) != 2:
        return None
    if options is not None and len(options) != 0:
        if algorithm == "rust":
            raise RustClassGroupCapabilityDecline(
                "algorithm='rust' does not accept execution-control overrides"
            )
        return None
    if operation not in ("imaginary-class-number", "imaginary-class-group"):
        raise ValueError("unknown imaginary quadratic Rust operation")
    try:
        discriminant, polynomial = _imaginary_polynomial(field)
        backend, capability, use_resident_host = _imaginary_backend(backend)
    except RustClassGroupCapabilityDecline:
        if algorithm == "auto":
            return None
        raise
    if operation not in capability.get("operations", ()):
        raise RustClassGroupCapabilityDecline(
            "the installed Rust service does not support " + operation
        )
    maximum = capability.get("maximumAbsoluteDiscriminant")
    if not isinstance(maximum, int) or maximum <= 0:
        raise RustClassGroupPublicationError(
            "the Rust service did not publish an imaginary discriminant bound"
        )
    if -discriminant > maximum:
        if algorithm == "auto":
            return None
        raise RustClassGroupCapabilityDecline(
            "the imaginary quadratic discriminant exceeds the Rust service bound"
        )
    request = {"polynomialAscending": polynomial}
    transports = capability.get("transports")
    if (
        operation == "imaginary-class-group"
        and isinstance(transports, list)
        and "core-v2" in transports
    ):
        request["transport"] = "core-v2"
    try:
        answer = (
            _imaginary_host_call(operation, request)
            if use_resident_host
            else _call(backend, operation, request)
        )
    except RustClassGroupCapabilityDecline:
        if algorithm == "auto":
            return None
        raise
    except RustClassGroupServiceError as error:
        if algorithm == "auto" and error.category == "resource-exhausted":
            return None
        raise
    if answer.get("outcome") != "complete" or answer.get("operation") != operation:
        raise RustClassGroupPublicationError(
            "the Rust imaginary quadratic response did not complete the requested operation"
        )
    result = answer.get("result")
    if (
        not isinstance(result, dict)
        or result.get("discriminant") != discriminant
        or result.get("proofStatus") != "unconditional-complete"
        or not isinstance(result.get("classNumber"), int)
        or result["classNumber"] < 1
    ):
        raise RustClassGroupPublicationError("the Rust imaginary result is malformed")
    core_map = "completeClassMapCorePacked" in result
    packed_map = "completeClassMapPacked" in result
    if operation == "imaginary-class-group" and (
        result.get("schema") != IMAGINARY_GROUP_SCHEMA
        or result.get("polynomialAscending") != [int(value) for value in polynomial]
        or result.get("runtimeUsesPariOrFixtureAnswers") is not False
        or (core_map and packed_map)
        or (
            (core_map or packed_map)
            and result.get("completeClassMapLength") != result["classNumber"]
        )
        or (
            not (core_map or packed_map)
            and (
                not isinstance(result.get("completeClassMap"), list)
                or len(result["completeClassMap"]) != result["classNumber"]
            )
        )
    ):
        raise RustClassGroupPublicationError(
            "the Rust imaginary group omitted its complete class map"
        )
    return result


def _plain_gcd(left: int, right: int) -> int:
    left, right = abs(left), abs(right)
    while right:
        left, right = right, left % right
    return left


def _imaginary_form_data(value: Any, discriminant: int) -> tuple[int, int, int]:
    if not isinstance(value, dict):
        raise RustClassGroupPublicationError("the Rust class map has a malformed form")
    try:
        a, b, c = value["a"], value["b"], value["c"]
    except KeyError as error:
        raise RustClassGroupPublicationError(
            "the Rust class map has a malformed form"
        ) from error
    return _imaginary_form_values(a, b, c, discriminant)


def _imaginary_form_values(
    a: Any, b: Any, c: Any, discriminant: int
) -> tuple[int, int, int]:
    absolute_b = abs(b) if type(b) is int else 0
    if (
        type(a) is not int
        or type(b) is not int
        or type(c) is not int
        or a <= 0
        or absolute_b > a
        or a > c
        or ((absolute_b == a or a == c) and b < 0)
        or b * b - 4 * a * c != discriminant
        or _plain_gcd(_plain_gcd(a, b), c) != 1
    ):
        raise RustClassGroupPublicationError(
            "the Rust class map contains a nonreduced form"
        )
    return a, b, c


def _imaginary_map_row(entry: Any, rank: int) -> list[Any]:
    """Project the ordinary service fixture into the validated packed row shape."""
    if not isinstance(entry, dict):
        raise RustClassGroupPublicationError("the Rust class map has a malformed entry")
    form = entry.get("form")
    inverse = entry.get("inverseForm")
    ideal = entry.get("representativeIdeal")
    columns = ideal.get("basisColumns") if isinstance(ideal, dict) else None
    vector = entry.get("coordinates")
    if (
        not isinstance(form, dict)
        or len(form) != 3
        or not isinstance(inverse, dict)
        or len(inverse) != 3
        or not isinstance(ideal, dict)
        or len(ideal) != 2
        or not isinstance(columns, list)
        or len(columns) != 2
        or not all(isinstance(column, list) and len(column) == 2 for column in columns)
        or not isinstance(vector, list)
        or len(vector) != rank
    ):
        raise RustClassGroupPublicationError("the Rust class map has a malformed entry")
    return [
        form.get("a"),
        form.get("b"),
        form.get("c"),
        inverse.get("a"),
        inverse.get("b"),
        inverse.get("c"),
        ideal.get("norm"),
        *columns[0],
        *columns[1],
        *vector,
    ]


def validate_imaginary_group_result(
    result: dict[str, Any], discriminant: int, compact: bool = False
) -> tuple[
    list[tuple[int, int, int]], dict[str, tuple[int, ...]], list[tuple[int, int, int]]
]:
    """Check a complete form/coordinate/ideal presentation before Python binds it."""
    core = "completeClassMapCorePacked" in result
    packed = core or "completeClassMapPacked" in result
    packed_entries = (
        result.get("completeClassMapCorePacked" if core else "completeClassMapPacked")
        if packed
        else None
    )
    entry_count = (
        result.get("completeClassMapLength")
        if packed
        else len(result["completeClassMap"])
        if isinstance(result.get("completeClassMap"), list)
        else None
    )
    entries = (
        range(entry_count) if type(entry_count) is int and entry_count >= 0 else None
    )
    invariants = result.get("invariantFactors")
    generators = result.get("generators")
    certificate = result.get("certificate")
    packed_certificate = (
        isinstance(certificate, dict) and "reducedFormsPacked" in certificate
    )
    if (
        result.get("schema") != IMAGINARY_GROUP_SCHEMA
        or result.get("discriminant") != discriminant
        or entries is None
        or not isinstance(invariants, list)
        or not isinstance(generators, list)
        or (
            packed
            and (
                "completeClassMap" in result
                or (core and "completeClassMapPacked" in result)
                or not isinstance(packed_entries, list)
                or len(packed_entries)
                != entry_count * ((2 if core else 11) + len(invariants))
            )
        )
        or (not packed and not isinstance(result.get("completeClassMap"), list))
        or len(generators) != len(invariants)
        or not isinstance(certificate, dict)
        or certificate.get("discriminant") != discriminant
        or (
            packed_certificate
            and (
                "reducedForms" in certificate
                or not isinstance(certificate.get("reducedFormsPacked"), list)
                or len(certificate["reducedFormsPacked"]) != 3 * entry_count
            )
        )
        or (
            not packed_certificate
            and (
                not isinstance(certificate.get("reducedForms"), list)
                or len(certificate["reducedForms"]) != entry_count
            )
        )
    ):
        raise RustClassGroupPublicationError(
            "the Rust form certificate changed fields or structure"
        )
    order = 1
    for invariant in invariants:
        if type(invariant) is not int or invariant <= 1:
            raise RustClassGroupPublicationError(
                "the Rust invariant factors are invalid"
            )
        order *= invariant
    if order != entry_count or order != result.get("classNumber"):
        raise RustClassGroupPublicationError(
            "the Rust invariant factors do not give the class number"
        )
    linear = -1 if discriminant % 4 == 1 else 0
    principal = (1, -linear, (linear * linear - discriminant) // 4)
    forms = []
    coordinates = {}
    seen_coordinates = set()
    certified_forms = certificate[
        "reducedFormsPacked" if packed_certificate else "reducedForms"
    ]
    stride = (2 if core else 11) + len(invariants)
    if packed and packed_certificate:
        try:
            accelerated = validate_packed_imaginary_map(
                packed_entries,
                certified_forms,
                invariants,
                entry_count,
                discriminant,
                linear,
                compact,
            )
        except (TypeError, ValueError, OverflowError) as error:
            raise RustClassGroupPublicationError(
                "the Rust class map failed exact packed verification"
            ) from error
        if accelerated is not None:
            forms, coordinates = accelerated
            entries = range(0)
    for index in entries:
        if core:
            core_row = packed_entries[index * stride : (index + 1) * stride]
            if (
                any(type(value) is not int for value in core_row)
                or core_row[0] <= 0
                or (core_row[1] * core_row[1] - discriminant) % (4 * core_row[0]) != 0
            ):
                raise RustClassGroupPublicationError(
                    "the Rust class map has a malformed core row"
                )
            a, b = core_row[:2]
            c = (b * b - discriminant) // (4 * a)
            inverse_b = b if b == 0 or abs(b) == a or a == c else -b
            row = [
                a,
                b,
                c,
                a,
                inverse_b,
                c,
                a,
                a,
                0,
                (linear - b) // 2,
                1,
                *core_row[2:],
            ]
        else:
            row = (
                packed_entries[index * stride : (index + 1) * stride]
                if packed
                else _imaginary_map_row(
                    result["completeClassMap"][index], len(invariants)
                )
            )
        if any(type(value) is not int for value in row):
            raise RustClassGroupPublicationError(
                "the Rust class map has a malformed integer"
            )
        form = _imaginary_form_values(row[0], row[1], row[2], discriminant)
        a, b, c = form
        certified = (
            (
                certified_forms[3 * index],
                certified_forms[3 * index + 1],
                certified_forms[3 * index + 2],
            )
            if packed_certificate
            else certified_forms[index]
        )
        if (
            packed_certificate
            and (
                any(type(value) is not int for value in certified) or certified != form
            )
        ) or (
            not packed_certificate
            and (
                not isinstance(certified, dict)
                or len(certified) != 3
                or certified.get("a") != a
                or certified.get("b") != b
                or certified.get("c") != c
            )
        ):
            raise RustClassGroupPublicationError(
                "the Rust class map disagrees with its reduced-form certificate"
            )
        inverse_b = b if b == 0 or abs(b) == a or a == c else -b
        if row[3] != a or row[4] != inverse_b or row[5] != c:
            raise RustClassGroupPublicationError(
                "the Rust class map has a wrong inverse"
            )
        if (
            row[6] != a
            or row[7] != a
            or row[8] != 0
            or row[9] != (linear - b) // 2
            or row[10] != 1
        ):
            raise RustClassGroupPublicationError("the Rust class map has a wrong ideal")
        vector = row[11:]
        if (
            not isinstance(vector, list)
            or len(vector) != len(invariants)
            or any(
                type(value) is not int or value < 0 or value >= invariants[position]
                for position, value in enumerate(vector)
            )
        ):
            raise RustClassGroupPublicationError(
                "the Rust class map has malformed coordinates"
            )
        key = str(a) + "," + str(b) + "," + str(c)
        vector_key = tuple(vector)
        if key in coordinates or vector_key in seen_coordinates:
            raise RustClassGroupPublicationError(
                "the Rust class map repeats a class or coordinates"
            )
        coordinates[key] = vector_key
        seen_coordinates.add(vector_key)
        forms.append(form)
    if coordinates.get(",".join(str(value) for value in principal)) != tuple(
        0 for _ in invariants
    ):
        raise RustClassGroupPublicationError(
            "the Rust principal class has wrong coordinates"
        )
    generator_forms = []
    for index, generator in enumerate(generators):
        if not isinstance(generator, dict):
            raise RustClassGroupPublicationError(
                "the Rust class-group generator is malformed"
            )
        form = _imaginary_form_data(generator.get("form"), discriminant)
        key = str(form[0]) + "," + str(form[1]) + "," + str(form[2])
        expected = tuple(
            1 if position == index else 0 for position in range(len(invariants))
        )
        if (
            coordinates.get(key) != expected
            or generator.get("coordinates") != list(expected)
            or generator.get("exactOrder") != invariants[index]
            or generator.get("representativeIdeal")
            != {
                "norm": form[0],
                "basisColumns": [[form[0], 0], [(linear - form[1]) // 2, 1]],
            }
        ):
            raise RustClassGroupPublicationError(
                "the Rust generators disagree with the class map"
            )
        generator_forms.append(form)
    return forms, coordinates, generator_forms


def _mathematical_request(field: Any) -> dict[str, Any]:
    if int(field.degree()) != 3:
        raise RustClassGroupCapabilityDecline(
            "the Rust class-group service currently supports absolute cubic fields"
        )
    preparation = __import__(
        "sagejs.number_fields.rust_class_group_preparation",
        fromlist=["rust_class_group_preparation"],
    ).prepare_cubic_for_rust(field)
    polynomial = preparation["field"]["coefficientsAscending"]
    if not isinstance(polynomial, list) or len(polynomial) != 4:
        raise RustClassGroupPublicationError(
            "the certified cubic preparation has malformed coefficients"
        )
    return {
        "schema": MATHEMATICAL_REQUEST_SCHEMA,
        "polynomialAscending": list(polynomial),
        "proofMode": "conditional-grh",
        "resources": dict(_DEFAULT_RESOURCES),
    }


class RustClassGroupSession:
    """One generation-bound resident Rust result with idempotent close."""

    def __init__(
        self,
        backend: Any,
        artifact_sha256: str,
        generation: str,
        handle: str,
        completion: dict[str, Any],
    ) -> None:
        self._backend = backend
        self.artifact_sha256 = _canonical_sha256(
            artifact_sha256, "Rust class-group artifact identity"
        )
        self.generation = _positive_decimal(generation, "resident generation")
        self.handle = _positive_decimal(handle, "resident handle")
        if not isinstance(completion, dict):
            raise RustClassGroupPublicationError(
                "the Rust class-group completion receipt is malformed"
            )
        self.completion = completion
        self.closed = False

    def _request(self) -> dict[str, Any]:
        if self.closed:
            raise RustClassGroupServiceError(
                "unknown-handle", "the Rust class-group session is closed"
            )
        return {"generation": self.generation, "handle": self.handle}

    def publication(self) -> dict[str, Any]:
        answer = _call(self._backend, "publication", self._request())
        if answer.get("outcome") != "complete":
            raise RustClassGroupPublicationError(
                "the Rust publication response did not claim completion"
            )
        artifact = answer.get("artifactSha256")
        if answer.get("handle") != self.handle or (
            artifact is not None
            and _canonical_sha256(artifact, "publication artifact identity")
            != self.artifact_sha256
        ):
            raise RustClassGroupPublicationError(
                "the Rust publication response changed resident identity"
            )
        publication = answer.get("publication")
        if not isinstance(publication, dict):
            raise RustClassGroupPublicationError(
                "the Rust publication response omitted its candidate"
            )
        return publication

    def summary(self) -> dict[str, Any]:
        answer = _call(self._backend, "summary", self._request())
        if answer.get("outcome") != "complete-conditional-grh":
            raise RustClassGroupPublicationError(
                "the Rust compact summary did not claim conditional completion"
            )
        artifact = _canonical_sha256(
            answer.get("artifactSha256"), "summary artifact identity"
        )
        if artifact != self.artifact_sha256:
            raise RustClassGroupPublicationError(
                "the Rust compact summary changed resident identity"
            )
        return answer

    def query(
        self,
        ideal_integral_basis_rows: list[list[str]],
        resources: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = self._request()
        payload["idealIntegralBasisRows"] = ideal_integral_basis_rows
        payload["resources"] = (
            dict(_DEFAULT_QUERY_RESOURCES) if resources is None else dict(resources)
        )
        answer = _call(self._backend, "query", payload)
        if answer.get("outcome") not in (
            "complete",
            "complete-conditional-grh-ideal-class",
        ):
            raise RustClassGroupPublicationError(
                "the Rust ideal query did not claim completion"
            )
        receipt = answer.get("receipt", answer)
        if not isinstance(receipt, dict):
            raise RustClassGroupPublicationError(
                "the Rust ideal query omitted its exact receipt"
            )
        return receipt

    def close(self) -> None:
        if self.closed:
            return
        answer = _call(self._backend, "close", self._request())
        if answer.get("outcome") != "closed" or answer.get("handle") != self.handle:
            raise RustClassGroupPublicationError(
                "the Rust close response changed resident identity"
            )
        self.closed = True


def _open_session(field: Any, backend: Any = None) -> RustClassGroupSession:
    if backend is None:
        try:
            backend = getattr(runtime, "class_group_backend")()
        except (AttributeError, ImportError, NotImplementedError) as error:
            raise RustClassGroupCapabilityDecline(
                "the Rust class-group service is not installed"
            ) from error
    if backend is None or not callable(getattr(backend, "call", None)):
        raise RustClassGroupCapabilityDecline(
            "the Rust class-group service is not installed"
        )
    capability = _capability(backend)
    if capability.get("outcome") != "available":
        raise RustClassGroupPublicationError(
            "the Rust capability response did not claim availability"
        )
    artifact = _canonical_sha256(
        capability.get("artifactSha256"), "capability artifact identity"
    )
    opened = _call(backend, "open", {"request": _mathematical_request(field)})
    if opened.get("outcome") != "open":
        raise RustClassGroupPublicationError(
            "the Rust open response did not publish a resident result"
        )
    if (
        _canonical_sha256(opened.get("artifactSha256"), "open artifact identity")
        != artifact
    ):
        raise RustClassGroupPublicationError(
            "the Rust capability and open responses name different artifacts"
        )
    return RustClassGroupSession(
        backend,
        artifact,
        opened.get("generation"),
        opened.get("handle"),
        opened.get("completion"),
    )


def _bind_session(result: Any, session: RustClassGroupSession) -> None:
    presentation = __import__(
        "sagejs.number_fields.rust_class_group_presentation",
        fromlist=["rust_class_group_presentation"],
    )
    binder = getattr(presentation, "bind_rust_class_group_session", None)
    if callable(binder):
        binder(result, session)
        return
    result._rust_class_group_session = session
    context = getattr(result, "context", None)
    if context is not None:
        context._rust_class_group_session = session


def _adapt_compact_summary(field: Any, session: RustClassGroupSession) -> Any:
    presentation = __import__(
        "sagejs.number_fields.rust_class_group_presentation",
        fromlist=["rust_class_group_presentation"],
    )
    summary = session.summary()
    summary_identity = presentation._identity(summary)
    witness_identity = summary.get("proofWitnessesSha256")
    generator_count = len(summary.get("invariants", ()))

    def attest(payload: Any) -> bool:
        if session.closed or not isinstance(payload, dict):
            return False
        purpose = payload.get("purpose")
        coordinate = payload.get("coordinateZeroBased")
        if purpose == "generator-order-witness":
            if (
                isinstance(coordinate, bool)
                or not isinstance(coordinate, int)
                or coordinate < 0
                or coordinate >= generator_count
            ):
                return False
        elif purpose in (
            "class-group-summary",
            "conditional-class-group-proof",
            "ideal-query",
        ):
            if coordinate is not None:
                return False
        else:
            return False
        return bool(
            payload.get("schema")
            == "sagejs.rust-class-group/authenticated-service-attestation-v1"
            and payload.get("artifactSha256") == session.artifact_sha256
            and payload.get("summaryIdentity") == summary_identity
            and payload.get("proofWitnessesSha256") == witness_identity
        )

    group = presentation.adapt_rust_authenticated_service_class_group(
        field,
        summary,
        attestation_callback=attest,
        query_callback=session.query,
        query_resources=dict(_DEFAULT_QUERY_RESOURCES),
    )
    if group.ideal_order() is not field.maximal_order():
        raise RustClassGroupPublicationError(
            "the Rust compact summary changed maximal orders"
        )
    if group.proof_status != EXACT_RELATIONS_CONDITIONAL_GRH:
        raise RustClassGroupPublicationError(
            "the Rust compact summary changed proof authority"
        )
    group._rust_class_group_session = session
    group._rust_class_group_summary_identity = summary_identity
    return group


def _adapt_session(field: Any, session: RustClassGroupSession) -> Any:
    presentation = __import__(
        "sagejs.number_fields.rust_class_group_presentation",
        fromlist=["rust_class_group_presentation"],
    )
    result = presentation.adapt_rust_public_cubic_publication_candidate(
        field,
        session.publication(),
        session.artifact_sha256,
        query_callback=session.query,
        query_resources=dict(_DEFAULT_QUERY_RESOURCES),
    )
    if getattr(result, "field", None) is not field:
        raise RustClassGroupPublicationError(
            "the Rust public result changed number fields"
        )
    if getattr(result, "complete", None) is not True:
        raise RustClassGroupPublicationError(
            "a successful Rust publication did not produce complete public objects"
        )
    if getattr(result, "proof_status", None) not in (
        EXACT_RELATIONS_CONDITIONAL_GRH,
        EXACT_UNCONDITIONAL,
    ):
        raise RustClassGroupPublicationError(
            "the Rust public result has a noncanonical proof status"
        )
    _bind_session(result, session)
    return result


def _cache(field: Any) -> dict[Any, Any]:
    cache = getattr(field, "_rust_class_group_dispatch_cache", None)
    if not isinstance(cache, dict):
        cache = {}
        field._rust_class_group_dispatch_cache = cache
    return cache


def _conditional_result(field: Any, algorithm: str, backend: Any = None) -> Any:
    del algorithm
    key = False
    cache = _cache(field)
    retained = cache.get(key)
    if retained is not None:
        if (
            getattr(retained, "field", None) is field
            and getattr(retained, "complete", None) is True
            and getattr(retained, "proof_status", None)
            in (EXACT_RELATIONS_CONDITIONAL_GRH, EXACT_UNCONDITIONAL)
        ):
            return retained
        raise RustClassGroupPublicationError("the Rust conditional cache is corrupt")
    session = _open_session(field, backend)
    try:
        result = _adapt_session(field, session)
    except RustClassGroupCapabilityDecline as error:
        try:
            session.close()
        except BaseException:
            pass
        raise RustClassGroupPublicationError(
            "the Rust service declined after publishing a resident result"
        ) from error
    except BaseException:
        try:
            session.close()
        except BaseException:
            pass
        raise
    cache[key] = result
    return result


def _required_result(
    field: Any, proof: bool, algorithm: str, backend: Any = None
) -> Any:
    key = bool(proof)
    cache = _cache(field)
    retained = cache.get(key)
    if retained is not None:
        required = EXACT_UNCONDITIONAL if proof else None
        if (
            getattr(retained, "field", None) is field
            and getattr(retained, "complete", None) is True
            and (
                required is None or getattr(retained, "proof_status", None) == required
            )
        ):
            return retained
        raise RustClassGroupPublicationError("the Rust proof-policy cache is corrupt")
    source = _conditional_result(field, algorithm, backend)
    if not proof or source.proof_status == EXACT_UNCONDITIONAL:
        cache[key] = source
        return source
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    try:
        upgraded = groups._upgrade_cached_conditional_result(
            field,
            source,
            algorithm="auto",
            limits=groups.ClassUnitEngineLimits(),
            seed=0,
        )
    except RustClassGroupCapabilityDecline as error:
        raise RustClassGroupPublicationError(
            "the unconditional suffix declined after Rust publication"
        ) from error
    if (
        upgraded is None
        or getattr(upgraded, "complete", None) is not True
        or getattr(upgraded, "proof_status", None) != EXACT_UNCONDITIONAL
    ):
        raise RustClassGroupPublicationError(
            "the conditional Rust prefix did not complete the unconditional Minkowski suffix"
        )
    session = getattr(source, "_rust_class_group_session", None)
    if session is not None:
        _bind_session(upgraded, session)
    cache[key] = upgraded
    return upgraded


def rust_class_unit_context(
    field: Any,
    *,
    proof: bool | None = None,
    algorithm: str = "auto",
    options: dict[str, Any] | None = None,
    backend: Any = None,
) -> Any | None:
    """Return a Rust-backed context, or `None` after an allowed auto decline.

    `backend` is an explicit test seam. Product calls leave it unset and use
    `sagejs.runtime.class_group_backend()`.
    """
    if algorithm not in ("auto", "rust"):
        return None
    if int(field.degree()) != 3:
        if algorithm == "rust":
            raise RustClassGroupCapabilityDecline(
                "algorithm='rust' currently supports absolute cubic fields"
            )
        return None
    supplied = {} if options is None else dict(options)
    if supplied:
        if algorithm == "rust":
            raise RustClassGroupCapabilityDecline(
                "algorithm='rust' does not yet support public execution-control overrides"
            )
        return None
    proof_value = True if proof is None else bool(proof)
    try:
        return _required_result(field, proof_value, algorithm, backend)
    except RustClassGroupCapabilityDecline:
        if algorithm == "auto":
            return None
        raise


def rust_class_group(
    field: Any,
    *,
    proof: bool | None = None,
    algorithm: str = "auto",
    options: dict[str, Any] | None = None,
    backend: Any = None,
) -> Any | None:
    """Return the compact resident cubic class group when policy permits it."""
    if algorithm not in ("auto", "rust"):
        return None
    if int(field.degree()) != 3:
        return None
    supplied = {} if options is None else dict(options)
    if supplied:
        if algorithm == "rust":
            raise RustClassGroupCapabilityDecline(
                "algorithm='rust' does not yet support public execution-control overrides"
            )
        return None
    # The compact resident summary proves the class group under GRH. The
    # existing class/unit continuation remains responsible for the independent
    # unconditional Minkowski suffix.
    if proof is None or bool(proof):
        return None
    cache = getattr(field, "_rust_direct_class_group_cache", None)
    if cache is not None:
        if (
            getattr(cache, "ideal_order", lambda: None)() is field.maximal_order()
            and getattr(cache, "proof_status", None) == EXACT_RELATIONS_CONDITIONAL_GRH
        ):
            return cache
        raise RustClassGroupPublicationError(
            "the compact Rust class-group cache is corrupt"
        )
    try:
        session = _open_session(field, backend)
    except RustClassGroupCapabilityDecline:
        if algorithm == "auto":
            return None
        raise
    try:
        group = _adapt_compact_summary(field, session)
    except RustClassGroupCapabilityDecline as error:
        try:
            session.close()
        except BaseException:
            pass
        raise RustClassGroupPublicationError(
            "the Rust service declined after publishing a resident result"
        ) from error
    except BaseException:
        try:
            session.close()
        except BaseException:
            pass
        raise
    field._rust_direct_class_group_cache = group
    return group


__all__ = [
    "HOST_RESPONSE_SCHEMA",
    "IMAGINARY_GROUP_SCHEMA",
    "RustClassGroupCapabilityDecline",
    "RustClassGroupPublicationError",
    "RustClassGroupServiceError",
    "RustClassGroupSession",
    "rust_class_group",
    "rust_class_unit_context",
    "rust_imaginary_result",
    "validate_imaginary_group_result",
]
