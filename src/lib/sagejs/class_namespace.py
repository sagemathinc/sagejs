"""Prepared class namespaces for the compiler's non-default metaclass path."""

from typing import Any

import sagejs.runtime as runtime


def prepare(metaclass: Any, name: str, bases: Any, module: str) -> Any:
    """Prepare a mapping before executing any class-body expression."""
    state = runtime.object.create(None)
    method = getattr(metaclass, "__prepare__", state)
    namespace = {} if method is state else method(name, bases)
    if not hasattr(type(namespace), "__getitem__"):
        raise TypeError("__prepare__() must return a mapping")
    try:
        namespace_module = namespace["__name__"]
    except KeyError:
        namespace_module = module
    namespace["__module__"] = namespace_module
    namespace["__qualname__"] = name
    state.namespace = namespace
    bindings = runtime.object.create(None)
    state.bindings = bindings

    def setup_annotations() -> None:
        try:
            namespace["__annotations__"]
        except KeyError:
            namespace["__annotations__"] = {}

    def read(key: str, fallback: Any) -> Any:
        try:
            return namespace[key]
        except KeyError:
            return fallback()

    def delete_name(key: str) -> None:
        try:
            del namespace[key]
        except KeyError:
            raise NameError("name '" + key + "' is not defined") from None

    def install(key: str) -> None:
        def getter() -> Any:
            return namespace[key]

        def setter(value: Any) -> None:
            namespace[key] = value

        descriptor = runtime.object.create(None)
        descriptor.get = getter
        descriptor.set = setter
        descriptor.configurable = True
        runtime.object.defineProperty(bindings, key, descriptor)

    def bind(keys: Any) -> None:
        for key in keys:
            install(key)
        runtime.object.freeze(bindings)

    def finish() -> Any:
        implementation = __import__(
            "sagejs._baselib.builtins", fromlist=["_builtins_apply_metaclass_namespace"]
        )
        return implementation._builtins_apply_metaclass_namespace(
            metaclass, name, bases, namespace
        )

    def names() -> Any:
        return sorted(namespace)

    state.bind = bind
    state.delete_name = delete_name
    state.read = read
    state.finish = finish
    state.setup_annotations = setup_annotations
    state.names = names
    return state
