"""Lazy Python-facing attribute listing behind the builtin dir facade."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

__all__ = ["_default_dir", "_dir"]

_core: Any = runtime.reflect.get(
    runtime.reflect.get(runtime.global_object, "__sagejs_baselib_modules__"),
    "sagejs._baselib.builtins",
)
_Str = str


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
    seen: Any,
) -> None:
    current = value
    while (
        current is not None
        and current is not runtime.undefined
        and current is not runtime.object.prototype
    ):
        for name in runtime.object.getOwnPropertyNames(current):
            descriptor = runtime.object.getOwnPropertyDescriptor(current, name)
            member = runtime.reflect.get(descriptor, "value")
            getter = runtime.reflect.get(descriptor, "get")
            if _core._builtins_is_module_namespace(current) and runtime.strict_equal(
                runtime.jstype(getter), "function"
            ):
                data_value_missing = _core._builtins_is_missing_binding(
                    runtime.reflect.get(current, name)
                )
            else:
                data_value_missing = _core._builtins_is_missing_binding(member) and (
                    getter is runtime.undefined
                    and runtime.reflect.get(descriptor, "set") is runtime.undefined
                )
            if (
                not data_value_missing
                and _core.ρσ_visible_introspection_name(name)
                and not seen.has(name)
            ):
                seen.add(name)
                answer.append(name)
        current = runtime.object.getPrototypeOf(current)


def _builtins_append_own_dir_names(
    value: Any,
    answer: list[_Str],
    seen: Any,
) -> None:
    for name in runtime.object.getOwnPropertyNames(value):
        descriptor = runtime.object.getOwnPropertyDescriptor(value, name)
        member = runtime.reflect.get(descriptor, "value")
        getter = runtime.reflect.get(descriptor, "get")
        if _core._builtins_is_module_namespace(value) and runtime.strict_equal(
            runtime.jstype(getter), "function"
        ):
            data_value_missing = _core._builtins_is_missing_binding(
                runtime.reflect.get(value, name)
            )
        else:
            data_value_missing = _core._builtins_is_missing_binding(member) and (
                getter is runtime.undefined
                and runtime.reflect.get(descriptor, "set") is runtime.undefined
            )
        if (
            not data_value_missing
            and _core.ρσ_visible_introspection_name(name)
            and not seen.has(name)
        ):
            seen.add(name)
            answer.append(name)


def _default_dir(item: Any) -> list[_Str]:
    """Return the default sorted Python-facing attributes for `item`."""
    target = _builtins_introspection_target(item)
    answer = []
    seen = runtime.reflect.construct(runtime.set_class, [])
    target_is_function = runtime.strict_equal(runtime.jstype(target), "function")
    constructor = _core._builtins_get_member(target, "constructor")
    target_is_python_instance = _core._builtins_is_python_class(constructor)
    if target_is_function and not target_is_python_instance:
        _builtins_append_own_dir_names(target, answer, seen)
        for native_function_name in ["length", "name"]:
            if native_function_name in answer:
                answer.remove(native_function_name)
    else:
        _builtins_append_dir_names(target, answer, seen)

    namespace = _core.ρσ_instance_namespace(target)
    if namespace is not None:
        for name in namespace.keymap.values():
            if not runtime.strict_equal(runtime.jstype(name), "string"):
                raise TypeError(
                    "instance dictionary contains a non-string attribute name"
                )
            if not seen.has(name):
                seen.add(name)
                answer.append(name)

    # Python classes expose their instance methods through the class object.
    # Sage.js stores those methods on the JavaScript constructor prototype.
    if target_is_function:
        prototype = _core._builtins_get_member(target, "prototype")
        if prototype is not runtime.undefined and prototype is not None:
            _builtins_append_dir_names(prototype, answer, seen)
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
        private_names = _core._builtins_get_member(
            runtime.global_object, "__sagejs_baselib_private_names__"
        )
        if private_names is not runtime.undefined:
            for private_name in private_names:
                if private_name in answer:
                    answer.remove(private_name)

    # Attribute names are primitive strings, so the host's stable lexical sort
    # has exactly the ordering required by Python without routing every
    # comparison through the generic rich-comparison machinery.  Traitlets
    # calls ``dir(cls)`` for every descriptor-bearing class, making the former
    # quadratic Python loop dominate imports of class-heavy packages.
    runtime.reflect.apply(runtime.array.prototype.sort, answer, [])
    return answer


def _dir(item: Any) -> list[_Str]:
    """Return the sorted Python-facing attributes available on `item`."""
    if _core._builtins_member_is_function(item, "__dir__"):
        # Use ordinary receiver-aware host lookup here.  In particular, a
        # Python class is itself the receiver for ``object.__dir__``; routing
        # through the generic class-descriptor path would intentionally expose
        # an unbound function and make ``dir(SomeClass)`` inspect globals.
        custom_names = _core._builtins_call_member(item, "__dir__", [])
        answer = []
        for name in custom_names:
            if not runtime.strict_equal(runtime.jstype(name), "string"):
                raise TypeError("__dir__() must return an iterable of strings")
            answer.append(name)
        answer.sort()
        return answer
    return _default_dir(item)
