"""Canonical, language-neutral records for numerical frontend intent.

Frontend records describe *what* a user requested before a numerical domain
chooses an algorithm or backend.  Live values such as callbacks are carried as
ephemeral bindings and are deliberately excluded from the serializable record.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping, Sequence
from typing import Any

from .._json import JSONValue, canonical_json, materialize_object

FRONTEND_SCHEMA_VERSION = 1
FRONTEND_LANGUAGES = ("sage", "python-scipy", "matlab", "wolfram")
FRONTEND_CLASSIFICATIONS = ("faithful", "translated", "extension")
FRONTEND_DIAGNOSTIC_CODES = (
    "invalid_frontend_arguments",
    "non_replayable_intent",
    "parse_failure",
    "semantic_mismatch",
    "unsupported_operation",
    "unsupported_option",
    "unsupported_target",
)


def canonical_language(language: str) -> str:
    """Return the public name for a supported source or output language."""

    normalized = str(language).strip().lower().replace("_", "-")
    aliases = {
        "mathematica": "wolfram",
        "python": "python-scipy",
        "scipy": "python-scipy",
        "sagejs": "sage",
        "wl": "wolfram",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in FRONTEND_LANGUAGES:
        raise ValueError("unknown numerical frontend language: " + str(language))
    return normalized


class FrontendDiagnostic:
    """Stable unsupported/translation diagnostic independent of solver status."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        operation: str | None = None,
        language: str | None = None,
        option: str | None = None,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        if code not in FRONTEND_DIAGNOSTIC_CODES:
            raise ValueError("unknown frontend diagnostic code: " + str(code))
        if not isinstance(message, str) or message == "":
            raise TypeError("frontend diagnostic message must be nonempty")
        self._code = code
        self._message = message
        self._operation = operation
        self._language = None if language is None else canonical_language(language)
        self._option = option
        self._details = materialize_object(details, "$.frontend_diagnostic.details")

    @property
    def code(self) -> str:
        return self._code

    @property
    def message(self) -> str:
        return self._message

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "code": self._code,
            "message": self._message,
            "operation": self._operation,
            "language": self._language,
            "option": self._option,
            "details": materialize_object(
                self._details, "$.frontend_diagnostic.details"
            ),
        }


class UnsupportedFrontendError(NotImplementedError):
    """An explicit, machine-readable unsupported frontend boundary."""

    def __init__(self, diagnostic: FrontendDiagnostic) -> None:
        self.diagnostic = diagnostic
        super().__init__(diagnostic.message + " [" + diagnostic.code + "]")


class OperationRef:
    """Versioned reference to one shared semantic numerical operation."""

    def __init__(self, domain: str, name: str, version: int = 1) -> None:
        if not isinstance(domain, str) or domain == "":
            raise TypeError("operation domain must be a nonempty string")
        if not isinstance(name, str) or name == "":
            raise TypeError("operation name must be a nonempty string")
        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise ValueError("operation version must be a positive integer")
        self._domain = domain
        self._name = name
        self._version = version

    @property
    def domain(self) -> str:
        return self._domain

    @property
    def name(self) -> str:
        return self._name

    @property
    def version(self) -> int:
        return self._version

    @property
    def key(self) -> str:
        return self._domain + ":" + self._name + ":v" + str(self._version)

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "domain": self._domain,
            "name": self._name,
            "version": self._version,
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "OperationRef":
        return cls(
            str(value["domain"]),
            str(value["name"]),
            int(value.get("version", 1)),
        )


class NumericalFrontendIntent:
    """Immutable canonical intent plus optional non-serializable live bindings."""

    def __init__(
        self,
        operation: OperationRef,
        *,
        operands: Mapping[str, Any],
        options: Mapping[str, Any] | None = None,
        outputs: Sequence[str] = ("value",),
        source_language: str,
        source_name: str,
        classification: str = "translated",
        source_text: str | None = None,
        source_span: Mapping[str, Any] | None = None,
        metadata: Mapping[str, Any] | None = None,
        bindings: Mapping[str, Any] | None = None,
    ) -> None:
        if not isinstance(operation, OperationRef):
            raise TypeError("frontend operation must be an OperationRef")
        language = canonical_language(source_language)
        if classification not in FRONTEND_CLASSIFICATIONS:
            raise ValueError("unknown frontend classification: " + classification)
        if not isinstance(source_name, str) or source_name == "":
            raise TypeError("source operation name must be nonempty")
        output_names = []
        for output in outputs:
            if not isinstance(output, str) or output == "":
                raise TypeError("frontend output names must be nonempty strings")
            output_names.append(output)
        if not output_names:
            raise ValueError("frontend intent must request at least one output")
        self._operation = operation
        self._operands = materialize_object(operands, "$.frontend_intent.operands")
        self._options = materialize_object(options, "$.frontend_intent.options")
        self._outputs = tuple(output_names)
        self._source_language = language
        self._source_name = source_name
        self._classification = classification
        self._source_text = source_text
        self._source_span = materialize_object(
            source_span, "$.frontend_intent.source.span"
        )
        self._metadata = materialize_object(metadata, "$.frontend_intent.metadata")
        self._bindings = {} if bindings is None else dict(bindings)
        for name in self._bindings:
            if not isinstance(name, str) or name == "":
                raise TypeError("frontend binding names must be nonempty strings")

    @property
    def operation(self) -> str:
        return self._operation.name

    @property
    def operation_ref(self) -> OperationRef:
        return self._operation

    @property
    def operands(self) -> dict[str, Any]:
        return dict(self._operands)

    @property
    def options(self) -> dict[str, Any]:
        return dict(self._options)

    @property
    def outputs(self) -> tuple[str, ...]:
        return self._outputs

    @property
    def source_language(self) -> str:
        return self._source_language

    @property
    def source_name(self) -> str:
        return self._source_name

    @property
    def replayable(self) -> bool:
        return not _contains_opaque_value(self._operands)

    def binding(self, name: str) -> Any:
        if name not in self._bindings:
            raise UnsupportedFrontendError(
                FrontendDiagnostic(
                    "non_replayable_intent",
                    "frontend execution requires the live binding '" + name + "'",
                    operation=self.operation,
                    language=self._source_language,
                    details={"binding": name},
                )
            )
        return self._bindings[name]

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "schema_version": FRONTEND_SCHEMA_VERSION,
            "kind": "numerical_frontend_intent",
            "operation": self._operation.to_dict(),
            "operands": materialize_object(
                self._operands, "$.frontend_intent.operands"
            ),
            "options": materialize_object(self._options, "$.frontend_intent.options"),
            "outputs": list(self._outputs),
            "source": {
                "language": self._source_language,
                "name": self._source_name,
                "text": self._source_text,
                "span": materialize_object(
                    self._source_span, "$.frontend_intent.source.span"
                ),
            },
            "classification": self._classification,
            "replayable": self.replayable,
            "metadata": materialize_object(
                self._metadata, "$.frontend_intent.metadata"
            ),
        }

    def semantic_dict(self) -> dict[str, JSONValue]:
        """Return the source-independent portion used for round-trip checks."""

        return {
            "schema_version": FRONTEND_SCHEMA_VERSION,
            "operation": self._operation.to_dict(),
            "operands": materialize_object(
                self._operands, "$.frontend_intent.operands"
            ),
            "options": materialize_object(self._options, "$.frontend_intent.options"),
            "outputs": list(self._outputs),
        }

    @property
    def digest(self) -> str:
        return hashlib.sha256(
            canonical_json(self.semantic_dict()).encode("utf-8")
        ).hexdigest()

    def to_json(self) -> str:
        return canonical_json(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "NumericalFrontendIntent":
        if int(value.get("schema_version", 0)) != FRONTEND_SCHEMA_VERSION:
            raise ValueError("unsupported numerical frontend schema version")
        source = value.get("source")
        if not isinstance(source, Mapping):
            raise TypeError("frontend intent source must be a mapping")
        operation = value.get("operation")
        if not isinstance(operation, Mapping):
            raise TypeError("frontend intent operation must be a mapping")
        outputs = value.get("outputs", ["value"])
        if not isinstance(outputs, Sequence) or isinstance(outputs, str):
            raise TypeError("frontend intent outputs must be a sequence")
        return cls(
            OperationRef.from_dict(operation),
            operands=value.get("operands", {}),
            options=value.get("options", {}),
            outputs=[str(output) for output in outputs],
            source_language=str(source["language"]),
            source_name=str(source["name"]),
            classification=str(value.get("classification", "translated")),
            source_text=(
                None if source.get("text") is None else str(source.get("text"))
            ),
            source_span=source.get("span"),
            metadata=value.get("metadata"),
        )


def opaque_callback_record(parameters: Sequence[str]) -> dict[str, JSONValue]:
    """Return the stable record used when only a live callback is available."""

    return {
        "kind": "opaque_callback",
        "parameters": [str(parameter) for parameter in parameters],
    }


def _contains_opaque_value(value: Any) -> bool:
    if isinstance(value, Mapping):
        if value.get("kind") == "opaque_callback":
            return True
        return any(_contains_opaque_value(value[key]) for key in value)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return any(_contains_opaque_value(item) for item in value)
    return False


__all__ = [
    "FRONTEND_CLASSIFICATIONS",
    "FRONTEND_DIAGNOSTIC_CODES",
    "FRONTEND_LANGUAGES",
    "FRONTEND_SCHEMA_VERSION",
    "FrontendDiagnostic",
    "NumericalFrontendIntent",
    "OperationRef",
    "UnsupportedFrontendError",
    "canonical_language",
    "opaque_callback_record",
]
