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
    "ImaginaryUnit": "I",
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


def _positive_term(value: Any) -> Any:
    """Return the positive form of a syntactically negative MathJSON term."""
    if (
        runtime.array.isArray(value)
        and len(value) == 2
        and value[0] == "Negate"
    ):
        return value[1]
    if runtime.jstype(value) in ("number", "bigint") and value < 0:
        return -value
    if (
        runtime.array.isArray(value)
        and len(value) == 3
        and value[0] == "Rational"
        and value[1] < 0
    ):
        return ["Rational", -value[1], value[2]]
    if (
        runtime.array.isArray(value)
        and len(value) >= 3
        and value[0] == "Multiply"
    ):
        first = value[1]
        replacement = runtime.undefined
        if runtime.jstype(first) in ("number", "bigint") and first < 0:
            replacement = -first
        elif (
            runtime.array.isArray(first)
            and len(first) == 3
            and first[0] == "Rational"
            and first[1] < 0
        ):
            replacement = ["Rational", -first[1], first[2]]
        if replacement is not runtime.undefined:
            return ["Multiply", replacement] + list(value[2:])
    return runtime.undefined


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
            positive = _positive_term(argument)
            if index == 0:
                pieces.append(_format_expression(argument, precedence))
            elif positive is not runtime.undefined:
                pieces.append(
                    " - " + _format_expression(
                        positive, precedence + 1))
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
    elif head in [
        "Equal", "Less", "LessEqual", "Greater", "GreaterEqual"
    ]:
        precedence = 20
        operators = {
            "Equal": " == ",
            "Less": " < ",
            "LessEqual": " <= ",
            "Greater": " > ",
            "GreaterEqual": " >= ",
        }
        text = (
            _format_expression(operands[0], precedence)
            + operators[head]
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


def _exact_scalar_from_tree(value: Any) -> Any:
    if runtime.is_exact_integer(value):
        return runtime.normalize_integer(value)
    if runtime.jstype(value) == 'number':
        return value
    if (
        runtime.array.isArray(value)
        and len(value) == 3
        and value[0] == 'Rational'
    ):
        return runtime.rational_class(value[1], value[2])
    raise NotImplementedError(
        'arbitrary-precision special functions currently '
        'require exact scalar arguments')


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

    def _var(self, names: str) -> Any:
        return symbolic_variable(names)


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
        return bool(_call_backend(
            "same", [self._tree, other._tree]))

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __eq__(self, other: object) -> Any:
        try:
            right = SR(other)
        except Exception:
            return False
        if self._eq_(right):
            return True
        return self._relation('Equal', right)

    def __bool__(self) -> bool:
        evaluated = _call_backend('evaluate', [self._tree])
        if evaluated is True:
            return True
        return False

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
        expression = self
        if (
            runtime.array.isArray(self._tree)
            and len(self._tree) == 3
            and self._tree[0] == 'Equal'
        ):
            expression = Expression([
                'Subtract', self._tree[1], self._tree[2]])
        variables = expression.variables()
        if len(variables) != 1:
            raise ValueError(
                'find_root() requires an expression in one variable')
        evaluator = fast_callable(expression, vars=variables)
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

    def partial_fraction(self, variable: Any = None) -> Expression:
        """
        Decompose a rational expression with distinct linear factors.

        The current exact implementation handles a univariate denominator
        expressed as a product of distinct monic linear factors. Unsupported
        nonlinear or repeated-factor cases raise `NotImplementedError`.
        """
        variables = self.variables()
        if variable is None:
            if len(variables) != 1:
                raise ValueError(
                    'partial_fraction() requires an explicit variable')
            variable = variables[0]
        name = _symbol_name(variable)
        tree = self._tree
        if (
            not runtime.array.isArray(tree)
            or len(tree) != 3
            or tree[0] != 'Divide'
        ):
            return self
        numerator = tree[1]
        denominator = tree[2]
        if (
            runtime.array.isArray(denominator)
            and len(denominator) >= 3
            and denominator[0] == 'Multiply'
        ):
            factors = list(denominator[1:])
        else:
            factors = [denominator]
        roots = []
        for factor_value in factors:
            if (
                not runtime.array.isArray(factor_value)
                or len(factor_value) != 3
                or factor_value[0] != 'Add'
            ):
                raise NotImplementedError(
                    'partial fractions currently require '
                    'distinct monic linear factors')
            if factor_value[1] == name:
                constant = factor_value[2]
            elif factor_value[2] == name:
                constant = factor_value[1]
            else:
                raise NotImplementedError(
                    'partial fractions currently require '
                    'distinct monic linear factors')
            roots.append(['Negate', constant])

        terms = []
        for index in range(len(factors)):
            denominator_at_root = 1
            for other_index in range(len(factors)):
                if other_index != index:
                    difference = [
                        'Subtract',
                        roots[index],
                        roots[other_index],
                    ]
                    denominator_at_root = [
                        'Multiply',
                        denominator_at_root,
                        difference,
                    ]
            coefficient = _call_backend(
                'simplify',
                [['Divide', numerator, denominator_at_root]],
            )
            term = ['Divide', coefficient, factors[index]]
            if _positive_term(coefficient) is not runtime.undefined:
                terms.insert(0, term)
            else:
                terms.append(term)
        return Expression(['Add'] + terms)

    def variables(self) -> Any:
        names = _call_backend("variables", [self._tree])
        variables = []
        for name in names:
            variables.append(Expression(name))
        return runtime.math_tuple(variables)

    def _arguments_tuple(self) -> Any:
        return runtime.math_tuple([])

    def n(
        self,
        prec: Any = None,
        digits: Any = None,
    ) -> Any:
        if digits is not None:
            decimal_digits = int(digits)
        elif prec is None:
            decimal_digits = 15
        else:
            decimal_digits = max(
                1,
                int(
                    runtime.math.floor(
                        (int(prec) - 1) * 0.3010299956639812
                    )
                ),
            )
        if (
            runtime.array.isArray(self._tree)
            and len(self._tree) == 3
            and self._tree[0] == 'BesselI'
        ):
            if digits is not None:
                bit_precision = max(
                    53,
                    int(
                        runtime.math.ceil(
                            int(digits) / 0.3010299956639812
                        )
                    ) + 8,
                )
            elif prec is None:
                bit_precision = 53
            else:
                bit_precision = max(2, int(prec))
            field = runtime.reflect.get(
                runtime.global_object, 'ComplexField')(
                    bit_precision)
            order = field(_exact_scalar_from_tree(
                self._tree[1]))
            argument = field(_exact_scalar_from_tree(
                self._tree[2]))
            value = field._fromNative(
                runtime.flint_backend().complexBesselI(
                    order._native, argument._native))
            imaginary = value.imag()
            if imaginary == 0:
                return value.real()
            return value
        result = _call_backend(
            "numeric", [self._tree, decimal_digits])
        return NumericalApproximation(
            runtime.reflect.get(result, 'text'),
            runtime.reflect.get(result, 'value'),
        )

    numerical_approx = n
    N = n

    def __float__(self) -> float:
        return float(self.n())

    def _plot_fast_callable(self, variable: Any) -> Any:
        if isinstance(variable, (list, tuple)):
            variables = list(variable)
        else:
            variables = [variable]
        return fast_callable(self, vars=variables)

    def _plot_zero_set_expression(self) -> Expression:
        """Normalize a relation to the scalar function defining its zero set."""
        if (
            runtime.array.isArray(self._tree)
            and len(self._tree) == 3
            and self._tree[0] == 'Equal'
        ):
            return Expression(_call_backend(
                'canonical',
                [['Subtract', self._tree[1], self._tree[2]]],
            ))
        return self


class CallableExpression(Expression):
    """A symbolic expression with an explicit ordered argument tuple."""

    def __init__(self, argument_values: Any, value: Any) -> None:
        self._arguments = runtime.math_tuple([
            SR(argument) for argument in argument_values
        ])
        Expression.__init__(self, _expression_tree(value))

    def _arguments_tuple(self) -> Any:
        return self._arguments

    def __call__(
        self,
        *values: Any,
        **substitutions: Any,
    ) -> Expression:
        if len(values) > len(self._arguments):
            raise TypeError('too many positional substitutions')
        replacements = runtime.object.create(None)
        for index in range(len(values)):
            runtime.reflect.set(
                replacements,
                _symbol_name(self._arguments[index]),
                _expression_tree(values[index]),
            )
        for key in runtime.object.keys(substitutions):
            runtime.reflect.set(
                replacements,
                key,
                _expression_tree(
                    runtime.reflect.get(substitutions, key)),
            )
        return Expression(
            _call_backend('substitute', [self._tree, replacements]))

    def derivative(
        self,
        variable: Any = None,
        degree: int = 1,
    ) -> CallableExpression:
        if variable is None:
            if len(self._arguments) == 0:
                raise ValueError(
                    'you must specify a variable for differentiation')
            variable = self._arguments[0]
        result = Expression.derivative(
            self, variable, degree)
        return CallableExpression(self._arguments, result)

    diff = derivative

    def __repr__(self) -> str:
        names = [
            _symbol_name(argument)
            for argument in self._arguments
        ]
        left = (
            names[0]
            if len(names) == 1
            else '(' + ', '.join(names) + ')'
        )
        return left + ' |--> ' + _format_expression(self._tree)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class UndefinedSymbolicFunction:
    """A named symbolic function which can be applied to expressions."""

    def __init__(self, name: str) -> None:
        self._name = str(name)
        runtime.object.freeze(self)

    def __call__(self, *values: Any) -> Expression:
        return Expression(
            [self._name]
            + [_expression_tree(value) for value in values]
        )

    def __repr__(self) -> str:
        return self._name

    __str__ = __repr__
    toString = __repr__


SR = SymbolicRing()


@runtime.lightweight_math_class
class NumericalApproximation:

    def __init__(self, text: str, value: Any) -> None:
        self._text = text
        self._value = value
        runtime.object.freeze(self)

    def __repr__(self) -> str:
        return self._text

    __str__ = __repr__
    toString = __repr__

    def __float__(self) -> float:
        if runtime.jstype(self._value) != 'number':
            raise TypeError('numerical approximation is not real')
        return self._value


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
    r"""
    Create one or more symbolic variables and publish them in the session.

    Names may be separated by commas, spaces, or both.  A single name returns
    one symbolic expression; multiple names return a tuple.

    ### Examples

    ```sage
    sage: var('x y')
    (x, y)
    sage: (x^2 + y).derivative(x)
    2*x
    ```
    """
    if not isinstance(names, str):
        raise TypeError("variable names must be a string")
    variables = []
    for comma_part in names.split(","):
        for name in comma_part.split(" "):
            if name:
                variable = Expression(name)
                runtime.reflect.set(
                    runtime.global_object, name, variable)
                variables.append(variable)
    if len(variables) == 0:
        raise ValueError("at least one variable name is required")
    if len(variables) == 1:
        return variables[0]
    return runtime.math_tuple(variables)


def symbolic_function(
    argument_values: Any,
    value: Any,
) -> CallableExpression:
    return CallableExpression(argument_values, value)


def symbolic_function_factory(name: str) -> UndefinedSymbolicFunction:
    return UndefinedSymbolicFunction(name)


runtime.reflect.set(
    runtime.global_object,
    'ρσ_py_function',
    symbolic_function_factory,
)


runtime.reflect.set(
    runtime.reflect.get(SymbolicRing, 'prototype'),
    'var',
    runtime.reflect.get(
        runtime.reflect.get(SymbolicRing, 'prototype'),
        '_var',
    ),
)


def _symbolic_function(
    name: str,
    value: Any,
    numeric_function: Callable[[float], float],
) -> Any:
    if (
        runtime.jstype(value) == "number"
        and not runtime.number.isSafeInteger(value)
    ):
        return numeric_function(value)
    parent_value = getattr(value, '_parent', None)
    if getattr(parent_value, '_kind', None) in ['RDF', 'RealField']:
        return numeric_function(float(value))
    tree = [name, _expression_tree(value)]
    return Expression(_call_backend("evaluate", [tree]))


def sin(value: Any) -> Any:
    return _symbolic_function("Sin", value, runtime.math.sin)


def cos(value: Any) -> Any:
    return _symbolic_function("Cos", value, runtime.math.cos)


def tan(value: Any) -> Any:
    return _symbolic_function("Tan", value, runtime.math.tan)


def tanh(value: Any) -> Any:
    return _symbolic_function("Tanh", value, runtime.math.tanh)


def exp(value: Any) -> Any:
    return _symbolic_function("Exp", value, runtime.math.exp)


def log(value: Any, base: Any = None) -> Any:
    natural = _symbolic_function("Ln", value, runtime.math.log)
    if base is None:
        return natural
    denominator = _symbolic_function("Ln", base, runtime.math.log)
    return (natural / denominator).simplify()


def floor(value: Any) -> Any:
    if runtime.jstype(value) == "number":
        return runtime.math.floor(value)
    if isinstance(value, Expression) and len(value.variables()) == 0:
        return runtime.math.floor(float(value))
    return _symbolic_function("Floor", value, runtime.math.floor)


def ceil(value: Any) -> Any:
    if runtime.jstype(value) == "number":
        return runtime.math.ceil(value)
    if isinstance(value, Expression) and len(value.variables()) == 0:
        return runtime.math.ceil(float(value))
    return _symbolic_function("Ceil", value, runtime.math.ceil)


def sqrt(value: Any) -> Any:
    return _symbolic_function("Sqrt", value, runtime.math.sqrt)


def bessel_I(order: Any, value: Any) -> Expression:
    return Expression(_call_backend(
        'evaluate',
        [['BesselI', _expression_tree(order), _expression_tree(value)]],
    ))


def diff(
    expression: Any,
    variable: Any = None,
    degree: int = 1,
) -> Expression:
    return SR(expression).derivative(variable, degree)


def integral(
    expression: Any,
    variable: Any,
    lower: Any = runtime.undefined,
    upper: Any = runtime.undefined,
) -> Expression:
    return SR(expression).integrate(
        variable, lower, upper)


def _solve_exact_number_tree(value: Any) -> Any:
    if runtime.jstype(value) != 'number':
        return value
    text = str(value)
    if '.' not in text or 'e' in text or 'E' in text:
        return value
    negative = text.startswith('-')
    if negative:
        text = text[1:]
    pieces = text.split('.')
    numerator = int(pieces[0] + pieces[1])
    if negative:
        numerator = -numerator
    rational = sage.QQ(numerator) / sage.QQ(10 ** len(pieces[1]))
    return _expression_tree(rational)


def _solve_partial_relation(
    tree: Any,
    variables: Any,
) -> Any:
    if (
        len(variables) != 1
        or not runtime.array.isArray(tree)
        or len(tree) != 3
        or tree[0] != 'Equal'
    ):
        return runtime.undefined
    left = tree[1]
    right = tree[2]
    if (
        not runtime.array.isArray(left)
        or len(left) < 3
        or left[0] != 'Multiply'
    ):
        return runtime.undefined
    exact_right = _solve_exact_number_tree(right)
    exact_right_is_number = (
        runtime.jstype(exact_right) in ('number', 'bigint')
        or (
            runtime.array.isArray(exact_right)
            and len(exact_right) == 3
            and exact_right[0] == 'Rational'
        )
    )
    if not exact_right_is_number:
        return runtime.undefined
    if (
        runtime.jstype(exact_right) in ('number', 'bigint')
        and exact_right == 0
    ):
        return runtime.undefined
    if (
        runtime.array.isArray(exact_right)
        and len(exact_right) == 3
        and exact_right[0] == 'Rational'
        and exact_right[1] == 0
    ):
        return runtime.undefined
    variable_name = _symbol_name(variables[0])
    selected = -1
    for index in range(1, len(left)):
        factor_variables = Expression(left[index]).variables()
        for factor_variable in factor_variables:
            if _symbol_name(factor_variable) == variable_name:
                selected = index
                break
        if selected >= 0:
            break
    if selected < 0:
        return runtime.undefined
    remaining = []
    for index in range(1, len(left)):
        if index != selected:
            remaining.append(left[index])
    if len(remaining) == 1:
        denominator = remaining[0]
    else:
        denominator = ['Multiply'] + remaining
    return Expression([
        'Equal',
        left[selected],
        ['Divide', exact_right, denominator],
    ])


def solve(
    equations: Any,
    *variables: Any,
    **options: Any,
) -> Any:
    r"""
    Solve supported elementary symbolic equations.

    One equation or a list of equations may be supplied, followed by one or
    more variables. Set `solution_dict=True` for dictionary-valued
    solutions.

    ### Examples

    ```sage
    sage: solve(x^2 == 4, x)
    [x == -2, x == 2]
    ```

    Sage.js delegates elementary solving to Cortex Compute Engine and applies
    a few exact Sage-compatible reductions.  If the backend cannot solve an
    equation, Sage.js returns an equivalent unsolved relation instead of the
    mathematically misleading empty list.  Coupled nonlinear systems and many
    transcendental families remain outside the current supported surface.
    """
    solution_option = runtime.reflect.get(
        options, 'solution_dict')
    solution_dict = False
    if solution_option is not runtime.undefined:
        solution_dict = bool(solution_option)
    runtime.reflect.deleteProperty(options, 'solution_dict')
    if len(runtime.object.keys(options)):
        raise TypeError('unsupported solve() option')
    if isinstance(equations, (list, tuple)):
        equation_values = list(equations)
    else:
        equation_values = [equations]
    if len(equation_values) == 0:
        return []
    trees = []
    for equation in equation_values:
        tree = _expression_tree(equation)
        if (
            not runtime.array.isArray(tree)
            or len(tree) == 0
            or tree[0] != 'Equal'
        ):
            tree = ['Equal', tree, 0]
        trees.append(tree)
    if len(trees) == 1:
        expression_tree = trees[0]
    else:
        expression_tree = ['List'] + trees
    if len(variables) == 1 and isinstance(
        variables[0], (list, tuple)
    ):
        variables = runtime.math_tuple(list(variables[0]))
    if len(variables) == 0:
        variables = Expression(expression_tree).variables()
    names = [_symbol_name(variable) for variable in variables]
    result = _call_backend('solve', [expression_tree, names])
    kind = runtime.reflect.get(result, 'kind')
    values = runtime.reflect.get(result, 'values')
    if kind == 'roots':
        if len(values) == 0:
            partial = _solve_partial_relation(
                expression_tree, variables)
            if partial is not runtime.undefined:
                return [partial]
            return [SR(equation_values[0])]
        answers = []
        for value in values:
            relation = Expression([
                'Equal', _expression_tree(variables[0]), value])
            if solution_dict:
                mapping = {}
                mapping[variables[0]] = Expression(value)
                answers.append(mapping)
            else:
                answers.append(relation)
        return answers
    if kind == 'mapping':
        mapping = {}
        relations = []
        for variable in variables:
            name = _symbol_name(variable)
            value = runtime.reflect.get(values, name)
            if value is runtime.undefined:
                continue
            expression_value = Expression(value).simplify()
            mapping[variable] = expression_value
            relations.append(Expression([
                'Equal',
                _expression_tree(variable),
                expression_value._tree,
            ]))
        if solution_dict:
            return [mapping]
        return [relations]
    return [SR(equation_values[0])]


def find_root(
    expression: Any,
    lower: Any,
    upper: Any,
    **options: Any,
) -> float:
    return SR(expression).find_root(
        lower, upper, **options)


def numerical_approx(
    value: Any,
    prec: Any = None,
    digits: Any = None,
) -> Any:
    if isinstance(value, Expression):
        return value.n(prec=prec, digits=digits)
    if hasattr(value, 'numerical_approx'):
        return value.numerical_approx(
            prec=prec, digits=digits)
    return SR(value).n(prec=prec, digits=digits)


n = numerical_approx
N = numerical_approx


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
_imaginary_unit = Expression("ImaginaryUnit")
i = _imaginary_unit
runtime.reflect.set(
    runtime.global_object, 'I', _imaginary_unit)


def assume(*conditions: Any) -> None:
    """Accept symbolic assumptions for Sage source compatibility.

    Cortex currently evaluates the RH expressions without an assumption
    context.  Retaining the call as an explicit no-op is preferable to
    silently rewriting the pinned source.
    """
    return None


def reset(name: Any = None) -> None:
    """Restore the small set of symbolic globals initialized by Sage.js."""
    names = ['x', 'i'] if name is None else [str(name)]
    for current in names:
        if current == 'x':
            runtime.reflect.set(
                runtime.global_object, 'x', Expression('x'))
        elif current == 'i':
            runtime.reflect.set(
                runtime.global_object, 'i', _imaginary_unit)
        else:
            runtime.reflect.deleteProperty(
                runtime.global_object, current)


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
    CallableExpression,
    "<class 'sage.symbolic.expression.Expression'>",
)
runtime.reflect.set(
    runtime.reflect.get(CallableExpression, 'prototype'),
    'arguments',
    runtime.reflect.get(
        runtime.reflect.get(CallableExpression, 'prototype'),
        '_arguments_tuple',
    ),
)
runtime.reflect.set(
    runtime.reflect.get(Expression, 'prototype'),
    'arguments',
    runtime.reflect.get(
        runtime.reflect.get(Expression, 'prototype'),
        '_arguments_tuple',
    ),
)
runtime.set_class_repr(
    SymbolicRing,
    "<class 'sage.symbolic.ring.SymbolicRing'>",
)


def _symbolic_doc(
    tags: list[str],
    compatibility_status: str,
    compatibility_notes: str,
    limitations: Any = None,
) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ['symbolic mathematics'],
        [tags],
    )
    return {
        'kind': 'function',
        'module': 'sage.symbolic',
        'tags': all_tags,
        'backends': ['Cortex Compute Engine'],
        'sage_compatibility': {
            'status': compatibility_status,
            'notes': compatibility_notes,
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath symbolic API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'calculus/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'library-backed',
                'source': 'Cortex Compute Engine',
                'url': 'https://cortexjs.io/compute-engine/',
            },
        ],
        'references': [
            {
                'id': 'cortex-compute-engine',
                'type': 'software',
                'title': 'Cortex Compute Engine',
                'url': 'https://cortexjs.io/compute-engine/',
            },
        ],
        'implementation': {
            'algorithm': (
                'MathJSON adapter over Cortex Compute Engine'
            ),
        },
        'limitations': [] if limitations is None else limitations,
    }


runtime.register_doc(
    'var',
    symbolic_variable,
    _symbolic_doc(
        ['variables', 'expressions'],
        'compatible',
        'Matches Sage variable creation for supported names.',
    ),
)
runtime.register_doc(
    'solve',
    solve,
    _symbolic_doc(
        ['equations', 'solving'],
        'partial',
        (
            'Supported elementary equations follow Sage-style output; '
            'unsupported families are returned as unsolved relations.'
        ),
        [
            'Coupled nonlinear systems are not generally implemented.',
            'Many transcendental solution families are not implemented.',
        ],
    ),
)
runtime.register_doc(
    'fast_callable',
    fast_callable,
    _symbolic_doc(
        ['evaluation', 'performance'],
        'partial',
        (
            'Compiles supported real-valued symbolic expressions directly '
            'to JavaScript numeric functions.'
        ),
        ['The current compiler targets JavaScript numeric evaluation.'],
    ),
)
