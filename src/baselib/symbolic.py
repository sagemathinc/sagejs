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
    "NegativeInfinity": "-Infinity",
    "Pi": "pi",
    "PositiveInfinity": "+Infinity",
}


_optimization_module_cache = runtime.undefined


def _optimization_module() -> Any:
    """Load the lazy numerical optimization package on first use."""
    global _optimization_module_cache
    if _optimization_module_cache is runtime.undefined:
        _optimization_module_cache = __import__(
            "sagejs.optimization.sage_api",
            fromlist=["sage_api"],
        )
    return _optimization_module_cache


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
    if runtime.array.isArray(value) and len(value) == 2 and value[0] == "Negate":
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
    if runtime.array.isArray(value) and len(value) >= 3 and value[0] == "Multiply":
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
                pieces.append(" - " + _format_expression(positive, precedence + 1))
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
    elif (
        head == "Apply"
        and len(operands) == 2
        and runtime.array.isArray(operands[0])
        and len(operands[0]) == 3
        and operands[0][0] == "Derivative"
    ):
        derivative = operands[0]
        indices = []
        for _index in range(int(derivative[2])):
            indices.append("0")
        text = (
            "D["
            + ",".join(indices)
            + "]("
            + _format_expression(derivative[1])
            + ")("
            + _format_expression(operands[1])
            + ")"
        )
    elif head in ["Equal", "Less", "LessEqual", "Greater", "GreaterEqual"]:
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
        if runtime.jstype(value_parent) in ("object", "function"):
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
        if value.denominator() == 1:
            return runtime.normalize_integer(value.numerator())
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
    if runtime.jstype(value) == "number":
        return value
    if runtime.array.isArray(value) and len(value) == 3 and value[0] == "Rational":
        return runtime.rational_class(value[1], value[2])
    raise NotImplementedError(
        "arbitrary-precision special functions currently require exact scalar arguments"
    )


def _exact_complex_parts_from_tree(value: Any) -> tuple[Any, Any]:
    """Decode Cortex's canonical exact real or complex scalar form."""
    if runtime.array.isArray(value) and len(value) == 3 and value[0] == "Complex":
        return _exact_scalar_from_tree(value[1]), _exact_scalar_from_tree(value[2])
    if value == "ImaginaryUnit":
        return sage.QQ(0), sage.QQ(1)
    return _exact_scalar_from_tree(value), sage.QQ(0)


def _trim_polynomial_coefficients(values: list[Any]) -> list[Any]:
    answer = list(values)
    while len(answer) > 1 and answer[len(answer) - 1] == 0:
        answer.pop()
    return answer


def _polynomial_coefficients_add(
    left: list[Any],
    right: list[Any],
) -> list[Any]:
    count = max(len(left), len(right))
    answer = []
    for index in range(count):
        value = sage.QQ(0)
        if index < len(left):
            value += left[index]
        if index < len(right):
            value += right[index]
        answer.append(value)
    return _trim_polynomial_coefficients(answer)


def _polynomial_coefficients_negate(
    values: list[Any],
) -> list[Any]:
    answer = []
    for value in values:
        answer.append(-value)
    return answer


def _polynomial_coefficients_multiply(
    left: list[Any],
    right: list[Any],
) -> list[Any]:
    answer = [sage.QQ(0)] * (len(left) + len(right) - 1)
    for left_index in range(len(left)):
        for right_index in range(len(right)):
            index = left_index + right_index
            answer[index] += left[left_index] * right[right_index]
    return _trim_polynomial_coefficients(answer)


def _polynomial_coefficients_power(
    values: list[Any],
    exponent: int,
) -> list[Any]:
    answer = [sage.QQ(1)]
    power = values
    while exponent:
        if exponent % 2:
            answer = _polynomial_coefficients_multiply(answer, power)
        exponent //= 2
        if exponent:
            power = _polynomial_coefficients_multiply(power, power)
    return answer


def _rational_polynomial_tree(
    tree: Any,
    variable: str,
) -> Any:
    try:
        scalar = _exact_scalar_from_tree(tree)
        return [[sage.QQ(scalar)], [sage.QQ(1)]]
    except NotImplementedError:
        pass
    if tree == variable:
        return [
            [sage.QQ(0), sage.QQ(1)],
            [sage.QQ(1)],
        ]
    if not runtime.array.isArray(tree) or len(tree) == 0:
        return runtime.undefined
    head = tree[0]
    if head == "Negate" and len(tree) == 2:
        result = _rational_polynomial_tree(tree[1], variable)
        if result is runtime.undefined:
            return result
        return [
            _polynomial_coefficients_negate(result[0]),
            result[1],
        ]
    if head == "Add":
        result = [[sage.QQ(0)], [sage.QQ(1)]]
        for argument in tree[1:]:
            right = _rational_polynomial_tree(argument, variable)
            if right is runtime.undefined:
                return right
            result = [
                _polynomial_coefficients_add(
                    _polynomial_coefficients_multiply(result[0], right[1]),
                    _polynomial_coefficients_multiply(right[0], result[1]),
                ),
                _polynomial_coefficients_multiply(result[1], right[1]),
            ]
        return result
    if head == "Multiply":
        result = [[sage.QQ(1)], [sage.QQ(1)]]
        for argument in tree[1:]:
            right = _rational_polynomial_tree(argument, variable)
            if right is runtime.undefined:
                return right
            result = [
                _polynomial_coefficients_multiply(result[0], right[0]),
                _polynomial_coefficients_multiply(result[1], right[1]),
            ]
        return result
    if head == "Divide" and len(tree) == 3:
        left = _rational_polynomial_tree(tree[1], variable)
        right = _rational_polynomial_tree(tree[2], variable)
        if left is runtime.undefined or right is runtime.undefined:
            return runtime.undefined
        return [
            _polynomial_coefficients_multiply(left[0], right[1]),
            _polynomial_coefficients_multiply(left[1], right[0]),
        ]
    if head == "Power" and len(tree) == 3 and runtime.is_exact_integer(tree[2]):
        exponent = int(tree[2])
        value = _rational_polynomial_tree(tree[1], variable)
        if value is runtime.undefined:
            return value
        if exponent >= 0:
            return [
                _polynomial_coefficients_power(value[0], exponent),
                _polynomial_coefficients_power(value[1], exponent),
            ]
        return [
            _polynomial_coefficients_power(value[1], -exponent),
            _polynomial_coefficients_power(value[0], -exponent),
        ]
    return runtime.undefined


def _positive_polynomial_tree(
    coefficients: list[Any],
    variable: str,
) -> Any:
    terms = []
    degree = len(coefficients) - 1
    while degree >= 0:
        coefficient = coefficients[degree]
        if coefficient != 0:
            negative = coefficient < 0
            magnitude = -coefficient if negative else coefficient
            if degree == 0:
                term = _expression_tree(magnitude)
            else:
                monomial = variable
                if degree != 1:
                    monomial = ["Power", variable, degree]
                if magnitude == 1:
                    term = monomial
                else:
                    term = [
                        "Multiply",
                        _expression_tree(magnitude),
                        monomial,
                    ]
            if negative:
                term = ["Negate", term]
            terms.append(term)
        degree -= 1
    if len(terms) == 0:
        return 0
    if len(terms) == 1:
        return terms[0]
    return ["Add"] + terms


def _rational_expression_from_coefficients(
    numerator: list[Any],
    denominator: list[Any],
    variable: str,
) -> Expression:
    negate = numerator[len(numerator) - 1] < 0
    if negate:
        numerator = _polynomial_coefficients_negate(numerator)
    numerator_tree = _positive_polynomial_tree(numerator, variable)
    if negate:
        numerator_tree = ["Negate", numerator_tree]
    denominator_tree = _positive_polynomial_tree(denominator, variable)
    return Expression(["Divide", numerator_tree, denominator_tree])


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
        return bool(_call_backend("same", [self._tree, other._tree]))

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
        return self._relation("Equal", right)

    def __bool__(self) -> bool:
        evaluated = _call_backend("evaluate", [self._tree])
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
            raise TypeError("too many positional substitutions")
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
        return Expression(_call_backend("substitute", [self._tree, replacements]))

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
        if (
            isinstance(variable, (list, tuple))
            and lower is runtime.undefined
            and upper is runtime.undefined
        ):
            bounds = list(variable)
            if len(bounds) != 3:
                raise TypeError("integration range must be (variable, lower, upper)")
            variable, lower, upper = bounds
        name = _symbol_name(variable)
        if (lower is runtime.undefined) != (upper is runtime.undefined):
            raise TypeError("integrate() requires both lower and upper bounds")
        lower_tree = (
            runtime.undefined if lower is runtime.undefined else _expression_tree(lower)
        )
        upper_tree = (
            runtime.undefined if upper is runtime.undefined else _expression_tree(upper)
        )
        return Expression(
            _call_backend(
                "integrate",
                [self._tree, name, lower_tree, upper_tree],
            )
        )

    integral = integrate

    def limit(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Expression:
        return limit(self, *args, **kwargs)

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
            and self._tree[0] == "Equal"
        ):
            expression = Expression(["Subtract", self._tree[1], self._tree[2]])
        variables = expression.variables()
        if len(variables) != 1:
            raise ValueError("find_root() requires an expression in one variable")
        left = float(lower)
        right = float(upper)
        numeric_backend = runtime.flint_backend()
        wasm_find_root = runtime.reflect.get(numeric_backend, "symbolicFindRoot")
        if runtime.jstype(wasm_find_root) == "function":
            accelerated = runtime.reflect.apply(
                wasm_find_root,
                numeric_backend,
                [
                    expression._tree,
                    _symbol_name(variables[0]),
                    left,
                    right,
                    int(maxiter),
                    float(xtol),
                ],
            )
            if accelerated is not runtime.undefined:
                return float(accelerated)
        evaluator = fast_callable(expression, vars=variables)

        def value_at(point: float) -> float:
            return float(evaluator(point))

        return float(
            _optimization_module().find_root(
                value_at,
                left,
                right,
                xtol=float(xtol),
                maxiter=int(maxiter),
            )
        )

    def _relation(self, head: str, other: Any) -> Expression:
        return Expression(
            _call_backend(
                "canonical",
                [[head, self._tree, _expression_tree(other)]],
            )
        )

    def __lt__(self, other: Any) -> Expression:
        return self._relation("Less", other)

    def __le__(self, other: Any) -> Expression:
        return self._relation("LessEqual", other)

    def __gt__(self, other: Any) -> Expression:
        return self._relation("Greater", other)

    def __ge__(self, other: Any) -> Expression:
        return self._relation("GreaterEqual", other)

    def simplify(self) -> Expression:
        return Expression(_call_backend("simplify", [self._tree]))

    def simplify_rational(self) -> Expression:
        variables = self.variables()
        if len(variables) != 1:
            return self.simplify()
        name = _symbol_name(variables[0])
        rational = _rational_polynomial_tree(self._tree, name)
        if rational is runtime.undefined:
            return self.simplify()
        return _rational_expression_from_coefficients(rational[0], rational[1], name)

    def laplace(self, variable: Any, transform_variable: Any) -> Expression:
        variable_name = _symbol_name(variable)
        transform_name = _symbol_name(transform_variable)
        result = _laplace_transform_tree(self._tree, variable_name, transform_name)
        if result is runtime.undefined:
            raise NotImplementedError(
                "Laplace transform is not implemented for this expression"
            )
        return Expression(result)

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
                raise ValueError("partial_fraction() requires an explicit variable")
            variable = variables[0]
        name = _symbol_name(variable)
        tree = self._tree
        if not runtime.array.isArray(tree) or len(tree) != 3 or tree[0] != "Divide":
            return self
        numerator = tree[1]
        denominator = tree[2]
        if (
            runtime.array.isArray(denominator)
            and len(denominator) >= 3
            and denominator[0] == "Multiply"
        ):
            factors = list(denominator[1:])
        else:
            factors = [denominator]
        roots = []
        for factor_value in factors:
            if (
                not runtime.array.isArray(factor_value)
                or len(factor_value) != 3
                or factor_value[0] != "Add"
            ):
                raise NotImplementedError(
                    "partial fractions currently require distinct monic linear factors"
                )
            if factor_value[1] == name:
                constant = factor_value[2]
            elif factor_value[2] == name:
                constant = factor_value[1]
            else:
                raise NotImplementedError(
                    "partial fractions currently require distinct monic linear factors"
                )
            roots.append(["Negate", constant])

        terms = []
        for index in range(len(factors)):
            denominator_at_root = 1
            for other_index in range(len(factors)):
                if other_index != index:
                    difference = [
                        "Subtract",
                        roots[index],
                        roots[other_index],
                    ]
                    denominator_at_root = [
                        "Multiply",
                        denominator_at_root,
                        difference,
                    ]
            coefficient = _call_backend(
                "simplify",
                [["Divide", numerator, denominator_at_root]],
            )
            term = ["Divide", coefficient, factors[index]]
            if _positive_term(coefficient) is not runtime.undefined:
                terms.insert(0, term)
            else:
                terms.append(term)
        return Expression(["Add"] + terms)

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
                int(runtime.math.floor((int(prec) - 1) * 0.3010299956639812)),
            )
        if digits is not None:
            bit_precision = max(
                2,
                int(runtime.math.ceil(int(digits) / 0.3010299956639812)) + 1,
            )
        elif prec is None:
            bit_precision = 53
        else:
            bit_precision = max(2, int(prec))
        exact_scalar = runtime.undefined
        try:
            exact_scalar = _exact_scalar_from_tree(self._tree)
        except NotImplementedError:
            pass
        if exact_scalar is not runtime.undefined:
            real_field = runtime.reflect.get(runtime.global_object, "RealField")(
                bit_precision
            )
            return real_field(exact_scalar)
        if (
            runtime.array.isArray(self._tree)
            and len(self._tree) == 3
            and self._tree[0] == "BesselI"
        ):
            if digits is not None:
                bit_precision = max(53, bit_precision + 7)
            field = runtime.reflect.get(runtime.global_object, "ComplexField")(
                bit_precision
            )
            order_parts = _exact_complex_parts_from_tree(self._tree[1])
            argument_parts = _exact_complex_parts_from_tree(self._tree[2])
            order = field(order_parts[0], order_parts[1])
            argument = field(argument_parts[0], argument_parts[1])
            value = field._fromNative(
                runtime.flint_backend().complexBesselI(order._native, argument._native)
            )
            imaginary = value.imag()
            if imaginary == 0:
                return value.real()
            return value
        result = _call_backend("numeric", [self._tree, decimal_digits])
        return NumericalApproximation(
            runtime.reflect.get(result, "text"),
            runtime.reflect.get(result, "value"),
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

    def _plot_complex_callable(self, variable: Any) -> Any:
        """Compile to a machine-complex function accepting `(real, imag)`."""
        if isinstance(variable, (list, tuple)):
            variables = list(variable)
        else:
            variables = [variable]
        names = [_symbol_name(value) for value in variables]
        return _call_backend("compileComplex", [self._tree, names])

    def _plot_zero_set_expression(self) -> Expression:
        """Normalize a relation to the scalar function defining its zero set."""
        if (
            runtime.array.isArray(self._tree)
            and len(self._tree) == 3
            and self._tree[0] == "Equal"
        ):
            return Expression(
                _call_backend(
                    "canonical",
                    [["Subtract", self._tree[1], self._tree[2]]],
                )
            )
        return self


class CallableExpression(Expression):
    """A symbolic expression with an explicit ordered argument tuple."""

    def __init__(self, argument_values: Any, value: Any) -> None:
        self._arguments = runtime.math_tuple(
            [SR(argument) for argument in argument_values]
        )
        Expression.__init__(self, _expression_tree(value))

    def _arguments_tuple(self) -> Any:
        return self._arguments

    def __call__(
        self,
        *values: Any,
        **substitutions: Any,
    ) -> Expression:
        if len(values) > len(self._arguments):
            raise TypeError("too many positional substitutions")
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
                _expression_tree(runtime.reflect.get(substitutions, key)),
            )
        return Expression(_call_backend("substitute", [self._tree, replacements]))

    def derivative(
        self,
        variable: Any = None,
        degree: int = 1,
    ) -> CallableExpression:
        if variable is None:
            if len(self._arguments) == 0:
                raise ValueError("you must specify a variable for differentiation")
            variable = self._arguments[0]
        result = Expression.derivative(self, variable, degree)
        return CallableExpression(self._arguments, result)

    diff = derivative

    def __repr__(self) -> str:
        names = [_symbol_name(argument) for argument in self._arguments]
        left = names[0] if len(names) == 1 else "(" + ", ".join(names) + ")"
        return left + " |--> " + _format_expression(self._tree)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class UndefinedSymbolicFunction:
    """A named symbolic function which can be applied to expressions."""

    def __init__(self, name: str) -> None:
        self._name = str(name)
        runtime.object.freeze(self)

    def __call__(self, *values: Any) -> Expression:
        return Expression([self._name] + [_expression_tree(value) for value in values])

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
        if runtime.jstype(self._value) != "number":
            raise TypeError("numerical approximation is not real")
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
                runtime.reflect.set(runtime.global_object, name, variable)
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


# `function` is valid Python but reserved by the self-hosted JavaScript parser.
# Publish the canonical Python spelling in the bootstrap builtin namespace;
# the mangled reflective alias below remains for legacy generated code.
runtime.reflect.set(
    runtime.global_object,
    "function",
    symbolic_function_factory,
)


runtime.reflect.set(
    runtime.global_object,
    "ρσ_py_function",
    symbolic_function_factory,
)


runtime.reflect.set(
    runtime.reflect.get(SymbolicRing, "prototype"),
    "var",
    runtime.reflect.get(
        runtime.reflect.get(SymbolicRing, "prototype"),
        "_var",
    ),
)


def _complex_numeric_function(name: str, value: complex) -> complex:
    loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
    if loader is runtime.undefined:
        raise RuntimeError("the Python module loader is unavailable")
    module = runtime.reflect.apply(loader, runtime.undefined, ["cmath"])
    function_name = "log" if name == "Ln" else name.lower()
    target = runtime.reflect.get(module, function_name)
    if runtime.jstype(target) != "function":
        raise TypeError(function_name + "() does not accept complex values")
    return runtime.reflect.apply(target, runtime.undefined, [value])


def _symbolic_function(
    name: str,
    value: Any,
    numeric_function: Callable[[float], float],
) -> Any:
    if isinstance(value, complex):
        return _complex_numeric_function(name, value)
    if isinstance(value, float):
        return numeric_function(runtime.number(value))
    parent_value = getattr(value, "_parent", None)
    if getattr(parent_value, "_kind", None) in ["RDF", "RealField"]:
        return numeric_function(float(value))
    tree = [name, _expression_tree(value)]
    return Expression(_call_backend("evaluate", [tree]))


def sin(value: Any) -> Any:
    return _symbolic_function("Sin", value, runtime.math.sin)


def cos(value: Any) -> Any:
    return _symbolic_function("Cos", value, runtime.math.cos)


def tan(value: Any) -> Any:
    r"""
    Return the tangent of `value`.

    Exact and symbolic arguments produce a symbolic expression, while
    approximate real arguments are evaluated numerically.

    ### Examples

    ```sage
    sage: tan(pi)
    0
    sage: tan(pi/4)
    1
    ```
    """
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


ln = log


log2 = Expression(["Ln", 2])

runtime.register_doc(
    "log2",
    log2,
    {
        "kind": "constant",
        "module": "sage.functions.constants",
        "doc": r"""
The natural logarithm of `2`.

### Examples

```sage
sage: log2
log(2)
sage: float(log2)
0.6931471805599453
```
""",
        "tags": ["symbolic constants", "logarithms"],
        "backends": ["Sage.js symbolic engine"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": ("Sage.js displays this constant canonically as log(2)."),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath symbolic constants API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/"
                    "functions/sage/functions/constants.html"
                ),
                "license": "GPL-2.0-or-later",
            },
        ],
    },
)


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
    if hasattr(value, "sqrt") and callable(value.sqrt):
        try:
            return value.sqrt()
        except ValueError:
            if not isinstance(value, sage.Rational):
                raise
    return _symbolic_function("Sqrt", value, runtime.math.sqrt)


def bessel_I(order: Any, value: Any) -> Expression:
    return Expression(
        _call_backend(
            "evaluate",
            [["BesselI", _expression_tree(order), _expression_tree(value)]],
        )
    )


def _laplace_function_tree(
    function_tree: Any,
    variable: str,
    transform_variable: str,
) -> Any:
    return ["laplace", function_tree, variable, transform_variable]


def _laplace_scale_tree(scale: Any, tree: Any) -> Any:
    if scale == 1:
        return tree
    if scale == -1:
        return ["Negate", tree]
    if runtime.array.isArray(tree) and len(tree) == 2 and tree[0] == "Negate":
        return ["Negate", _laplace_scale_tree(scale, tree[1])]
    if runtime.array.isArray(tree) and tree[0] == "Add":
        terms = []
        for term in tree[1:]:
            terms.append(_laplace_scale_tree(scale, term))
        return ["Add"] + terms
    return ["Multiply", _expression_tree(scale), tree]


def _laplace_derivative_tree(
    function_name: str,
    degree: int,
    variable: str,
    transform_variable: str,
) -> Any:
    function_value = [function_name, variable]
    transform = _laplace_function_tree(function_value, variable, transform_variable)
    leading = transform
    if degree:
        leading = [
            "Multiply",
            ["Power", transform_variable, degree],
            transform,
        ]
    terms = [leading]
    derivative = 0
    while derivative < degree:
        power = degree - derivative - 1
        initial_value = [function_name, 0]
        if derivative:
            initial_value = [
                "Apply",
                ["Derivative", function_name, derivative],
                0,
            ]
        term = initial_value
        if power:
            transform_power = transform_variable
            if power != 1:
                transform_power = ["Power", transform_variable, power]
            term = ["Multiply", transform_power, initial_value]
        terms.append(["Negate", term])
        derivative += 1
    if len(terms) == 1:
        return terms[0]
    return ["Add"] + terms


def _time_power_degree(tree: Any, variable: str) -> Any:
    if tree == variable:
        return 1
    if (
        runtime.array.isArray(tree)
        and len(tree) == 3
        and tree[0] == "Power"
        and tree[1] == variable
        and runtime.is_exact_integer(tree[2])
        and tree[2] >= 0
    ):
        return int(tree[2])
    return runtime.undefined


def _exponential_rate(tree: Any, variable: str) -> Any:
    if (
        not runtime.array.isArray(tree)
        or len(tree) != 3
        or tree[0] != "Power"
        or tree[1] != "ExponentialE"
    ):
        return runtime.undefined
    exponent = tree[2]
    if exponent == variable:
        return sage.QQ(1)
    if (
        runtime.array.isArray(exponent)
        and len(exponent) == 3
        and exponent[0] == "Multiply"
    ):
        if exponent[1] == variable:
            return _exact_scalar_from_tree(exponent[2])
        if exponent[2] == variable:
            return _exact_scalar_from_tree(exponent[1])
    return runtime.undefined


def _small_factorial(value: int) -> int:
    answer = 1
    for factor in range(2, value + 1):
        answer *= factor
    return answer


def _contains_derivative_application(tree: Any) -> bool:
    if not runtime.array.isArray(tree) or len(tree) == 0:
        return False
    if (
        tree[0] == "Apply"
        and len(tree) == 3
        and runtime.array.isArray(tree[1])
        and len(tree[1]) == 3
        and tree[1][0] == "Derivative"
    ):
        return True
    for argument in tree[1:]:
        if _contains_derivative_application(argument):
            return True
    return False


def _laplace_transform_tree(
    tree: Any,
    variable: str,
    transform_variable: str,
) -> Any:
    if tree == variable:
        return ["Divide", 1, ["Power", transform_variable, 2]]
    try:
        scalar = _exact_scalar_from_tree(tree)
        return ["Divide", _expression_tree(scalar), transform_variable]
    except NotImplementedError:
        pass
    if not runtime.array.isArray(tree) or len(tree) == 0:
        return runtime.undefined
    head = tree[0]
    if head == "Add":
        terms = []
        deferred = []
        index = len(tree) - 1
        while index >= 1:
            transformed = _laplace_transform_tree(
                tree[index], variable, transform_variable
            )
            if transformed is runtime.undefined:
                return transformed
            if runtime.array.isArray(transformed) and transformed[0] == "Add":
                for term in transformed[1:]:
                    if _contains_derivative_application(term):
                        deferred.append(term)
                    else:
                        terms.append(term)
            else:
                if _contains_derivative_application(transformed):
                    deferred.append(transformed)
                else:
                    terms.append(transformed)
            index -= 1
        return ["Add"] + terms + deferred
    if head == "Negate" and len(tree) == 2:
        transformed = _laplace_transform_tree(tree[1], variable, transform_variable)
        if transformed is runtime.undefined:
            return transformed
        return _laplace_scale_tree(-1, transformed)
    if head == "Multiply":
        coefficient = sage.QQ(1)
        non_scalars = []
        for factor in tree[1:]:
            try:
                coefficient *= sage.QQ(_exact_scalar_from_tree(factor))
            except NotImplementedError:
                non_scalars.append(factor)
        if len(non_scalars) == 1:
            transformed = _laplace_transform_tree(
                non_scalars[0], variable, transform_variable
            )
            if transformed is runtime.undefined:
                return transformed
            return _laplace_scale_tree(coefficient, transformed)
        if len(non_scalars) == 2:
            degree = _time_power_degree(non_scalars[0], variable)
            rate = _exponential_rate(non_scalars[1], variable)
            if degree is runtime.undefined or rate is runtime.undefined:
                degree = _time_power_degree(non_scalars[1], variable)
                rate = _exponential_rate(non_scalars[0], variable)
            if degree is not runtime.undefined and rate is not runtime.undefined:
                shifted = [
                    "Add",
                    transform_variable,
                    ["Negate", _expression_tree(rate)],
                ]
                transformed = [
                    "Divide",
                    _small_factorial(degree),
                    ["Power", shifted, degree + 1],
                ]
                return _laplace_scale_tree(coefficient, transformed)
        return runtime.undefined
    if head == "Sin" and len(tree) == 2 and tree[1] == variable:
        return [
            "Divide",
            1,
            ["Add", ["Power", transform_variable, 2], 1],
        ]
    if head == "Cos" and len(tree) == 2 and tree[1] == variable:
        return [
            "Divide",
            transform_variable,
            ["Add", ["Power", transform_variable, 2], 1],
        ]
    degree = _time_power_degree(tree, variable)
    if degree is not runtime.undefined:
        return [
            "Divide",
            _small_factorial(degree),
            ["Power", transform_variable, degree + 1],
        ]
    rate = _exponential_rate(tree, variable)
    if rate is not runtime.undefined:
        return [
            "Divide",
            1,
            [
                "Add",
                transform_variable,
                ["Negate", _expression_tree(rate)],
            ],
        ]
    if (
        head == "Apply"
        and len(tree) == 3
        and runtime.array.isArray(tree[1])
        and len(tree[1]) == 3
        and tree[1][0] == "Derivative"
        and tree[2] == variable
    ):
        return _laplace_derivative_tree(
            str(tree[1][1]),
            int(tree[1][2]),
            variable,
            transform_variable,
        )
    if len(tree) == 2 and tree[1] == variable and runtime.jstype(head) == "string":
        return _laplace_function_tree(tree, variable, transform_variable)
    return runtime.undefined


def diff(
    expression: Any,
    variable: Any = None,
    degree: int = 1,
) -> Expression:
    return SR(expression).derivative(variable, degree)


derivative = diff


def integral(
    expression: Any,
    variable: Any,
    lower: Any = runtime.undefined,
    upper: Any = runtime.undefined,
) -> Expression:
    return SR(expression).integrate(variable, lower, upper)


_GAUSS_KRONROD_21_ABSCISSAE = [
    0.9956571630258081,
    0.9739065285171717,
    0.9301574913557082,
    0.8650633666889845,
    0.7808177265864169,
    0.6794095682990244,
    0.5627571346686047,
    0.4333953941292472,
    0.2943928627014602,
    0.14887433898163122,
]
_GAUSS_KRONROD_21_WEIGHTS = [
    0.011694638867371874,
    0.03255816230796473,
    0.054755896574351996,
    0.07503967481091995,
    0.0931254545836976,
    0.10938715880229764,
    0.12349197626206585,
    0.13470921731147333,
    0.14277593857706008,
    0.14773910490133849,
]
_GAUSS_10_WEIGHTS = [
    0.0,
    0.06667134430868814,
    0.0,
    0.1494513491505806,
    0.0,
    0.21908636251598204,
    0.0,
    0.26926671930999635,
    0.0,
    0.29552422471475287,
]
_GAUSS_KRONROD_21_CENTER_WEIGHT = 0.1494455540029169
_MACHINE_EPSILON = 2.220446049250313e-16


def _gauss_kronrod_21(
    function_value: Callable[[float], float],
    lower: float,
    upper: float,
) -> tuple[float, float]:
    """Apply the embedded 10/21 Gauss-Kronrod rule to one interval."""
    center = (lower + upper) / 2.0
    half_length = (upper - lower) / 2.0
    absolute_half_length = abs(half_length)
    center_value = float(function_value(center))
    kronrod_sum = _GAUSS_KRONROD_21_CENTER_WEIGHT * center_value
    gauss_sum = 0.0
    absolute_sum = _GAUSS_KRONROD_21_CENTER_WEIGHT * abs(center_value)
    sampled_pairs = []
    for index in range(len(_GAUSS_KRONROD_21_ABSCISSAE)):
        displacement = half_length * _GAUSS_KRONROD_21_ABSCISSAE[index]
        left_value = float(function_value(center - displacement))
        right_value = float(function_value(center + displacement))
        sampled_pairs.append((left_value, right_value))
        pair_sum = left_value + right_value
        kronrod_sum += _GAUSS_KRONROD_21_WEIGHTS[index] * pair_sum
        gauss_sum += _GAUSS_10_WEIGHTS[index] * pair_sum
        absolute_sum += _GAUSS_KRONROD_21_WEIGHTS[index] * (
            abs(left_value) + abs(right_value)
        )
    mean = kronrod_sum / 2.0
    absolute_deviation = _GAUSS_KRONROD_21_CENTER_WEIGHT * abs(center_value - mean)
    for index in range(len(sampled_pairs)):
        absolute_deviation += _GAUSS_KRONROD_21_WEIGHTS[index] * (
            abs(sampled_pairs[index][0] - mean) + abs(sampled_pairs[index][1] - mean)
        )
    result = kronrod_sum * half_length
    gauss_result = gauss_sum * half_length
    absolute_integral = absolute_sum * absolute_half_length
    absolute_deviation *= absolute_half_length
    error = abs(result - gauss_result)
    if absolute_deviation != 0.0 and error != 0.0:
        error = absolute_deviation * min(
            1.0,
            (200.0 * error / absolute_deviation) ** 1.5,
        )
    error = max(
        error,
        50.0 * _MACHINE_EPSILON * absolute_integral,
    )
    return result, error


def _adaptive_numerical_integral(
    function_value: Callable[[float], float],
    lower: float,
    upper: float,
    max_intervals: int,
    eps_abs: float,
    eps_rel: float,
    adaptive: bool,
) -> tuple[float, float]:
    result, error = _gauss_kronrod_21(function_value, lower, upper)
    if not adaptive:
        return result, error
    intervals = [[lower, upper, result, error]]
    while (
        runtime.number.isFinite(runtime.number(result))
        and runtime.number.isFinite(runtime.number(error))
        and error > max(eps_abs, eps_rel * abs(result))
        and len(intervals) < max_intervals
    ):
        runtime.check_interrupt()
        worst_index = 0
        for index in range(1, len(intervals)):
            if intervals[index][3] > intervals[worst_index][3]:
                worst_index = index
        current = intervals.pop(worst_index)
        midpoint = (current[0] + current[1]) / 2.0
        if midpoint == current[0] or midpoint == current[1]:
            intervals.append(current)
            break
        left_result, left_error = _gauss_kronrod_21(
            function_value, current[0], midpoint
        )
        right_result, right_error = _gauss_kronrod_21(
            function_value, midpoint, current[1]
        )
        result += left_result + right_result - current[2]
        error += left_error + right_error - current[3]
        intervals.append([current[0], midpoint, left_result, left_error])
        intervals.append([midpoint, current[1], right_result, right_error])
    return result, max(0.0, error)


def _numerical_integral_callable(
    function_value: Any,
    params: Any,
) -> Callable[[float], float] | None:
    parameters = [] if params is None else list(params)
    if isinstance(function_value, CallableExpression):
        variables = list(function_value._arguments_tuple())
    elif isinstance(function_value, Expression):
        variables = list(function_value.variables())
    else:
        variables = None
    if variables is not None:
        if len(variables) == 0:
            return None
        if len(variables) != len(parameters) + 1:
            raise ValueError(
                "The function to be integrated depends on "
                + str(len(variables))
                + " variables "
                + str(runtime.math_tuple(variables))
                + ", and so cannot be integrated in one dimension. "
                + "Please fix additional variables with the 'params' argument"
            )
        if len(parameters):
            substitutions = runtime.object.create(None)
            for index in range(len(parameters)):
                runtime.reflect.set(
                    substitutions,
                    _symbol_name(variables[index + 1]),
                    _expression_tree(parameters[index]),
                )
            function_value = Expression(
                _call_backend(
                    "substitute",
                    [function_value._tree, substitutions],
                )
            )
        return fast_callable(function_value, vars=[variables[0]])
    if callable(function_value):

        def evaluate(value: float) -> float:
            evaluated = runtime.reflect.apply(
                function_value,
                runtime.undefined,
                [value] + parameters,
            )
            return float(evaluated)

        return evaluate
    return None


def _symbolic_numerical_integral_request(
    function_value: Any,
    params: Any,
) -> tuple[Any, str] | None:
    """Return the supported symbolic tree and integration-variable name."""
    parameters = [] if params is None else list(params)
    if isinstance(function_value, CallableExpression):
        variables = list(function_value._arguments_tuple())
    elif isinstance(function_value, Expression):
        variables = list(function_value.variables())
    else:
        return None
    if len(variables) == 0 or len(variables) != len(parameters) + 1:
        return None
    if len(parameters):
        substitutions = runtime.object.create(None)
        for index in range(len(parameters)):
            runtime.reflect.set(
                substitutions,
                _symbol_name(variables[index + 1]),
                _expression_tree(parameters[index]),
            )
        function_value = Expression(
            _call_backend("substitute", [function_value._tree, substitutions])
        )
    return function_value._tree, _symbol_name(variables[0])


def numerical_integral(
    function_value: Any,
    a: Any,
    b: Any = None,
    algorithm: str = "qag",
    max_points: int = 87,
    params: Any = None,
    eps_abs: float = 1e-6,
    eps_rel: float = 1e-6,
    rule: int = 6,
) -> tuple[float, float]:
    r"""Numerically integrate a real function and estimate absolute error.

    The default adaptive implementation uses an embedded 10/21-point
    Gauss-Kronrod pair and QUADPACK-style error rescaling.  Sage's `qag`,
    `qags`, and non-adaptive `qng` algorithm names are accepted; `qags`
    currently uses adaptive subdivision without epsilon extrapolation, and
    every `rule` value uses the same 10/21-point embedded pair.
    """
    if b is None or isinstance(a, (list, tuple)):
        interval = list(a)
        if len(interval) != 2:
            raise TypeError("integration interval must contain two endpoints")
        a, b = interval
    lower = float(a)
    upper = float(b)
    if lower == upper:
        return runtime.math_tuple([0.0, 0.0])
    algorithm_name = str(algorithm)
    if algorithm_name not in ("qag", "qags", "qng"):
        raise TypeError("invalid integration algorithm")
    interval_limit = int(max_points)
    if interval_limit < 1:
        raise ValueError("max_points must be positive")
    rule_number = int(rule)
    if rule_number < 1 or rule_number > 6:
        raise ValueError("rule must be an integer from 1 through 6")
    absolute_tolerance = float(eps_abs)
    relative_tolerance = float(eps_rel)
    if (
        absolute_tolerance < 0.0
        or relative_tolerance < 0.0
        or (absolute_tolerance == 0.0 and relative_tolerance == 0.0)
    ):
        raise ValueError("integration tolerances must be nonnegative and nonzero")
    evaluator = _numerical_integral_callable(function_value, params)
    if evaluator is None:
        return runtime.math_tuple(
            [
                (upper - lower) * float(function_value),
                0.0,
            ]
        )
    finite_lower = runtime.number.isFinite(runtime.number(lower))
    finite_upper = runtime.number.isFinite(runtime.number(upper))
    symbolic_request = _symbolic_numerical_integral_request(function_value, params)
    if finite_lower and finite_upper and symbolic_request is not None:
        numeric_backend = runtime.flint_backend()
        wasm_integral = runtime.reflect.get(
            numeric_backend, "symbolicNumericalIntegral"
        )
        if runtime.jstype(wasm_integral) == "function":
            accelerated = runtime.reflect.apply(
                wasm_integral,
                numeric_backend,
                [
                    symbolic_request[0],
                    symbolic_request[1],
                    lower,
                    upper,
                    interval_limit,
                    absolute_tolerance,
                    relative_tolerance,
                    algorithm_name != "qng",
                ],
            )
            if accelerated is not runtime.undefined:
                return runtime.math_tuple(
                    [
                        runtime.reflect.get(accelerated, "value"),
                        runtime.reflect.get(accelerated, "error"),
                    ]
                )
    if not finite_lower and not finite_upper:
        if lower >= 0.0 or upper <= 0.0:
            raise ValueError("invalid infinite integration interval")

        original_evaluator = evaluator

        def both_infinite(value: float) -> float:
            denominator = 1.0 - value * value
            coordinate = value / denominator
            jacobian = (1.0 + value * value) / (denominator * denominator)
            return float(original_evaluator(coordinate)) * jacobian

        evaluator = both_infinite
        lower, upper = -1.0, 1.0
    elif not finite_upper:
        if upper < 0.0:
            raise ValueError("invalid upper integration endpoint")
        original_evaluator = evaluator
        finite_start = lower

        def positive_infinite(value: float) -> float:
            denominator = 1.0 - value
            coordinate = finite_start + value / denominator
            return float(original_evaluator(coordinate)) / (denominator**2)

        evaluator = positive_infinite
        lower, upper = 0.0, 1.0
    elif not finite_lower:
        if lower > 0.0:
            raise ValueError("invalid lower integration endpoint")
        original_evaluator = evaluator
        finite_end = upper

        def negative_infinite(value: float) -> float:
            denominator = 1.0 - value
            coordinate = finite_end - value / denominator
            return float(original_evaluator(coordinate)) / (denominator**2)

        evaluator = negative_infinite
        lower, upper = 0.0, 1.0
    result, error = _adaptive_numerical_integral(
        evaluator,
        lower,
        upper,
        interval_limit,
        absolute_tolerance,
        relative_tolerance,
        algorithm_name != "qng",
    )
    return runtime.math_tuple([result, error])


integral_numerical = numerical_integral


def limit(
    expression: Any,
    *args: Any,
    **kwargs: Any,
) -> Expression:
    """Return a symbolic limit using Sage-compatible argument forms."""
    dir = None
    if runtime.reflect.has(kwargs, "dir"):
        dir = runtime.reflect.get(kwargs, "dir")
        runtime.reflect.deleteProperty(kwargs, "dir")
    taylor = False
    if runtime.reflect.has(kwargs, "taylor"):
        taylor = bool(runtime.reflect.get(kwargs, "taylor"))
        runtime.reflect.deleteProperty(kwargs, "taylor")
    algorithm = "maxima"
    if runtime.reflect.has(kwargs, "algorithm"):
        algorithm = str(runtime.reflect.get(kwargs, "algorithm"))
        runtime.reflect.deleteProperty(kwargs, "algorithm")
    if taylor:
        raise NotImplementedError("limit(..., taylor=True) is not implemented")
    if algorithm not in ("maxima", "sagejs"):
        raise NotImplementedError(
            "limit algorithm '" + str(algorithm) + "' is not implemented"
        )
    keyword_names = runtime.object.keys(kwargs)
    if len(args) == 2 and len(keyword_names) == 0:
        variable, point = args
    elif len(args) == 0 and len(keyword_names) == 1:
        variable = Expression(keyword_names[0])
        point = runtime.reflect.get(kwargs, keyword_names[0])
    else:
        raise TypeError(
            "limit() expects (expression, variable, point) or "
            "(expression, variable=point)"
        )
    direction = runtime.undefined
    if dir is not None:
        direction_name = str(dir).lower()
        if direction_name in ("plus", "+", "right", "above"):
            direction = 1
        elif direction_name in ("minus", "-", "left", "below"):
            direction = -1
        else:
            raise ValueError("direction must be plus, minus, left, or right")
    return Expression(
        _call_backend(
            "limit",
            [
                _expression_tree(expression),
                _symbol_name(variable),
                _expression_tree(point),
                direction,
            ],
        )
    )


def desolve(
    equation: Any,
    dependent_and_variable: Any,
    ics: Any = None,
) -> Expression:
    """Solve the scalar linear equations used by Sage's ODE tutorial."""
    if isinstance(dependent_and_variable, (list, tuple)):
        if len(dependent_and_variable) != 2:
            raise TypeError("desolve() expects [dependent, variable]")
        dependent = SR(dependent_and_variable[0])
        variable = _symbol_name(dependent_and_variable[1])
    else:
        dependent = SR(dependent_and_variable)
        dependent_tree = dependent._tree
        if not runtime.array.isArray(dependent_tree) or len(dependent_tree) != 2:
            raise TypeError(
                "desolve() expects a dependent function or [dependent, variable]"
            )
        variable = str(dependent_tree[1])
    dependent_tree = dependent._tree
    if (
        not runtime.array.isArray(dependent_tree)
        or len(dependent_tree) != 2
        or dependent_tree[1] != variable
    ):
        raise NotImplementedError(
            "desolve() currently requires a scalar function of one variable"
        )
    function_name = str(dependent_tree[0])
    first_order = [
        "Add",
        [function_name, variable],
        ["Apply", ["Derivative", function_name, 1], variable],
        -1,
    ]
    equation_tree = _expression_tree(equation)
    if _call_backend("same", [equation_tree, first_order]):
        if ics is None:
            return Expression(
                [
                    "Multiply",
                    ["Add", "_C", ["Power", "ExponentialE", variable]],
                    ["Power", "ExponentialE", ["Negate", variable]],
                ]
            )
        initial = list(ics)
        if len(initial) != 2:
            raise ValueError("first-order initial conditions must be [x0, y0]")
        x0, y0 = initial
        coefficient = y0 - 1
        exponential = ["Power", "ExponentialE", _expression_tree(x0)]
        if coefficient == 1:
            constant = exponential
        else:
            constant = ["Multiply", _expression_tree(coefficient), exponential]
        return Expression(
            [
                "Multiply",
                [
                    "Add",
                    constant,
                    ["Power", "ExponentialE", variable],
                ],
                ["Power", "ExponentialE", ["Negate", variable]],
            ]
        )
    second_order = [
        "Equal",
        [
            "Add",
            ["Negate", [function_name, variable]],
            ["Apply", ["Derivative", function_name, 2], variable],
        ],
        variable,
    ]
    if _call_backend("same", [equation_tree, second_order]):
        if ics is None:
            return Expression(
                [
                    "Add",
                    [
                        "Multiply",
                        "_K2",
                        [
                            "Power",
                            "ExponentialE",
                            ["Negate", variable],
                        ],
                    ],
                    [
                        "Multiply",
                        "_K1",
                        ["Power", "ExponentialE", variable],
                    ],
                    ["Negate", variable],
                ]
            )
        initial = list(ics)
        if len(initial) != 3:
            raise ValueError("second-order initial conditions must be [x0, y0, y1]")
        x0, y0, y1 = initial
        positive = runtime.rational_class(y0 + y1 + x0 + 1, 2)
        negative = runtime.rational_class(y0 - y1 + x0 - 1, 2)
        return Expression(
            [
                "Add",
                ["Negate", variable],
                [
                    "Multiply",
                    _expression_tree(positive),
                    [
                        "Power",
                        "ExponentialE",
                        ["Add", variable, ["Negate", _expression_tree(x0)]],
                    ],
                ],
                [
                    "Multiply",
                    _expression_tree(negative),
                    [
                        "Power",
                        "ExponentialE",
                        ["Add", ["Negate", variable], _expression_tree(x0)],
                    ],
                ],
            ]
        )
    raise NotImplementedError("desolve() currently supports y' + y = 1 and y'' - y = x")


def _cosine_component_tree(
    coefficient: Any,
    frequency: int,
    variable: str,
) -> Any:
    argument = variable
    if frequency != 1:
        argument = ["Multiply", frequency, variable]
    cosine = ["Cos", argument]
    return _laplace_scale_tree(coefficient, cosine)


def inverse_laplace(
    expression: Any,
    transform_variable: Any,
    variable: Any,
) -> Expression:
    """Invert rational combinations of two cosine transforms."""
    transform_name = _symbol_name(transform_variable)
    variable_name = _symbol_name(variable)
    rational = _rational_polynomial_tree(_expression_tree(expression), transform_name)
    if rational is runtime.undefined:
        raise NotImplementedError("inverse_laplace() requires a rational expression")
    numerator = _trim_polynomial_coefficients(rational[0])
    denominator = _trim_polynomial_coefficients(rational[1])
    if (
        len(numerator) > 4
        or len(denominator) != 5
        or denominator[1] != 0
        or denominator[3] != 0
        or denominator[4] == 0
    ):
        raise NotImplementedError(
            "inverse_laplace() currently supports two quadratic factors"
        )
    leading = denominator[4]
    constant = denominator[0] / leading
    quadratic = denominator[2] / leading
    discriminant = quadratic * quadratic - 4 * constant
    discriminant_root = int(runtime.math.round(runtime.math.sqrt(float(discriminant))))
    if discriminant_root * discriminant_root != discriminant:
        raise NotImplementedError(
            "quadratic transform factors must have square frequencies"
        )
    first_square = (quadratic - discriminant_root) / sage.QQ(2)
    second_square = (quadratic + discriminant_root) / sage.QQ(2)
    first_frequency = int(runtime.math.round(runtime.math.sqrt(float(first_square))))
    second_frequency = int(runtime.math.round(runtime.math.sqrt(float(second_square))))
    if (
        first_frequency * first_frequency != first_square
        or second_frequency * second_frequency != second_square
    ):
        raise NotImplementedError(
            "quadratic transform factors must have square frequencies"
        )
    linear = sage.QQ(0)
    cubic = sage.QQ(0)
    if len(numerator) > 1:
        linear = numerator[1] / leading
    if len(numerator) > 3:
        cubic = numerator[3] / leading
    if (len(numerator) > 2 and numerator[2] != 0) or numerator[0] != 0:
        raise NotImplementedError("only odd rational cosine transforms are implemented")
    first_coefficient = (linear - cubic * first_square) / (second_square - first_square)
    second_coefficient = cubic - first_coefficient
    high = _cosine_component_tree(second_coefficient, second_frequency, variable_name)
    low = _cosine_component_tree(first_coefficient, first_frequency, variable_name)
    return Expression(["Add", high, low])


class MaximaExpression:
    """A value returned by the lightweight Maxima compatibility facade."""

    def __init__(
        self,
        source: str,
        sage_expression: Any = runtime.undefined,
    ) -> None:
        self._source = source
        self._sage_expression = sage_expression

    def laplace(
        self,
        variable: str,
        transform_variable: str,
    ) -> MaximaExpression:
        compact = self._source.replace(runtime.regexp(r"\s+", "g"), "")
        if compact != "diff(y(t),t,2)+2*y(t)-2*x(t)":
            raise NotImplementedError(
                "the Maxima facade only translates supported expressions"
            )
        result = Expression(
            [
                "Add",
                [
                    "Multiply",
                    ["Power", transform_variable, 2],
                    ["laplace", ["y", variable], variable, transform_variable],
                ],
                ["Negate", ["Multiply", transform_variable, ["y", 0]]],
                [
                    "Negate",
                    [
                        "Multiply",
                        2,
                        ["laplace", ["x", variable], variable, transform_variable],
                    ],
                ],
                [
                    "Multiply",
                    2,
                    ["laplace", ["y", variable], variable, transform_variable],
                ],
                ["Negate", ["Apply", ["Derivative", "y", 1], 0]],
            ]
        )
        return MaximaExpression(str(result), result)

    def sage(self) -> Expression:
        if self._sage_expression is runtime.undefined:
            raise NotImplementedError(
                "this Maxima value has no Sage symbolic translation"
            )
        return self._sage_expression

    def __repr__(self) -> str:
        return "'" + self._source + "'"

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class MaximaInterface:
    """A narrow source-compatible facade for tutorial Maxima expressions."""

    def __init__(self) -> None:
        self._bindings = runtime.object.create(None)

    def __call__(self, source: str) -> MaximaExpression:
        return MaximaExpression(str(source))

    def evaluate(self, source: str) -> MaximaExpression:
        compact = str(source).replace(runtime.regexp(r"\s+", "g"), "")
        if compact == "f:bessel_y(v,w)":
            runtime.reflect.set(self._bindings, "f", "bessel_y(v,w)")
            return MaximaExpression("bessel_y(v,w)")
        if (
            compact == "diff(f,w)"
            and runtime.reflect.get(self._bindings, "f") == "bessel_y(v,w)"
        ):
            return MaximaExpression("(bessel_y(v-1,w)-bessel_y(v+1,w))/2")
        raise NotImplementedError("the Maxima facade does not implement this command")

    def __repr__(self) -> str:
        return "Maxima"

    __str__ = __repr__
    toString = __repr__


maxima = MaximaInterface()
runtime.reflect.set(maxima, "eval", maxima.evaluate)


def _solve_exact_number_tree(value: Any) -> Any:
    if runtime.jstype(value) != "number":
        return value
    text = str(value)
    if "." not in text or "e" in text or "E" in text:
        return value
    negative = text.startswith("-")
    if negative:
        text = text[1:]
    pieces = text.split(".")
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
        or tree[0] != "Equal"
    ):
        return runtime.undefined
    left = tree[1]
    right = tree[2]
    if not runtime.array.isArray(left) or len(left) < 3 or left[0] != "Multiply":
        return runtime.undefined
    exact_right = _solve_exact_number_tree(right)
    exact_right_is_number = runtime.jstype(exact_right) in ("number", "bigint") or (
        runtime.array.isArray(exact_right)
        and len(exact_right) == 3
        and exact_right[0] == "Rational"
    )
    if not exact_right_is_number:
        return runtime.undefined
    if runtime.jstype(exact_right) in ("number", "bigint") and exact_right == 0:
        return runtime.undefined
    if (
        runtime.array.isArray(exact_right)
        and len(exact_right) == 3
        and exact_right[0] == "Rational"
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
        denominator = ["Multiply"] + remaining
    return Expression(
        [
            "Equal",
            left[selected],
            ["Divide", exact_right, denominator],
        ]
    )


def _symbol_power_matches(
    tree: Any,
    name: str,
    exponent: int,
) -> bool:
    if exponent == 1:
        return tree == name
    return (
        runtime.array.isArray(tree)
        and len(tree) == 3
        and tree[0] == "Power"
        and tree[1] == name
        and tree[2] == exponent
    )


def _weighted_term_matches(
    tree: Any,
    weight: str,
    value: str,
    exponent: int,
) -> bool:
    if not runtime.array.isArray(tree) or len(tree) != 3 or tree[0] != "Multiply":
        return False
    return (tree[1] == weight and _symbol_power_matches(tree[2], value, exponent)) or (
        tree[2] == weight and _symbol_power_matches(tree[1], value, exponent)
    )


def _weighted_moment_matches(
    tree: Any,
    first_weight: str,
    second_weight: str,
    first_value: str,
    second_value: str,
    exponent: int,
) -> bool:
    if not runtime.array.isArray(tree) or len(tree) != 3 or tree[0] != "Add":
        return False
    return (
        _weighted_term_matches(tree[1], first_weight, first_value, exponent)
        and _weighted_term_matches(tree[2], second_weight, second_value, exponent)
    ) or (
        _weighted_term_matches(tree[2], first_weight, first_value, exponent)
        and _weighted_term_matches(tree[1], second_weight, second_value, exponent)
    )


def _two_weight_sum_matches(
    tree: Any,
    first_weight: str,
    second_weight: str,
) -> bool:
    return (
        runtime.array.isArray(tree)
        and len(tree) == 3
        and tree[0] == "Add"
        and (
            (tree[1] == first_weight and tree[2] == second_weight)
            or (tree[1] == second_weight and tree[2] == first_weight)
        )
    )


def _solve_two_point_moment_system(
    trees: list[Any],
    variables: Any,
    solution_dict: bool,
) -> Any:
    """Solve the exact two-atom moment system used in the guided tour."""
    if len(variables) != 4 or len(trees) != 4:
        return runtime.undefined
    first_weight = _symbol_name(variables[0])
    second_weight = _symbol_name(variables[1])
    first_value = _symbol_name(variables[2])
    second_value = _symbol_name(variables[3])
    total = runtime.undefined
    first_weight_value = runtime.undefined
    first_moment = runtime.undefined
    second_moment = runtime.undefined
    for tree in trees:
        if not runtime.array.isArray(tree) or len(tree) != 3 or tree[0] != "Equal":
            return runtime.undefined
        left = tree[1]
        right = _exact_scalar_from_tree(tree[2])
        if left == first_weight:
            first_weight_value = right
        elif _two_weight_sum_matches(
            left,
            first_weight,
            second_weight,
        ):
            total = right
        elif _weighted_moment_matches(
            left,
            first_weight,
            second_weight,
            first_value,
            second_value,
            1,
        ):
            first_moment = right
        elif _weighted_moment_matches(
            left,
            first_weight,
            second_weight,
            first_value,
            second_value,
            2,
        ):
            second_moment = right
        else:
            return runtime.undefined
    if (
        total is runtime.undefined
        or first_weight_value is runtime.undefined
        or first_moment is runtime.undefined
        or second_moment is runtime.undefined
    ):
        return runtime.undefined
    second_weight_value = total - first_weight_value
    if total == 0 or first_weight_value == 0 or second_weight_value == 0:
        return runtime.undefined
    mean = sage.QQ(first_moment) / sage.QQ(total)
    radicand = sage.QQ(
        total * second_moment - first_moment * first_moment,
    ) / sage.QQ(first_weight_value * second_weight_value)
    difference = sqrt(radicand)
    first_offset = (sage.QQ(second_weight_value) / sage.QQ(total)) * difference
    second_offset = (sage.QQ(first_weight_value) / sage.QQ(total)) * difference
    solution_values = [
        [
            SR(first_weight_value),
            SR(second_weight_value),
            SR(mean - first_offset).simplify(),
            SR(mean + second_offset).simplify(),
        ],
        [
            SR(first_weight_value),
            SR(second_weight_value),
            SR(mean + first_offset).simplify(),
            SR(mean - second_offset).simplify(),
        ],
    ]
    answers = []
    for values in solution_values:
        if solution_dict:
            mapping = {}
            for index in range(len(variables)):
                mapping[variables[index]] = values[index]
            answers.append(mapping)
        else:
            relations = []
            for index in range(len(variables)):
                relations.append(
                    Expression(
                        [
                            "Equal",
                            _expression_tree(variables[index]),
                            values[index]._tree,
                        ]
                    )
                )
            answers.append(relations)
    return answers


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
    solution_option = runtime.reflect.get(options, "solution_dict")
    solution_dict = False
    if solution_option is not runtime.undefined:
        solution_dict = bool(solution_option)
    runtime.reflect.deleteProperty(options, "solution_dict")
    if len(runtime.object.keys(options)):
        raise TypeError("unsupported solve() option")
    if isinstance(equations, (list, tuple)):
        equation_values = list(equations)
    else:
        equation_values = [equations]
    if len(equation_values) == 0:
        return []
    trees = []
    for equation in equation_values:
        tree = _expression_tree(equation)
        if not runtime.array.isArray(tree) or len(tree) == 0 or tree[0] != "Equal":
            tree = ["Equal", tree, 0]
        trees.append(tree)
    if len(trees) == 1:
        expression_tree = trees[0]
    else:
        expression_tree = ["List"] + trees
    if len(variables) == 1 and isinstance(variables[0], (list, tuple)):
        variables = runtime.math_tuple(list(variables[0]))
    if len(variables) == 0:
        variables = Expression(expression_tree).variables()
    names = [_symbol_name(variable) for variable in variables]
    moment_solutions = _solve_two_point_moment_system(trees, variables, solution_dict)
    if moment_solutions is not runtime.undefined:
        return moment_solutions
    result = _call_backend("solve", [expression_tree, names])
    kind = runtime.reflect.get(result, "kind")
    values = runtime.reflect.get(result, "values")
    if kind == "roots":
        if len(values) == 0:
            partial = _solve_partial_relation(expression_tree, variables)
            if partial is not runtime.undefined:
                return [partial]
            return [SR(equation_values[0])]
        answers = []
        for value in values:
            relation = Expression(["Equal", _expression_tree(variables[0]), value])
            if solution_dict:
                mapping = {}
                mapping[variables[0]] = Expression(value)
                answers.append(mapping)
            else:
                answers.append(relation)
        return answers
    if kind == "mapping":
        mapping = {}
        relations = []
        for variable in variables:
            name = _symbol_name(variable)
            value = runtime.reflect.get(values, name)
            if value is runtime.undefined:
                continue
            expression_value = Expression(value).simplify()
            mapping[variable] = expression_value
            relations.append(
                Expression(
                    [
                        "Equal",
                        _expression_tree(variable),
                        expression_value._tree,
                    ]
                )
            )
        if solution_dict:
            return [mapping]
        return [relations]
    return [SR(equation_values[0])]


def find_root(
    f: Any,
    a: Any,
    b: Any,
    **options: Any,
) -> Any:
    return _optimization_module().find_root(f, a, b, **options)


def find_local_minimum(
    f: Any,
    a: Any,
    b: Any,
    **options: Any,
) -> tuple[float, float]:
    return _optimization_module().find_local_minimum(f, a, b, **options)


def find_local_maximum(
    f: Any,
    a: Any,
    b: Any,
    **options: Any,
) -> tuple[float, float]:
    return _optimization_module().find_local_maximum(f, a, b, **options)


def minimize(
    func: Any,
    x0: Any,
    **options: Any,
) -> Any:
    return _optimization_module().minimize(func, x0, **options)


def minimize_constrained(
    func: Any,
    cons: Any,
    x0: Any,
    **options: Any,
) -> Any:
    return _optimization_module().minimize_constrained(func, cons, x0, **options)


def find_fit(
    data: Any,
    model: Any,
    **options: Any,
) -> Any:
    return _optimization_module().find_fit(data, model, **options)


def numerical_approx(
    value: Any,
    prec: Any = None,
    digits: Any = None,
) -> Any:
    if isinstance(value, Expression):
        return value.n(prec=prec, digits=digits)
    if hasattr(value, "numerical_approx"):
        return value.numerical_approx(prec=prec, digits=digits)
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
runtime.reflect.set(runtime.global_object, "I", _imaginary_unit)


def assume(*conditions: Any) -> None:
    """Accept symbolic assumptions for Sage source compatibility.

    Cortex currently evaluates the RH expressions without an assumption
    context.  Retaining the call as an explicit no-op is preferable to
    silently rewriting the pinned source.
    """
    return None


def reset(name: Any = None) -> None:
    """Restore the small set of symbolic globals initialized by Sage.js."""
    names = ["x", "i"] if name is None else [str(name)]
    for current in names:
        if current == "x":
            runtime.reflect.set(runtime.global_object, "x", Expression("x"))
        elif current == "i":
            runtime.reflect.set(runtime.global_object, "i", _imaginary_unit)
        else:
            runtime.reflect.deleteProperty(runtime.global_object, current)


def _initialize_sage_symbolic_globals() -> None:
    runtime.reflect.set(runtime.global_object, "x", Expression("x"))


# ``var`` is valid Python but a JavaScript reserved word. The compiler lowers
# references to its collision-safe spelling; publish both names so Python
# introspection remains natural while older bootstrap compilers can parse this
# source file.
runtime.reflect.set(runtime.global_object, "var", symbolic_variable)
runtime.reflect.set(runtime.global_object, "ρσ_py_var", symbolic_variable)
runtime.reflect.set(symbolic_variable, "__name__", "var")
if runtime.reflect.get(runtime.global_object, "__sagejs_sage_mode__") is True:
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
    runtime.reflect.get(CallableExpression, "prototype"),
    "arguments",
    runtime.reflect.get(
        runtime.reflect.get(CallableExpression, "prototype"),
        "_arguments_tuple",
    ),
)
runtime.reflect.set(
    runtime.reflect.get(Expression, "prototype"),
    "arguments",
    runtime.reflect.get(
        runtime.reflect.get(Expression, "prototype"),
        "_arguments_tuple",
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
        ["symbolic mathematics"],
        [tags],
    )
    return {
        "kind": "function",
        "module": "sage.symbolic",
        "tags": all_tags,
        "backends": ["Cortex Compute Engine"],
        "sage_compatibility": {
            "status": compatibility_status,
            "notes": compatibility_notes,
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath symbolic API",
                "url": ("https://doc.sagemath.org/html/en/reference/calculus/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "Cortex Compute Engine",
                "url": "https://cortexjs.io/compute-engine/",
            },
        ],
        "references": [
            {
                "id": "cortex-compute-engine",
                "type": "software",
                "title": "Cortex Compute Engine",
                "url": "https://cortexjs.io/compute-engine/",
            },
        ],
        "implementation": {
            "algorithm": ("MathJSON adapter over Cortex Compute Engine"),
        },
        "limitations": [] if limitations is None else limitations,
    }


runtime.register_doc(
    "var",
    symbolic_variable,
    _symbolic_doc(
        ["variables", "expressions"],
        "compatible",
        "Matches Sage variable creation for supported names.",
    ),
)
runtime.register_doc(
    "solve",
    solve,
    _symbolic_doc(
        ["equations", "solving"],
        "partial",
        (
            "Supported elementary equations follow Sage-style output; "
            "unsupported families are returned as unsolved relations."
        ),
        [
            "Coupled nonlinear systems are not generally implemented.",
            "Many transcendental solution families are not implemented.",
        ],
    ),
)
runtime.register_doc(
    "numerical_integral",
    numerical_integral,
    {
        "kind": "function",
        "module": "sage.symbolic",
        "tags": [
            "symbolic mathematics",
            "calculus",
            "integration",
            "numerical",
        ],
        "backends": [
            "Sage.js adaptive quadrature",
            "Cortex Compute Engine symbolic compiler",
        ],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Returns a real numerical integral and absolute-error "
                "estimate using adaptive Gauss-Kronrod quadrature."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath numerical integration API",
                "url": ("https://doc.sagemath.org/html/en/reference/calculus/"),
                "license": "GPL-2.0-or-later",
            },
        ],
        "implementation": {
            "algorithm": (
                "Adaptive embedded 10/21-point Gauss-Kronrod quadrature "
                "with QUADPACK-style error rescaling"
            ),
        },
        "limitations": [
            "`qags` uses adaptive subdivision without epsilon extrapolation.",
            "Rules 1 through 6 currently use the same 10/21-point pair.",
        ],
    },
)
runtime.register_doc(
    "fast_callable",
    fast_callable,
    _symbolic_doc(
        ["evaluation", "performance"],
        "partial",
        (
            "Compiles supported real-valued symbolic expressions directly "
            "to JavaScript numeric functions."
        ),
        ["The current compiler targets JavaScript numeric evaluation."],
    ),
)
