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
from .expressions import evaluate_expression, expression_record, render_expression
from .model import (
    FrontendDiagnostic,
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
    canonical_language,
    opaque_callback_record,
)

_MARKER = "sagejs-intent-v1:"
_MAX_PORTABLE_DEPTH = 64
_MAX_PORTABLE_NODES = 100000
_MAX_EMITTED_SOURCE_BYTES = 2000000
_MAX_ENVELOPE_BYTES = 1000000


def portable_value(value: Any) -> JSONValue:
    """Detach a finite numerical value into the frontend JSON vocabulary."""

    return _portable_value(value, 0, [0])


def _portable_value(value: Any, depth: int, nodes: list[int]) -> JSONValue:
    if depth > _MAX_PORTABLE_DEPTH:
        raise ValueError("frontend numerical operands exceed the maximum nesting depth")
    nodes[0] += 1
    if nodes[0] > _MAX_PORTABLE_NODES:
        raise ValueError("frontend numerical operands exceed the maximum node count")
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
            answer[key] = _portable_value(value[key], depth + 1, nodes)
        return answer
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        return [_portable_value(item, depth + 1, nodes) for item in value]
    raise TypeError(
        "frontend operand is not a portable numerical value: " + type(value).__name__
    )


def runtime_value(value: Any) -> Any:
    """Restore complex leaves while keeping detached containers mutable."""

    return _runtime_value(value, 0, [0])


def _runtime_value(value: Any, depth: int, nodes: list[int]) -> Any:
    if depth > _MAX_PORTABLE_DEPTH:
        raise ValueError("frontend runtime values exceed the maximum nesting depth")
    nodes[0] += 1
    if nodes[0] > _MAX_PORTABLE_NODES:
        raise ValueError("frontend runtime values exceed the maximum node count")
    if isinstance(value, Mapping):
        if value.get("kind") == "complex" and set(value) == {
            "kind",
            "real",
            "imaginary",
        }:
            return complex(float(value["real"]), float(value["imaginary"]))
        return {str(key): _runtime_value(value[key], depth + 1, nodes) for key in value}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_runtime_value(item, depth + 1, nodes) for item in value]
    return value


def validated_callback(record: Mapping[str, Any], callback: Any) -> Any:
    """Check a live callback against its claimed expression on every invocation."""

    if not callable(callback) or record.get("kind") == "opaque_callback":
        return callback
    parameters_value = record.get("parameters", [])
    if not isinstance(parameters_value, Sequence) or isinstance(parameters_value, str):
        raise TypeError("canonical callback parameters must be a sequence")
    parameters = [str(item) for item in parameters_value]

    def checked(
        *arguments: Any,
        callback: Any = callback,
        parameters: list[str] = parameters,
        record: Mapping[str, Any] = record,
    ) -> Any:
        values = _callback_bindings(parameters, arguments)
        expected = _evaluate_callback_record(record, values)
        actual = callback(*arguments)
        if not _numerically_equivalent(actual, expected):
            raise ValueError(
                "live numerical callback disagrees with its claimed expression"
            )
        return actual

    return checked


def _callback_bindings(
    parameters: Sequence[str], arguments: Sequence[Any]
) -> dict[str, Any]:
    values = list(arguments)
    if len(values) == 1:
        candidate = values[0]
        if isinstance(candidate, Sequence) and not isinstance(
            candidate, (str, bytes, bytearray)
        ):
            values = list(candidate)
    elif len(values) == 2 and len(parameters) == 1:
        values = values[:1]
    elif len(values) == 2:
        state = values[1]
        if (
            isinstance(state, Sequence)
            and not isinstance(state, (str, bytes, bytearray))
            and 1 + len(state) == len(parameters)
        ):
            values = [values[0], *list(state)]
    if len(values) != len(parameters):
        raise ValueError(
            "live numerical callback arguments do not match expression parameters"
        )
    return {parameters[index]: values[index] for index in range(len(parameters))}


def _evaluate_callback_record(
    record: Mapping[str, Any], values: Mapping[str, Any]
) -> Any:
    if record.get("kind") == "expression":
        return evaluate_expression(record, values)
    if record.get("kind") == "expression_vector":
        items = record.get("items")
        if not isinstance(items, Sequence) or isinstance(items, str):
            raise TypeError("expression vector items must be a sequence")
        answer = []
        for item in items:
            if not isinstance(item, Mapping):
                raise TypeError("expression vector item must be a mapping")
            answer.append(evaluate_expression(item, values))
        return answer
    raise TypeError("validated callbacks require an expression record")


def _numerically_equivalent(actual: Any, expected: Any) -> bool:
    if hasattr(actual, "tolist"):
        actual = actual.tolist()
    if hasattr(expected, "tolist"):
        expected = expected.tolist()
    if isinstance(actual, bool) or isinstance(expected, bool):
        return actual == expected
    if isinstance(actual, (int, float, complex)) and isinstance(
        expected, (int, float, complex)
    ):
        left = complex(actual)
        right = complex(expected)
        if not all(
            math.isfinite(value)
            for value in (left.real, left.imag, right.real, right.imag)
        ):
            return False
        return _close_component(left.real, right.real) and _close_component(
            left.imag, right.imag
        )
    if isinstance(actual, Mapping) and isinstance(expected, Mapping):
        return set(actual) == set(expected) and all(
            _numerically_equivalent(actual[key], expected[key]) for key in actual
        )
    if (
        isinstance(actual, Sequence)
        and not isinstance(actual, (str, bytes, bytearray))
        and isinstance(expected, Sequence)
        and not isinstance(expected, (str, bytes, bytearray))
    ):
        return len(actual) == len(expected) and all(
            _numerically_equivalent(actual[index], expected[index])
            for index in range(len(actual))
        )
    return actual == expected


def _close_component(left: float, right: float) -> bool:
    """Portable binary64 closeness without relying on `math.isclose`."""

    return abs(left - right) <= max(1e-12, 1e-12 * max(abs(left), abs(right)))


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
    if expression is None:
        bindings = {"callback": callback} if callable(callback) else {}
        return opaque_callback_record(parameters), bindings
    record: dict[str, JSONValue]
    if isinstance(expression, str):
        record = expression_record(expression, language=language, parameters=parameters)
    elif isinstance(expression, Sequence) and not isinstance(
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
        record = {
            "kind": "expression_vector",
            "parameters": [str(parameter) for parameter in parameters],
            "items": records,
        }
    else:
        raise TypeError("callback expression must be a string or sequence of strings")
    binding = callback if callable(callback) else replayable_callback(record)
    return record, {"callback": binding}


def replayable_callback(record: Mapping[str, Any]) -> Any:
    """Build the bounded callable represented by one portable expression record.

    This is used when checked generated source is parsed back into canonical
    intent.  It executes only the arithmetic expression IR accepted by
    `expression_record`; it never evaluates source text.
    """

    parameters_value = record.get("parameters", [])
    if not isinstance(parameters_value, Sequence) or isinstance(parameters_value, str):
        raise TypeError("canonical callback parameters must be a sequence")
    parameters = [str(item) for item in parameters_value]

    def callback(
        *arguments: Any,
        parameters: list[str] = parameters,
        record: Mapping[str, Any] = record,
    ) -> Any:
        return _evaluate_callback_record(
            record, _callback_bindings(parameters, arguments)
        )

    return callback


def render_callback(
    record: Mapping[str, Any], language: str, *, elementwise: bool = False
) -> str | list[str]:
    """Render one portable scalar or vector callback body."""

    if record.get("kind") == "expression":
        return render_expression(record, language, elementwise=elementwise)
    if record.get("kind") == "expression_vector":
        items = record.get("items")
        if not isinstance(items, Sequence) or isinstance(items, str):
            raise TypeError("expression vector items must be a sequence")
        rendered = []
        for item in items:
            if not isinstance(item, Mapping):
                raise TypeError("expression vector item must be a mapping")
            rendered.append(render_expression(item, language, elementwise=elementwise))
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
    if len(body.encode("utf-8")) > _MAX_EMITTED_SOURCE_BYTES:
        raise ValueError("emitted numerical source exceeds the byte budget")
    record = {
        "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "semantic": intent.semantic_dict(),
    }
    portable_value(record)
    encoded_record = canonical_json(record).encode("utf-8")
    if len(encoded_record) > _MAX_ENVELOPE_BYTES:
        raise ValueError("numerical intent envelope exceeds the byte budget")
    payload = base64.urlsafe_b64encode(encoded_record).decode("ascii")
    if target == "wolfram":
        return body + "\n(* " + _MARKER + payload + " *)"
    prefix = "% " if target == "matlab" else "# "
    return body + "\n" + prefix + _MARKER + payload


def parse_attached_intent(
    source: str, language: str, expected: OperationRef
) -> NumericalFrontendIntent:
    """Validate an emitted body and reconstruct its canonical semantic intent."""

    target = canonical_language(language)
    body, semantic = checked_source_body(source, target, expected)
    outputs = semantic.get("outputs", ["value"])
    if not isinstance(outputs, Sequence) or isinstance(outputs, str):
        _parse_error(target, "numerical intent outputs must be a sequence")
    return NumericalFrontendIntent(
        expected,
        operands=_mapping(semantic.get("operands"), "operands"),
        options=_mapping(semantic.get("options"), "options"),
        outputs=[str(output) for output in outputs],
        source_language=target,
        source_name=expected.name,
        classification="translated",
        source_text=body,
        metadata={"round_trip": "checked-envelope-v1"},
    )


def checked_source_body(
    source: str, language: str, expected: OperationRef
) -> tuple[str, Mapping[str, Any]]:
    """Authenticate an emitted body and return its recorded semantic cross-check.

    Callers that make a round-trip claim must parse `body` independently and
    use the returned semantic record only to reject disagreement.  Returning
    the trailer as intent is retained in `parse_attached_intent` solely for
    compatibility with callers that explicitly ask for envelope decoding.
    """

    target = canonical_language(language)
    if (
        len(source.encode("utf-8"))
        > _MAX_EMITTED_SOURCE_BYTES + 2 * _MAX_ENVELOPE_BYTES
    ):
        _parse_error(target, "emitted numerical source exceeds the byte budget")
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
    if len(body.encode("utf-8")) > _MAX_EMITTED_SOURCE_BYTES:
        _parse_error(target, "emitted numerical source body exceeds the byte budget")
    if len(match.group(1)) > 2 * _MAX_ENVELOPE_BYTES:
        _parse_error(target, "numerical intent envelope exceeds the byte budget")
    try:
        decoded = base64.urlsafe_b64decode(match.group(1).encode("ascii"))
        if len(decoded) > _MAX_ENVELOPE_BYTES:
            _parse_error(target, "numerical intent envelope exceeds the byte budget")
        envelope = json.loads(decoded.decode("utf-8"))
    except Exception:
        _parse_error(target, "invalid numerical intent envelope")
    _validate_tree_budget(envelope, target)
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
    return body, semantic


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise TypeError("numerical intent " + name + " must be a mapping")
    return value


def _validate_tree_budget(value: Any, language: str) -> None:
    stack = [(value, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > _MAX_PORTABLE_NODES:
            _parse_error(language, "numerical intent envelope exceeds the node budget")
        if depth > _MAX_PORTABLE_DEPTH:
            _parse_error(language, "numerical intent envelope exceeds the depth budget")
        if isinstance(item, float) and not math.isfinite(item):
            _parse_error(
                language, "numerical intent envelope contains a non-finite value"
            )
        if isinstance(item, Mapping):
            stack.extend((item[key], depth + 1) for key in item)
        elif isinstance(item, list):
            stack.extend((child, depth + 1) for child in item)


def _parse_error(language: str, message: str) -> NoReturn:
    raise UnsupportedFrontendError(
        FrontendDiagnostic("parse_failure", message, language=language)
    )


def _number(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("cannot emit a nonfinite numerical literal")
    integer = int(value)
    if value == integer and abs(value) < 1.0e16:
        if value == 0.0 and math.copysign(1.0, value) < 0:
            return "-0.0"
        return str(integer) + ".0"
    return repr(value)


__all__ = [
    "attach_intent",
    "callback_record",
    "checked_source_body",
    "parse_attached_intent",
    "portable_value",
    "render_callback",
    "render_value",
    "replayable_callback",
    "runtime_value",
    "validated_callback",
]
