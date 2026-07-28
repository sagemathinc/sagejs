"""Core Python and Sage builtins for the Sage.js runtime.

The implementation is ordinary Python source. Operations which must bypass
Sage.js operator lowering use the explicit :mod:`sagejs.runtime` boundary;
the compiler lowers those calls directly to JavaScript primitives.
"""

from __future__ import annotations

from typing import Any, Callable, Iterator

import sagejs.runtime as runtime

_Bool = bool
_Int = int
_Str = str


def _builtins_get_member(value: Any, name: Any) -> Any:
    if value is None or value is runtime.undefined:
        return runtime.undefined
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'object')
        or runtime.strict_equal(value_type, 'function')
    ):
        return runtime.reflect.get(value, name)
    boxed = runtime.reflect.apply(
        runtime.object, runtime.undefined, [value])
    return runtime.reflect.get(boxed, name)


def _builtins_has_member(value: Any, name: Any) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    value_type = runtime.jstype(value)
    target = value
    if (
        not runtime.strict_equal(value_type, 'object')
        and not runtime.strict_equal(value_type, 'function')
    ):
        target = runtime.reflect.apply(
            runtime.object, runtime.undefined, [value])
    return runtime.reflect.has(target, name)


def _builtins_call_member(
    value: Any,
    name: Any,
    call_args: list[Any],
) -> Any:
    method = _builtins_get_member(value, name)
    return runtime.reflect.apply(method, value, call_args)


def _builtins_member_is_function(value: Any, name: Any) -> _Bool:
    return runtime.strict_equal(
        runtime.jstype(_builtins_get_member(value, name)),
        'function',
    )


def _builtins_exact_integer_primitive(value: Any) -> _Bool:
    value_type = runtime.jstype(value)
    return (
        runtime.strict_equal(value_type, 'bigint')
        or (
            runtime.strict_equal(value_type, 'number')
            and runtime.number.isSafeInteger(value)
        )
    )


def ρσ_bigint_divexact(numerator: Any, denominator: Any) -> Any:
    """Divide two BigInts, relying on exact divisibility."""
    return runtime.native_div(numerator, denominator)


def abs(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if runtime.strict_equal(value_type, 'number'):
        return runtime.math.abs(value)
    if runtime.strict_equal(value_type, 'bigint'):
        return runtime.native_neg(value) if value < 0 else value
    if _builtins_member_is_function(value, '__abs__'):
        return _builtins_call_member(value, '__abs__', [])
    return runtime.math.abs(value)


def ρσ_exact_integer_primitive(value: Any) -> _Bool:
    return _builtins_exact_integer_primitive(value)


def ρσ_operator_add(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, right_type)
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(left_type, 'string')
        )
    ):
        return runtime.native_add(left, right)
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('add', left, right)
    if _builtins_member_is_function(left, '__add__'):
        return _builtins_call_member(left, '__add__', [right])
    if _builtins_member_is_function(right, '__radd__'):
        return _builtins_call_member(right, '__radd__', [left])
    if _builtins_member_is_function(left, 'concat'):
        return _builtins_call_member(left, 'concat', [right])
    if (
        runtime.strict_equal(left_type, 'object')
        or runtime.strict_equal(right_type, 'object')
    ):
        raise TypeError('unsupported operand type(s) for +')
    return runtime.native_add(left, right)


def ρσ_operator_add_exact(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('add', left, right)
    if _builtins_member_is_function(left, '__add__'):
        return _builtins_call_member(left, '__add__', [right])
    if _builtins_member_is_function(right, '__radd__'):
        return _builtins_call_member(right, '__radd__', [left])
    if _builtins_member_is_function(left, 'concat'):
        return _builtins_call_member(left, 'concat', [right])
    if (
        runtime.strict_equal(runtime.jstype(left), 'object')
        or runtime.strict_equal(runtime.jstype(right), 'object')
    ):
        raise TypeError('unsupported operand type(s) for +')
    if (
        runtime.strict_equal(runtime.jstype(left), 'bigint')
        or runtime.strict_equal(runtime.jstype(right), 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_add(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(runtime.jstype(left), 'number')
            or runtime.strict_equal(runtime.jstype(right), 'number')
        ):
            return runtime.native_add(
                runtime.number(left), runtime.number(right))
        return runtime.native_add(left, right)
    if (
        not runtime.strict_equal(runtime.jstype(left), 'number')
        or not runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        return runtime.native_add(left, right)
    result = runtime.native_add(left, right)
    if (
        result <= runtime.number.MAX_SAFE_INTEGER
        and result >= runtime.number.MIN_SAFE_INTEGER
    ):
        return result
    if (
        runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
    ):
        return runtime.native_add(
            runtime.bigint(left), runtime.bigint(right))
    return result


def ρσ_operator_neg(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'number')
        or runtime.strict_equal(value_type, 'bigint')
    ):
        return runtime.native_neg(value)
    if _builtins_member_is_function(value, '__neg__'):
        return _builtins_call_member(value, '__neg__', [])
    return runtime.native_neg(value)


def ρσ_operator_pos(value: Any) -> Any:
    if value is True:
        return 1
    if value is False:
        return 0
    if _builtins_exact_integer_primitive(value):
        return value
    if _builtins_member_is_function(value, '__pos__'):
        return _builtins_call_member(value, '__pos__', [])
    raise TypeError("bad operand type for unary +")


def ρσ_operator_invert(value: Any) -> Any:
    if _builtins_exact_integer_primitive(value):
        return runtime.normalize_integer(
            runtime.native_sub(
                runtime.native_neg(runtime.bigint(value)),
                runtime.bigint(1),
            )
        )
    if _builtins_member_is_function(value, '__invert__'):
        return _builtins_call_member(value, '__invert__', [])
    raise TypeError("bad operand type for unary ~")


def _builtins_sequence_values(value: Any) -> Any:
    if runtime.array.isArray(value):
        return value
    if _builtins_has_member(value, '_tuple_values'):
        return _builtins_get_member(value, '_tuple_values')
    return runtime.undefined


def _builtins_sequence_is_tuple(value: Any) -> _Bool:
    return (
        runtime.array.isArray(value)
        and runtime.object.isFrozen(value)
        or runtime.instance_of(value, runtime.tuple_builtin)
    )


def _builtins_rich_compare(
    left: Any,
    right: Any,
    operation: _Str,
) -> _Bool:
    left_values = _builtins_sequence_values(left)
    right_values = _builtins_sequence_values(right)
    if (
        left_values is not runtime.undefined
        and right_values is not runtime.undefined
    ):
        if (
            _builtins_sequence_is_tuple(left)
            is not _builtins_sequence_is_tuple(right)
        ):
            raise TypeError('cannot compare different sequence types')
        common = min(len(left_values), len(right_values))
        for index in range(common):
            if runtime.equals(left_values[index], right_values[index]):
                continue
            if operation == 'lt' or operation == 'le':
                return ρσ_operator_lt(
                    left_values[index], right_values[index])
            return ρσ_operator_gt(
                left_values[index], right_values[index])
        if operation == 'lt':
            return runtime.native_lt(
                len(left_values), len(right_values))
        if operation == 'le':
            return runtime.native_le(
                len(left_values), len(right_values))
        if operation == 'gt':
            return runtime.native_gt(
                len(left_values), len(right_values))
        return runtime.native_ge(
            len(left_values), len(right_values))

    left_method = {
        'lt': '__lt__',
        'le': '__le__',
        'gt': '__gt__',
        'ge': '__ge__',
    }[operation]
    right_method = {
        'lt': '__gt__',
        'le': '__ge__',
        'gt': '__lt__',
        'ge': '__le__',
    }[operation]
    if _builtins_member_is_function(left, left_method):
        return _builtins_call_member(left, left_method, [right])
    if _builtins_member_is_function(right, right_method):
        return _builtins_call_member(right, right_method, [left])

    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    numeric = (
        (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(left_type, 'boolean')
        )
        and (
            runtime.strict_equal(right_type, 'number')
            or runtime.strict_equal(right_type, 'bigint')
            or runtime.strict_equal(right_type, 'boolean')
        )
    )
    same_primitive = (
        runtime.strict_equal(left_type, right_type)
        and (
            runtime.strict_equal(left_type, 'string')
            or runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(left_type, 'boolean')
        )
    )
    if not numeric and not same_primitive:
        raise TypeError('objects are not orderable')
    if operation == 'lt':
        return runtime.native_lt(left, right)
    if operation == 'le':
        return runtime.native_le(left, right)
    if operation == 'gt':
        return runtime.native_gt(left, right)
    return runtime.native_ge(left, right)


def ρσ_operator_lt(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, 'lt')


def ρσ_operator_le(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, 'le')


def ρσ_operator_gt(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, 'gt')


def ρσ_operator_ge(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, 'ge')


def ρσ_operator_sub(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if (
        runtime.strict_equal(left_type, runtime.jstype(right))
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        return runtime.native_sub(left, right)
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('sub', left, right)
    if _builtins_member_is_function(left, '__sub__'):
        return _builtins_call_member(left, '__sub__', [right])
    return runtime.native_sub(left, right)


def ρσ_operator_sub_exact(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('sub', left, right)
    if _builtins_member_is_function(left, '__sub__'):
        return _builtins_call_member(left, '__sub__', [right])
    if (
        runtime.strict_equal(runtime.jstype(left), 'bigint')
        or runtime.strict_equal(runtime.jstype(right), 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_sub(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(runtime.jstype(left), 'number')
            or runtime.strict_equal(runtime.jstype(right), 'number')
        ):
            return runtime.native_sub(
                runtime.number(left), runtime.number(right))
        return runtime.native_sub(left, right)
    if (
        not runtime.strict_equal(runtime.jstype(left), 'number')
        or not runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        return runtime.native_sub(left, right)
    result = runtime.native_sub(left, right)
    if (
        result <= runtime.number.MAX_SAFE_INTEGER
        and result >= runtime.number.MIN_SAFE_INTEGER
    ):
        return result
    if (
        runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
    ):
        return runtime.native_sub(
            runtime.bigint(left), runtime.bigint(right))
    return result


def _builtins_repeat_string(text: str, count: Any) -> str:
    if count <= 0:
        return ''
    if runtime.strict_equal(runtime.jstype(count), 'bigint'):
        count = runtime.number(count)
    return runtime.reflect.apply(
        runtime.string_class.prototype.repeat, text, [count])


def ρσ_operator_mul(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, right_type)
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        return runtime.native_mul(left, right)
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('mul', left, right)
    if (
        runtime.strict_equal(runtime.jstype(left), 'string')
        and _builtins_exact_integer_primitive(right)
    ):
        return _builtins_repeat_string(left, right)
    if (
        runtime.strict_equal(runtime.jstype(right), 'string')
        and _builtins_exact_integer_primitive(left)
    ):
        return _builtins_repeat_string(right, left)
    if _builtins_member_is_function(left, '__mul__'):
        return _builtins_call_member(left, '__mul__', [right])
    if _builtins_member_is_function(right, '__rmul__'):
        return _builtins_call_member(right, '__rmul__', [left])
    return runtime.native_mul(left, right)


def ρσ_operator_mul_exact(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('mul', left, right)
    if (
        runtime.strict_equal(runtime.jstype(left), 'string')
        and _builtins_exact_integer_primitive(right)
    ):
        return _builtins_repeat_string(left, right)
    if (
        runtime.strict_equal(runtime.jstype(right), 'string')
        and _builtins_exact_integer_primitive(left)
    ):
        return _builtins_repeat_string(right, left)
    if _builtins_member_is_function(left, '__mul__'):
        return _builtins_call_member(left, '__mul__', [right])
    if _builtins_member_is_function(right, '__rmul__'):
        return _builtins_call_member(right, '__rmul__', [left])
    if (
        runtime.strict_equal(runtime.jstype(left), 'bigint')
        or runtime.strict_equal(runtime.jstype(right), 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_mul(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(runtime.jstype(left), 'number')
            or runtime.strict_equal(runtime.jstype(right), 'number')
        ):
            return runtime.native_mul(
                runtime.number(left), runtime.number(right))
        return runtime.native_mul(left, right)
    if (
        not runtime.strict_equal(runtime.jstype(left), 'number')
        or not runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        raise TypeError(
            'unsupported operand type(s) for multiplication')
    result = runtime.native_mul(left, right)
    if (
        result <= runtime.number.MAX_SAFE_INTEGER
        and result >= runtime.number.MIN_SAFE_INTEGER
    ):
        return result
    if (
        runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
    ):
        return runtime.native_mul(
            runtime.bigint(left), runtime.bigint(right))
    return result


def ρσ_operator_div(left: Any, right: Any) -> Any:
    if (
        runtime.strict_equal(runtime.jstype(left), 'number')
        and runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        return runtime.native_div(left, right)
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('truediv', left, right)
    if _builtins_member_is_function(left, '__div__'):
        return _builtins_call_member(left, '__div__', [right])
    if _builtins_member_is_function(right, '__rdiv__'):
        return _builtins_call_member(right, '__rdiv__', [left])
    return runtime.native_div(left, right)


def ρσ_operator_pow(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if (
        runtime.strict_equal(left_type, runtime.jstype(right))
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        return runtime.native_pow(left, right)
    if _builtins_member_is_function(left, '__pow__'):
        return _builtins_call_member(left, '__pow__', [right])
    return runtime.native_pow(left, right)


def ρσ_operator_pow_exact(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__pow__'):
        return _builtins_call_member(left, '__pow__', [right])
    if (
        (
            runtime.strict_equal(runtime.jstype(left), 'bigint')
            or runtime.strict_equal(runtime.jstype(right), 'bigint')
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        if right < 0:
            raise ValueError(
                'negative powers of exact integers are not implemented yet')
        return runtime.native_pow(
            runtime.bigint(left), runtime.bigint(right))
    if (
        not runtime.strict_equal(runtime.jstype(left), 'number')
        or not runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        return runtime.native_pow(left, right)
    result = runtime.native_pow(left, right)
    if (
        result <= runtime.number.MAX_SAFE_INTEGER
        and result >= runtime.number.MIN_SAFE_INTEGER
    ):
        return result
    if (
        runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
        and right >= 0
    ):
        return runtime.native_pow(
            runtime.bigint(left), runtime.bigint(right))
    return result


def _builtins_inplace(
    left: Any,
    right: Any,
    method_name: _Str,
    fallback: Callable[[Any, Any], Any],
) -> Any:
    left_type = runtime.jstype(left)
    if (
        not runtime.strict_equal(left_type, 'object')
        and not runtime.strict_equal(left_type, 'function')
    ):
        return fallback(left, right)
    if _builtins_member_is_function(left, method_name):
        return _builtins_call_member(left, method_name, [right])
    return fallback(left, right)


def ρσ_operator_iadd(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if (
        runtime.strict_equal(left_type, runtime.jstype(right))
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(left_type, 'string')
        )
    ):
        return runtime.native_add(left, right)
    return _builtins_inplace(left, right, '__iadd__', ρσ_operator_add)


def ρσ_operator_isub(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if (
        runtime.strict_equal(left_type, runtime.jstype(right))
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        return runtime.native_sub(left, right)
    return _builtins_inplace(left, right, '__isub__', ρσ_operator_sub)


def ρσ_operator_imul(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if (
        runtime.strict_equal(left_type, runtime.jstype(right))
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        return runtime.native_mul(left, right)
    return _builtins_inplace(left, right, '__imul__', ρσ_operator_mul)


def ρσ_operator_idiv(left: Any, right: Any) -> Any:
    if (
        runtime.strict_equal(runtime.jstype(left), 'number')
        and runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        return runtime.native_div(left, right)
    return _builtins_inplace(left, right, '__idiv__', ρσ_operator_div)


def ρσ_operator_ipow(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if (
        runtime.strict_equal(left_type, runtime.jstype(right))
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        return runtime.native_pow(left, right)
    return _builtins_inplace(left, right, '__ipow__', ρσ_operator_pow)


def ρσ_operator_iadd_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__iadd__', ρσ_operator_add_exact)


def ρσ_operator_isub_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__isub__', ρσ_operator_sub_exact)


def ρσ_operator_imul_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__imul__', ρσ_operator_mul_exact)


def ρσ_operator_ipow_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__ipow__', ρσ_operator_pow_exact)


def ρσ_operator_idiv_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__itruediv__', ρσ_operator_truediv_exact)


def ρσ_operator_truediv(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('truediv', left, right)
    if runtime.equals(right, 0):
        raise runtime.zero_division_error('division by zero')
    if (
        runtime.strict_equal(runtime.jstype(left), 'bigint')
        or runtime.strict_equal(runtime.jstype(right), 'bigint')
    ):
        return runtime.native_div(
            runtime.number(left), runtime.number(right))
    if (
        runtime.strict_equal(runtime.jstype(left), 'number')
        and runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        return runtime.native_div(left, right)
    if _builtins_member_is_function(left, '__truediv__'):
        return _builtins_call_member(left, '__truediv__', [right])
    if _builtins_member_is_function(right, '__rtruediv__'):
        return _builtins_call_member(right, '__rtruediv__', [left])
    return runtime.native_div(left, right)


def ρσ_operator_truediv_exact(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('truediv', left, right)
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.reflect.construct(
            runtime.rational_class, [left, right])
    if _builtins_member_is_function(left, '__truediv__'):
        return _builtins_call_member(left, '__truediv__', [right])
    if _builtins_member_is_function(right, '__rtruediv__'):
        return _builtins_call_member(right, '__rtruediv__', [left])
    return runtime.native_div(left, right)


def ρσ_operator_mod(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__mod__'):
        return _builtins_call_member(left, '__mod__', [right])
    if runtime.equals(right, 0):
        raise runtime.zero_division_error(
            'integer modulo by zero')
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        left_bigint = runtime.bigint(left)
        right_bigint = runtime.bigint(right)
        remainder = runtime.native_mod(left_bigint, right_bigint)
        if (
            remainder != 0
            and (
                remainder < 0 and right_bigint > 0
                or remainder > 0 and right_bigint < 0
            )
        ):
            remainder += right_bigint
        return runtime.normalize_integer(remainder)
    return runtime.native_mod(left, right)


def ρσ_operator_matmul(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__matmul__'):
        return _builtins_call_member(left, '__matmul__', [right])
    if _builtins_member_is_function(right, '__rmatmul__'):
        return _builtins_call_member(right, '__rmatmul__', [left])
    raise TypeError("unsupported operand type(s) for @")


def ρσ_operator_imatmul(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__imatmul__', ρσ_operator_matmul)


def ρσ_operator_ifloordiv(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__ifloordiv__', ρσ_operator_floordiv)


def ρσ_operator_imod(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, '__imod__', ρσ_operator_mod)


def ρσ_operator_ibitand(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__iand__', ρσ_operator_bitand)


def ρσ_operator_ibitor(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, '__ior__', ρσ_operator_bitor)


def ρσ_operator_ibitxor(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__ixor__', ρσ_operator_bitxor)


def ρσ_operator_ilshift(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__ilshift__', ρσ_operator_lshift)


def ρσ_operator_irshift(left: Any, right: Any) -> Any:
    return _builtins_inplace(
        left, right, '__irshift__', ρσ_operator_rshift)


def ρσ_operator_bitand(left: Any, right: Any) -> Any:
    if left is True or left is False:
        if right is True or right is False:
            return runtime.native_bitand(left, right)
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.normalize_integer(
            runtime.native_bitand(
                runtime.bigint(left), runtime.bigint(right)))
    if _builtins_member_is_function(left, '__and__'):
        return _builtins_call_member(left, '__and__', [right])
    if _builtins_member_is_function(right, '__rand__'):
        return _builtins_call_member(right, '__rand__', [left])
    raise TypeError('unsupported operand type(s) for &')


def ρσ_operator_bitor(left: Any, right: Any) -> Any:
    if left is True or left is False:
        if right is True or right is False:
            return runtime.native_bitor(left, right)
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.normalize_integer(
            runtime.native_bitor(
                runtime.bigint(left), runtime.bigint(right)))
    if _builtins_member_is_function(left, '__or__'):
        return _builtins_call_member(left, '__or__', [right])
    if _builtins_member_is_function(right, '__ror__'):
        return _builtins_call_member(right, '__ror__', [left])
    raise TypeError('unsupported operand type(s) for |')


def ρσ_operator_bitxor(left: Any, right: Any) -> Any:
    if left is True or left is False:
        if right is True or right is False:
            return runtime.native_bitxor(left, right)
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.normalize_integer(
            runtime.native_bitxor(
                runtime.bigint(left), runtime.bigint(right)))
    if _builtins_member_is_function(left, '__xor__'):
        return _builtins_call_member(left, '__xor__', [right])
    if _builtins_member_is_function(right, '__rxor__'):
        return _builtins_call_member(right, '__rxor__', [left])
    raise TypeError('unsupported operand type(s) for ^')


def _builtins_shift_operands(left: Any, right: Any) -> list[Any]:
    if (
        not _builtins_exact_integer_primitive(left)
        or not _builtins_exact_integer_primitive(right)
    ):
        raise TypeError('shift operands must be integers')
    right_bigint = runtime.bigint(right)
    if right_bigint < 0:
        raise ValueError('negative shift count')
    return [runtime.bigint(left), right_bigint]


def ρσ_operator_lshift(left: Any, right: Any) -> Any:
    operands = _builtins_shift_operands(left, right)
    return runtime.normalize_integer(
        runtime.native_lshift(operands[0], operands[1]))


def ρσ_operator_rshift(left: Any, right: Any) -> Any:
    operands = _builtins_shift_operands(left, right)
    return runtime.normalize_integer(
        runtime.native_rshift(operands[0], operands[1]))


def ρσ_operator_floordiv(left: Any, right: Any) -> Any:
    if runtime.equals(right, 0):
        raise runtime.zero_division_error(
            'integer division or modulo by zero')
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
        and (
            runtime.strict_equal(runtime.jstype(left), 'bigint')
            or runtime.strict_equal(runtime.jstype(right), 'bigint')
        )
    ):
        left_bigint = runtime.bigint(left)
        right_bigint = runtime.bigint(right)
        quotient = runtime.native_div(left_bigint, right_bigint)
        remainder = runtime.native_mod(left_bigint, right_bigint)
        if (
            remainder != 0
            and (
                left_bigint < 0 and right_bigint > 0
                or left_bigint > 0 and right_bigint < 0
            )
        ):
            quotient -= runtime.bigint(1)
        return runtime.normalize_integer(quotient)
    if (
        runtime.strict_equal(runtime.jstype(left), 'number')
        and runtime.strict_equal(runtime.jstype(right), 'number')
    ):
        return runtime.math.floor(runtime.native_div(left, right))
    if _builtins_member_is_function(left, '__floordiv__'):
        return _builtins_call_member(left, '__floordiv__', [right])
    return runtime.math.floor(runtime.native_div(left, right))


def ρσ_bool(value: Any) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'object')
        or runtime.strict_equal(value_type, 'function')
    ):
        if _builtins_member_is_function(value, '__bool__'):
            answer = _builtins_call_member(value, '__bool__', [])
            if answer is not True and answer is not False:
                raise TypeError('__bool__ should return bool')
            return answer
        if _builtins_member_is_function(value, '__len__'):
            length = _builtins_call_member(value, '__len__', [])
            if length < 0:
                raise ValueError('__len__() should return >= 0')
            return length != 0
    return not not value


def ρσ_round(value: Any) -> Any:
    # This retains the historical Sage.js behavior; Python's tie-to-even
    # semantics are a separate compatibility task.
    return runtime.math.round(value)


def ρσ_print(*values: Any) -> None:
    parts = [
        'None' if value is runtime.undefined else str(value)
        for value in values
    ]
    runtime.console_object.log(str.join(' ', parts))


def _builtins_digit_value(character: _Str) -> _Int:
    code = runtime.reflect.apply(
        runtime.string_class.prototype.charCodeAt,
        character,
        [0],
    )
    if 48 <= code <= 57:
        return code - 48
    if 65 <= code <= 90:
        return code - 65 + 10
    if 97 <= code <= 122:
        return code - 97 + 10
    return -1


def _builtins_parse_integer(value: _Str, base: Any) -> Any:
    text = runtime.reflect.apply(
        runtime.string_class.prototype.trim, value, [])
    if not text:
        raise ValueError('invalid literal for int()')
    sign = runtime.bigint(1)
    if text[0] == '+' or text[0] == '-':
        if text[0] == '-':
            sign = runtime.bigint(-1)
        text = text[1:]
    radix = 10 if base is runtime.undefined else _coerce_int_base(base)
    inferred_base = radix == 0
    consumed_prefix = False
    if radix == 0:
        radix = 10
        if len(text) >= 2 and text[0] == '0':
            marker = text[1]
            if marker == 'x' or marker == 'X':
                radix = 16
                text = text[2:]
                consumed_prefix = True
            elif marker == 'o' or marker == 'O':
                radix = 8
                text = text[2:]
                consumed_prefix = True
            elif marker == 'b' or marker == 'B':
                radix = 2
                text = text[2:]
                consumed_prefix = True
    elif len(text) >= 2 and text[0] == '0':
        marker = text[1]
        if (
            radix == 16 and (marker == 'x' or marker == 'X')
            or radix == 8 and (marker == 'o' or marker == 'O')
            or radix == 2 and (marker == 'b' or marker == 'B')
        ):
            text = text[2:]
    if not text:
        raise ValueError('invalid literal for int()')
    if (
        inferred_base
        and not consumed_prefix
        and len(text) > 1
        and text[0] == '0'
    ):
        for character in text:
            if character != '0' and character != '_':
                raise ValueError(
                    'leading zeros in decimal integer literals are not permitted'
                )
    answer = runtime.bigint(0)
    previous_was_digit = False
    saw_digit = False
    for character in text:
        if character == '_':
            if not previous_was_digit:
                raise ValueError('invalid underscore in integer literal')
            previous_was_digit = False
            continue
        digit = _builtins_digit_value(character)
        if digit < 0 or digit >= radix:
            raise ValueError('invalid digit in integer literal')
        answer = (
            answer * runtime.bigint(radix)
            + runtime.bigint(digit)
        )
        previous_was_digit = True
        saw_digit = True
    if not saw_digit or not previous_was_digit:
        raise ValueError('invalid literal for int()')
    return runtime.normalize_integer(sign * answer)


def _coerce_int_base(base: Any) -> _Int:
    if base is True:
        base = 1
    elif base is False:
        base = 0
    elif runtime.strict_equal(runtime.jstype(base), 'bigint'):
        base = runtime.number(base)
    if (
        not runtime.strict_equal(runtime.jstype(base), 'number')
        or not runtime.number.isInteger(base)
        or base != 0 and (base < 2 or base > 36)
    ):
        raise ValueError('int() base must be >= 2 and <= 36, or 0')
    return base


def ρσ_int(value: Any = 0, base: Any = runtime.undefined) -> Any:
    if value is True:
        return 1
    if value is False:
        return 0
    if runtime.strict_equal(runtime.jstype(value), 'number'):
        if base is not runtime.undefined:
            raise TypeError("int() can't convert non-string with explicit base")
        answer = runtime.math.trunc(value)
    elif runtime.strict_equal(runtime.jstype(value), 'bigint'):
        if base is not runtime.undefined:
            raise TypeError("int() can't convert non-string with explicit base")
        return value
    elif runtime.strict_equal(runtime.jstype(value), 'string'):
        return _builtins_parse_integer(value, base)
    elif (
        value
        and _builtins_member_is_function(value, 'decode')
        and _builtins_member_is_function(value, '__len__')
    ):
        return _builtins_parse_integer(
            _builtins_call_member(value, 'decode', ['ascii']), base)
    elif value and _builtins_member_is_function(value, '__int__'):
        if base is not runtime.undefined:
            raise TypeError("int() can't convert non-string with explicit base")
        answer = _builtins_call_member(value, '__int__', [])
    else:
        raise TypeError(
            "int() argument must be a string, a bytes-like object "
            "or a real number"
        )
    if runtime.is_nan(answer):
        radix = 10 if base is runtime.undefined else base
        raise ValueError(
            'Invalid literal for int with base '
            + str(radix) + ': ' + str(value)
        )
    return answer


def ρσ_float(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if runtime.strict_equal(value_type, 'number'):
        answer = value
    elif runtime.strict_equal(value_type, 'string'):
        answer = runtime.parse_float(value)
    elif value and _builtins_member_is_function(value, '__float__'):
        answer = _builtins_call_member(value, '__float__', [])
    else:
        answer = runtime.parse_float(value)
    if runtime.is_nan(answer):
        raise ValueError(
            'Could not convert string to float: ' + str(value))
    return answer


_BUILTINS_MAX_SAFE_INTEGER = runtime.bigint(
    runtime.number.MAX_SAFE_INTEGER)
_BUILTINS_MIN_SAFE_INTEGER = runtime.bigint(
    runtime.number.MIN_SAFE_INTEGER)


def ρσ_integer_literal(text: _Str) -> Any:
    text = text.replace('_', '')
    value = runtime.bigint(text)
    if _BUILTINS_MIN_SAFE_INTEGER <= value <= _BUILTINS_MAX_SAFE_INTEGER:
        return runtime.number(value)
    return value


def ρσ_real_literal(text: _Str) -> Any:
    return runtime.real_literal(text)


_BUILTINS_ARRAYLIKE_TAGS = [
    '[object Int8Array]',
    '[object Uint8Array]',
    '[object Uint8ClampedArray]',
    '[object Int16Array]',
    '[object Uint16Array]',
    '[object Int32Array]',
    '[object Uint32Array]',
    '[object Float32Array]',
    '[object Float64Array]',
    '[object BigInt64Array]',
    '[object BigUint64Array]',
    '[object HTMLCollection]',
    '[object NodeList]',
    '[object NamedNodeMap]',
    '[object TouchList]',
]


def ρσ_arraylike(value: Any) -> _Bool:
    if runtime.array.isArray(value):
        return True
    if runtime.strict_equal(runtime.jstype(value), 'string'):
        return True
    if value is None or value is runtime.undefined:
        return False
    tag = runtime.reflect.apply(
        runtime.object.prototype.toString, value, [])
    return tag in _BUILTINS_ARRAYLIKE_TAGS


def options_object(target: Any) -> Any:
    def wrapped(*call_args: Any) -> Any:
        if (
            len(call_args) > 0
            and call_args[-1] is not None
            and runtime.strict_equal(
                runtime.jstype(call_args[-1]), 'object')
        ):
            call_args[-1][runtime.kwargs_symbol] = True
        return target(*call_args)

    return wrapped


def ρσ_id(value: Any) -> Any:
    return value.ρσ_object_id


_BUILTINS_HIDDEN_INTROSPECTION_NAMES = [
    '__argnames__',
    '__bind_methods__',
    '__handles_kwarg_interpolation__',
    '__sagejs_baselib_private_names__',
    '__varargs__',
    '__varkw__',
    'apply',
    'arguments',
    'bind',
    'call',
    'caller',
    'constructor',
    'prototype',
    'pysort',
    'toLocaleString',
    'toString',
    'valueOf',
]


def _builtins_visible_introspection_name(name: Any) -> _Bool:
    return (
        runtime.strict_equal(runtime.jstype(name), 'string')
        and runtime.string_find(name, 'ρσ') != 0
        and name not in _BUILTINS_HIDDEN_INTROSPECTION_NAMES
    )


def _builtins_introspection_target(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'object')
        or runtime.strict_equal(value_type, 'function')
    ):
        return value
    return runtime.reflect.apply(
        runtime.object, runtime.undefined, [value])


def _builtins_append_dir_names(
    value: Any,
    answer: list[_Str],
) -> None:
    current = value
    while (
        current is not None
        and current is not runtime.undefined
        and current is not runtime.object.prototype
    ):
        for name in runtime.object.getOwnPropertyNames(current):
            if (
                _builtins_visible_introspection_name(name)
                and name not in answer
            ):
                answer.append(name)
        current = runtime.object.getPrototypeOf(current)


def _builtins_append_own_dir_names(
    value: Any,
    answer: list[_Str],
) -> None:
    for name in runtime.object.getOwnPropertyNames(value):
        if (
            _builtins_visible_introspection_name(name)
            and name not in answer
        ):
            answer.append(name)


def ρσ_dir(item: Any = runtime.undefined) -> list[_Str]:
    """Return the sorted Python-facing attributes available on ``item``."""
    if item is runtime.undefined:
        item = runtime.global_object
    elif _builtins_member_is_function(item, '__dir__'):
        custom_names = _builtins_call_member(item, '__dir__', [])
        answer = []
        for name in custom_names:
            if not runtime.strict_equal(runtime.jstype(name), 'string'):
                raise TypeError('__dir__() must return an iterable of strings')
            answer.append(name)
        answer.sort()
        return answer

    target = _builtins_introspection_target(item)
    answer = []
    target_is_function = runtime.strict_equal(
        runtime.jstype(target), 'function')
    constructor = _builtins_get_member(target, 'constructor')
    target_is_python_instance = _builtins_is_python_class(constructor)
    if target_is_function and not target_is_python_instance:
        _builtins_append_own_dir_names(target, answer)
        for native_function_name in ['length', 'name']:
            if native_function_name in answer:
                answer.remove(native_function_name)
    else:
        _builtins_append_dir_names(target, answer)

    # Python classes expose their instance methods through the class object.
    # Sage.js stores those methods on the JavaScript constructor prototype.
    if target_is_function:
        prototype = _builtins_get_member(target, 'prototype')
        if (
            prototype is not runtime.undefined
            and _builtins_has_member(prototype, '__bases__')
        ):
            _builtins_append_dir_names(prototype, answer)
    if target_is_python_instance and target_is_function:
        for class_only_name in [
            '__bases__', '__module__', '__name__', 'length', 'name'
        ]:
            if class_only_name in answer:
                answer.remove(class_only_name)
    elif not target_is_function and '__bases__' in answer:
        answer.remove('__bases__')
    if target is runtime.global_object:
        private_names = _builtins_get_member(
            runtime.global_object, '__sagejs_baselib_private_names__')
        if private_names is not runtime.undefined:
            for private_name in private_names:
                if private_name in answer:
                    answer.remove(private_name)

    answer.sort()
    return answer


def _builtins_callable_name(value: Any) -> _Str:
    name = _builtins_get_member(value, '__name__')
    if runtime.strict_equal(runtime.jstype(name), 'string') and name:
        if runtime.string_find(name, 'ρσ_') == 0:
            return name[3:]
        return name
    name = _builtins_get_member(value, 'name')
    if runtime.strict_equal(runtime.jstype(name), 'string') and name:
        if runtime.string_find(name, 'ρσ_') == 0:
            return name[3:]
        return name
    return '<anonymous>'


def _builtins_has_own(value: Any, name: _Str) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        [name],
    )


def _builtins_signature(value: Any, name: _Str) -> _Str:
    argument_names = _builtins_get_member(value, '__argnames__')
    defaults = _builtins_get_member(value, '__defaults__')
    parts = []
    if runtime.array.isArray(argument_names):
        for argument in argument_names:
            part = argument
            if _builtins_has_own(defaults, argument):
                default_value = _builtins_get_member(defaults, argument)
                if default_value is runtime.undefined:
                    part += '=None'
                else:
                    part += '=' + runtime.repr(default_value)
            parts.append(part)

    varargs = _builtins_get_member(value, '__varargs__')
    if runtime.strict_equal(runtime.jstype(varargs), 'string'):
        parts.append('*' + varargs)
    varkw = _builtins_get_member(value, '__varkw__')
    if runtime.strict_equal(runtime.jstype(varkw), 'string'):
        parts.append('**' + varkw)
    return name + '(' + str.join(', ', parts) + ')'


def _builtins_doc(value: Any) -> _Str:
    doc = _builtins_get_member(value, '__doc__')
    if runtime.strict_equal(runtime.jstype(doc), 'string'):
        return doc
    return ''


def _builtins_indent_doc(doc: _Str, prefix: _Str) -> _Str:
    if not doc:
        return ''
    lines = []
    for line in doc.split('\n'):
        lines.append(prefix + line)
    return str.join('\n', lines)


def _builtins_is_python_class(value: Any) -> _Bool:
    if not runtime.strict_equal(runtime.jstype(value), 'function'):
        return False
    prototype = _builtins_get_member(value, 'prototype')
    return (
        prototype is not runtime.undefined
        and _builtins_has_member(prototype, '__bases__')
    )


def _builtins_class_help(value: Any, instance: _Bool) -> _Str:
    cls = value
    if instance:
        cls = _builtins_get_member(value, 'constructor')
    name = _builtins_callable_name(cls)
    heading = 'Help on class ' + name + ':'
    if instance:
        heading = 'Help on ' + name + ' object:'
    lines = [
        heading,
        '',
        'class ' + _builtins_signature(cls, name),
    ]
    doc = _builtins_doc(cls)
    if doc:
        lines.extend(['', _builtins_indent_doc(doc, '    ')])

    prototype = _builtins_get_member(cls, 'prototype')
    methods = []
    for method_name in ρσ_dir(cls):
        method = _builtins_get_member(prototype, method_name)
        if (
            runtime.string_find(method_name, '_') != 0
            and runtime.strict_equal(runtime.jstype(method), 'function')
        ):
            methods.append(method_name)
    if len(methods) > 0:
        lines.extend(['', 'Methods:'])
        for method_name in methods:
            method = _builtins_get_member(prototype, method_name)
            lines.append(
                '    ' + _builtins_signature(method, method_name))
            method_doc = _builtins_doc(method)
            if method_doc:
                lines.append(_builtins_indent_doc(method_doc, '        '))
    return str.join('\n', lines)


def ρσ_help(item: Any = runtime.undefined) -> None:
    """Print concise Python-style help derived from Sage.js metadata."""
    if item is runtime.undefined:
        runtime.console_object.log(
            'Welcome to Sage.js help.  '
            + 'Call help(object) for information about an object.')
        return

    if _builtins_is_python_class(item):
        text = _builtins_class_help(item, False)
    else:
        constructor = _builtins_get_member(item, 'constructor')
        if _builtins_is_python_class(constructor):
            text = _builtins_class_help(item, True)
        elif runtime.strict_equal(runtime.jstype(item), 'function'):
            name = _builtins_callable_name(item)
            lines = [
                'Help on function ' + name + ':',
                '',
                _builtins_signature(item, name),
            ]
            doc = _builtins_doc(item)
            if doc:
                lines.extend([
                    '', _builtins_indent_doc(doc, '    ')])
            text = str.join('\n', lines)
        else:
            type_name = _builtins_callable_name(constructor)
            text = 'Help on ' + type_name + ' object.'
            doc = _builtins_doc(item)
            if doc:
                text += '\n\n' + _builtins_indent_doc(doc, '    ')
    runtime.console_object.log(text)


def ρσ_ord(value: Any) -> _Int:
    if (
        runtime.strict_equal(runtime.jstype(value), 'object')
        and _builtins_has_member(value, 'length')
    ):
        if value.length != 1:
            raise TypeError(
                'ord() expected a character, but string of length '
                + str(value.length) + ' found'
        )
        return value[0]
    if value.length < 1 or value.length > 2:
        raise TypeError(
            'ord() expected a character, but string of length '
            + str(value.length) + ' found'
        )
    answer = value.charCodeAt(0)
    if 0xD800 <= answer <= 0xDBFF:
        second = value.charCodeAt(1)
        if 0xDC00 <= second <= 0xDFFF:
            return (
                (answer - 0xD800) * 0x400
                + second - 0xDC00 + 0x10000
            )
        raise TypeError('string is missing the low surrogate char')
    if value.length != 1:
        raise TypeError(
            'ord() expected a character, but string of length '
            + str(value.length) + ' found'
        )
    return answer


def ρσ_chr(code: _Int) -> _Str:
    if code < 0 or code > 0x10FFFF:
        raise ValueError('chr() arg not in range(0x110000)')
    if runtime.strict_equal(runtime.jstype(code), 'bigint'):
        code = runtime.number(code)
    if code <= 0xFFFF:
        return runtime.string_class.fromCharCode(code)
    code -= 0x10000
    return runtime.string_class.fromCharCode(
        0xD800 + (code >> 10),
        0xDC00 + (code & 0x3FF),
    )


def ρσ_callable(value: Any) -> _Bool:
    return runtime.strict_equal(runtime.jstype(value), 'function')


def _builtins_integer_string(
    value: Any,
    radix: _Int,
    prefix: _Str,
) -> _Str:
    if not _builtins_exact_integer_primitive(value):
        raise TypeError('integer required')
    answer = value.toString(radix)
    if answer[0] == '-':
        return '-' + prefix + answer[1:]
    return prefix + answer


def ρσ_bin(value: Any) -> _Str:
    return _builtins_integer_string(value, 2, '0b')


def ρσ_hex(value: Any) -> _Str:
    return _builtins_integer_string(value, 16, '0x')


def ρσ_oct(value: Any) -> _Str:
    return _builtins_integer_string(value, 8, '0o')


def ρσ_hash(value: Any) -> Any:
    if value is True:
        return 1
    if value is False or value is None:
        return 0
    if _builtins_exact_integer_primitive(value):
        modulus = runtime.bigint('2305843009213693951')
        answer = runtime.native_mod(runtime.bigint(value), modulus)
        if answer == -1:
            answer = runtime.bigint(-2)
        return runtime.normalize_integer(answer)
    if _builtins_member_is_function(value, '__hash__'):
        return ρσ_hash(_builtins_call_member(value, '__hash__', []))
    raise TypeError('unhashable type')


def ρσ_enumerate(
    iterable: Any,
    start: _Int = 0,
) -> Iterator[Any]:
    index = start
    for value in iterable:
        yield runtime.math_tuple([index, value])
        index += 1


def ρσ_tuple(iterable: Any = runtime.undefined) -> Any:
    if iterable is runtime.undefined:
        return runtime.math_tuple([])
    if (
        runtime.array.isArray(iterable)
        and runtime.object.isFrozen(iterable)
    ):
        return iterable
    return runtime.math_tuple([value for value in iterable])


def _builtins_tuple_subclass_init(
    self: Any,
    iterable: Any = runtime.undefined,
) -> None:
    self._tuple_values = (
        []
        if iterable is runtime.undefined
        else list(iterable)
    )


def _builtins_tuple_subclass_len(self: Any) -> _Int:
    return len(self._tuple_values)


def _builtins_tuple_subclass_iter(self: Any) -> Any:
    return iter(self._tuple_values)


def _builtins_tuple_subclass_getitem(
    self: Any,
    index: _Int,
) -> Any:
    return self._tuple_values[index]


def _builtins_tuple_subclass_repr(self: Any) -> _Str:
    return repr(runtime.math_tuple(self._tuple_values))


def _builtins_tuple_subclass_eq(
    self: Any,
    other: Any,
) -> _Bool:
    other_values = _builtins_sequence_values(other)
    if (
        other_values is runtime.undefined
        or not _builtins_sequence_is_tuple(other)
        or len(self._tuple_values) != len(other_values)
    ):
        return False
    for index in range(len(self._tuple_values)):
        if not runtime.equals(
            self._tuple_values[index], other_values[index]
        ):
            return False
    return True


def _builtins_tuple_subclass_add(
    self: Any,
    other: Any,
) -> Any:
    other_values = _builtins_sequence_values(other)
    if (
        other_values is runtime.undefined
        or not _builtins_sequence_is_tuple(other)
    ):
        raise TypeError('can only concatenate tuple to tuple')
    values = list(self._tuple_values)
    values.extend(other_values)
    return runtime.math_tuple(values)


def _builtins_tuple_subclass_mul(
    self: Any,
    count: Any,
) -> Any:
    count = int(count)
    values = []
    for _repeat in range(max(0, count)):
        values.extend(self._tuple_values)
    return runtime.math_tuple(values)


def ρσ_reversed(iterable: Any) -> Iterator[Any]:
    if _builtins_member_is_function(iterable, '__reversed__'):
        for value in _builtins_call_member(
            iterable, '__reversed__', []
        ):
            yield value
    else:
        if ρσ_arraylike(iterable):
            length = iterable.length
        elif (
            _builtins_member_is_function(iterable, '__len__')
            and _builtins_member_is_function(iterable, '__getitem__')
        ):
            length = _builtins_call_member(iterable, '__len__', [])
        else:
            raise TypeError(
                "'object' is not reversible")
        index = length - 1
        while index >= 0:
            if ρσ_arraylike(iterable):
                yield iterable[index]
            else:
                yield _builtins_call_member(
                    iterable, '__getitem__', [index])
            index -= 1


def _builtins_native_map(value: Any) -> _Bool:
    return (
        value is not None
        and _builtins_get_member(value, 'constructor')
        is runtime.map_class
    )


def ρσ_iter(iterable: Any) -> Any:
    iterator_method = _builtins_get_member(
        iterable, runtime.iterator_symbol)
    if runtime.strict_equal(runtime.jstype(iterator_method), 'function'):
        if _builtins_native_map(iterable):
            return _builtins_call_member(iterable, 'keys', [])
        return runtime.reflect.apply(iterator_method, iterable, [])
    keys = runtime.object.keys(iterable)
    return runtime.reflect.apply(
        runtime.reflect.get(keys, runtime.iterator_symbol),
        keys,
        [],
    )


class _BuiltinsMissing:
    pass


_BUILTINS_MISSING = _BuiltinsMissing()
_BUILTINS_EMPTY = _BuiltinsMissing()


def _builtins_generator_result(result: Any) -> Any:
    if not result.done:
        return result.value
    if (
        result.value is not runtime.undefined
        and result.value is not None
    ):
        raise StopIteration(result.value)
    raise StopIteration()


def ρσ_generator_send(
    iterator: Any,
    value: Any = None,
) -> Any:
    if iterator.__started__ is False:
        if value is not None:
            raise TypeError(
                "can't send non-None value to a just-started generator")
        iterator.__started__ = True
    return _builtins_generator_result(iterator.next(value))


def ρσ_generator_throw(
    iterator: Any,
    exception: Any,
    *args: Any,
) -> Any:
    if runtime.strict_equal(runtime.jstype(exception), 'function'):
        exception = runtime.reflect.construct(
            exception, list(args))
    return _builtins_generator_result(
        iterator.__native_throw__(exception))


def ρσ_generator_close(iterator: Any) -> None:
    try:
        result = iterator.__native_throw__(GeneratorExit())
    except GeneratorExit:
        return None
    if result.done:
        return None
    raise RuntimeError('generator ignored GeneratorExit')


def ρσ_next(
    iterator: Any,
    fallback: Any = _BUILTINS_MISSING,
) -> Any:
    if iterator.__started__ is False:
        iterator.__started__ = True
    result = iterator.next()
    if not result.done:
        return result.value
    if fallback is not _BUILTINS_MISSING:
        return fallback
    return _builtins_generator_result(result)


@runtime.sequence_class
class _Range:
    def __init__(
        self,
        start: _Int,
        stop: _Int,
        step: _Int,
    ) -> None:
        if step == 0:
            raise ValueError('range() arg 3 must not be zero')
        self.start = start
        self.stop = stop
        self.step = step
        self._length = max(
            runtime.math.ceil(
                runtime.native_div(stop - start, step)
            ),
            0,
        )

    def __iter__(self) -> Iterator[_Int]:
        value = self.start
        for _index in range(self._length):
            yield value
            value += self.step

    def __len__(self) -> _Int:
        return self._length

    def __getitem__(self, index: _Int) -> _Int:
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('range object index out of range')
        return self.start + index * self.step

    def count(self, value: Any) -> _Int:
        for item in self:
            if item == value:
                return 1
        return 0

    def index(self, value: Any) -> _Int:
        for index, item in enumerate(self):
            if item == value:
                return index
        raise ValueError(str(value) + ' is not in range')

    def slice(
        self,
        new_start: Any = runtime.undefined,
        new_stop: Any = runtime.undefined,
    ) -> Any:
        if new_start is runtime.undefined and new_stop is runtime.undefined:
            return self
        if self.step < 0:
            values = list(self)
            if new_start is runtime.undefined:
                return values[:new_stop]
            if new_stop is runtime.undefined:
                return values[new_start:]
            return values[new_start:new_stop]

        start_index = 0 if new_start is runtime.undefined else new_start
        if new_stop is runtime.undefined:
            stop_index = self._length
        else:
            stop_index = new_stop
        if start_index < 0:
            start_index += self._length
        if stop_index < 0:
            stop_index += self._length
        start_index = min(self._length, max(0, start_index))
        stop_index = min(self._length, max(0, stop_index))
        stop_index = max(start_index, stop_index)
        return ρσ_range(
            self.start + start_index * self.step,
            self.start + stop_index * self.step,
            self.step,
        )

    def __repr__(self) -> _Str:
        if self.step == 1:
            return (
                'range(' + str(self.start) + ', '
                + str(self.stop) + ')'
            )
        return (
            'range(' + str(self.start) + ', '
            + str(self.stop) + ', ' + str(self.step) + ')'
        )


def ρσ_range(
    start: _Int,
    stop: Any = runtime.undefined,
    step: Any = runtime.undefined,
) -> _Range:
    if stop is runtime.undefined:
        stop = start
        start = 0
    if step is runtime.undefined:
        step = 1
    return _Range(start, stop, step)


class _EllipsisType:
    def __repr__(self) -> _Str:
        return 'Ellipsis'

    def __str__(self) -> _Str:
        return 'Ellipsis'


Ellipsis = _EllipsisType()


def ρσ_ellipsis_range(*specification: Any) -> list[Any]:
    result = []
    saw_ellipsis = False
    for value in specification:
        if value is Ellipsis:
            saw_ellipsis = True
            continue
        if not saw_ellipsis:
            result.append(value)
            continue
        if len(result) == 0:
            raise ValueError(
                'an ellipsis range requires a starting value')

        last = result[-1]
        if len(result) >= 2:
            step = ρσ_operator_sub_exact(last, result[-2])
        elif runtime.strict_equal(runtime.jstype(last), 'bigint'):
            step = runtime.bigint(1)
        else:
            step = 1
        if runtime.equals(step, 0):
            raise ValueError('ellipsis range step must not be zero')

        current = ρσ_operator_add_exact(last, step)
        if step > 0:
            while current <= value:
                result.append(current)
                current = ρσ_operator_add_exact(current, step)
        else:
            while current >= value:
                result.append(current)
                current = ρσ_operator_add_exact(current, step)
        saw_ellipsis = False

    if saw_ellipsis:
        raise ValueError('an ellipsis range requires an endpoint')
    return list(result)


def ρσ_ellipsis_iter(*specification: Any) -> Any:
    return iter(ρσ_ellipsis_range(*specification))


def ρσ_getattr(
    value: Any,
    name: _Str,
    default_value: Any = _BUILTINS_MISSING,
) -> Any:
    if not runtime.strict_equal(runtime.jstype(name), 'string'):
        raise TypeError('attribute name must be string')
    if _builtins_has_member(value, name):
        member = _builtins_get_member(value, name)
        if _builtins_has_member(member, '__staticmethod__'):
            return member
        if (
            runtime.strict_equal(runtime.jstype(member), 'function')
            and not _builtins_is_python_class(member)
            and not _builtins_has_member(member, '__self__')
            and not runtime.reflect.apply(
                runtime.object.prototype.hasOwnProperty,
                value,
                [name],
            )
        ):
            receiver = value
            if _builtins_has_member(member, '__classmethod__'):
                if _builtins_is_python_class(value):
                    receiver = value
                else:
                    receiver = _builtins_get_member(value, 'constructor')
            return runtime.reflect.apply(
                runtime.reflect.get(member, 'bind'),
                member,
                [receiver],
            )
        return member
    if _builtins_member_is_function(value, '__getattr__'):
        try:
            return _builtins_call_member(
                value, '__getattr__', [name])
        except AttributeError:
            if default_value is not _BUILTINS_MISSING:
                return default_value
            raise
    if default_value is not _BUILTINS_MISSING:
        return default_value
    raise AttributeError('The attribute ' + name + ' is not present')


def ρσ_setattr(value: Any, name: _Str, member: Any) -> None:
    if not runtime.strict_equal(runtime.jstype(name), 'string'):
        raise TypeError('attribute name must be string')
    if (
        value is ρσ_int
        or value is ρσ_bool
        or value is ρσ_float
        or value is runtime.string_builtin
    ):
        raise TypeError(
            "cannot set attributes of built-in/extension type")
    runtime.reflect.set(value, name, member)


def ρσ_delattr(value: Any, name: _Str) -> None:
    if not runtime.strict_equal(runtime.jstype(name), 'string'):
        raise TypeError('attribute name must be string')
    has_own = runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        [name],
    )
    if not has_own:
        raise AttributeError(
            "object has no attribute '" + name + "'")
    if not runtime.reflect.deleteProperty(value, name):
        raise AttributeError(
            "object attribute '" + name + "' cannot be deleted")


def ρσ_hasattr(value: Any, name: _Str) -> _Bool:
    if not runtime.strict_equal(runtime.jstype(name), 'string'):
        raise TypeError('attribute name must be string')
    try:
        ρσ_getattr(value, name)
        return True
    except AttributeError:
        return False


def ρσ_py_super(cls: Any, instance: Any) -> Any:
    class_subtype = (
        _builtins_is_python_class(instance)
        and (
            instance is cls
            or runtime.instance_of(
                runtime.reflect.get(instance, 'prototype'), cls)
        )
    )
    if (
        not runtime.strict_equal(runtime.jstype(cls), 'function')
        or (
            not runtime.instance_of(instance, cls)
            and not class_subtype
        )
    ):
        raise TypeError(
            'super(type, obj): obj must be an instance or subtype of type')

    prototype = runtime.object.getPrototypeOf(cls.prototype)

    def super_repr() -> _Str:
        return (
            "<super: <class '" + _builtins_callable_name(cls)
            + "'>, <" + _builtins_callable_name(instance.constructor)
            + " object>>"
        )

    target = {
        '__repr__': super_repr,
        '__str__': super_repr,
        'toString': super_repr,
    }

    def get_member(
        proxy_target: Any,
        name: Any,
        _receiver: Any,
    ) -> Any:
        if runtime.reflect.has(proxy_target, name):
            return runtime.reflect.get(proxy_target, name)
        member = runtime.reflect.get(prototype, name)
        if runtime.strict_equal(runtime.jstype(member), 'function'):
            return runtime.reflect.apply(
                runtime.reflect.get(member, 'bind'),
                member,
                [instance],
            )
        return member

    def has_member(proxy_target: Any, name: Any) -> _Bool:
        return (
            runtime.reflect.has(proxy_target, name)
            or runtime.reflect.has(prototype, name)
        )

    def reject_assignment(
        _target: Any,
        _name: Any,
        _value: Any,
        _receiver: Any,
    ) -> _Bool:
        raise AttributeError(
            "'super' object has no writable attributes")

    def reject_deletion(_target: Any, _name: Any) -> _Bool:
        raise AttributeError(
            "'super' object has no writable attributes")

    return runtime.reflect.construct(
        runtime.proxy_class,
        [
            target,
            {
                'get': get_member,
                'has': has_member,
                'set': reject_assignment,
                'deleteProperty': reject_deletion,
            },
        ],
    )


def ρσ_len(value: Any) -> _Int:
    if ρσ_arraylike(value):
        return value.length
    if _builtins_member_is_function(value, '__len__'):
        return _builtins_call_member(value, '__len__', [])
    if (
        _builtins_get_member(value, 'constructor') is runtime.set_class
        or _builtins_get_member(value, 'constructor') is runtime.map_class
    ):
        return value.size
    if (
        runtime.strict_equal(runtime.jstype(value), 'object')
        or runtime.strict_equal(runtime.jstype(value), 'function')
    ):
        return runtime.object.keys(value).length
    raise TypeError("object has no len()")


def ρσ_get_module(name: _Str) -> Any:
    return runtime.reflect.get(runtime.modules, name)


def ρσ_pow(
    left: Any,
    right: Any,
    modulus: Any = runtime.undefined,
) -> Any:
    if modulus is runtime.undefined:
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.normalize_integer(
                runtime.native_pow(
                    runtime.bigint(left), runtime.bigint(right)))
        return runtime.math.pow(left, right)

    if (
        not _builtins_exact_integer_primitive(left)
        or not _builtins_exact_integer_primitive(right)
        or not _builtins_exact_integer_primitive(modulus)
    ):
        raise TypeError(
            'pow() 3rd argument not allowed unless all arguments are integers')
    exponent = runtime.bigint(right)
    modulus_bigint = runtime.bigint(modulus)
    if modulus_bigint == 0:
        raise ValueError('pow() 3rd argument cannot be 0')
    if exponent < 0:
        raise ValueError('base is not invertible for the given modulus')
    base = runtime.native_mod(runtime.bigint(left), modulus_bigint)
    answer = runtime.native_mod(runtime.bigint(1), modulus_bigint)
    while exponent > 0:
        if runtime.native_bitand(exponent, runtime.bigint(1)) != 0:
            answer = runtime.native_mod(answer * base, modulus_bigint)
        exponent = runtime.native_rshift(exponent, runtime.bigint(1))
        if exponent > 0:
            base = runtime.native_mod(base * base, modulus_bigint)
    if answer < 0 and modulus_bigint > 0:
        answer += modulus_bigint
    elif answer > 0 and modulus_bigint < 0:
        answer += modulus_bigint
    return runtime.normalize_integer(answer)


def ρσ_type(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'number')
        or runtime.strict_equal(value_type, 'bigint')
    ):
        return ρσ_int
    if runtime.strict_equal(value_type, 'boolean'):
        return ρσ_bool
    if runtime.strict_equal(value_type, 'string'):
        return runtime.string_builtin
    if runtime.array.isArray(value):
        if runtime.object.isFrozen(value):
            return ρσ_tuple
        return runtime.list_constructor
    python_type = _builtins_get_member(value, '__python_type__')
    if runtime.strict_equal(
        runtime.jstype(python_type), 'function'
    ):
        return python_type
    if _builtins_is_python_class(value):
        return ρσ_type
    return _builtins_get_member(value, 'constructor')


def ρσ_issubclass(cls: Any, candidates: Any) -> _Bool:
    if runtime.array.isArray(candidates):
        for candidate in candidates:
            if ρσ_issubclass(cls, candidate):
                return True
        return False
    if (
        not runtime.strict_equal(runtime.jstype(cls), 'function')
        or not runtime.strict_equal(
            runtime.jstype(candidates), 'function')
    ):
        raise TypeError('issubclass() arg 1 must be a class')
    return (
        cls is candidates
        or runtime.instance_of(
            runtime.reflect.get(cls, 'prototype'),
            candidates,
        )
    )


def ρσ_divmod(left: Any, right: Any) -> Any:
    if runtime.equals(right, 0):
        raise runtime.zero_division_error(
            'integer division or modulo by zero')
    quotient = ρσ_operator_floordiv(left, right)
    remainder = ρσ_operator_mod(left, right)
    return runtime.math_tuple([quotient, remainder])


def ρσ_factor(value: Any) -> Any:
    if _builtins_member_is_function(value, 'factor'):
        return _builtins_call_member(value, 'factor', [])
    if runtime.strict_equal(runtime.jstype(value), 'number'):
        if not runtime.number.isSafeInteger(value):
            raise TypeError(
                'factor() requires a safe integer; '
                'use a BigInt for larger values'
            )
        value = runtime.bigint(value)
    elif not runtime.strict_equal(runtime.jstype(value), 'bigint'):
        raise TypeError('factor() requires an integer')

    result = runtime.flint_backend().factor(value)
    return runtime.reflect.construct(
        runtime.integer_factorization,
        [
            result.factors,
            runtime.bigint(result.sign),
            False,
            False,
            False,
        ],
    )


def ρσ_gcd(left: Any, right: Any) -> Any:
    if (
        (
            runtime.strict_equal(runtime.jstype(left), 'number')
            or runtime.strict_equal(runtime.jstype(left), 'bigint')
        )
        and (
            runtime.strict_equal(runtime.jstype(right), 'number')
            or runtime.strict_equal(runtime.jstype(right), 'bigint')
        )
    ):
        return runtime.normalize_integer(
            runtime.flint_backend().gcd(
                runtime.bigint(left), runtime.bigint(right)
            )
        )
    if _builtins_member_is_function(left, 'gcd'):
        return _builtins_call_member(left, 'gcd', [right])
    if _builtins_member_is_function(right, 'gcd'):
        return _builtins_call_member(right, 'gcd', [left])
    raise TypeError('gcd() is not defined for these arguments')


def ρσ_next_prime(value: Any) -> Any:
    if runtime.strict_equal(runtime.jstype(value), 'number'):
        if not runtime.number.isSafeInteger(value):
            raise TypeError('next_prime() requires an integer')
        value = runtime.bigint(value)
    elif not runtime.strict_equal(runtime.jstype(value), 'bigint'):
        raise TypeError('next_prime() requires an integer')
    return runtime.normalize_integer(
        runtime.flint_backend().nextPrime(value))


def _builtins_extreme(
    positional: Any,
    keywords: Any,
    find_maximum: _Bool,
) -> Any:
    default_value = runtime.reflect.get(keywords, 'defval')
    key = runtime.reflect.get(keywords, 'key')
    if len(positional) == 0:
        if default_value is not runtime.undefined:
            return default_value
        raise TypeError('expected at least one argument')

    values = positional[0] if len(positional) == 1 else positional
    iterator = iter(values)
    answer = next(iterator, _BUILTINS_EMPTY)
    if answer is _BUILTINS_EMPTY:
        if default_value is not runtime.undefined:
            return default_value
        raise TypeError('expected at least one argument')

    if key is not runtime.undefined:
        answer = key(answer)
        for value in iterator:
            candidate = key(value)
            if find_maximum and candidate > answer:
                answer = candidate
            elif not find_maximum and candidate < answer:
                answer = candidate
        return answer

    for value in iterator:
        if find_maximum and value > answer:
            answer = value
        elif not find_maximum and value < answer:
            answer = value
    return answer


def ρσ_max(*positional: Any, **keywords: Any) -> Any:
    return _builtins_extreme(positional, keywords, True)


def ρσ_min(*positional: Any, **keywords: Any) -> Any:
    return _builtins_extreme(positional, keywords, False)


class _BuiltinTextFile:

    def __init__(self, filename: _Str) -> None:
        filesystem = runtime.require_module('fs')
        self._data = runtime.string(
            filesystem.readFileSync(filename, 'utf8'))
        self._position = 0

    def __enter__(self) -> _BuiltinTextFile:
        return self

    def __exit__(self, *_args: Any) -> _Bool:
        return False

    def close(self) -> None:
        pass

    def readline(self) -> _Str:
        if self._position >= len(self._data):
            return ''
        newline = self._data.find('\n', self._position)
        if newline == -1:
            answer = self._data[self._position:]
            self._position = len(self._data)
            return answer
        answer = self._data[self._position:newline + 1]
        self._position = newline + 1
        return answer


def ρσ_open(
    filename: _Str,
    mode: _Str = 'r',
    *_args: Any,
    **_kwargs: Any,
) -> _BuiltinTextFile:
    if mode not in ('r', 'rt'):
        raise NotImplementedError(
            'open() currently supports text reading only')
    return _BuiltinTextFile(filename)


round = ρσ_round
max = ρσ_max
min = ρσ_min
bool = ρσ_bool
type = ρσ_type
float = ρσ_float
int = ρσ_int
Integer = ρσ_integer_literal
RealNumber = ρσ_real_literal
arraylike = ρσ_arraylike
print = ρσ_print
id = ρσ_id
get_module = ρσ_get_module
pow = ρσ_pow
divmod = ρσ_divmod
dir = ρσ_dir
help = ρσ_help
ord = ρσ_ord
chr = ρσ_chr
bin = ρσ_bin
open = ρσ_open

runtime.set_class_repr(ρσ_int, "<class 'int'>")
runtime.set_class_repr(ρσ_bool, "<class 'bool'>")
runtime.set_class_repr(ρσ_float, "<class 'float'>")
runtime.set_class_repr(ρσ_type, "<class 'type'>")
runtime.set_class_repr(ρσ_tuple, "<class 'tuple'>")
runtime.set_class_repr(runtime.list_constructor, "<class 'list'>")
runtime.set_class_repr(runtime.string_builtin, "<class 'str'>")


class SageObject:

    def __init__(self) -> None:
        pass

    def __repr__(self) -> _Str:
        constructor = runtime.reflect.get(self, 'constructor')
        return (
            '<' + runtime.reflect.get(constructor, '__name__')
            + ' object at ' + str(id(self)) + '>'
        )

    def __hash__(self) -> _Int:
        return id(self)


runtime.reflect.set(
    SageObject,
    '__init__',
    runtime.reflect.get(
        runtime.reflect.get(SageObject, 'prototype'),
        '__init__',
    ),
)
runtime.set_class_repr(SageObject, "<class 'object'>")
_object_bases = runtime.reflect.get(SageObject, '__bases__')
runtime.object.freeze(_object_bases)
runtime.object.freeze(runtime.reflect.get(
    runtime.reflect.get(SageObject, 'prototype'),
    '__bases__',
))
runtime.reflect.set(runtime.global_object, 'object', SageObject)
hex = ρσ_hex
oct = ρσ_oct
hash = ρσ_hash
callable = ρσ_callable
enumerate = ρσ_enumerate
tuple = ρσ_tuple
_tuple_prototype = runtime.reflect.get(tuple, 'prototype')
runtime.reflect.set(
    _tuple_prototype, '__init__',
    runtime.native_method(_builtins_tuple_subclass_init))
runtime.reflect.set(
    _tuple_prototype, '__len__',
    runtime.native_method(_builtins_tuple_subclass_len))
runtime.reflect.set(
    _tuple_prototype, '__iter__',
    runtime.native_method(_builtins_tuple_subclass_iter))
runtime.reflect.set(
    _tuple_prototype, '__getitem__',
    runtime.native_method(_builtins_tuple_subclass_getitem))
runtime.reflect.set(
    _tuple_prototype, '__repr__',
    runtime.native_method(_builtins_tuple_subclass_repr))
runtime.reflect.set(
    _tuple_prototype, '__str__',
    runtime.native_method(_builtins_tuple_subclass_repr))
runtime.reflect.set(
    _tuple_prototype, 'toString',
    runtime.native_method(_builtins_tuple_subclass_repr))
runtime.reflect.set(
    _tuple_prototype, '__eq__',
    runtime.native_method(_builtins_tuple_subclass_eq))
runtime.reflect.set(
    _tuple_prototype, '__add__',
    runtime.native_method(_builtins_tuple_subclass_add))
runtime.reflect.set(
    _tuple_prototype, '__mul__',
    runtime.native_method(_builtins_tuple_subclass_mul))
runtime.reflect.set(
    _tuple_prototype, '__rmul__',
    runtime.native_method(_builtins_tuple_subclass_mul))
issubclass = ρσ_issubclass
iter = ρσ_iter
next = ρσ_next
reversed = ρσ_reversed
len = ρσ_len
range = ρσ_range
getattr = ρσ_getattr
setattr = ρσ_setattr
hasattr = ρσ_hasattr
factor = ρσ_factor
gcd = ρσ_gcd
next_prime = ρσ_next_prime
