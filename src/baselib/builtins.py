"""Core Python and Sage builtins for the Sage.js runtime.

The implementation is ordinary Python source. Operations which must bypass
Sage.js operator lowering use the explicit :mod:`sagejs.runtime` boundary;
the compiler lowers those calls directly to JavaScript primitives.
"""

from __future__ import annotations

from typing import Any, Callable, Iterator

import sagejs.runtime as runtime

_builtins_number_class = runtime.native_number_class
_Bool = bool
_Float = float
_Int = int
_Str = str


def _builtins_default_build_class(
    body: Any,
    name: str,
    *bases: Any,
) -> Any:
    """Marker used when class statements use Sage.js's native lowering.

    The compiler already lowers ordinary classes directly.  Replacing
    ``builtins.__build_class__`` switches class statements to the public
    Python hook instead.
    """
    return runtime.undefined


runtime.reflect.set(
    _builtins_default_build_class,
    '__sagejs_default_build_class__',
    True,
)
__build_class__ = _builtins_default_build_class


def _builtins_default_import(
    name: str,
    globals: Any = None,
    locals: Any = None,
    fromlist: Any = None,
    level: _Int = 0,
) -> Any:
    """Resolve a module already linked into the compiled program."""
    module = runtime.reflect.get(runtime.modules, name)
    if module is runtime.undefined:
        raise ImportError("No module named '" + name + "'")
    return module


__import__ = _builtins_default_import


class _BuiltinsMissing:
    pass


_BUILTINS_MISSING = _BuiltinsMissing()
_BUILTINS_EMPTY = _BuiltinsMissing()


def cached_function(
    func: Any,
) -> Any:
    """Cache calls to ``func`` by their positional and keyword arguments.

    This intentionally uses equality comparisons instead of JavaScript object
    identity.  Sage functions commonly receive freshly constructed exact
    integers and tuples which are equal without being the same JS object.
    """
    cache = []

    def wrapper(*args: Any, **kwargs: Any) -> Any:
        for entry in cache:
            cached_args = entry[0]
            cached_kwargs = entry[1]
            value = entry[2]
            if args == cached_args and kwargs == cached_kwargs:
                return value
        value = func(*args, **kwargs)
        cache.append(runtime.math_tuple([args, kwargs, value]))
        return value

    runtime.reflect.set(
        wrapper,
        '__name__',
        runtime.reflect.get(func, '__name__'),
    )
    runtime.reflect.set(
        wrapper,
        '__doc__',
        runtime.reflect.get(func, '__doc__'),
    )
    runtime.reflect.set(wrapper, 'cache', cache)
    return wrapper


# Including ``self`` in ``cached_function``'s argument key gives methods the
# expected per-instance behavior.  A dedicated alias also preserves Sage's
# familiar public decorator name.
cached_method = cached_function


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


def _builtins_bind_python_function(
    target: Any,
    receiver: Any,
) -> Any:
    bound = runtime.reflect.apply(
        runtime.reflect.get(target, 'bind'),
        target,
        [runtime.undefined, receiver],
    )
    runtime.object.assign(bound, target)
    runtime.reflect.set(bound, '__func__', target)
    runtime.reflect.set(bound, '__self__', receiver)
    runtime.reflect.set(
        bound, '__name__',
        _builtins_get_member(target, '__name__'),
    )
    return bound


def _builtins_member_is_function(value: Any, name: Any) -> _Bool:
    return runtime.strict_equal(
        runtime.jstype(_builtins_get_member(value, name)),
        'function',
    )


def _builtins_class_attribute_descriptor(
    value: Any,
    name: Any,
) -> Any:
    owner = _builtins_get_member(value, 'constructor')
    prototype = _builtins_get_member(owner, 'prototype')
    while prototype is not None and prototype is not runtime.undefined:
        descriptor = runtime.object.getOwnPropertyDescriptor(
            prototype, name)
        if descriptor is not runtime.undefined:
            return descriptor
        prototype = runtime.object.getPrototypeOf(prototype)
    return runtime.undefined


def ρσ_call_set_names(
    owner: Any,
    names: list[Any],
    values: list[Any],
) -> None:
    """Call descriptor ``__set_name__`` methods from a namespace snapshot."""
    index = 0
    while index < _builtins_get_member(names, 'length'):
        value = values[index]
        if _builtins_member_is_function(value, '__set_name__'):
            _builtins_call_member(
                value, '__set_name__', [owner, names[index]])
        index += 1


def _builtins_get_special_member(value: Any, name: Any) -> Any:
    """Look up an implicit special method on the type, not the instance."""
    if value is None or value is runtime.undefined:
        return runtime.undefined
    value_type = runtime.jstype(value)
    if (
        not runtime.strict_equal(value_type, 'object')
        and not runtime.strict_equal(value_type, 'function')
    ):
        value = runtime.reflect.apply(
            runtime.object, runtime.undefined, [value])
    constructor = _builtins_get_member(value, 'constructor')
    if not _builtins_is_python_class(constructor):
        return runtime.reflect.get(value, name)
    if not runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        [name],
    ):
        return runtime.reflect.get(value, name)
    prototype = runtime.object.getPrototypeOf(value)
    if prototype is None:
        return runtime.undefined
    return runtime.reflect.get(prototype, name)


def _builtins_call_special(
    value: Any,
    name: Any,
    call_args: list[Any],
) -> Any:
    method = _builtins_get_special_member(value, name)
    return runtime.reflect.apply(method, value, call_args)


def _builtins_special_is_function(value: Any, name: Any) -> _Bool:
    return runtime.strict_equal(
        runtime.jstype(_builtins_get_special_member(value, name)),
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


class NotImplementedType:

    def __repr__(self) -> _Str:
        return 'NotImplemented'

    __str__ = __repr__


NotImplemented = NotImplementedType()


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
    if (
        runtime.strict_equal(left_type, 'bigint')
        or runtime.strict_equal(right_type, 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_add(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(right_type, 'number')
        ):
            return runtime.native_add(
                runtime.number(left), runtime.number(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('add', left, right)
    if _builtins_member_is_function(left, '__add__'):
        result = _builtins_call_member(left, '__add__', [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, '__radd__'):
        result = _builtins_call_member(right, '__radd__', [left])
        if result is not NotImplemented:
            return result
    if (
        _builtins_member_is_function(left, 'concat')
        and (
            not runtime.array.isArray(left)
            or runtime.arraylike(right)
        )
    ):
        return _builtins_call_member(left, 'concat', [right])
    if (
        runtime.strict_equal(left_type, 'object')
        or runtime.strict_equal(right_type, 'object')
    ):
        raise TypeError('unsupported operand type(s) for +')
    return runtime.native_add(left, right)


def ρσ_operator_add_exact(left: Any, right: Any) -> Any:
    # Primitive values cannot override Python's arithmetic methods. Handle
    # them before the general parent/coercion and special-method machinery;
    # overflowing safe integers still promote to BigInt below.
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
        result = runtime.native_add(left, right)
        if not runtime.strict_equal(left_type, 'number'):
            return result
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
    if (
        (
            runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(right_type, 'bigint')
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.native_add(
            runtime.bigint(left), runtime.bigint(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('add', left, right)
    if _builtins_special_is_function(left, '__add__'):
        result = _builtins_call_special(left, '__add__', [right])
        if result is not NotImplemented:
            return result
    if _builtins_special_is_function(right, '__radd__'):
        result = _builtins_call_special(right, '__radd__', [left])
        if result is not NotImplemented:
            return result
    if (
        (
            runtime.strict_equal(left_type, 'string')
            or runtime.strict_equal(right_type, 'string')
        )
        and not runtime.strict_equal(left_type, right_type)
    ):
        raise TypeError('can only concatenate str to str')
    if (
        _builtins_member_is_function(left, 'concat')
        and (
            not runtime.array.isArray(left)
            or runtime.arraylike(right)
        )
    ):
        return _builtins_call_member(left, 'concat', [right])
    if (
        runtime.strict_equal(left_type, 'object')
        or runtime.strict_equal(right_type, 'object')
    ):
        raise TypeError('unsupported operand type(s) for +')
    if (
        runtime.strict_equal(left_type, 'bigint')
        or runtime.strict_equal(right_type, 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_add(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(right_type, 'number')
        ):
            return runtime.native_add(
                runtime.number(left), runtime.number(right))
        return runtime.native_add(left, right)
    if (
        not runtime.strict_equal(left_type, 'number')
        or not runtime.strict_equal(right_type, 'number')
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
        result = _builtins_call_member(
            left, left_method, [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, right_method):
        result = _builtins_call_member(
            right, right_method, [left])
        if result is not NotImplemented:
            return result

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
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, right_type)
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        return runtime.native_sub(left, right)
    if (
        runtime.strict_equal(left_type, 'bigint')
        or runtime.strict_equal(right_type, 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_sub(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(right_type, 'number')
        ):
            return runtime.native_sub(
                runtime.number(left), runtime.number(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('sub', left, right)
    if _builtins_member_is_function(left, '__sub__'):
        result = _builtins_call_member(left, '__sub__', [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, '__rsub__'):
        result = _builtins_call_member(right, '__rsub__', [left])
        if result is not NotImplemented:
            return result
    if (
        runtime.strict_equal(runtime.jstype(left), 'object')
        or runtime.strict_equal(runtime.jstype(right), 'object')
    ):
        raise TypeError('unsupported operand type(s) for -')
    return runtime.native_sub(left, right)


def ρσ_operator_sub_exact(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, right_type)
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        result = runtime.native_sub(left, right)
        if not runtime.strict_equal(left_type, 'number'):
            return result
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
    if (
        (
            runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(right_type, 'bigint')
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.native_sub(
            runtime.bigint(left), runtime.bigint(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('sub', left, right)
    if _builtins_special_is_function(left, '__sub__'):
        result = _builtins_call_special(left, '__sub__', [right])
        if result is not NotImplemented:
            return result
    if _builtins_special_is_function(right, '__rsub__'):
        result = _builtins_call_special(right, '__rsub__', [left])
        if result is not NotImplemented:
            return result
    if (
        runtime.strict_equal(left_type, 'object')
        or runtime.strict_equal(right_type, 'object')
    ):
        raise TypeError('unsupported operand type(s) for -')
    if (
        runtime.strict_equal(left_type, 'bigint')
        or runtime.strict_equal(right_type, 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_sub(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(right_type, 'number')
        ):
            return runtime.native_sub(
                runtime.number(left), runtime.number(right))
        return runtime.native_sub(left, right)
    if (
        not runtime.strict_equal(left_type, 'number')
        or not runtime.strict_equal(right_type, 'number')
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
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, right_type)
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        result = runtime.native_mul(left, right)
        if not runtime.strict_equal(left_type, 'number'):
            return result
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
    if (
        (
            runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(right_type, 'bigint')
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.native_mul(
            runtime.bigint(left), runtime.bigint(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('mul', left, right)
    if (
        runtime.strict_equal(left_type, 'string')
        and _builtins_exact_integer_primitive(right)
    ):
        return _builtins_repeat_string(left, right)
    if (
        runtime.strict_equal(right_type, 'string')
        and _builtins_exact_integer_primitive(left)
    ):
        return _builtins_repeat_string(right, left)
    if _builtins_member_is_function(left, '__mul__'):
        return _builtins_call_member(left, '__mul__', [right])
    if _builtins_member_is_function(right, '__rmul__'):
        return _builtins_call_member(right, '__rmul__', [left])
    if (
        runtime.strict_equal(left_type, 'bigint')
        or runtime.strict_equal(right_type, 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_mul(
                runtime.bigint(left), runtime.bigint(right))
        if (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(right_type, 'number')
        ):
            return runtime.native_mul(
                runtime.number(left), runtime.number(right))
        return runtime.native_mul(left, right)
    if (
        not runtime.strict_equal(left_type, 'number')
        or not runtime.strict_equal(right_type, 'number')
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
    if isinstance(right, runtime.rational_class):
        if right._denominator != 1:
            symbolic_ring = runtime.reflect.get(
                runtime.global_object, 'SR')
            if symbolic_ring is not runtime.undefined:
                return symbolic_ring(left).__pow__(right)
        right = runtime.normalize_integer(right._numerator)
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
        and right < 0
    ):
        denominator = runtime.native_pow(
            runtime.bigint(left), -runtime.bigint(right))
        return runtime.rational_class(1, denominator)
    if (
        runtime.strict_equal(left_type, right_type)
        and (
            runtime.strict_equal(left_type, 'number')
            or runtime.strict_equal(left_type, 'bigint')
        )
    ):
        if (
            runtime.strict_equal(left_type, 'bigint')
            and right < 0
        ):
            raise ValueError(
                'negative powers of exact integers are not implemented yet')
        result = runtime.native_pow(left, right)
        if not runtime.strict_equal(left_type, 'number'):
            return result
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
    if (
        (
            runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(right_type, 'bigint')
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        if right < 0:
            raise ValueError(
                'negative powers of exact integers are not implemented yet')
        return runtime.native_pow(
            runtime.bigint(left), runtime.bigint(right))
    if _builtins_member_is_function(left, '__pow__'):
        return _builtins_call_member(left, '__pow__', [right])
    if (
        (
            runtime.strict_equal(left_type, 'bigint')
            or runtime.strict_equal(right_type, 'bigint')
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
        not runtime.strict_equal(left_type, 'number')
        or not runtime.strict_equal(right_type, 'number')
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
    if _builtins_member_is_function(left, '__truediv__'):
        return _builtins_call_member(left, '__truediv__', [right])
    if _builtins_member_is_function(right, '__rtruediv__'):
        return _builtins_call_member(right, '__rtruediv__', [left])
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
    if _builtins_member_is_function(left, '__lshift__'):
        return _builtins_call_member(left, '__lshift__', [right])
    if _builtins_member_is_function(right, '__rlshift__'):
        return _builtins_call_member(right, '__rlshift__', [left])
    operands = _builtins_shift_operands(left, right)
    return runtime.normalize_integer(
        runtime.native_lshift(operands[0], operands[1]))


def ρσ_operator_rshift(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__rshift__'):
        return _builtins_call_member(left, '__rshift__', [right])
    if _builtins_member_is_function(right, '__rrshift__'):
        return _builtins_call_member(right, '__rrshift__', [left])
    operands = _builtins_shift_operands(left, right)
    return runtime.normalize_integer(
        runtime.native_rshift(operands[0], operands[1]))


def ρσ_operator_floordiv(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__floordiv__'):
        return _builtins_call_member(left, '__floordiv__', [right])
    if _builtins_member_is_function(right, '__rfloordiv__'):
        return _builtins_call_member(right, '__rfloordiv__', [left])
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
    if (
        runtime.strict_equal(runtime.jstype(left), 'object')
        or runtime.strict_equal(runtime.jstype(left), 'function')
        or runtime.strict_equal(runtime.jstype(right), 'object')
        or runtime.strict_equal(runtime.jstype(right), 'function')
    ):
        raise TypeError('unsupported operand type(s) for //')
    return runtime.math.floor(runtime.native_div(left, right))


def ρσ_bool(value: Any) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'object')
        or runtime.strict_equal(value_type, 'function')
    ):
        if runtime.strict_equal(
            runtime.reflect.apply(
                runtime.object.prototype.toString, value, []),
            '[object Number]',
        ):
            return runtime.reflect.apply(
                runtime.number.prototype.valueOf, value, []) != 0
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


def ρσ_round(
    value: Any = _BUILTINS_MISSING,
    ndigits: Any = runtime.undefined,
    *extra: Any,
) -> Any:
    if value is _BUILTINS_MISSING:
        raise TypeError('round expected at least 1 argument')
    if len(extra) != 0:
        raise TypeError('round expected at most 2 arguments')
    if _builtins_exact_integer_primitive(value):
        if ndigits is runtime.undefined or ndigits is None:
            return runtime.normalize_integer(runtime.bigint(value))
        digits = int(ndigits)
        if digits >= 0:
            return runtime.normalize_integer(runtime.bigint(value))

        magnitude = runtime.bigint(value)
        negative = magnitude < 0
        if negative:
            magnitude = -magnitude
        factor = runtime.native_pow(
            runtime.bigint(10), runtime.bigint(-digits))
        quotient = runtime.native_div(magnitude, factor)
        remainder = runtime.native_mod(magnitude, factor)
        doubled = runtime.native_mul(
            remainder, runtime.bigint(2))
        if (
            doubled > factor
            or (
                doubled == factor
                and runtime.native_mod(
                    quotient, runtime.bigint(2)) != 0
            )
        ):
            quotient += runtime.bigint(1)
        answer = runtime.native_mul(quotient, factor)
        if negative:
            answer = -answer
        return runtime.normalize_integer(answer)

    if _builtins_member_is_function(value, '__round__'):
        call_args = []
        if ndigits is not runtime.undefined:
            call_args = [ndigits]
        return _builtins_call_member(
            value, '__round__', call_args)

    if ndigits is runtime.undefined or ndigits is None:
        floor_value = runtime.math.floor(value)
        fraction = runtime.native_sub(value, floor_value)
        if fraction < 0.5:
            return floor_value
        if fraction > 0.5:
            return floor_value + 1
        return (
            floor_value
            if runtime.native_mod(floor_value, 2) == 0
            else floor_value + 1
        )

    scale = runtime.math.pow(10, int(ndigits))
    return runtime.native_div(
        ρσ_round(runtime.native_mul(value, scale)),
        scale,
    )


def _builtins_pop_keyword(
    keywords: Any,
    name: _Str,
    default_value: Any,
) -> Any:
    if _builtins_member_is_function(keywords, '__getitem__'):
        if name in keywords:
            return keywords.pop(name)
        return default_value
    if runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        keywords,
        [name],
    ):
        value = runtime.reflect.get(keywords, name)
        runtime.reflect.deleteProperty(keywords, name)
        return value
    return default_value


def ρσ_print(
    *values: Any,
    **keywords: Any,
) -> None:
    sep = _builtins_pop_keyword(keywords, 'sep', ' ')
    end = _builtins_pop_keyword(keywords, 'end', '\n')
    file = _builtins_pop_keyword(keywords, 'file', None)
    flush = _builtins_pop_keyword(keywords, 'flush', False)
    if _builtins_member_is_function(keywords, '__iter__'):
        remaining = list(keywords)
    else:
        remaining = runtime.object.keys(keywords)
    if len(remaining):
        unexpected = remaining[0]
        raise TypeError(
            "'"
            + unexpected
            + "' is an invalid keyword argument for print()")
    if sep is None:
        sep = ' '
    if end is None:
        end = '\n'
    if not isinstance(sep, str):
        raise TypeError('sep must be None or a string')
    if not isinstance(end, str):
        raise TypeError('end must be None or a string')
    parts = [
        'None' if value is runtime.undefined else str(value)
        for value in values
    ]
    text = str.join(sep, parts) + end
    if file is None:
        runtime.output_write(text)
    else:
        for index in range(len(parts)):
            if index:
                file.write(sep)
            file.write(parts[index])
        file.write(end)
        if flush:
            file.flush()


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
        if not _builtins_exact_integer_primitive(answer):
            raise TypeError('__int__ returned non-int')
        if runtime.strict_equal(runtime.jstype(answer), 'bigint'):
            return answer
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
    text = runtime.reflect.apply(
        runtime.string_class.prototype.replace,
        text,
        [runtime.regexp('_', 'g'), ''],
    )
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


_BUILTINS_ID_MAP = runtime.reflect.construct(runtime.map_class, [])
_builtins_next_id = 1


def ρσ_id(value: Any) -> _Int:
    global _builtins_next_id
    existing = _BUILTINS_ID_MAP.get(value)
    if existing is not runtime.undefined:
        return existing
    answer = _builtins_next_id
    _builtins_next_id += 1
    _BUILTINS_ID_MAP.set(value, answer)
    return answer


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


def _builtins_namespace_dict(value: Any) -> Any:
    """Return the Python-visible own namespace of an object or class."""
    namespace = runtime.object.create(None)

    def copy_own_members(source: Any) -> None:
        if source is None or source is runtime.undefined:
            return
        for member_name in runtime.object.getOwnPropertyNames(source):
            native_function_slot = (
                source is value
                and runtime.strict_equal(
                    runtime.jstype(value), 'function')
                and member_name in ('length', 'name')
            )
            if (
                not native_function_slot
                and _builtins_visible_introspection_name(member_name)
            ):
                runtime.reflect.set(
                    namespace,
                    member_name,
                    runtime.reflect.get(source, member_name),
                )

    copy_own_members(value)
    if _builtins_is_python_class(value):
        copy_own_members(_builtins_get_member(value, 'prototype'))
    return runtime.scope_dict(namespace)


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
            and prototype is not None
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

    for left_index in range(len(answer)):
        for right_index in range(left_index + 1, len(answer)):
            if answer[right_index] < answer[left_index]:
                temporary = answer[left_index]
                answer[left_index] = answer[right_index]
                answer[right_index] = temporary
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
    return (
        runtime.strict_equal(runtime.jstype(value), 'function')
        or _builtins_special_is_function(value, '__call__')
    )


def ρσ_classmethod(target: Any) -> Any:
    descriptor = runtime.object.create(None)
    descriptor.__func__ = target
    descriptor.__classmethod__ = True
    return descriptor


def ρσ_staticmethod(target: Any) -> Any:
    descriptor = runtime.object.create(None)
    descriptor.__func__ = target
    descriptor.__staticmethod__ = True
    return descriptor


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
    constructor = _builtins_get_member(value, 'constructor')
    prototype = _builtins_get_member(constructor, 'prototype')
    if (
        prototype is not runtime.undefined
        and runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            prototype,
            ['__eq__'],
        )
        and not runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            prototype,
            ['__hash__'],
        )
    ):
        raise TypeError('unhashable type')
    if _builtins_member_is_function(value, '__hash__'):
        answer = _builtins_call_member(value, '__hash__', [])
        if answer is True:
            return 1
        if answer is False:
            return 0
        if not _builtins_exact_integer_primitive(answer):
            raise TypeError('__hash__ method should return an integer')
        return ρσ_hash(answer)
    sequence = _builtins_sequence_values(value)
    if (
        sequence is not runtime.undefined
        and _builtins_sequence_is_tuple(value)
    ):
        modulus = runtime.bigint('2305843009213693951')
        answer = runtime.bigint(0x345678)
        multiplier = runtime.bigint(1000003)
        for item in sequence:
            item_hash = runtime.bigint(ρσ_hash(item))
            answer = runtime.native_mod(
                runtime.native_mul(
                    runtime.native_bitxor(answer, item_hash),
                    multiplier,
                ),
                modulus,
            )
            multiplier = runtime.native_add(
                multiplier,
                runtime.bigint(82520 + len(sequence) + len(sequence)),
            )
        answer = runtime.native_add(
            answer, runtime.bigint(97531))
        if answer == -1:
            answer = runtime.bigint(-2)
        return runtime.normalize_integer(answer)
    if runtime.array.isArray(value):
        raise TypeError("unhashable type: 'list'")
    if _builtins_member_is_function(value, '__eq__'):
        raise TypeError('unhashable type')
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'string')
        or runtime.strict_equal(value_type, 'number')
        or runtime.strict_equal(value_type, 'object')
        or runtime.strict_equal(value_type, 'function')
    ):
        return ρσ_id(value)
    raise TypeError('unhashable type')


def ρσ_enumerate(
    iterable: Any = _BUILTINS_MISSING,
    start: _Int = 0,
    *extra: Any,
) -> Iterator[Any]:
    if iterable is _BUILTINS_MISSING:
        raise TypeError('enumerate expected at least 1 argument')
    if len(extra) != 0:
        raise TypeError('enumerate expected at most 2 arguments')

    def generate() -> Iterator[Any]:
        index = start
        iterator = iter(iterable)
        done = False
        value = None
        while not done:
            result = runtime.reflect.apply(
                _builtins_get_member(iterator, 'next'),
                iterator,
                [],
            )
            if result.done:
                if (
                    result.value is runtime.undefined
                    or result.value is None
                ):
                    done = True
                else:
                    raise StopIteration(result.value)
            else:
                value = result.value
            if not done:
                yield runtime.math_tuple([index, value])
                index += 1

    return generate()


def ρσ_tuple(iterable: Any = runtime.undefined) -> Any:
    if iterable is runtime.undefined:
        return runtime.math_tuple([])
    if (
        runtime.array.isArray(iterable)
        and runtime.object.isFrozen(iterable)
    ):
        return iterable
    return runtime.math_tuple([value for value in iterable])


class SageSlice:
    __sagejs_slice__ = True

    def __init__(
        self,
        start: Any,
        stop: Any = _BUILTINS_MISSING,
        step: Any = None,
    ) -> None:
        if stop is _BUILTINS_MISSING:
            stop = start
            start = None
        if step is not None:
            step = int(step)
            if step == 0:
                raise ValueError('slice step cannot be zero')
        self._start = start
        self._stop = stop
        self._step = step

    @property
    def start(self) -> Any:
        return self._start

    @property
    def stop(self) -> Any:
        return self._stop

    @property
    def step(self) -> Any:
        return self._step

    def indices(self, length: Any) -> Any:
        length = int(length)
        if length < 0:
            raise ValueError('length should not be negative')

        step = 1 if self._step is None else int(self._step)
        if step < 0:
            lower = -1
            upper = length - 1
        else:
            lower = 0
            upper = length

        if self._start is None:
            start = upper if step < 0 else lower
        else:
            start = int(self._start)
            if start < 0:
                start += length
                if start < 0:
                    start = lower
            elif start >= length:
                start = upper

        if self._stop is None:
            stop = lower if step < 0 else upper
        else:
            stop = int(self._stop)
            if stop < 0:
                stop += length
                if stop < 0:
                    stop = lower
            elif stop >= length:
                stop = upper

        return runtime.math_tuple([start, stop, step])

    def __repr__(self) -> _Str:
        return (
            'slice(' + repr(self._start) + ', '
            + repr(self._stop) + ', ' + repr(self._step) + ')'
        )


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
    index: Any,
) -> Any:
    if hasattr(index, '__sagejs_slice__'):
        start, stop, step = index.indices(len(self._tuple_values))
        return runtime.math_tuple([
            self._tuple_values[position]
            for position in range(start, stop, step)
        ])
    index = int(index)
    if index < 0:
        index += len(self._tuple_values)
    if index < 0 or index >= len(self._tuple_values):
        raise IndexError('tuple index out of range')
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


def _builtins_reverse_iterator(iterable: Any) -> Iterator[Any]:
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


def ρσ_reversed(iterable: Any) -> Any:
    if _builtins_member_is_function(iterable, '__reversed__'):
        return _builtins_call_member(
            iterable, '__reversed__', [])
    return _builtins_reverse_iterator(iterable)


def _builtins_native_map(value: Any) -> _Bool:
    return (
        value is not None
        and _builtins_get_member(value, 'constructor')
        is runtime.map_class
    )


@runtime.sequence_class
class _BuiltinsSequenceIterator:
    """Iterator for objects implementing only Python's ``__getitem__``."""

    def __init__(self, sequence: Any) -> None:
        self._sequence = sequence
        self._index = 0

    def __iter__(self) -> _BuiltinsSequenceIterator:
        return self

    def __next__(self) -> Any:
        index = self._index
        self._index += 1
        try:
            return _builtins_call_member(
                self._sequence, '__getitem__', [index])
        except IndexError:
            raise StopIteration  # noqa: B904
        except StopIteration:
            raise StopIteration  # noqa: B904


def ρσ_iter(iterable: Any) -> Any:
    iterator_method = _builtins_get_member(
        iterable, runtime.iterator_symbol)
    if runtime.strict_equal(runtime.jstype(iterator_method), 'function'):
        if _builtins_native_map(iterable):
            return _builtins_call_member(iterable, 'keys', [])
        iterator = runtime.reflect.apply(
            iterator_method, iterable, [])
        if _builtins_member_is_function(iterator, 'next'):
            return iterator
        raise TypeError('iter() returned non-iterator')
    if _builtins_member_is_function(iterable, '__getitem__'):
        return _BuiltinsSequenceIterator(iterable)
    raise TypeError('object is not iterable')


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
        original_exception = exception
        exception = runtime.reflect.construct(
            exception, list(args))
        runtime.object.defineProperty(
            exception,
            '__sagejs_throw_original__',
            {'value': original_exception},
        )
        runtime.object.defineProperty(
            exception,
            '__sagejs_throw_args__',
            {'value': list(args)},
        )
    elif not runtime.instance_of(exception, runtime.error):
        exception = runtime.non_exception_throw(exception)
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
    if _builtins_member_is_function(iterator, '__next__'):
        try:
            return _builtins_call_member(iterator, '__next__', [])
        except StopIteration:
            if fallback is not _BUILTINS_MISSING:
                return fallback
            raise
    if iterator.__started__ is False:
        iterator.__started__ = True
    try:
        result = iterator.next()
    except TypeError as error:
        if (
            _builtins_get_member(error, 'message')
            == 'Generator is already running'
        ):
            raise ValueError(  # noqa: B904
                'generator already executing')
        raise
    if not result.done:
        return result.value
    if fallback is not _BUILTINS_MISSING:
        return fallback
    return _builtins_generator_result(result)


@runtime.sequence_class
class _Range:
    __sagejs_range__ = True

    def __init__(
        self,
        start: _Int,
        stop: _Int,
        step: _Int,
    ) -> None:
        if step == 0:
            raise ValueError('range() arg 3 must not be zero')
        self._start = start
        self._stop = stop
        self._step = step
        one = 1
        if runtime.strict_equal(runtime.jstype(start), 'bigint'):
            one = runtime.bigint(1)
        if step > 0:
            if start >= stop:
                self._length = 0
            else:
                self._length = (stop - start - one) // step + one
        else:
            if start <= stop:
                self._length = 0
            else:
                self._length = (start - stop - one) // (-step) + one

    @property
    def start(self) -> _Int:
        return self._start

    @start.setter
    def start(self, _value: Any) -> None:
        raise AttributeError(
            "readonly attribute 'start'")

    @property
    def stop(self) -> _Int:
        return self._stop

    @stop.setter
    def stop(self, _value: Any) -> None:
        raise AttributeError(
            "readonly attribute 'stop'")

    @property
    def step(self) -> _Int:
        return self._step

    @step.setter
    def step(self, _value: Any) -> None:
        raise AttributeError(
            "readonly attribute 'step'")

    def __iter__(self) -> Iterator[_Int]:
        value = self.start
        for _index in range(self._length):
            yield value
            value += self.step

    def __len__(self) -> _Int:
        return self._length

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(self._length)
            return ρσ_range(
                self.start + start * self.step,
                self.start + stop * self.step,
                self.step * step,
            )
        index = int(index)
        if runtime.strict_equal(runtime.jstype(self.start), 'bigint'):
            index = runtime.bigint(index)
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError('range object index out of range')
        return self.start + index * self.step

    def __setitem__(self, _index: Any, _value: Any) -> None:
        raise TypeError("'range' object does not support item assignment")

    def __neg__(self) -> Any:
        raise TypeError("bad operand type for unary -: 'range'")

    def __eq__(self, other: Any) -> _Bool:
        if not _builtins_get_member(other, '__sagejs_range__'):
            return False
        if self._length != other._length:
            return False
        if self._length == 0:
            return True
        if self.start != other.start:
            return False
        if self._length == 1:
            return True
        return self.step == other.step

    def __add__(self, _other: Any) -> Any:
        raise TypeError(
            "unsupported operand type(s) for +: 'range'")

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
        start_index = new_start
        if new_start is runtime.undefined:
            start_index = None
        stop_index = new_stop
        if new_stop is runtime.undefined:
            stop_index = None
        return self.__getitem__(
            SageSlice(start_index, stop_index))

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


def _builtins_index_value(value: Any) -> _Int:
    if value is True:
        return 1
    if value is False:
        return 0
    if _builtins_exact_integer_primitive(value):
        return value
    if _builtins_member_is_function(value, '__index__'):
        answer = _builtins_call_member(value, '__index__', [])
        if _builtins_exact_integer_primitive(answer):
            return answer
        raise TypeError('__index__ returned non-int')
    raise TypeError(
        'object cannot be interpreted as an integer')


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
    start = _builtins_index_value(start)
    stop = _builtins_index_value(stop)
    step = _builtins_index_value(step)
    if (
        runtime.strict_equal(runtime.jstype(start), 'bigint')
        or runtime.strict_equal(runtime.jstype(stop), 'bigint')
        or runtime.strict_equal(runtime.jstype(step), 'bigint')
    ):
        start = runtime.bigint(start)
        stop = runtime.bigint(stop)
        step = runtime.bigint(step)
    return _Range(start, stop, step)


runtime.reflect.set(ρσ_range, '__positional_only__', True)


class _EllipsisType:
    def __repr__(self) -> _Str:
        return 'Ellipsis'

    def __str__(self) -> _Str:
        return 'Ellipsis'

    def __hash__(self) -> _Int:
        return id(self)


Ellipsis = _EllipsisType()


class SageProperty:

    def __init__(
        self,
        fget: Any = None,
        fset: Any = None,
        fdel: Any = None,
        doc: Any = None,
    ) -> None:
        self.fget = fget
        self.fset = fset
        self.fdel = fdel
        self.__doc__ = doc

    def __get__(self, instance: Any, _owner: Any = None) -> Any:
        if instance is None:
            return self
        if self.fget is None:
            raise AttributeError('property has no getter')
        if _builtins_get_member(self.fget, 'length') == 0:
            return runtime.reflect.apply(
                self.fget, instance, [])
        return runtime.reflect.apply(
            self.fget, runtime.undefined, [instance])

    def __set__(self, instance: Any, value: Any) -> None:
        if self.fset is None:
            raise AttributeError("can't set attribute")
        if _builtins_get_member(self.fset, 'length') == 1:
            runtime.reflect.apply(self.fset, instance, [value])
        else:
            runtime.reflect.apply(
                self.fset, runtime.undefined, [instance, value])

    def __delete__(self, instance: Any) -> None:
        if self.fdel is None:
            raise AttributeError("can't delete attribute")
        if _builtins_get_member(self.fdel, 'length') == 0:
            runtime.reflect.apply(self.fdel, instance, [])
        else:
            runtime.reflect.apply(
                self.fdel, runtime.undefined, [instance])

    def getter(self, target_function: Any) -> SageProperty:
        return SageProperty(
            target_function, self.fset, self.fdel, self.__doc__)

    def setter(self, target_function: Any) -> SageProperty:
        return SageProperty(
            self.fget, target_function, self.fdel, self.__doc__)

    def deleter(self, target_function: Any) -> SageProperty:
        return SageProperty(
            self.fget, self.fset, target_function, self.__doc__)


def ρσ_property(
    fget: Any = None,
    fset: Any = None,
    fdel: Any = None,
    doc: Any = None,
) -> SageProperty:
    return SageProperty(fget, fset, fdel, doc)


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
    if (
        name == '__dict__'
        and value is not None
        and value is not runtime.undefined
        and (
            runtime.strict_equal(runtime.jstype(value), 'object')
            or runtime.strict_equal(runtime.jstype(value), 'function')
        )
    ):
        return _builtins_namespace_dict(value)
    if (
        name == 'sort'
        and runtime.array.isArray(value)
        and _builtins_member_is_function(value, 'pythonsort')
    ):
        python_sort = _builtins_get_member(value, 'pythonsort')
        return runtime.reflect.apply(
            runtime.reflect.get(python_sort, 'bind'),
            python_sort,
            [value],
        )
    if runtime.strict_equal(runtime.jstype(value), 'string'):
        python_string_member = runtime.reflect.get(
            runtime.reflect.get(
                runtime.string_builtin, 'prototype'),
            name,
        )
        if runtime.strict_equal(
            runtime.jstype(python_string_member), 'function'
        ):
            return runtime.reflect.apply(
                runtime.reflect.get(
                    python_string_member, 'bind'),
                python_string_member,
                [value],
            )
    if (
        name == '__next__'
        and not _builtins_member_is_function(value, '__next__')
        and _builtins_member_is_function(value, 'next')
    ):
        def native_next() -> Any:
            return ρσ_next(value)

        return native_next
    if (
        name == '__class__'
        and not runtime.strict_equal(runtime.jstype(value), 'function')
    ):
        return _builtins_get_member(value, 'constructor')

    descriptor = runtime.undefined
    owner = runtime.undefined
    if (
        not runtime.strict_equal(runtime.jstype(value), 'function')
        and value is not None
        and value is not runtime.undefined
    ):
        owner = _builtins_get_member(value, 'constructor')
        descriptor_info = _builtins_class_attribute_descriptor(
            value, name)
        if descriptor_info is not runtime.undefined:
            descriptor = runtime.reflect.get(
                descriptor_info, 'value')
            if (
                descriptor is not runtime.undefined
                and
                _builtins_member_is_function(descriptor, '__get__')
                and (
                    _builtins_member_is_function(descriptor, '__set__')
                    or _builtins_member_is_function(
                        descriptor, '__delete__')
                )
            ):
                return _builtins_call_member(
                    descriptor, '__get__', [value, owner])
    if runtime.strict_equal(runtime.jstype(value), 'function'):
        class_prototype = _builtins_get_member(value, 'prototype')
        if (
            not _builtins_has_member(value, name)
            and
            class_prototype is not runtime.undefined
            and _builtins_has_member(class_prototype, name)
        ):
            class_member = _builtins_get_member(
                class_prototype, name)
            if _builtins_has_member(
                class_member, '__classmethod__'
            ):
                return runtime.reflect.apply(
                    runtime.reflect.get(class_member, 'bind'),
                    class_member,
                    [value],
                )
            return class_member
    if _builtins_has_member(value, name):
        member = _builtins_get_member(value, name)
        member_is_own = runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            value,
            [name],
        )
        if (
            _builtins_member_is_function(member, '__get__')
            and (
                not member_is_own
                or runtime.strict_equal(
                    runtime.jstype(value), 'function')
            )
        ):
            instance = (
                None
                if runtime.strict_equal(runtime.jstype(value), 'function')
                else value
            )
            member_owner = (
                value
                if instance is None
                else _builtins_get_member(value, 'constructor')
            )
            return _builtins_call_member(
                member, '__get__', [instance, member_owner])
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
            if _builtins_has_member(
                member, '__python_descriptor__'
            ):
                return _builtins_bind_python_function(
                    member, value)
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
    if _builtins_get_member(value, '__sagejs_super__') is True:
        runtime.reflect.set(value, name, member)
        return
    if (
        value is ρσ_int
        or value is ρσ_bool
        or value is ρσ_float
        or value is runtime.string_builtin
    ):
        raise TypeError(
            "cannot set attributes of built-in/extension type")
    if (
        runtime.strict_equal(runtime.jstype(value), 'function')
        and _builtins_has_member(value, '__self__')
    ):
        raise AttributeError(
            "'method' object has no attribute '" + name + "'")
    if (
        not runtime.strict_equal(runtime.jstype(value), 'function')
        and _builtins_member_is_function(value, '__setattr__')
    ):
        return _builtins_call_member(
            value, '__setattr__', [name, member])
    descriptor_info = _builtins_class_attribute_descriptor(
        value, name)
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(descriptor_info, 'value')
        if _builtins_member_is_function(descriptor, '__set__'):
            return _builtins_call_member(
                descriptor, '__set__', [value, member])
    if _builtins_is_python_class(value):
        runtime.reflect.set(value.prototype, name, member)
        if _builtins_member_is_function(member, '__set_name__'):
            _builtins_call_member(
                member, '__set_name__', [value, name])
    if not runtime.reflect.set(value, name, member):
        raise AttributeError(
            "object attribute '" + name + "' is read-only")


_dynamic_code_helper_cache = runtime.undefined


class _Code:

    def __init__(
        self,
        source: _Str,
        filename: _Str,
        mode: _Str,
        native_code: Any,
    ) -> None:
        self.source = source
        self.filename = filename
        self.mode = mode
        self._native_code = native_code


class _FunctionCode:

    def __init__(self, source_function: Any) -> None:
        self.source_function = source_function


def ρσ_function_code(source_function: Any) -> _FunctionCode:
    return _FunctionCode(source_function)


def _builtins_function_with_globals(
    source_function: Any,
    global_namespace: Any,
) -> Any:
    def rebound(*args: Any, **keywords: Any) -> Any:
        original_globals = _builtins_get_member(
            source_function, '__globals__')
        saved = []
        for pair in global_namespace.items():
            name = pair[0]
            existed = name in original_globals
            if existed:
                old_value = original_globals.__getitem__(name)
            else:
                old_value = None
            saved.append(
                runtime.math_tuple([name, existed, old_value]))
            original_globals.__setitem__(name, pair[1])
        try:
            result = source_function(*args, **keywords)
        finally:
            for entry in saved:
                if entry[1]:
                    original_globals.__setitem__(
                        entry[0], entry[2])
                else:
                    try:
                        original_globals.__delitem__(entry[0])
                    except KeyError:
                        runtime.reflect.deleteProperty(
                            runtime.global_object, entry[0])
        if (
            runtime.strict_equal(
                runtime.jstype(result), 'function')
            and _builtins_get_member(
                result, '__python_descriptor__') is True
        ):
            return _builtins_function_with_globals(
                result, global_namespace)
        return result

    runtime.reflect.set(
        rebound, '__python_type__', ρσ_function_type)
    runtime.reflect.set(
        rebound, '__python_descriptor__', True)
    runtime.reflect.set(
        rebound, '__code__',
        _builtins_get_member(source_function, '__code__'))
    runtime.reflect.set(
        rebound, '__name__',
        _builtins_get_member(source_function, '__name__'))
    return rebound


def ρσ_function_type(
    code: Any,
    global_namespace: Any,
) -> Any:
    if not isinstance(code, _FunctionCode):
        raise TypeError(
            'function() argument 1 must be a code object')
    if not isinstance(global_namespace, dict):
        raise TypeError(
            'function() argument 2 must be a dict')
    return _builtins_function_with_globals(
        code.source_function, global_namespace)


def _builtins_dynamic_code_helper() -> Any:
    global _dynamic_code_helper_cache
    if _dynamic_code_helper_cache is runtime.undefined:
        module = runtime.require_module('./dynamic-code.js')
        _dynamic_code_helper_cache = runtime.reflect.get(
            module, 'default')
    return _dynamic_code_helper_cache


def _builtins_code_source(source: Any) -> _Str:
    if runtime.strict_equal(runtime.jstype(source), 'string'):
        return source
    if _builtins_has_member(source, '_values'):
        return str(source, 'utf-8')
    raise TypeError(
        'source must be a string, bytes, bytearray, or memoryview')


def ρσ_compile(
    source: Any,
    filename: Any,
    mode: Any,
    flags: Any = 0,
    dont_inherit: Any = False,
    optimize: Any = -1,
) -> _Code:
    del flags, dont_inherit, optimize
    source = _builtins_code_source(source)
    filename = str(filename)
    mode = str(mode)
    if mode not in ('exec', 'eval', 'single'):
        raise ValueError(
            "compile() mode must be 'exec', 'eval' or 'single'")
    helper = _builtins_dynamic_code_helper()
    try:
        native_code = runtime.reflect.apply(
            runtime.reflect.get(helper, 'compile'),
            helper,
            [source, filename, mode],
        )
    except SyntaxError as error:
        if runtime.strict_equal(
            runtime.reflect.get(error, 'sagejsErrorName'),
            'IndentationError',
        ):
            raise IndentationError(str(error))  # noqa: B904
        raise
    return _Code(source, filename, mode, native_code)


def _builtins_dynamic_namespaces(
    global_namespace: Any,
    local_namespace: Any,
    caller_globals: Any,
    caller_locals: Any,
) -> Any:
    if global_namespace is runtime.undefined or global_namespace is None:
        global_namespace = caller_globals
        default_locals = caller_locals
    else:
        default_locals = global_namespace
    if not isinstance(global_namespace, dict):
        raise TypeError('globals must be a dict')
    if local_namespace is runtime.undefined or local_namespace is None:
        local_namespace = default_locals
    if not isinstance(local_namespace, dict):
        raise TypeError('locals must be a mapping')
    return runtime.math_tuple(
        [global_namespace, local_namespace])


def _builtins_run_dynamic(
    source: Any,
    global_namespace: Any,
    local_namespace: Any,
    caller_globals: Any,
    caller_locals: Any,
) -> Any:
    namespaces = _builtins_dynamic_namespaces(
        global_namespace,
        local_namespace,
        caller_globals,
        caller_locals,
    )
    global_namespace = namespaces[0]
    local_namespace = namespaces[1]
    if isinstance(source, _Code):
        code = source
    else:
        code = ρσ_compile(source, '<string>', 'exec')

    execution_namespace = global_namespace.copy()
    if local_namespace is not global_namespace:
        execution_namespace.update(local_namespace)
    native_namespace = execution_namespace.as_object()
    live_scope = runtime.reflect.get(global_namespace, '_scope')
    if live_scope is not runtime.undefined:
        for key in runtime.object.keys(live_scope):
            if (
                runtime.reflect.get(live_scope, key)
                is runtime.undefined
                and not runtime.reflect.apply(
                    runtime.object.prototype.hasOwnProperty,
                    native_namespace,
                    [key],
                )
            ):
                # A JavaScript declaration may exist before the corresponding
                # Python global has ever been bound.  Keep it absent from the
                # globals dict, but tell the dynamic compiler to emit an
                # unbound-name check rather than reading the outer JS slot.
                runtime.reflect.set(
                    native_namespace, key, runtime.undefined)
    if global_namespace is not caller_globals:
        for key in caller_globals.keys():
            if key not in execution_namespace:
                runtime.reflect.set(
                    native_namespace,
                    key,
                    runtime.undefined,
                )
    helper = _builtins_dynamic_code_helper()
    prepared = runtime.reflect.apply(
        runtime.reflect.get(helper, 'run'),
        helper,
        [code._native_code, native_namespace],
    )
    result = runtime.dynamic_eval(
        runtime.reflect.get(prepared, 'javascript'),
        native_namespace,
        runtime.reflect.get(prepared, 'moduleId'),
    )
    resulting_namespace = runtime.reflect.get(
        result, 'namespace')
    for key in runtime.object.keys(resulting_namespace):
        if key == '__sagejs_eval_result__':
            continue
        value = runtime.reflect.get(resulting_namespace, key)
        if value is not runtime.undefined:
            local_namespace.__setitem__(key, value)
    return result


def ρσ_eval(
    source: Any,
    global_namespace: Any = runtime.undefined,
    local_namespace: Any = runtime.undefined,
    caller_globals: Any = runtime.undefined,
    caller_locals: Any = runtime.undefined,
) -> Any:
    if not isinstance(source, _Code):
        source = ρσ_compile(source, '<string>', 'eval')
    result = _builtins_run_dynamic(
        source,
        global_namespace,
        local_namespace,
        caller_globals,
        caller_locals,
    )
    return runtime.reflect.get(result, 'completion')


def ρσ_exec(
    source: Any,
    global_namespace: Any = runtime.undefined,
    local_namespace: Any = runtime.undefined,
    caller_globals: Any = runtime.undefined,
    caller_locals: Any = runtime.undefined,
) -> None:
    if not isinstance(source, _Code):
        source = ρσ_compile(source, '<string>', 'exec')
    result = _builtins_run_dynamic(
        source,
        global_namespace,
        local_namespace,
        caller_globals,
        caller_locals,
    )
    if (
        source.mode == 'single'
        and runtime.reflect.get(result, 'completion')
        is not runtime.undefined
        and runtime.reflect.get(result, 'completion') is not None
    ):
        print(runtime.reflect.get(result, 'completion'))
    return None


def ρσ_delattr(value: Any, name: _Str) -> None:
    if not runtime.strict_equal(runtime.jstype(name), 'string'):
        raise TypeError('attribute name must be string')
    if _builtins_get_member(value, '__sagejs_super__') is True:
        runtime.reflect.deleteProperty(value, name)
        return
    if _builtins_is_python_class(value):
        class_has_own = runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            value,
            [name],
        )
        prototype = runtime.reflect.get(value, 'prototype')
        prototype_has_own = runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            prototype,
            [name],
        )
        if not class_has_own and not prototype_has_own:
            raise AttributeError(
                "object has no attribute '" + name + "'")
        if class_has_own:
            runtime.reflect.deleteProperty(value, name)
        if prototype_has_own:
            runtime.reflect.deleteProperty(prototype, name)
        return
    if (
        not runtime.strict_equal(runtime.jstype(value), 'function')
        and _builtins_member_is_function(value, '__delattr__')
    ):
        return _builtins_call_member(value, '__delattr__', [name])
    property_deleter = _builtins_get_member(
        value, 'ρσ_property_deleter_' + name)
    if runtime.strict_equal(
        runtime.jstype(property_deleter), 'function'
    ):
        runtime.reflect.apply(property_deleter, value, [])
        return
    descriptor_info = _builtins_class_attribute_descriptor(
        value, name)
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(descriptor_info, 'value')
        if _builtins_member_is_function(descriptor, '__delete__'):
            return _builtins_call_member(
                descriptor, '__delete__', [value])
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
        '__sagejs_super__': True,
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
            if _builtins_has_member(member, '__staticmethod__'):
                return member
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
    if modulus is runtime.undefined or modulus is None:
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


def ρσ_type(*values: Any) -> Any:
    if len(values) == 3:
        class_name = values[0]
        bases = values[1]
        namespace = values[2]
        if not runtime.strict_equal(
            runtime.jstype(class_name), 'string'
        ):
            raise TypeError('type() argument 1 must be str')
        if not runtime.array.isArray(bases):
            raise TypeError('type() argument 2 must be tuple')
        if len(bases) == 0:
            bases = runtime.math_tuple([SageObject])
        parent = bases[0]
        if not _builtins_is_python_class(parent):
            raise TypeError('type() bases must be types')
        if not _builtins_member_is_function(namespace, 'items'):
            raise TypeError('type() argument 3 must be dict')

        def dynamic_class(*args: Any, **keywords: Any) -> Any:
            instance = runtime.object.create(
                runtime.reflect.get(dynamic_class, 'prototype'))
            initializer = _builtins_get_member(instance, '__init__')
            if runtime.strict_equal(
                runtime.jstype(initializer), 'function'
            ):
                if len(keywords) != 0:
                    raise TypeError(
                        'dynamic class keyword construction '
                        'is not implemented')
                runtime.reflect.apply(initializer, instance, args)
            return instance

        prototype = runtime.object.create(
            runtime.reflect.get(parent, 'prototype'))
        runtime.reflect.set(
            prototype, 'constructor', dynamic_class)
        runtime.reflect.set(dynamic_class, 'prototype', prototype)
        runtime.reflect.set(dynamic_class, '__name__', class_name)
        runtime.reflect.set(
            dynamic_class, '__bases__', runtime.math_tuple(list(bases)))
        runtime.reflect.set(
            prototype, '__bases__', runtime.math_tuple(list(bases)))
        for pair in namespace.items():
            member_name = pair[0]
            member = pair[1]
            runtime.reflect.set(prototype, member_name, member)
            if (
                runtime.strict_equal(
                    runtime.jstype(member), 'function')
                or runtime.string_find(member_name, '__') != 0
            ):
                runtime.reflect.set(
                    dynamic_class, member_name, member)
            if _builtins_member_is_function(
                member, '__set_name__'
            ):
                _builtins_call_member(
                    member,
                    '__set_name__',
                    [dynamic_class, member_name],
                )
        runtime.set_class_repr(dynamic_class, "<class '" + class_name + "'>")
        return dynamic_class
    if len(values) != 1:
        raise TypeError('type() takes 1 or 3 arguments')
    value = values[0]
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, 'number')
    ):
        if runtime.number.isInteger(value):
            return ρσ_int
        return ρσ_float
    if runtime.strict_equal(value_type, 'bigint'):
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
    if cls is candidates:
        return True
    bases = _builtins_get_member(cls, '__bases__')
    if runtime.array.isArray(bases):
        for base in bases:
            if ρσ_issubclass(base, candidates):
                return True
    return (
        runtime.instance_of(
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


def ρσ_is_prime(value: Any) -> _Bool:
    if runtime.strict_equal(runtime.jstype(value), 'number'):
        if not runtime.number.isSafeInteger(value):
            return False
        value = runtime.bigint(value)
    elif not runtime.strict_equal(runtime.jstype(value), 'bigint'):
        raise TypeError('is_prime() requires an integer')
    if runtime.native_lt(value, runtime.bigint(2)):
        return False
    return runtime.flint_backend().isPrime(value)


def ρσ_prime_range(
    start: Any,
    stop: Any = None,
) -> Any:
    if stop is None:
        stop = start
        start = 2
    if not runtime.is_exact_integer(start):
        raise TypeError('prime_range() bounds must be integers')
    if not runtime.is_exact_integer(stop):
        raise TypeError('prime_range() bounds must be integers')
    lower = runtime.bigint(start)
    upper = runtime.bigint(stop)
    answer = []
    if runtime.native_le(upper, runtime.bigint(2)):
        return answer
    candidate = runtime.flint_backend().nextPrime(
        runtime.native_sub(lower, runtime.bigint(1)))
    while runtime.native_lt(candidate, upper):
        answer.append(runtime.normalize_integer(candidate))
        candidate = runtime.flint_backend().nextPrime(candidate)
    return answer


def ρσ_prime_divisors(value: Any) -> Any:
    return [pair[0] for pair in ρσ_factor(value)]


def ρσ_divisors(value: Any) -> Any:
    if _builtins_member_is_function(value, 'divisors'):
        return _builtins_call_member(value, 'divisors', [])
    if not runtime.is_exact_integer(value):
        raise TypeError('divisors() requires an integer')
    integer = runtime.integer_bigint(value)
    if runtime.strict_equal(integer, runtime.bigint(0)):
        raise ValueError('divisors() is not defined for 0')
    if runtime.native_lt(integer, runtime.bigint(0)):
        integer = runtime.native_neg(integer)
    answer = [1]
    for prime, exponent in ρσ_factor(integer):
        previous = answer
        answer = []
        power = 1
        for _ in range(exponent + 1):
            for divisor in previous:
                answer.append(
                    ρσ_operator_mul_exact(divisor, power))
            power = ρσ_operator_mul_exact(power, prime)

    for left_index in range(len(answer)):
        for right_index in range(left_index + 1, len(answer)):
            if answer[right_index] < answer[left_index]:
                temporary = answer[left_index]
                answer[left_index] = answer[right_index]
                answer[right_index] = temporary
    return answer


def prod(values: Any, start: Any = 1) -> Any:
    answer = start
    for value in values:
        answer = ρσ_operator_mul_exact(answer, value)
    return answer


def latex(value: Any) -> str:
    """Return a compact LaTeX representation of ``value``."""
    if _builtins_member_is_function(value, '_latex_'):
        return str(_builtins_call_member(value, '_latex_', []))
    return str(value)


_prime_pi_primes = None
_prime_pi_checked_through = 1


def prime_pi(value: Any) -> Any:
    global _prime_pi_checked_through, _prime_pi_primes
    if _prime_pi_primes is None:
        _prime_pi_primes = []
    if not runtime.is_exact_integer(value):
        value = runtime.math.floor(value)
    if value < 2:
        return 0
    upper = runtime.integer_bigint(value)
    if upper > _prime_pi_checked_through:
        candidate = runtime.flint_backend().nextPrime(
            runtime.bigint(_prime_pi_checked_through))
        while candidate <= upper:
            _prime_pi_primes.append(
                runtime.normalize_integer(candidate))
            candidate = runtime.flint_backend().nextPrime(candidate)
        _prime_pi_checked_through = runtime.normalize_integer(upper)

    left = 0
    right = len(_prime_pi_primes)
    while left < right:
        middle = (left + right) // 2
        if _prime_pi_primes[middle] <= value:
            left = middle + 1
        else:
            right = middle
    return left


def _prime_pi_plot(start: Any, stop: Any, **options: Any) -> Any:
    plot_function = runtime.reflect.get(runtime.global_object, 'plot')
    return plot_function(prime_pi, start, stop, **options)


runtime.reflect.set(prime_pi, 'plot', _prime_pi_plot)


def numerator(value: Any) -> Any:
    if runtime.is_exact_integer(value):
        return value
    if _builtins_member_is_function(value, 'numerator'):
        return _builtins_call_member(value, 'numerator', [])
    raise TypeError('numerator() is not defined for this value')


def denominator(value: Any) -> Any:
    if runtime.is_exact_integer(value):
        return 1
    if _builtins_member_is_function(value, 'denominator'):
        return _builtins_call_member(value, 'denominator', [])
    raise TypeError('denominator() is not defined for this value')


def bernoulli(index: Any) -> Any:
    if not runtime.is_exact_integer(index):
        raise TypeError('Bernoulli number index must be an integer')
    n = runtime.number(index)
    if n < 0:
        raise ValueError('Bernoulli number index must be nonnegative')
    if n > 1 and n % 2 == 1:
        return 0
    values = []
    for m in range(n + 1):
        values.append(runtime.rational_class(1, m + 1))
        j = m
        while j >= 1:
            values[j - 1] = j * (values[j - 1] - values[j])
            j -= 1
    return values[0]


def moebius(value: Any) -> Any:
    if not runtime.is_exact_integer(value):
        raise TypeError('Möbius function input must be an integer')
    integer = runtime.integer_bigint(value)
    if integer == 0:
        return 0
    if integer < 0:
        integer = -integer
    sign = 1
    for _prime, exponent in ρσ_factor(integer):
        if exponent > 1:
            return 0
        sign = -sign
    return sign


def _moebius_range(start: Any, stop: Any = None) -> Any:
    if stop is None:
        stop = start
        start = 0
    return [moebius(value) for value in range(start, stop)]


runtime.reflect.set(moebius, 'range', _moebius_range)


_ZETA_BERNOULLI = [
    0.16666666666666666,
    -0.03333333333333333,
    0.023809523809523808,
    -0.03333333333333333,
    0.07575757575757576,
    -0.2531135531135531,
    1.1666666666666667,
    -7.092156862745098,
]


def zeta(value: Any) -> Any:
    """Numerically evaluate the Riemann zeta function at an integer > 1."""
    if not runtime.is_exact_integer(value):
        raise NotImplementedError(
            'zeta() is currently implemented for integer arguments')
    s = runtime.number(value)
    if s <= 1:
        raise NotImplementedError(
            'zeta() is currently implemented for integers greater than 1')

    cutoff = 16
    answer = 0.0
    for n in range(1, cutoff):
        answer += runtime.math.pow(n, -s)
    answer += (
        runtime.math.pow(cutoff, 1 - s) / (s - 1)
        + 0.5 * runtime.math.pow(cutoff, -s)
    )

    rising = s
    factorial = 2.0
    for index in range(len(_ZETA_BERNOULLI)):
        if index:
            rising *= (s + 2 * index - 1) * (s + 2 * index)
            factorial *= (2 * index + 1) * (2 * index + 2)
        answer += (
            _ZETA_BERNOULLI[index]
            * rising
            / factorial
            * runtime.math.pow(cutoff, -(s + 2 * index + 1))
        )
    return answer


def set_random_seed(seed_value: Any) -> None:
    random_module = runtime.reflect.get(runtime.modules, 'random')
    if random_module is runtime.undefined:
        raise ImportError("No module named 'random'")
    runtime.reflect.apply(
        runtime.reflect.get(random_module, 'seed'),
        random_module,
        [seed_value],
    )


def random() -> _Float:
    random_module = runtime.reflect.get(runtime.modules, 'random')
    if random_module is runtime.undefined:
        raise ImportError("No module named 'random'")
    return runtime.reflect.apply(
        runtime.reflect.get(random_module, 'random'),
        random_module,
        [],
    )


def randint(start: Any, stop: Any) -> Any:
    random_module = runtime.reflect.get(runtime.modules, 'random')
    if random_module is runtime.undefined:
        raise ImportError("No module named 'random'")
    return runtime.reflect.apply(
        runtime.reflect.get(random_module, 'randint'),
        random_module,
        [start, stop],
    )


def primes(stop: Any) -> Any:
    return ρσ_prime_range(stop)


def cartesian_product_iterator(factors: Any) -> Iterator[Any]:
    values = [list(factor_values) for factor_values in factors]

    def walk(index: _Int, prefix: list[Any]) -> Iterator[Any]:
        if index == len(values):
            yield runtime.math_tuple(prefix)
        else:
            for value in values[index]:
                yield from walk(index + 1, prefix + [value])

    yield from walk(0, [])


def prime_powers(start: Any, stop: Any = None) -> Any:
    """Return the prime powers in the requested half-open interval."""
    if stop is None:
        stop = start
        start = 1
    if not runtime.is_exact_integer(start):
        raise TypeError('prime_powers() bounds must be integers')
    if not runtime.is_exact_integer(stop):
        raise TypeError('prime_powers() bounds must be integers')
    lower = runtime.integer_bigint(start)
    upper = runtime.integer_bigint(stop)
    answer = []
    if lower <= 1 < upper:
        answer.append(1)
    for prime in ρσ_prime_range(2, stop):
        power = runtime.integer_bigint(prime)
        while power < upper:
            if power >= lower:
                answer.append(runtime.normalize_integer(power))
            power *= runtime.integer_bigint(prime)
    for left_index in range(len(answer)):
        for right_index in range(left_index + 1, len(answer)):
            if answer[right_index] < answer[left_index]:
                temporary = answer[left_index]
                answer[left_index] = answer[right_index]
                answer[right_index] = temporary
    return answer


def is_prime_power(value: Any) -> _Bool:
    if not runtime.is_exact_integer(value):
        return False
    integer = runtime.integer_bigint(value)
    if integer == 1:
        return True
    if integer < 2:
        return False
    return len(ρσ_factor(integer)) == 1


def _builtins_integer_is_irreducible(self: Any) -> _Bool:
    value = runtime.bigint(self)
    return ρσ_is_prime(
        runtime.native_neg(value) if value < 0 else value)


def _builtins_extreme(
    positional: Any,
    keywords: Any,
    find_maximum: _Bool,
) -> Any:
    # ``default`` is reserved in JavaScript, so the compiler's keyword
    # desugaring uses this stable internal property spelling.
    default_value = runtime.reflect.get(keywords, 'ρσ_py_default')
    key = runtime.reflect.get(keywords, 'key')
    if len(positional) == 0:
        if default_value is not runtime.undefined:
            return default_value
        raise TypeError('expected at least one argument')
    if len(positional) > 1 and default_value is not runtime.undefined:
        raise TypeError(
            'Cannot specify a default for min() or max() with multiple '
            'positional arguments')

    values = positional[0] if len(positional) == 1 else positional
    iterator = iter(values)
    answer = next(iterator, _BUILTINS_EMPTY)
    if answer is _BUILTINS_EMPTY:
        if default_value is not runtime.undefined:
            return default_value
        raise ValueError('arg is an empty sequence')

    if key is not runtime.undefined and key is not None:
        answer_key = key(answer)
        for value in iterator:
            candidate = key(value)
            if find_maximum and candidate > answer_key:
                answer = value
                answer_key = candidate
            elif not find_maximum and candidate < answer_key:
                answer = value
                answer_key = candidate
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
property = ρσ_property

runtime.set_class_repr(ρσ_int, "<class 'int'>")
runtime.set_class_repr(ρσ_bool, "<class 'bool'>")
runtime.set_class_repr(ρσ_float, "<class 'float'>")
runtime.set_class_repr(ρσ_type, "<class 'type'>")
runtime.set_class_repr(runtime.function_class, "<class 'function'>")
runtime.reflect.set(ρσ_int, '__python_type__', ρσ_type)
runtime.reflect.set(ρσ_bool, '__python_type__', ρσ_type)
runtime.reflect.set(ρσ_float, '__python_type__', ρσ_type)
runtime.reflect.set(ρσ_type, '__python_type__', ρσ_type)
runtime.reflect.set(runtime.function_class, '__python_type__', ρσ_type)
runtime.set_class_repr(ρσ_tuple, "<class 'tuple'>")
runtime.set_class_repr(ρσ_property, "<class 'property'>")
runtime.set_class_repr(SageProperty, "<class 'property'>")
runtime.reflect.set(
    runtime.reflect.get(SageProperty, 'prototype'),
    '__python_type__',
    ρσ_property,
)
runtime.set_class_repr(runtime.list_constructor, "<class 'list'>")
runtime.set_class_repr(runtime.string_builtin, "<class 'str'>")


class SageObject:

    def __init__(self) -> None:
        pass

    def __repr__(self) -> _Str:
        constructor = runtime.reflect.get(self, 'constructor')
        name = (
            'object'
            if constructor is SageObject
            else runtime.reflect.get(constructor, '__name__')
        )
        return (
            '<' + name + ' object at ' + str(id(self)) + '>'
        )

    def __hash__(self) -> _Int:
        return id(self)


def _builtins_object_new(cls: Any) -> Any:
    if not _builtins_is_python_class(cls):
        raise TypeError(
            'object.__new__() argument 1 must be a type')
    return runtime.object.create(
        runtime.reflect.get(cls, 'prototype'))


@runtime.native_method
def _builtins_object_setattr(
    self: Any,
    name: _Str,
    value: Any,
) -> None:
    if not runtime.strict_equal(runtime.jstype(name), 'string'):
        raise TypeError('attribute name must be string')
    descriptor_info = _builtins_class_attribute_descriptor(
        self, name)
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(
            descriptor_info, 'value')
        if _builtins_member_is_function(descriptor, '__set__'):
            _builtins_call_member(
                descriptor, '__set__', [self, value])
            return
    runtime.reflect.set(self, name, value)


@runtime.native_method
def _builtins_object_delattr(self: Any, name: _Str) -> None:
    if not runtime.strict_equal(runtime.jstype(name), 'string'):
        raise TypeError('attribute name must be string')
    property_deleter = _builtins_get_member(
        self, 'ρσ_property_deleter_' + name)
    if runtime.strict_equal(
        runtime.jstype(property_deleter), 'function'
    ):
        runtime.reflect.apply(property_deleter, self, [])
        return
    descriptor_info = _builtins_class_attribute_descriptor(
        self, name)
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(
            descriptor_info, 'value')
        if _builtins_member_is_function(descriptor, '__delete__'):
            _builtins_call_member(
                descriptor, '__delete__', [self])
            return
    has_own = runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        self,
        [name],
    )
    if (
        not has_own
        or not runtime.reflect.deleteProperty(self, name)
    ):
        raise AttributeError(
            "object has no attribute '" + name + "'")


runtime.reflect.set(
    SageObject,
    '__new__',
    _builtins_object_new,
)
runtime.reflect.set(
    _builtins_object_new,
    '__staticmethod__',
    True,
)
runtime.reflect.set(
    SageObject,
    '__setattr__',
    _builtins_object_setattr,
)
runtime.reflect.set(
    SageObject,
    '__delattr__',
    _builtins_object_delattr,
)
_sage_object_prototype = runtime.reflect.get(
    SageObject, 'prototype')
runtime.reflect.set(
    _sage_object_prototype,
    '__new__',
    _builtins_object_new,
)
runtime.reflect.set(
    _sage_object_prototype,
    '__setattr__',
    _builtins_object_setattr,
)
runtime.reflect.set(
    _sage_object_prototype,
    '__delattr__',
    _builtins_object_delattr,
)
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
classmethod = ρσ_classmethod
staticmethod = ρσ_staticmethod
enumerate = ρσ_enumerate
tuple = ρσ_tuple
slice = SageSlice
runtime.set_class_repr(SageSlice, "<class 'slice'>")
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
delattr = ρσ_delattr
hasattr = ρσ_hasattr
factor = ρσ_factor
gcd = ρσ_gcd
next_prime = ρσ_next_prime
is_prime = ρσ_is_prime
prime_range = ρσ_prime_range
prime_divisors = ρσ_prime_divisors
divisors = ρσ_divisors
compile = ρσ_compile
exec = ρσ_exec
_integer_is_irreducible_native = runtime.native_method(
    _builtins_integer_is_irreducible)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, 'prototype'),
    'is_irreducible',
    _integer_is_irreducible_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, 'prototype'),
    'is_irreducible',
    _integer_is_irreducible_native,
)
runtime.set_class_repr(_Code, "<class 'code'>")
runtime.set_class_repr(ρσ_function_type, "<class 'function'>")
