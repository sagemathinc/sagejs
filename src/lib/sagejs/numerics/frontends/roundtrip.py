"""Bounded parsers for Sage.js-emitted numerical programs.

This module is deliberately not a general Sage, Python, MATLAB, or Wolfram
parser.  It parses the complete data/callback subset emitted by the numerical
frontend catalog, lowers that syntax back into canonical intent, and then
requires byte-for-byte regeneration of the executable body.  The attached
semantic envelope is only an independent cross-check; it is never the source
of reconstructed operands or callback expressions.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Sequence
from typing import Any

from .model import (
    FrontendDiagnostic,
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
    canonical_language,
)
from .portable import checked_source_body


def parse_catalog_source(
    source: str,
    language: str,
    expected: OperationRef,
    *,
    operands: Sequence[str],
    callback: str | None,
    callback_shape: str | None,
    source_name: str,
    lower: Callable[..., NumericalFrontendIntent],
    emit_body: Callable[[NumericalFrontendIntent, str], str],
) -> NumericalFrontendIntent:
    """Parse, lower, regenerate, and authenticate one emitted catalog program."""

    target = canonical_language(language)
    body, recorded_semantic = checked_source_body(source, target, expected)
    assignments = _assignment_lines(body, target)
    arguments: list[Any] = []
    expression: str | list[str] | None = None
    parameters: tuple[str, ...] | None = None
    for name in operands:
        value_source = assignments.get(name)
        if value_source is None:
            _failure(target, "emitted program omits operand assignment: " + name)
        assert value_source is not None
        if name == callback:
            if callback_shape is None:
                _failure(target, "emitted callback has no declared shape")
            expression, parameters = _parse_callback(
                value_source, target, str(callback_shape)
            )
            arguments.append(None)
        else:
            arguments.append(_parse_operand(value_source, target, name))
    options: dict[str, Any] = {"source_text": source}
    if expression is not None:
        options["expression"] = expression
        options["parameters"] = parameters
    reconstructed = lower(*arguments, **options)
    regenerated = emit_body(reconstructed, target)
    if regenerated != body:
        _mismatch(
            target,
            expected,
            "parsed program does not regenerate the checked executable body",
        )
    if reconstructed.semantic_dict() != dict(recorded_semantic):
        _mismatch(
            target,
            expected,
            "parsed program semantics disagree with the attached cross-check",
        )
    return reconstructed


def _parse_operand(source: str, language: str, name: str) -> Any:
    value_source = source
    matlab_column = language == "matlab" and name == "right"
    if matlab_column and value_source.endswith(".'"):
        value_source = value_source[:-2].rstrip()
        value = _ValueParser(value_source, language).parse()
        if not isinstance(value, list) or any(isinstance(item, list) for item in value):
            _failure(language, "emitted right-hand-side transpose is not a vector")
        return value
    return _ValueParser(value_source, language).parse()


def _assignment_lines(body: str, language: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("import ") or line.startswith("from "):
            continue
        match = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)", line)
        if match is None:
            continue
        name = match.group(1)
        if name == "result":
            continue
        value = match.group(2)
        if language in ("matlab", "wolfram"):
            if not value.endswith(";"):
                _failure(language, "emitted assignment must end in ';'")
            value = value[:-1].rstrip()
        if name in result:
            _failure(language, "emitted program assigns an operand more than once")
        result[name] = value
    return result


def _parse_callback(
    source: str, language: str, shape: str
) -> tuple[str | list[str], tuple[str, ...]]:
    if shape == "scalar":
        if language in ("sage", "python-scipy"):
            match = re.fullmatch(r"lambda\s+(\w+)\s*:\s*(.+)", source)
        elif language == "matlab":
            match = re.fullmatch(r"@\((\w+)\)\s+(.+)", source)
        else:
            match = re.fullmatch(r"Function\[\{(\w+)\},\s*(.+)\]", source)
        if match is None:
            _failure(language, "unsupported emitted scalar callback syntax")
        assert match is not None
        return match.group(2).strip(), (match.group(1),)
    if shape == "sweep":
        if language not in ("sage", "python-scipy"):
            _failure(language, "emitted sweep callback is not round-trippable")
        match = re.fullmatch(r"lambda\s+(\w+)\s*,\s*context\s*:\s*(.+)", source)
        if match is None:
            _failure(language, "unsupported emitted sweep callback syntax")
        assert match is not None
        return match.group(2).strip(), (match.group(1),)
    if shape == "vector":
        if language in ("sage", "python-scipy"):
            match = re.fullmatch(
                r"lambda\s+p\s*:\s*\(lambda\s+([^:]+)\s*:\s*(.+)\)\(\*p\)",
                source,
            )
        elif language == "matlab":
            match = re.fullmatch(
                r"@\(p\)\s+feval\(@\(([^)]+)\)\s+(.+),\s*"
                r"p\(1\)(?:,\s*p\(\d+\))*\)",
                source,
            )
        else:
            match = re.fullmatch(
                r"Function\[\{p\},\s*Function\[\{([^}]+)\},\s*(.+)\]\s*@@\s*p\]",
                source,
            )
        if match is None:
            _failure(language, "unsupported emitted vector callback syntax")
        assert match is not None
        parameters = _parameters(match.group(1), language)
        return _expression_body(match.group(2), language), parameters
    if shape == "ode":
        if language in ("sage", "python-scipy"):
            match = re.fullmatch(
                r"lambda\s+t\s*,\s*y\s*:\s*\(lambda\s+([^:]+)\s*:\s*(.+)\)"
                r"\(t,\s*\*y\)",
                source,
            )
        elif language == "matlab":
            match = re.fullmatch(
                r"@\(t,\s*y\)\s+feval\(@\(([^)]+)\)\s+(.+),\s*t,\s*"
                r"y\(1\)(?:,\s*y\(\d+\))*\)",
                source,
            )
        else:
            match = re.fullmatch(
                r"Function\[\{t,\s*y\},\s*Function\[\{([^}]+)\},\s*(.+)\]"
                r"\[t,\s*y\[\[1\]\](?:,\s*y\[\[\d+\]\])*\]\]",
                source,
            )
        if match is None:
            _failure(language, "unsupported emitted ODE callback syntax")
        assert match is not None
        parameters = _parameters(match.group(1), language)
        if len(parameters) < 2 or parameters[0] != "t":
            _failure(language, "emitted ODE callback must bind t and state values")
        return _expression_body(match.group(2), language), parameters
    _failure(language, "unknown emitted callback shape: " + shape)
    raise AssertionError("unreachable")


def _parameters(source: str, language: str) -> tuple[str, ...]:
    result = tuple(part.strip() for part in source.split(","))
    if not result or any(
        re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", item) is None for item in result
    ):
        _failure(language, "emitted callback parameters are not simple names")
    return result


def _expression_body(source: str, language: str) -> str | list[str]:
    value = source.strip()
    delimiters = {
        "sage": ("[", "]", ","),
        "python-scipy": ("[", "]", ","),
        "matlab": ("[", "]", ";"),
        "wolfram": ("{", "}", ","),
    }
    opening, closing, separator = delimiters[language]
    if value.startswith(opening) and value.endswith(closing):
        items = _split_top_level(value[1:-1], separator)
        if not items:
            _failure(language, "emitted callback vector must not be empty")
        return items
    return value


def _split_top_level(source: str, separator: str) -> list[str]:
    items: list[str] = []
    start = 0
    stack: list[str] = []
    quote = ""
    escaped = False
    pairs = {")": "(", "]": "[", "}": "{"}
    for index, character in enumerate(source):
        if quote:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = ""
            continue
        if character in ("'", '"'):
            quote = character
        elif character in "([{":
            stack.append(character)
        elif character in ")]}":
            if not stack or stack.pop() != pairs[character]:
                return []
        elif character == separator and not stack:
            item = source[start:index].strip()
            if not item:
                return []
            items.append(item)
            start = index + 1
    item = source[start:].strip()
    if quote or stack or not item:
        return []
    items.append(item)
    return items


class _ValueParser:
    """Parser for the detached finite-value syntax produced by `render_value`."""

    def __init__(self, source: str, language: str) -> None:
        self.source = source
        self.language = canonical_language(language)
        self.index = 0

    def parse(self) -> Any:
        value = self._value()
        self._space()
        if self.index != len(self.source):
            _failure(
                self.language,
                "unsupported token in emitted numerical value at offset "
                + str(self.index),
            )
        return value

    def _value(self) -> Any:
        self._space()
        if self._starts("<|"):
            return self._mapping("<|", "|>", "->")
        character = self._peek()
        if character == "[":
            return self._array("[", "]", self.language == "matlab")
        if character == "{":
            if self.language == "wolfram":
                return self._array("{", "}", False)
            return self._mapping("{", "}", ":")
        if character == "(":
            return self._complex()
        if character in ("'", '"'):
            return self._string()
        if character in "+-." or character.isdigit():
            return self._number()
        name = self._name()
        values = {
            "None": None,
            "True": True,
            "False": False,
            "true": True,
            "false": False,
        }
        if name not in values:
            _failure(self.language, "unsupported emitted numerical literal: " + name)
        return values[name]

    def _array(self, opening: str, closing: str, matlab: bool) -> list[Any]:
        self._consume(opening)
        self._space()
        if self._starts(closing):
            self._consume(closing)
            return []
        rows: list[list[Any]] = [[]]
        while True:
            rows[-1].append(self._value())
            self._space()
            if self._starts(","):
                self._consume(",")
                continue
            if matlab and self._starts(";"):
                self._consume(";")
                rows.append([])
                continue
            if self._starts(closing):
                self._consume(closing)
                break
            _failure(self.language, "malformed emitted numerical array")
        if any(not row for row in rows):
            _failure(self.language, "malformed emitted numerical matrix")
        return rows if matlab and len(rows) > 1 else rows[0]

    def _mapping(self, opening: str, closing: str, arrow: str) -> dict[str, Any]:
        self._consume(opening)
        result: dict[str, Any] = {}
        self._space()
        if self._starts(closing):
            self._consume(closing)
            return result
        while True:
            key = self._value()
            if not isinstance(key, str):
                _failure(self.language, "emitted mapping keys must be strings")
            self._space()
            self._consume(arrow)
            result[key] = self._value()
            self._space()
            if self._starts(","):
                self._consume(",")
                continue
            self._consume(closing)
            return result

    def _complex(self) -> complex:
        start = self.index
        depth = 0
        while self.index < len(self.source):
            character = self.source[self.index]
            self.index += 1
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
                if depth == 0:
                    break
        text = self.source[start : self.index]
        unit = {"matlab": "i", "wolfram": "I"}.get(self.language, "j")
        pattern = re.fullmatch(
            r"\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)"
            r"\s*([+-])\s*((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*"
            + re.escape(unit)
            + r"\s*\)",
            text,
        )
        if pattern is None:
            _failure(self.language, "unsupported emitted complex literal")
        assert pattern is not None
        imaginary = float(pattern.group(3))
        if pattern.group(2) == "-":
            imaginary = -imaginary
        return complex(float(pattern.group(1)), imaginary)

    def _number(self) -> int | float:
        match = re.match(
            r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?",
            self.source[self.index :],
        )
        if match is None:
            _failure(self.language, "malformed emitted numerical literal")
        assert match is not None
        text = match.group(0)
        self.index += len(text)
        value = float(text) if any(c in text for c in ".eE") else int(text)
        if isinstance(value, float) and not math.isfinite(value):
            _failure(self.language, "emitted numerical literals must be finite")
        return value

    def _string(self) -> str:
        quote = self._peek()
        self.index += 1
        characters: list[str] = []
        escapes = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\"}
        while self.index < len(self.source):
            character = self.source[self.index]
            self.index += 1
            if character == quote:
                return "".join(characters)
            if character == "\\":
                if self.index >= len(self.source):
                    break
                escaped = self.source[self.index]
                self.index += 1
                characters.append(escapes.get(escaped, escaped))
            else:
                characters.append(character)
        _failure(self.language, "unterminated emitted string literal")
        raise AssertionError("unreachable")

    def _name(self) -> str:
        match = re.match(r"[A-Za-z_][A-Za-z0-9_]*", self.source[self.index :])
        if match is None:
            _failure(self.language, "expected emitted numerical value")
        assert match is not None
        value = match.group(0)
        self.index += len(value)
        return value

    def _space(self) -> None:
        while self.index < len(self.source) and self.source[self.index].isspace():
            self.index += 1

    def _peek(self) -> str:
        if self.index >= len(self.source):
            _failure(self.language, "unexpected end of emitted numerical value")
        return self.source[self.index]

    def _starts(self, value: str) -> bool:
        return self.source.startswith(value, self.index)

    def _consume(self, value: str) -> None:
        self._space()
        if not self._starts(value):
            _failure(self.language, "expected '" + value + "' in emitted value")
        self.index += len(value)


def _failure(language: str, message: str) -> None:
    raise UnsupportedFrontendError(
        FrontendDiagnostic("parse_failure", message, language=language)
    )


def _mismatch(language: str, expected: OperationRef, message: str) -> None:
    raise UnsupportedFrontendError(
        FrontendDiagnostic(
            "semantic_mismatch",
            message,
            operation=expected.name,
            language=language,
        )
    )


__all__ = ["parse_catalog_source"]
