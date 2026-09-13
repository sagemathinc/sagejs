"""Small arithmetic expression IR shared by numerical code emitters.

This is intentionally not a general parser for any supported language.  It
accepts the portable scalar-expression subset used in numerical callbacks and
fails explicitly outside that subset.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from typing import Any

from .._json import JSONValue, materialize_object
from .model import FrontendDiagnostic, UnsupportedFrontendError, canonical_language

_TOKEN = re.compile(
    r"\s*(?:"
    r"(?P<number>(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|"
    r"(?P<name>[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)|"
    r"(?P<operator>\.\^|\.\*|\./|\*\*|==|!=|<=|>=|->|[+\-*/^(),\[\]<>])"
    r")"
)

_BINARY_NAMES = {
    "+": "add",
    "-": "subtract",
    "*": "multiply",
    ".*": "multiply",
    "/": "divide",
    "./": "divide",
    "^": "power",
    ".^": "power",
    "**": "power",
    "==": "equal",
    "!=": "not_equal",
    "<": "less",
    "<=": "less_equal",
    ">": "greater",
    ">=": "greater_equal",
}
_PRECEDENCE = {
    "equal": 10,
    "not_equal": 10,
    "less": 10,
    "less_equal": 10,
    "greater": 10,
    "greater_equal": 10,
    "add": 20,
    "subtract": 20,
    "multiply": 30,
    "divide": 30,
    "power": 40,
}
_FUNCTIONS = {
    "abs": "abs",
    "acos": "acos",
    "arccos": "acos",
    "asin": "asin",
    "arcsin": "asin",
    "atan": "atan",
    "arctan": "atan",
    "cos": "cos",
    "cosh": "cosh",
    "exp": "exp",
    "log": "log",
    "ln": "log",
    "sin": "sin",
    "sinh": "sinh",
    "sqrt": "sqrt",
    "tan": "tan",
    "tanh": "tanh",
}
_FUNCTION_ARITY = {name: 1 for name in set(_FUNCTIONS.values())}
_FUNCTION_EVALUATORS = {
    "abs": abs,
    "acos": math.acos,
    "asin": math.asin,
    "atan": math.atan,
    "cos": math.cos,
    "cosh": math.cosh,
    "exp": math.exp,
    "log": math.log,
    "sin": math.sin,
    "sinh": math.sinh,
    "sqrt": math.sqrt,
    "tan": math.tan,
    "tanh": math.tanh,
}


def _diagnostic(message: str, language: str, details: Mapping[str, Any]) -> Any:
    raise UnsupportedFrontendError(
        FrontendDiagnostic(
            "parse_failure",
            message,
            language=language,
            details=details,
        )
    )


class _ExpressionParser:
    def __init__(self, source: str, language: str) -> None:
        self.source = source
        self.language = canonical_language(language)
        self.tokens: list[tuple[str, str, int]] = []
        cursor = 0
        while cursor < len(source):
            match = _TOKEN.match(source, cursor)
            if match is None:
                _diagnostic(
                    "unsupported token in numerical expression",
                    self.language,
                    {"offset": cursor, "source": source},
                )
            assert match is not None
            kind = ""
            text = ""
            for candidate in ("number", "name", "operator"):
                value = match.group(candidate)
                if value is not None:
                    kind = candidate
                    text = value
                    break
            self.tokens.append((kind, text, cursor))
            cursor = match.end()
        self.index = 0

    def peek(self) -> tuple[str, str, int] | None:
        if self.index >= len(self.tokens):
            return None
        return self.tokens[self.index]

    def take(self) -> tuple[str, str, int]:
        token = self.peek()
        if token is None:
            _diagnostic(
                "unexpected end of numerical expression",
                self.language,
                {"source": self.source},
            )
        assert token is not None
        self.index += 1
        return token

    def parse(self) -> dict[str, JSONValue]:
        tree = self.expression(0)
        token = self.peek()
        if token is not None:
            _diagnostic(
                "unexpected token in numerical expression",
                self.language,
                {"offset": token[2], "token": token[1]},
            )
        return tree

    def expression(self, minimum_precedence: int) -> dict[str, JSONValue]:
        left: dict[str, JSONValue] = self.prefix()
        while True:
            token = self.peek()
            if token is None or token[0] != "operator":
                break
            operation = _BINARY_NAMES.get(token[1])
            if operation is None:
                break
            precedence = _PRECEDENCE[operation]
            if precedence < minimum_precedence:
                break
            self.take()
            right_precedence = precedence if operation == "power" else precedence + 1
            right = self.expression(right_precedence)
            left = {
                "kind": "binary",
                "operator": operation,
                "left": left,
                "right": right,
            }
        return left

    def prefix(self) -> dict[str, JSONValue]:
        kind, text, offset = self.take()
        if kind == "operator" and text in ("+", "-"):
            return {
                "kind": "unary",
                "operator": "positive" if text == "+" else "negative",
                "operand": self.expression(35),
            }
        if kind == "number":
            try:
                numeric = float(text)
            except (TypeError, ValueError, OverflowError):
                numeric = float("nan")
            if not math.isfinite(numeric):
                _diagnostic(
                    "numerical expression literals must be finite",
                    self.language,
                    {"offset": offset, "literal": text},
                )
            return {"kind": "number", "value": text}
        if kind == "name":
            return self.name_or_call(text)
        if kind == "operator" and text == "(":
            value = self.expression(0)
            closing = self.take()
            if closing[0] != "operator" or closing[1] != ")":
                _diagnostic(
                    "expected ')' in numerical expression",
                    self.language,
                    {"offset": closing[2]},
                )
            return value
        _diagnostic(
            "expected a scalar value in numerical expression",
            self.language,
            {"offset": offset, "token": text},
        )
        raise AssertionError("unreachable")

    def name_or_call(self, name: str) -> dict[str, JSONValue]:
        token = self.peek()
        if token is None or token[0] != "operator" or token[1] not in ("(", "["):
            return {"kind": "symbol", "name": _canonical_symbol(name)}
        opening = self.take()[1]
        expected = ")" if opening == "(" else "]"
        arguments: list[JSONValue] = []
        token = self.peek()
        if token is not None and token[1] != expected:
            while True:
                arguments.append(self.expression(0))
                separator = self.peek()
                if separator is None or separator[1] != ",":
                    break
                self.take()
        closing = self.take()
        if closing[0] != "operator" or closing[1] != expected:
            _diagnostic(
                "expected '" + expected + "' after function arguments",
                self.language,
                {"offset": closing[2], "function": name},
            )
        function = _canonical_function(name)
        if function is None:
            _diagnostic(
                "unsupported function in numerical expression: " + name,
                self.language,
                {"function": name},
            )
        assert function is not None
        expected_arity = _FUNCTION_ARITY[function]
        if len(arguments) != expected_arity:
            _diagnostic(
                "wrong number of arguments for numerical function: " + name,
                self.language,
                {
                    "function": name,
                    "expected": expected_arity,
                    "received": len(arguments),
                },
            )
        return {"kind": "call", "function": function, "arguments": arguments}


def _canonical_symbol(name: str) -> str:
    base = name.split(".")[-1]
    constants = {
        "E": "e",
        "Exp1": "e",
        "Pi": "pi",
        "e": "e",
        "pi": "pi",
    }
    return constants.get(base, base)


def _canonical_function(name: str) -> str | None:
    base = name.split(".")[-1]
    lowered = base.lower()
    return _FUNCTIONS.get(lowered)


def expression_record(
    source: str,
    *,
    language: str,
    parameters: Sequence[str] = ("x",),
) -> dict[str, JSONValue]:
    """Parse a portable numerical scalar expression into canonical JSON IR."""

    if not isinstance(source, str) or source.strip() == "":
        raise TypeError("numerical expression source must be nonempty")
    names = []
    for parameter in parameters:
        if not isinstance(parameter, str) or not re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_]*", parameter
        ):
            raise ValueError("expression parameters must be simple identifiers")
        names.append(parameter)
    if len(set(names)) != len(names):
        raise ValueError("expression parameters must be unique")
    canonical = canonical_language(language)
    tree = _ExpressionParser(source.strip(), canonical).parse()
    free = sorted(_expression_symbols(tree) - set(names) - {"e", "pi"})
    if free:
        _diagnostic(
            "numerical expression contains unbound symbols",
            canonical,
            {"symbols": free, "parameters": names},
        )
    return {
        "kind": "expression",
        "parameters": names,
        "tree": tree,
    }


def render_expression(
    record: Mapping[str, Any], language: str, *, elementwise: bool = False
) -> str:
    """Render canonical expression IR in one supported scalar syntax.

    Set `elementwise` for MATLAB callbacks whose host API evaluates the
    function on arrays. The operation adapter makes this choice explicitly.
    """

    target = canonical_language(language)
    if record.get("kind") != "expression":
        raise UnsupportedFrontendError(
            FrontendDiagnostic(
                "non_replayable_intent",
                "opaque callbacks cannot be emitted as source code",
                language=target,
            )
        )
    tree = record.get("tree")
    if not isinstance(tree, Mapping):
        raise TypeError("expression record tree must be a mapping")
    return _render(tree, target, 0, elementwise=elementwise)


def _render(
    tree: Mapping[str, Any],
    language: str,
    parent: int,
    *,
    elementwise: bool = False,
) -> str:
    kind = tree.get("kind")
    if kind == "number":
        return str(tree["value"])
    if kind == "symbol":
        name = str(tree["name"])
        if name == "pi":
            return (
                "Pi"
                if language == "wolfram"
                else ("np.pi" if language == "python-scipy" else "pi")
            )
        if name == "e":
            if language == "wolfram":
                return "E"
            if language == "python-scipy":
                return "np.e"
            if language == "matlab":
                return "exp(1)"
            return "e"
        return name
    if kind == "unary":
        operator = "+" if tree.get("operator") == "positive" else "-"
        operand = tree.get("operand")
        if not isinstance(operand, Mapping):
            raise TypeError("unary expression operand must be a mapping")
        value = operator + _render(operand, language, 35, elementwise=elementwise)
        return "(" + value + ")" if 35 < parent else value
    if kind == "call":
        function = str(tree["function"])
        arguments = tree.get("arguments")
        if not isinstance(arguments, Sequence) or isinstance(arguments, str):
            raise TypeError("call expression arguments must be a sequence")
        rendered = []
        for argument in arguments:
            if not isinstance(argument, Mapping):
                raise TypeError("call expression argument must be a mapping")
            rendered.append(_render(argument, language, 0, elementwise=elementwise))
        target_name = _render_function(function, language)
        opening, closing = ("[", "]") if language == "wolfram" else ("(", ")")
        return target_name + opening + ", ".join(rendered) + closing
    if kind == "binary":
        operation = str(tree["operator"])
        precedence = _PRECEDENCE.get(operation)
        if precedence is None:
            raise ValueError("unknown expression operation: " + operation)
        left = tree.get("left")
        right = tree.get("right")
        if not isinstance(left, Mapping) or not isinstance(right, Mapping):
            raise TypeError("binary expression operands must be mappings")
        operator = _render_operator(operation, language, elementwise=elementwise)
        left_text = _render(left, language, precedence, elementwise=elementwise)
        right_parent = precedence if operation == "power" else precedence + 1
        right_text = _render(right, language, right_parent, elementwise=elementwise)
        value = left_text + " " + operator + " " + right_text
        return "(" + value + ")" if precedence < parent else value
    raise ValueError("unknown canonical expression node: " + str(kind))


def _render_function(function: str, language: str) -> str:
    if language == "wolfram":
        names = {
            "abs": "Abs",
            "acos": "ArcCos",
            "asin": "ArcSin",
            "atan": "ArcTan",
            "cos": "Cos",
            "cosh": "Cosh",
            "exp": "Exp",
            "log": "Log",
            "sin": "Sin",
            "sinh": "Sinh",
            "sqrt": "Sqrt",
            "tan": "Tan",
            "tanh": "Tanh",
        }
        return names[function]
    if language == "python-scipy":
        return "np.abs" if function == "abs" else "np." + function
    return function


def _render_operator(
    operation: str, language: str, *, elementwise: bool = False
) -> str:
    operators = {
        "add": "+",
        "subtract": "-",
        "multiply": "*",
        "divide": "/",
        "power": "**" if language == "python-scipy" else "^",
        "equal": "==",
        "not_equal": "!=",
        "less": "<",
        "less_equal": "<=",
        "greater": ">",
        "greater_equal": ">=",
    }
    if language == "matlab" and operation == "not_equal":
        return "~="
    if (
        language == "matlab"
        and elementwise
        and operation
        in (
            "multiply",
            "divide",
            "power",
        )
    ):
        return {"multiply": ".*", "divide": "./", "power": ".^"}[operation]
    return operators[operation]


def _expression_symbols(tree: Mapping[str, Any]) -> set[str]:
    kind = tree.get("kind")
    if kind == "symbol":
        return {str(tree.get("name"))}
    if kind == "number":
        return set()
    if kind == "unary":
        operand = tree.get("operand")
        return _expression_symbols(operand) if isinstance(operand, Mapping) else set()
    if kind == "binary":
        left = tree.get("left")
        right = tree.get("right")
        answer = _expression_symbols(left) if isinstance(left, Mapping) else set()
        if isinstance(right, Mapping):
            answer.update(_expression_symbols(right))
        return answer
    if kind == "call":
        answer: set[str] = set()
        arguments = tree.get("arguments")
        if isinstance(arguments, Sequence) and not isinstance(arguments, str):
            for argument in arguments:
                if isinstance(argument, Mapping):
                    answer.update(_expression_symbols(argument))
        return answer
    return set()


def evaluate_expression(record: Mapping[str, Any], values: Mapping[str, Any]) -> Any:
    """Evaluate validated scalar expression IR for live-binding consistency checks."""

    if record.get("kind") != "expression":
        raise TypeError("expression evaluation requires a scalar expression record")
    tree = record.get("tree")
    if not isinstance(tree, Mapping):
        raise TypeError("expression record tree must be a mapping")
    return _evaluate(tree, values)


def _evaluate(tree: Mapping[str, Any], values: Mapping[str, Any]) -> Any:
    kind = tree.get("kind")
    if kind == "number":
        value = float(str(tree.get("value")))
        if not math.isfinite(value):
            raise ValueError("numerical expression produced a non-finite literal")
        return value
    if kind == "symbol":
        name = str(tree.get("name"))
        if name == "pi":
            return math.pi
        if name == "e":
            return math.e
        if name not in values:
            raise ValueError("numerical expression has no value for symbol " + name)
        return values[name]
    if kind == "unary":
        operand = tree.get("operand")
        if not isinstance(operand, Mapping):
            raise TypeError("unary expression operand must be a mapping")
        value = _evaluate(operand, values)
        return value if tree.get("operator") == "positive" else -value
    if kind == "call":
        function = str(tree.get("function"))
        arguments = tree.get("arguments")
        if not isinstance(arguments, Sequence) or isinstance(arguments, str):
            raise TypeError("call expression arguments must be a sequence")
        evaluated = [
            _evaluate(argument, values)
            for argument in arguments
            if isinstance(argument, Mapping)
        ]
        if len(evaluated) != len(arguments):
            raise TypeError("call expression arguments must be mappings")
        return _FUNCTION_EVALUATORS[function](*evaluated)
    if kind == "binary":
        left = tree.get("left")
        right = tree.get("right")
        if not isinstance(left, Mapping) or not isinstance(right, Mapping):
            raise TypeError("binary expression operands must be mappings")
        lhs = _evaluate(left, values)
        rhs = _evaluate(right, values)
        operation = str(tree.get("operator"))
        if operation == "add":
            return lhs + rhs
        if operation == "subtract":
            return lhs - rhs
        if operation == "multiply":
            return lhs * rhs
        if operation == "divide":
            return lhs / rhs
        if operation == "power":
            return lhs**rhs
        if operation == "equal":
            return lhs == rhs
        if operation == "not_equal":
            return lhs != rhs
        if operation == "less":
            return lhs < rhs
        if operation == "less_equal":
            return lhs <= rhs
        if operation == "greater":
            return lhs > rhs
        if operation == "greater_equal":
            return lhs >= rhs
        raise ValueError("unknown expression operation: " + operation)
    raise ValueError("unknown canonical expression node: " + str(kind))


def expression_semantically_equal(
    left: Mapping[str, Any], right: Mapping[str, Any]
) -> bool:
    """Compare detached canonical expression records."""

    return materialize_object(left, "$.left_expression") == materialize_object(
        right, "$.right_expression"
    )


__all__ = [
    "evaluate_expression",
    "expression_record",
    "expression_semantically_equal",
    "render_expression",
]
