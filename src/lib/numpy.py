"""A small NumPy-compatible facade backed by :mod:`numpy-ts`.

This module intentionally owns the Python-visible semantics.  ``numpy-ts`` is
an implementation backend, not the public contract, so callers never receive
its raw ``NDArray`` objects.

The first vertical slice covers dense array construction, basic slicing and
views, mutation, element-wise arithmetic, reductions, matrix multiplication,
and determinants.  It is deliberately small enough that each additional
NumPy feature can be added together with a differential test.
"""

# Ruff 0.16's WASM build reports I001 while proposing this identical block.
# Keep the standard-library and Sage.js runtime imports visibly separated.
# ruff: noqa: I001

from __future__ import annotations

from typing import Any, Callable, Iterator

import sagejs.runtime as runtime


_backend = runtime.require_module('numpy-ts')
_native_ndarray = runtime.reflect.get(_backend, 'NDArray')
_native_linalg = runtime.reflect.get(_backend, 'linalg')


def _call(name: str, call_args: list[Any]) -> Any:
    function = runtime.reflect.get(_backend, name)
    return runtime.reflect.apply(function, _backend, call_args)


def _call_method(
    target: Any,
    name: str,
    call_args: list[Any],
) -> Any:
    function = runtime.reflect.get(target, name)
    return runtime.reflect.apply(function, target, call_args)


def _call_linalg(name: str, call_args: list[Any]) -> Any:
    function = runtime.reflect.get(_native_linalg, name)
    return runtime.reflect.apply(function, _native_linalg, call_args)


def _is_native_array(value: Any) -> bool:
    return runtime.instance_of(value, _native_ndarray)


def _native(value: Any) -> Any:
    if isinstance(value, ndarray):
        return value._value
    return value


def _native_array(value: Any) -> Any:
    if isinstance(value, ndarray):
        return value._value
    if _is_native_array(value):
        return value
    return _call('array', [value])


def _wrap(value: Any) -> Any:
    if _is_native_array(value):
        return ndarray(_native_value=value)
    return value


class dtype:
    """A NumPy-style data type descriptor."""

    def __init__(self, value: Any) -> None:
        if hasattr(value, '_numpy_dtype_name'):
            self._name = value._numpy_dtype_name
        elif value is bool:
            self._name = 'bool'
        elif value is int:
            self._name = 'int64'
        elif value is float:
            self._name = 'float64'
        else:
            self._name = str(value)
        self._numpy_dtype_name = self._name

    @property
    def name(self) -> str:
        return self._name

    def __repr__(self) -> str:
        return "dtype('" + self._name + "')"

    def __str__(self) -> str:
        return self._name

    def __eq__(self, other: object) -> bool:
        try:
            return self._name == dtype(other).name
        except (TypeError, ValueError):
            return False

    def __hash__(self) -> int:
        return hash(self._name)


class _ScalarType:

    def __init__(
        self,
        name: str,
        converter: Callable[[Any], Any],
    ) -> None:
        self._name = name
        self._numpy_dtype_name = name
        self._converter = converter

    @property
    def name(self) -> str:
        return self._name

    def __call__(self, value: Any = 0) -> Any:
        return self._converter(value)

    def __repr__(self) -> str:
        return "<class 'numpy." + self._name + "'>"

    def __str__(self) -> str:
        return "<class 'numpy." + self._name + "'>"


bool_ = _ScalarType('bool', bool)
int8 = _ScalarType('int8', int)
uint8 = _ScalarType('uint8', int)
int16 = _ScalarType('int16', int)
uint16 = _ScalarType('uint16', int)
int32 = _ScalarType('int32', int)
uint32 = _ScalarType('uint32', int)
int64 = _ScalarType('int64', int)
uint64 = _ScalarType('uint64', int)
float32 = _ScalarType('float32', float)
float64 = _ScalarType('float64', float)

# NumPy's platform integer is 64 bits on the supported Sage.js platforms.
int_ = int64
float_ = float64


def _dtype_name(value: Any) -> str | None:
    if value is None:
        return None
    return dtype(value).name


def _all_integral(value: Any) -> bool:
    if isinstance(value, (list, tuple)):
        for item in value:
            if not _all_integral(item):
                return False
        return True
    return isinstance(value, (bool, int))


def _all_boolean(value: Any) -> bool:
    if isinstance(value, (list, tuple)):
        for item in value:
            if not _all_boolean(item):
                return False
        return True
    return value is True or value is False


def _has_values(value: Any) -> bool:
    if isinstance(value, (list, tuple)):
        for item in value:
            if _has_values(item):
                return True
        return False
    return True


def _inferred_dtype(value: Any) -> str | None:
    if not _has_values(value):
        return None
    if _all_boolean(value):
        return 'bool'
    if _all_integral(value):
        return 'int64'
    return None


def _shape_list(shape: Any) -> list[Any]:
    if isinstance(shape, (list, tuple)):
        return [runtime.number(value) for value in shape]
    return [runtime.number(shape)]


def _slice_text(value: slice) -> str:
    start = '' if value.start is None else str(value.start)
    stop = '' if value.stop is None else str(value.stop)
    if value.step is None:
        return start + ':' + stop
    return start + ':' + stop + ':' + str(value.step)


def _selectors(
    index: Any,
    dimensions: int,
) -> tuple[list[Any], bool]:
    values = list(index) if isinstance(index, tuple) else [index]
    if Ellipsis in values:
        if values.count(Ellipsis) > 1:
            raise IndexError(
                'an index can only have a single ellipsis')
        position = values.index(Ellipsis)
        missing = dimensions - len(values) + 1
        if missing < 0:
            missing = 0
        values = (
            values[:position] + [slice(None)] * missing
            + values[position + 1:]
        )
    answer = []
    all_integers = True
    for value in values:
        if isinstance(value, slice):
            answer.append(_slice_text(value))
            all_integers = False
        elif value is None:
            raise NotImplementedError(
                'newaxis indexing is not implemented')
        else:
            answer.append(runtime.number(value))
    return answer, all_integers


def _python_values(value: Any, dtype_name: str) -> Any:
    if runtime.array.isArray(value):
        return [
            _python_values(item, dtype_name)
            for item in value
        ]
    if dtype_name == 'bool':
        return bool(value)
    return value


class ndarray:
    """A Python wrapper around a dense ``numpy-ts`` array."""

    def __init__(
        self,
        shape: Any = None,
        dtype: Any = float64,
        buffer: Any = None,
        offset: int = 0,
        strides: Any = None,
        order: str | None = None,
        _native_value: Any = None,
    ) -> None:
        if _native_value is not None:
            self._value = _native_value
            return
        if buffer is not None:
            raise NotImplementedError(
                'the ndarray buffer constructor is not implemented')
        self._value = _call(
            'zeros', [_shape_list(shape), _dtype_name(dtype)])

    @property
    def shape(self) -> tuple[int, ...]:
        return tuple(runtime.reflect.get(self._value, 'shape'))

    @property
    def ndim(self) -> int:
        return runtime.reflect.get(self._value, 'ndim')

    @property
    def size(self) -> int:
        return runtime.reflect.get(self._value, 'size')

    @property
    def dtype(self) -> dtype:
        return dtype(runtime.reflect.get(self._value, 'dtype'))

    @property
    def T(self) -> ndarray:
        return _wrap(runtime.reflect.get(self._value, 'T'))

    @property
    def base(self) -> ndarray | None:
        value = runtime.reflect.get(self._value, 'base')
        if value is None:
            return None
        return _wrap(value)

    def __repr__(self) -> str:
        text = _call('array_repr', [self._value])
        if self.dtype.name == 'int64':
            text = text.replace(", dtype='int64')", ')')
        else:
            text = text.replace("dtype='", 'dtype=')
            text = text.replace("')", ')')
        return text

    def __str__(self) -> str:
        return _call('array_str', [self._value])

    def __len__(self) -> int:
        if self.ndim == 0:
            raise TypeError('len() of unsized object')
        return self.shape[0]

    def __iter__(self) -> Iterator[Any]:
        for index in range(len(self)):
            yield self[index]

    def __bool__(self) -> bool:
        if self.size != 1:
            raise ValueError(
                'The truth value of an array with more than one element '
                'is ambiguous. Use a.any() or a.all()')
        return bool(self.item())

    def __getitem__(self, index: Any) -> Any:
        selectors, all_integers = _selectors(index, self.ndim)
        if all_integers and len(selectors) == self.ndim:
            value = _call_method(self._value, 'get', [selectors])
            return _python_values(value, self.dtype.name)
        slice_selectors = [str(value) for value in selectors]
        return _wrap(
            _call_method(self._value, 'slice', slice_selectors))

    def __setitem__(self, index: Any, value: Any) -> None:
        selectors, all_integers = _selectors(index, self.ndim)
        if all_integers and len(selectors) == self.ndim:
            _call_method(
                self._value, 'set', [selectors, _native(value)])
            return
        view = self[index]
        if not isinstance(view, ndarray):
            raise TypeError('cannot assign through a scalar selection')
        _call_method(view._value, 'fill', [_native(value)])

    def __add__(self, other: Any) -> ndarray:
        return _wrap(_call('add', [self._value, _native(other)]))

    def __radd__(self, other: Any) -> ndarray:
        return _wrap(_call('add', [self._value, _native(other)]))

    def __sub__(self, other: Any) -> ndarray:
        return _wrap(_call('subtract', [self._value, _native(other)]))

    def __rsub__(self, other: Any) -> ndarray:
        return _wrap(
            _call('subtract', [_native_array(other), self._value]))

    def __mul__(self, other: Any) -> ndarray:
        return _wrap(_call('multiply', [self._value, _native(other)]))

    def __rmul__(self, other: Any) -> ndarray:
        return _wrap(
            _call('multiply', [self._value, _native(other)]))

    def __truediv__(self, other: Any) -> ndarray:
        return _wrap(_call('true_divide', [self._value, _native(other)]))

    def __rtruediv__(self, other: Any) -> ndarray:
        return _wrap(
            _call('true_divide', [_native_array(other), self._value]))

    def __floordiv__(self, other: Any) -> ndarray:
        return _wrap(
            _call('floor_divide', [self._value, _native(other)]))

    def __pow__(self, other: Any) -> ndarray:
        return _wrap(_call('power', [self._value, _native(other)]))

    def __neg__(self) -> ndarray:
        return _wrap(_call('negative', [self._value]))

    def __matmul__(self, other: Any) -> ndarray:
        return _wrap(_call('matmul', [self._value, _native(other)]))

    def __rmatmul__(self, other: Any) -> ndarray:
        return _wrap(
            _call('matmul', [_native_array(other), self._value]))

    def __eq__(self, other: object) -> Any:
        return _wrap(_call('equal', [self._value, _native(other)]))

    def __ne__(self, other: object) -> Any:
        return _wrap(_call('not_equal', [self._value, _native(other)]))

    def __lt__(self, other: Any) -> ndarray:
        return _wrap(_call('less', [self._value, _native(other)]))

    def __le__(self, other: Any) -> ndarray:
        return _wrap(
            _call('less_equal', [self._value, _native(other)]))

    def __gt__(self, other: Any) -> ndarray:
        return _wrap(_call('greater', [self._value, _native(other)]))

    def __ge__(self, other: Any) -> ndarray:
        return _wrap(
            _call('greater_equal', [self._value, _native(other)]))

    def reshape(
        self,
        *shape: Any,
        order: str = 'C',
    ) -> ndarray:
        if order != 'C':
            raise NotImplementedError(
                'only C-order reshape is implemented')
        if len(shape) == 1 and isinstance(shape[0], (list, tuple)):
            shape = tuple(shape[0])
        return _wrap(
            _call('reshape', [self._value, _shape_list(shape)]))

    def transpose(self, *axes: Any) -> ndarray:
        if len(axes) == 0:
            return _wrap(_call('transpose', [self._value]))
        if len(axes) == 1 and isinstance(axes[0], (list, tuple)):
            axes = tuple(axes[0])
        return _wrap(
            _call('transpose', [self._value, _shape_list(axes)]))

    def sum(
        self,
        axis: Any = None,
        dtype: Any = None,
        out: Any = None,
        keepdims: bool = False,
        initial: Any = None,
        where: Any = True,
    ) -> Any:
        if out is not None:
            raise NotImplementedError('the out argument is not implemented')
        if dtype is not None:
            raise NotImplementedError(
                'the dtype reduction argument is not implemented')
        if initial is not None:
            raise NotImplementedError(
                'the initial reduction argument is not implemented')
        if where is not True:
            raise NotImplementedError(
                'the where reduction argument is not implemented')
        native_axis = runtime.undefined if axis is None else axis
        return _wrap(
            _call('sum', [self._value, native_axis, keepdims]))

    def item(self, *indices: Any) -> Any:
        value = _call_method(self._value, 'item', list(indices))
        return _python_values(value, self.dtype.name)

    def tolist(self) -> Any:
        values = _call_method(self._value, 'tolist', [])
        return _python_values(values, self.dtype.name)

    def copy(self, order: str = 'C') -> ndarray:
        if order not in ('C', 'K'):
            raise NotImplementedError(
                'only C-order copies are implemented')
        return _wrap(_call('copy', [self._value]))

    def astype(
        self,
        target_dtype: Any,
        order: str = 'K',
        casting: str = 'unsafe',
        subok: bool = True,
        copy: bool = True,
    ) -> ndarray:
        if order not in ('C', 'K'):
            raise NotImplementedError(
                'only C-order casts are implemented')
        return _wrap(_call_method(
            self._value, 'astype', [_dtype_name(target_dtype), copy]))


runtime.set_class_repr(dtype, "<class 'numpy.dtype'>")
runtime.set_class_repr(ndarray, "<class 'numpy.ndarray'>")


def array(
    value: Any,
    dtype: Any = None,
    copy: bool = True,
    order: str = 'K',
    subok: bool = False,
    ndmin: int = 0,
    like: Any = None,
) -> ndarray:
    if order not in ('C', 'K'):
        raise NotImplementedError(
            'only C-order arrays are implemented')
    if subok:
        raise NotImplementedError('subclasses are not implemented')
    if like is not None:
        raise NotImplementedError('the like argument is not implemented')
    if isinstance(value, ndarray):
        result = value.copy() if copy else value
        if dtype is not None and result.dtype != dtype:
            result = result.astype(dtype)
    else:
        if dtype is not None:
            dtype_name = _dtype_name(dtype)
        else:
            dtype_name = _inferred_dtype(value)
        call_args = [value]
        if dtype_name is not None:
            call_args.append(dtype_name)
        result = _wrap(_call('array', call_args))
    while result.ndim < ndmin:
        result = result.reshape((1,) + result.shape)
    return result


def asarray(
    value: Any,
    dtype: Any = None,
    order: str | None = None,
    like: Any = None,
) -> ndarray:
    if order not in (None, 'C', 'K'):
        raise NotImplementedError(
            'only C-order arrays are implemented')
    if like is not None:
        raise NotImplementedError('the like argument is not implemented')
    if isinstance(value, ndarray) and (
        dtype is None or value.dtype == dtype
    ):
        return value
    return array(value, dtype=dtype, copy=False)


def arange(
    start: Any,
    stop: Any = None,
    step: Any = 1,
    dtype: Any = None,
    like: Any = None,
) -> ndarray:
    if like is not None:
        raise NotImplementedError('the like argument is not implemented')
    if stop is None:
        stop = start
        start = 0
    dtype_name = _dtype_name(dtype)
    if dtype_name is None and all(
        isinstance(value, int) for value in (start, stop, step)
    ):
        dtype_name = 'int64'
    call_args = [
        runtime.number(start),
        runtime.number(stop),
        runtime.number(step),
    ]
    if dtype_name is not None:
        call_args.append(dtype_name)
    return _wrap(_call('arange', call_args))


def zeros(
    shape: Any,
    dtype: Any = float64,
    order: str = 'C',
    like: Any = None,
) -> ndarray:
    if order != 'C':
        raise NotImplementedError(
            'only C-order arrays are implemented')
    if like is not None:
        raise NotImplementedError('the like argument is not implemented')
    return _wrap(
        _call('zeros', [_shape_list(shape), _dtype_name(dtype)]))


def ones(
    shape: Any,
    dtype: Any = float64,
    order: str = 'C',
    like: Any = None,
) -> ndarray:
    if order != 'C':
        raise NotImplementedError(
            'only C-order arrays are implemented')
    if like is not None:
        raise NotImplementedError('the like argument is not implemented')
    return _wrap(
        _call('ones', [_shape_list(shape), _dtype_name(dtype)]))


def reshape(
    a: Any,
    newshape: Any,
    order: str = 'C',
) -> ndarray:
    return asarray(a).reshape(newshape, order=order)


def sum(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return asarray(a).sum(
        axis=axis,
        dtype=dtype,
        out=out,
        keepdims=keepdims,
        initial=initial,
        where=where,
    )


def add(left: Any, right: Any) -> Any:
    if isinstance(left, ndarray):
        return left + right
    if isinstance(right, ndarray):
        return right + left
    return _wrap(_call(
        'add', [_native_array(left), _native(right)]))


def subtract(left: Any, right: Any) -> ndarray:
    return _wrap(_call(
        'subtract', [_native_array(left), _native(right)]))


def multiply(left: Any, right: Any) -> Any:
    if isinstance(left, ndarray):
        return left * right
    if isinstance(right, ndarray):
        return right * left
    return _wrap(_call(
        'multiply', [_native_array(left), _native(right)]))


def matmul(left: Any, right: Any) -> ndarray:
    return _wrap(_call(
        'matmul', [_native_array(left), _native_array(right)]))


class _Linalg:

    def det(self, a: Any) -> Any:
        return _wrap(_call_linalg('det', [_native(asarray(a))]))


linalg = _Linalg()
