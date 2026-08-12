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
    `builtins.__build_class__` switches class statements to the public
    Python hook instead.
    """
    return runtime.undefined


runtime.reflect.set(
    _builtins_default_build_class,
    "__sagejs_default_build_class__",
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
    """Load a Python module through the host and return CPython-style bindings."""
    modules = runtime.reflect.get(runtime.global_object, "ρσ_modules")
    if modules is runtime.undefined:
        modules = runtime.modules
    module = runtime.reflect.get(modules, name)
    if module is runtime.undefined:
        baselib_modules = runtime.reflect.get(
            runtime.global_object,
            "__sagejs_baselib_modules__",
        )
        if baselib_modules is not runtime.undefined:
            module = runtime.reflect.get(baselib_modules, name)
    if module is runtime.undefined:
        loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
        if loader is runtime.undefined:
            raise ImportError("No module named '" + name + "'")
        module = runtime.reflect.apply(loader, runtime.undefined, [name])

    if fromlist:
        loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
        if loader is not runtime.undefined:
            for item in fromlist:
                if item == "*" or hasattr(module, item):
                    continue
                try:
                    child = runtime.reflect.apply(
                        loader, runtime.undefined, [name + "." + item]
                    )
                    if child is runtime.undefined:
                        child = runtime.reflect.get(modules, name + "." + item)
                    if child is not runtime.undefined:
                        # CPython publishes an imported child module on its
                        # parent package.  Generated from-import code then
                        # performs the same final attribute lookup it uses for
                        # ordinary module attributes.
                        runtime.reflect.set(module, item, child)
                except ImportError as error:
                    # ``from module import attribute`` is allowed to resolve an
                    # ordinary attribute rather than a child module.  The
                    # generated from-import performs the definitive check.
                    if str(error) != "No module named '" + name + "." + item + "'":
                        raise
        return module

    top_name = name.split(".")[0]
    top_module = runtime.reflect.get(modules, top_name)
    return module if top_module is runtime.undefined else top_module


__import__ = _builtins_default_import
runtime.reflect.set(
    _builtins_default_import,
    "__sagejs_default_import__",
    True,
)


class _BuiltinsMissing:
    pass


_BUILTINS_MISSING = _BuiltinsMissing()
_BUILTINS_EMPTY = _BuiltinsMissing()
_BUILTINS_DESCRIPTOR_MISSING = _BuiltinsMissing()
_BUILTINS_HASATTR_MISSING = _BuiltinsMissing()
_BUILTINS_DESCRIPTOR_GENERIC = "generic"
_BUILTINS_DESCRIPTOR_NATIVE_GETTER = "native-getter"
_BUILTINS_DESCRIPTOR_DATA = "data-descriptor"
_BUILTINS_DESCRIPTOR_NONDATA = "nondata-descriptor"
_BUILTINS_DESCRIPTOR_DIRECT = "direct"
# Compiler-emitted attribute reads use this reserved alias when calling the
# fixed-arity lookup primitive.  Keeping it in the runtime namespace avoids a
# collision with an ordinary user binding named ``_BUILTINS_MISSING``.
ρσ_getattr_missing = _BUILTINS_MISSING
_builtins_float_prototype = runtime.undefined
_builtins_descriptor_cache = runtime.reflect.construct(
    runtime.reflect.get(runtime.global_object, "WeakMap"), []
)
_builtins_data_descriptor_names = runtime.reflect.construct(runtime.set_class, [])
_builtins_descriptor_epoch = 0


def _builtins_as_any(value: Any) -> Any:
    return value


def cached_function(
    func: Any,
) -> Any:
    """Cache calls to `func` by their positional and keyword arguments.

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
        "__name__",
        runtime.reflect.get(func, "__name__"),
    )
    runtime.reflect.set(
        wrapper,
        "__doc__",
        runtime.reflect.get(func, "__doc__"),
    )
    runtime.reflect.set(wrapper, "cache", cache)
    return wrapper


# Including ``self`` in ``cached_function``'s argument key gives methods the
# expected per-instance behavior.  A dedicated alias also preserves Sage's
# familiar public decorator name.
cached_method = cached_function


def _builtins_get_member(value: Any, name: Any) -> Any:
    if value is None or value is runtime.undefined:
        return runtime.undefined
    answer = runtime.native_get(value, name)
    if answer is not runtime.undefined:
        return answer
    if not runtime.strict_equal(runtime.jstype(value), "function"):
        return answer
    module_name = runtime.native_get(value, "__module__")
    if not runtime.strict_equal(
        runtime.jstype(module_name), "string"
    ) or not runtime.reflect.apply(
        runtime.string_class.prototype.startsWith,
        module_name,
        ["sagejs._baselib."],
    ):
        return answer
    if runtime.strict_equal(name, "__code__"):
        code = ρσ_function_code(value)
        runtime.object.defineProperty(
            value,
            "__code__",
            {"value": code, "writable": True, "configurable": True},
        )
        return code
    if runtime.strict_equal(name, "__globals__"):
        registry = runtime.native_get(
            runtime.global_object,
            "__sagejs_baselib_modules__",
        )
        module = runtime.native_get(registry, module_name)
        containers_module = runtime.native_get(
            registry,
            "sagejs._baselib.containers",
        )
        live_scope_dict = runtime.native_get(
            containers_module,
            "ρσ_live_scope_dict",
        )
        if runtime.strict_equal(runtime.jstype(live_scope_dict), "function"):
            return runtime.reflect.apply(
                live_scope_dict,
                runtime.undefined,
                [module],
            )
    return answer


def _builtins_is_baselib_function(value: Any) -> _Bool:
    if not runtime.strict_equal(runtime.jstype(value), "function"):
        return False
    module_name = runtime.native_get(value, "__module__")
    return runtime.strict_equal(
        runtime.jstype(module_name), "string"
    ) and runtime.reflect.apply(
        runtime.string_class.prototype.startsWith,
        module_name,
        ["sagejs._baselib."],
    )


def ρσ_python_jstype(value: Any) -> _Str:
    """Return the JavaScript storage kind with Python-float virtualization."""
    native_type = runtime.jstype(value)
    if (
        runtime.strict_equal(native_type, "object")
        and value is not None
        and runtime.native_get(value, "__sagejs_float__") is True
    ):
        return "number"
    return native_type


def _builtins_has_member(value: Any, name: Any) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    value_type = runtime.jstype(value)
    target = value
    if not runtime.strict_equal(value_type, "object") and not runtime.strict_equal(
        value_type, "function"
    ):
        target = runtime.object(value)
    return runtime.reflect.has(target, name)


def _builtins_call_member(
    value: Any,
    name: Any,
    call_args: list[Any],
) -> Any:
    method = _builtins_get_member(value, name)
    if _builtins_get_member(method, "__staticmethod__") is True:
        static_target = _builtins_get_member(method, "__func__")
        if runtime.strict_equal(runtime.jstype(static_target), "function"):
            method = static_target
        return runtime.reflect.apply(method, runtime.undefined, call_args)
    if _builtins_get_member(method, "__python_descriptor__") is True:
        # Every internal caller gives this helper a fresh argument vector.
        # Reuse it when supplying the descriptor receiver: copying this array
        # made every overloaded arithmetic operation allocate twice.
        explicit_args = call_args
        explicit_args.unshift(value)  # type: ignore[attr-defined]
        return runtime.reflect.apply(method, runtime.undefined, explicit_args)
    return runtime.reflect.apply(method, value, call_args)


def _builtins_bind_python_function(
    target: Any,
    receiver: Any,
) -> Any:
    bind_arguments = runtime.reflect.construct(runtime.array, [])
    bind_arguments.push(runtime.undefined)
    bind_arguments.push(receiver)
    if (
        _builtins_get_member(target, "__sagejs_native_method__") is True
        or _builtins_get_member(target, "__sagejs_method_signature_excludes_self__")
        is True
    ):
        bind_arguments = runtime.reflect.construct(runtime.array, [])
        bind_arguments.push(receiver)
    bound = runtime.reflect.apply(
        runtime.reflect.get(target, "bind"),
        target,
        bind_arguments,
    )
    runtime.object.assign(bound, target)
    target_argnames = _builtins_get_member(target, "__argnames__")
    if (
        _builtins_get_member(target, "__sagejs_native_method__") is not True
        and _builtins_get_member(target, "__sagejs_method_signature_excludes_self__")
        is not True
        and target_argnames
    ):
        runtime.reflect.set(
            bound,
            "__argnames__",
            runtime.reflect.apply(
                runtime.array.prototype.slice,
                target_argnames,
                [1],
            ),
        )
    runtime.reflect.set(bound, "__func__", target)
    runtime.reflect.set(bound, "__self__", receiver)
    runtime.reflect.set(
        bound,
        "__name__",
        _builtins_get_member(target, "__name__"),
    )
    return bound


def _builtins_member_is_function(value: Any, name: Any) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    return runtime.strict_equal(
        runtime.jstype(runtime.native_get(value, name)),
        "function",
    )


def _builtins_class_attribute_resolution(
    owner: Any,
    name: Any,
) -> Any:
    if (
        owner is None
        or owner is runtime.undefined
        or (
            not runtime.strict_equal(runtime.jstype(owner), "object")
            and not runtime.strict_equal(runtime.jstype(owner), "function")
        )
    ):
        return runtime.undefined
    owner_cache = _builtins_descriptor_cache.get(owner)
    if owner_cache is not runtime.undefined:
        cached = owner_cache.get(name)
        if cached is not runtime.undefined and runtime.strict_equal(
            cached[0], _builtins_descriptor_epoch
        ):
            return (
                runtime.undefined
                if cached[1] is _BUILTINS_DESCRIPTOR_MISSING
                else cached
            )
    else:
        owner_cache = runtime.map()
        _builtins_descriptor_cache.set(owner, owner_cache)
    # Compiler-emitted ``staticmethod(...)``/``classmethod(...)`` class-body
    # aliases live on the constructor so class access can avoid a wrapper.
    # Instances must nevertheless see those descriptors through the class
    # MRO before falling back to inherited prototype methods.
    class_owners = runtime.native_get(owner, "__mro__")
    if not runtime.array.isArray(class_owners):
        class_owners = [owner]
    for class_owner in class_owners:
        class_descriptor = runtime.object.getOwnPropertyDescriptor(class_owner, name)
        if class_descriptor is runtime.undefined:
            continue
        class_value = runtime.reflect.get(class_descriptor, "value")
        if not (
            _builtins_has_member(class_value, "__staticmethod__")
            or _builtins_has_member(class_value, "__classmethod__")
        ):
            continue
        class_kind = _BUILTINS_DESCRIPTOR_GENERIC
        if _builtins_member_is_function(class_value, "__get__"):
            class_kind = _BUILTINS_DESCRIPTOR_NONDATA
        cache_entry = runtime.reflect.construct(runtime.array, [])
        cache_entry.push(_builtins_descriptor_epoch)
        cache_entry.push(class_descriptor)
        cache_entry.push(class_kind)
        cache_entry.push(class_value)
        owner_cache.set(name, cache_entry)
        return cache_entry
    prototype = runtime.native_get(owner, "prototype")
    while prototype is not None and prototype is not runtime.undefined:
        descriptor = runtime.object.getOwnPropertyDescriptor(prototype, name)
        if descriptor is not runtime.undefined:
            descriptor_value = runtime.reflect.get(descriptor, "value")
            descriptor_kind = _BUILTINS_DESCRIPTOR_GENERIC
            descriptor_target = descriptor_value
            if descriptor_value is runtime.undefined:
                native_getter = runtime.reflect.get(descriptor, "get")
                if runtime.strict_equal(runtime.jstype(native_getter), "function"):
                    descriptor_kind = _BUILTINS_DESCRIPTOR_NATIVE_GETTER
                    descriptor_target = native_getter
            elif _builtins_member_is_function(descriptor_value, "__get__"):
                descriptor_target = descriptor_value
                if _builtins_member_is_function(
                    descriptor_value, "__set__"
                ) or _builtins_member_is_function(descriptor_value, "__delete__"):
                    descriptor_kind = _BUILTINS_DESCRIPTOR_DATA
                else:
                    descriptor_kind = _BUILTINS_DESCRIPTOR_NONDATA
            elif _builtins_get_member(descriptor_value, "__staticmethod__") is True:
                # A Python implementation of a CPython builtin can opt out
                # of function-descriptor binding.  This is used by math.frexp
                # and math.ldexp, which remain plain callables when assigned
                # as class attributes just like their native CPython peers.
                descriptor_kind = _BUILTINS_DESCRIPTOR_DIRECT
            elif (
                runtime.strict_equal(runtime.jstype(descriptor_value), "function")
                and not _builtins_is_python_class(descriptor_value)
                and _builtins_is_python_class(owner)
                and (
                    _builtins_get_member(descriptor_value, "__python_descriptor__")
                    is True
                    or _builtins_get_member(
                        descriptor_value,
                        "__sagejs_method_signature_excludes_self__",
                    )
                    is True
                )
            ):
                # Every ordinary function stored in a Python class namespace
                # is a non-data descriptor.  This includes compiler-emitted
                # methods, functions assigned after construction, and methods
                # overriding an eagerly cached implementation from an imported
                # base.  Class objects and explicitly static callables retain
                # their separate paths above.
                descriptor_kind = _BUILTINS_DESCRIPTOR_NONDATA
            elif not runtime.strict_equal(runtime.jstype(descriptor_value), "function"):
                # Non-callable values without ``__get__`` cannot require
                # receiver binding.  This includes ordinary mutable class
                # attributes as well as immutable primitives.
                descriptor_kind = _BUILTINS_DESCRIPTOR_DIRECT
            cache_entry = runtime.reflect.construct(runtime.array, [])
            cache_entry.push(_builtins_descriptor_epoch)
            cache_entry.push(descriptor)
            cache_entry.push(descriptor_kind)
            cache_entry.push(descriptor_target)
            owner_cache.set(name, cache_entry)
            return cache_entry
        prototype = runtime.object.getPrototypeOf(prototype)
    cache_entry = runtime.reflect.construct(runtime.array, [])
    cache_entry.push(_builtins_descriptor_epoch)
    cache_entry.push(_BUILTINS_DESCRIPTOR_MISSING)
    owner_cache.set(name, cache_entry)
    return runtime.undefined


def _builtins_class_attribute_descriptor(
    owner: Any,
    name: Any,
) -> Any:
    resolution = _builtins_class_attribute_resolution(owner, name)
    if resolution is runtime.undefined:
        return runtime.undefined
    return resolution[1]


def ρσ_call_set_names(
    owner: Any,
    names: list[Any],
    values: list[Any],
) -> None:
    """Register descriptors and call `__set_name__` from a namespace."""
    global _builtins_descriptor_epoch
    # Class construction first writes its namespace to the native prototype
    # and constructor, then calls this finalizer.  Earlier class-body/default
    # evaluation may already have cached an inherited attribute under the new
    # owner.  Make the completed namespace authoritative before any instance
    # can reuse that provisional lookup (notably for ``staticmethod`` aliases
    # that replace an inherited instance method).
    if _builtins_get_member(names, "length"):
        _builtins_descriptor_epoch += 1
    index = 0
    while index < _builtins_get_member(names, "length"):
        value = values[index]
        name = names[index]
        if _builtins_member_is_function(
            value, "__set__"
        ) or _builtins_member_is_function(value, "__delete__"):
            # This append-only name filter makes ordinary own-field reads
            # cheap without weakening descriptor precedence.  A false
            # positive only takes the complete per-class lookup path; a
            # false negative would be incorrect, so deleted descriptors stay
            # registered and dynamic class assignment registers eagerly.
            _builtins_data_descriptor_names.add(name)
        if _builtins_member_is_function(value, "__set_name__"):
            _builtins_call_member(value, "__set_name__", [owner, name])
        index += 1


def ρσ_register_data_descriptor_names(names: list[Any]) -> None:
    """Register compiler-emitted native Python property names."""
    index = 0
    while index < _builtins_get_member(names, "length"):
        _builtins_data_descriptor_names.add(names[index])
        index += 1


def _builtins_get_special_member(value: Any, name: Any) -> Any:
    """Look up an implicit special method on the type, not the instance."""
    if value is None or value is runtime.undefined:
        return runtime.undefined
    value_type = runtime.jstype(value)
    if not runtime.strict_equal(value_type, "object") and not runtime.strict_equal(
        value_type, "function"
    ):
        value = runtime.object(value)
    constructor = _builtins_get_member(value, "constructor")
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
    if _builtins_get_member(method, "__staticmethod__") is True:
        static_target = _builtins_get_member(method, "__func__")
        if runtime.strict_equal(runtime.jstype(static_target), "function"):
            method = static_target
        return runtime.reflect.apply(method, runtime.undefined, call_args)
    if _builtins_get_member(method, "__python_descriptor__") is True:
        explicit_args = call_args
        explicit_args.unshift(value)  # type: ignore[attr-defined]
        return runtime.reflect.apply(method, runtime.undefined, explicit_args)
    return runtime.reflect.apply(method, value, call_args)


def _builtins_special_is_function(value: Any, name: Any) -> _Bool:
    return runtime.strict_equal(
        runtime.jstype(_builtins_get_special_member(value, name)),
        "function",
    )


def _builtins_exact_integer_primitive(value: Any) -> _Bool:
    value_type = runtime.jstype(value)
    return (
        runtime.strict_equal(value_type, "boolean")
        or runtime.strict_equal(value_type, "bigint")
        or (
            runtime.strict_equal(value_type, "number")
            and runtime.number.isSafeInteger(value)
        )
    )


def _builtins_is_boxed_float(value: Any) -> _Bool:
    """Return whether `value` is Sage.js's integral-float wrapper."""
    return (
        runtime.strict_equal(runtime.jstype(value), "object")
        and value is not None
        and runtime.native_get(value, "__sagejs_float__") is True
    )


def _builtins_is_python_float(value: Any) -> _Bool:
    """Recognize both primitive and integral-valued Python floats."""
    value_type = runtime.jstype(value)
    return (
        runtime.strict_equal(value_type, "number")
        and not runtime.number.isSafeInteger(value)
    ) or (
        runtime.strict_equal(value_type, "object")
        and value is not None
        and runtime.native_get(value, "__sagejs_float__") is True
    )


def _builtins_float_repr(value: Any) -> _Str:
    """Format an integral binary64 value using Python float spelling."""
    number = runtime.number(value)
    if number == 0 and runtime.native_div(1, number) < 0:
        return "-0.0"
    magnitude = runtime.math.abs(number)
    if magnitude >= 10000000000000000:
        return runtime.reflect.apply(
            runtime.number.prototype.toExponential,
            number,
            [],
        )
    return runtime.string(number) + ".0"


runtime.reflect.set(_builtins_float_repr, "__python_descriptor__", True)


def _builtins_box_float(value: Any) -> Any:
    """Create the uncommon representation for an integral Python float."""
    global _builtins_float_prototype
    if _builtins_float_prototype is runtime.undefined:
        prototype = runtime.object.create(runtime.number.prototype)
        runtime.reflect.set(prototype, "constructor", ρσ_float)
        runtime.reflect.set(prototype, "__python_type__", ρσ_float)
        runtime.reflect.set(prototype, "__sagejs_float__", True)
        runtime.reflect.set(prototype, "__repr__", _builtins_float_repr)
        runtime.reflect.set(prototype, "__str__", _builtins_float_repr)
        _builtins_float_prototype = runtime.object.freeze(prototype)
    answer = runtime.reflect.construct(_builtins_number_class, [value])
    runtime.object.setPrototypeOf(answer, _builtins_float_prototype)
    return runtime.object.freeze(answer)


def ρσ_float_result(value: Any) -> Any:
    """Return a binary64 result without losing Python float identity."""
    number = runtime.number(value)
    if runtime.number.isInteger(number):
        return _builtins_box_float(number)
    return number


def _builtins_numeric_result(
    value: Any,
    left: Any,
    right: Any,
) -> Any:
    """Preserve float contagion for a primitive arithmetic result."""
    if _builtins_is_python_float(left) or _builtins_is_python_float(right):
        return ρσ_float_result(value)
    return value


def ρσ_bigint_divexact(numerator: Any, denominator: Any) -> Any:
    """Divide two BigInts, relying on exact divisibility."""
    return runtime.native_div(numerator, denominator)


def abs(value: Any) -> Any:
    value_type = ρσ_python_jstype(value)
    if runtime.strict_equal(value_type, "number"):
        answer = runtime.math.abs(value)
        if _builtins_is_python_float(value):
            return ρσ_float_result(answer)
        return answer
    if runtime.strict_equal(value_type, "bigint"):
        return runtime.native_neg(value) if value < 0 else value
    if _builtins_member_is_function(value, "__abs__"):
        return _builtins_call_member(value, "__abs__", [])
    return runtime.math.abs(value)


def ρσ_exact_integer_primitive(value: Any) -> _Bool:
    return _builtins_exact_integer_primitive(value)


class NotImplementedType:
    def __repr__(self) -> _Str:
        return "NotImplemented"

    __str__ = __repr__


NotImplemented = NotImplementedType()


class _NoneType:
    """Runtime type object for JavaScript's null-backed Python `None`."""

    pass


runtime.reflect.set(_NoneType, "__name__", "NoneType")
runtime.reflect.set(_NoneType, "__qualname__", "NoneType")
runtime.reflect.set(_NoneType, "__module__", "builtins")
runtime.reflect.set(_NoneType, "__sagejs_none_type__", True)
runtime.set_class_repr(_NoneType, "<class 'NoneType'>")


def ρσ_operator_add(left: Any, right: Any) -> Any:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
        or runtime.strict_equal(left_type, "string")
    ):
        return _builtins_numeric_result(runtime.native_add(left, right), left, right)
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        if _builtins_exact_integer_primitive(
            left
        ) and _builtins_exact_integer_primitive(right):
            return runtime.native_add(runtime.bigint(left), runtime.bigint(right))
        if runtime.strict_equal(left_type, "number") or runtime.strict_equal(
            right_type, "number"
        ):
            return _builtins_numeric_result(
                runtime.native_add(runtime.number(left), runtime.number(right)),
                left,
                right,
            )
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("add", left, right)
    if _builtins_member_is_function(left, "__add__"):
        result = _builtins_call_member(left, "__add__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__radd__"):
        result = _builtins_call_member(right, "__radd__", [left])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(left, "concat") and (
        not runtime.array.isArray(left) or runtime.arraylike(right)
    ):
        return _builtins_call_member(left, "concat", [right])
    if runtime.strict_equal(left_type, "object") or runtime.strict_equal(
        right_type, "object"
    ):
        raise TypeError("unsupported operand type(s) for +")
    return _builtins_numeric_result(runtime.native_add(left, right), left, right)


def ρσ_operator_add_exact(left: Any, right: Any) -> Any:
    # Primitive values cannot override Python's arithmetic methods. Handle
    # them before the general parent/coercion and special-method machinery;
    # overflowing safe integers still promote to BigInt below.
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
        or runtime.strict_equal(left_type, "string")
    ):
        result = runtime.native_add(left, right)
        if not runtime.strict_equal(left_type, "number"):
            return result
        if _builtins_is_python_float(left) or _builtins_is_python_float(right):
            return ρσ_float_result(result)
        if (
            result <= runtime.number.MAX_SAFE_INTEGER
            and result >= runtime.number.MIN_SAFE_INTEGER
        ):
            return result
        if runtime.number.isSafeInteger(left) and runtime.number.isSafeInteger(right):
            return runtime.native_add(runtime.bigint(left), runtime.bigint(right))
        return result
    if (
        (
            runtime.strict_equal(left_type, "bigint")
            or runtime.strict_equal(right_type, "bigint")
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.native_add(runtime.bigint(left), runtime.bigint(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("add", left, right)
    if _builtins_special_is_function(left, "__add__"):
        result = _builtins_call_special(left, "__add__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_special_is_function(right, "__radd__"):
        result = _builtins_call_special(right, "__radd__", [left])
        if result is not NotImplemented:
            return result
    if (
        runtime.strict_equal(left_type, "string")
        or runtime.strict_equal(right_type, "string")
    ) and not runtime.strict_equal(left_type, right_type):
        raise TypeError("can only concatenate str to str")
    if _builtins_member_is_function(left, "concat") and (
        not runtime.array.isArray(left) or runtime.arraylike(right)
    ):
        return _builtins_call_member(left, "concat", [right])
    if runtime.strict_equal(left_type, "object") or runtime.strict_equal(
        right_type, "object"
    ):
        raise TypeError("unsupported operand type(s) for +")
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        if _builtins_exact_integer_primitive(
            left
        ) and _builtins_exact_integer_primitive(right):
            return runtime.native_add(runtime.bigint(left), runtime.bigint(right))
        if runtime.strict_equal(left_type, "number") or runtime.strict_equal(
            right_type, "number"
        ):
            return _builtins_numeric_result(
                runtime.native_add(runtime.number(left), runtime.number(right)),
                left,
                right,
            )
        return runtime.native_add(left, right)
    if not runtime.strict_equal(left_type, "number") or not runtime.strict_equal(
        right_type, "number"
    ):
        return runtime.native_add(left, right)
    result = runtime.native_add(left, right)
    if _builtins_is_python_float(left) or _builtins_is_python_float(right):
        return ρσ_float_result(result)
    if (
        result <= runtime.number.MAX_SAFE_INTEGER
        and result >= runtime.number.MIN_SAFE_INTEGER
    ):
        return result
    if runtime.number.isSafeInteger(left) and runtime.number.isSafeInteger(right):
        return runtime.native_add(runtime.bigint(left), runtime.bigint(right))
    return result


def ρσ_operator_neg(value: Any) -> Any:
    value_type = ρσ_python_jstype(value)
    if runtime.strict_equal(value_type, "number") or runtime.strict_equal(
        value_type, "bigint"
    ):
        answer = runtime.native_neg(value)
        if _builtins_is_python_float(value):
            return ρσ_float_result(answer)
        return answer
    if _builtins_member_is_function(value, "__neg__"):
        return _builtins_call_member(value, "__neg__", [])
    return runtime.native_neg(value)


def ρσ_operator_pos(value: Any) -> Any:
    if value is True:
        return 1
    if value is False:
        return 0
    if _builtins_exact_integer_primitive(value):
        return value
    if _builtins_is_python_float(value):
        return value
    if _builtins_member_is_function(value, "__pos__"):
        return _builtins_call_member(value, "__pos__", [])
    raise TypeError("bad operand type for unary +")


def ρσ_operator_invert(value: Any) -> Any:
    if _builtins_exact_integer_primitive(value):
        return runtime.normalize_integer(
            runtime.native_sub(
                runtime.native_neg(runtime.bigint(value)),
                runtime.bigint(1),
            )
        )
    if _builtins_member_is_function(value, "__invert__"):
        return _builtins_call_member(value, "__invert__", [])
    raise TypeError("bad operand type for unary ~")


def _builtins_sequence_values(value: Any) -> Any:
    if runtime.array.isArray(value):
        return value
    if _builtins_has_member(value, "_tuple_values"):
        return _builtins_get_member(value, "_tuple_values")
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
    left_method: _Str,
    right_method: _Str,
) -> _Bool:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    numeric = (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
        or runtime.strict_equal(left_type, "boolean")
    ) and (
        runtime.strict_equal(right_type, "number")
        or runtime.strict_equal(right_type, "bigint")
        or runtime.strict_equal(right_type, "boolean")
    )
    same_primitive = runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "string")
        or runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
        or runtime.strict_equal(left_type, "boolean")
    )
    if numeric or same_primitive:
        if runtime.strict_equal(operation, "lt"):
            return runtime.native_lt(left, right)
        if runtime.strict_equal(operation, "le"):
            return runtime.native_le(left, right)
        if runtime.strict_equal(operation, "gt"):
            return runtime.native_gt(left, right)
        return runtime.native_ge(left, right)

    left_values = _builtins_sequence_values(left)
    right_values = _builtins_sequence_values(right)
    if left_values is not runtime.undefined and right_values is not runtime.undefined:
        if _builtins_sequence_is_tuple(left) is not _builtins_sequence_is_tuple(right):
            raise TypeError("cannot compare different sequence types")
        common = min(len(left_values), len(right_values))
        for index in range(common):
            if runtime.equals(left_values[index], right_values[index]):
                continue
            if runtime.strict_equal(operation, "lt") or runtime.strict_equal(
                operation, "le"
            ):
                return ρσ_operator_lt(left_values[index], right_values[index])
            return ρσ_operator_gt(left_values[index], right_values[index])
        if runtime.strict_equal(operation, "lt"):
            return runtime.native_lt(len(left_values), len(right_values))
        if runtime.strict_equal(operation, "le"):
            return runtime.native_le(len(left_values), len(right_values))
        if runtime.strict_equal(operation, "gt"):
            return runtime.native_gt(len(left_values), len(right_values))
        return runtime.native_ge(len(left_values), len(right_values))

    if _builtins_member_is_function(left, left_method):
        result = _builtins_call_member(left, left_method, [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, right_method):
        result = _builtins_call_member(right, right_method, [left])
        if result is not NotImplemented:
            return result

    if not numeric and not same_primitive:
        raise TypeError("objects are not orderable")
    if runtime.strict_equal(operation, "lt"):
        return runtime.native_lt(left, right)
    if runtime.strict_equal(operation, "le"):
        return runtime.native_le(left, right)
    if runtime.strict_equal(operation, "gt"):
        return runtime.native_gt(left, right)
    return runtime.native_ge(left, right)


def ρσ_operator_lt(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, "lt", "__lt__", "__gt__")


def ρσ_operator_le(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, "le", "__le__", "__ge__")


def ρσ_operator_gt(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, "gt", "__gt__", "__lt__")


def ρσ_operator_ge(left: Any, right: Any) -> _Bool:
    return _builtins_rich_compare(left, right, "ge", "__ge__", "__le__")


def ρσ_operator_sub(left: Any, right: Any) -> Any:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        return _builtins_numeric_result(runtime.native_sub(left, right), left, right)
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        if _builtins_exact_integer_primitive(
            left
        ) and _builtins_exact_integer_primitive(right):
            return runtime.native_sub(runtime.bigint(left), runtime.bigint(right))
        if runtime.strict_equal(left_type, "number") or runtime.strict_equal(
            right_type, "number"
        ):
            return _builtins_numeric_result(
                runtime.native_sub(runtime.number(left), runtime.number(right)),
                left,
                right,
            )
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("sub", left, right)
    if _builtins_member_is_function(left, "__sub__"):
        result = _builtins_call_member(left, "__sub__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rsub__"):
        result = _builtins_call_member(right, "__rsub__", [left])
        if result is not NotImplemented:
            return result
    if runtime.strict_equal(runtime.jstype(left), "object") or runtime.strict_equal(
        runtime.jstype(right), "object"
    ):
        raise TypeError("unsupported operand type(s) for -")
    return _builtins_numeric_result(runtime.native_sub(left, right), left, right)


def ρσ_operator_sub_exact(left: Any, right: Any) -> Any:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        result = runtime.native_sub(left, right)
        if not runtime.strict_equal(left_type, "number"):
            return result
        if _builtins_is_python_float(left) or _builtins_is_python_float(right):
            return ρσ_float_result(result)
        if (
            result <= runtime.number.MAX_SAFE_INTEGER
            and result >= runtime.number.MIN_SAFE_INTEGER
        ):
            return result
        if runtime.number.isSafeInteger(left) and runtime.number.isSafeInteger(right):
            return runtime.native_sub(runtime.bigint(left), runtime.bigint(right))
        return result
    if (
        (
            runtime.strict_equal(left_type, "bigint")
            or runtime.strict_equal(right_type, "bigint")
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.native_sub(runtime.bigint(left), runtime.bigint(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("sub", left, right)
    if _builtins_special_is_function(left, "__sub__"):
        result = _builtins_call_special(left, "__sub__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_special_is_function(right, "__rsub__"):
        result = _builtins_call_special(right, "__rsub__", [left])
        if result is not NotImplemented:
            return result
    if runtime.strict_equal(left_type, "object") or runtime.strict_equal(
        right_type, "object"
    ):
        raise TypeError("unsupported operand type(s) for -")
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        if _builtins_exact_integer_primitive(
            left
        ) and _builtins_exact_integer_primitive(right):
            return runtime.native_sub(runtime.bigint(left), runtime.bigint(right))
        if runtime.strict_equal(left_type, "number") or runtime.strict_equal(
            right_type, "number"
        ):
            return _builtins_numeric_result(
                runtime.native_sub(runtime.number(left), runtime.number(right)),
                left,
                right,
            )
        return runtime.native_sub(left, right)
    if not runtime.strict_equal(left_type, "number") or not runtime.strict_equal(
        right_type, "number"
    ):
        return runtime.native_sub(left, right)
    result = runtime.native_sub(left, right)
    if _builtins_is_python_float(left) or _builtins_is_python_float(right):
        return ρσ_float_result(result)
    if (
        result <= runtime.number.MAX_SAFE_INTEGER
        and result >= runtime.number.MIN_SAFE_INTEGER
    ):
        return result
    if runtime.number.isSafeInteger(left) and runtime.number.isSafeInteger(right):
        return runtime.native_sub(runtime.bigint(left), runtime.bigint(right))
    return result


def _builtins_repeat_string(text: str, count: Any) -> str:
    if count <= 0:
        return ""
    if runtime.strict_equal(runtime.jstype(count), "bigint"):
        count = runtime.number(count)
    return runtime.reflect.apply(runtime.string_class.prototype.repeat, text, [count])


def ρσ_operator_mul(left: Any, right: Any) -> Any:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        return _builtins_numeric_result(runtime.native_mul(left, right), left, right)
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        if _builtins_exact_integer_primitive(
            left
        ) and _builtins_exact_integer_primitive(right):
            return runtime.native_mul(runtime.bigint(left), runtime.bigint(right))
        if runtime.strict_equal(left_type, "number") or runtime.strict_equal(
            right_type, "number"
        ):
            return _builtins_numeric_result(
                runtime.native_mul(runtime.number(left), runtime.number(right)),
                left,
                right,
            )
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("mul", left, right)
    if runtime.strict_equal(
        runtime.jstype(left), "string"
    ) and _builtins_exact_integer_primitive(right):
        return _builtins_repeat_string(left, right)
    if runtime.strict_equal(
        runtime.jstype(right), "string"
    ) and _builtins_exact_integer_primitive(left):
        return _builtins_repeat_string(right, left)
    if _builtins_member_is_function(left, "__mul__"):
        result = _builtins_call_member(left, "__mul__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rmul__"):
        result = _builtins_call_member(right, "__rmul__", [left])
        if result is not NotImplemented:
            return result
    return _builtins_numeric_result(runtime.native_mul(left, right), left, right)


def ρσ_operator_mul_exact(left: Any, right: Any) -> Any:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        result = runtime.native_mul(left, right)
        if not runtime.strict_equal(left_type, "number"):
            return result
        if _builtins_is_python_float(left) or _builtins_is_python_float(right):
            return ρσ_float_result(result)
        if (
            result <= runtime.number.MAX_SAFE_INTEGER
            and result >= runtime.number.MIN_SAFE_INTEGER
        ):
            return result
        if runtime.number.isSafeInteger(left) and runtime.number.isSafeInteger(right):
            return runtime.native_mul(runtime.bigint(left), runtime.bigint(right))
        return result
    if (
        (
            runtime.strict_equal(left_type, "bigint")
            or runtime.strict_equal(right_type, "bigint")
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        return runtime.native_mul(runtime.bigint(left), runtime.bigint(right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("mul", left, right)
    if runtime.strict_equal(left_type, "string") and _builtins_exact_integer_primitive(
        right
    ):
        return _builtins_repeat_string(left, right)
    if runtime.strict_equal(right_type, "string") and _builtins_exact_integer_primitive(
        left
    ):
        return _builtins_repeat_string(right, left)
    if _builtins_member_is_function(left, "__mul__"):
        result = _builtins_call_member(left, "__mul__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rmul__"):
        result = _builtins_call_member(right, "__rmul__", [left])
        if result is not NotImplemented:
            return result
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        if _builtins_exact_integer_primitive(
            left
        ) and _builtins_exact_integer_primitive(right):
            return runtime.native_mul(runtime.bigint(left), runtime.bigint(right))
        if runtime.strict_equal(left_type, "number") or runtime.strict_equal(
            right_type, "number"
        ):
            return _builtins_numeric_result(
                runtime.native_mul(runtime.number(left), runtime.number(right)),
                left,
                right,
            )
        return runtime.native_mul(left, right)
    if not runtime.strict_equal(left_type, "number") or not runtime.strict_equal(
        right_type, "number"
    ):
        raise TypeError("unsupported operand type(s) for multiplication")
    result = runtime.native_mul(left, right)
    if _builtins_is_python_float(left) or _builtins_is_python_float(right):
        return ρσ_float_result(result)
    if (
        result <= runtime.number.MAX_SAFE_INTEGER
        and result >= runtime.number.MIN_SAFE_INTEGER
    ):
        return result
    if runtime.number.isSafeInteger(left) and runtime.number.isSafeInteger(right):
        return runtime.native_mul(runtime.bigint(left), runtime.bigint(right))
    return result


def ρσ_operator_div(left: Any, right: Any) -> Any:
    if runtime.strict_equal(ρσ_python_jstype(left), "number") and runtime.strict_equal(
        ρσ_python_jstype(right), "number"
    ):
        return ρσ_float_result(runtime.native_div(left, right))
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("truediv", left, right)
    if _builtins_member_is_function(left, "__div__"):
        result = _builtins_call_member(left, "__div__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rdiv__"):
        result = _builtins_call_member(right, "__rdiv__", [left])
        if result is not NotImplemented:
            return result
    return ρσ_float_result(runtime.native_div(left, right))


def _builtins_native_numeric_power(left: Any, right: Any) -> Any:
    """Apply binary64 power with Python's negative-real branch semantics."""
    result = runtime.native_pow(left, right)
    if (
        runtime.number.isNaN(result)
        and left < 0
        and runtime.number.isFinite(runtime.number(left))
        and runtime.number.isFinite(runtime.number(right))
    ):
        # JavaScript returns NaN for a negative real raised to a fractional
        # real power.  Python promotes that case to the principal complex
        # branch.  Construct through the public builtin so the result retains
        # the complete Python complex object model.
        return complex(left) ** right
    return _builtins_numeric_result(result, left, right)


def ρσ_operator_pow(left: Any, right: Any) -> Any:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if (
        (
            runtime.strict_equal(left_type, "number")
            or runtime.strict_equal(left_type, "bigint")
        )
        and (
            runtime.strict_equal(right_type, "number")
            or runtime.strict_equal(right_type, "bigint")
        )
        and left == 0
        and right < 0
    ):
        raise runtime.zero_division_error("zero to a negative power")
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
        and right < 0
    ):
        left_number = runtime.number(left)
        right_number = runtime.number(right)
        if not runtime.number.isFinite(left_number) or not runtime.number.isFinite(
            right_number
        ):
            raise OverflowError("int too large to convert to float")
        return ρσ_float_result(runtime.native_pow(left_number, right_number))
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        return _builtins_native_numeric_power(left, right)
    if _builtins_member_is_function(left, "__pow__"):
        result = _builtins_call_member(left, "__pow__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rpow__"):
        result = _builtins_call_member(right, "__rpow__", [left])
        if result is not NotImplemented:
            return result
    return _builtins_native_numeric_power(left, right)


def ρσ_operator_pow_python_exact(left: Any, right: Any) -> Any:
    """Use exact Python integers without giving them Sage rational powers."""
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
        and right < 0
    ):
        return ρσ_operator_pow(left, right)
    return ρσ_operator_pow_exact(left, right)


def ρσ_operator_pow_exact(left: Any, right: Any) -> Any:
    if isinstance(right, runtime.rational_class):
        if right._denominator != 1:
            if getattr(
                left,
                "_supports_exact_rational_powers",
                False,
            ) and _builtins_member_is_function(left, "__pow__"):
                return _builtins_call_member(left, "__pow__", [right])
            symbolic_ring = runtime.reflect.get(runtime.global_object, "SR")
            if symbolic_ring is not runtime.undefined:
                return symbolic_ring(left).__pow__(right)
        right = runtime.normalize_integer(right._numerator)
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if (
        _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
        and right < 0
    ):
        denominator = runtime.native_pow(runtime.bigint(left), -runtime.bigint(right))
        return runtime.rational_class(1, denominator)
    if runtime.strict_equal(left_type, right_type) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        if runtime.strict_equal(left_type, "bigint") and right < 0:
            raise ValueError(
                "negative powers of exact integers are not implemented yet"
            )
        result = runtime.native_pow(left, right)
        if not runtime.strict_equal(left_type, "number"):
            return result
        if (
            runtime.number.isNaN(result)
            and left < 0
            and runtime.number.isFinite(runtime.number(left))
            and runtime.number.isFinite(runtime.number(right))
        ):
            return complex(left) ** right
        if _builtins_is_python_float(left) or _builtins_is_python_float(right):
            return ρσ_float_result(result)
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
            return runtime.native_pow(runtime.bigint(left), runtime.bigint(right))
        return result
    if (
        (
            runtime.strict_equal(left_type, "bigint")
            or runtime.strict_equal(right_type, "bigint")
        )
        and _builtins_exact_integer_primitive(left)
        and _builtins_exact_integer_primitive(right)
    ):
        if right < 0:
            raise ValueError(
                "negative powers of exact integers are not implemented yet"
            )
        return runtime.native_pow(runtime.bigint(left), runtime.bigint(right))
    if _builtins_member_is_function(left, "__pow__"):
        result = _builtins_call_member(left, "__pow__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rpow__"):
        result = _builtins_call_member(right, "__rpow__", [left])
        if result is not NotImplemented:
            return result
    # Python permits arbitrary-precision integers to participate in floating
    # exponentiation. JavaScript rejects every BigInt/Number mixture, so cross
    # the explicit floating boundary before invoking its numeric operator.
    if runtime.strict_equal(left_type, "bigint"):
        return ρσ_float_result(runtime.native_pow(runtime.number(left), right))
    if runtime.strict_equal(right_type, "bigint"):
        return ρσ_float_result(runtime.native_pow(left, runtime.number(right)))
    if not runtime.strict_equal(left_type, "number") or not runtime.strict_equal(
        right_type, "number"
    ):
        return runtime.native_pow(left, right)
    result = runtime.native_pow(left, right)
    if (
        runtime.number.isNaN(result)
        and left < 0
        and runtime.number.isFinite(runtime.number(left))
        and runtime.number.isFinite(runtime.number(right))
    ):
        return complex(left) ** right
    if _builtins_is_python_float(left) or _builtins_is_python_float(right):
        return ρσ_float_result(result)
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
        return runtime.native_pow(runtime.bigint(left), runtime.bigint(right))
    return result


def _builtins_inplace(
    left: Any,
    right: Any,
    method_name: _Str,
    fallback: Callable[[Any, Any], Any],
) -> Any:
    left_type = runtime.jstype(left)
    if not runtime.strict_equal(left_type, "object") and not runtime.strict_equal(
        left_type, "function"
    ):
        return fallback(left, right)
    if _builtins_member_is_function(left, method_name):
        return _builtins_call_member(left, method_name, [right])
    return fallback(left, right)


def ρσ_operator_iadd(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if runtime.strict_equal(left_type, runtime.jstype(right)) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
        or runtime.strict_equal(left_type, "string")
    ):
        return _builtins_numeric_result(runtime.native_add(left, right), left, right)
    return _builtins_inplace(left, right, "__iadd__", ρσ_operator_add)


def ρσ_operator_isub(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if runtime.strict_equal(left_type, runtime.jstype(right)) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        return _builtins_numeric_result(runtime.native_sub(left, right), left, right)
    return _builtins_inplace(left, right, "__isub__", ρσ_operator_sub)


def ρσ_operator_imul(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if runtime.strict_equal(left_type, runtime.jstype(right)) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        return _builtins_numeric_result(runtime.native_mul(left, right), left, right)
    return _builtins_inplace(left, right, "__imul__", ρσ_operator_mul)


def ρσ_operator_idiv(left: Any, right: Any) -> Any:
    if runtime.strict_equal(runtime.jstype(left), "number") and runtime.strict_equal(
        runtime.jstype(right), "number"
    ):
        return ρσ_float_result(runtime.native_div(left, right))
    return _builtins_inplace(left, right, "__idiv__", ρσ_operator_div)


def ρσ_operator_idiv_python(left: Any, right: Any) -> Any:
    """Implement Python 3 `/=` independently of Sage rational division."""
    return _builtins_inplace(left, right, "__itruediv__", ρσ_operator_truediv)


def ρσ_operator_ipow(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if runtime.strict_equal(left_type, runtime.jstype(right)) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
    ):
        return _builtins_numeric_result(runtime.native_pow(left, right), left, right)
    return _builtins_inplace(left, right, "__ipow__", ρσ_operator_pow)


def ρσ_operator_iadd_exact(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    if runtime.strict_equal(left_type, runtime.jstype(right)) and (
        runtime.strict_equal(left_type, "number")
        or runtime.strict_equal(left_type, "bigint")
        or runtime.strict_equal(left_type, "string")
    ):
        return ρσ_operator_add_exact(left, right)
    return _builtins_inplace(left, right, "__iadd__", ρσ_operator_add_exact)


def ρσ_operator_isub_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__isub__", ρσ_operator_sub_exact)


def ρσ_operator_imul_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__imul__", ρσ_operator_mul_exact)


def ρσ_operator_ipow_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__ipow__", ρσ_operator_pow_exact)


def ρσ_operator_idiv_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__itruediv__", ρσ_operator_truediv_exact)


def ρσ_operator_idiv_python_exact(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__itruediv__", ρσ_operator_truediv)


def ρσ_operator_truediv(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("truediv", left, right)
    if _builtins_member_is_function(left, "__truediv__"):
        result = _builtins_call_member(left, "__truediv__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rtruediv__"):
        result = _builtins_call_member(right, "__rtruediv__", [left])
        if result is not NotImplemented:
            return result
    if runtime.equals(right, 0):
        raise runtime.zero_division_error("division by zero")
    if runtime.strict_equal(ρσ_python_jstype(left), "bigint") or runtime.strict_equal(
        ρσ_python_jstype(right), "bigint"
    ):
        return ρσ_float_result(
            runtime.native_div(runtime.number(left), runtime.number(right))
        )
    if runtime.strict_equal(ρσ_python_jstype(left), "number") and runtime.strict_equal(
        ρσ_python_jstype(right), "number"
    ):
        return ρσ_float_result(runtime.native_div(left, right))
    return ρσ_float_result(runtime.native_div(left, right))


def ρσ_operator_truediv_exact(left: Any, right: Any) -> Any:
    if runtime.is_math_element(left) or runtime.is_math_element(right):
        return runtime.coercion_model.binOp("truediv", left, right)
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        return runtime.reflect.construct(runtime.rational_class, [left, right])
    if _builtins_member_is_function(left, "__truediv__"):
        result = _builtins_call_member(left, "__truediv__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rtruediv__"):
        result = _builtins_call_member(right, "__rtruediv__", [left])
        if result is not NotImplemented:
            return result
    return ρσ_float_result(runtime.native_div(left, right))


def ρσ_operator_mod(left: Any, right: Any) -> Any:
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if (
        runtime.strict_equal(left_type, "number")
        and runtime.strict_equal(right_type, "number")
        and runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
    ):
        if runtime.strict_equal(right, 0):
            raise runtime.zero_division_error("integer modulo by zero")
        remainder = runtime.native_mod(left, right)
        if runtime.strict_equal(remainder, 0):
            return 0
        if remainder < 0 and right > 0 or remainder > 0 and right < 0:
            remainder = runtime.native_add(remainder, right)
        return remainder
    if _builtins_member_is_function(left, "__mod__"):
        result = _builtins_call_member(left, "__mod__", [right])
        if result is not NotImplemented:
            return result
    if _builtins_member_is_function(right, "__rmod__"):
        result = _builtins_call_member(right, "__rmod__", [left])
        if result is not NotImplemented:
            return result
    if runtime.equals(right, 0):
        raise runtime.zero_division_error("integer modulo by zero")
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        left_bigint = runtime.bigint(left)
        right_bigint = runtime.bigint(right)
        remainder = runtime.native_mod(left_bigint, right_bigint)
        if not runtime.strict_equal(remainder, runtime.bigint(0)) and (
            remainder < 0 and right_bigint > 0 or remainder > 0 and right_bigint < 0
        ):
            remainder = runtime.native_add(remainder, right_bigint)
        return runtime.normalize_integer(remainder)
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        return ρσ_float_result(
            runtime.native_mod(runtime.number(left), runtime.number(right))
        )
    return _builtins_numeric_result(runtime.native_mod(left, right), left, right)


def ρσ_operator_matmul(left: Any, right: Any) -> Any:
    if _builtins_member_is_function(left, "__matmul__"):
        return _builtins_call_member(left, "__matmul__", [right])
    if _builtins_member_is_function(right, "__rmatmul__"):
        return _builtins_call_member(right, "__rmatmul__", [left])
    raise TypeError("unsupported operand type(s) for @")


def ρσ_operator_imatmul(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__imatmul__", ρσ_operator_matmul)


def ρσ_operator_ifloordiv(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__ifloordiv__", ρσ_operator_floordiv)


def ρσ_operator_imod(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__imod__", ρσ_operator_mod)


def ρσ_operator_ibitand(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__iand__", ρσ_operator_bitand)


def ρσ_operator_ibitor(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__ior__", ρσ_operator_bitor)


def ρσ_operator_ibitxor(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__ixor__", ρσ_operator_bitxor)


def ρσ_operator_ilshift(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__ilshift__", ρσ_operator_lshift)


def ρσ_operator_irshift(left: Any, right: Any) -> Any:
    return _builtins_inplace(left, right, "__irshift__", ρσ_operator_rshift)


def ρσ_operator_bitand(left: Any, right: Any) -> Any:
    if left is True or left is False:
        if right is True or right is False:
            return left and right
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, "number")
        and runtime.strict_equal(right_type, "number")
        and runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
        and -2147483648 <= left <= 2147483647
        and -2147483648 <= right <= 2147483647
    ):
        return runtime.native_bitand(left, right)
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        return runtime.normalize_integer(
            runtime.native_bitand(runtime.bigint(left), runtime.bigint(right))
        )
    if _builtins_member_is_function(left, "__and__"):
        return _builtins_call_member(left, "__and__", [right])
    if _builtins_member_is_function(right, "__rand__"):
        return _builtins_call_member(right, "__rand__", [left])
    raise TypeError("unsupported operand type(s) for &")


def ρσ_operator_bitor(left: Any, right: Any) -> Any:
    if left is True or left is False:
        if right is True or right is False:
            return left or right
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, "number")
        and runtime.strict_equal(right_type, "number")
        and runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
        and -2147483648 <= left <= 2147483647
        and -2147483648 <= right <= 2147483647
    ):
        return runtime.native_bitor(left, right)
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        return runtime.normalize_integer(
            runtime.native_bitor(runtime.bigint(left), runtime.bigint(right))
        )
    builtin_type_operands = [
        ρσ_bool,
        ρσ_int,
        ρσ_float,
        ρσ_type,
        ρσ_classmethod,
        ρσ_staticmethod,
        runtime.list_constructor,
        runtime.tuple_builtin,
        runtime.string_builtin,
    ]
    if (
        _builtins_is_python_class(left)
        or _builtins_is_python_class(right)
        or left in builtin_type_operands
        or right in builtin_type_operands
        or left is None
        or right is None
    ):
        return ρσ_type_union(left, right)  # type: ignore[name-defined]  # noqa: F821
    if _builtins_member_is_function(left, "__or__"):
        return _builtins_call_member(left, "__or__", [right])
    if _builtins_member_is_function(right, "__ror__"):
        return _builtins_call_member(right, "__ror__", [left])
    raise TypeError("unsupported operand type(s) for |")


def ρσ_operator_bitxor(left: Any, right: Any) -> Any:
    if left is True or left is False:
        if right is True or right is False:
            return left is not right
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, "number")
        and runtime.strict_equal(right_type, "number")
        and runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
        and -2147483648 <= left <= 2147483647
        and -2147483648 <= right <= 2147483647
    ):
        return runtime.native_bitxor(left, right)
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        return runtime.normalize_integer(
            runtime.native_bitxor(runtime.bigint(left), runtime.bigint(right))
        )
    if _builtins_member_is_function(left, "__xor__"):
        return _builtins_call_member(left, "__xor__", [right])
    if _builtins_member_is_function(right, "__rxor__"):
        return _builtins_call_member(right, "__rxor__", [left])
    raise TypeError("unsupported operand type(s) for ^")


def ρσ_operator_lshift(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, "number")
        and runtime.strict_equal(right_type, "number")
        and runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
        and right >= 0
        and right <= 53
    ):
        result = left * runtime.math.pow(2, right)
        if runtime.number.isSafeInteger(result):
            return result
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        right_bigint = runtime.bigint(right)
        if right_bigint < 0:
            raise ValueError("negative shift count")
        return runtime.normalize_integer(
            runtime.native_lshift(runtime.bigint(left), right_bigint)
        )
    if _builtins_member_is_function(left, "__lshift__"):
        return _builtins_call_member(left, "__lshift__", [right])
    if _builtins_member_is_function(right, "__rlshift__"):
        return _builtins_call_member(right, "__rlshift__", [left])
    raise TypeError("shift operands must be integers")


def ρσ_operator_rshift(left: Any, right: Any) -> Any:
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, "number")
        and runtime.strict_equal(right_type, "number")
        and runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
        and right >= 0
    ):
        if right > 53:
            return -1 if left < 0 else 0
        return runtime.math.floor(runtime.native_div(left, runtime.math.pow(2, right)))
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        right_bigint = runtime.bigint(right)
        if right_bigint < 0:
            raise ValueError("negative shift count")
        return runtime.normalize_integer(
            runtime.native_rshift(runtime.bigint(left), right_bigint)
        )
    if _builtins_member_is_function(left, "__rshift__"):
        return _builtins_call_member(left, "__rshift__", [right])
    if _builtins_member_is_function(right, "__rrshift__"):
        return _builtins_call_member(right, "__rrshift__", [left])
    raise TypeError("shift operands must be integers")


def ρσ_operator_floordiv(left: Any, right: Any) -> Any:
    if _builtins_exact_integer_primitive(left) and _builtins_exact_integer_primitive(
        right
    ):
        if (
            runtime.strict_equal(right, 0)
            or runtime.strict_equal(right, runtime.bigint(0))
            or right is False
        ):
            raise runtime.zero_division_error("integer division or modulo by zero")
        if runtime.strict_equal(
            ρσ_python_jstype(left), "bigint"
        ) or runtime.strict_equal(ρσ_python_jstype(right), "bigint"):
            left_bigint = runtime.bigint(left)
            right_bigint = runtime.bigint(right)
            quotient = runtime.native_div(left_bigint, right_bigint)
            remainder = runtime.native_mod(left_bigint, right_bigint)
            if not runtime.strict_equal(remainder, runtime.bigint(0)) and (
                left_bigint < 0
                and right_bigint > 0
                or left_bigint > 0
                and right_bigint < 0
            ):
                quotient = runtime.native_sub(quotient, runtime.bigint(1))
            return runtime.normalize_integer(quotient)
        return runtime.math.floor(runtime.native_div(left, right))
    if _builtins_member_is_function(left, "__floordiv__"):
        return _builtins_call_member(left, "__floordiv__", [right])
    if _builtins_member_is_function(right, "__rfloordiv__"):
        return _builtins_call_member(right, "__rfloordiv__", [left])
    if runtime.equals(right, 0):
        raise runtime.zero_division_error("integer division or modulo by zero")
    if (
        runtime.strict_equal(ρσ_python_jstype(left), "object")
        or runtime.strict_equal(ρσ_python_jstype(left), "function")
        or runtime.strict_equal(ρσ_python_jstype(right), "object")
        or runtime.strict_equal(ρσ_python_jstype(right), "function")
    ):
        raise TypeError("unsupported operand type(s) for //")
    left_type = ρσ_python_jstype(left)
    right_type = ρσ_python_jstype(right)
    if runtime.strict_equal(left_type, "bigint") or runtime.strict_equal(
        right_type, "bigint"
    ):
        answer = runtime.math.floor(
            runtime.native_div(runtime.number(left), runtime.number(right))
        )
    else:
        answer = runtime.math.floor(runtime.native_div(left, right))
    if _builtins_is_python_float(left) or _builtins_is_python_float(right):
        return ρσ_float_result(answer)
    return answer


def ρσ_bool(value: Any) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    value_type = runtime.jstype(value)
    if not runtime.strict_equal(value_type, "object") and not runtime.strict_equal(
        value_type, "function"
    ):
        return not not value
    if (
        runtime.strict_equal(value_type, "object")
        and runtime.native_get(value, "__sagejs_float__") is True
    ):
        return runtime.number(value) != 0
    # Lists and the optimized frozen-array tuple representation are native
    # arrays.  Their truth value is their length even when a freshly created
    # tuple has not inherited a Python ``__len__`` descriptor.
    if runtime.array.isArray(value):
        return value.length != 0
    if runtime.strict_equal(value_type, "object") or runtime.strict_equal(
        value_type, "function"
    ):
        if runtime.strict_equal(
            runtime.reflect.apply(runtime.object.prototype.toString, value, []),
            "[object Number]",
        ):
            return (
                runtime.reflect.apply(runtime.number.prototype.valueOf, value, []) != 0
            )
        if _builtins_member_is_function(value, "__bool__"):
            answer = _builtins_call_member(value, "__bool__", [])
            if answer is not True and answer is not False:
                raise TypeError("__bool__ should return bool")
            return answer
        if _builtins_member_is_function(value, "__len__"):
            length = _builtins_call_member(value, "__len__", [])
            if length < 0:
                raise ValueError("__len__() should return >= 0")
            return length != 0
    return True


def ρσ_round(
    value: Any = _BUILTINS_MISSING,
    ndigits: Any = runtime.undefined,
    *extra: Any,
) -> Any:
    if value is _BUILTINS_MISSING:
        raise TypeError("round expected at least 1 argument")
    if len(extra) != 0:
        raise TypeError("round expected at most 2 arguments")
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
        factor = runtime.native_pow(runtime.bigint(10), runtime.bigint(-digits))
        quotient = runtime.native_div(magnitude, factor)
        remainder = runtime.native_mod(magnitude, factor)
        doubled = runtime.native_mul(remainder, runtime.bigint(2))
        if doubled > factor or (
            doubled == factor and runtime.native_mod(quotient, runtime.bigint(2)) != 0
        ):
            quotient += runtime.bigint(1)
        answer = runtime.native_mul(quotient, factor)
        if negative:
            answer = -answer
        return runtime.normalize_integer(answer)

    if _builtins_member_is_function(value, "__round__"):
        call_args = []
        if ndigits is not runtime.undefined:
            call_args = [ndigits]
        return _builtins_call_member(value, "__round__", call_args)

    if ndigits is runtime.undefined or ndigits is None:
        floor_value = runtime.math.floor(value)
        fraction = runtime.native_sub(value, floor_value)
        if fraction < 0.5:
            return floor_value
        if fraction > 0.5:
            return floor_value + 1
        return (
            floor_value if runtime.native_mod(floor_value, 2) == 0 else floor_value + 1
        )

    scale = runtime.math.pow(10, int(ndigits))
    answer = runtime.native_div(
        ρσ_round(runtime.native_mul(value, scale)),
        scale,
    )
    if _builtins_is_python_float(value):
        return ρσ_float_result(answer)
    return answer


def _builtins_pop_keyword(
    keywords: Any,
    name: _Str,
    default_value: Any,
) -> Any:
    if _builtins_member_is_function(keywords, "__getitem__"):
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
    sep = _builtins_pop_keyword(keywords, "sep", " ")
    end = _builtins_pop_keyword(keywords, "end", "\n")
    file = _builtins_pop_keyword(keywords, "file", None)
    flush = _builtins_pop_keyword(keywords, "flush", False)
    if _builtins_member_is_function(keywords, "__iter__"):
        remaining = list(keywords)
    else:
        remaining = runtime.object.keys(keywords)
    if len(remaining):
        unexpected = remaining[0]
        raise TypeError(
            "'" + unexpected + "' is an invalid keyword argument for print()"
        )
    if sep is None:
        sep = " "
    if end is None:
        end = "\n"
    if not isinstance(sep, str):
        raise TypeError("sep must be None or a string")
    if not isinstance(end, str):
        raise TypeError("end must be None or a string")
    parts = ["None" if value is runtime.undefined else str(value) for value in values]
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
    text = runtime.reflect.apply(runtime.string_class.prototype.trim, value, [])
    if not text:
        raise ValueError("invalid literal for int()")
    sign = runtime.bigint(1)
    if text[0] == "+" or text[0] == "-":
        if text[0] == "-":
            sign = runtime.bigint(-1)
        text = text[1:]
    radix = 10 if base is runtime.undefined else _coerce_int_base(base)
    inferred_base = radix == 0
    consumed_prefix = False
    if radix == 0:
        radix = 10
        if len(text) >= 2 and text[0] == "0":
            marker = text[1]
            if marker == "x" or marker == "X":
                radix = 16
                text = text[2:]
                consumed_prefix = True
            elif marker == "o" or marker == "O":
                radix = 8
                text = text[2:]
                consumed_prefix = True
            elif marker == "b" or marker == "B":
                radix = 2
                text = text[2:]
                consumed_prefix = True
    elif len(text) >= 2 and text[0] == "0":
        marker = text[1]
        if (
            radix == 16
            and (marker == "x" or marker == "X")
            or radix == 8
            and (marker == "o" or marker == "O")
            or radix == 2
            and (marker == "b" or marker == "B")
        ):
            text = text[2:]
    if not text:
        raise ValueError("invalid literal for int()")
    if inferred_base and not consumed_prefix and len(text) > 1 and text[0] == "0":
        for character in text:
            if character != "0" and character != "_":
                raise ValueError(
                    "leading zeros in decimal integer literals are not permitted"
                )
    answer = runtime.bigint(0)
    previous_was_digit = False
    saw_digit = False
    for character in text:
        if character == "_":
            if not previous_was_digit:
                raise ValueError("invalid underscore in integer literal")
            previous_was_digit = False
            continue
        digit = _builtins_digit_value(character)
        if digit < 0 or digit >= radix:
            raise ValueError(
                "invalid literal for int() with base " + str(radix) + ": " + repr(value)
            )
        answer = answer * runtime.bigint(radix) + runtime.bigint(digit)
        previous_was_digit = True
        saw_digit = True
    if not saw_digit or not previous_was_digit:
        raise ValueError("invalid literal for int()")
    return runtime.normalize_integer(sign * answer)


def _coerce_int_base(base: Any) -> _Int:
    if base is True:
        base = 1
    elif base is False:
        base = 0
    elif runtime.strict_equal(runtime.jstype(base), "bigint"):
        base = runtime.number(base)
    if (
        not runtime.strict_equal(runtime.jstype(base), "number")
        or not runtime.number.isInteger(base)
        or base != 0
        and (base < 2 or base > 36)
    ):
        raise ValueError("int() base must be >= 2 and <= 36, or 0")
    return base


def ρσ_int(value: Any = 0, base: Any = runtime.undefined) -> Any:
    if value is True:
        return 1
    if value is False:
        return 0
    if runtime.strict_equal(ρσ_python_jstype(value), "number"):
        if base is not runtime.undefined:
            raise TypeError("int() can't convert non-string with explicit base")
        answer = runtime.math.trunc(value)
    elif runtime.strict_equal(runtime.jstype(value), "bigint"):
        if base is not runtime.undefined:
            raise TypeError("int() can't convert non-string with explicit base")
        return value
    elif runtime.strict_equal(runtime.jstype(value), "string"):
        return _builtins_parse_integer(value, base)
    elif _builtins_member_is_function(value, "decode") and _builtins_member_is_function(
        value, "__len__"
    ):
        return _builtins_parse_integer(
            _builtins_call_member(value, "decode", ["ascii"]), base
        )
    elif _builtins_member_is_function(value, "__int__"):
        if base is not runtime.undefined:
            raise TypeError("int() can't convert non-string with explicit base")
        answer = _builtins_call_member(value, "__int__", [])
        if not _builtins_exact_integer_primitive(answer):
            raise TypeError("__int__ returned non-int")
        if runtime.strict_equal(runtime.jstype(answer), "bigint"):
            return answer
    else:
        raise TypeError(
            "int() argument must be a string, a bytes-like object or a real number"
        )
    if runtime.is_nan(answer):
        radix = 10 if base is runtime.undefined else base
        raise ValueError(
            "Invalid literal for int with base " + str(radix) + ": " + str(value)
        )
    if runtime.strict_equal(
        ρσ_python_jstype(answer), "number"
    ) and not runtime.number.isFinite(runtime.number(answer)):
        raise OverflowError("cannot convert float infinity to integer")
    if runtime.strict_equal(
        ρσ_python_jstype(answer), "number"
    ) and not runtime.number.isSafeInteger(runtime.number(answer)):
        return runtime.bigint(runtime.number(answer))
    return runtime.number(answer)


def ρσ_float(value: Any = 0) -> Any:
    if _builtins_is_boxed_float(value):
        return value
    value_type = runtime.jstype(value)
    reject_nan = False
    if runtime.strict_equal(value_type, "number"):
        answer = value
    elif runtime.strict_equal(value_type, "bigint"):
        answer = runtime.number(value)
    elif runtime.strict_equal(value_type, "boolean"):
        answer = 1 if value else 0
    elif runtime.strict_equal(value_type, "string"):
        normalized = value.strip().lower()
        if normalized in ("inf", "+inf", "infinity", "+infinity"):
            return runtime.number.POSITIVE_INFINITY
        if normalized in ("-inf", "-infinity"):
            return runtime.number.NEGATIVE_INFINITY
        if normalized in ("nan", "+nan", "-nan"):
            return runtime.number.NaN
        if normalized == "":
            raise ValueError("Could not convert string to float: " + str(value))
        # Number() rejects trailing junk which JavaScript parseFloat accepts.
        answer = runtime.number(value)
        reject_nan = True
    elif _builtins_member_is_function(value, "decode") and _builtins_member_is_function(
        value, "__len__"
    ):
        return ρσ_float(_builtins_call_member(value, "decode", ["ascii"]))
    elif _builtins_member_is_function(value, "__float__"):
        answer = _builtins_call_member(value, "__float__", [])
    elif _builtins_member_is_function(value, "__index__"):
        answer = runtime.number(_builtins_call_member(value, "__index__", []))
    else:
        raise TypeError(
            "float() argument must be a string or a real number, not "
            + "'"
            + type(value).__name__
            + "'"
        )
    if reject_nan and runtime.is_nan(answer):
        raise ValueError("Could not convert string to float: " + str(value))
    return ρσ_float_result(answer)


_BUILTINS_MAX_SAFE_INTEGER = runtime.bigint(runtime.number.MAX_SAFE_INTEGER)
_BUILTINS_MIN_SAFE_INTEGER = runtime.bigint(runtime.number.MIN_SAFE_INTEGER)


def ρσ_integer_literal(text: _Str) -> Any:
    text = runtime.reflect.apply(
        runtime.string_class.prototype.replace,
        text,
        [runtime.regexp("_", "g"), ""],
    )
    value = runtime.bigint(text)
    if _BUILTINS_MIN_SAFE_INTEGER <= value <= _BUILTINS_MAX_SAFE_INTEGER:
        return runtime.number(value)
    return value


def ρσ_real_literal(text: _Str) -> Any:
    return runtime.real_literal(text)


_BUILTINS_ARRAYLIKE_TAGS = [
    "[object Int8Array]",
    "[object Uint8Array]",
    "[object Uint8ClampedArray]",
    "[object Int16Array]",
    "[object Uint16Array]",
    "[object Int32Array]",
    "[object Uint32Array]",
    "[object Float32Array]",
    "[object Float64Array]",
    "[object BigInt64Array]",
    "[object BigUint64Array]",
    "[object HTMLCollection]",
    "[object NodeList]",
    "[object NamedNodeMap]",
    "[object TouchList]",
]


def ρσ_arraylike(value: Any) -> _Bool:
    if runtime.array.isArray(value):
        return True
    if runtime.strict_equal(runtime.jstype(value), "string"):
        return True
    if value is None or value is runtime.undefined:
        return False
    tag = runtime.reflect.apply(runtime.object.prototype.toString, value, [])
    return tag in _BUILTINS_ARRAYLIKE_TAGS


def options_object(target: Any) -> Any:
    def wrapped(*call_args: Any) -> Any:
        if (
            len(call_args) > 0
            and call_args[-1] is not None
            and runtime.strict_equal(runtime.jstype(call_args[-1]), "object")
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
    "__argnames__",
    "__bind_methods__",
    "__handles_kwarg_interpolation__",
    "__sagejs_baselib_private_names__",
    "__varargs__",
    "__varkw__",
    "apply",
    "arguments",
    "bind",
    "call",
    "caller",
    "constructor",
    "prototype",
    "pysort",
    "toLocaleString",
    "toString",
    "valueOf",
]


# These attributes are stored as JavaScript own properties so calls and
# introspection stay fast, but CPython exposes them as slots on ``function``;
# they are not entries in a function object's writable ``__dict__``.
_BUILTINS_FUNCTION_SLOT_NAMES = [
    "__annotations__",
    "__annotations_text__",
    "__code__",
    "__defaults__",
    "__doc__",
    "__globals__",
    "__kwdefaults__",
    "__module__",
    "__name__",
    "__python_descriptor__",
    "__python_type__",
    "__qualname__",
]


def _builtins_visible_introspection_name(name: Any) -> _Bool:
    return (
        runtime.strict_equal(runtime.jstype(name), "string")
        and runtime.string_find(name, "ρσ") != 0
        and name not in _BUILTINS_HIDDEN_INTROSPECTION_NAMES
    )


def _builtins_introspection_target(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if runtime.strict_equal(value_type, "object") or runtime.strict_equal(
        value_type, "function"
    ):
        return value
    return runtime.object(value)


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
            if _builtins_visible_introspection_name(name) and name not in answer:
                answer.append(name)
        current = runtime.object.getPrototypeOf(current)


def _builtins_append_own_dir_names(
    value: Any,
    answer: list[_Str],
) -> None:
    for name in runtime.object.getOwnPropertyNames(value):
        if _builtins_visible_introspection_name(name) and name not in answer:
            answer.append(name)


def _builtins_namespace_dict(value: Any) -> Any:
    """Return the Python-visible own namespace of an object or class."""
    module_namespaces = runtime.reflect.get(
        runtime.global_object, "__sagejs_module_namespaces__"
    )
    if module_namespaces is not runtime.undefined:
        has_module = runtime.reflect.get(module_namespaces, "has")
        if runtime.reflect.apply(has_module, module_namespaces, [value]):
            # Unlike class ``__dict__``, a module dictionary is a mutable live
            # namespace.  Wrapping the actual object is both the CPython
            # behavior and dramatically cheaper for documentation-heavy
            # modules such as ``mpmath.function_docs``.
            live_scope_dict = runtime.reflect.get(
                runtime.global_object, "ρσ_live_scope_dict"
            )
            return runtime.reflect.apply(live_scope_dict, runtime.undefined, [value])

    if runtime.strict_equal(runtime.jstype(value), "object"):
        # Instance ``__dict__`` is a writable live namespace.  A detached
        # snapshot breaks ``obj.__dict__.update(...)`` and other ordinary
        # Python object-model operations.
        live_scope_dict = runtime.reflect.get(
            runtime.global_object, "ρσ_live_scope_dict"
        )
        return runtime.reflect.apply(live_scope_dict, runtime.undefined, [value])

    namespace = runtime.object.create(None)
    plain_function = runtime.strict_equal(
        runtime.jstype(value), "function"
    ) and not _builtins_is_python_class(value)

    def copy_own_members(source: Any) -> None:
        if source is None or source is runtime.undefined:
            return
        for member_name in runtime.object.getOwnPropertyNames(source):
            descriptor = runtime.object.getOwnPropertyDescriptor(source, member_name)
            member = runtime.reflect.get(descriptor, "value")
            if member is runtime.undefined and (
                runtime.reflect.get(descriptor, "get") is not runtime.undefined
                or runtime.reflect.get(descriptor, "set") is not runtime.undefined
            ):
                # A class dictionary exposes the descriptor without invoking
                # it.  Compiler-emitted properties use native accessors; wrap
                # those accessors so a class rebuilt by ``type``/a metaclass
                # retains the property in its namespace.
                getter = runtime.reflect.get(descriptor, "get")
                setter = runtime.reflect.get(descriptor, "set")
                runtime.reflect.set(
                    namespace,
                    member_name,
                    SageProperty(
                        None if getter is runtime.undefined else getter,
                        None if setter is runtime.undefined else setter,
                    ),
                )
                continue
            native_function_slot = (
                source is value
                and runtime.strict_equal(runtime.jstype(value), "function")
                and member_name in ("length", "name")
            )
            if (
                not native_function_slot
                and not (
                    source is value
                    and plain_function
                    and member_name in _BUILTINS_FUNCTION_SLOT_NAMES
                )
                and _builtins_get_member(
                    member,
                    "__sagejs_synthetic_method__",
                )
                is not True
                and not (
                    member_name == "__init__"
                    and _builtins_get_member(
                        member,
                        "__sagejs_synthetic_init__",
                    )
                    is True
                )
                and not (
                    source is value
                    and member_name == "__repr__"
                    and _builtins_get_member(
                        member,
                        "__sagejs_internal_class_repr__",
                    )
                    is True
                )
                and _builtins_visible_introspection_name(member_name)
            ):
                runtime.reflect.set(
                    namespace,
                    member_name,
                    member,
                )

    copy_own_members(value)
    if _builtins_is_python_class(value):
        copy_own_members(_builtins_get_member(value, "prototype"))
    return runtime.scope_dict(namespace)


def ρσ_dir(item: Any = runtime.undefined) -> list[_Str]:
    """Return the sorted Python-facing attributes available on `item`."""
    if item is runtime.undefined:
        item = runtime.global_object
    elif _builtins_member_is_function(item, "__dir__"):
        custom_names = _builtins_call_member(item, "__dir__", [])
        answer = []
        for name in custom_names:
            if not runtime.strict_equal(runtime.jstype(name), "string"):
                raise TypeError("__dir__() must return an iterable of strings")
            answer.append(name)
        answer.sort()
        return answer

    target = _builtins_introspection_target(item)
    answer = []
    target_is_function = runtime.strict_equal(runtime.jstype(target), "function")
    constructor = _builtins_get_member(target, "constructor")
    target_is_python_instance = _builtins_is_python_class(constructor)
    if target_is_function and not target_is_python_instance:
        _builtins_append_own_dir_names(target, answer)
        for native_function_name in ["length", "name"]:
            if native_function_name in answer:
                answer.remove(native_function_name)
    else:
        _builtins_append_dir_names(target, answer)

    # Python classes expose their instance methods through the class object.
    # Sage.js stores those methods on the JavaScript constructor prototype.
    if target_is_function:
        prototype = _builtins_get_member(target, "prototype")
        if prototype is not runtime.undefined and prototype is not None:
            _builtins_append_dir_names(prototype, answer)
    if target_is_python_instance and target_is_function:
        for class_only_name in [
            "__bases__",
            "__module__",
            "__name__",
            "length",
            "name",
        ]:
            if class_only_name in answer:
                answer.remove(class_only_name)
    elif not target_is_function and "__bases__" in answer:
        answer.remove("__bases__")
    if target is runtime.global_object:
        private_names = _builtins_get_member(
            runtime.global_object, "__sagejs_baselib_private_names__"
        )
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


def ρσ_vars(item: Any = _BUILTINS_MISSING) -> Any:
    """Return an object's writable Python namespace.

    The compiler emits no-argument `vars()` directly from the current
    lexical scope.  This runtime path implements `vars(object)` and remains
    a useful fallback for dynamically compiled code.
    """
    if item is _BUILTINS_MISSING:
        current_module = runtime.reflect.get(
            runtime.global_object,
            "__sagejs_current_module_namespace__",
        )
        if current_module is not runtime.undefined:
            return ρσ_live_scope_dict(  # type: ignore[name-defined]  # noqa: F821
                current_module
            )
        raise TypeError("vars() has no current Python scope")
    try:
        return ρσ_getattr(item, "__dict__")
    except AttributeError:
        raise TypeError(  # noqa: B904
            "vars() argument must have __dict__ attribute"
        )


def ρσ_resolve_callable(value: Any) -> Any:
    """Return a host function or an object's bound `__call__` method."""
    if runtime.strict_equal(runtime.jstype(value), "function"):
        return value
    return ρσ_getattr(value, "__call__")


def _builtins_callable_name(value: Any) -> _Str:
    name = _builtins_get_member(value, "__name__")
    if runtime.strict_equal(runtime.jstype(name), "string") and name:
        if runtime.string_find(name, "ρσ_") == 0:
            return name[3:]
        return name
    name = _builtins_get_member(value, "name")
    if runtime.strict_equal(runtime.jstype(name), "string") and name:
        if runtime.string_find(name, "ρσ_") == 0:
            return name[3:]
        return name
    return "<anonymous>"


def _builtins_has_own(value: Any, name: _Str) -> _Bool:
    if value is None or value is runtime.undefined:
        return False
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        [name],
    )


def _builtins_signature(value: Any, name: _Str) -> _Str:
    argument_names = _builtins_get_member(value, "__argnames__")
    defaults = _builtins_get_member(value, "__defaults__")
    annotation_text = _builtins_get_member(value, "__annotations_text__")
    annotations = _builtins_get_member(value, "__annotations__")

    def annotation(argument: _Str) -> _Str:
        if _builtins_has_own(annotation_text, argument):
            return str(_builtins_get_member(annotation_text, argument))
        if not _builtins_has_own(annotations, argument):
            return ""
        item = _builtins_get_member(annotations, argument)
        if runtime.strict_equal(runtime.jstype(item), "string"):
            return item
        callable_name = _builtins_callable_name(item)
        if callable_name != "<anonymous>":
            return callable_name
        return runtime.repr(item)

    def argument_part(argument: _Str) -> _Str:
        part = argument
        type_name = annotation(argument)
        if type_name:
            part += ": " + type_name
        if _builtins_has_own(defaults, argument):
            default_value = _builtins_get_member(defaults, argument)
            if default_value is runtime.undefined:
                part += "=None"
            else:
                part += "=" + runtime.repr(default_value)
        return part

    parts = []
    if runtime.array.isArray(argument_names):
        for argument in argument_names:
            parts.append(argument_part(argument))

    positional_only = _builtins_get_member(value, "__positional_only__")
    if positional_only is True and len(parts):
        parts.append("/")

    varargs = _builtins_get_member(value, "__varargs__")
    if runtime.strict_equal(runtime.jstype(varargs), "string"):
        varargs_part = "*" + varargs
        varargs_type = annotation(varargs)
        if varargs_type:
            varargs_part += ": " + varargs_type
        parts.append(varargs_part)
    kwonly = _builtins_get_member(value, "__kwonly__")
    if runtime.array.isArray(kwonly) and len(kwonly):
        if not runtime.strict_equal(runtime.jstype(varargs), "string"):
            parts.append("*")
        for argument in kwonly:
            parts.append(argument_part(argument))
    varkw = _builtins_get_member(value, "__varkw__")
    if runtime.strict_equal(runtime.jstype(varkw), "string"):
        varkw_part = "**" + varkw
        varkw_type = annotation(varkw)
        if varkw_type:
            varkw_part += ": " + varkw_type
        parts.append(varkw_part)
    signature = name + "(" + str.join(", ", parts) + ")"
    return_type = annotation("return")
    if return_type:
        signature += " -> " + return_type
    return signature


def _builtins_doc(value: Any) -> _Str:
    for entry in runtime.documentation_registry():
        if entry[1] is value:
            metadata_doc = _builtins_get_member(entry[2], "doc")
            if runtime.strict_equal(runtime.jstype(metadata_doc), "string"):
                return metadata_doc
    doc = _builtins_get_member(value, "__doc__")
    if runtime.strict_equal(runtime.jstype(doc), "string"):
        return doc
    return ""


def _builtins_indent_doc(doc: _Str, prefix: _Str) -> _Str:
    if not doc:
        return ""
    lines = []
    for line in doc.split("\n"):
        lines.append(prefix + line)
    return str.join("\n", lines)


def _builtins_doc_summary(doc: _Str) -> _Str:
    for line in doc.split("\n"):
        summary = line.strip()
        if summary:
            return summary
    return ""


def _builtins_doc_search_match(
    query: _Str,
    candidate: _Str,
) -> _Bool:
    lowered = runtime.reflect.apply(
        runtime.string_class.prototype.normalize,
        candidate.lower(),
        ["NFD"],
    ).replace(
        runtime.regexp(r"[\u0300-\u036f]", "g"),
        "",
    )
    query = runtime.reflect.apply(
        runtime.string_class.prototype.normalize,
        query,
        ["NFD"],
    ).replace(
        runtime.regexp(r"[\u0300-\u036f]", "g"),
        "",
    )
    if query in lowered:
        return True
    normalized_query = query.replace(runtime.regexp(r"[`_-]+", "g"), " ").replace(
        runtime.regexp(r"\s+", "g"), " "
    )
    normalized_candidate = lowered.replace(runtime.regexp(r"[`_-]+", "g"), " ").replace(
        runtime.regexp(r"\s+", "g"), " "
    )
    return normalized_query in normalized_candidate


def _builtins_is_python_class(value: Any) -> _Bool:
    if not runtime.strict_equal(runtime.jstype(value), "function"):
        return False
    # Class statements and ``type(name, bases, namespace)`` both install the
    # marker on the constructor itself.  Looking on ``prototype`` is weaker:
    # a dynamic subclass may inherit a non-writable ``__bases__`` descriptor,
    # preventing Reflect.set from creating an own prototype property.
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        ["__bases__"],
    )


def _builtins_prototype_member(
    prototype: Any,
    name: _Str,
) -> Any:
    current = prototype
    while current is not None and current is not runtime.undefined:
        descriptor = runtime.object.getOwnPropertyDescriptor(current, name)
        if descriptor is not runtime.undefined:
            # Do not invoke a property getter while merely inspecting docs.
            # Ordinary Python methods are stored as descriptor values.
            return runtime.reflect.get(descriptor, "value")
        current = runtime.object.getPrototypeOf(current)
    return runtime.undefined


def _builtins_class_help(value: Any, instance: _Bool) -> _Str:
    cls = value
    if instance:
        cls = _builtins_get_member(value, "constructor")
    name = _builtins_callable_name(cls)
    heading = "Help on class " + name + ":"
    if instance:
        heading = "Help on " + name + " object:"
    lines = [
        heading,
        "",
        "class " + _builtins_signature(cls, name),
    ]
    doc = _builtins_doc(cls)
    if doc:
        lines.extend(["", _builtins_indent_doc(doc, "    ")])

    prototype = _builtins_get_member(cls, "prototype")
    methods = []
    for method_name in ρσ_dir(cls):
        method = _builtins_prototype_member(prototype, method_name)
        if runtime.string_find(method_name, "_") != 0 and runtime.strict_equal(
            runtime.jstype(method), "function"
        ):
            methods.append(method_name)
    if len(methods) > 0:
        lines.extend(["", "Methods:"])
        for method_name in methods:
            method = _builtins_prototype_member(prototype, method_name)
            lines.append("    " + _builtins_signature(method, method_name))
            method_doc = _builtins_doc(method)
            if method_doc:
                lines.append(_builtins_indent_doc(method_doc, "        "))
    return str.join("\n", lines)


def ρσ_help(item: Any = runtime.undefined) -> None:
    """Print concise Python-style help derived from Sage.js metadata."""
    if item is runtime.undefined:
        ρσ_print(
            "Welcome to Sage.js help.  "
            + "Call help(object) for information about an object."
        )
        return

    for entry in runtime.documentation_registry():
        if entry[1] is item:
            registered_name = entry[0]
            metadata = entry[2]
            metadata_doc = _builtins_get_member(metadata, "doc")
            if runtime.strict_equal(runtime.jstype(metadata_doc), "string"):
                registered_kind = _builtins_get_member(metadata, "kind")
                if not runtime.strict_equal(runtime.jstype(registered_kind), "string"):
                    registered_kind = "object"
                registered_lines = [
                    ("Help on " + registered_kind + " " + registered_name + ":"),
                    "",
                ]
                if registered_kind in ["function", "method", "class"]:
                    registered_lines.append(_builtins_signature(item, registered_name))
                    registered_lines.append("")
                else:
                    registered_lines.extend([registered_name, ""])
                registered_lines.append(
                    _builtins_indent_doc(metadata_doc.strip(), "    ")
                )
                ρσ_print(str.join("\n", registered_lines))
                return

    if _builtins_is_python_class(item):
        text = _builtins_class_help(item, False)
    else:
        constructor = _builtins_get_member(item, "constructor")
        if _builtins_is_python_class(constructor):
            text = _builtins_class_help(item, True)
        elif runtime.strict_equal(runtime.jstype(item), "function"):
            name = _builtins_callable_name(item)
            bound = _builtins_has_member(item, "__self__")
            kind = "method" if bound else "function"
            module = _builtins_get_member(item, "__module__")
            heading = "Help on " + kind + " " + name
            if runtime.strict_equal(runtime.jstype(module), "string") and module:
                heading += " in module " + module
            lines = [
                heading + ":",
                "",
                _builtins_signature(item, name),
            ]
            doc = _builtins_doc(item)
            if doc:
                lines.extend(["", _builtins_indent_doc(doc, "    ")])
            text = str.join("\n", lines)
        else:
            type_name = _builtins_callable_name(constructor)
            text = "Help on " + type_name + " object."
            doc = _builtins_doc(item)
            if doc:
                text += "\n\n" + _builtins_indent_doc(doc, "    ")
    ρσ_print(text)


def ρσ_search_doc(query: Any) -> None:
    r"""
    Search the docstrings of public objects loaded into Sage.js.

    The search is a case-insensitive literal match over public names and
    runtime docstrings.  Results include top-level functions and classes as
    well as documented methods of loaded Python classes.

    ### Examples

    ```sage
    sage: search_doc('q-expansion')
    Search results for 'q-expansion':
        EisensteinSeriesElement.q_expansion -- Return the ...
    ```

    This intentionally searches the locally installed Sage.js API.  It does
    not imply that every object documented by the full SageMath manual is
    implemented.
    """
    text = str(query)
    needle = text.lower()
    if not needle:
        raise ValueError("search_doc query must not be empty")

    matches = []
    seen = []
    for registered_entry in runtime.documentation_registry():
        registered_name = registered_entry[0]
        registered_value = registered_entry[1]
        if registered_name in seen:
            continue
        registered_doc = _builtins_doc(registered_value)
        if _builtins_doc_search_match(needle, registered_name) or (
            registered_doc and _builtins_doc_search_match(needle, registered_doc)
        ):
            matches.append(
                registered_name + " -- " + _builtins_doc_summary(registered_doc)
            )
            seen.append(registered_name)

    namespace = _builtins_get_member(runtime.modules, "__main__")
    names = runtime.object.getOwnPropertyNames(namespace)
    names.sort()
    for name in names:
        if (
            runtime.string_find(name, "_") == 0
            or runtime.string_find(name, "ρσ_") == 0
            or name in seen
        ):
            continue
        descriptor = runtime.object.getOwnPropertyDescriptor(namespace, name)
        value = runtime.reflect.get(descriptor, "value")
        if value is runtime.undefined:
            continue
        doc = _builtins_doc(value)
        if _builtins_doc_search_match(needle, name) or (
            doc and _builtins_doc_search_match(needle, doc)
        ):
            matches.append(name + " -- " + _builtins_doc_summary(doc))
            seen.append(name)

        if not _builtins_is_python_class(value):
            continue
        prototype = _builtins_get_member(value, "prototype")
        for method_name in ρσ_dir(value):
            if runtime.string_find(method_name, "_") == 0:
                continue
            method = _builtins_prototype_member(prototype, method_name)
            if not runtime.strict_equal(runtime.jstype(method), "function"):
                continue
            qualified_name = name + "." + method_name
            if qualified_name in seen:
                continue
            method_doc = _builtins_doc(method)
            if _builtins_doc_search_match(needle, qualified_name) or (
                method_doc and _builtins_doc_search_match(needle, method_doc)
            ):
                matches.append(
                    qualified_name + " -- " + _builtins_doc_summary(method_doc)
                )
                seen.append(qualified_name)

    matches.sort()
    if len(matches) == 0:
        ρσ_print("No documentation matching '" + text + "'.")
        return
    ρσ_print("Search results for '" + text + "':\n    " + str.join("\n    ", matches))


def ρσ_ord(value: Any) -> _Int:
    if runtime.strict_equal(runtime.jstype(value), "object") and _builtins_has_member(
        value, "length"
    ):
        if value.length != 1:
            raise TypeError(
                "ord() expected a character, but string of length "
                + str(value.length)
                + " found"
            )
        return value[0]
    if value.length < 1 or value.length > 2:
        raise TypeError(
            "ord() expected a character, but string of length "
            + str(value.length)
            + " found"
        )
    answer = value.charCodeAt(0)
    if 0xD800 <= answer <= 0xDBFF:
        second = value.charCodeAt(1)
        if 0xDC00 <= second <= 0xDFFF:
            return (answer - 0xD800) * 0x400 + second - 0xDC00 + 0x10000
        raise TypeError("string is missing the low surrogate char")
    if value.length != 1:
        raise TypeError(
            "ord() expected a character, but string of length "
            + str(value.length)
            + " found"
        )
    return answer


def ρσ_chr(code: _Int) -> _Str:
    if code < 0 or code > 0x10FFFF:
        raise ValueError("chr() arg not in range(0x110000)")
    if runtime.strict_equal(runtime.jstype(code), "bigint"):
        code = runtime.number(code)
    if code <= 0xFFFF:
        return runtime.string_class.fromCharCode(code)
    code -= 0x10000
    return runtime.string_class.fromCharCode(
        0xD800 + (code >> 10),
        0xDC00 + (code & 0x3FF),
    )


def ρσ_callable(value: Any) -> _Bool:
    return runtime.strict_equal(
        runtime.jstype(value), "function"
    ) or _builtins_special_is_function(value, "__call__")


def ρσ_classmethod(target: Any) -> Any:
    descriptor = runtime.object.create(None)
    descriptor.__func__ = target
    descriptor.__wrapped__ = target
    descriptor.__classmethod__ = True
    descriptor.__python_type__ = ρσ_classmethod

    def classmethod_get(instance: Any, owner: Any = None) -> Any:
        if owner is None:
            owner = getattr(instance, "__class__")
        return _builtins_bind_python_function(target, owner)

    descriptor.__get__ = classmethod_get
    return descriptor


def ρσ_staticmethod(target: Any) -> Any:
    descriptor = runtime.object.create(None)
    descriptor.__func__ = target
    descriptor.__wrapped__ = target
    descriptor.__staticmethod__ = True
    descriptor.__python_type__ = ρσ_staticmethod

    def staticmethod_get(
        instance: Any,
        owner: Any = None,
    ) -> Any:
        del instance, owner
        return target

    descriptor.__get__ = staticmethod_get
    descriptor.__call__ = target
    return descriptor


def _builtins_integer_string(
    value: Any,
    radix: _Int,
    prefix: _Str,
) -> _Str:
    if not _builtins_exact_integer_primitive(value):
        raise TypeError("integer required")
    answer = value.toString(radix)
    if answer[0] == "-":
        return "-" + prefix + answer[1:]
    return prefix + answer


def ρσ_bin(value: Any) -> _Str:
    return _builtins_integer_string(value, 2, "0b")


def ρσ_hex(value: Any) -> _Str:
    return _builtins_integer_string(value, 16, "0x")


def ρσ_oct(value: Any) -> _Str:
    return _builtins_integer_string(value, 8, "0o")


def _builtins_float_hash(value: Any) -> Any:
    """Return CPython's platform-independent numeric hash for a float."""
    value = runtime.number(value)
    if runtime.number.isNaN(value):
        # CPython deliberately gives distinct NaN objects identity-derived
        # hashes. JavaScript NaN is a primitive, so zero is the least
        # surprising stable value and agrees with sys.hash_info.nan.
        return 0
    if not runtime.number.isFinite(value):
        return 314159 if value > 0 else -314159
    if value == 0:
        return 0

    sign = 1
    magnitude = value
    if magnitude < 0:
        sign = -1
        magnitude = -magnitude

    # This is _Py_HashDouble's binary-float algorithm. All extracted chunks
    # contain at most 28 bits, while the accumulator is an exact BigInt.
    exponent = runtime.math.floor(runtime.math.log2(magnitude)) + 1
    mantissa = magnitude / runtime.math.pow(2, exponent)
    modulus = runtime.bigint("2305843009213693951")
    accumulator = runtime.bigint(0)
    # Baselib bootstraps before Python truth-testing is enabled in generated
    # user modules.  Compare explicitly because integral float zero is an
    # object wrapper and every JavaScript object is otherwise truthy.
    while mantissa != 0:
        accumulator = runtime.native_bitand(
            runtime.native_lshift(accumulator, runtime.bigint(28)),
            modulus,
        ) | runtime.native_rshift(accumulator, runtime.bigint(33))
        mantissa *= 268435456
        exponent -= 28
        digit = runtime.math.floor(mantissa)
        mantissa -= digit
        accumulator += runtime.bigint(digit)
        if accumulator >= modulus:
            accumulator -= modulus

    if exponent >= 0:
        exponent %= 61
    else:
        exponent = 60 - ((-1 - exponent) % 61)
    accumulator = runtime.native_bitand(
        runtime.native_lshift(accumulator, runtime.bigint(exponent)),
        modulus,
    ) | runtime.native_rshift(accumulator, runtime.bigint(61 - exponent))
    if sign < 0:
        accumulator = runtime.native_neg(accumulator)
    if accumulator == -1:
        accumulator = runtime.bigint(-2)
    return runtime.normalize_integer(accumulator)


def ρσ_hash(value: Any) -> Any:
    if value is True:
        return 1
    if value is False or value is None:
        return 0
    if _builtins_exact_integer_primitive(value):
        modulus = runtime.bigint("2305843009213693951")
        answer = runtime.native_mod(runtime.bigint(value), modulus)
        if answer == -1:
            answer = runtime.bigint(-2)
        return runtime.normalize_integer(answer)
    if runtime.strict_equal(ρσ_python_jstype(value), "number"):
        return _builtins_float_hash(value)
    constructor = _builtins_get_member(value, "constructor")
    prototype = _builtins_get_member(constructor, "prototype")
    if (
        prototype is not runtime.undefined
        and runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            prototype,
            ["__eq__"],
        )
        and not runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            prototype,
            ["__hash__"],
        )
    ):
        raise TypeError("unhashable type")
    if _builtins_member_is_function(value, "__hash__"):
        answer = _builtins_call_member(value, "__hash__", [])
        if answer is True:
            return 1
        if answer is False:
            return 0
        if not _builtins_exact_integer_primitive(answer):
            raise TypeError("__hash__ method should return an integer")
        return ρσ_hash(answer)
    sequence = _builtins_sequence_values(value)
    if sequence is not runtime.undefined and _builtins_sequence_is_tuple(value):
        modulus = runtime.bigint("2305843009213693951")
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
        answer = runtime.native_add(answer, runtime.bigint(97531))
        if answer == -1:
            answer = runtime.bigint(-2)
        return runtime.normalize_integer(answer)
    if runtime.array.isArray(value):
        raise TypeError("unhashable type: 'list'")
    if _builtins_member_is_function(value, "__eq__"):
        raise TypeError("unhashable type")
    value_type = runtime.jstype(value)
    if (
        runtime.strict_equal(value_type, "string")
        or runtime.strict_equal(value_type, "number")
        or runtime.strict_equal(value_type, "object")
        or runtime.strict_equal(value_type, "function")
    ):
        return ρσ_id(value)
    raise TypeError("unhashable type")


def ρσ_enumerate(
    iterable: Any = _BUILTINS_MISSING,
    start: _Int = 0,
    *extra: Any,
) -> Iterator[Any]:
    if iterable is _BUILTINS_MISSING:
        raise TypeError("enumerate expected at least 1 argument")
    if len(extra) != 0:
        raise TypeError("enumerate expected at most 2 arguments")

    def generate() -> Iterator[Any]:
        index = start
        iterator = iter(iterable)
        done = False
        value = None
        while not done:
            result = runtime.reflect.apply(
                _builtins_get_member(iterator, "next"),
                iterator,
                [],
            )
            if result.done:
                if result.value is runtime.undefined or result.value is None:
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
    if runtime.array.isArray(iterable) and runtime.object.isFrozen(iterable):
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
                raise ValueError("slice step cannot be zero")
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
            raise ValueError("length should not be negative")

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
            "slice("
            + repr(self._start)
            + ", "
            + repr(self._stop)
            + ", "
            + repr(self._step)
            + ")"
        )


def _builtins_tuple_subclass_init(
    self: Any,
    *args: Any,
) -> None:
    # ``tuple.__new__`` has already fixed the immutable value.  Initialization
    # is intentionally a no-op in that case and may receive the subclass's
    # original constructor arguments rather than a single iterable.
    if hasattr(self, "_tuple_values"):
        return
    self._tuple_values = [] if len(args) == 0 else list(args[0])


def _builtins_tuple_subclass_len(self: Any) -> _Int:
    return len(self._tuple_values)


def _builtins_tuple_subclass_iter(self: Any) -> Any:
    return iter(self._tuple_values)


def _builtins_tuple_subclass_getitem(
    self: Any,
    index: Any,
) -> Any:
    if hasattr(index, "__sagejs_slice__"):
        start, stop, step = index.indices(len(self._tuple_values))
        return runtime.math_tuple(
            [self._tuple_values[position] for position in range(start, stop, step)]
        )
    index = int(index)
    if index < 0:
        index += len(self._tuple_values)
    if index < 0 or index >= len(self._tuple_values):
        raise IndexError("tuple index out of range")
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
        if not runtime.equals(self._tuple_values[index], other_values[index]):
            return False
    return True


def _builtins_tuple_subclass_add(
    self: Any,
    other: Any,
) -> Any:
    other_values = _builtins_sequence_values(other)
    if other_values is runtime.undefined or not _builtins_sequence_is_tuple(other):
        raise TypeError("can only concatenate tuple to tuple")
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


def ρσ_finalize_namedtuple_class(
    cls: Any,
    field_names: Any,
) -> Any:
    """Complete a class-syntax `typing.NamedTuple` declaration.

    Annotations are normally erased by the compiler.  For a NamedTuple they
    also define the immutable tuple layout, so the lowerer records just those
    names and this runtime helper installs the corresponding constructor and
    descriptors while preserving methods declared in the class body.
    """
    names = list(field_names)

    @runtime.native_method
    def tuple_init(
        self: Any,
        *args: Any,
        **keywords: Any,
    ) -> None:
        if len(args) > len(names):
            raise TypeError(
                "Expected " + str(len(names)) + " arguments, got " + str(len(args))
            )
        values = list(args)
        keyword_names = list(keywords)
        for index in range(len(args)):
            if names[index] in keyword_names:
                raise TypeError(
                    "got multiple values for argument '" + names[index] + "'"
                )
        for index in range(len(args), len(names)):
            name = names[index]
            if name not in keyword_names:
                raise TypeError("missing required argument: '" + name + "'")
            values.append(keywords.__getitem__(name))
        for name in keyword_names:
            if name not in names:
                raise TypeError("got an unexpected keyword argument '" + name + "'")
        self._tuple_values = values

    @runtime.native_method
    def tuple_repr(self: Any) -> _Str:
        entries = []
        for index in range(len(names)):
            entries.append(names[index] + "=" + repr(self._tuple_values[index]))
        return cls.__name__ + "(" + ", ".join(entries) + ")"

    @runtime.native_method
    def tuple_asdict(self: Any) -> Any:
        answer = dict()
        for index in range(len(names)):
            answer.__setitem__(names[index], self._tuple_values[index])
        return answer

    prototype = runtime.reflect.get(cls, "prototype")
    runtime.reflect.set(prototype, "__init__", tuple_init)
    runtime.reflect.set(prototype, "__repr__", tuple_repr)
    runtime.reflect.set(prototype, "__str__", tuple_repr)
    runtime.reflect.set(prototype, "toString", tuple_repr)
    runtime.reflect.set(prototype, "_asdict", tuple_asdict)
    runtime.reflect.set(cls, "_fields", runtime.math_tuple(names))
    runtime.reflect.set(cls, "_field_defaults", dict())
    # Keyword interpolation happens at the class-call boundary before the
    # generated constructor forwards into the replacement tuple initializer.
    # The original synthetic ``NamedTuple.__init__`` metadata has no field
    # names, so publish the finalized constructor signature on the class.
    runtime.reflect.set(cls, "__argnames__", names)
    runtime.reflect.set(cls, "__handles_kwarg_interpolation__", True)
    runtime.reflect.set(prototype, "_fields", runtime.math_tuple(names))
    runtime.reflect.set(prototype, "_field_defaults", dict())

    for index in range(len(names)):

        def make_getter(position: _Int) -> Any:
            @runtime.native_method
            def field_getter(self: Any) -> Any:
                return self._tuple_values[position]

            return field_getter

        runtime.object.defineProperty(
            prototype,
            names[index],
            {
                "configurable": False,
                "enumerable": True,
                "get": make_getter(index),
            },
        )
    return cls


def _builtins_reverse_iterator(iterable: Any) -> Iterator[Any]:
    if ρσ_arraylike(iterable):
        length = iterable.length
    elif _builtins_member_is_function(
        iterable, "__len__"
    ) and _builtins_member_is_function(iterable, "__getitem__"):
        length = _builtins_call_member(iterable, "__len__", [])
    else:
        raise TypeError("'object' is not reversible")
    index = length - 1
    while index >= 0:
        if ρσ_arraylike(iterable):
            yield iterable[index]
        else:
            yield _builtins_call_member(iterable, "__getitem__", [index])
        index -= 1


def ρσ_reversed(iterable: Any) -> Any:
    if _builtins_member_is_function(iterable, "__reversed__"):
        return _builtins_call_member(iterable, "__reversed__", [])
    return _builtins_reverse_iterator(iterable)


def _builtins_native_map(value: Any) -> _Bool:
    return (
        value is not None
        and _builtins_get_member(value, "constructor") is runtime.map_class
    )


@runtime.sequence_class
class _BuiltinsSequenceIterator:
    """Iterator for objects implementing only Python's `__getitem__`."""

    def __init__(self, sequence: Any) -> None:
        self._sequence = sequence
        self._index = 0

    def __iter__(self) -> _BuiltinsSequenceIterator:
        return self

    def __next__(self) -> Any:
        index = self._index
        self._index += 1
        try:
            return _builtins_call_member(self._sequence, "__getitem__", [index])
        except IndexError:
            raise StopIteration  # noqa: B904
        except StopIteration:
            raise StopIteration  # noqa: B904


def ρσ_iter(iterable: Any) -> Any:
    iterator_method = _builtins_get_member(iterable, runtime.iterator_symbol)
    if runtime.strict_equal(runtime.jstype(iterator_method), "function"):
        if _builtins_native_map(iterable):
            return _builtins_call_member(iterable, "keys", [])
        iterator = runtime.reflect.apply(iterator_method, iterable, [])
        if _builtins_member_is_function(iterator, "next"):
            return iterator
        raise TypeError("iter() returned non-iterator")
    if _builtins_member_is_function(iterable, "__getitem__"):
        return _BuiltinsSequenceIterator(iterable)
    raise TypeError("object is not iterable")


def _builtins_generator_result(result: Any) -> Any:
    if not result.done:
        return result.value
    if result.value is not runtime.undefined and result.value is not None:
        raise StopIteration(result.value)
    raise StopIteration()


def ρσ_generator_send(
    iterator: Any,
    value: Any = None,
) -> Any:
    if iterator.__started__ is False:
        if value is not None:
            raise TypeError("can't send non-None value to a just-started generator")
        iterator.__started__ = True
    return _builtins_generator_result(iterator.next(value))


def ρσ_generator_throw(
    iterator: Any,
    exception: Any,
    *args: Any,
) -> Any:
    if runtime.strict_equal(runtime.jstype(exception), "function"):
        original_exception = exception
        exception = runtime.reflect.construct(exception, list(args))
        runtime.object.defineProperty(
            exception,
            "__sagejs_throw_original__",
            {"value": original_exception},
        )
        runtime.object.defineProperty(
            exception,
            "__sagejs_throw_args__",
            {"value": list(args)},
        )
    elif not runtime.instance_of(exception, runtime.error):
        exception = runtime.non_exception_throw(exception)
    return _builtins_generator_result(iterator.__native_throw__(exception))


def ρσ_generator_close(iterator: Any) -> None:
    try:
        result = iterator.__native_throw__(GeneratorExit())
    except GeneratorExit:
        return None
    if result.done:
        return None
    raise RuntimeError("generator ignored GeneratorExit")


def ρσ_next(
    iterator: Any,
    fallback: Any = _BUILTINS_MISSING,
) -> Any:
    if _builtins_member_is_function(iterator, "__next__"):
        try:
            return _builtins_call_member(iterator, "__next__", [])
        except StopIteration:
            if fallback is not _BUILTINS_MISSING:
                return fallback
            raise
    if iterator.__started__ is False:
        iterator.__started__ = True
    try:
        result = iterator.next()
    except TypeError as error:
        if _builtins_get_member(error, "message") == "Generator is already running":
            raise ValueError(  # noqa: B904
                "generator already executing"
            )
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
            raise ValueError("range() arg 3 must not be zero")
        self._start = start
        self._stop = stop
        self._step = step
        one = 1
        if runtime.strict_equal(runtime.jstype(start), "bigint"):
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
        raise AttributeError("readonly attribute 'start'")

    @property
    def stop(self) -> _Int:
        return self._stop

    @stop.setter
    def stop(self, _value: Any) -> None:
        raise AttributeError("readonly attribute 'stop'")

    @property
    def step(self) -> _Int:
        return self._step

    @step.setter
    def step(self, _value: Any) -> None:
        raise AttributeError("readonly attribute 'step'")

    def __iter__(self) -> Iterator[_Int]:
        return runtime.exact_integer_range_iterator(
            self.start,
            self.step,
            self._length,
        )

    def __len__(self) -> _Int:
        return self._length

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, "__sagejs_slice__"):
            start, stop, step = index.indices(self._length)
            return ρσ_range(
                self.start + start * self.step,
                self.start + stop * self.step,
                self.step * step,
            )
        index = int(index)
        if runtime.strict_equal(runtime.jstype(self.start), "bigint"):
            index = runtime.bigint(index)
        if index < 0:
            index += self._length
        if index < 0 or index >= self._length:
            raise IndexError("range object index out of range")
        return self.start + index * self.step

    def __setitem__(self, _index: Any, _value: Any) -> None:
        raise TypeError("'range' object does not support item assignment")

    def __neg__(self) -> Any:
        raise TypeError("bad operand type for unary -: 'range'")

    def __eq__(self, other: Any) -> _Bool:
        if not _builtins_get_member(other, "__sagejs_range__"):
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
        raise TypeError("unsupported operand type(s) for +: 'range'")

    def count(self, value: Any) -> _Int:
        for item in self:
            if item == value:
                return 1
        return 0

    def index(self, value: Any) -> _Int:
        for index, item in enumerate(self):
            if item == value:
                return index
        raise ValueError(str(value) + " is not in range")

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
        return self.__getitem__(SageSlice(start_index, stop_index))

    def __repr__(self) -> _Str:
        if self.step == 1:
            return "range(" + str(self.start) + ", " + str(self.stop) + ")"
        return (
            "range("
            + str(self.start)
            + ", "
            + str(self.stop)
            + ", "
            + str(self.step)
            + ")"
        )


def _builtins_index_value(value: Any) -> _Int:
    if value is True:
        return 1
    if value is False:
        return 0
    if _builtins_exact_integer_primitive(value):
        return value
    if _builtins_member_is_function(value, "__index__"):
        answer = _builtins_call_member(value, "__index__", [])
        if _builtins_exact_integer_primitive(answer):
            return answer
        raise TypeError("__index__ returned non-int")
    raise TypeError("object cannot be interpreted as an integer")


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
        runtime.strict_equal(runtime.jstype(start), "bigint")
        or runtime.strict_equal(runtime.jstype(stop), "bigint")
        or runtime.strict_equal(runtime.jstype(step), "bigint")
    ):
        start = runtime.bigint(start)
        stop = runtime.bigint(stop)
        step = runtime.bigint(step)
    return _Range(start, stop, step)


runtime.reflect.set(ρσ_range, "__positional_only__", True)


class _EllipsisType:
    def __repr__(self) -> _Str:
        return "Ellipsis"

    def __str__(self) -> _Str:
        return "Ellipsis"

    def __hash__(self) -> _Int:
        return id(self)


Ellipsis = _EllipsisType()


def _builtins_native_exact_ellipsis(specification: Any) -> Any:
    """Materialize the common exact one- and two-start ellipsis forms."""
    size = len(specification)
    if size != 3 and size != 4:
        return runtime.undefined
    if specification[size - 2] is not Ellipsis:
        return runtime.undefined
    prefix_size = size - 2
    first = specification[0]
    endpoint = specification[size - 1]
    if (
        first is True
        or first is False
        or endpoint is True
        or endpoint is False
        or not _builtins_exact_integer_primitive(first)
        or not _builtins_exact_integer_primitive(endpoint)
    ):
        return runtime.undefined
    last = first
    if prefix_size == 2:
        last = specification[1]
        if last is True or last is False or not _builtins_exact_integer_primitive(last):
            return runtime.undefined
        step = ρσ_operator_sub_exact(last, first)
    elif runtime.strict_equal(runtime.jstype(first), "bigint"):
        step = runtime.bigint(1)
    else:
        step = 1
    if step == 0:
        raise ValueError("ellipsis range step must not be zero")

    calculation_last = last
    calculation_endpoint = endpoint
    calculation_step = step
    if (
        runtime.strict_equal(runtime.jstype(last), "bigint")
        or runtime.strict_equal(runtime.jstype(endpoint), "bigint")
        or runtime.strict_equal(runtime.jstype(step), "bigint")
    ):
        calculation_last = runtime.bigint(last)
        calculation_endpoint = runtime.bigint(endpoint)
        calculation_step = runtime.bigint(step)

    tail_size = 0
    if calculation_step > 0 and calculation_endpoint >= calculation_last:
        tail_size = (calculation_endpoint - calculation_last) // calculation_step
    elif calculation_step < 0 and calculation_endpoint <= calculation_last:
        tail_size = (calculation_last - calculation_endpoint) // (-calculation_step)
    total_size = ρσ_operator_add_exact(prefix_size, tail_size)
    return list(runtime.exact_integer_range_values(first, step, total_size))


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
            raise AttributeError("property has no getter")
        if _builtins_get_member(self.fget, "length") == 0:
            return runtime.reflect.apply(self.fget, instance, [])
        return runtime.reflect.apply(self.fget, runtime.undefined, [instance])

    def __set__(self, instance: Any, value: Any) -> None:
        if self.fset is None:
            raise AttributeError("can't set attribute")
        if _builtins_get_member(self.fset, "length") == 1:
            runtime.reflect.apply(self.fset, instance, [value])
        else:
            runtime.reflect.apply(self.fset, runtime.undefined, [instance, value])

    def __delete__(self, instance: Any) -> None:
        if self.fdel is None:
            raise AttributeError("can't delete attribute")
        if _builtins_get_member(self.fdel, "length") == 0:
            runtime.reflect.apply(self.fdel, instance, [])
        else:
            runtime.reflect.apply(self.fdel, runtime.undefined, [instance])

    def getter(self, target_function: Any) -> SageProperty:
        return SageProperty(target_function, self.fset, self.fdel, self.__doc__)

    def setter(self, target_function: Any) -> SageProperty:
        return SageProperty(self.fget, target_function, self.fdel, self.__doc__)

    def deleter(self, target_function: Any) -> SageProperty:
        return SageProperty(self.fget, self.fset, target_function, self.__doc__)


def ρσ_property(
    fget: Any = None,
    fset: Any = None,
    fdel: Any = None,
    doc: Any = None,
) -> SageProperty:
    return SageProperty(fget, fset, fdel, doc)


def ρσ_ellipsis_range(*specification: Any) -> list[Any]:
    native = _builtins_native_exact_ellipsis(specification)
    if native is not runtime.undefined:
        return native
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
            raise ValueError("an ellipsis range requires a starting value")

        last = result[-1]
        if len(result) >= 2:
            step = ρσ_operator_sub_exact(last, result[-2])
            step_type = runtime.jstype(step)
            if step_type in ("object", "function"):
                simplify_method = runtime.reflect.get(step, "simplify")
                if runtime.jstype(simplify_method) == "function":
                    step = runtime.reflect.apply(simplify_method, step, [])
        elif runtime.strict_equal(runtime.jstype(last), "bigint"):
            step = runtime.bigint(1)
        else:
            step = 1
        native_step = runtime.jstype(step) in ("number", "bigint")
        numeric_step = 0.0
        if native_step:
            if runtime.equals(step, 0):
                raise ValueError("ellipsis range step must not be zero")
        else:
            # Symbolic constants and exact rationals deliberately keep their
            # exact values in the result.  Their comparison operators can,
            # however, produce symbolic relations rather than native booleans,
            # so use numerical approximations only to control iteration.
            numeric_step = float(step)
            if numeric_step == 0:
                raise ValueError("ellipsis range step must not be zero")

        current = ρσ_operator_add_exact(last, step)
        if native_step:
            if step > 0:
                while current <= value:
                    result.append(current)
                    current = ρσ_operator_add_exact(current, step)
            else:
                while current >= value:
                    result.append(current)
                    current = ρσ_operator_add_exact(current, step)
        else:
            numeric_endpoint = float(value)
            tolerance = abs(numeric_step) * 1e-12 + 1e-15
            if numeric_step > 0:
                while float(current) <= numeric_endpoint + tolerance:
                    result.append(current)
                    current = ρσ_operator_add_exact(current, step)
            else:
                while float(current) >= numeric_endpoint - tolerance:
                    result.append(current)
                    current = ρσ_operator_add_exact(current, step)
        saw_ellipsis = False

    if saw_ellipsis:
        raise ValueError("an ellipsis range requires an endpoint")
    return list(result)


def ρσ_ellipsis_iter(*specification: Any) -> Any:
    return iter(ρσ_ellipsis_range(*specification))


def ρσ_getattr_internal(
    value: Any,
    name: _Str,
    default_value: Any,
) -> Any:
    if not runtime.strict_equal(runtime.jstype(name), "string"):
        raise TypeError("attribute name must be string")
    if runtime.instance_of(value, runtime.error):
        # Native TypeError/ReferenceError/SyntaxError objects are part of the
        # Python exception hierarchy but do not pass through BaseException's
        # initializer. Supply the standard traceback protocol lazily.
        if name == "__traceback__":
            traceback = runtime.reflect.get(value, name)
            return value if traceback is runtime.undefined else traceback
        if name == "tb_next":
            # Native V8 stacks are currently represented as one traceback
            # carrier.  Expose the terminal link required by traceback-
            # walking code instead of raising AttributeError while an
            # unrelated exception is already being handled.
            return None
        if name in ("__cause__", "__context__"):
            context = runtime.reflect.get(value, name)
            return None if context is runtime.undefined else context
        if name == "__suppress_context__":
            suppressed = runtime.reflect.get(value, name)
            return False if suppressed is runtime.undefined else suppressed
        if name == "with_traceback":

            def native_with_traceback(traceback: Any) -> Any:
                runtime.reflect.set(value, "__traceback__", traceback)
                return value

            return native_with_traceback
    if (
        runtime.strict_equal(name, "__dict__")
        and value is not None
        and value is not runtime.undefined
        and (
            runtime.strict_equal(runtime.jstype(value), "object")
            or runtime.strict_equal(runtime.jstype(value), "function")
        )
    ):
        return _builtins_namespace_dict(value)
    if (
        runtime.strict_equal(name, "sort")
        and runtime.array.isArray(value)
        and _builtins_member_is_function(value, "pythonsort")
    ):
        python_sort = _builtins_get_member(value, "pythonsort")
        return runtime.reflect.apply(
            runtime.reflect.get(python_sort, "bind"),
            python_sort,
            [value],
        )
    if runtime.strict_equal(runtime.jstype(value), "string"):
        python_string_member = runtime.reflect.get(
            runtime.reflect.get(runtime.string_builtin, "prototype"),
            name,
        )
        if runtime.strict_equal(runtime.jstype(python_string_member), "function"):
            return runtime.reflect.apply(
                runtime.reflect.get(python_string_member, "bind"),
                python_string_member,
                [value],
            )
    if (
        runtime.strict_equal(name, "__next__")
        and not _builtins_member_is_function(value, "__next__")
        and _builtins_member_is_function(value, "next")
    ):

        def native_next() -> Any:
            return ρσ_next(value)

        return native_next
    if runtime.strict_equal(name, "__class__"):
        if _builtins_is_python_class(value):
            return ρσ_type
        if _builtins_get_member(
            value, "__sagejs_callable_instance__"
        ) is True and runtime.strict_equal(
            runtime.jstype(_builtins_get_member(value, "__python_type__")),
            "function",
        ):
            return _builtins_get_member(value, "__python_type__")
        if runtime.strict_equal(runtime.jstype(value), "function"):
            return ρσ_function_type
        return _builtins_get_member(value, "constructor")
    if runtime.strict_equal(name, "__get__") and runtime.strict_equal(
        runtime.jstype(value), "function"
    ):
        # Python function objects implement the descriptor protocol.  This is
        # observable when libraries retain an unbound method such as
        # ``object.__setattr__`` and explicitly bind it with ``.__get__``.
        def function_descriptor_get(
            instance: Any,
            owner: Any = None,
        ) -> Any:
            del owner
            if instance is None:
                return value
            return _builtins_bind_python_function(value, instance)

        return function_descriptor_get

    descriptor = runtime.undefined
    descriptor_resolution = runtime.undefined
    descriptor_kind = _BUILTINS_DESCRIPTOR_GENERIC
    owner = runtime.undefined
    if (
        not runtime.strict_equal(runtime.jstype(value), "function")
        and value is not None
        and value is not runtime.undefined
    ):
        has_own_member = runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            value,
            [name],
        )
        if has_own_member and not _builtins_data_descriptor_names.has(name):
            own_member = runtime.native_get(value, name)
            own_is_eager_bound_cache = (
                _builtins_get_member(
                    own_member,
                    "__sagejs_eager_bound_cache__",
                )
                is True
            )
            if own_member is runtime.undefined:
                if default_value is not _BUILTINS_MISSING:
                    return default_value
                raise AttributeError("The attribute " + name + " is not present")
            if not own_is_eager_bound_cache:
                return own_member
        else:
            own_is_eager_bound_cache = False
        owner = runtime.native_get(value, "constructor")
        descriptor_resolution = _builtins_class_attribute_resolution(owner, name)
        if descriptor_resolution is not runtime.undefined:
            descriptor_kind = descriptor_resolution[2]
            descriptor = descriptor_resolution[3]
            if runtime.strict_equal(
                descriptor_kind,
                _BUILTINS_DESCRIPTOR_NATIVE_GETTER,
            ):
                native_value = runtime.reflect.apply(descriptor, value, [])
                if native_value is runtime.undefined:
                    if default_value is not _BUILTINS_MISSING:
                        return default_value
                    raise AttributeError("The attribute " + name + " is not present")
                return native_value
            if runtime.strict_equal(
                descriptor_kind,
                _BUILTINS_DESCRIPTOR_DATA,
            ):
                return _builtins_call_member(descriptor, "__get__", [value, owner])
        # A data descriptor has now had its required precedence.  An own
        # non-callable value cannot require binding or another inherited
        # lookup, which is the overwhelmingly common path for mathematical
        # object payloads such as ``_mpf_`` and ``_ctxdata``.
        if has_own_member:
            own_member = runtime.native_get(value, name)
            if own_member is runtime.undefined:
                if default_value is not _BUILTINS_MISSING:
                    return default_value
                raise AttributeError("The attribute " + name + " is not present")
            if not (own_is_eager_bound_cache and descriptor is not runtime.undefined):
                # Python functions stored directly on an instance are
                # ordinary values.  A marked eager cache is only an
                # implementation detail, however: any different descriptor
                # later installed by a subclass or setattr() must shadow it.
                return own_member
        if runtime.strict_equal(
            descriptor_kind,
            _BUILTINS_DESCRIPTOR_NONDATA,
        ):
            if runtime.strict_equal(
                runtime.jstype(descriptor), "function"
            ) and not _builtins_is_python_class(descriptor):
                return _builtins_bind_python_function(descriptor, value)
            return _builtins_call_member(descriptor, "__get__", [value, owner])
        if runtime.strict_equal(
            descriptor_kind,
            _BUILTINS_DESCRIPTOR_DIRECT,
        ):
            return descriptor
    if runtime.strict_equal(runtime.jstype(value), "function"):
        if _builtins_is_baselib_function(value) and (
            runtime.strict_equal(name, "__globals__")
            or runtime.strict_equal(name, "__code__")
        ):
            return _builtins_get_member(value, name)
        class_prototype = _builtins_get_member(value, "prototype")
        if (
            not _builtins_has_member(value, name)
            and class_prototype is not runtime.undefined
            and _builtins_has_member(class_prototype, name)
        ):
            class_member = _builtins_get_member(class_prototype, name)
            if _builtins_has_member(class_member, "__classmethod__"):
                class_target = _builtins_get_member(class_member, "__func__")
                if runtime.strict_equal(runtime.jstype(class_target), "function"):
                    class_member = class_target
                return _builtins_bind_python_function(class_member, value)
            if _builtins_has_member(class_member, "__staticmethod__"):
                static_target = _builtins_get_member(class_member, "__func__")
                return (
                    static_target
                    if runtime.strict_equal(runtime.jstype(static_target), "function")
                    else class_member
                )
            if _builtins_member_is_function(class_member, "__get__"):
                return _builtins_call_member(class_member, "__get__", [None, value])
            if (
                runtime.strict_equal(runtime.jstype(class_member), "function")
                and not _builtins_is_python_class(class_member)
                and _builtins_get_member(class_member, "__python_descriptor__")
                is not True
            ):
                return runtime.unbound_method_adapter(class_member)
            return class_member
        # A Python class is an instance of its metaclass.  Methods inherited
        # from that metaclass (for example pytest's ``NodeMeta._create``) bind
        # to the class object, not to instances in the class prototype chain.
        python_metaclass = _builtins_get_member(value, "__python_type__")
        if (
            _builtins_is_python_class(value)
            and not _builtins_has_member(value, name)
            and runtime.strict_equal(runtime.jstype(python_metaclass), "function")
            and python_metaclass is not ρσ_type
            and python_metaclass is not value
        ):
            metaclass_prototype = _builtins_get_member(python_metaclass, "prototype")
            if metaclass_prototype is not runtime.undefined and _builtins_has_member(
                metaclass_prototype, name
            ):
                metaclass_member = _builtins_get_member(metaclass_prototype, name)
                if _builtins_has_member(metaclass_member, "__staticmethod__"):
                    static_target = _builtins_get_member(metaclass_member, "__func__")
                    return (
                        static_target
                        if runtime.strict_equal(
                            runtime.jstype(static_target), "function"
                        )
                        else metaclass_member
                    )
                if runtime.strict_equal(runtime.jstype(metaclass_member), "function"):
                    return _builtins_bind_python_function(metaclass_member, value)
                return metaclass_member
    if _builtins_has_member(value, name):
        member = _builtins_get_member(value, name)
        # ``undefined`` is an implementation detail of the JavaScript host,
        # not a Python attribute value.  Compiler metadata may leave optional
        # slots present with this value; Python's getattr/hasattr semantics
        # must treat them as absent and honor the caller's default.
        if member is runtime.undefined:
            if default_value is not _BUILTINS_MISSING:
                return default_value
            raise AttributeError("The attribute " + name + " is not present")
        member_is_own = runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            value,
            [name],
        )
        if runtime.strict_equal(
            runtime.jstype(value), "function"
        ) and _builtins_has_member(member, "__classmethod__"):
            class_target = _builtins_get_member(member, "__func__")
            if runtime.strict_equal(runtime.jstype(class_target), "function"):
                member = class_target
            return _builtins_bind_python_function(member, value)
        if _builtins_member_is_function(member, "__get__") and (
            not member_is_own or runtime.strict_equal(runtime.jstype(value), "function")
        ):
            instance = (
                None
                if runtime.strict_equal(runtime.jstype(value), "function")
                else value
            )
            member_owner = (
                value
                if instance is None
                else _builtins_get_member(value, "constructor")
            )
            return _builtins_call_member(member, "__get__", [instance, member_owner])
        if _builtins_has_member(member, "__staticmethod__"):
            static_target = _builtins_get_member(member, "__func__")
            return (
                static_target
                if runtime.strict_equal(runtime.jstype(static_target), "function")
                else member
            )
        if (
            _builtins_is_python_class(value)
            and runtime.strict_equal(runtime.jstype(member), "function")
            and not _builtins_is_python_class(member)
            and _builtins_get_member(member, "__python_descriptor__") is not True
        ):
            return runtime.unbound_method_adapter(member)
        if (
            runtime.strict_equal(runtime.jstype(member), "function")
            and not _builtins_is_python_class(member)
            and not _builtins_has_member(member, "__self__")
            and not runtime.reflect.apply(
                runtime.object.prototype.hasOwnProperty,
                value,
                [name],
            )
        ):
            if _builtins_has_member(member, "__python_descriptor__"):
                return _builtins_bind_python_function(member, value)
            receiver = value
            if _builtins_has_member(member, "__classmethod__"):
                if _builtins_is_python_class(value):
                    receiver = value
                else:
                    receiver = _builtins_get_member(value, "constructor")
            return runtime.reflect.apply(
                runtime.reflect.get(member, "bind"),
                member,
                [receiver],
            )
        return member
    # Native JavaScript inheritance represents only Python's primary base.
    # The descriptor search above follows the computed Python MRO; reuse that
    # authoritative result for ordinary non-data descriptors when the native
    # member lookup missed it.
    if descriptor is not runtime.undefined:
        if _builtins_member_is_function(descriptor, "__get__"):
            return _builtins_call_member(descriptor, "__get__", [value, owner])
        if _builtins_has_member(descriptor, "__staticmethod__"):
            static_target = _builtins_get_member(descriptor, "__func__")
            return (
                static_target
                if runtime.strict_equal(runtime.jstype(static_target), "function")
                else descriptor
            )
        if runtime.strict_equal(
            runtime.jstype(descriptor), "function"
        ) and not _builtins_is_python_class(descriptor):
            return _builtins_bind_python_function(descriptor, value)
        return descriptor
    if _builtins_member_is_function(value, "__getattr__"):
        try:
            return _builtins_call_member(value, "__getattr__", [name])
        except AttributeError:
            if default_value is not _BUILTINS_MISSING:
                return default_value
            raise
    if default_value is not _BUILTINS_MISSING:
        return default_value
    raise AttributeError("The attribute " + name + " is not present")


def ρσ_getattr(
    value: Any,
    name: _Str,
    default_value: Any = _BUILTINS_MISSING,
) -> Any:
    """Public Python `getattr` wrapper around fixed-arity lookup."""
    return ρσ_getattr_internal(value, name, default_value)


def ρσ_setattr(value: Any, name: _Str, member: Any) -> None:
    global _builtins_descriptor_epoch
    if not runtime.strict_equal(runtime.jstype(name), "string"):
        raise TypeError("attribute name must be string")
    if _builtins_get_member(value, "__sagejs_super__") is True:
        runtime.reflect.set(value, name, member)
        return
    if (
        value is ρσ_int
        or value is ρσ_bool
        or value is ρσ_float
        or value is runtime.string_builtin
    ):
        raise TypeError("cannot set attributes of built-in/extension type")
    if runtime.strict_equal(runtime.jstype(value), "function") and _builtins_has_member(
        value, "__self__"
    ):
        raise AttributeError("'method' object has no attribute '" + name + "'")
    if not runtime.strict_equal(runtime.jstype(value), "function"):
        attribute_setter = _builtins_get_member(value, "__setattr__")
        if runtime.strict_equal(runtime.jstype(attribute_setter), "function") and (
            attribute_setter is not _builtins_object_setattr
            and _builtins_get_member(attribute_setter, "__func__")
            is not _builtins_object_setattr
        ):
            return _builtins_call_member(value, "__setattr__", [name, member])
    descriptor_info = _builtins_class_attribute_descriptor(
        _builtins_get_member(value, "constructor"), name
    )
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(descriptor_info, "value")
        if _builtins_member_is_function(descriptor, "__set__"):
            return _builtins_call_member(descriptor, "__set__", [value, member])
    if _builtins_is_python_class(value):
        _builtins_descriptor_epoch += 1
        if _builtins_member_is_function(
            member, "__set__"
        ) or _builtins_member_is_function(member, "__delete__"):
            _builtins_data_descriptor_names.add(name)
        runtime.reflect.set(value.prototype, name, member)
        if _builtins_member_is_function(member, "__set_name__"):
            _builtins_call_member(member, "__set_name__", [value, name])
    if not runtime.reflect.set(value, name, member):
        own_descriptor = runtime.object.getOwnPropertyDescriptor(value, name)
        if (
            runtime.strict_equal(runtime.jstype(value), "function")
            and own_descriptor is not runtime.undefined
            and runtime.reflect.get(own_descriptor, "configurable") is True
        ):
            replacement = runtime.object.create(None)
            replacement.value = member
            replacement.writable = True
            replacement.configurable = True
            replacement.enumerable = True
            runtime.object.defineProperty(value, name, replacement)
            return
        raise AttributeError("object attribute '" + name + "' is read-only")


def ρσ_resolve_module_name(
    value: Any,
    name: _Str,
    module_builtins: Any,
) -> Any:
    """Resolve a module name declared only inside control flow.

    CPython's module `LOAD_NAME` checks the module namespace and then its
    builtins.  A JavaScript `var` emitted for a conditional import is
    hoisted, so a direct read would instead yield `undefined` and suppress
    idioms such as `try: set; except NameError: ...`.
    """
    if value is not runtime.undefined:
        return value
    if _builtins_has_member(module_builtins, name):
        builtin_value = _builtins_get_member(module_builtins, name)
        if builtin_value is not runtime.undefined:
            return builtin_value
    if _builtins_has_member(runtime.global_object, name):
        global_value = _builtins_get_member(runtime.global_object, name)
        if global_value is not runtime.undefined:
            return global_value
    raise NameError("name '" + name + "' is not defined")


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

    @property
    def co_filename(self) -> _Str:
        globals_mapping = _builtins_get_member(self.source_function, "__globals__")
        if globals_mapping is not runtime.undefined:
            filename = globals_mapping.get("__file__", "")
            if filename is not None:
                return filename
        return ""

    @property
    def co_name(self) -> _Str:
        return _builtins_get_member(self.source_function, "__name__")

    @property
    def co_qualname(self) -> _Str:
        qualname = _builtins_get_member(self.source_function, "__qualname__")
        if qualname is runtime.undefined:
            return self.co_name
        return qualname

    @property
    def co_firstlineno(self) -> _Int:
        # Exact line metadata will be attached by the source-mapping layer.
        # A stable one-based fallback still gives inspection/reporting tools
        # a valid source location instead of exposing a non-code sentinel.
        line = _builtins_get_member(self.source_function, "__firstlineno__")
        if line is runtime.undefined:
            return 1
        return line


def ρσ_function_code(source_function: Any) -> _FunctionCode:
    return _FunctionCode(source_function)


def _builtins_function_with_globals(
    source_function: Any,
    global_namespace: Any,
) -> Any:
    def rebound(*args: Any, **keywords: Any) -> Any:
        original_globals = _builtins_get_member(source_function, "__globals__")
        saved = []
        for pair in global_namespace.items():
            name = pair[0]
            existed = name in original_globals
            if existed:
                old_value = original_globals.__getitem__(name)
            else:
                old_value = None
            saved.append(runtime.math_tuple([name, existed, old_value]))
            original_globals.__setitem__(name, pair[1])
        try:
            result = source_function(*args, **keywords)
        finally:
            for entry in saved:
                if entry[1]:
                    original_globals.__setitem__(entry[0], entry[2])
                else:
                    try:
                        original_globals.__delitem__(entry[0])
                    except KeyError:
                        runtime.reflect.deleteProperty(runtime.global_object, entry[0])
        if (
            runtime.strict_equal(runtime.jstype(result), "function")
            and _builtins_get_member(result, "__python_descriptor__") is True
        ):
            return _builtins_function_with_globals(result, global_namespace)
        return result

    runtime.object.defineProperty(
        rebound,
        "__python_type__",
        {
            "value": ρσ_function_type,
            "writable": True,
            "configurable": True,
        },
    )
    runtime.reflect.set(rebound, "__python_descriptor__", True)
    runtime.object.defineProperty(
        rebound,
        "__code__",
        {
            "value": _builtins_get_member(source_function, "__code__"),
            "writable": True,
            "configurable": True,
        },
    )
    runtime.reflect.set(
        rebound, "__name__", _builtins_get_member(source_function, "__name__")
    )
    return rebound


def ρσ_function_type(
    code: Any,
    global_namespace: Any,
) -> Any:
    if not isinstance(code, _FunctionCode):
        raise TypeError("function() argument 1 must be a code object")
    if not isinstance(global_namespace, dict):
        raise TypeError("function() argument 2 must be a dict")
    return _builtins_function_with_globals(code.source_function, global_namespace)


def _builtins_dynamic_code_helper() -> Any:
    global _dynamic_code_helper_cache
    if _dynamic_code_helper_cache is runtime.undefined:
        module = runtime.require_module("./dynamic-code.js")
        _dynamic_code_helper_cache = runtime.reflect.get(module, "default")
    return _dynamic_code_helper_cache


def _builtins_code_source(source: Any) -> _Str:
    if runtime.strict_equal(runtime.jstype(source), "string"):
        return source
    if _builtins_has_member(source, "_values"):
        return str(source, "utf-8")
    raise TypeError("source must be a string, bytes, bytearray, or memoryview")


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
    if mode not in ("exec", "eval", "single"):
        raise ValueError("compile() mode must be 'exec', 'eval' or 'single'")
    helper = _builtins_dynamic_code_helper()
    try:
        native_code = runtime.reflect.apply(
            runtime.reflect.get(helper, "compile"),
            helper,
            [source, filename, mode],
        )
    except SyntaxError as error:
        if runtime.strict_equal(
            runtime.reflect.get(error, "sagejsErrorName"),
            "IndentationError",
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
    if caller_globals is runtime.undefined:
        current_module = runtime.reflect.get(
            runtime.global_object,
            "__sagejs_current_module_namespace__",
        )
        if current_module is not runtime.undefined:
            caller_globals = ρσ_live_scope_dict(  # type: ignore[name-defined]  # noqa: F821
                current_module
            )
            caller_locals = caller_globals
    if global_namespace is runtime.undefined or global_namespace is None:
        global_namespace = caller_globals
        default_locals = caller_locals
    else:
        default_locals = global_namespace
    if not isinstance(global_namespace, dict):
        raise TypeError("globals must be a dict")
    if local_namespace is runtime.undefined or local_namespace is None:
        local_namespace = default_locals
    if not isinstance(local_namespace, dict):
        raise TypeError("locals must be a mapping")
    return runtime.math_tuple([global_namespace, local_namespace])


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
        code = ρσ_compile(source, "<string>", "exec")

    execution_namespace = global_namespace.copy()
    if local_namespace is not global_namespace:
        execution_namespace.update(local_namespace)
    native_namespace = execution_namespace.as_object()
    live_scope = runtime.reflect.get(global_namespace, "_scope")
    if live_scope is not runtime.undefined:
        for key in runtime.object.keys(live_scope):
            if runtime.reflect.get(
                live_scope, key
            ) is runtime.undefined and not runtime.reflect.apply(
                runtime.object.prototype.hasOwnProperty,
                native_namespace,
                [key],
            ):
                # A JavaScript declaration may exist before the corresponding
                # Python global has ever been bound.  Keep it absent from the
                # globals dict, but tell the dynamic compiler to emit an
                # unbound-name check rather than reading the outer JS slot.
                runtime.reflect.set(native_namespace, key, runtime.undefined)
    if (
        caller_globals is not runtime.undefined
        and global_namespace is not caller_globals
    ):
        for key in caller_globals.keys():
            if key not in execution_namespace:
                runtime.reflect.set(
                    native_namespace,
                    key,
                    runtime.undefined,
                )
    helper = _builtins_dynamic_code_helper()
    prepared = runtime.reflect.apply(
        runtime.reflect.get(helper, "run"),
        helper,
        [code._native_code, native_namespace],
    )
    result = runtime.dynamic_eval(
        runtime.reflect.get(prepared, "javascript"),
        native_namespace,
        runtime.reflect.get(prepared, "moduleId"),
    )
    resulting_namespace = runtime.reflect.get(result, "namespace")
    for key in runtime.object.keys(resulting_namespace):
        if key == "__sagejs_eval_result__":
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
        source = ρσ_compile(source, "<string>", "eval")
    result = _builtins_run_dynamic(
        source,
        global_namespace,
        local_namespace,
        caller_globals,
        caller_locals,
    )
    return runtime.reflect.get(result, "completion")


def ρσ_exec(
    source: Any,
    global_namespace: Any = runtime.undefined,
    local_namespace: Any = runtime.undefined,
    caller_globals: Any = runtime.undefined,
    caller_locals: Any = runtime.undefined,
) -> None:
    if not isinstance(source, _Code):
        source = ρσ_compile(source, "<string>", "exec")
    result = _builtins_run_dynamic(
        source,
        global_namespace,
        local_namespace,
        caller_globals,
        caller_locals,
    )
    if (
        source.mode == "single"
        and runtime.reflect.get(result, "completion") is not runtime.undefined
        and runtime.reflect.get(result, "completion") is not None
    ):
        print(runtime.reflect.get(result, "completion"))
    return None


def ρσ_delattr(value: Any, name: _Str) -> None:
    global _builtins_descriptor_epoch
    if not runtime.strict_equal(runtime.jstype(name), "string"):
        raise TypeError("attribute name must be string")
    if _builtins_get_member(value, "__sagejs_super__") is True:
        runtime.reflect.deleteProperty(value, name)
        return
    if _builtins_is_python_class(value):
        class_has_own = runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            value,
            [name],
        )
        prototype = runtime.reflect.get(value, "prototype")
        prototype_has_own = runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            prototype,
            [name],
        )
        if not class_has_own and not prototype_has_own:
            raise AttributeError("object has no attribute '" + name + "'")
        if class_has_own:
            runtime.reflect.deleteProperty(value, name)
        if prototype_has_own:
            runtime.reflect.deleteProperty(prototype, name)
        _builtins_descriptor_epoch += 1
        return
    if not runtime.strict_equal(
        runtime.jstype(value), "function"
    ) and _builtins_member_is_function(value, "__delattr__"):
        return _builtins_call_member(value, "__delattr__", [name])
    property_deleter = _builtins_get_member(value, "ρσ_property_deleter_" + name)
    if runtime.strict_equal(runtime.jstype(property_deleter), "function"):
        runtime.reflect.apply(property_deleter, value, [])
        return
    descriptor_info = _builtins_class_attribute_descriptor(
        _builtins_get_member(value, "constructor"), name
    )
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(descriptor_info, "value")
        if _builtins_member_is_function(descriptor, "__delete__"):
            return _builtins_call_member(descriptor, "__delete__", [value])
    has_own = runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        [name],
    )
    if not has_own:
        raise AttributeError("object has no attribute '" + name + "'")
    if not runtime.reflect.deleteProperty(value, name):
        raise AttributeError("object attribute '" + name + "' cannot be deleted")


def ρσ_hasattr(value: Any, name: _Str) -> _Bool:
    if not runtime.strict_equal(runtime.jstype(name), "string"):
        raise TypeError("attribute name must be string")
    return (
        ρσ_getattr_internal(value, name, _BUILTINS_HASATTR_MISSING)
        is not _BUILTINS_HASATTR_MISSING
    )


def ρσ_py_super(
    cls: Any = runtime.undefined,
    instance: Any = runtime.undefined,
) -> Any:
    if runtime.strict_equal(cls, runtime.undefined):
        raise RuntimeError("super(): no arguments")

    def mro_contains(candidate_mro: Any, candidate_cls: Any) -> _Bool:
        candidate_prototype = _builtins_get_member(candidate_cls, "prototype")
        if candidate_mro:
            for entry in candidate_mro:
                if (
                    entry is candidate_cls
                    or _builtins_get_member(entry, "prototype") is candidate_prototype
                ):
                    return True
        return False

    represented_class = (
        instance
        if _builtins_is_python_class(instance)
        else _builtins_get_member(instance, "constructor")
    )
    represented_mro = _builtins_get_member(represented_class, "__mro__")
    python_subtype = mro_contains(represented_mro, cls)
    class_subtype = _builtins_is_python_class(instance) and (
        instance is cls
        or runtime.instance_of(runtime.reflect.get(instance, "prototype"), cls)
        or _builtins_get_member(instance, "__python_type__") is cls
        or (
            _builtins_is_python_class(_builtins_get_member(instance, "__python_type__"))
            and runtime.instance_of(
                runtime.reflect.get(
                    _builtins_get_member(instance, "__python_type__"),
                    "prototype",
                ),
                cls,
            )
        )
    )
    if not runtime.strict_equal(runtime.jstype(cls), "function") or (
        not runtime.instance_of(instance, cls)
        and not class_subtype
        and not python_subtype
    ):
        raise TypeError("super(type, obj): obj must be an instance or subtype of type")

    instance_class = represented_class
    mro = _builtins_get_member(instance_class, "__mro__")

    # A class object is an instance of its metaclass.  Inside a metaclass
    # method, ``super()`` therefore follows the metaclass MRO, whereas inside
    # an ordinary classmethod it follows the class MRO.  Host functions
    # represent both cases, so distinguish them by where ``cls`` occurs.
    if _builtins_is_python_class(instance) and not mro_contains(mro, cls):
        metaclass = _builtins_get_member(instance, "__python_type__")
        metaclass_mro = _builtins_get_member(metaclass, "__mro__")
        if mro_contains(metaclass_mro, cls):
            instance_class = metaclass
            mro = metaclass_mro
    if not mro:
        mro = _builtins_get_member(cls, "__mro__")

    def lookup_super_member(name: Any) -> Any:
        found_cls = False
        cls_prototype = _builtins_get_member(cls, "prototype")
        if mro:
            for base in mro:
                if not found_cls:
                    if (
                        base is cls
                        or _builtins_get_member(base, "prototype") is cls_prototype
                    ):
                        found_cls = True
                    continue
                base_prototype = _builtins_get_member(base, "prototype")
                if base_prototype is None or base_prototype is runtime.undefined:
                    continue
                descriptor = runtime.object.getOwnPropertyDescriptor(
                    base_prototype, name
                )
                if descriptor is not runtime.undefined:
                    return runtime.reflect.get(base_prototype, name, instance)
        return runtime.undefined

    def super_repr() -> _Str:
        return (
            "<super: <class '"
            + _builtins_callable_name(cls)
            + "'>, <"
            + _builtins_callable_name(instance.constructor)
            + " object>>"
        )

    target = {
        "__repr__": super_repr,
        "__str__": super_repr,
        "toString": super_repr,
        "__sagejs_super__": True,
    }

    def get_member(
        proxy_target: Any,
        name: Any,
        _receiver: Any,
    ) -> Any:
        if runtime.reflect.has(proxy_target, name):
            return runtime.reflect.get(proxy_target, name)
        member = lookup_super_member(name)
        if member is runtime.undefined:
            return runtime.undefined
        if runtime.strict_equal(runtime.jstype(member), "function"):
            if _builtins_has_member(member, "__staticmethod__"):
                return member
            receiver = instance
            if _builtins_has_member(member, "__classmethod__"):
                receiver = instance_class
            bound = runtime.reflect.apply(
                runtime.reflect.get(member, "bind"),
                member,
                [receiver],
            )
            # Function.bind preserves execution semantics but discards the
            # Python signature metadata used by keyword interpolation.
            runtime.object.assign(bound, member)
            runtime.reflect.set(bound, "__self__", receiver)
            runtime.reflect.set(bound, "__func__", member)
            return bound
        if _builtins_member_is_function(member, "__get__"):
            return _builtins_call_member(member, "__get__", [instance, instance_class])
        return member

    def has_member(proxy_target: Any, name: Any) -> _Bool:
        return (
            runtime.reflect.has(proxy_target, name)
            or lookup_super_member(name) is not runtime.undefined
        )

    def reject_assignment(
        _target: Any,
        _name: Any,
        _value: Any,
        _receiver: Any,
    ) -> _Bool:
        raise AttributeError("'super' object has no writable attributes")

    def reject_deletion(_target: Any, _name: Any) -> _Bool:
        raise AttributeError("'super' object has no writable attributes")

    return runtime.reflect.construct(
        runtime.proxy_class,
        [
            target,
            {
                "get": get_member,
                "has": has_member,
                "set": reject_assignment,
                "deleteProperty": reject_deletion,
            },
        ],
    )


def ρσ_len(value: Any) -> _Int:
    if ρσ_arraylike(value):
        return value.length
    if _builtins_member_is_function(value, "__len__"):
        return _builtins_call_member(value, "__len__", [])
    if (
        _builtins_get_member(value, "constructor") is runtime.set_class
        or _builtins_get_member(value, "constructor") is runtime.map_class
    ):
        return value.size
    if runtime.strict_equal(runtime.jstype(value), "object") or runtime.strict_equal(
        runtime.jstype(value), "function"
    ):
        return runtime.object.keys(value).length
    raise TypeError("object has no len()")


def ρσ_get_module(name: _Str) -> Any:
    modules = runtime.reflect.get(runtime.global_object, "ρσ_modules")
    if modules is runtime.undefined:
        modules = runtime.modules
    module = runtime.reflect.get(modules, name)
    if module is not runtime.undefined:
        return module
    baselib_modules = runtime.reflect.get(
        runtime.global_object,
        "__sagejs_baselib_modules__",
    )
    if baselib_modules is runtime.undefined:
        return runtime.undefined
    return runtime.reflect.get(baselib_modules, name)


def ρσ_pow(
    left: Any,
    right: Any,
    modulus: Any = runtime.undefined,
) -> Any:
    if modulus is runtime.undefined or modulus is None:
        if (
            _builtins_exact_integer_primitive(left)
            and _builtins_exact_integer_primitive(right)
            and right >= 0
        ):
            return runtime.normalize_integer(
                runtime.native_pow(runtime.bigint(left), runtime.bigint(right))
            )
        return ρσ_operator_pow(left, right)

    if (
        not _builtins_exact_integer_primitive(left)
        or not _builtins_exact_integer_primitive(right)
        or not _builtins_exact_integer_primitive(modulus)
    ):
        raise TypeError(
            "pow() 3rd argument not allowed unless all arguments are integers"
        )
    exponent = runtime.bigint(right)
    modulus_bigint = runtime.bigint(modulus)
    if modulus_bigint == 0:
        raise ValueError("pow() 3rd argument cannot be 0")
    if exponent < 0:
        raise ValueError("base is not invertible for the given modulus")
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


def _builtins_type_call(cls: Any, *args: Any, **keywords: Any) -> Any:
    """Implement `type.__call__` after a custom metaclass delegates."""
    interpolate = runtime.reflect.get(runtime.global_object, "ρσ_interpolate_kwargs")
    call_args = list(args)
    runtime.reflect.apply(runtime.array.prototype.push, call_args, [keywords])
    allocator = ρσ_getattr(cls, "__new__", None)
    if (
        runtime.strict_equal(runtime.jstype(allocator), "function")
        and allocator is not _builtins_object_new
    ):
        allocator_args = [cls]
        allocator_args.extend(call_args)
        instance = runtime.reflect.apply(
            interpolate,
            runtime.undefined,
            [runtime.undefined, allocator, allocator_args],
        )
    else:
        instance = runtime.object.create(runtime.reflect.get(cls, "prototype"))
    if not runtime.instance_of(instance, cls):
        return instance
    initializer = ρσ_getattr(instance, "__init__", None)
    if runtime.strict_equal(runtime.jstype(initializer), "function"):
        # ``initializer`` is already descriptor-bound.  Calling it through
        # the compiler's generic callable fallback would resolve ``__call__``
        # a second time and lose the keyword packet.
        runtime.reflect.apply(
            interpolate,
            runtime.undefined,
            [runtime.undefined, initializer, call_args],
        )
    return instance


def ρσ_type(*values: Any) -> Any:
    if len(values) == 3:
        class_name = values[0]
        bases = values[1]
        namespace = values[2]
        if not runtime.strict_equal(runtime.jstype(class_name), "string"):
            raise TypeError("type() argument 1 must be str")
        if not runtime.array.isArray(bases):
            raise TypeError("type() argument 2 must be tuple")
        if len(bases) == 0:
            bases = runtime.math_tuple([SageObject])
        parent = bases[0]
        if (
            not _builtins_is_python_class(parent)
            and parent is not runtime.tuple_builtin
        ):
            raise TypeError("type() bases must be types")
        if not _builtins_member_is_function(namespace, "items"):
            raise TypeError("type() argument 3 must be dict")

        def dynamic_class(*args: Any, **keywords: Any) -> Any:
            return _builtins_type_call(dynamic_class, *args, **keywords)

        prototype = runtime.object.create(runtime.reflect.get(parent, "prototype"))
        runtime.reflect.set(prototype, "constructor", dynamic_class)
        runtime.reflect.set(dynamic_class, "prototype", prototype)
        runtime.reflect.set(dynamic_class, "__name__", class_name)
        runtime.reflect.set(dynamic_class, "__qualname__", class_name)
        runtime.reflect.set(dynamic_class, "__bases__", runtime.math_tuple(list(bases)))
        runtime.reflect.set(prototype, "__bases__", runtime.math_tuple(list(bases)))
        for pair in namespace.items():
            member_name = pair[0]
            member = pair[1]
            # These slots describe the newly allocated class itself.  A
            # temporary compiler-emitted class handed to a metaclass can have
            # stale structural metadata (notably during circular imports),
            # and CPython does not treat either name as an override supplied
            # by the class namespace.
            if member_name in ("__bases__", "__mro__"):
                continue
            if (
                runtime.strict_equal(runtime.jstype(member), "function")
                and _builtins_get_member(member, "__staticmethod__") is not True
            ):
                # Functions supplied to ``type(name, bases, namespace)`` are
                # descriptors.  Compiler-emitted class methods normally rely
                # on their statically known class binding path, so retain this
                # explicit marker when rebuilding the class through a custom
                # metaclass.
                runtime.reflect.set(member, "__python_descriptor__", True)
            runtime.reflect.set(prototype, member_name, member)
            if _builtins_member_is_function(
                member, "__set__"
            ) or _builtins_member_is_function(member, "__delete__"):
                _builtins_data_descriptor_names.add(member_name)
            if runtime.string_find(member_name, "__") != 0 or member_name in (
                "__annotations__",
                "__doc__",
                "__module__",
                "__name__",
                "__qualname__",
                "__slots__",
            ):
                runtime.reflect.set(dynamic_class, member_name, member)
            if _builtins_member_is_function(member, "__set_name__"):
                _builtins_call_member(
                    member,
                    "__set_name__",
                    [dynamic_class, member_name],
                )
        compute_mro = runtime.reflect.get(runtime.global_object, "ρσ_compute_mro")
        if runtime.strict_equal(runtime.jstype(compute_mro), "function"):
            runtime.reflect.set(
                dynamic_class,
                "__mro__",
                runtime.reflect.apply(
                    compute_mro,
                    runtime.undefined,
                    [dynamic_class, bases],
                ),
            )
        runtime.object.defineProperty(
            dynamic_class,
            "__python_type__",
            {"value": ρσ_type, "writable": True, "configurable": True},
        )
        runtime.set_class_repr(dynamic_class, "<class '" + class_name + "'>")
        return dynamic_class
    if len(values) != 1:
        raise TypeError("type() takes 1 or 3 arguments")
    value = values[0]
    if value is None:
        return _NoneType
    value_type = ρσ_python_jstype(value)
    module_namespaces = runtime.reflect.get(
        runtime.global_object, "__sagejs_module_namespaces__"
    )
    module_type = runtime.reflect.get(
        runtime.global_object, "__sagejs_module_type_class__"
    )
    if (
        module_namespaces is not runtime.undefined
        and module_type is not runtime.undefined
        and runtime.reflect.apply(
            runtime.reflect.get(module_namespaces, "has"),
            module_namespaces,
            [value],
        )
    ):
        return module_type
    if runtime.strict_equal(value_type, "number"):
        if runtime.number.isSafeInteger(value):
            return ρσ_int
        return ρσ_float
    if runtime.strict_equal(value_type, "bigint"):
        return ρσ_int
    if runtime.strict_equal(value_type, "boolean"):
        return ρσ_bool
    if runtime.strict_equal(value_type, "string"):
        return runtime.string_builtin
    if runtime.array.isArray(value):
        constructor = _builtins_get_member(value, "constructor")
        if constructor is not runtime.list_constructor and _builtins_is_python_class(
            constructor
        ):
            return constructor
        if runtime.object.isFrozen(value):
            return ρσ_tuple
        return runtime.list_constructor
    python_type = _builtins_get_member(value, "__python_type__")
    if runtime.strict_equal(runtime.jstype(python_type), "function"):
        return python_type
    if _builtins_is_baselib_function(value) and not _builtins_is_python_class(value):
        return ρσ_function_type
    if _builtins_is_python_class(value):
        return ρσ_type
    return _builtins_get_member(value, "constructor")


runtime.reflect.set(
    runtime.reflect.get(ρσ_type, "prototype"),
    "__call__",
    runtime.native_method_adapter(_builtins_type_call),
)


def _builtins_type_class_getitem(type_arguments: Any) -> Any:
    return ρσ_generic_alias(  # type: ignore[name-defined]  # noqa: F821
        ρσ_type, type_arguments
    )


runtime.reflect.set(ρσ_type, "__class_getitem__", _builtins_type_class_getitem)


def _builtins_type_new(
    metaclass: Any,
    class_name: _Str,
    bases: Any,
    namespace: Any,
) -> Any:
    """Implement the unbound `type.__new__` protocol used by metaclasses."""
    # This is the allocation half of the metaclass protocol, so it must call
    # the builtin implementation directly.  An ordinary Python-level
    # ``ρσ_type(...)`` call is deliberately dispatched through
    # ``type.__call__``; doing that from ``type.__new__`` recursively enters
    # instance construction and can mistake the metaclass for the new class's
    # bases.
    return runtime.reflect.apply(
        ρσ_type,
        runtime.undefined,
        [class_name, bases, namespace],
    )


runtime.reflect.set(_builtins_type_new, "__staticmethod__", True)
runtime.reflect.set(ρσ_type, "__new__", _builtins_type_new)


def ρσ_apply_metaclass(
    metaclass: Any,
    class_name: _Str,
    bases: Any,
    compiled_class: Any,
) -> Any:
    """Create a class through `metaclass` from a compiled class body."""
    namespace = _builtins_namespace_dict(compiled_class)
    # Class construction invokes ``type(metaclass).__call__``.  It must not
    # invoke a ``__call__`` defined *by* the metaclass: that hook constructs
    # instances of the eventual class (RegexLexerMeta is a prominent real
    # example), not instances of the metaclass itself.  Go directly through
    # the metaclass allocation protocol here.
    allocator = _builtins_get_member(metaclass, "__new__")
    if not runtime.strict_equal(runtime.jstype(allocator), "function"):
        allocator = _builtins_type_new
    created = runtime.reflect.apply(
        allocator,
        runtime.undefined,
        [metaclass, class_name, bases, namespace],
    )
    initializer = _builtins_get_member(
        _builtins_get_member(metaclass, "prototype"),
        "__init__",
    )
    if (
        runtime.strict_equal(runtime.jstype(initializer), "function")
        and _builtins_get_member(initializer, "__sagejs_synthetic_init__") is not True
    ):
        runtime.reflect.apply(
            initializer,
            created,
            [class_name, bases, namespace],
        )
    decorators = runtime.reflect.get(compiled_class, "ρσ_decorators")
    if decorators is not runtime.undefined:
        runtime.reflect.set(created, "ρσ_decorators", decorators)
    runtime.object.defineProperty(
        created,
        "__python_type__",
        {"value": metaclass, "writable": True, "configurable": True},
    )
    return created


def ρσ_apply_inherited_metaclass(
    class_name: _Str,
    bases: Any,
    compiled_class: Any,
) -> Any:
    """Apply the non-default metaclass inherited from a base class."""
    selected = runtime.undefined
    for base in bases:
        candidate = _builtins_get_member(base, "__python_type__")
        if candidate is runtime.undefined or candidate is ρσ_type:
            continue
        if selected is runtime.undefined:
            selected = candidate
        elif selected is not candidate:
            raise TypeError(
                "metaclass conflict: the metaclass of a derived class must "
                "be a subclass of the metaclasses of all its bases"
            )
    if selected is runtime.undefined:
        return compiled_class
    return ρσ_apply_metaclass(selected, class_name, bases, compiled_class)


def ρσ_issubclass(cls: Any, candidates: Any) -> _Bool:
    if runtime.array.isArray(candidates):
        for candidate in candidates:
            if ρσ_issubclass(cls, candidate):
                return True
        return False
    if not runtime.strict_equal(
        runtime.jstype(cls), "function"
    ) or not runtime.strict_equal(runtime.jstype(candidates), "function"):
        raise TypeError("issubclass() arg 1 must be a class")
    if cls is candidates:
        return True
    registry = _builtins_get_member(candidates, "_abc_registry")
    if runtime.array.isArray(registry):
        for registered_class in registry:
            if ρσ_issubclass(cls, registered_class):
                return True
    bases = _builtins_get_member(cls, "__bases__")
    if runtime.array.isArray(bases):
        for base in bases:
            if ρσ_issubclass(base, candidates):
                return True
    return runtime.instance_of(
        runtime.reflect.get(cls, "prototype"),
        candidates,
    )


def ρσ_divmod(left: Any, right: Any) -> Any:
    if (
        runtime.strict_equal(runtime.jstype(left), "number")
        and runtime.strict_equal(runtime.jstype(right), "number")
        and runtime.number.isSafeInteger(left)
        and runtime.number.isSafeInteger(right)
    ):
        if right == 0:
            raise runtime.zero_division_error("integer division or modulo by zero")
        quotient = runtime.math.floor(runtime.native_div(left, right))
        remainder = runtime.native_sub(left, runtime.native_mul(quotient, right))
        return runtime.math_tuple([quotient, remainder])
    if runtime.equals(right, 0):
        raise runtime.zero_division_error("integer division or modulo by zero")
    quotient = ρσ_operator_floordiv(left, right)
    remainder = ρσ_operator_mod(left, right)
    return runtime.math_tuple([quotient, remainder])


def ρσ_factor(value: Any) -> Any:
    r"""
    Return the exact factorization of an integer or factorable element.

    Integer factorization is computed by FLINT and returned as a Sage-style
    factorization object, so it can be iterated over as `(prime, exponent)`
    pairs.

    ### Examples

    ```sage
    sage: factor(2026)
    2 * 1013
    sage: list(factor(-12))
    [(2, 2), (3, 1)]
    ```

    JavaScript `number` inputs must be safe integers. Sage integer literals
    automatically use `BigInt` when necessary.
    """
    if _builtins_member_is_function(value, "factor"):
        return _builtins_call_member(value, "factor", [])
    if runtime.strict_equal(runtime.jstype(value), "number"):
        if not runtime.number.isSafeInteger(value):
            raise TypeError(
                "factor() requires a safe integer; use a BigInt for larger values"
            )
        value = runtime.bigint(value)
    elif not runtime.strict_equal(runtime.jstype(value), "bigint"):
        raise TypeError("factor() requires an integer")

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


def ρσ_gcd(
    left: Any,
    right: Any = runtime.undefined,
) -> Any:
    if right is runtime.undefined:
        values = list(left)
        answer = runtime.bigint(0)
        for value in values:
            answer = runtime.integer_bigint(ρσ_gcd(answer, value))
        return runtime.normalize_integer(answer)
    if (
        runtime.strict_equal(runtime.jstype(left), "number")
        or runtime.strict_equal(runtime.jstype(left), "bigint")
    ) and (
        runtime.strict_equal(runtime.jstype(right), "number")
        or runtime.strict_equal(runtime.jstype(right), "bigint")
    ):
        return runtime.normalize_integer(
            runtime.flint_backend().gcd(runtime.bigint(left), runtime.bigint(right))
        )
    if _builtins_member_is_function(left, "gcd"):
        return _builtins_call_member(left, "gcd", [right])
    if _builtins_member_is_function(right, "gcd"):
        return _builtins_call_member(right, "gcd", [left])
    raise TypeError("gcd() is not defined for these arguments")


def ρσ_next_prime(value: Any) -> Any:
    """Return the smallest prime strictly greater than `value` using FLINT."""
    if runtime.strict_equal(runtime.jstype(value), "number"):
        if not runtime.number.isSafeInteger(value):
            raise TypeError("next_prime() requires an integer")
        value = runtime.bigint(value)
    elif not runtime.strict_equal(runtime.jstype(value), "bigint"):
        raise TypeError("next_prime() requires an integer")
    return runtime.normalize_integer(runtime.flint_backend().nextPrime(value))


def previous_prime(value: Any) -> Any:
    if not runtime.is_exact_integer(value):
        raise TypeError("previous_prime() requires an integer")
    candidate = runtime.integer_bigint(value) - runtime.bigint(1)
    while candidate >= runtime.bigint(2):
        if runtime.flint_backend().isPrime(candidate):
            return runtime.normalize_integer(candidate)
        candidate -= runtime.bigint(1)
    raise ValueError("no previous prime")


def ρσ_is_prime(value: Any) -> _Bool:
    """Return whether `value` is prime, using FLINT's primality test."""
    if runtime.strict_equal(runtime.jstype(value), "number"):
        if not runtime.number.isSafeInteger(value):
            return False
        value = runtime.bigint(value)
    elif not runtime.strict_equal(runtime.jstype(value), "bigint"):
        raise TypeError("is_prime() requires an integer")
    if runtime.native_lt(value, runtime.bigint(2)):
        return False
    return runtime.flint_backend().isPrime(value)


def ρσ_prime_range(
    start: Any,
    stop: Any = None,
) -> Any:
    r"""
    Return the primes in the half-open interval `[start, stop)`.

    With one argument, return the primes from 2 up to (but not including)
    `start`.

    ### Examples

    ```sage
    sage: prime_range(10)
    [2, 3, 5, 7]
    sage: prime_range(10, 20)
    [11, 13, 17, 19]
    ```
    """
    if stop is None:
        stop = start
        start = 2
    if not runtime.is_exact_integer(start):
        raise TypeError("prime_range() bounds must be integers")
    if not runtime.is_exact_integer(stop):
        raise TypeError("prime_range() bounds must be integers")
    lower = runtime.bigint(start)
    upper = runtime.bigint(stop)
    answer = []
    if runtime.native_le(upper, runtime.bigint(2)):
        return answer
    candidate = runtime.flint_backend().nextPrime(
        runtime.native_sub(lower, runtime.bigint(1))
    )
    while runtime.native_lt(candidate, upper):
        answer.append(runtime.normalize_integer(candidate))
        candidate = runtime.flint_backend().nextPrime(candidate)
    return answer


def ρσ_prime_divisors(value: Any) -> Any:
    return [pair[0] for pair in ρσ_factor(value)]


prime_factors = ρσ_prime_divisors


def power_mod(base: Any, exponent: Any, modulus: Any) -> Any:
    base = runtime.integer_bigint(base)
    exponent = runtime.integer_bigint(exponent)
    modulus = runtime.integer_bigint(modulus)
    if modulus <= runtime.bigint(0):
        raise ValueError("modulus must be positive")
    if exponent < runtime.bigint(0):
        base = runtime.modular_inverse(base, modulus)
        exponent = runtime.native_neg(exponent)
    return runtime.normalize_integer(runtime.modular_power(base, exponent, modulus))


def random_prime(
    upper_bound: Any,
    proof: Any = True,
    lbound: Any = 2,
) -> Any:
    del proof
    upper = runtime.integer_bigint(upper_bound)
    lower = runtime.integer_bigint(lbound)
    if lower < runtime.bigint(2):
        lower = runtime.bigint(2)
    if lower > upper:
        raise ValueError("the lower bound must not exceed the upper bound")
    span = runtime.native_add(runtime.native_sub(upper, lower), runtime.bigint(1))
    start = runtime.native_add(
        lower,
        runtime.bigint(
            runtime.math.floor(runtime.math.random() * runtime.number(span))
        ),
    )
    answer = runtime.flint_backend().nextPrime(
        runtime.native_sub(start, runtime.bigint(1))
    )
    if answer > upper:
        answer = runtime.flint_backend().nextPrime(
            runtime.native_sub(lower, runtime.bigint(1))
        )
    if answer > upper:
        raise ValueError("no prime in the specified interval")
    return runtime.normalize_integer(answer)


def legendre_symbol(numerator: Any, prime: Any) -> _Int:
    value = runtime.integer_bigint(numerator)
    modulus = runtime.integer_bigint(prime)
    if (
        modulus <= runtime.bigint(2)
        or runtime.native_mod(modulus, runtime.bigint(2)) == 0
        or not runtime.flint_backend().isPrime(modulus)
    ):
        raise ValueError("the second argument must be an odd prime")
    value = runtime.native_mod(value, modulus)
    if value == runtime.bigint(0):
        return 0
    residue = runtime.modular_power(
        value,
        runtime.native_div(
            runtime.native_sub(modulus, runtime.bigint(1)),
            runtime.bigint(2),
        ),
        modulus,
    )
    return 1 if residue == runtime.bigint(1) else -1


def _discrete_log_ceil_sqrt(value: Any) -> Any:
    """Return the exact ceiling of the square root of a positive integer."""
    lower = runtime.bigint(0)
    upper = runtime.bigint(1)
    while runtime.native_mul(upper, upper) < value:
        lower = upper
        upper = runtime.native_mul(upper, runtime.bigint(2))
    while runtime.native_add(lower, runtime.bigint(1)) < upper:
        middle = runtime.native_div(runtime.native_add(lower, upper), runtime.bigint(2))
        if runtime.native_mul(middle, middle) < value:
            lower = middle
        else:
            upper = middle
    return upper


def _discrete_log_bsgs(target: Any, base: Any, order: Any) -> Any:
    """Solve one bounded discrete log using baby-step/giant-step."""
    step = _discrete_log_ceil_sqrt(order)
    table = dict()
    current = base ** runtime.bigint(0)
    index = runtime.bigint(0)
    while index < step:
        if current not in table:
            table.__setitem__(current, runtime.normalize_integer(index))
        current = current * base
        index += runtime.bigint(1)
    factor = base ** runtime.native_neg(step)
    current = target
    giant_index = runtime.bigint(0)
    while giant_index <= step:
        if current in table:
            answer = runtime.native_add(
                runtime.native_mul(giant_index, step),
                runtime.integer_bigint(table.__getitem__(current)),
            )
            if answer < order:
                return answer
        current = current * factor
        giant_index += runtime.bigint(1)
    raise ValueError("no discrete logarithm found")


def discrete_log(
    target: Any,
    base: Any,
    ord: Any = runtime.undefined,
    operation: Any = "*",
) -> Any:
    r"""
    Return an exponent `x` such that `base^x == target`.

    The group order is factored and Pohlig–Hellman digit lifting reduces each
    prime-power component to baby-step/giant-step problems of prime order.
    This follows Sage's generic multiplicative discrete-log strategy.

    ### Examples

    ```sage
    sage: g = GF(1009, modulus='primitive').gen()
    sage: discrete_log(g^777, g)
    777
    ```
    """
    if operation != "*":
        raise NotImplementedError(
            "only multiplicative discrete logarithms are implemented"
        )
    if ord is runtime.undefined or ord is None:
        if not _builtins_member_is_function(base, "multiplicative_order"):
            raise TypeError("the base does not provide a multiplicative order")
        ord = _builtins_call_member(base, "multiplicative_order", [])
    order = runtime.integer_bigint(ord)
    if order <= runtime.bigint(0):
        raise ValueError("the order must be positive")

    identity = base ** runtime.bigint(0)
    factors = []
    for factor_prime, original_exponent in ρσ_factor(order):
        prime = runtime.integer_bigint(factor_prime)
        factor_exponent = original_exponent
        while factor_exponent > 0:
            reduced_order = runtime.native_div(order, prime)
            if base**reduced_order != identity:
                break
            order = reduced_order
            factor_exponent -= 1
        if factor_exponent > 0:
            factors.append((prime, factor_exponent))

    if order == runtime.bigint(1):
        if target == identity:
            return 0
        raise ValueError("no discrete logarithm found")

    residues = []
    moduli = []
    for factor_prime, factor_exponent in factors:
        prime = runtime.integer_bigint(factor_prime)
        gamma = base ** runtime.native_div(order, prime)
        residue = runtime.bigint(0)
        place = runtime.bigint(1)
        for _digit in range(factor_exponent):
            next_place = runtime.native_mul(place, prime)
            corrected = target * (base ** runtime.native_neg(residue))
            lifted = corrected ** runtime.native_div(order, next_place)
            coefficient = _discrete_log_bsgs(lifted, gamma, prime)
            residue = runtime.native_add(
                residue, runtime.native_mul(coefficient, place)
            )
            place = next_place
        residues.append(runtime.normalize_integer(residue))
        moduli.append(runtime.normalize_integer(place))

    answer = runtime.integer_bigint(crt(residues, moduli))
    answer = runtime.native_mod(answer, order)
    if base**answer != target:
        raise ValueError("no discrete logarithm found")
    return runtime.normalize_integer(answer)


def ρσ_divisors(value: Any) -> Any:
    if _builtins_member_is_function(value, "divisors"):
        return _builtins_call_member(value, "divisors", [])
    if not runtime.is_exact_integer(value):
        raise TypeError("divisors() requires an integer")
    integer = runtime.integer_bigint(value)
    if runtime.strict_equal(integer, runtime.bigint(0)):
        raise ValueError("divisors() is not defined for 0")
    if runtime.native_lt(integer, runtime.bigint(0)):
        integer = runtime.native_neg(integer)
    answer = [1]
    for prime, exponent in ρσ_factor(integer):
        previous = answer
        answer = []
        power = 1
        for _ in range(exponent + 1):
            for divisor in previous:
                answer.append(ρσ_operator_mul_exact(divisor, power))
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


class LatexExpr:
    def __init__(self, value: Any) -> None:
        self._value = str(value)

    def __repr__(self) -> str:
        return self._value

    __str__ = __repr__
    toString = __repr__

    def __eq__(self, other: Any) -> _Bool:
        return self._value == str(other)


def latex(value: Any) -> LatexExpr:
    """Return a compact LaTeX expression for `value`."""
    if _builtins_member_is_function(value, "_latex_"):
        return LatexExpr(_builtins_call_member(value, "_latex_", []))
    return LatexExpr(value)


_prime_pi_primes = None
_prime_pi_checked_through = 1


def prime_pi(value: Any) -> Any:
    r"""
    Return the number of primes less than or equal to `value`.

    Results are exact.  Moderate bounds are served by an incremental prime
    cache, while large isolated bounds use Lehmer's combinatorial algorithm.
    As in Sage, inputs are limited to integers below `2^63`.

    ### Examples

    ```sage
    sage: prime_pi(10)
    4
    sage: prime_pi(100)
    25
    sage: prime_pi(10^12)
    37607912018
    ```
    """
    global _prime_pi_checked_through, _prime_pi_primes
    if _prime_pi_primes is None:
        _prime_pi_primes = []
    if not runtime.is_exact_integer(value):
        value = runtime.math.floor(value)
    if value < 2:
        return 0
    upper = runtime.integer_bigint(value)
    if upper >= runtime.bigint("9223372036854775808"):
        raise OverflowError("prime_pi requires an integer below 2^63")
    if upper >= runtime.bigint(1000000):
        return runtime.normalize_integer(runtime.flint_backend().primePi(upper))
    if upper > _prime_pi_checked_through:
        candidate = runtime.flint_backend().nextPrime(
            runtime.bigint(_prime_pi_checked_through)
        )
        while candidate <= upper:
            _prime_pi_primes.append(runtime.normalize_integer(candidate))
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


def _prime_pi_plot(
    start: Any = 0,
    stop: Any = 100,
    vertical_lines: _Bool = True,
    **options: Any,
) -> Any:
    """Draw Sage's prime-counting step function without redispatching plot."""
    plot_step_function = runtime.reflect.get(
        runtime.global_object, "plot_step_function"
    )
    lower = float(start)
    upper = float(stop)
    values = []
    if upper >= lower:
        if upper < 2:
            values = [
                runtime.math_tuple([lower, 0]),
                runtime.math_tuple([upper, 0]),
            ]
        else:
            count = prime_pi(lower)
            values.append(runtime.math_tuple([lower, count]))
            candidate = runtime.flint_backend().nextPrime(
                runtime.bigint(runtime.math.floor(lower))
            )
            while candidate <= upper:
                count += 1
                values.append(
                    runtime.math_tuple([runtime.normalize_integer(candidate), count])
                )
                candidate = runtime.flint_backend().nextPrime(candidate)
            values.append(runtime.math_tuple([upper, count]))
    return plot_step_function(values, vertical_lines=vertical_lines, **options)


runtime.reflect.set(prime_pi, "plot", _prime_pi_plot)


def numerator(value: Any) -> Any:
    if runtime.is_exact_integer(value):
        return value
    if _builtins_member_is_function(value, "numerator"):
        return _builtins_call_member(value, "numerator", [])
    raise TypeError("numerator() is not defined for this value")


def denominator(value: Any) -> Any:
    if runtime.is_exact_integer(value):
        return 1
    if _builtins_member_is_function(value, "denominator"):
        return _builtins_call_member(value, "denominator", [])
    raise TypeError("denominator() is not defined for this value")


def factorial(value: Any) -> Any:
    if not runtime.is_exact_integer(value):
        raise TypeError("factorial() requires an integer")
    integer = runtime.integer_bigint(value)
    if integer < 0:
        raise ValueError("factorial() is not defined for negative integers")
    if integer > runtime.bigint(4294967295):
        raise OverflowError("factorial() argument is too large")
    return runtime.normalize_integer(
        runtime.flint_backend().factorial(runtime.number(integer))
    )


def binomial(n: Any, k: Any) -> Any:
    if not runtime.is_exact_integer(n) or not runtime.is_exact_integer(k):
        raise TypeError("binomial() arguments must be integers")
    n_integer = runtime.integer_bigint(n)
    k_integer = runtime.integer_bigint(k)
    if k_integer < 0:
        return 0
    negative = n_integer < 0
    if negative:
        # The generalized integer identity is
        #   binomial(n, k) = (-1)^k binomial(k - n - 1, k).
        upper = runtime.native_sub(
            runtime.native_sub(k_integer, n_integer), runtime.bigint(1)
        )
        count = k_integer
    else:
        if k_integer > n_integer:
            return 0
        upper = n_integer
        complement = runtime.native_sub(n_integer, k_integer)
        count = k_integer if k_integer <= complement else complement

    if count == 0:
        return 1
    word_limit = runtime.bigint(4294967295)
    if upper <= word_limit:
        answer = runtime.flint_backend().binomial(
            runtime.number(upper), runtime.number(count)
        )
    else:
        # Large upper arguments with modest k are common in exact work.  Keep
        # the intermediate quotient integral at every step and avoid coercing
        # the upper argument through a JavaScript Number.
        if count > word_limit:
            raise OverflowError("binomial() lower argument is too large")
        answer = runtime.bigint(1)
        first = runtime.native_sub(upper, count)
        for index in range(1, runtime.number(count) + 1):
            answer = runtime.native_div(
                runtime.native_mul(
                    answer,
                    runtime.native_add(first, runtime.bigint(index)),
                ),
                runtime.bigint(index),
            )
    if negative and runtime.native_bitand(k_integer, runtime.bigint(1)) != 0:
        answer = runtime.native_neg(answer)
    return runtime.normalize_integer(answer)


def valuation(value: Any, prime: Any) -> Any:
    if not runtime.is_exact_integer(value):
        if _builtins_member_is_function(value, "valuation"):
            return _builtins_call_member(value, "valuation", [prime])
        raise TypeError("valuation() requires an integer")
    if not runtime.is_exact_integer(prime):
        raise TypeError("valuation base must be an integer")
    integer = runtime.integer_bigint(value)
    base = runtime.integer_bigint(prime)
    if integer == 0:
        raise ValueError("valuation of zero is infinite")
    if base < 0:
        base = -base
    if base < 2:
        raise ValueError("valuation base must have absolute value at least 2")
    if integer < 0:
        integer = -integer
    exponent = 0
    while integer % base == 0:
        integer //= base
        exponent += 1
    return exponent


def xgcd(
    left: Any,
    right: Any = runtime.undefined,
) -> Any:
    if right is runtime.undefined:
        values = list(left)
        if len(values) == 0:
            return runtime.math_tuple([0])
        gcd_value = runtime.integer_bigint(values[0])
        coefficients = [runtime.bigint(1)]
        for value in values[1:]:
            next_gcd, left_coefficient, right_coefficient = xgcd(gcd_value, value)
            left_coefficient = runtime.integer_bigint(left_coefficient)
            coefficients = [
                runtime.native_mul(coefficient, left_coefficient)
                for coefficient in coefficients
            ]
            coefficients.append(runtime.integer_bigint(right_coefficient))
            gcd_value = runtime.integer_bigint(next_gcd)
        return runtime.math_tuple(
            [runtime.normalize_integer(gcd_value)]
            + [runtime.normalize_integer(coefficient) for coefficient in coefficients]
        )
    if not runtime.is_exact_integer(left) or not runtime.is_exact_integer(right):
        raise TypeError("xgcd() arguments must be integers")
    a = runtime.integer_bigint(left)
    b = runtime.integer_bigint(right)
    old_r, r = a, b
    old_s, s = runtime.bigint(1), runtime.bigint(0)
    old_t, t = runtime.bigint(0), runtime.bigint(1)
    while r != runtime.bigint(0):
        quotient = runtime.native_div(old_r, r)
        next_r = runtime.native_sub(old_r, runtime.native_mul(quotient, r))
        old_r = r
        r = next_r
        next_s = runtime.native_sub(old_s, runtime.native_mul(quotient, s))
        old_s = s
        s = next_s
        next_t = runtime.native_sub(old_t, runtime.native_mul(quotient, t))
        old_t = t
        t = next_t
    if old_r < runtime.bigint(0):
        old_r, old_s, old_t = -old_r, -old_s, -old_t
    return runtime.math_tuple(
        [
            runtime.normalize_integer(old_r),
            runtime.normalize_integer(old_s),
            runtime.normalize_integer(old_t),
        ]
    )


def inverse_mod(value: Any, modulus: Any) -> Any:
    gcd_value, coefficient, _other = xgcd(value, modulus)
    if gcd_value != runtime.bigint(1) and gcd_value != 1:
        raise ZeroDivisionError("inverse does not exist")
    modulus_integer = runtime.integer_bigint(modulus)
    if modulus_integer < 0:
        modulus_integer = -modulus_integer
    return runtime.normalize_integer(
        runtime.integer_bigint(coefficient) % modulus_integer
    )


def euler_phi(value: Any) -> Any:
    if not runtime.is_exact_integer(value):
        raise TypeError("euler_phi() requires an integer")
    integer = runtime.integer_bigint(value)
    if integer == 0:
        return 0
    if integer < 0:
        integer = -integer
    answer = integer
    for prime, _exponent in ρσ_factor(integer):
        prime_integer = runtime.integer_bigint(prime)
        answer = runtime.native_mul(
            runtime.native_div(answer, prime_integer),
            runtime.native_sub(prime_integer, runtime.bigint(1)),
        )
    return runtime.normalize_integer(answer)


def sigma(value: Any, power: Any = 1) -> Any:
    if not runtime.is_exact_integer(value) or not runtime.is_exact_integer(power):
        raise TypeError("sigma() arguments must be integers")
    integer = runtime.integer_bigint(value)
    exponent_power = runtime.integer_bigint(power)
    if integer == 0:
        raise ValueError("sigma() is not defined for zero")
    if exponent_power < 0:
        raise NotImplementedError("negative divisor powers are not implemented")
    if integer < 0:
        integer = -integer
    answer = runtime.bigint(1)
    for prime, exponent in ρσ_factor(integer):
        prime_integer = runtime.integer_bigint(prime)
        term = runtime.bigint(1)
        prime_power = runtime.bigint(1)
        for _index in range(exponent):
            prime_power *= prime_integer**exponent_power
            term += prime_power
        answer *= term
    return runtime.normalize_integer(answer)


def odd_part(value: Any) -> Any:
    if not runtime.is_exact_integer(value):
        raise TypeError("odd_part() requires an integer")
    integer = runtime.integer_bigint(value)
    while integer != 0 and integer % runtime.bigint(2) == 0:
        integer //= runtime.bigint(2)
    return runtime.normalize_integer(integer)


def prime_to_m_part(value: Any, m: Any) -> Any:
    if not runtime.is_exact_integer(value) or not runtime.is_exact_integer(m):
        raise TypeError("prime_to_m_part() arguments must be integers")
    answer = runtime.integer_bigint(value)
    modulus = runtime.integer_bigint(m)
    if answer < 0:
        answer = -answer
    if modulus < 0:
        modulus = -modulus
    common = runtime.integer_bigint(ρσ_gcd(answer, modulus))
    while common != 1:
        answer //= common
        common = runtime.integer_bigint(ρσ_gcd(answer, modulus))
    return runtime.normalize_integer(answer)


def crt(
    left_value: Any,
    right_value: Any,
    left_modulus: Any = runtime.undefined,
    right_modulus: Any = runtime.undefined,
) -> Any:
    if left_modulus is runtime.undefined and right_modulus is runtime.undefined:
        values = list(left_value)
        moduli = list(right_value)
        if len(values) != len(moduli):
            raise ValueError("CRT lists must have the same length")
        if len(values) == 0:
            return 0
        result = values[0]
        modulus = moduli[0]
        for index in range(1, len(values)):
            result = crt(result, values[index], modulus, moduli[index])
            modulus = runtime.normalize_integer(
                runtime.integer_bigint(modulus) * runtime.integer_bigint(moduli[index])
            )
        return result
    gcd_value, left_coefficient, right_coefficient = xgcd(left_modulus, right_modulus)
    if gcd_value != 1:
        raise ValueError("CRT moduli must be coprime")
    left_m = runtime.integer_bigint(left_modulus)
    right_m = runtime.integer_bigint(right_modulus)
    result = runtime.native_add(
        runtime.native_mul(
            runtime.native_mul(
                runtime.integer_bigint(left_value),
                runtime.integer_bigint(right_coefficient),
            ),
            right_m,
        ),
        runtime.native_mul(
            runtime.native_mul(
                runtime.integer_bigint(right_value),
                runtime.integer_bigint(left_coefficient),
            ),
            left_m,
        ),
    )
    modulus = runtime.native_mul(left_m, right_m)
    reduced = runtime.native_mod(result, modulus)
    if reduced < runtime.bigint(0):
        reduced = runtime.native_add(reduced, modulus)
    return runtime.normalize_integer(reduced)


def kronecker(left: Any, right: Any) -> Any:
    if not runtime.is_exact_integer(left) or not runtime.is_exact_integer(right):
        raise TypeError("kronecker() arguments must be integers")
    a = runtime.integer_bigint(left)
    b = runtime.integer_bigint(right)
    if b == 0:
        return 1 if a == 1 or a == -1 else 0
    result = 1
    if b < 0:
        b = -b
        if a < 0:
            result = -result
    twos = 0
    while b % runtime.bigint(2) == 0:
        b //= runtime.bigint(2)
        twos += 1
    if twos % 2 == 1:
        residue = a % runtime.bigint(8)
        if residue == 0 or residue == 2 or residue == 4 or residue == 6:
            return 0
        if residue == 3 or residue == 5:
            result = -result
    a %= b
    while a != 0:
        while a % runtime.bigint(2) == 0:
            a //= runtime.bigint(2)
            residue = b % runtime.bigint(8)
            if residue == 3 or residue == 5:
                result = -result
        a, b = b, a
        if a % runtime.bigint(4) == 3 and b % runtime.bigint(4) == 3:
            result = -result
        a %= b
    return result if b == 1 else 0


def srange(
    start: Any,
    stop: Any = None,
    step: Any = 1,
    include_endpoint: _Bool = False,
) -> list[Any]:
    if stop is None:
        stop = start
        start = 0
    start_value = float(start)
    stop_value = float(stop)
    step_value = float(step)
    if step_value == 0:
        raise ValueError("srange() step must not be zero")
    answer = []
    current = start_value
    if step_value > 0:
        while current < stop_value or (include_endpoint and current <= stop_value):
            answer.append(current)
            current += step_value
    else:
        while current > stop_value or (include_endpoint and current >= stop_value):
            answer.append(current)
            current += step_value
    return answer


class _Partitions:
    def __init__(self, value: Any) -> None:
        if not runtime.is_exact_integer(value):
            raise TypeError("partition size must be an integer")
        self._value = int(value)
        if self._value < 0:
            raise ValueError("partition size must be nonnegative")

    def _partitions(
        self,
        remaining: _Int,
        maximum: _Int,
    ) -> Iterator[list[_Int]]:
        if remaining == 0:
            yield []
        else:
            upper = min(remaining, maximum)
            for first in range(upper, 0, -1):
                for rest in self._partitions(remaining - first, first):
                    yield [first] + rest

    def __iter__(self) -> Iterator[list[_Int]]:
        return self._partitions(self._value, self._value)

    def list(self) -> list[list[_Int]]:
        return list(self)


def Partitions(value: Any) -> _Partitions:
    return _Partitions(value)


def bernoulli(index: Any) -> Any:
    if not runtime.is_exact_integer(index):
        raise TypeError("Bernoulli number index must be an integer")
    n = runtime.number(index)
    if n < 0:
        raise ValueError("Bernoulli number index must be nonnegative")
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
        raise TypeError("Möbius function input must be an integer")
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


runtime.reflect.set(moebius, "range", _moebius_range)


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
            "zeta() is currently implemented for integer arguments"
        )
    s = runtime.number(value)
    if s <= 1:
        raise NotImplementedError(
            "zeta() is currently implemented for integers greater than 1"
        )

    cutoff = 16
    answer = 0.0
    for n in range(1, cutoff):
        answer += runtime.math.pow(n, -s)
    answer += runtime.math.pow(cutoff, 1 - s) / (s - 1) + 0.5 * runtime.math.pow(
        cutoff, -s
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


def _sage_random_float() -> _Float:
    state = runtime.reflect.get(runtime.global_object, "__sagejs_random_state__")
    if state is runtime.undefined:
        state = runtime.math.floor(runtime.math.random() * 4294967296)
    state = runtime.native_mod(
        runtime.native_add(
            runtime.native_mul(1664525, state),
            1013904223,
        ),
        4294967296,
    )
    runtime.reflect.set(runtime.global_object, "__sagejs_random_state__", state)
    return ρσ_float_result(runtime.native_div(state, 4294967296))


def set_random_seed(seed_value: Any) -> None:
    text = str(seed_value)
    state = 5381
    for character in text:
        state = (state * 33 + ord(character)) % 4294967296
    if state == 0:
        state = 1
    runtime.reflect.set(
        runtime.global_object,
        "__sagejs_random_state__",
        runtime.number(state),
    )
    random_module = runtime.reflect.get(runtime.modules, "random")
    if random_module is not runtime.undefined:
        runtime.reflect.apply(
            runtime.reflect.get(random_module, "seed"),
            random_module,
            [seed_value],
        )


def random() -> _Float:
    return _sage_random_float()


def randint(start: Any, stop: Any) -> Any:
    lower = runtime.integer_bigint(start)
    upper = runtime.integer_bigint(stop)
    if upper < lower:
        raise ValueError("empty range for randint()")
    span = runtime.native_add(runtime.native_sub(upper, lower), runtime.bigint(1))
    return runtime.normalize_integer(
        runtime.native_add(
            lower,
            runtime.bigint(
                runtime.math.floor(_sage_random_float() * runtime.number(span))
            ),
        )
    )


def randrange(
    start: Any,
    stop: Any = runtime.undefined,
    step: Any = 1,
) -> Any:
    if stop is runtime.undefined:
        stop = start
        start = 0
    values = range(start, stop, step)
    if len(values) == 0:
        raise ValueError("empty range for randrange()")
    return values[randint(0, len(values) - 1)]


def choice(values: Any) -> Any:
    if len(values) == 0:
        raise IndexError("cannot choose from an empty sequence")
    return values[randint(0, len(values) - 1)]


def sample(values: Any, k: Any) -> Any:
    pool = list(values)
    count = runtime.number(runtime.integer_bigint(k))
    if count < 0 or count > len(pool):
        raise ValueError("sample larger than population or negative")
    answer = []
    for _index in range(count):
        chosen = randint(0, len(pool) - 1)
        answer.append(pool.pop(chosen))
    return answer


def primes(stop: Any) -> Any:
    return ρσ_prime_range(stop)


class _Primes:
    def slice(
        self,
        start: Any = 0,
        stop: Any = runtime.undefined,
    ) -> Any:
        if stop is runtime.undefined:
            stop = start
            start = 0
        if start < 0 or stop < 0:
            raise ValueError("Primes slices need nonnegative bounds")
        values = []
        candidate = runtime.bigint(1)
        for position in range(int(stop)):
            candidate = runtime.flint_backend().nextPrime(candidate)
            if position >= start:
                values.append(runtime.normalize_integer(candidate))
        return values

    def __getitem__(self, index: Any) -> Any:
        if not isinstance(index, slice):
            raise TypeError("Primes indices must be slices")
        start = 0 if index.start is None else int(index.start)
        stop = index.stop
        step = 1 if index.step is None else int(index.step)
        if stop is None or start < 0 or stop < 0 or step <= 0:
            raise ValueError("Primes slices need finite nonnegative bounds")
        values = self.slice(start, stop)
        if step == 1:
            return values
        return values[0 : len(values) : step]


def Primes() -> _Primes:
    return _Primes()


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
        raise TypeError("prime_powers() bounds must be integers")
    if not runtime.is_exact_integer(stop):
        raise TypeError("prime_powers() bounds must be integers")
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
    return ρσ_is_prime(runtime.native_neg(value) if value < 0 else value)


def _builtins_integer_is_one(self: Any) -> _Bool:
    return runtime.bigint(self) == runtime.bigint(1)


def _builtins_integer_is_square(self: Any) -> _Bool:
    value = runtime.bigint(self)
    if value < 0:
        return False
    if value < 2:
        return True
    estimate = value
    candidate = runtime.native_div(
        runtime.native_add(estimate, runtime.bigint(1)),
        runtime.bigint(2),
    )
    while candidate < estimate:
        estimate = candidate
        candidate = runtime.native_div(
            runtime.native_add(
                estimate,
                runtime.native_div(value, estimate),
            ),
            runtime.bigint(2),
        )
    return runtime.native_mul(estimate, estimate) == value


def _builtins_integer_digits(
    self: Any,
    base: Any = 10,
    digits: Any = runtime.undefined,
    padto: Any = 0,
) -> Any:
    value = runtime.bigint(self)
    radix = runtime.integer_bigint(base)
    padding = runtime.integer_bigint(padto)
    if radix < runtime.bigint(2):
        raise ValueError("base must be at least 2")
    if padding < runtime.bigint(0):
        raise ValueError("padto must be nonnegative")
    negative = value < runtime.bigint(0)
    if negative:
        value = runtime.native_neg(value)
    answer = []
    while value != runtime.bigint(0):
        digit = runtime.native_mod(value, radix)
        value = runtime.native_div(value, radix)
        if negative:
            digit = runtime.native_neg(digit)
        normalized = runtime.normalize_integer(digit)
        if digits is runtime.undefined:
            answer.append(normalized)
        else:
            index = runtime.number(runtime.native_neg(digit) if digit < 0 else digit)
            if index >= len(digits):
                raise ValueError("the digit alphabet is smaller than the base")
            answer.append(digits[index])
    while runtime.bigint(len(answer)) < padding:
        answer.append(0 if digits is runtime.undefined else digits[0])
    return answer


def _builtins_integer_bits(self: Any) -> Any:
    return _builtins_integer_digits(self, 2)


def _builtins_integer_nbits(self: Any) -> _Int:
    value = runtime.bigint(self)
    if value < runtime.bigint(0):
        value = runtime.native_neg(value)
    if value == runtime.bigint(0):
        return 0
    # BigInt.toString(2) is implemented natively by V8 and avoids a Python
    # loop with one division per bit for very large integers.
    binary = runtime.reflect.apply(
        runtime.reflect.get(
            runtime.reflect.get(runtime.bigint, "prototype"),
            "toString",
        ),
        value,
        [2],
    )
    return len(binary)


def _builtins_extreme(
    positional: Any,
    keywords: Any,
    find_maximum: _Bool,
) -> Any:
    default_value = runtime.reflect.get(keywords, "default")
    key = runtime.reflect.get(keywords, "key")
    if len(positional) == 0:
        if default_value is not runtime.undefined:
            return default_value
        raise TypeError("expected at least one argument")
    if len(positional) > 1 and default_value is not runtime.undefined:
        raise TypeError(
            "Cannot specify a default for min() or max() with multiple "
            "positional arguments"
        )

    values = positional[0] if len(positional) == 1 else positional
    iterator = iter(values)
    answer = next(iterator, _BUILTINS_EMPTY)
    if answer is _BUILTINS_EMPTY:
        if default_value is not runtime.undefined:
            return default_value
        raise ValueError("arg is an empty sequence")

    if key is not runtime.undefined and key is not None:
        answer_key = key(answer)
        for value in iterator:
            candidate = key(value)
            if find_maximum and ρσ_operator_gt(candidate, answer_key):
                answer = value
                answer_key = candidate
            elif not find_maximum and ρσ_operator_lt(candidate, answer_key):
                answer = value
                answer_key = candidate
        return answer

    for value in iterator:
        if find_maximum and ρσ_operator_gt(value, answer):
            answer = value
        elif not find_maximum and ρσ_operator_lt(value, answer):
            answer = value
    return answer


def ρσ_max(*positional: Any, **keywords: Any) -> Any:
    return _builtins_extreme(positional, keywords, True)


def ρσ_min(*positional: Any, **keywords: Any) -> Any:
    return _builtins_extreme(positional, keywords, False)


def _builtins_host_property(
    value: Any,
    key: _Str,
    fallback: Any = None,
) -> Any:
    answer = runtime.reflect.get(value, key)
    return fallback if answer is runtime.undefined else answer


def _builtins_raise_host_error(error: Any) -> None:
    code = _builtins_host_property(error, "code", "EIO")
    filename = _builtins_host_property(error, "path", None)
    destination = _builtins_host_property(error, "dest", None)
    if code == "ENOENT":
        raise FileNotFoundError(2, "No such file or directory", filename, destination)
    if code in ("EACCES", "EPERM"):
        raise PermissionError(13, "Permission denied", filename, destination)
    if code == "EEXIST":
        raise FileExistsError(17, "File exists", filename, destination)
    if code == "ENOTDIR":
        raise NotADirectoryError(20, "Not a directory", filename, destination)
    if code == "EISDIR":
        raise IsADirectoryError(21, "Is a directory", filename, destination)
    if code == "EINVAL":
        raise OSError(22, "Invalid argument", filename, destination)
    errno_value = _builtins_host_property(error, "errno", 5)
    if errno_value is None or errno_value < 0:
        errno_value = 5
    message = runtime.string(_builtins_host_property(error, "message", code))
    raise OSError(errno_value, message, filename, destination)


def _builtins_host_call(operation: _Str, *args: Any) -> Any:
    host = runtime.reflect.get(runtime.global_object, "__sagejs_host__")
    if host is runtime.undefined:
        raise NotImplementedError(
            "open() is unavailable without a host filesystem capability"
        )
    method = runtime.reflect.get(host, "call")
    result = runtime.reflect.apply(method, host, [operation, list(args)])
    if not _builtins_host_property(result, "ok", False):
        _builtins_raise_host_error(_builtins_host_property(result, "error"))
    return _builtins_host_property(result, "value")


def _builtins_file_path(filename: Any) -> _Str:
    if runtime.strict_equal(runtime.jstype(filename), "string"):
        return filename
    method = getattr(filename, "__fspath__", None)
    if method is None:
        raise TypeError(
            "expected str, bytes or os.PathLike object, not " + type(filename).__name__
        )
    answer = method()
    if not runtime.strict_equal(runtime.jstype(answer), "string"):
        raise TypeError("__fspath__() must return str")
    return answer


@runtime.sequence_class
class _BuiltinFile:
    def __init__(
        self,
        filename: Any,
        mode: _Str,
        buffering: _Int,
        encoding: Any,
        errors: Any,
        newline: Any,
    ) -> None:
        self.name = _builtins_file_path(filename)
        self.mode = mode
        self.closed = False
        self._binary = "b" in mode
        self._readable = mode[0] == "r" or "+" in mode
        self._writable = mode[0] in ("w", "a", "x") or "+" in mode
        self._append = mode[0] == "a"
        self.encoding = None if self._binary else encoding
        self.errors = None if self._binary else errors
        self.newlines = None
        self._newline = newline
        self._buffering = buffering
        self.line_buffering = not self._binary and buffering == 1
        self.write_through = self._binary and buffering == 0
        self._position = 0
        self._dirty = False
        self._data = _builtins_as_any(None)

        empty = bytes() if self._binary else ""
        if mode[0] == "w":
            self._data = empty
            self._dirty = True
            self._flush_to_host(False)
        elif mode[0] == "x":
            self._data = empty
            self._dirty = True
            self._flush_to_host(True)
        else:
            try:
                self._data = self._read_from_host()
            except FileNotFoundError:
                if mode[0] != "a":
                    raise
                self._data = empty
                self._dirty = True
                self._flush_to_host(False)
        if self._append:
            self._position = len(self._data)

    def _check_open(self) -> None:
        if self.closed:
            raise ValueError("I/O operation on closed file")

    def _check_readable(self) -> None:
        self._check_open()
        if not self._readable:
            raise OSError("File not open for reading")

    def _check_writable(self) -> None:
        self._check_open()
        if not self._writable:
            raise OSError("File not open for writing")

    def _read_from_host(self) -> Any:
        value = _builtins_host_call("readFile", self.name, self._binary, self.encoding)
        if self._binary:
            return bytes(value)
        text = runtime.string(value)
        if self._newline is None or self._newline == "":
            newline_types = []
            without_pairs = text.replace("\r\n", "")
            if "\r" in without_pairs:
                newline_types.append("\r")
            if "\n" in without_pairs:
                newline_types.append("\n")
            if "\r\n" in text:
                newline_types.append("\r\n")
            if len(newline_types) == 1:
                self.newlines = newline_types[0]
            elif len(newline_types) > 1:
                self.newlines = tuple(newline_types)
        if self._newline is None:
            while "\r\n" in text:
                text = text.replace("\r\n", "\n")
            while "\r" in text:
                text = text.replace("\r", "\n")
        return text

    def _write_data(self) -> Any:
        if self._binary:
            return runtime.reflect.get(self._data, "_values")
        return self._data

    def _flush_to_host(self, exclusive: _Bool = False) -> None:
        if not self._dirty and not exclusive:
            return
        _builtins_host_call(
            "writeFile",
            self.name,
            self._write_data(),
            self._binary,
            exclusive,
            self.encoding,
        )
        self._dirty = False

    def __enter__(self) -> _BuiltinFile:
        self._check_open()
        return self

    def __exit__(self, *_args: Any) -> _Bool:
        self.close()
        return False

    def __iter__(self) -> _BuiltinFile:
        self._check_open()
        return self

    def __next__(self) -> Any:
        answer = self.readline()
        if answer == "" or answer == bytes():
            raise StopIteration
        return answer

    def readable(self) -> _Bool:
        self._check_open()
        return self._readable

    def writable(self) -> _Bool:
        self._check_open()
        return self._writable

    def seekable(self) -> _Bool:
        self._check_open()
        return True

    def isatty(self) -> _Bool:
        self._check_open()
        return False

    def close(self) -> None:
        if self.closed:
            return
        if self._writable:
            self._flush_to_host()
        self.closed = True

    def flush(self) -> None:
        self._check_open()
        if self._writable:
            self._flush_to_host()

    def tell(self) -> _Int:
        self._check_open()
        return self._position

    def seek(self, offset: _Int, whence: _Int = 0) -> _Int:
        self._check_open()
        if not self._binary and whence in (1, 2) and offset != 0:
            raise OSError("can't do nonzero cur-relative seeks")
        if whence == 0:
            position = offset
        elif whence == 1:
            position = self._position + offset
        elif whence == 2:
            position = len(self._data) + offset
        else:
            raise ValueError("invalid whence")
        if position < 0:
            raise ValueError("negative seek position")
        self._position = position
        return position

    def read(self, size: Any = -1) -> Any:
        self._check_readable()
        if size is None or size < 0:
            end = len(self._data)
        else:
            end = min(len(self._data), self._position + size)
        answer = self._data[self._position : end]
        self._position = end
        return answer

    def readline(self, size: Any = -1) -> Any:
        self._check_readable()
        if self._position >= len(self._data):
            return bytes() if self._binary else ""
        delimiter = _builtins_as_any(bytes([10]) if self._binary else "\n")
        newline = self._data.find(delimiter, self._position)
        delimiter_size = 1
        if not self._binary and self._newline == "":
            text_data = runtime.string(self._data)
            carriage = text_data.find("\r", self._position)
            if carriage >= 0 and (newline < 0 or carriage < newline):
                newline = carriage
                delimiter_size = (
                    2
                    if carriage + 1 < len(text_data) and text_data[carriage + 1] == "\n"
                    else 1
                )
        elif not self._binary and self._newline not in (None, "\n"):
            delimiter = self._newline
            newline = self._data.find(delimiter, self._position)
            delimiter_size = len(delimiter)
        end = len(self._data) if newline < 0 else newline + delimiter_size
        if size is not None and size >= 0:
            end = min(end, self._position + size)
        answer = self._data[self._position : end]
        self._position = end
        return answer

    def readlines(self, hint: _Int = -1) -> list[Any]:
        self._check_readable()
        answer = []
        total = 0
        while True:
            line = self.readline()
            if line == "" or line == bytes():
                break
            answer.append(line)
            total += len(line)
            if hint > 0 and total >= hint:
                break
        return answer

    def _translated_text(self, text: _Str) -> _Str:
        newline = self._newline
        if newline is None:
            description = _builtins_host_call("describe")
            newline = _builtins_host_property(description, "linesep", "\n")
        if newline not in ("", "\n"):
            translated = ""
            remainder = text
            while "\n" in remainder:
                position = remainder.find("\n")
                translated += remainder[:position] + newline
                remainder = remainder[position + 1 :]
            return translated + remainder
        return text

    def write(self, value: Any) -> _Int:
        self._check_writable()
        data = _builtins_as_any(None)
        if self._binary:
            if not isinstance(value, (bytes, bytearray, memoryview)):
                raise TypeError("a bytes-like object is required")
            data = bytes(value)
        else:
            if not runtime.strict_equal(runtime.jstype(value), "string"):
                raise TypeError("write() argument must be str")
            data = self._translated_text(value)
        if self._append:
            self._position = len(self._data)
        if self._position > len(self._data):
            padding = _builtins_as_any(bytes([0]) if self._binary else "\x00")
            self._data += padding * (self._position - len(self._data))
        end = self._position + len(data)
        if self._binary and self._position == 0 and end >= len(self._data):
            self._data = data
            self._position = end
            self._dirty = True
            if self.write_through:
                self._flush_to_host()
            return len(value)
        suffix = _builtins_as_any(
            self._data[end:] if end < len(self._data) else data[:0],
        )
        self._data = (
            _builtins_as_any(self._data[: self._position])
            + _builtins_as_any(data)
            + suffix
        )
        self._position = end
        self._dirty = True
        should_flush = self.write_through
        if not self._binary and self.line_buffering and "\n" in runtime.string(value):
            should_flush = True
        if should_flush:
            self._flush_to_host()
        return len(value)

    def writelines(self, lines: Any) -> None:
        for line in lines:
            self.write(line)

    def truncate(self, size: Any = None) -> _Int:
        self._check_writable()
        if size is None:
            size = self._position
        if size < 0:
            raise ValueError("negative size value")
        if size < len(self._data):
            self._data = self._data[:size]
        elif size > len(self._data):
            padding = bytes([0]) if self._binary else "\x00"
            self._data += padding * (size - len(self._data))
        self._dirty = True
        self._flush_to_host()
        return size

    def readinto(self, buffer: Any) -> _Int:
        if not self._binary:
            raise TypeError("readinto() argument must be read-write bytes-like object")
        data = self.read(len(buffer))
        for index in range(len(data)):
            buffer[index] = data[index]
        return len(data)

    def read1(self, size: Any = -1) -> Any:
        return self.read(size)


def ρσ_open(
    filename: Any,
    mode: _Str = "r",
    buffering: _Int = -1,
    encoding: Any = None,
    errors: Any = None,
    newline: Any = None,
    closefd: _Bool = True,
    opener: Any = None,
) -> _BuiltinFile:
    valid_modes = (
        "r",
        "rb",
        "rt",
        "r+",
        "rb+",
        "r+b",
        "w",
        "wb",
        "wt",
        "w+",
        "wb+",
        "w+b",
        "a",
        "ab",
        "at",
        "a+",
        "ab+",
        "a+b",
        "x",
        "xb",
        "xt",
        "x+",
        "xb+",
        "x+b",
    )
    if not runtime.strict_equal(runtime.jstype(mode), "string"):
        raise TypeError("open() argument mode must be str")
    if mode not in valid_modes:
        raise ValueError("invalid mode: " + repr(mode))
    binary = "b" in mode
    if binary and encoding is not None:
        raise ValueError("binary mode doesn't take an encoding argument")
    if binary and errors is not None:
        raise ValueError("binary mode doesn't take an errors argument")
    if binary and newline is not None:
        raise ValueError("binary mode doesn't take a newline argument")
    if not binary and buffering == 0:
        raise ValueError("can't have unbuffered text I/O")
    if newline not in (None, "", "\n", "\r", "\r\n"):
        raise ValueError("illegal newline value: " + repr(newline))
    if not closefd:
        raise ValueError("Cannot use closefd=False with file name")
    if opener is not None:
        raise NotImplementedError("custom openers are not supported")
    if encoding is None:
        encoding = "utf8"
    if errors is None:
        errors = "strict"
    if errors not in ("strict", "ignore", "replace"):
        raise ValueError("unsupported error handler: " + repr(errors))
    return _BuiltinFile(filename, mode, buffering, encoding, errors, newline)


def dumps(value: Any, compress: _Bool = True, **keywords: Any) -> bytes:
    r"""Return `value` as safe binary SagePack data.

    This is Sage.js's data-only counterpart to Sage's global `dumps`.  The
    `compress` argument is accepted for source compatibility; SagePack v1
    stores compact native binary blocks without an additional compression
    layer.  Pickle-specific keyword arguments are intentionally unsupported.
    """
    if len(keywords) != 0:
        name = next(iter(keywords))
        raise TypeError("dumps() got an unexpected keyword argument '" + name + "'")
    return bytes(_builtins_host_call("serializationPack", value))


def loads(
    source: Any,
    compress: _Bool = True,
    **keywords: Any,
) -> Any:
    r"""Restore one value from binary SagePack or legacy v1 JSON data.

    Loading never imports a constructor selected by the input and never
    executes serialized code.
    """
    if len(keywords) != 0:
        name = next(iter(keywords))
        raise TypeError("loads() got an unexpected keyword argument '" + name + "'")
    if isinstance(source, bytes) or isinstance(source, bytearray):
        raw = bytes(source)
        magic = bytes([83, 65, 71, 69, 80, 75, 49, 0])
        if raw[:8] == magic:
            return _builtins_host_call("serializationUnpack", raw)
        source = raw.decode("utf-8")
    if isinstance(source, str):
        return _builtins_host_call("serializationLoads", source)
    raise TypeError("loads() requires bytes, bytearray, or str")


def _builtins_sobj_filename(filename: Any) -> _Str:
    path = _builtins_file_path(filename)
    return path if path.endswith(".sobj") else path + ".sobj"


def save(
    value: Any,
    filename: Any,
    compress: _Bool = True,
    **keywords: Any,
) -> None:
    r"""Save `value` to a Sage object file.

    Generic mathematical objects are written as safe binary SagePack data and
    `.sobj` is appended when needed, matching Sage's common filename
    convention.  Objects with their own `save` method still handle explicit
    non-`.sobj` extensions such as `.png`.
    """
    path = _builtins_file_path(filename)
    separator = max(path.rfind("/"), path.rfind("\\"))
    dot = path.rfind(".")
    extension = "" if dot <= separator else path[dot:]
    method = getattr(value, "save", None)
    if extension != "" and extension != ".sobj" and method is not None:
        method(path, **keywords)
        return None
    if len(keywords) != 0:
        name = next(iter(keywords))
        raise TypeError("save() got an unexpected keyword argument '" + name + "'")
    target = _builtins_sobj_filename(path)
    with ρσ_open(target, "wb") as output:
        output.write(dumps(value, compress=compress))
    return None


def load(
    *filenames: Any,
    **keywords: Any,
) -> Any:
    r"""Load one or more safe Sage object files.

    `.sobj` is appended to each filename when absent.  Multiple filenames
    return a list, as in Sage.  Loading source files and remote URLs is outside
    this data-only persistence API.
    """
    if len(filenames) == 0:
        raise TypeError("load() needs at least one filename")
    compress = _builtins_pop_keyword(keywords, "compress", True)
    # Accepted for Sage source compatibility. Local SagePack reads are quiet.
    _builtins_pop_keyword(keywords, "verbose", True)
    if len(keywords) != 0:
        name = next(iter(keywords))
        raise TypeError("load() got an unexpected keyword argument '" + name + "'")
    answers = []
    for filename in filenames:
        target = _builtins_sobj_filename(filename)
        with ρσ_open(target, "rb") as input_file:
            answers.append(loads(input_file.read(), compress=compress))
    return answers[0] if len(answers) == 1 else answers


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
vars = ρσ_vars
help = ρσ_help
search_doc = ρσ_search_doc


def quit(code: Any = None) -> None:
    """Exit the current Sage.js or Python session.

    `quit()` exits successfully. An integer argument becomes the process exit
    status, matching Python's interactive convenience function.
    """
    if code is None:
        raise SystemExit
    raise SystemExit(code)


exit = quit


_quit_doc = {
    "kind": "function",
    "module": "builtins",
    "tags": ["runtime", "interactive", "process"],
    "backends": ["Sage.js runtime"],
    "sage_compatibility": {
        "status": "compatible",
        "notes": "Raises SystemExit with the optional supplied status.",
    },
    "provenance": [
        {
            "kind": "software-derived",
            "source": "Python site.Quitter interactive API",
            "url": "https://docs.python.org/3/library/constants.html",
            "license": "PSF-2.0",
        },
    ],
}
runtime.register_doc("quit", quit, _quit_doc)
runtime.register_doc("exit", exit, _quit_doc)
runtime.register_doc(
    "help",
    help,
    {
        "kind": "function",
        "module": "builtins",
        "tags": ["documentation", "introspection"],
        "backends": ["Sage.js runtime"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": "Provides concise runtime help for installed APIs.",
        },
        "provenance": [{"kind": "sagejs-original"}],
    },
)
runtime.register_doc(
    "search_doc",
    search_doc,
    {
        "kind": "function",
        "module": "builtins",
        "tags": ["documentation", "search", "introspection"],
        "backends": ["Sage.js runtime"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": "Searches the installed Sage.js corpus only.",
        },
        "provenance": [{"kind": "sagejs-original"}],
    },
)
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
for builtin_numeric_type in (ρσ_int, ρσ_bool, ρσ_float, ρσ_type):
    runtime.object.defineProperty(
        builtin_numeric_type,
        "__python_type__",
        {"value": ρσ_type, "writable": True, "configurable": True},
    )
runtime.reflect.set(runtime.function_class, "__python_type__", ρσ_type)
runtime.set_class_repr(ρσ_tuple, "<class 'tuple'>")
runtime.set_class_repr(ρσ_property, "<class 'property'>")
runtime.set_class_repr(SageProperty, "<class 'property'>")
for builtin_factory_type in (ρσ_tuple, ρσ_property):
    # These Python-callable factories implement builtin classes.  Compiled
    # baselib functions receive lazy function metadata, so replace that marker
    # explicitly instead of letting class inheritance mistake the factory for
    # a custom metaclass.
    runtime.object.defineProperty(
        builtin_factory_type,
        "__python_type__",
        {"value": ρσ_type, "writable": True, "configurable": True},
    )
runtime.reflect.set(
    runtime.reflect.get(SageProperty, "prototype"),
    "__python_type__",
    ρσ_property,
)


class SageObject:
    def __init__(self) -> None:
        pass

    def __repr__(self) -> _Str:
        constructor = runtime.reflect.get(self, "constructor")
        name = (
            "object"
            if constructor is SageObject
            else runtime.reflect.get(constructor, "__name__")
        )
        module = runtime.reflect.get(constructor, "__module__")
        if (
            module is not runtime.undefined
            and module is not None
            and module not in ("__main__", "builtins")
        ):
            name = str(module) + "." + name
        return "<" + name + " object at " + str(id(self)) + ">"

    def __hash__(self) -> _Int:
        return id(self)


def _builtins_object_new(cls: Any) -> Any:
    if not _builtins_is_python_class(cls):
        raise TypeError("object.__new__() argument 1 must be a type")
    return runtime.object.create(runtime.reflect.get(cls, "prototype"))


@runtime.native_method
def _builtins_object_setattr(
    self: Any,
    name: _Str,
    value: Any,
) -> None:
    if not runtime.strict_equal(runtime.jstype(name), "string"):
        raise TypeError("attribute name must be string")
    descriptor_info = _builtins_class_attribute_descriptor(
        _builtins_get_member(self, "constructor"), name
    )
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(descriptor_info, "value")
        if _builtins_member_is_function(descriptor, "__set__"):
            _builtins_call_member(descriptor, "__set__", [self, value])
            return
    runtime.reflect.set(self, name, value)


@runtime.native_method
def _builtins_object_delattr(self: Any, name: _Str) -> None:
    if not runtime.strict_equal(runtime.jstype(name), "string"):
        raise TypeError("attribute name must be string")
    property_deleter = _builtins_get_member(self, "ρσ_property_deleter_" + name)
    if runtime.strict_equal(runtime.jstype(property_deleter), "function"):
        runtime.reflect.apply(property_deleter, self, [])
        return
    descriptor_info = _builtins_class_attribute_descriptor(
        _builtins_get_member(self, "constructor"), name
    )
    if descriptor_info is not runtime.undefined:
        descriptor = runtime.reflect.get(descriptor_info, "value")
        if _builtins_member_is_function(descriptor, "__delete__"):
            _builtins_call_member(descriptor, "__delete__", [self])
            return
    has_own = runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        self,
        [name],
    )
    if not has_own or not runtime.reflect.deleteProperty(self, name):
        raise AttributeError("object has no attribute '" + name + "'")


runtime.reflect.set(
    SageObject,
    "__new__",
    _builtins_object_new,
)
runtime.reflect.set(
    _builtins_object_new,
    "__staticmethod__",
    True,
)
runtime.reflect.set(
    SageObject,
    "__setattr__",
    _builtins_object_setattr,
)
runtime.reflect.set(
    SageObject,
    "__delattr__",
    _builtins_object_delattr,
)
_sage_object_prototype = runtime.reflect.get(SageObject, "prototype")
runtime.reflect.set(
    _sage_object_prototype,
    "__new__",
    _builtins_object_new,
)
runtime.reflect.set(
    _sage_object_prototype,
    "__setattr__",
    _builtins_object_setattr,
)
runtime.reflect.set(
    _sage_object_prototype,
    "__delattr__",
    _builtins_object_delattr,
)
runtime.reflect.set(
    SageObject,
    "__init__",
    runtime.reflect.get(
        runtime.reflect.get(SageObject, "prototype"),
        "__init__",
    ),
)
runtime.set_class_repr(SageObject, "<class 'object'>")
runtime.reflect.set(SageObject, "__name__", "object")
runtime.reflect.set(SageObject, "__qualname__", "object")
runtime.reflect.set(SageObject, "__module__", "builtins")
_type_bases = runtime.object.freeze(
    runtime.reflect.construct(runtime.array, [SageObject])
)
_type_mro = runtime.object.freeze(
    runtime.reflect.construct(runtime.array, [ρσ_type, SageObject])
)
runtime.reflect.set(ρσ_type, "__bases__", _type_bases)
runtime.reflect.set(
    runtime.reflect.get(ρσ_type, "prototype"),
    "__bases__",
    _type_bases,
)
runtime.reflect.set(ρσ_type, "__mro__", _type_mro)
runtime.reflect.set(ρσ_type, "__module__", "builtins")
runtime.reflect.set(ρσ_type, "__name__", "type")
runtime.reflect.set(ρσ_type, "__qualname__", "type")
_object_bases = runtime.reflect.get(SageObject, "__bases__")
runtime.object.freeze(_object_bases)
runtime.object.freeze(
    runtime.reflect.get(
        runtime.reflect.get(SageObject, "prototype"),
        "__bases__",
    )
)
runtime.reflect.set(runtime.global_object, "object", SageObject)
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
_tuple_prototype = runtime.reflect.get(tuple, "prototype")


def _builtins_tuple_new(
    cls: Any,
    iterable: Any = runtime.undefined,
) -> Any:
    """Allocate an immutable tuple, preserving a requested subclass."""
    values = []
    if iterable is not runtime.undefined:
        for value in iterable:
            values.append(value)
    instance = runtime.object.create(runtime.reflect.get(cls, "prototype"))
    runtime.reflect.set(instance, "_tuple_values", values)
    return instance


runtime.reflect.set(_builtins_tuple_new, "__staticmethod__", True)
runtime.reflect.set(tuple, "__new__", _builtins_tuple_new)
runtime.reflect.set(
    _tuple_prototype, "__init__", runtime.native_method(_builtins_tuple_subclass_init)
)
runtime.reflect.set(
    _tuple_prototype, "__len__", runtime.native_method(_builtins_tuple_subclass_len)
)
runtime.reflect.set(
    _tuple_prototype, "__iter__", runtime.native_method(_builtins_tuple_subclass_iter)
)
runtime.reflect.set(
    _tuple_prototype,
    runtime.iterator_symbol,
    runtime.native_method(_builtins_tuple_subclass_iter),
)
runtime.reflect.set(
    _tuple_prototype,
    "__getitem__",
    runtime.native_method(_builtins_tuple_subclass_getitem),
)
runtime.reflect.set(
    _tuple_prototype, "__repr__", runtime.native_method(_builtins_tuple_subclass_repr)
)
runtime.reflect.set(
    _tuple_prototype, "__str__", runtime.native_method(_builtins_tuple_subclass_repr)
)
runtime.reflect.set(
    _tuple_prototype, "toString", runtime.native_method(_builtins_tuple_subclass_repr)
)
runtime.reflect.set(
    _tuple_prototype, "__eq__", runtime.native_method(_builtins_tuple_subclass_eq)
)
runtime.reflect.set(
    _tuple_prototype, "__add__", runtime.native_method(_builtins_tuple_subclass_add)
)
runtime.reflect.set(
    _tuple_prototype, "__mul__", runtime.native_method(_builtins_tuple_subclass_mul)
)
runtime.reflect.set(
    _tuple_prototype, "__rmul__", runtime.native_method(_builtins_tuple_subclass_mul)
)
issubclass = ρσ_issubclass
isinstance = ρσ_instanceof  # type: ignore[name-defined]  # noqa: F821
iter = ρσ_iter
next = ρσ_next
reversed = ρσ_reversed
len = ρσ_len
range = ρσ_range
# Sage's xsrange is the lazy counterpart of srange. The runtime range already
# provides the compatible lazy behavior for exact integer bounds.
xsrange = range
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


def _builtins_arithmetic_doc(
    tags: Any,
    algorithm: _Str,
    limitations: Any = None,
) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ["arithmetic"],
        [tags],
    )
    return {
        "kind": "function",
        "module": "sage.arith.misc",
        "tags": all_tags,
        "backends": ["FLINT"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": (
                "Matches the documented SageMath result for the "
                "supported integer inputs."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath arithmetic API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/"
                    "rings_standard/sage/arith/misc.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "FLINT",
                "url": "https://flintlib.org/doc/",
            },
        ],
        "references": [
            {
                "id": "flint",
                "type": "software",
                "title": ("FLINT: Fast Library for Number Theory"),
                "authors": ["The FLINT contributors"],
                "url": "https://flintlib.org/",
            },
        ],
        "implementation": {"algorithm": algorithm},
        "limitations": [] if limitations is None else limitations,
    }


runtime.register_doc(
    "factor",
    factor,
    _builtins_arithmetic_doc(
        ["factorization"],
        "FLINT integer factorization",
    ),
)
runtime.register_doc(
    "next_prime",
    next_prime,
    _builtins_arithmetic_doc(
        ["primes"],
        "FLINT next-prime search",
    ),
)
runtime.register_doc(
    "is_prime",
    is_prime,
    _builtins_arithmetic_doc(
        ["primes", "primality"],
        "FLINT primality testing",
    ),
)
runtime.register_doc(
    "prime_range",
    prime_range,
    _builtins_arithmetic_doc(
        ["primes", "enumeration"],
        "Repeated FLINT next-prime search",
    ),
)
runtime.register_doc(
    "prime_pi",
    prime_pi,
    _builtins_arithmetic_doc(
        ["primes", "prime counting"],
        "Lehmer prime counting with incremental enumeration for small bounds",
        [
            ("Like Sage primecountpy, inputs at or above 2^63 are not supported."),
        ],
    ),
)
compile = ρσ_compile
exec = ρσ_exec
_integer_is_irreducible_native = runtime.native_method(_builtins_integer_is_irreducible)
_integer_is_one_native = runtime.native_method(_builtins_integer_is_one)
_integer_is_square_native = runtime.native_method(_builtins_integer_is_square)
_integer_digits_native = runtime.native_method(_builtins_integer_digits)
_integer_bits_native = runtime.native_method(_builtins_integer_bits)
_integer_nbits_native = runtime.native_method(_builtins_integer_nbits)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, "prototype"),
    "is_irreducible",
    _integer_is_irreducible_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, "prototype"),
    "is_irreducible",
    _integer_is_irreducible_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, "prototype"),
    "is_one",
    _integer_is_one_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, "prototype"),
    "is_one",
    _integer_is_one_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, "prototype"),
    "is_square",
    _integer_is_square_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, "prototype"),
    "is_square",
    _integer_is_square_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, "prototype"),
    "digits",
    _integer_digits_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, "prototype"),
    "digits",
    _integer_digits_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, "prototype"),
    "bits",
    _integer_bits_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, "prototype"),
    "bits",
    _integer_bits_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, "prototype"),
    "nbits",
    _integer_nbits_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, "prototype"),
    "nbits",
    _integer_nbits_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.number, "prototype"),
    "bit_length",
    _integer_nbits_native,
)
runtime.reflect.set(
    runtime.reflect.get(runtime.bigint, "prototype"),
    "bit_length",
    _integer_nbits_native,
)
runtime.reflect.set(runtime.global_object, "true", True)
runtime.reflect.set(runtime.global_object, "false", False)
runtime.reflect.set(runtime.global_object, "ρσ_py_true", True)
runtime.reflect.set(runtime.global_object, "ρσ_py_false", False)
runtime.set_class_repr(_Code, "<class 'code'>")
runtime.set_class_repr(ρσ_function_type, "<class 'function'>")
