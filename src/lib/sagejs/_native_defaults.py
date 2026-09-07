"""Live Python defaults outside the compiled native ABI."""

from typing import Any

import sagejs.runtime as runtime

_SOURCE_SIGNATURE_NAMES = (
    "__name__",
    "__qualname__",
    "__module__",
    "__doc__",
    "__annotations__",
    "__annotations_text__",
    "__defaults__",
    "__kwdefaults__",
    "__code__",
    "__globals__",
    "__argnames__",
    "__kwonly__",
    "__varargs__",
    "__varkw__",
    "__positional_only__",
    "__handles_kwarg_interpolation__",
    "__python_type__",
    "__python_descriptor__",
)


def bind_source_defaults(source: Any, compiled: Any) -> Any:
    """Retain source-owned Python binding outside the compiled numeric ABI.

    Fully supplied positional calls still reach the existing compiled target.
    Omission and keyword-marker calls use the dynamic source binder before
    backend selection or marshalling; they never consume frozen IR defaults.
    The proxy owns its source association independently of cached artifacts.
    """

    def apply(_target: Any, *packet: Any) -> Any:
        # Host Proxy calls may supply an actual undefined receiver. Preserve
        # that value in the variadic packet rather than treating it as an
        # omitted required Python argument or conflating it with None.
        receiver, arguments = packet
        names = runtime.reflect.get(source, "__argnames__")
        count = runtime.reflect.get(arguments, "length")
        last = runtime.reflect.get(arguments, count - 1)
        if (
            last is not None
            and last is not runtime.undefined
            and runtime.reflect.get(
                runtime.reflect.apply(runtime.object, runtime.undefined, [last]),
                runtime.kwargs_symbol,
            )
            is True
        ):
            return runtime.reflect.apply(
                runtime.reflect.get(runtime.global_object, "ρσ_interpolate_kwargs"),
                runtime.undefined,
                [receiver, source, arguments],
            )
        if (
            count != runtime.reflect.get(names, "length")
            or runtime.reflect.apply(
                runtime.array.prototype.includes, arguments, [runtime.undefined]
            )
            or runtime.reflect.get(source, "__kwonly__")
        ):
            return runtime.reflect.apply(source, receiver, arguments)
        return runtime.reflect.apply(compiled, receiver, arguments)

    def get(target: Any, name: Any, receiver: Any) -> Any:
        if name in _SOURCE_SIGNATURE_NAMES:
            return runtime.reflect.get(source, name)
        if name == "__sagejs_native_source__":
            return source
        # Python delattr checks this existing property-deleter protocol before
        # requiring a host own property. Forwarded slots intentionally do not
        # have shadow descriptors on the fresh proxy target.
        if runtime.strict_equal(runtime.jstype(name), "string") and name.startswith(
            "ρσ_property_deleter_"
        ):
            slot = name[len("ρσ_property_deleter_") :]
            if slot in _SOURCE_SIGNATURE_NAMES or slot == "__sagejs_native_source__":

                def delete_forwarded() -> None:
                    if not delete_property(target, slot):
                        raise AttributeError("native attribute cannot be deleted")

                return delete_forwarded
        if runtime.reflect.has(target, name):
            return runtime.reflect.get(target, name, receiver)
        if name == "__wrapped__":
            return source
        return runtime.reflect.get(compiled, name, compiled)

    def has(target: Any, name: Any) -> bool:
        # Python lookup checks presence before reading. Keep this consistent
        # with forwarded values, while never hiding a constrained target slot.
        if runtime.reflect.has(target, name):
            return True
        if name in _SOURCE_SIGNATURE_NAMES:
            return runtime.reflect.has(source, name)
        if name in ("__sagejs_native_source__", "__wrapped__"):
            return True
        return runtime.reflect.has(compiled, name)

    def set(target: Any, name: Any, value: Any, receiver: Any) -> bool:
        if name in _SOURCE_SIGNATURE_NAMES:
            setattr(source, name, value)
            return True
        if name == "__sagejs_native_source__":
            if value is not source:
                raise AttributeError("native source owner is read-only")
            return True
        return runtime.reflect.set(target, name, value, receiver)

    def delete_property(target: Any, name: Any) -> bool:
        if name == "__sagejs_native_source__":
            raise AttributeError("native source owner is read-only")
        if name in _SOURCE_SIGNATURE_NAMES:
            descriptor = runtime.object.getOwnPropertyDescriptor(target, name)
            if descriptor is not runtime.undefined:
                # Do not mutate the source before discovering that a host
                # target constraint would make a successful trap illegal.
                if not runtime.reflect.get(descriptor, "configurable"):
                    return False
                if not runtime.reflect.apply(
                    runtime.reflect.get(runtime.object, "isExtensible"),
                    runtime.object,
                    [target],
                ):
                    return False
            delattr(source, name)
            return runtime.reflect.deleteProperty(target, name)
        return runtime.reflect.deleteProperty(target, name)

    handlers = runtime.object.create(None)
    runtime.reflect.set(handlers, "apply", apply)
    runtime.reflect.set(handlers, "get", get)
    runtime.reflect.set(handlers, "has", has)
    runtime.reflect.set(handlers, "set", set)
    runtime.reflect.set(handlers, "deleteProperty", delete_property)
    # Cached artifact functions may own immutable metadata.  A proxy around
    # such a target cannot legally expose a different source's slot values.
    # A fresh host-bound callable has only configurable name/length metadata;
    # the apply trap still dispatches to the original compiled target.
    proxy_target = runtime.reflect.apply(
        runtime.function_class.prototype.bind, compiled, [runtime.undefined]
    )
    # These function-valued associations are own attributes, not inherited
    # methods to bind to the wrapper during Python attribute lookup.
    for name in ("__wrapped__", "__sagejs_native_source__"):
        descriptor = runtime.object.create(None)
        runtime.reflect.set(descriptor, "value", source)
        runtime.reflect.set(descriptor, "configurable", True)
        runtime.reflect.set(descriptor, "writable", name == "__wrapped__")
        runtime.object.defineProperty(proxy_target, name, descriptor)
    return runtime.reflect.construct(runtime.proxy_class, [proxy_target, handlers])
