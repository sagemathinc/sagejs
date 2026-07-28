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


def _builtins_type_is(value: Any, expected: _Str) -> _Bool:
    return runtime.strict_equal(value, expected)


def _builtins_get_member(value: Any, name: Any) -> Any:
    if value is None or value is runtime.undefined:
        return runtime.undefined
    value_type = runtime.jstype(value)
    if (
        _builtins_type_is(value_type, 'object')
        or _builtins_type_is(value_type, 'function')
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
        not _builtins_type_is(value_type, 'object')
        and not _builtins_type_is(value_type, 'function')
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
    return _builtins_type_is(
        runtime.jstype(_builtins_get_member(value, name)),
        'function',
    )


def _builtins_exact_integer_primitive(value: Any) -> _Bool:
    value_type = runtime.jstype(value)
    return (
        _builtins_type_is(value_type, 'bigint')
        or (
            _builtins_type_is(value_type, 'number')
            and runtime.number.isSafeInteger(value)
        )
    )


def ρσ_bigint_divexact(numerator: Any, denominator: Any) -> Any:
    """Divide two BigInts, relying on exact divisibility."""
    return runtime.native_div(numerator, denominator)


def abs(value: Any) -> Any:
    if _builtins_type_is(runtime.jstype(value), 'bigint'):
        return runtime.native_neg(value) if value < 0 else value
    if _builtins_member_is_function(value, '__abs__'):
        return _builtins_call_member(value, '__abs__', [])
    return runtime.math.abs(value)


def ρσ_exact_integer_primitive(value: Any) -> _Bool:
    return _builtins_exact_integer_primitive(value)


def ρσ_operator_add(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('add', left, right)
    if _builtins_type_is(runtime.jstype(left), 'object'):
        if _builtins_member_is_function(left, '__add__'):
            return _builtins_call_member(left, '__add__', [right])
        if _builtins_member_is_function(left, 'concat'):
            return _builtins_call_member(left, 'concat', [right])
    return runtime.native_add(left, right)


def ρσ_operator_add_exact(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('add', left, right)
    if _builtins_type_is(runtime.jstype(left), 'object'):
        if _builtins_member_is_function(left, '__add__'):
            return _builtins_call_member(left, '__add__', [right])
        if _builtins_member_is_function(left, 'concat'):
            return _builtins_call_member(left, 'concat', [right])
        return runtime.native_add(left, right)
    if (
        _builtins_type_is(runtime.jstype(left), 'bigint')
        or _builtins_type_is(runtime.jstype(right), 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_add(
                runtime.bigint(left), runtime.bigint(right))
        return runtime.native_add(left, right)
    if (
        not _builtins_type_is(runtime.jstype(left), 'number')
        or not _builtins_type_is(runtime.jstype(right), 'number')
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
    if _builtins_member_is_function(value, '__neg__'):
        return _builtins_call_member(value, '__neg__', [])
    return runtime.native_neg(value)


def ρσ_operator_sub(left: Any, right: Any) -> Any:
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
        _builtins_type_is(runtime.jstype(left), 'bigint')
        or _builtins_type_is(runtime.jstype(right), 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_sub(
                runtime.bigint(left), runtime.bigint(right))
        return runtime.native_sub(left, right)
    if (
        not _builtins_type_is(runtime.jstype(left), 'number')
        or not _builtins_type_is(runtime.jstype(right), 'number')
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


def ρσ_operator_mul(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('mul', left, right)
    if _builtins_member_is_function(left, '__mul__'):
        return _builtins_call_member(left, '__mul__', [right])
    return runtime.native_mul(left, right)


def ρσ_operator_mul_exact(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('mul', left, right)
    if _builtins_member_is_function(left, '__mul__'):
        return _builtins_call_member(left, '__mul__', [right])
    if (
        _builtins_type_is(runtime.jstype(left), 'bigint')
        or _builtins_type_is(runtime.jstype(right), 'bigint')
    ):
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
        ):
            return runtime.native_mul(
                runtime.bigint(left), runtime.bigint(right))
        return runtime.native_mul(left, right)
    if (
        not _builtins_type_is(runtime.jstype(left), 'number')
        or not _builtins_type_is(runtime.jstype(right), 'number')
    ):
        return runtime.native_mul(left, right)
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
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp('truediv', left, right)
    if _builtins_member_is_function(left, '__div__'):
        return _builtins_call_member(left, '__div__', [right])
    return runtime.native_div(left, right)


def ρσ_operator_pow(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__pow__'):
        return _builtins_call_member(left, '__pow__', [right])
    return runtime.native_pow(left, right)


def ρσ_operator_pow_exact(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__pow__'):
        return _builtins_call_member(left, '__pow__', [right])
    if (
        (
            _builtins_type_is(runtime.jstype(left), 'bigint')
            or _builtins_type_is(runtime.jstype(right), 'bigint')
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
        not _builtins_type_is(runtime.jstype(left), 'number')
        or not _builtins_type_is(runtime.jstype(right), 'number')
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
    if _builtins_member_is_function(left, method_name):
        return _builtins_call_member(left, method_name, [right])
    return fallback(left, right)


def ρσ_operator_iadd(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, '__iadd__', ρσ_operator_add)


def ρσ_operator_isub(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, '__isub__', ρσ_operator_sub)


def ρσ_operator_imul(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, '__imul__', ρσ_operator_mul)


def ρσ_operator_idiv(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, '__idiv__', ρσ_operator_div)


def ρσ_operator_ipow(left: Any, right: Any) -> Any:
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
    return runtime.native_div(left, right)


def ρσ_operator_floordiv(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, '__floordiv__'):
        return _builtins_call_member(left, '__floordiv__', [right])
    return runtime.math.floor(runtime.native_div(left, right))


def ρσ_bool(value: Any) -> _Bool:
    return not not value


def ρσ_round(value: Any) -> Any:
    # This retains the historical Sage.js behavior; Python's tie-to-even
    # semantics are a separate compatibility task.
    return runtime.math.round(value)


def ρσ_print(*values: Any) -> None:
    parts = [str(value) for value in values]
    runtime.console_object.log(str.join(' ', parts))


def ρσ_int(value: Any, base: Any = runtime.undefined) -> Any:
    if _builtins_type_is(runtime.jstype(value), 'number'):
        answer = runtime.math.trunc(value)
    else:
        radix = 10 if base is runtime.undefined else base
        answer = runtime.parse_int(value, radix)
    if runtime.is_nan(answer):
        radix = 10 if base is runtime.undefined else base
        raise ValueError(
            'Invalid literal for int with base '
            + str(radix) + ': ' + str(value)
        )
    return answer


def ρσ_float(value: Any) -> Any:
    if _builtins_type_is(runtime.jstype(value), 'number'):
        answer = value
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
    if _builtins_type_is(runtime.jstype(value), 'string'):
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
            and _builtins_type_is(
                runtime.jstype(call_args[-1]), 'object')
        ):
            call_args[-1][runtime.kwargs_symbol] = True
        return target(*call_args)

    return wrapped


def ρσ_id(value: Any) -> Any:
    return value.ρσ_object_id


def ρσ_dir(item: Any) -> list[_Str]:
    answer = []
    current = item
    while current is not None:
        for name in runtime.object.keys(current):
            if name not in answer:
                answer.append(name)
        current = runtime.object.getPrototypeOf(current)
    return answer


def ρσ_ord(value: Any) -> _Int:
    answer = value.charCodeAt(0)
    if 0xD800 <= answer <= 0xDBFF:
        second = value.charCodeAt(1)
        if 0xDC00 <= second <= 0xDFFF:
            return (
                (answer - 0xD800) * 0x400
                + second - 0xDC00 + 0x10000
            )
        raise TypeError('string is missing the low surrogate char')
    return answer


def ρσ_chr(code: _Int) -> _Str:
    if code <= 0xFFFF:
        return runtime.string_class.fromCharCode(code)
    code -= 0x10000
    return runtime.string_class.fromCharCode(
        0xD800 + (code >> 10),
        0xDC00 + (code & 0x3FF),
    )


def ρσ_callable(value: Any) -> _Bool:
    return _builtins_type_is(runtime.jstype(value), 'function')


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


def ρσ_enumerate(iterable: Any) -> Iterator[list[Any]]:
    index = 0
    for value in iterable:
        yield [index, value]
        index += 1


def ρσ_reversed(iterable: Any) -> Iterator[Any]:
    if not ρσ_arraylike(iterable):
        raise TypeError(
            'reversed() can only be called on arrays or strings')
    index = iterable.length - 1
    while index >= 0:
        yield iterable[index]
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
    if _builtins_type_is(runtime.jstype(iterator_method), 'function'):
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


def ρσ_next(
    iterator: Any,
    fallback: Any = _BUILTINS_MISSING,
) -> Any:
    result = iterator.next()
    if not result.done:
        return result.value
    if fallback is not _BUILTINS_MISSING:
        return fallback
    raise StopIteration()


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
        elif _builtins_type_is(runtime.jstype(last), 'bigint'):
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
    if _builtins_has_member(value, name):
        return _builtins_get_member(value, name)
    if default_value is not _BUILTINS_MISSING:
        return default_value
    raise AttributeError('The attribute ' + name + ' is not present')


def ρσ_setattr(value: Any, name: _Str, member: Any) -> None:
    runtime.reflect.set(value, name, member)


def ρσ_hasattr(value: Any, name: _Str) -> _Bool:
    return _builtins_has_member(value, name)


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
    return runtime.object.keys(value).length


def ρσ_get_module(name: _Str) -> Any:
    return runtime.reflect.get(runtime.modules, name)


def ρσ_pow(
    left: Any,
    right: Any,
    modulus: Any = runtime.undefined,
) -> Any:
    answer = runtime.math.pow(left, right)
    if modulus is not runtime.undefined:
        answer %= modulus
    return answer


def ρσ_type(value: Any) -> Any:
    return _builtins_get_member(value, 'constructor')


def ρσ_divmod(left: Any, right: Any) -> tuple[Any, Any]:
    if runtime.equals(right, 0):
        raise runtime.zero_division_error(
            'integer division or modulo by zero')
    quotient = runtime.math.floor(runtime.native_div(left, right))
    return quotient, left - quotient * right


def ρσ_factor(value: Any) -> Any:
    if _builtins_member_is_function(value, 'factor'):
        return _builtins_call_member(value, 'factor', [])
    if _builtins_type_is(runtime.jstype(value), 'number'):
        if not runtime.number.isSafeInteger(value):
            raise TypeError(
                'factor() requires a safe integer; '
                'use a BigInt for larger values'
            )
        value = runtime.bigint(value)
    elif not _builtins_type_is(runtime.jstype(value), 'bigint'):
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
            _builtins_type_is(runtime.jstype(left), 'number')
            or _builtins_type_is(runtime.jstype(left), 'bigint')
        )
        and (
            _builtins_type_is(runtime.jstype(right), 'number')
            or _builtins_type_is(runtime.jstype(right), 'bigint')
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
    if _builtins_type_is(runtime.jstype(value), 'number'):
        if not runtime.number.isSafeInteger(value):
            raise TypeError('next_prime() requires an integer')
        value = runtime.bigint(value)
    elif not _builtins_type_is(runtime.jstype(value), 'bigint'):
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
ord = ρσ_ord
chr = ρσ_chr
bin = ρσ_bin
hex = ρσ_hex
callable = ρσ_callable
enumerate = ρσ_enumerate
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
