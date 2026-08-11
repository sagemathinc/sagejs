"""Bootstrap-safe representation primitives used by compiled Python.

These operations must exist before Python's builtins and container classes are
initialized.  They describe representation metadata only; mathematical
algorithms belong in their ordinary library modules.
"""

from __future__ import annotations

from typing import Any, Callable

import sagejs.runtime as runtime


def ρσ_lightweight_math_class(cls: type[Any]) -> type[Any]:
    """Mark a class whose compiled instances need no generic identity slot."""
    return cls


def ρσ_bigint_fields(
    *names: str,
) -> Callable[[type[Any]], type[Any]]:
    """Declare exact-integer fields understood by the native compiler."""

    def decorator(cls: type[Any]) -> type[Any]:
        return cls

    return decorator


def ρσ_sequence_class(cls: type[Any]) -> type[Any]:
    """Mark a class whose instances use sequence-compatible storage."""
    return cls


def ρσ_native_method(target_function: Any) -> Any:
    """Adapt an ordinary `(self, *args)` function to a host object method."""
    return runtime.native_method_adapter(target_function)


def ρσ_extends(child: Any, parent: Any) -> None:
    """Install the JavaScript prototype link for a compiled Python class."""
    child.prototype = runtime.object.create(parent.prototype)
    child.prototype.constructor = child


def ρσ_validate_class_bases(bases: Any) -> None:
    """Reject non-types and incompatible native instance layouts."""
    native_layouts = 0
    for index in range(len(bases)):
        base = bases[index]
        if (
            not runtime.strict_equal(runtime.jstype(base), "function")
            or base is runtime.function_class
        ):
            raise TypeError("bases must be types")
        for previous_index in range(index):
            if base is bases[previous_index]:
                raise TypeError("duplicate base class")
        prototype = runtime.reflect.get(base, "prototype")
        if prototype is runtime.undefined:
            raise TypeError("bases must be types")
        if not runtime.reflect.has(prototype, "__bases__"):
            native_layouts += 1
    if native_layouts > 1:
        raise TypeError("multiple bases have instance lay-out conflict")


def ρσ_compute_mro(cls: Any, bases: Any) -> Any:
    """Return the C3 linearization for a newly created Python class."""
    sequences = []
    for base in bases:
        inherited = runtime.native_get(base, "__mro__")
        sequence = []
        if inherited is runtime.undefined:
            sequence.push(base)  # type: ignore[attr-defined]
        else:
            for item in inherited:
                sequence.push(item)  # type: ignore[attr-defined]
        sequences.push(sequence)  # type: ignore[attr-defined]
    direct_bases = []
    for base in bases:
        direct_bases.push(base)  # type: ignore[attr-defined]
    sequences.push(direct_bases)  # type: ignore[attr-defined]

    result = [cls]
    while True:
        active_sequences = []
        for sequence in sequences:
            if sequence.length:  # type: ignore[attr-defined]
                active_sequences.push(sequence)  # type: ignore[attr-defined]
        sequences = active_sequences
        if not sequences.length:  # type: ignore[attr-defined]
            return runtime.object.freeze(result)

        candidate = runtime.undefined
        for sequence in sequences:
            head = sequence[0]
            blocked = False
            for other in sequences:
                first = True
                for item in other:
                    if first:
                        first = False
                        continue
                    if item is head:
                        blocked = True
                        break
                if blocked:
                    break
            if not blocked:
                candidate = head
                break

        if candidate is runtime.undefined:
            raise TypeError("Cannot create a consistent method resolution order (MRO)")
        result.push(candidate)  # type: ignore[attr-defined]
        for sequence in sequences:
            if sequence and sequence[0] is candidate:
                sequence.shift()  # type: ignore[attr-defined]


def ρσ_mixin(*classes: Any) -> None:
    """Copy missing prototype members for compiled multiple inheritance."""
    seen = runtime.object.create(None)
    skipped = [
        "__argnames__",
        "__handles_kwarg_interpolation__",
        "__init__",
        "__annotations__",
        "__doc__",
        "__bind_methods__",
        "__bases__",
        "__mro__",
        "constructor",
        "__class__",
    ]
    for name in skipped:
        seen[name] = True

    resolved_properties = {}
    target = classes[0].prototype
    primary_prototype = runtime.object.getPrototypeOf(target)
    python_type_prototype = runtime.native_get(type, "prototype")
    for class_index in range(1, len(classes)):
        secondary_prototype = runtime.native_get(classes[class_index], "prototype")
        if secondary_prototype is runtime.undefined:
            raise TypeError("bases must be types")
        if (
            classes[class_index] is runtime.tuple_builtin
            and primary_prototype is python_type_prototype
        ):
            raise TypeError("multiple bases have instance lay-out conflict")

    def tuple_mixin_initializer(
        tuple_initializer: Any,
        original_initializer: Any,
    ) -> Any:
        def initialize_tuple_mixin(
            self: Any,
            *args: Any,
        ) -> Any:
            runtime.reflect.apply(tuple_initializer, self, args)
            return runtime.reflect.apply(original_initializer, self, args)

        return runtime.native_method(initialize_tuple_mixin)

    mixed_tuple_secondary = False
    for class_index in range(1, len(classes)):
        if classes[class_index] is not runtime.tuple_builtin:
            continue
        tuple_initializer = classes[class_index].prototype.__init__
        original_initializer = target.__init__
        target.__init__ = tuple_mixin_initializer(
            tuple_initializer, original_initializer
        )
        mixed_tuple_secondary = True
        break
    if not mixed_tuple_secondary:
        prototype = target
        tuple_prototype = runtime.reflect.get(runtime.tuple_builtin, "prototype")
        primary_is_tuple = False
        while prototype and prototype is not runtime.object.prototype:
            if prototype is tuple_prototype:
                primary_is_tuple = True
                break
            prototype = runtime.object.getPrototypeOf(prototype)
        if primary_is_tuple:
            for class_index in range(1, len(classes)):
                secondary_initializer = runtime.reflect.get(
                    runtime.reflect.get(classes[class_index], "prototype"),
                    "__init__",
                )
                if runtime.strict_equal(
                    runtime.jstype(secondary_initializer),
                    "function",
                ):
                    target.__init__ = tuple_mixin_initializer(
                        target.__init__,
                        secondary_initializer,
                    )
                    break

    prototype = target
    while prototype and prototype is not runtime.object.prototype:
        for name in runtime.object.getOwnPropertyNames(prototype):
            seen[name] = True
        prototype = runtime.object.getPrototypeOf(prototype)

    for class_index in range(1, len(classes)):
        prototype = classes[class_index].prototype
        while prototype and prototype is not runtime.object.prototype:
            for name in runtime.object.getOwnPropertyNames(prototype):
                if seen[name]:
                    continue
                seen[name] = True
                resolved_properties[name] = runtime.object.getOwnPropertyDescriptor(
                    prototype, name
                )
            prototype = runtime.object.getPrototypeOf(prototype)
    runtime.object.defineProperties(target, resolved_properties)


def _runtime_primitive_class_repr(wrapper: Any, target: Any) -> None:
    if (
        runtime.object.getOwnPropertyDescriptor(wrapper, "__repr__")
        is not runtime.undefined
    ):
        return

    def class_repr() -> str:
        return "<class '" + target.name + "'>"

    runtime.reflect.set(class_repr, "__sagejs_internal_class_repr__", True)
    runtime.object.defineProperty(
        wrapper,
        "__repr__",
        {"configurable": True, "value": class_repr},
    )


def ρσ_callable_sequence_class(target: Any) -> Any:
    """Wrap a compiled class so its instances expose indexed host access."""

    def sequence_proxy(instance: Any) -> Any:
        modules = runtime.reflect.get(
            runtime.global_object, "__sagejs_baselib_modules__"
        )
        internal = runtime.reflect.get(modules, "sagejs._baselib.internal")
        adapter = runtime.reflect.get(internal, "ρσ_sequence_proxy")
        return runtime.reflect.apply(adapter, runtime.undefined, [instance])

    def call_class(
        target_class: Any,
        _this_argument: Any,
        call_args: Any,
    ) -> Any:
        return sequence_proxy(runtime.reflect.construct(target_class, call_args))

    def construct_class(
        target_class: Any,
        call_args: Any,
        new_target: Any,
    ) -> Any:
        return sequence_proxy(
            runtime.reflect.construct(target_class, call_args, new_target)
        )

    handler = runtime.object.create(None)
    runtime.reflect.set(handler, "apply", call_class)
    runtime.reflect.set(handler, "construct", construct_class)
    wrapper = runtime.reflect.construct(runtime.proxy_class, [target, handler])
    target.prototype.constructor = wrapper
    runtime.reflect.apply(
        _runtime_primitive_class_repr,
        runtime.undefined,
        [wrapper, target],
    )
    return wrapper


def ρσ_set_class_repr(cls: type[Any], text: str) -> None:
    """Install the stable Python representation of a runtime class."""

    def class_repr() -> str:
        return text

    runtime.object.defineProperty(cls, "__repr__", {"value": class_repr})
