# Sage-compatible symbolic expressions backed by Cortex Compute Engine.
#
# The public object model, coercion rules and text representation are owned by
# Sage.js. Cortex is accessed only through a narrow MathJSON tree adapter.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Callable, Sequence

import sagejs as sage
import sagejs.runtime as runtime

_backend_state = {"value": None}
_FUNCTION_NAMES = {
    "Abs": "abs",
    "Cos": "cos",
    "Exp": "exp",
    "Ln": "log",
    "Log": "log",
    "Sin": "sin",
    "Sqrt": "sqrt",
    "Tan": "tan",
}
_CONSTANT_NAMES = {
    "ExponentialE": "e",
    "Pi": "pi",
}


def _backend() -> Any:
    backend = _backend_state["value"]
    if backend is None:
        module = runtime.require_module("@sagemath/sagejs-symbolic")
        factory = runtime.reflect.get(module, "createSymbolicBackend")
        backend = runtime.reflect.apply(factory, runtime.undefined, [])
        _backend_state["value"] = backend
    return backend


def _call_backend(name: str, parameters: Sequence[Any]) -> Any:
    backend = _backend()
    method = runtime.reflect.get(backend, name)
    return runtime.reflect.apply(method, backend, parameters)


def _number_record_value(value: Any) -> Any:
    if (
        runtime.jstype(value) == "object"
        and not runtime.array.isArray(value)
        and runtime.reflect.has(value, "num")
    ):
        return runtime.reflect.get(value, "num")
    return runtime.undefined


def _join_text(separator: str, values: Sequence[str]) -> str:
    text = ""
    for index in range(len(values)):
        if index:
            text += separator
        text += values[index]
    return text


def _format_expression(value: Any, surrounding: int = 0) -> str:
    value_type = runtime.jstype(value)
    if value_type in ("number", "bigint"):
        return str(value)
    if value_type == "string":
        if value in _CONSTANT_NAMES:
            return _CONSTANT_NAMES[value]
        return str(value)

    recorded_number = _number_record_value(value)
    if recorded_number is not runtime.undefined:
        return str(recorded_number)
    if not runtime.array.isArray(value) or len(value) == 0:
        return str(value)

    head = value[0]
    operands = value[1:]
    precedence = 100
    if head == "Add":
        precedence = 40
        pieces = []
        for index in range(len(operands)):
            argument = operands[index]
            negative = (
                runtime.array.isArray(argument)
                and len(argument) == 2
                and argument[0] == "Negate"
            )
            numeric_negative = (
                runtime.jstype(argument) in ("number", "bigint") and argument < 0
            )
            if index == 0:
                pieces.append(_format_expression(argument, precedence))
            elif negative:
                pieces.append(" - " + _format_expression(argument[1], precedence + 1))
            elif numeric_negative:
                pieces.append(" - " + str(-argument))
            else:
                pieces.append(" + " + _format_expression(argument, precedence))
        text = _join_text("", pieces)
    elif head == "Negate":
        precedence = 70
        text = "-" + _format_expression(operands[0], precedence)
    elif head == "Multiply":
        precedence = 60
        formatted_operands = []
        for argument in operands:
            formatted_operands.append(_format_expression(argument, precedence))
        text = _join_text("*", formatted_operands)
    elif head == "Divide":
        precedence = 60
        text = (
            _format_expression(operands[0], precedence)
            + "/"
            + _format_expression(operands[1], precedence + 1)
        )
    elif head == "Rational":
        precedence = 60
        text = (
            _format_expression(operands[0], precedence)
            + "/"
            + _format_expression(operands[1], precedence + 1)
        )
    elif head == "Power":
        precedence = 80
        text = (
            _format_expression(operands[0], precedence)
            + "^"
            + _format_expression(operands[1], precedence)
        )
    else:
        head_name = str(head)
        if head_name in _FUNCTION_NAMES:
            function_name = _FUNCTION_NAMES[head_name]
        else:
            function_name = head_name
        formatted_operands = []
        for argument in operands:
            formatted_operands.append(_format_expression(argument))
        text = function_name + "(" + _join_text(", ", formatted_operands) + ")"

    if precedence < surrounding:
        return "(" + text + ")"
    return text


def _expression_tree(value: Any) -> Any:
    if isinstance(value, Expression):
        return value._tree
    if runtime.jstype(value) in ("object", "function"):
        value_parent = runtime.reflect.get(value, "_parent")
        parent_kind = runtime.reflect.get(value_parent, "_kind")
        if parent_kind in ("RealField", "RDF"):
            return float(value)
        construction = runtime.reflect.get(value_parent, "_construction")
        if (
            runtime.jstype(construction) == "object"
            and runtime.reflect.get(construction, "kind") == "polynomial"
        ):
            base_ring = runtime.reflect.get(value_parent, "_base")
            if base_ring is sage.ZZ or base_ring is sage.QQ:
                return _call_backend("parse", [str(value)])
    if isinstance(value, sage.Rational):
        return [
            "Rational",
            value.numerator(),
            value.denominator(),
        ]
    if runtime.is_exact_integer(value):
        return runtime.integer_bigint(value)
    if runtime.jstype(value) == "number":
        return value
    if isinstance(value, str):
        return value
    raise TypeError(
        "cannot convert " + type(value).__name__ + " to a symbolic expression"
    )


@runtime.callable_instance_class
class SymbolicRing(sage.Parent):
    """The parent of all Sage.js symbolic expressions."""

    def __init__(self) -> None:
        self._name = "Symbolic Ring"
        self._construction = runtime.undefined
        self._kind = "SR"

    def __call__(self, value: Any = 0) -> Expression:
        if isinstance(value, Expression):
            return value
        return Expression(_expression_tree(value))


@runtime.lightweight_math_class
class Expression(sage.Element):
    """An immutable symbolic expression represented by a MathJSON tree."""

    def __init__(self, tree: Any) -> None:
        self._parent = SR
        self._tree = tree
        runtime.object.freeze(self)

    def _canonical(self, head: str, other: Any) -> Expression:
        tree = [head, self._tree, _expression_tree(other)]
        return Expression(_call_backend("canonical", [tree]))

    def _add_(self, other: Expression) -> Expression:
        return self._canonical("Add", other)

    def _sub_(self, other: Expression) -> Expression:
        return self._canonical("Subtract", other)

    def _mul_(self, other: Expression) -> Expression:
        return self._canonical("Multiply", other)

    def _truediv_(self, other: Expression) -> Expression:
        return self._canonical("Divide", other)

    def _eq_(self, other: Expression) -> bool:
        return runtime.json.stringify(self._tree) == runtime.json.stringify(other._tree)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __neg__(self) -> Expression:
        return Expression(_call_backend("canonical", [["Negate", self._tree]]))

    def __pow__(self, exponent: Any) -> Expression:
        return Expression(
            _call_backend(
                "canonical",
                [["Power", self._tree, _expression_tree(exponent)]],
            )
        )

    def __repr__(self) -> str:
        return _format_expression(self._tree)

    __str__ = __repr__
    toString = __repr__

    def __call__(self, *values: Any, **substitutions: Any) -> Expression:
        """Substitute variables using Sage's expression-call shorthand."""
        variables = self.variables()
        if len(values) > len(variables):
            raise TypeError('too many positional substitutions')
        replacements = runtime.object.create(None)
        for index in range(len(values)):
            runtime.reflect.set(
                replacements,
                _symbol_name(variables[index]),
                _expression_tree(values[index]),
            )
        for key in runtime.object.keys(substitutions):
            runtime.reflect.set(
                replacements,
                key,
                _expression_tree(runtime.reflect.get(substitutions, key)),
            )
        return Expression(
            _call_backend("substitute", [self._tree, replacements]))

    def subs(self, *mappings: Any, **substitutions: Any) -> Expression:
        replacements = runtime.object.create(None)
        if len(mappings) > 1:
            raise TypeError("subs() accepts at most one positional mapping")
        if len(mappings) == 1:
            mapping = mappings[0]
            for key, value in mapping.items():
                name = _symbol_name(key)
                runtime.reflect.set(replacements, name, _expression_tree(value))
        for key in runtime.object.keys(substitutions):
            runtime.reflect.set(
                replacements,
                key,
                _expression_tree(runtime.reflect.get(substitutions, key)),
            )
        return Expression(_call_backend("substitute", [self._tree, replacements]))

    def derivative(
        self,
        variable: Any = None,
        degree: int = 1,
    ) -> Expression:
        if variable is None:
            variables = self.variables()
            if len(variables) != 1:
                raise ValueError("you must specify a variable for differentiation")
            variable = variables[0]
        name = _symbol_name(variable)
        result = self
        for _index in range(int(degree)):
            result = Expression(_call_backend("derivative", [result._tree, name]))
        return result

    diff = derivative

    def integrate(
        self,
        variable: Any,
        lower: Any = runtime.undefined,
        upper: Any = runtime.undefined,
    ) -> Expression:
        name = _symbol_name(variable)
        if (lower is runtime.undefined) != (upper is runtime.undefined):
            raise TypeError(
                'integrate() requires both lower and upper bounds')
        lower_tree = (
            runtime.undefined
            if lower is runtime.undefined
            else _expression_tree(lower)
        )
        upper_tree = (
            runtime.undefined
            if upper is runtime.undefined
            else _expression_tree(upper)
        )
        return Expression(
            _call_backend(
                'integrate',
                [self._tree, name, lower_tree, upper_tree],
            ))

    def find_root(
        self,
        lower: Any,
        upper: Any,
        maxiter: int = 100,
        xtol: float = 1e-12,
    ) -> float:
        variables = self.variables()
        if len(variables) != 1:
            raise ValueError(
                'find_root() requires an expression in one variable')
        evaluator = fast_callable(self, vars=variables)
        left = float(lower)
        right = float(upper)
        left_value = float(evaluator(left))
        right_value = float(evaluator(right))
        if left_value == 0:
            return left
        if right_value == 0:
            return right
        if left_value * right_value > 0:
            raise RuntimeError(
                'f appears to have no zero on the interval')
        for _index in range(int(maxiter)):
            middle = (left + right) / 2.0
            middle_value = float(evaluator(middle))
            if (
                middle_value == 0
                or abs(right - left) <= float(xtol)
            ):
                return middle
            if left_value * middle_value <= 0:
                right = middle
                right_value = middle_value
            else:
                left = middle
                left_value = middle_value
        return (left + right) / 2.0

    def _relation(self, head: str, other: Any) -> Expression:
        return Expression(
            _call_backend(
                'canonical',
                [[head, self._tree, _expression_tree(other)]],
            ))

    def __lt__(self, other: Any) -> Expression:
        return self._relation('Less', other)

    def __le__(self, other: Any) -> Expression:
        return self._relation('LessEqual', other)

    def __gt__(self, other: Any) -> Expression:
        return self._relation('Greater', other)

    def __ge__(self, other: Any) -> Expression:
        return self._relation('GreaterEqual', other)

    def simplify(self) -> Expression:
        return Expression(_call_backend("simplify", [self._tree]))

    def variables(self) -> Any:
        names = _call_backend("variables", [self._tree])
        variables = []
        for name in names:
            variables.append(Expression(name))
        return runtime.math_tuple(variables)

    def n(self) -> Any:
        return _call_backend("numeric", [self._tree])

    numerical_approx = n
    N = n

    def __float__(self) -> float:
        value = self.n()
        if runtime.jstype(value) != "number":
            raise TypeError("symbolic expression does not have a real value")
        return value

    def _plot_fast_callable(self, variable: Any) -> Any:
        if isinstance(variable, (list, tuple)):
            variables = list(variable)
        else:
            variables = [variable]
        return fast_callable(self, vars=variables)


SR = SymbolicRing()


def _to_symbolic(value: Any) -> Expression:
    return SR(value)


runtime.coercion_model.register(sage.ZZ, SR, _to_symbolic)
runtime.coercion_model.register(sage.QQ, SR, _to_symbolic)
runtime.coercion_model.register(
    runtime.reflect.get(runtime.global_object, "RDF"),
    SR,
    _to_symbolic,
)
runtime.coercion_model.register(
    runtime.reflect.get(runtime.global_object, "RR"),
    SR,
    _to_symbolic,
)


def _symbol_name(value: Any) -> str:
    expression = SR(value)
    if runtime.jstype(expression._tree) != "string":
        raise TypeError("expected a symbolic variable")
    if expression._tree in _CONSTANT_NAMES:
        raise TypeError("expected a symbolic variable")
    return expression._tree


def symbolic_variable(names: str) -> Any:
    """Create one or more symbolic variables."""
    if not isinstance(names, str):
        raise TypeError("variable names must be a string")
    split_names = names.replace(",", " ").split(" ")
    variables = []
    for name in split_names:
        if name:
            variable = Expression(name)
            runtime.reflect.set(runtime.global_object, name, variable)
            variables.append(variable)
    if len(variables) == 0:
        raise ValueError("at least one variable name is required")
    if len(variables) == 1:
        return variables[0]
    return runtime.math_tuple(variables)


def _symbolic_function(
    name: str,
    value: Any,
    numeric_function: Callable[[float], float],
) -> Any:
    if runtime.jstype(value) == "number":
        return numeric_function(value)
    tree = [name, _expression_tree(value)]
    return Expression(_call_backend("canonical", [tree]))


def sin(value: Any) -> Any:
    return _symbolic_function("Sin", value, runtime.math.sin)


def cos(value: Any) -> Any:
    return _symbolic_function("Cos", value, runtime.math.cos)


def tan(value: Any) -> Any:
    return _symbolic_function("Tan", value, runtime.math.tan)


def exp(value: Any) -> Any:
    return _symbolic_function("Exp", value, runtime.math.exp)


def log(value: Any, base: Any = None) -> Any:
    natural = _symbolic_function("Ln", value, runtime.math.log)
    if base is None:
        return natural
    denominator = _symbolic_function("Ln", base, runtime.math.log)
    return natural / denominator


def floor(value: Any) -> Any:
    if runtime.jstype(value) == "number":
        return runtime.math.floor(value)
    return _symbolic_function("Floor", value, runtime.math.floor)


def ceil(value: Any) -> Any:
    if runtime.jstype(value) == "number":
        return runtime.math.ceil(value)
    return _symbolic_function("Ceil", value, runtime.math.ceil)


def sqrt(value: Any) -> Any:
    return _symbolic_function("Sqrt", value, runtime.math.sqrt)


def fast_callable(
    expression: Any,
    vars: Sequence[Any] | None = None,
) -> Any:
    """Compile a symbolic expression to a hot JavaScript numeric function."""
    symbolic_expression = SR(expression)
    variables = symbolic_expression.variables() if vars is None else list(vars)
    names = [_symbol_name(variable) for variable in variables]
    return _call_backend("compile", [symbolic_expression._tree, names])


pi = Expression("Pi")
e = Expression("ExponentialE")


def assume(*conditions: Any) -> None:
    """Accept symbolic assumptions for Sage source compatibility.

    Cortex currently evaluates the RH expressions without an assumption
    context.  Retaining the call as an explicit no-op is preferable to
    silently rewriting the pinned source.
    """
    return None


def _initialize_sage_symbolic_globals() -> None:
    runtime.reflect.set(runtime.global_object, "x", Expression("x"))

# ``var`` is valid Python but a JavaScript reserved word. The compiler lowers
# references to its collision-safe spelling; publish both names so Python
# introspection remains natural while older bootstrap compilers can parse this
# source file.
runtime.reflect.set(runtime.global_object, "var", symbolic_variable)
runtime.reflect.set(runtime.global_object, "ρσ_py_var", symbolic_variable)
runtime.reflect.set(symbolic_variable, "__name__", "var")
if runtime.reflect.get(
    runtime.global_object, "__sagejs_sage_mode__"
) is True:
    _initialize_sage_symbolic_globals()


runtime.set_class_repr(
    Expression,
    "<class 'sage.symbolic.expression.Expression'>",
)
runtime.set_class_repr(
    SymbolicRing,
    "<class 'sage.symbolic.ring.SymbolicRing'>",
)
