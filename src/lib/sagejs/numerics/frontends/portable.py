"""Portable values, callback records, and checked emitted-source envelopes."""

from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any, NoReturn

from .._json import JSONValue, canonical_json
from .expressions import expression_record, render_expression
from .model import (
    FrontendDiagnostic,
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
    canonical_language,
    opaque_callback_record,
)

_MARKER = "sagejs-intent-v1:"


def portable_value(value: Any) -> JSONValue:
    """Detach a finite numerical value into the frontend JSON vocabulary."""

    if hasattr(value, "tolist"):
        value = value.tolist()
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("frontend numerical operands must be finite")
        return value
    if isinstance(value, complex):
        real = float(value.real)
        imaginary = float(value.imag)
        if not math.isfinite(real) or not math.isfinite(imaginary):
            raise ValueError("frontend complex operands must be finite")
        return {"kind": "complex", "real": real, "imaginary": imaginary}
    if isinstance(value, Mapping):
        answer: dict[str, JSONValue] = {}
        for key in value:
            if not isinstance(key, str):
                raise TypeError("frontend mapping keys must be strings")
            answer[key] = portable_value(value[key])
        return answer
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        return [portable_value(item) for item in value]
    raise TypeError(
        "frontend operand is not a portable numerical value: " + type(value).__name__
    )


def runtime_value(value: Any) -> Any:
    """Restore complex leaves while keeping detached containers mutable."""

    if isinstance(value, Mapping):
        if value.get("kind") == "complex" and set(value) == {
            "kind",
            "real",
            "imaginary",
        }:
            return complex(float(value["real"]), float(value["imaginary"]))
        return {str(key): runtime_value(value[key]) for key in value}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [runtime_value(item) for item in value]
    return value


def callback_record(
    callback: Any,
    expression: str | Sequence[str] | None,
    *,
    language: str,
    parameters: Sequence[str],
) -> tuple[dict[str, JSONValue], dict[str, Any]]:
    """Detach one scalar/vector callback and return its live binding separately."""

    if not callable(callback) and expression is None:
        raise UnsupportedFrontendError(
            FrontendDiagnostic(
                "invalid_frontend_arguments",
                "a numerical callback requires a callable or portable expression",
                language=language,
            )
        )
    bindings = {"callback": callback} if callable(callback) else {}
    if expression is None:
        return opaque_callback_record(parameters), bindings
    if isinstance(expression, str):
        return (
            expression_record(expression, language=language, parameters=parameters),
            bindings,
        )
    if isinstance(expression, Sequence) and not isinstance(
        expression, (bytes, bytearray)
    ):
        records: list[JSONValue] = []
        for item in expression:
            if not isinstance(item, str):
                raise TypeError("callback expression vectors must contain strings")
            records.append(
                expression_record(item, language=language, parameters=parameters)
            )
        if not records:
            raise ValueError("callback expression vectors must not be empty")
        return (
            {
                "kind": "expression_vector",
                "parameters": [str(parameter) for parameter in parameters],
                "items": records,
            },
            bindings,
        )
    raise TypeError("callback expression must be a string or sequence of strings")


def render_callback(record: Mapping[str, Any], language: str) -> str | list[str]:
    """Render one portable scalar or vector callback body."""

    if record.get("kind") == "expression":
        return render_expression(record, language)
    if record.get("kind") == "expression_vector":
        items = record.get("items")
        if not isinstance(items, Sequence) or isinstance(items, str):
            raise TypeError("expression vector items must be a sequence")
        rendered = []
        for item in items:
            if not isinstance(item, Mapping):
                raise TypeError("expression vector item must be a mapping")
            rendered.append(render_expression(item, language))
        return rendered
    raise UnsupportedFrontendError(
        FrontendDiagnostic(
            "non_replayable_intent",
            "opaque callbacks cannot be emitted as source code",
            language=language,
        )
    )


def render_value(value: Any, language: str) -> str:
    """Render a detached numerical value in one target language."""

    target = canonical_language(language)
    if isinstance(value, Mapping) and value.get("kind") == "complex":
        real = _number(float(value["real"]))
        imaginary = _number(abs(float(value["imaginary"])))
        sign = "+" if float(value["imaginary"]) >= 0 else "-"
        if target == "wolfram":
            return "(" + real + " " + sign + " " + imaginary + " I)"
        if target == "matlab":
            return "(" + real + " " + sign + " " + imaginary + "i)"
        return "(" + real + " " + sign + " " + imaginary + "j)"
    if value is None:
        return {"wolfram": "None", "matlab": "[]"}.get(target, "None")
    if isinstance(value, bool):
        if target == "wolfram":
            return "True" if value else "False"
        if target == "matlab":
            return "true" if value else "false"
        return "True" if value else "False"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _number(value)
    if isinstance(value, str):
        if target in ("matlab", "wolfram"):
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            return '"' + escaped + '"'
        return repr(value)
    if isinstance(value, Mapping):
        if target == "wolfram":
            return (
                "<|"
                + ", ".join(
                    render_value(str(key), target)
                    + " -> "
                    + render_value(value[key], target)
                    for key in value
                )
                + "|>"
            )
        if target == "matlab":
            raise UnsupportedFrontendError(
                FrontendDiagnostic(
                    "unsupported_target",
                    "MATLAB code generation does not preserve mapping operands",
                    language=target,
                )
            )
        return (
            "{"
            + ", ".join(
                repr(str(key)) + ": " + render_value(value[key], target)
                for key in value
            )
            + "}"
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        entries = list(value)
        if target == "wolfram":
            return "{" + ", ".join(render_value(item, target) for item in entries) + "}"
        if target == "matlab":
            if entries and all(
                isinstance(row, Sequence)
                and not isinstance(row, (str, bytes, bytearray))
                for row in entries
            ):
                rows = []
                for row in entries:
                    rows.append(
                        ", ".join(render_value(item, target) for item in list(row))
                    )
                return "[" + "; ".join(rows) + "]"
            return "[" + ", ".join(render_value(item, target) for item in entries) + "]"
        return "[" + ", ".join(render_value(item, target) for item in entries) + "]"
    raise TypeError("cannot render frontend value: " + type(value).__name__)


def attach_intent(body: str, intent: NumericalFrontendIntent, language: str) -> str:
    """Attach a canonical, checksummed round-trip envelope to executable code."""

    target = canonical_language(language)
    record = {
        "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "semantic": intent.semantic_dict(),
    }
    payload = base64.urlsafe_b64encode(canonical_json(record).encode("utf-8")).decode(
        "ascii"
    )
    if target == "wolfram":
        return body + "\n(* " + _MARKER + payload + " *)"
    prefix = "% " if target == "matlab" else "# "
    return body + "\n" + prefix + _MARKER + payload


def parse_attached_intent(
    source: str, language: str, expected: OperationRef
) -> NumericalFrontendIntent:
    """Validate an emitted body and reconstruct its canonical semantic intent."""

    target = canonical_language(language)
    if target == "wolfram":
        pattern = re.compile(r"\n\(\*\s*" + _MARKER + r"([A-Za-z0-9_=-]+)\s*\*\)\s*$")
    elif target == "matlab":
        pattern = re.compile(r"\n%\s*" + _MARKER + r"([A-Za-z0-9_=-]+)\s*$")
    else:
        pattern = re.compile(r"\n#\s*" + _MARKER + r"([A-Za-z0-9_=-]+)\s*$")
    match = pattern.search(source)
    if match is None:
        _parse_error(target, "source is not checked Sage.js-generated numerical code")
    assert match is not None
    body = source[: match.start()]
    try:
        decoded = base64.urlsafe_b64decode(match.group(1).encode("ascii"))
        envelope = json.loads(decoded.decode("utf-8"))
    except Exception:
        _parse_error(target, "invalid numerical intent envelope")
    if not isinstance(envelope, Mapping):
        _parse_error(target, "numerical intent envelope must be an object")
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    if envelope.get("body_sha256") != digest:
        raise UnsupportedFrontendError(
            FrontendDiagnostic(
                "semantic_mismatch",
                "emitted numerical source was edited after its intent was recorded",
                operation=expected.name,
                language=target,
                details={"computed_body_sha256": digest},
            )
        )
    semantic = envelope.get("semantic")
    if not isinstance(semantic, Mapping):
        _parse_error(target, "numerical intent envelope has no semantic record")
    operation = semantic.get("operation")
    if not isinstance(operation, Mapping):
        _parse_error(target, "numerical intent envelope has no operation")
    operation_ref = OperationRef.from_dict(operation)
    if operation_ref.key != expected.key:
        raise UnsupportedFrontendError(
            FrontendDiagnostic(
                "semantic_mismatch",
                "emitted numerical source names a different canonical operation",
                operation=expected.name,
                language=target,
                details={
                    "expected": expected.key,
                    "actual": operation_ref.key,
                },
            )
        )
    outputs = semantic.get("outputs", ["value"])
    if not isinstance(outputs, Sequence) or isinstance(outputs, str):
        _parse_error(target, "numerical intent outputs must be a sequence")
    return NumericalFrontendIntent(
        operation_ref,
        operands=_mapping(semantic.get("operands"), "operands"),
        options=_mapping(semantic.get("options"), "options"),
        outputs=[str(output) for output in outputs],
        source_language=target,
        source_name=expected.name,
        classification="translated",
        source_text=source,
        metadata={"round_trip": "checked-emitted-source-v1"},
    )


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise TypeError("numerical intent " + name + " must be a mapping")
    return value


def _parse_error(language: str, message: str) -> NoReturn:
    raise UnsupportedFrontendError(
        FrontendDiagnostic("parse_failure", message, language=language)
    )


def _number(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("cannot emit a nonfinite numerical literal")
    integer = int(value)
    if value == integer and abs(value) < 1.0e16:
        return str(integer)
    return repr(value)


__all__ = [
    "attach_intent",
    "callback_record",
    "parse_attached_intent",
    "portable_value",
    "render_callback",
    "render_value",
    "runtime_value",
]
