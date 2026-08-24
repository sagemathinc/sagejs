"""A broad NumPy-compatible facade backed by `numpy-ts`.

This module intentionally owns the Python-visible semantics.  `numpy-ts` is
an implementation backend, not the public contract, so callers never receive
its raw `NDArray` objects.

The browser tier covers dense numeric arrays, ufuncs, reductions and
statistics, shape manipulation, sorting and selection, linear algebra, and
FFT operations.  `numpy-ts` filesystem APIs, object and structured dtypes,
memory mapping, and Python extension protocols are intentionally not exposed.
"""

# Ruff 0.16's WASM build reports I001 while proposing this identical block.
# Keep the standard-library and Sage.js runtime imports visibly separated.
# ruff: noqa: I001

from __future__ import annotations

from typing import Any, Callable, Iterator

import sagejs.runtime as runtime


_backend = runtime.require_module("numpy-ts")
_native_ndarray = runtime.reflect.get(_backend, "NDArray")
_native_ndarray_core = runtime.reflect.get(_backend, "NDArrayCore")
_native_complex = runtime.reflect.get(_backend, "Complex")
_native_linalg = runtime.reflect.get(_backend, "linalg")
_native_fft = runtime.reflect.get(_backend, "fft")
_native_random = runtime.reflect.get(_backend, "random")
_parameter_v = chr(118)
_array_wrappers = runtime.reflect.construct(
    runtime.reflect.get(runtime.global_object, "WeakMap"), []
)


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


def _call_fft(name: str, call_args: list[Any]) -> Any:
    function = runtime.reflect.get(_native_fft, name)
    return runtime.reflect.apply(function, _native_fft, call_args)


def _call_random(name: str, call_args: list[Any]) -> Any:
    function = runtime.reflect.get(_native_random, name)
    return runtime.reflect.apply(function, _native_random, call_args)


def _is_native_array(value: Any) -> bool:
    return runtime.instance_of(value, _native_ndarray) or runtime.instance_of(
        value, _native_ndarray_core
    )


def _is_ndarray_wrapper(value: Any) -> bool:
    return isinstance(value, ndarray) or (
        hasattr(value, "_value") and hasattr(value, "shape") and hasattr(value, "ndim")
    )


def _native(value: Any) -> Any:
    if _is_ndarray_wrapper(value):
        return value._value
    return value


def _native_operand(value: Any) -> Any:
    if _is_ndarray_wrapper(value):
        return value._value
    if _is_native_array(value):
        return value
    if isinstance(value, (list, tuple)):
        return _native_array(value)
    if isinstance(value, complex):
        return runtime.reflect.construct(
            _native_complex,
            [runtime.number(value.real), runtime.number(value.imag)],
        )
    if runtime.jstype(value) == "object" and hasattr(value, "__float__"):
        return float(value)
    return value


def _native_array(value: Any) -> Any:
    if _is_ndarray_wrapper(value):
        return value._value
    if _is_native_array(value):
        return value
    call_args = [value]
    inferred = _inferred_dtype(value)
    if inferred is not None:
        call_args.append(inferred)
    return _call("array", call_args)


def _wrap(value: Any) -> Any:
    if _is_native_array(value):
        cached = _call_method(_array_wrappers, "get", [value])
        if cached is not runtime.undefined:
            return cached
        answer = ndarray(_native_value=value)
        _call_method(_array_wrappers, "set", [value, answer])
        return answer
    if runtime.instance_of(value, _native_complex):
        return complex(
            runtime.reflect.get(value, "re"),
            runtime.reflect.get(value, "im"),
        )
    return value


def _wrap_result(value: Any) -> Any:
    if _is_native_array(value) or runtime.instance_of(value, _native_complex):
        return _wrap(value)
    if runtime.array.isArray(value):
        return tuple(_wrap_result(item) for item in value)
    return value


def _required_backend(name: str) -> Any:
    value = runtime.reflect.get(_backend, name)
    if value is runtime.undefined:
        raise NotImplementedError("numpy-ts does not provide numpy." + name)
    return value


class _BackendFunction:
    """Bind a family of Python calls to one `numpy-ts` function."""

    def __init__(
        self,
        name: str,
        parameters: tuple[str, ...],
        required: int,
        array_arguments: tuple[int, ...] = (),
        array_sequences: tuple[int, ...] = (),
        shape_arguments: tuple[int, ...] = (),
        dtype_arguments: tuple[int, ...] = (),
    ) -> None:
        _required_backend(name)
        self._name = name
        self._parameters = parameters
        self._required = required
        self._array_arguments = array_arguments
        self._array_sequences = array_sequences
        self._shape_arguments = shape_arguments
        self._dtype_arguments = dtype_arguments

    def __repr__(self) -> str:
        return "<function numpy." + self._name + ">"

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        if len(args) > len(self._parameters):
            raise TypeError(
                self._name
                + "() takes at most "
                + str(len(self._parameters))
                + " arguments"
            )
        values = list(args)
        for key, value in kwargs.items():
            if key not in self._parameters:
                raise TypeError(
                    self._name + "() got an unexpected keyword argument '" + key + "'"
                )
            position = self._parameters.index(key)
            if position < len(args):
                raise TypeError(
                    self._name + "() got multiple values for argument '" + key + "'"
                )
            while len(values) <= position:
                values.append(None)
            values[position] = value
        if len(values) < self._required:
            missing = self._parameters[len(values)]
            raise TypeError(
                self._name + "() missing required argument '" + missing + "'"
            )
        if "out" in self._parameters:
            position = self._parameters.index("out")
            if (
                position < len(values)
                and values[position] is not None
                and values[position] is not runtime.undefined
            ):
                raise NotImplementedError("the out argument is not implemented")
        if "where" in self._parameters:
            position = self._parameters.index("where")
            if (
                position < len(values)
                and values[position] is not None
                and values[position] is not runtime.undefined
                and values[position] is not True
            ):
                raise NotImplementedError("the where argument is not implemented")
        for position in self._array_arguments:
            if position < len(values) and values[position] is not runtime.undefined:
                values[position] = _native_operand(values[position])
        for position in self._array_sequences:
            if position < len(values) and values[position] is not runtime.undefined:
                values[position] = [_native_array(item) for item in values[position]]
        for position in self._shape_arguments:
            if position < len(values) and values[position] is not runtime.undefined:
                values[position] = _shape_list(values[position])
        for position in self._dtype_arguments:
            if position < len(values) and values[position] is not runtime.undefined:
                values[position] = _dtype_name(values[position])
        for position, value in enumerate(values):
            if value is None:
                values[position] = runtime.undefined
        return _wrap_result(_call(self._name, values))


class _LinalgFunction(_BackendFunction):
    def __init__(
        self,
        name: str,
        parameters: tuple[str, ...],
        required: int,
        array_arguments: tuple[int, ...] = (),
        array_sequences: tuple[int, ...] = (),
        **kwargs: Any,
    ) -> None:
        if runtime.reflect.get(_native_linalg, name) is runtime.undefined:
            raise NotImplementedError("numpy-ts does not provide numpy.linalg." + name)
        self._name = name
        self._parameters = parameters
        self._required = required
        self._array_arguments = array_arguments
        self._array_sequences = array_sequences
        self._shape_arguments = ()
        self._dtype_arguments = ()

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        values = self._bound_values(args, kwargs)
        return _wrap_result(_call_linalg(self._name, values))

    def _bound_values(self, args: tuple[Any, ...], kwargs: dict[str, Any]) -> list[Any]:
        if len(args) > len(self._parameters):
            raise TypeError(self._name + "() received too many arguments")
        values = list(args)
        for key, value in kwargs.items():
            if key not in self._parameters:
                raise TypeError(
                    self._name + "() got an unexpected keyword argument '" + key + "'"
                )
            position = self._parameters.index(key)
            if position < len(args):
                raise TypeError(
                    self._name + "() got multiple values for argument '" + key + "'"
                )
            while len(values) <= position:
                values.append(None)
            values[position] = value
        if len(values) < self._required:
            raise TypeError(self._name + "() is missing a required argument")
        for position in self._array_arguments:
            if position < len(values):
                values[position] = _native_array(values[position])
        for position in self._array_sequences:
            if position < len(values):
                values[position] = [_native_array(item) for item in values[position]]
        for position, value in enumerate(values):
            if value is None:
                values[position] = runtime.undefined
        return values


class _TupleLinalgFunction(_LinalgFunction):
    def __init__(self, *args: Any, result_keys: tuple[str, ...], **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._result_keys = result_keys

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        value = _call_linalg(self._name, self._bound_values(args, kwargs))
        if _is_native_array(value):
            return _wrap(value)
        return tuple(
            _wrap_result(runtime.reflect.get(value, key)) for key in self._result_keys
        )


class dtype:
    """A NumPy-style data type descriptor."""

    def __init__(self, value: Any) -> None:
        if hasattr(value, "_numpy_dtype_name"):
            self._name = value._numpy_dtype_name
        elif value is bool:
            self._name = "bool"
        elif value is int:
            self._name = "int64"
        elif value is float:
            self._name = "float64"
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


bool_ = _ScalarType("bool", bool)
int8 = _ScalarType("int8", int)
uint8 = _ScalarType("uint8", int)
int16 = _ScalarType("int16", int)
uint16 = _ScalarType("uint16", int)
int32 = _ScalarType("int32", int)
uint32 = _ScalarType("uint32", int)
int64 = _ScalarType("int64", int)
uint64 = _ScalarType("uint64", int)
float32 = _ScalarType("float32", float)
float64 = _ScalarType("float64", float)
complex64 = _ScalarType("complex64", complex)
complex128 = _ScalarType("complex128", complex)

# NumPy's platform integer is 64 bits on the supported Sage.js platforms.
int_ = int64
float_ = float64
complex_ = complex128
newaxis = None
pi = 3.141592653589793
e = 2.718281828459045
inf = float("inf")
nan = float("nan")


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
        return "bool"
    if _all_integral(value):
        return "int64"
    return None


def _shape_list(shape: Any) -> list[Any]:
    if isinstance(shape, (list, tuple)):
        return [runtime.number(value) for value in shape]
    return [runtime.number(shape)]


def _slice_text(value: slice) -> str:
    start = "" if value.start is None else str(value.start)
    stop = "" if value.stop is None else str(value.stop)
    if value.step is None:
        return start + ":" + stop
    return start + ":" + stop + ":" + str(value.step)


def _consumed_dimensions(values: list[Any]) -> int:
    count = 0
    for value in values:
        if value is not None and value is not Ellipsis:
            count += 1
    return count


def _selectors(
    index: Any,
    dimensions: int,
) -> tuple[list[Any], list[int], bool]:
    values = list(index) if isinstance(index, tuple) else [index]
    if Ellipsis in values:
        if values.count(Ellipsis) > 1:
            raise IndexError("an index can only have a single ellipsis")
        position = values.index(Ellipsis)
        consumed = _consumed_dimensions(values)
        missing = dimensions - consumed
        if missing < 0:
            raise IndexError(
                "too many indices for array: array is "
                + str(dimensions)
                + "-dimensional"
            )
        values = values[:position] + [slice(None)] * missing + values[position + 1 :]
    elif _consumed_dimensions(values) > dimensions:
        raise IndexError(
            "too many indices for array: array is " + str(dimensions) + "-dimensional"
        )
    answer = []
    new_axes = []
    result_axis = 0
    all_integers = True
    for value in values:
        if isinstance(value, slice):
            answer.append(_slice_text(value))
            result_axis += 1
            all_integers = False
        elif value is None:
            new_axes.append(result_axis)
            result_axis += 1
            all_integers = False
        else:
            answer.append(runtime.number(value))
    scalar = all_integers and len(answer) == dimensions
    return answer, new_axes, scalar


def _python_values(value: Any, dtype_name: str) -> Any:
    if runtime.array.isArray(value):
        return [_python_values(item, dtype_name) for item in value]
    if dtype_name == "bool":
        return bool(value)
    if dtype_name in ("complex64", "complex128"):
        return _wrap(value)
    return value


def _optional(value: Any) -> Any:
    return runtime.undefined if value is None else value


def _check_reduction_options(
    dtype: Any = None,
    out: Any = None,
    initial: Any = None,
    where: Any = True,
) -> None:
    if dtype is not None:
        raise NotImplementedError("the dtype reduction argument is not implemented")
    if out is not None:
        raise NotImplementedError("the out argument is not implemented")
    if initial is not None:
        raise NotImplementedError("the initial reduction argument is not implemented")
    if where is not True:
        raise NotImplementedError("the where reduction argument is not implemented")


class ndarray:
    """A Python wrapper around a dense `numpy-ts` array."""

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
            _call_method(_array_wrappers, "set", [_native_value, self])
            return
        if buffer is not None:
            raise NotImplementedError(
                "the ndarray buffer constructor is not implemented"
            )
        self._value = _call("zeros", [_shape_list(shape), _dtype_name(dtype)])
        _call_method(_array_wrappers, "set", [self._value, self])

    @property
    def shape(self) -> tuple[int, ...]:
        return tuple(runtime.reflect.get(self._value, "shape"))

    @property
    def ndim(self) -> int:
        return runtime.reflect.get(self._value, "ndim")

    @property
    def size(self) -> int:
        return runtime.reflect.get(self._value, "size")

    @property
    def itemsize(self) -> int:
        return runtime.reflect.get(self._value, "itemsize")

    @property
    def nbytes(self) -> int:
        return runtime.reflect.get(self._value, "nbytes")

    @property
    def dtype(self) -> dtype:
        return dtype(runtime.reflect.get(self._value, "dtype"))

    @property
    def T(self) -> ndarray:
        return _wrap(runtime.reflect.get(self._value, "T"))

    @property
    def base(self) -> ndarray | None:
        value = runtime.reflect.get(self._value, "base")
        if value is None:
            return None
        return _wrap(value)

    def __repr__(self) -> str:
        text = _call("array_repr", [self._value])
        if self.dtype.name == "int64":
            text = text.replace(", dtype='int64')", ")")
        else:
            text = text.replace("dtype='", "dtype=")
            text = text.replace("')", ")")
        return text

    def __str__(self) -> str:
        return _call("array_str", [self._value])

    def __len__(self) -> int:
        if self.ndim == 0:
            raise TypeError("len() of unsized object")
        return self.shape[0]

    def __iter__(self) -> Iterator[Any]:
        for index in range(len(self)):
            yield self[index]

    def __bool__(self) -> bool:
        if self.size != 1:
            raise ValueError(
                "The truth value of an array with more than one element "
                "is ambiguous. Use a.any() or a.all()"
            )
        return bool(self.item())

    def __getitem__(self, index: Any) -> Any:
        selectors, _new_axes, scalar = _selectors(index, self.ndim)
        if scalar:
            value = _call_method(self._value, "get", [selectors])
            return _python_values(value, self.dtype.name)
        return self._basic_view(index)

    def _basic_view(self, index: Any) -> ndarray:
        selectors, new_axes, _scalar = _selectors(index, self.ndim)
        slice_selectors = [str(value) for value in selectors]
        value = _call_method(self._value, "slice", slice_selectors)
        for axis in new_axes:
            value = _call("expand_dims", [value, axis])
        return _wrap(value)

    def __setitem__(self, index: Any, value: Any) -> None:
        selectors, _new_axes, scalar = _selectors(index, self.ndim)
        if scalar:
            _call_method(self._value, "set", [selectors, _native(value)])
            return
        view = self[index]
        if not isinstance(view, ndarray):
            raise TypeError("cannot assign through a scalar selection")
        _call_method(view._value, "fill", [_native(value)])

    def __add__(self, other: Any) -> ndarray:
        return _wrap(_call("add", [self._value, _native(other)]))

    def __radd__(self, other: Any) -> ndarray:
        return _wrap(_call("add", [self._value, _native(other)]))

    def __sub__(self, other: Any) -> ndarray:
        return _wrap(_call("subtract", [self._value, _native(other)]))

    def __rsub__(self, other: Any) -> ndarray:
        return _wrap(_call("subtract", [_native_array(other), self._value]))

    def __mul__(self, other: Any) -> ndarray:
        return _wrap(_call("multiply", [self._value, _native(other)]))

    def __rmul__(self, other: Any) -> ndarray:
        return _wrap(_call("multiply", [self._value, _native(other)]))

    def __truediv__(self, other: Any) -> ndarray:
        return _wrap(_call("true_divide", [self._value, _native(other)]))

    def __rtruediv__(self, other: Any) -> ndarray:
        return _wrap(_call("true_divide", [_native_array(other), self._value]))

    def __floordiv__(self, other: Any) -> ndarray:
        return _wrap(_call("floor_divide", [self._value, _native(other)]))

    def __pow__(self, other: Any) -> ndarray:
        return _wrap(_call("power", [self._value, _native(other)]))

    def __mod__(self, other: Any) -> ndarray:
        return _wrap(_call("remainder", [self._value, _native_operand(other)]))

    def __rmod__(self, other: Any) -> ndarray:
        return _wrap(_call("remainder", [_native_array(other), self._value]))

    def __and__(self, other: Any) -> ndarray:
        return _wrap(_call("bitwise_and", [self._value, _native_operand(other)]))

    def __or__(self, other: Any) -> ndarray:
        return _wrap(_call("bitwise_or", [self._value, _native_operand(other)]))

    def __xor__(self, other: Any) -> ndarray:
        return _wrap(_call("bitwise_xor", [self._value, _native_operand(other)]))

    def __invert__(self) -> ndarray:
        return _wrap(_call("invert", [self._value]))

    def __abs__(self) -> ndarray:
        return _wrap(_call("absolute", [self._value]))

    def __pos__(self) -> ndarray:
        return _wrap(_call("positive", [self._value]))

    def __neg__(self) -> ndarray:
        return _wrap(_call("negative", [self._value]))

    def __matmul__(self, other: Any) -> ndarray:
        return _wrap(_call("matmul", [self._value, _native(other)]))

    def __rmatmul__(self, other: Any) -> ndarray:
        return _wrap(_call("matmul", [_native_array(other), self._value]))

    def __eq__(self, other: object) -> Any:
        return _wrap(_call("equal", [self._value, _native(other)]))

    def __ne__(self, other: object) -> Any:
        return _wrap(_call("not_equal", [self._value, _native(other)]))

    def __lt__(self, other: Any) -> ndarray:
        return _wrap(_call("less", [self._value, _native(other)]))

    def __le__(self, other: Any) -> ndarray:
        return _wrap(_call("less_equal", [self._value, _native(other)]))

    def __gt__(self, other: Any) -> ndarray:
        return _wrap(_call("greater", [self._value, _native(other)]))

    def __ge__(self, other: Any) -> ndarray:
        return _wrap(_call("greater_equal", [self._value, _native(other)]))

    def reshape(
        self,
        *shape: Any,
        order: str = "C",
    ) -> ndarray:
        if order != "C":
            raise NotImplementedError("only C-order reshape is implemented")
        if len(shape) == 1 and isinstance(shape[0], (list, tuple)):
            shape = tuple(shape[0])
        return _wrap(_call_method(self._value, "reshape", _shape_list(shape)))

    def transpose(self, *axes: Any) -> ndarray:
        if len(axes) == 0:
            return _wrap(_call("transpose", [self._value]))
        if len(axes) == 1 and isinstance(axes[0], (list, tuple)):
            axes = tuple(axes[0])
        return _wrap(_call("transpose", [self._value, _shape_list(axes)]))

    def squeeze(self, axis: Any = None) -> ndarray:
        return squeeze(self, axis=axis)

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
            raise NotImplementedError("the out argument is not implemented")
        if dtype is not None:
            raise NotImplementedError("the dtype reduction argument is not implemented")
        if initial is not None:
            raise NotImplementedError(
                "the initial reduction argument is not implemented"
            )
        if where is not True:
            raise NotImplementedError("the where reduction argument is not implemented")
        native_axis = runtime.undefined if axis is None else axis
        return _wrap(_call("sum", [self._value, native_axis, keepdims]))

    def mean(
        self,
        axis: Any = None,
        dtype: Any = None,
        out: Any = None,
        keepdims: bool = False,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(dtype=dtype, out=out, where=where)
        return _wrap_result(_call("mean", [self._value, _optional(axis), keepdims]))

    def prod(
        self,
        axis: Any = None,
        dtype: Any = None,
        out: Any = None,
        keepdims: bool = False,
        initial: Any = None,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(dtype=dtype, out=out, initial=initial, where=where)
        return _wrap_result(_call("prod", [self._value, _optional(axis), keepdims]))

    def min(
        self,
        axis: Any = None,
        out: Any = None,
        keepdims: bool = False,
        initial: Any = None,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(out=out, initial=initial, where=where)
        return _wrap_result(_call("min", [self._value, _optional(axis), keepdims]))

    def max(
        self,
        axis: Any = None,
        out: Any = None,
        keepdims: bool = False,
        initial: Any = None,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(out=out, initial=initial, where=where)
        return _wrap_result(_call("max", [self._value, _optional(axis), keepdims]))

    def argmin(self, axis: Any = None, out: Any = None, keepdims: bool = False) -> Any:
        if out is not None:
            raise NotImplementedError("the out argument is not implemented")
        value = _call("argmin", [self._value, _optional(axis), keepdims])
        return _wrap_result(value)

    def argmax(self, axis: Any = None, out: Any = None, keepdims: bool = False) -> Any:
        if out is not None:
            raise NotImplementedError("the out argument is not implemented")
        value = _call("argmax", [self._value, _optional(axis), keepdims])
        return _wrap_result(value)

    def all(
        self,
        axis: Any = None,
        out: Any = None,
        keepdims: bool = False,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(out=out, where=where)
        return _wrap_result(_call("all", [self._value, _optional(axis), keepdims]))

    def any(
        self,
        axis: Any = None,
        out: Any = None,
        keepdims: bool = False,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(out=out, where=where)
        return _wrap_result(_call("any", [self._value, _optional(axis), keepdims]))

    def std(
        self,
        axis: Any = None,
        dtype: Any = None,
        out: Any = None,
        ddof: int = 0,
        keepdims: bool = False,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(dtype=dtype, out=out, where=where)
        return _wrap_result(
            _call("std", [self._value, _optional(axis), ddof, keepdims])
        )

    def var(
        self,
        axis: Any = None,
        dtype: Any = None,
        out: Any = None,
        ddof: int = 0,
        keepdims: bool = False,
        where: Any = True,
    ) -> Any:
        _check_reduction_options(dtype=dtype, out=out, where=where)
        return _wrap_result(
            _call("var", [self._value, _optional(axis), ddof, keepdims])
        )

    def cumsum(self, axis: Any = None, dtype: Any = None, out: Any = None) -> ndarray:
        _check_reduction_options(dtype=dtype, out=out)
        return _wrap(_call("cumsum", [self._value, _optional(axis)]))

    def cumprod(self, axis: Any = None, dtype: Any = None, out: Any = None) -> ndarray:
        _check_reduction_options(dtype=dtype, out=out)
        return _wrap(_call("cumprod", [self._value, _optional(axis)]))

    def sort(self, axis: int = -1, kind: Any = None, order: Any = None) -> None:
        if kind is not None or order is not None:
            raise NotImplementedError("sort kind and field order are not implemented")
        self._value = _call("sort", [self._value, axis])
        _call_method(_array_wrappers, "set", [self._value, self])

    def argsort(self, axis: int = -1, kind: Any = None, order: Any = None) -> ndarray:
        if kind is not None or order is not None:
            raise NotImplementedError("sort kind and field order are not implemented")
        return _wrap(_call("argsort", [self._value, axis]))

    def ravel(self, order: str = "C") -> ndarray:
        if order not in ("C", "K"):
            raise NotImplementedError("only C-order ravel is implemented")
        return _wrap(_call_method(self._value, "ravel", []))

    def flatten(self, order: str = "C") -> ndarray:
        if order not in ("C", "K"):
            raise NotImplementedError("only C-order flatten is implemented")
        return _wrap(_call_method(self._value, "flatten", []))

    def nonzero(self) -> tuple[ndarray, ...]:
        return _wrap_result(_call("nonzero", [self._value]))

    def take(
        self, indices: Any, axis: Any = None, out: Any = None, mode: str = "raise"
    ) -> ndarray:
        if out is not None or mode != "raise":
            raise NotImplementedError(
                "take out and non-raise modes are not implemented"
            )
        return _wrap(_call("take", [self._value, indices, _optional(axis)]))

    def repeat(self, repeats: Any, axis: Any = None) -> ndarray:
        return _wrap(_call("repeat", [self._value, repeats, _optional(axis)]))

    def diagonal(self, offset: int = 0, axis1: int = 0, axis2: int = 1) -> ndarray:
        return _wrap(_call("diagonal", [self._value, offset, axis1, axis2]))

    def trace(
        self,
        offset: int = 0,
        axis1: int = 0,
        axis2: int = 1,
        dtype: Any = None,
        out: Any = None,
    ) -> Any:
        _check_reduction_options(dtype=dtype, out=out)
        return _wrap_result(_call("trace", [self._value, offset, axis1, axis2]))

    def clip(
        self, min: Any = None, max: Any = None, out: Any = None, **kwargs: Any
    ) -> ndarray:
        if out is not None or kwargs:
            raise NotImplementedError("clip out and extra options are not implemented")
        return _wrap(
            _call("clip", [self._value, _native_operand(min), _native_operand(max)])
        )

    def round(self, decimals: int = 0, out: Any = None) -> ndarray:
        if out is not None:
            raise NotImplementedError("the out argument is not implemented")
        return _wrap(_call("around", [self._value, decimals]))

    def item(self, *indices: Any) -> Any:
        value = _call_method(self._value, "item", list(indices))
        return _python_values(value, self.dtype.name)

    def tolist(self) -> Any:
        values = _call_method(self._value, "tolist", [])
        return _python_values(values, self.dtype.name)

    def copy(self, order: str = "C") -> ndarray:
        if order not in ("C", "K"):
            raise NotImplementedError("only C-order copies are implemented")
        return _wrap(_call("copy", [self._value]))

    def astype(
        self,
        target_dtype: Any,
        order: str = "K",
        casting: str = "unsafe",
        subok: bool = True,
        copy: bool = True,
    ) -> ndarray:
        if order not in ("C", "K"):
            raise NotImplementedError("only C-order casts are implemented")
        return _wrap(
            _call_method(self._value, "astype", [_dtype_name(target_dtype), copy])
        )


runtime.set_class_repr(dtype, "<class 'numpy.dtype'>")
runtime.set_class_repr(ndarray, "<class 'numpy.ndarray'>")


def array(
    value: Any,
    dtype: Any = None,
    copy: bool = True,
    order: str = "K",
    subok: bool = False,
    ndmin: int = 0,
    like: Any = None,
) -> ndarray:
    if order not in ("C", "K"):
        raise NotImplementedError("only C-order arrays are implemented")
    if subok:
        raise NotImplementedError("subclasses are not implemented")
    if like is not None:
        raise NotImplementedError("the like argument is not implemented")
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
        result = _wrap(_call("array", call_args))
    while result.ndim < ndmin:
        result = result.reshape((1,) + result.shape)
    return result


def asarray(
    value: Any,
    dtype: Any = None,
    order: str | None = None,
    like: Any = None,
) -> ndarray:
    if order not in (None, "C", "K"):
        raise NotImplementedError("only C-order arrays are implemented")
    if like is not None:
        raise NotImplementedError("the like argument is not implemented")
    if isinstance(value, ndarray) and (dtype is None or value.dtype == dtype):
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
        raise NotImplementedError("the like argument is not implemented")
    if stop is None:
        stop = start
        start = 0
    dtype_name = _dtype_name(dtype)
    if dtype_name is None and all(
        isinstance(value, int) for value in (start, stop, step)
    ):
        dtype_name = "int64"
    call_args = [
        runtime.number(start),
        runtime.number(stop),
        runtime.number(step),
    ]
    if dtype_name is not None:
        call_args.append(dtype_name)
    return _wrap(_call("arange", call_args))


def zeros(
    shape: Any,
    dtype: Any = float64,
    order: str = "C",
    like: Any = None,
) -> ndarray:
    if order != "C":
        raise NotImplementedError("only C-order arrays are implemented")
    if like is not None:
        raise NotImplementedError("the like argument is not implemented")
    return _wrap(_call("zeros", [_shape_list(shape), _dtype_name(dtype)]))


def ones(
    shape: Any,
    dtype: Any = float64,
    order: str = "C",
    like: Any = None,
) -> ndarray:
    if order != "C":
        raise NotImplementedError("only C-order arrays are implemented")
    if like is not None:
        raise NotImplementedError("the like argument is not implemented")
    return _wrap(_call("ones", [_shape_list(shape), _dtype_name(dtype)]))


def empty(
    shape: Any,
    dtype: Any = float64,
    order: str = "C",
    like: Any = None,
) -> ndarray:
    if order != "C" or like is not None:
        raise NotImplementedError("only ordinary C-order arrays are implemented")
    return _wrap(_call("empty", [_shape_list(shape), _dtype_name(dtype)]))


def full(
    shape: Any,
    fill_value: Any,
    dtype: Any = None,
    order: str = "C",
    like: Any = None,
) -> ndarray:
    if order != "C" or like is not None:
        raise NotImplementedError("only ordinary C-order arrays are implemented")
    call_args = [_shape_list(shape), _native_operand(fill_value)]
    if dtype is not None:
        call_args.append(_dtype_name(dtype))
    return _wrap(_call("full", call_args))


def empty_like(
    prototype: Any,
    dtype: Any = None,
    order: str = "K",
    subok: bool = True,
    shape: Any = None,
) -> ndarray:
    return _like_array("empty_like", prototype, dtype, order, subok, shape)


def zeros_like(
    prototype: Any,
    dtype: Any = None,
    order: str = "K",
    subok: bool = True,
    shape: Any = None,
) -> ndarray:
    return _like_array("zeros_like", prototype, dtype, order, subok, shape)


def ones_like(
    prototype: Any,
    dtype: Any = None,
    order: str = "K",
    subok: bool = True,
    shape: Any = None,
) -> ndarray:
    return _like_array("ones_like", prototype, dtype, order, subok, shape)


def full_like(
    prototype: Any,
    fill_value: Any,
    dtype: Any = None,
    order: str = "K",
    subok: bool = True,
    shape: Any = None,
) -> ndarray:
    if shape is not None:
        return full(shape, fill_value, dtype=dtype)
    if order not in ("C", "K") or not subok:
        raise NotImplementedError("only ordinary C-order arrays are implemented")
    call_args = [_native_array(prototype), _native_operand(fill_value)]
    if dtype is not None:
        call_args.append(_dtype_name(dtype))
    return _wrap(_call("full_like", call_args))


def _like_array(
    name: str,
    prototype: Any,
    target_dtype: Any,
    order: str,
    subok: bool,
    shape: Any,
) -> ndarray:
    if shape is not None:
        constructor = {"empty_like": empty, "zeros_like": zeros, "ones_like": ones}[
            name
        ]
        return constructor(shape, dtype=target_dtype or asarray(prototype).dtype)
    if order not in ("C", "K") or not subok:
        raise NotImplementedError("only ordinary C-order arrays are implemented")
    call_args = [_native_array(prototype)]
    if target_dtype is not None:
        call_args.append(_dtype_name(target_dtype))
    return _wrap(_call(name, call_args))


def eye(
    N: int,
    M: int | None = None,
    k: int = 0,
    dtype: Any = float64,
    order: str = "C",
    like: Any = None,
) -> ndarray:
    if order != "C" or like is not None:
        raise NotImplementedError("only ordinary C-order arrays are implemented")
    return _wrap(_call("eye", [runtime.number(N), _optional(M), k, _dtype_name(dtype)]))


def identity(n: int, dtype: Any = float64, like: Any = None) -> ndarray:
    if like is not None:
        raise NotImplementedError("the like argument is not implemented")
    return _wrap(_call("identity", [runtime.number(n), _dtype_name(dtype)]))


def logspace(
    start: Any,
    stop: Any,
    num: int = 50,
    endpoint: bool = True,
    base: float = 10.0,
    dtype: Any = None,
    axis: int = 0,
) -> ndarray:
    if axis != 0:
        raise NotImplementedError("only axis=0 is implemented")
    if not endpoint and num > 0:
        stop = start + (stop - start) * (num - 1) / num
    call_args = [
        runtime.number(start),
        runtime.number(stop),
        runtime.number(num),
        runtime.number(base),
    ]
    if dtype is not None:
        call_args.append(_dtype_name(dtype))
    return _wrap(_call("logspace", call_args))


def geomspace(
    start: Any,
    stop: Any,
    num: int = 50,
    endpoint: bool = True,
    dtype: Any = None,
    axis: int = 0,
) -> ndarray:
    if axis != 0:
        raise NotImplementedError("only axis=0 is implemented")
    if not endpoint and num > 0:
        stop = start * (stop / start) ** ((num - 1) / num)
    call_args = [runtime.number(start), runtime.number(stop), runtime.number(num)]
    if dtype is not None:
        call_args.append(_dtype_name(dtype))
    return _wrap(_call("geomspace", call_args))


def linspace(
    start: Any,
    stop: Any,
    num: int = 50,
    endpoint: bool = True,
) -> ndarray:
    if not endpoint and num > 0:
        stop = start + (stop - start) * (num - 1) / num
    return _wrap(
        _call(
            "linspace",
            [
                runtime.number(start),
                runtime.number(stop),
                runtime.number(num),
            ],
        )
    )


def _unary_ufunc(name: str, value: Any) -> Any:
    return _wrap(_call(name, [_native_array(value)]))


def sin(value: Any) -> Any:
    return _unary_ufunc("sin", value)


def cos(value: Any) -> Any:
    return _unary_ufunc("cos", value)


def tan(value: Any) -> Any:
    return _unary_ufunc("tan", value)


def exp(value: Any) -> Any:
    return _unary_ufunc("exp", value)


def log(value: Any) -> Any:
    return _unary_ufunc("log", value)


def sqrt(value: Any) -> Any:
    return _unary_ufunc("sqrt", value)


def reshape(
    a: Any,
    newshape: Any,
    order: str = "C",
) -> ndarray:
    return asarray(a).reshape(newshape, order=order)


def _axis_values(axis: Any) -> list[Any]:
    return list(axis) if isinstance(axis, tuple) else [axis]


def _normalized_axes(
    values: list[Any],
    dimensions: int,
    duplicate_message: str,
) -> list[int]:
    answer = []
    for value in values:
        if not runtime.is_exact_integer(value):
            raise TypeError("integer argument expected")
        number = runtime.number(value)
        original = number
        if number < 0:
            number += dimensions
        if number < 0 or number >= dimensions:
            raise IndexError(
                "axis "
                + str(original)
                + " is out of bounds for array of dimension "
                + str(dimensions)
            )
        if number in answer:
            raise ValueError(duplicate_message)
        answer.append(number)
    return answer


def expand_dims(a: Any, axis: Any) -> ndarray:
    """Insert one or several size-one axes without copying data."""
    value = asarray(a)
    requested = _axis_values(axis)
    dimensions = value.ndim + len(requested)
    axes = _normalized_axes(requested, dimensions, "repeated axis")
    index = [
        None if position in axes else slice(None) for position in range(dimensions)
    ]
    return value._basic_view(tuple(index))


def squeeze(a: Any, axis: Any = None) -> ndarray:
    """Remove selected size-one axes without copying data."""
    value = asarray(a)
    if axis is None:
        axes = [
            position for position in range(value.ndim) if value.shape[position] == 1
        ]
    else:
        axes = _normalized_axes(
            _axis_values(axis),
            value.ndim,
            "duplicate value in 'axis'",
        )
    for position in axes:
        if value.shape[position] != 1:
            raise ValueError(
                "cannot select an axis to squeeze out which has size "
                + "not equal to one"
            )
    index = [0 if position in axes else slice(None) for position in range(value.ndim)]
    return value._basic_view(tuple(index))


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


def mean(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    keepdims: bool = False,
    where: Any = True,
) -> Any:
    return asarray(a).mean(axis, dtype, out, keepdims, where)


def prod(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return asarray(a).prod(axis, dtype, out, keepdims, initial, where)


def amin(
    a: Any,
    axis: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return asarray(a).min(axis, out, keepdims, initial, where)


def amax(
    a: Any,
    axis: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return asarray(a).max(axis, out, keepdims, initial, where)


min = amin
max = amax


def argmin(a: Any, axis: Any = None, out: Any = None, keepdims: bool = False) -> Any:
    return asarray(a).argmin(axis, out, keepdims)


def argmax(a: Any, axis: Any = None, out: Any = None, keepdims: bool = False) -> Any:
    return asarray(a).argmax(axis, out, keepdims)


def all(
    a: Any, axis: Any = None, out: Any = None, keepdims: bool = False, where: Any = True
) -> Any:
    return asarray(a).all(axis, out, keepdims, where)


def any(
    a: Any, axis: Any = None, out: Any = None, keepdims: bool = False, where: Any = True
) -> Any:
    return asarray(a).any(axis, out, keepdims, where)


def std(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    ddof: int = 0,
    keepdims: bool = False,
    where: Any = True,
) -> Any:
    return asarray(a).std(axis, dtype, out, ddof, keepdims, where)


def var(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    ddof: int = 0,
    keepdims: bool = False,
    where: Any = True,
) -> Any:
    return asarray(a).var(axis, dtype, out, ddof, keepdims, where)


def cumsum(a: Any, axis: Any = None, dtype: Any = None, out: Any = None) -> ndarray:
    return asarray(a).cumsum(axis, dtype, out)


def cumprod(a: Any, axis: Any = None, dtype: Any = None, out: Any = None) -> ndarray:
    return asarray(a).cumprod(axis, dtype, out)


def add(left: Any, right: Any) -> Any:
    return _wrap(_call("add", [_native_array(left), _native_operand(right)]))


def subtract(left: Any, right: Any) -> ndarray:
    return _wrap(_call("subtract", [_native_array(left), _native(right)]))


def multiply(left: Any, right: Any) -> Any:
    return _wrap(_call("multiply", [_native_array(left), _native_operand(right)]))


def matmul(left: Any, right: Any) -> ndarray:
    return _wrap(_call("matmul", [_native_array(left), _native_array(right)]))


class _Linalg:
    det = _LinalgFunction("det", ("a",), 1, array_arguments=(0,))
    inv = _LinalgFunction("inv", ("a",), 1, array_arguments=(0,))
    solve = _LinalgFunction("solve", ("a", "b"), 2, array_arguments=(0, 1))
    norm = _LinalgFunction(
        "norm", ("x", "ord", "axis", "keepdims"), 1, array_arguments=(0,)
    )
    cond = _LinalgFunction("cond", ("x", "p"), 1, array_arguments=(0,))
    matrix_rank = _LinalgFunction(
        "matrix_rank", ("A", "tol", "hermitian"), 1, array_arguments=(0,)
    )
    matrix_power = _LinalgFunction("matrix_power", ("a", "n"), 2, array_arguments=(0,))
    pinv = _LinalgFunction("pinv", ("a", "rcond", "hermitian"), 1, array_arguments=(0,))
    cholesky = _LinalgFunction("cholesky", ("a", "upper"), 1, array_arguments=(0,))
    eigvals = _LinalgFunction("eigvals", ("a",), 1, array_arguments=(0,))
    eigvalsh = _LinalgFunction("eigvalsh", ("a", "UPLO"), 1, array_arguments=(0,))
    svdvals = _LinalgFunction("svdvals", ("x",), 1, array_arguments=(0,))
    multi_dot = _LinalgFunction("multi_dot", ("arrays", "out"), 1, array_sequences=(0,))
    tensorinv = _LinalgFunction("tensorinv", ("a", "ind"), 1, array_arguments=(0,))
    tensorsolve = _LinalgFunction(
        "tensorsolve", ("a", "b", "axes"), 2, array_arguments=(0, 1)
    )
    vector_norm = _LinalgFunction(
        "vector_norm", ("x", "ord", "axis", "keepdims"), 1, array_arguments=(0,)
    )
    matrix_norm = _LinalgFunction(
        "matrix_norm", ("x", "ord", "axis", "keepdims"), 1, array_arguments=(0,)
    )
    qr = _TupleLinalgFunction(
        "qr", ("a", "mode"), 1, array_arguments=(0,), result_keys=("q", "r")
    )
    svd = _TupleLinalgFunction(
        "svd",
        ("a", "full_matrices", "compute_uv", "hermitian"),
        1,
        array_arguments=(0,),
        result_keys=("u", "s", "vt"),
    )
    eig = _TupleLinalgFunction(
        "eig", ("a",), 1, array_arguments=(0,), result_keys=("w", _parameter_v)
    )
    eigh = _TupleLinalgFunction(
        "eigh",
        ("a", "UPLO"),
        1,
        array_arguments=(0,),
        result_keys=("w", _parameter_v),
    )
    lstsq = _TupleLinalgFunction(
        "lstsq",
        ("a", "b", "rcond"),
        2,
        array_arguments=(0, 1),
        result_keys=("x", "residuals", "rank", "s"),
    )
    slogdet = _TupleLinalgFunction(
        "slogdet", ("a",), 1, array_arguments=(0,), result_keys=("sign", "logabsdet")
    )


linalg = _Linalg()


class _FFTFunction:
    def __init__(self, name: str, parameters: tuple[str, ...]) -> None:
        if runtime.reflect.get(_native_fft, name) is runtime.undefined:
            raise NotImplementedError("numpy-ts does not provide numpy.fft." + name)
        self._name = name
        self._parameters = parameters

    def __repr__(self) -> str:
        return "<function numpy.fft." + self._name + ">"

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        if len(args) == 0:
            raise TypeError(self._name + "() is missing a required argument")
        values = list(args)
        for key, value in kwargs.items():
            if key not in self._parameters:
                raise TypeError(
                    self._name + "() got an unexpected keyword argument '" + key + "'"
                )
            position = self._parameters.index(key)
            while len(values) <= position:
                values.append(None)
            values[position] = value
        values[0] = _native_array(values[0])
        for position, value in enumerate(values):
            if value is None:
                values[position] = runtime.undefined
        return _wrap_result(_call_fft(self._name, values))


class _FFT:
    fft = _FFTFunction("fft", ("a", "n", "axis", "norm", "out"))
    ifft = _FFTFunction("ifft", ("a", "n", "axis", "norm", "out"))
    fft2 = _FFTFunction("fft2", ("a", "s", "axes", "norm", "out"))
    ifft2 = _FFTFunction("ifft2", ("a", "s", "axes", "norm", "out"))
    fftn = _FFTFunction("fftn", ("a", "s", "axes", "norm", "out"))
    ifftn = _FFTFunction("ifftn", ("a", "s", "axes", "norm", "out"))
    rfft = _FFTFunction("rfft", ("a", "n", "axis", "norm", "out"))
    irfft = _FFTFunction("irfft", ("a", "n", "axis", "norm", "out"))
    rfft2 = _FFTFunction("rfft2", ("a", "s", "axes", "norm", "out"))
    irfft2 = _FFTFunction("irfft2", ("a", "s", "axes", "norm", "out"))
    rfftn = _FFTFunction("rfftn", ("a", "s", "axes", "norm", "out"))
    irfftn = _FFTFunction("irfftn", ("a", "s", "axes", "norm", "out"))
    hfft = _FFTFunction("hfft", ("a", "n", "axis", "norm", "out"))
    ihfft = _FFTFunction("ihfft", ("a", "n", "axis", "norm", "out"))
    fftfreq = _FFTFunction("fftfreq", ("n", "d", "device"))
    rfftfreq = _FFTFunction("rfftfreq", ("n", "d", "device"))
    fftshift = _FFTFunction("fftshift", ("x", "axes"))
    ifftshift = _FFTFunction("ifftshift", ("x", "axes"))


fft = _FFT()


_random_exports = (
    "seed",
    "random",
    "random_sample",
    "ranf",
    "sample",
    "rand",
    "randn",
    "randint",
    "random_integers",
    "uniform",
    "normal",
    "standard_normal",
    "exponential",
    "standard_exponential",
    "standard_gamma",
    "standard_cauchy",
    "standard_t",
    "gamma",
    "beta",
    "laplace",
    "logistic",
    "lognormal",
    "gumbel",
    "pareto",
    "power",
    "rayleigh",
    "triangular",
    "wald",
    "weibull",
    "chisquare",
    "noncentral_chisquare",
    "f",
    "noncentral_f",
    "geometric",
    "hypergeometric",
    "logseries",
    "negative_binomial",
    "zipf",
    "poisson",
    "binomial",
    "multinomial",
    "multivariate_normal",
    "dirichlet",
    "vonmises",
    "choice",
    "permutation",
    "shuffle",
)
for _random_export in _random_exports:
    if runtime.reflect.get(_native_random, _random_export) is runtime.undefined:
        raise NotImplementedError(
            "numpy-ts does not provide numpy.random." + _random_export
        )


class _Random:
    def seed(self, seed: Any = None) -> None:
        _random_result("seed", [seed])

    def random(self, size: Any = None) -> Any:
        return _random_result("random", [size])

    def random_sample(self, size: Any = None) -> Any:
        return _random_result("random_sample", [size])

    def ranf(self, size: Any = None) -> Any:
        return _random_result("ranf", [size])

    def sample(self, size: Any = None) -> Any:
        return _random_result("sample", [size])

    def rand(self, *shape: Any) -> Any:
        return _random_result("rand", list(shape))

    def randn(self, *shape: Any) -> Any:
        return _random_result("randn", list(shape))

    def randint(
        self, low: int, high: Any = None, size: Any = None, dtype: Any = int
    ) -> Any:
        return _random_result("randint", [low, high, size, _dtype_name(dtype)])

    def random_integers(self, low: int, high: Any = None, size: Any = None) -> Any:
        return _random_result("random_integers", [low, high, size])

    def uniform(self, low: float = 0.0, high: float = 1.0, size: Any = None) -> Any:
        return _random_result("uniform", [low, high, size])

    def normal(self, loc: float = 0.0, scale: float = 1.0, size: Any = None) -> Any:
        return _random_result("normal", [loc, scale, size])

    def standard_normal(self, size: Any = None) -> Any:
        return _random_result("standard_normal", [size])

    def exponential(self, scale: float = 1.0, size: Any = None) -> Any:
        return _random_result("exponential", [scale, size])

    def standard_exponential(self, size: Any = None) -> Any:
        return _random_result("standard_exponential", [size])

    def standard_gamma(self, shape: float, size: Any = None) -> Any:
        return _random_result("standard_gamma", [shape, size])

    def standard_cauchy(self, size: Any = None) -> Any:
        return _random_result("standard_cauchy", [size])

    def standard_t(self, df: float, size: Any = None) -> Any:
        return _random_result("standard_t", [df, size])

    def gamma(self, shape: float, scale: float = 1.0, size: Any = None) -> Any:
        return _random_result("gamma", [shape, scale, size])

    def beta(self, a: float, b: float, size: Any = None) -> Any:
        return _random_result("beta", [a, b, size])

    def laplace(self, loc: float = 0.0, scale: float = 1.0, size: Any = None) -> Any:
        return _random_result("laplace", [loc, scale, size])

    def logistic(self, loc: float = 0.0, scale: float = 1.0, size: Any = None) -> Any:
        return _random_result("logistic", [loc, scale, size])

    def lognormal(self, mean: float = 0.0, sigma: float = 1.0, size: Any = None) -> Any:
        return _random_result("lognormal", [mean, sigma, size])

    def gumbel(self, loc: float = 0.0, scale: float = 1.0, size: Any = None) -> Any:
        return _random_result("gumbel", [loc, scale, size])

    def pareto(self, a: float, size: Any = None) -> Any:
        return _random_result("pareto", [a, size])

    def power(self, a: float, size: Any = None) -> Any:
        return _random_result("power", [a, size])

    def rayleigh(self, scale: float = 1.0, size: Any = None) -> Any:
        return _random_result("rayleigh", [scale, size])

    def triangular(
        self, left: float, mode: float, right: float, size: Any = None
    ) -> Any:
        return _random_result("triangular", [left, mode, right, size])

    def wald(self, mean: float, scale: float, size: Any = None) -> Any:
        return _random_result("wald", [mean, scale, size])

    def weibull(self, a: float, size: Any = None) -> Any:
        return _random_result("weibull", [a, size])

    def chisquare(self, df: float, size: Any = None) -> Any:
        return _random_result("chisquare", [df, size])

    def noncentral_chisquare(self, df: float, nonc: float, size: Any = None) -> Any:
        return _random_result("noncentral_chisquare", [df, nonc, size])

    def f(self, dfnum: float, dfden: float, size: Any = None) -> Any:
        return _random_result("f", [dfnum, dfden, size])

    def noncentral_f(
        self, dfnum: float, dfden: float, nonc: float, size: Any = None
    ) -> Any:
        return _random_result("noncentral_f", [dfnum, dfden, nonc, size])

    def geometric(self, p: float, size: Any = None) -> Any:
        return _random_result("geometric", [p, size])

    def hypergeometric(
        self, ngood: int, nbad: int, nsample: int, size: Any = None
    ) -> Any:
        return _random_result("hypergeometric", [ngood, nbad, nsample, size])

    def logseries(self, p: float, size: Any = None) -> Any:
        return _random_result("logseries", [p, size])

    def negative_binomial(self, n: float, p: float, size: Any = None) -> Any:
        return _random_result("negative_binomial", [n, p, size])

    def zipf(self, a: float, size: Any = None) -> Any:
        return _random_result("zipf", [a, size])

    def poisson(self, lam: float = 1.0, size: Any = None) -> Any:
        return _random_result("poisson", [lam, size])

    def binomial(self, n: int, p: float, size: Any = None) -> Any:
        return _random_result("binomial", [n, p, size])

    def multinomial(self, n: int, pvals: Any, size: Any = None) -> Any:
        return _random_result("multinomial", [n, _native_operand(pvals), size])

    def multivariate_normal(
        self,
        mean: Any,
        cov: Any,
        size: Any = None,
        check_valid: str = "warn",
        tol: float = 1e-8,
    ) -> Any:
        return _random_result(
            "multivariate_normal",
            [
                _native_operand(mean),
                _native_operand(cov),
                size,
                check_valid,
                tol,
            ],
        )

    def dirichlet(self, alpha: Any, size: Any = None) -> Any:
        return _random_result("dirichlet", [_native_operand(alpha), size])

    def vonmises(self, mu: float, kappa: float, size: Any = None) -> Any:
        return _random_result("vonmises", [mu, kappa, size])

    def choice(
        self, a: Any, size: Any = None, replace: bool = True, p: Any = None
    ) -> Any:
        return _random_result(
            "choice", [_native_operand(a), size, replace, _native_operand(p)]
        )

    def permutation(self, x: Any) -> ndarray:
        return _random_result("permutation", [_native_operand(x)])

    def shuffle(self, x: Any) -> None:
        _random_result("shuffle", [_native_array(x)])


def _random_result(name: str, values: list[Any]) -> Any:
    for position, value in enumerate(values):
        if value is None:
            values[position] = runtime.undefined
    answer = _call_random(name, values)
    if answer is runtime.undefined:
        return None
    return _wrap_result(answer)


random = _Random()


# Element-wise functions.  Instances share one compact argument binder, which
# materially reduces the browser bundle compared with hundreds of wrappers.
absolute = _BackendFunction("absolute", ("x", "out", "where"), 1, array_arguments=(0,))
abs = absolute
fabs = _BackendFunction("fabs", ("x", "out", "where"), 1, array_arguments=(0,))
exp2 = _BackendFunction("exp2", ("x", "out", "where"), 1, array_arguments=(0,))
expm1 = _BackendFunction("expm1", ("x", "out", "where"), 1, array_arguments=(0,))
log1p = _BackendFunction("log1p", ("x", "out", "where"), 1, array_arguments=(0,))
log2 = _BackendFunction("log2", ("x", "out", "where"), 1, array_arguments=(0,))
log10 = _BackendFunction("log10", ("x", "out", "where"), 1, array_arguments=(0,))
cbrt = _BackendFunction("cbrt", ("x", "out", "where"), 1, array_arguments=(0,))
square = _BackendFunction("square", ("x", "out", "where"), 1, array_arguments=(0,))
reciprocal = _BackendFunction(
    "reciprocal", ("x", "out", "where"), 1, array_arguments=(0,)
)
positive = _BackendFunction("positive", ("x", "out", "where"), 1, array_arguments=(0,))
negative = _BackendFunction("negative", ("x", "out", "where"), 1, array_arguments=(0,))
sign = _BackendFunction("sign", ("x", "out", "where"), 1, array_arguments=(0,))
ceil = _BackendFunction("ceil", ("x", "out", "where"), 1, array_arguments=(0,))
floor = _BackendFunction("floor", ("x", "out", "where"), 1, array_arguments=(0,))
trunc = _BackendFunction("trunc", ("x", "out", "where"), 1, array_arguments=(0,))
rint = _BackendFunction("rint", ("x", "out", "where"), 1, array_arguments=(0,))
arcsin = _BackendFunction("arcsin", ("x", "out", "where"), 1, array_arguments=(0,))
arccos = _BackendFunction("arccos", ("x", "out", "where"), 1, array_arguments=(0,))
arctan = _BackendFunction("arctan", ("x", "out", "where"), 1, array_arguments=(0,))
degrees = _BackendFunction("degrees", ("x", "out", "where"), 1, array_arguments=(0,))
radians = _BackendFunction("radians", ("x", "out", "where"), 1, array_arguments=(0,))
deg2rad = radians
rad2deg = degrees
sinh = _BackendFunction("sinh", ("x", "out", "where"), 1, array_arguments=(0,))
cosh = _BackendFunction("cosh", ("x", "out", "where"), 1, array_arguments=(0,))
tanh = _BackendFunction("tanh", ("x", "out", "where"), 1, array_arguments=(0,))
arcsinh = _BackendFunction("arcsinh", ("x", "out", "where"), 1, array_arguments=(0,))
arccosh = _BackendFunction("arccosh", ("x", "out", "where"), 1, array_arguments=(0,))
arctanh = _BackendFunction("arctanh", ("x", "out", "where"), 1, array_arguments=(0,))
isfinite = _BackendFunction("isfinite", ("x", "out", "where"), 1, array_arguments=(0,))
isinf = _BackendFunction("isinf", ("x", "out", "where"), 1, array_arguments=(0,))
isnan = _BackendFunction("isnan", ("x", "out", "where"), 1, array_arguments=(0,))
signbit = _BackendFunction("signbit", ("x", "out", "where"), 1, array_arguments=(0,))
logical_not = _BackendFunction(
    "logical_not", ("x", "out", "where"), 1, array_arguments=(0,)
)
conjugate = _BackendFunction(
    "conjugate", ("x", "out", "where"), 1, array_arguments=(0,)
)
conj = conjugate


def _binary(name: str) -> _BackendFunction:
    return _BackendFunction(
        name, ("x1", "x2", "out", "where"), 2, array_arguments=(0, 1)
    )


true_divide = _binary("true_divide")
divide = true_divide
floor_divide = _binary("floor_divide")
power = _binary("power")
float_power = _binary("float_power")
remainder = _binary("remainder")
mod = remainder
fmod = _binary("fmod")
maximum = _binary("maximum")
minimum = _binary("minimum")
fmax = _binary("fmax")
fmin = _binary("fmin")
hypot = _binary("hypot")
arctan2 = _binary("arctan2")
copysign = _binary("copysign")
nextafter = _binary("nextafter")
equal = _binary("equal")
not_equal = _binary("not_equal")
less = _binary("less")
less_equal = _binary("less_equal")
greater = _binary("greater")
greater_equal = _binary("greater_equal")
logical_and = _binary("logical_and")
logical_or = _binary("logical_or")
logical_xor = _binary("logical_xor")
bitwise_and = _binary("bitwise_and")
bitwise_or = _binary("bitwise_or")
bitwise_xor = _binary("bitwise_xor")
left_shift = _binary("left_shift")
right_shift = _binary("right_shift")


# Array manipulation, selection, and statistics whose numpy-ts signatures
# already match NumPy after array/dtype/shape boundary conversion.
copy = _BackendFunction("copy", ("a", "order", "subok"), 1, array_arguments=(0,))
diag = _BackendFunction("diag", (_parameter_v, "k"), 1, array_arguments=(0,))
diagflat = _BackendFunction("diagflat", (_parameter_v, "k"), 1, array_arguments=(0,))
tri = _BackendFunction("tri", ("N", "M", "k", "dtype", "like"), 1, dtype_arguments=(3,))
tril = _BackendFunction("tril", ("m", "k"), 1, array_arguments=(0,))
triu = _BackendFunction("triu", ("m", "k"), 1, array_arguments=(0,))
vander = _BackendFunction("vander", ("x", "N", "increasing"), 1, array_arguments=(0,))
concatenate = _BackendFunction(
    "concatenate",
    ("arrays", "axis", "out", "dtype", "casting"),
    1,
    array_sequences=(0,),
    dtype_arguments=(3,),
)
stack = _BackendFunction(
    "stack",
    ("arrays", "axis", "out", "dtype", "casting"),
    1,
    array_sequences=(0,),
    dtype_arguments=(3,),
)
vstack = _BackendFunction(
    "vstack", ("tup", "dtype", "casting"), 1, array_sequences=(0,), dtype_arguments=(1,)
)
hstack = _BackendFunction(
    "hstack", ("tup", "dtype", "casting"), 1, array_sequences=(0,), dtype_arguments=(1,)
)
dstack = _BackendFunction("dstack", ("tup",), 1, array_sequences=(0,))
column_stack = _BackendFunction("column_stack", ("tup",), 1, array_sequences=(0,))
tile = _BackendFunction("tile", ("A", "reps"), 2, array_arguments=(0,))
repeat = _BackendFunction("repeat", ("a", "repeats", "axis"), 2, array_arguments=(0,))
flip = _BackendFunction("flip", ("m", "axis"), 1, array_arguments=(0,))
fliplr = _BackendFunction("fliplr", ("m",), 1, array_arguments=(0,))
flipud = _BackendFunction("flipud", ("m",), 1, array_arguments=(0,))
rot90 = _BackendFunction("rot90", ("m", "k", "axes"), 1, array_arguments=(0,))
roll = _BackendFunction("roll", ("a", "shift", "axis"), 2, array_arguments=(0,))
swapaxes = _BackendFunction(
    "swapaxes", ("a", "axis1", "axis2"), 3, array_arguments=(0,)
)
moveaxis = _BackendFunction(
    "moveaxis", ("a", "source", "destination"), 3, array_arguments=(0,)
)
transpose = _BackendFunction("transpose", ("a", "axes"), 1, array_arguments=(0,))
ravel = _BackendFunction("ravel", ("a", "order"), 1, array_arguments=(0,))
flatten = _BackendFunction("flatten", ("a", "order"), 1, array_arguments=(0,))
take = _BackendFunction(
    "take", ("a", "indices", "axis", "out", "mode"), 2, array_arguments=(0,)
)
sort = _BackendFunction(
    "sort", ("a", "axis", "kind", "order", "stable"), 1, array_arguments=(0,)
)
argsort = _BackendFunction(
    "argsort", ("a", "axis", "kind", "order", "stable"), 1, array_arguments=(0,)
)
partition = _BackendFunction(
    "partition", ("a", "kth", "axis", "kind", "order"), 2, array_arguments=(0,)
)
argpartition = _BackendFunction(
    "argpartition", ("a", "kth", "axis", "kind", "order"), 2, array_arguments=(0,)
)
nonzero = _BackendFunction("nonzero", ("a",), 1, array_arguments=(0,))
argwhere = _BackendFunction("argwhere", ("a",), 1, array_arguments=(0,))
flatnonzero = _BackendFunction("flatnonzero", ("a",), 1, array_arguments=(0,))
where = _BackendFunction("where", ("condition", "x", "y"), 1, array_arguments=(0, 1, 2))
dot = _BackendFunction("dot", ("a", "b", "out"), 2, array_arguments=(0, 1))
inner = _BackendFunction("inner", ("a", "b"), 2, array_arguments=(0, 1))
outer = _BackendFunction("outer", ("a", "b", "out"), 2, array_arguments=(0, 1))
kron = _BackendFunction("kron", ("a", "b"), 2, array_arguments=(0, 1))
tensordot = _BackendFunction("tensordot", ("a", "b", "axes"), 2, array_arguments=(0, 1))
trace = _BackendFunction(
    "trace",
    ("a", "offset", "axis1", "axis2", "dtype", "out"),
    1,
    array_arguments=(0,),
    dtype_arguments=(4,),
)
diagonal = _BackendFunction(
    "diagonal", ("a", "offset", "axis1", "axis2"), 1, array_arguments=(0,)
)
median = _BackendFunction(
    "median",
    ("a", "axis", "out", "overwrite_input", "keepdims"),
    1,
    array_arguments=(0,),
)
percentile = _BackendFunction(
    "percentile",
    ("a", "q", "axis", "out", "overwrite_input", "method", "keepdims"),
    2,
    array_arguments=(0,),
)
quantile = _BackendFunction(
    "quantile",
    ("a", "q", "axis", "out", "overwrite_input", "method", "keepdims"),
    2,
    array_arguments=(0,),
)
ptp = _BackendFunction("ptp", ("a", "axis", "out", "keepdims"), 1, array_arguments=(0,))
allclose = _BackendFunction(
    "allclose", ("a", "b", "rtol", "atol", "equal_nan"), 2, array_arguments=(0, 1)
)
isclose = _BackendFunction(
    "isclose", ("a", "b", "rtol", "atol", "equal_nan"), 2, array_arguments=(0, 1)
)
array_equal = _BackendFunction(
    "array_equal", ("a1", "a2", "equal_nan"), 2, array_arguments=(0, 1)
)
array_equiv = _BackendFunction("array_equiv", ("a1", "a2"), 2, array_arguments=(0, 1))
diff = _BackendFunction(
    "diff", ("a", "n", "axis", "prepend", "append"), 1, array_arguments=(0,)
)
gradient = _BackendFunction(
    "gradient", ("f", "axis", "edge_order"), 1, array_arguments=(0,)
)
bincount = _BackendFunction(
    "bincount", ("x", "weights", "minlength"), 1, array_arguments=(0, 1)
)
histogram = _BackendFunction(
    "histogram", ("a", "bins", "range", "density", "weights"), 1, array_arguments=(0, 4)
)
cov = _BackendFunction(
    "cov",
    ("m", "y", "rowvar", "bias", "ddof", "fweights", "aweights"),
    1,
    array_arguments=(0, 1, 5, 6),
)
corrcoef = _BackendFunction(
    "corrcoef",
    ("x", "y", "rowvar", "bias", "ddof", "dtype"),
    1,
    array_arguments=(0, 1),
    dtype_arguments=(5,),
)
convolve = _BackendFunction(
    "convolve", ("a", _parameter_v, "mode"), 2, array_arguments=(0, 1)
)
correlate = _BackendFunction(
    "correlate", ("a", _parameter_v, "mode"), 2, array_arguments=(0, 1)
)


def unique(
    ar: Any,
    return_index: bool = False,
    return_inverse: bool = False,
    return_counts: bool = False,
    axis: Any = None,
    equal_nan: bool = True,
) -> Any:
    if not equal_nan:
        raise NotImplementedError("equal_nan=False is not implemented")
    value = _call(
        "unique",
        [
            _native_array(ar),
            return_index,
            return_inverse,
            return_counts,
            _optional(axis),
        ],
    )
    if not (return_index or return_inverse or return_counts):
        return _wrap(value)
    answer = [_wrap(runtime.reflect.get(value, "values"))]
    if return_index:
        answer.append(_wrap(runtime.reflect.get(value, "indices")))
    if return_inverse:
        answer.append(_wrap(runtime.reflect.get(value, "inverse")))
    if return_counts:
        answer.append(_wrap(runtime.reflect.get(value, "counts")))
    return tuple(answer)


def _nan_reduction(
    name: str,
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    _check_reduction_options(dtype=dtype, out=out, initial=initial, where=where)
    return _wrap_result(_call(name, [_native_array(a), _optional(axis), keepdims]))


def nansum(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return _nan_reduction("nansum", a, axis, dtype, out, keepdims, initial, where)


def nanprod(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return _nan_reduction("nanprod", a, axis, dtype, out, keepdims, initial, where)


def nanmean(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    keepdims: bool = False,
    where: Any = True,
) -> Any:
    return _nan_reduction("nanmean", a, axis, dtype, out, keepdims, None, where)


def nanmin(
    a: Any,
    axis: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return _nan_reduction("nanmin", a, axis, None, out, keepdims, initial, where)


def nanmax(
    a: Any,
    axis: Any = None,
    out: Any = None,
    keepdims: bool = False,
    initial: Any = None,
    where: Any = True,
) -> Any:
    return _nan_reduction("nanmax", a, axis, None, out, keepdims, initial, where)


def nanvar(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    ddof: int = 0,
    keepdims: bool = False,
    where: Any = True,
) -> Any:
    _check_reduction_options(dtype=dtype, out=out, where=where)
    return _wrap_result(
        _call("nanvar", [_native_array(a), _optional(axis), ddof, keepdims])
    )


def nanstd(
    a: Any,
    axis: Any = None,
    dtype: Any = None,
    out: Any = None,
    ddof: int = 0,
    keepdims: bool = False,
    where: Any = True,
) -> Any:
    _check_reduction_options(dtype=dtype, out=out, where=where)
    return _wrap_result(
        _call("nanstd", [_native_array(a), _optional(axis), ddof, keepdims])
    )


def nanargmin(a: Any, axis: Any = None, out: Any = None, keepdims: bool = False) -> Any:
    if out is not None:
        raise NotImplementedError("the out argument is not implemented")
    value = _call("nanargmin", [_native_array(a), _optional(axis)])
    if keepdims and not _is_native_array(value):
        return array(value).reshape(tuple(1 for _ in asarray(a).shape))
    return _wrap_result(value)


def nanargmax(a: Any, axis: Any = None, out: Any = None, keepdims: bool = False) -> Any:
    if out is not None:
        raise NotImplementedError("the out argument is not implemented")
    value = _call("nanargmax", [_native_array(a), _optional(axis)])
    if keepdims and not _is_native_array(value):
        return array(value).reshape(tuple(1 for _ in asarray(a).shape))
    return _wrap_result(value)


nancumsum = _BackendFunction(
    "nancumsum",
    ("a", "axis", "dtype", "out"),
    1,
    array_arguments=(0,),
    dtype_arguments=(2,),
)
nancumprod = _BackendFunction(
    "nancumprod",
    ("a", "axis", "dtype", "out"),
    1,
    array_arguments=(0,),
    dtype_arguments=(2,),
)
nanmedian = _BackendFunction(
    "nanmedian",
    ("a", "axis", "out", "overwrite_input", "keepdims"),
    1,
    array_arguments=(0,),
)
nanquantile = _BackendFunction(
    "nanquantile",
    ("a", "q", "axis", "out", "overwrite_input", "method", "keepdims"),
    2,
    array_arguments=(0,),
)
nanpercentile = _BackendFunction(
    "nanpercentile",
    ("a", "q", "axis", "out", "overwrite_input", "method", "keepdims"),
    2,
    array_arguments=(0,),
)
nan_to_num = _BackendFunction(
    "nan_to_num", ("x", "copy", "nan", "posinf", "neginf"), 1, array_arguments=(0,)
)
around = _BackendFunction("around", ("a", "decimals", "out"), 1, array_arguments=(0,))
round = around
fix = _BackendFunction("fix", ("x", "out"), 1, array_arguments=(0,))
unique_values = _BackendFunction("unique_values", ("x",), 1, array_arguments=(0,))
trim_zeros = _BackendFunction("trim_zeros", ("filt", "trim"), 1, array_arguments=(0,))
append = _BackendFunction(
    "append", ("arr", "values", "axis"), 2, array_arguments=(0, 1)
)
delete = _BackendFunction("delete_", ("arr", "obj", "axis"), 2, array_arguments=(0,))
insert = _BackendFunction(
    "insert", ("arr", "obj", "values", "axis"), 3, array_arguments=(0, 2)
)
resize = _BackendFunction(
    "resize", ("a", "new_shape"), 2, array_arguments=(0,), shape_arguments=(1,)
)
compress = _BackendFunction(
    "compress", ("condition", "a", "axis", "out"), 2, array_arguments=(0, 1)
)
choose = _BackendFunction(
    "choose",
    ("a", "choices", "out", "mode"),
    2,
    array_arguments=(0,),
    array_sequences=(1,),
)
extract = _BackendFunction("extract", ("condition", "arr"), 2, array_arguments=(0, 1))
count_nonzero = _BackendFunction(
    "count_nonzero", ("a", "axis", "keepdims"), 1, array_arguments=(0,)
)
shape = _BackendFunction("shape", ("a",), 1, array_arguments=(0,))
ndim = _BackendFunction("ndim", ("a",), 1, array_arguments=(0,))
size = _BackendFunction("size", ("a", "axis"), 1, array_arguments=(0,))
