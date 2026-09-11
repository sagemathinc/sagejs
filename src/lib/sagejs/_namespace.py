"""Lazy Python namespace snapshots and instance dictionary lifecycle.

Native field bridges and implicit attribute resolution remain in the core.
These dictionary-exposure paths run only when Python requests a namespace.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

__all__ = [
    "_change_instance_class",
    "_copy_instance_namespace",
    "_delete_instance_attribute",
    "_delete_instance_dict",
    "_get_instance_dict",
    "_namespace_dict",
    "_replace_function_namespace",
    "_refresh_class_namespace",
    "_set_instance_dict",
]

_core: Any = runtime.reflect.get(
    runtime.reflect.get(runtime.global_object, "__sagejs_baselib_modules__"),
    "sagejs._baselib.builtins",
)
_MISSING = object()


def _native_member(value: Any, name: str) -> Any:
    """Keep absent host members distinct from both Python None and locals."""
    member = [runtime.reflect.get(value, name)]
    return _MISSING if member[0] is runtime.undefined else member[0]


def _stored_namespace(value: Any) -> Any:
    if _core._builtins_instance_namespaces.get(value) is runtime.undefined:
        return None
    return _core._builtins_instance_namespaces.get(value)


def _stored_fields(value: Any) -> Any:
    if not _core._builtins_instance_fields.has(value):
        return None
    return _core._builtins_instance_fields.get(value)


def _change_instance_class(value: Any, owner: Any) -> None:
    prototype = runtime.reflect.get(owner, "prototype")
    if not _core._builtins_instance_namespaces.has(value):
        runtime.object.setPrototypeOf(value, prototype)
    else:
        bridge = runtime.object.getPrototypeOf(value)
        runtime.object.setPrototypeOf(bridge, prototype)
        _core._builtins_prototype_owners.set(bridge, owner)


def _refresh_class_namespace(value: Any) -> Any:
    if value._epoch != _core._builtins_descriptor_epoch:
        value._mapping = _callable_namespace_snapshot(value._owner)
        value._epoch = _core._builtins_descriptor_epoch
    return value._mapping


def _check_instance_dict(descriptor: Any, instance: Any) -> None:
    owner = _core._builtins_attribute_owner(instance)
    mro = _native_member(owner, "__mro__")
    if owner is not descriptor.__objclass__ and (
        not runtime.array.isArray(mro) or descriptor.__objclass__ not in mro
    ):
        raise TypeError("__dict__ descriptor does not apply to this object")


def _get_instance_dict(descriptor: Any, instance: Any) -> Any:
    _check_instance_dict(descriptor, instance)
    return _instance_dict(instance)


def _set_instance_dict(descriptor: Any, instance: Any, namespace: Any) -> None:
    _check_instance_dict(descriptor, instance)
    if not runtime.instance_of(namespace, dict):
        raise TypeError("__dict__ must be set to a dictionary")
    _replace_instance_namespace(instance, namespace)


def _delete_instance_dict(descriptor: Any, instance: Any) -> None:
    _check_instance_dict(descriptor, instance)
    # Old references keep their dictionary. A later access gets a fresh one.
    _replace_instance_namespace(instance, None)


def _instance_dict(value: Any) -> Any:
    namespace = _stored_namespace(value)
    if namespace is None:
        namespace = _instance_namespace(value)
        if namespace is None:
            namespace = dict()
        _replace_instance_namespace(value, namespace)
    return namespace


def _instance_namespace(value: Any) -> Any:
    """Inspect storage without exposure or overrides; None means no namespace."""
    namespace = _stored_namespace(value)
    if namespace is not None:
        return namespace
    fields = _stored_fields(value)
    if fields is None:
        return None
    namespace: Any = dict()
    for name in fields:
        if (
            runtime.object.getOwnPropertyDescriptor(value, name)
            is not runtime.undefined
        ):
            namespace.keymap.set(name, name)
            namespace.jsmap.set(name, runtime.reflect.get(value, name))
    return namespace


def _replace_instance_namespace(value: Any, namespace: Any) -> None:
    """Transition Python fields to owned dict storage, retaining host identity.

    The prototype bridge preserves native field reads/writes. Raw own-property
    enumeration still describes the host layout, not the Python namespace.
    Native private own fields were never registered and remain untouched.
    """
    fields = _stored_fields(value)
    if fields is not None:
        for name in fields:
            runtime.reflect.deleteProperty(value, name)
        fields.clear()
    exposed = _core._builtins_instance_namespaces.has(value)
    _core._builtins_instance_namespaces.set(
        value, runtime.undefined if namespace is None else namespace
    )
    if not exposed:
        _core.ρσ_bridge_instance_namespace(value)


def _copy_instance_namespace(source: Any, target: Any) -> None:
    """Copy Python storage after native own fields have been copied."""
    namespace = _stored_namespace(source)
    if namespace is not None:
        _replace_instance_namespace(target, dict(namespace))
    else:
        fields = _stored_fields(source)
        if fields is not None:
            _core._builtins_instance_fields.set(
                target, runtime.reflect.construct(runtime.set_class, [fields])
            )


def _callable_namespace_snapshot(value: Any) -> Any:
    """Build one Python-visible snapshot of a class or function namespace."""
    namespace = runtime.object.create(None)
    plain_function = runtime.strict_equal(
        runtime.jstype(value), "function"
    ) and not _core._builtins_is_python_class(value)

    def copy_own_members(source: Any) -> None:
        if source is None or source is runtime.undefined:
            return
        for member_name in runtime.object.getOwnPropertyNames(source):
            if member_name == "__dict__" and (
                _core._builtins_instance_dict_owners.get(value) is False
            ):
                # Native mixin copying can materialize inherited descriptors.
                # That does not make them entries in the child's own namespace.
                continue
            descriptor = runtime.object.getOwnPropertyDescriptor(source, member_name)
            member = _native_member(descriptor, "value")
            if (member is _MISSING or _core._builtins_is_missing_binding(member)) and (
                runtime.reflect.get(descriptor, "get") is runtime.undefined
                and runtime.reflect.get(descriptor, "set") is runtime.undefined
            ):
                continue
            if member is _MISSING and (
                runtime.reflect.get(descriptor, "get") is not runtime.undefined
                or runtime.reflect.get(descriptor, "set") is not runtime.undefined
            ):
                # A class dictionary exposes the descriptor without invoking
                # it.  Compiler-emitted properties use native accessors; wrap
                # those accessors so a class rebuilt by ``type``/a metaclass
                # retains the property in its namespace.
                getter = _native_member(descriptor, "get")
                if (
                    _core._builtins_get_member(getter, "__sagejs_lazy_method_getter__")
                    is True
                ):
                    member = _core._builtins_get_member(
                        getter, "__sagejs_unbound_method__"
                    )
                    if (
                        _core._builtins_get_member(member, "__classmethod__")
                        is not True
                    ):
                        member = runtime.unbound_method_adapter(member)
                else:
                    runtime.reflect.set(
                        namespace,
                        member_name,
                        _core._builtins_native_property(
                            source, member_name, descriptor
                        ),
                    )
                    continue
            if (
                not plain_function
                and runtime.strict_equal(runtime.jstype(member), "function")
                and _core._builtins_get_member(
                    member, "__sagejs_method_signature_excludes_self__"
                )
                is True
                and _core._builtins_get_member(member, "__classmethod__") is not True
                and _core._builtins_get_member(member, "__staticmethod__") is not True
            ):
                member = runtime.unbound_method_adapter(member)
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
                    and _core._BUILTINS_FUNCTION_SLOT_NAMES.has(member_name)
                )
                and _core._builtins_get_member(
                    member,
                    "__sagejs_synthetic_method__",
                )
                is not True
                and not (
                    member_name == "__init__"
                    and _core._builtins_get_member(
                        member,
                        "__sagejs_synthetic_init__",
                    )
                    is True
                )
                and not (
                    source is value
                    and member_name == "__repr__"
                    and _core._builtins_get_member(
                        member,
                        "__sagejs_internal_class_repr__",
                    )
                    is True
                )
                and _core._builtins_visible_introspection_name(member_name)
            ):
                runtime.reflect.set(
                    namespace,
                    member_name,
                    member,
                )

    copy_own_members(value)
    if _core._builtins_is_python_class(value):
        copy_own_members(_core._builtins_get_member(value, "prototype"))
    return runtime.scope_dict(namespace)


def _namespace_dict(value: Any) -> Any:
    """Return the Python-visible own namespace of an object or class."""
    if _core._builtins_is_module_namespace(value):
        # Unlike class ``__dict__``, a module dictionary is a mutable live
        # namespace.  Wrapping the actual object is both the CPython behavior
        # and dramatically cheaper for documentation-heavy modules such as
        # ``mpmath.function_docs``.
        live_scope_dict = runtime.reflect.get(
            runtime.global_object, "ρσ_live_scope_dict"
        )
        return runtime.reflect.apply(live_scope_dict, runtime.undefined, [value])

    if _core._builtins_has_instance_dict(value):
        return _instance_dict(value)

    if runtime.strict_equal(runtime.jstype(value), "object") or (
        runtime.strict_equal(runtime.jstype(value), "function")
        and runtime.native_get(value, "__sagejs_callable_instance__") is True
    ):
        # Instance ``__dict__`` is a writable live namespace.  A detached
        # snapshot breaks ``obj.__dict__.update(...)`` and other ordinary
        # Python object-model operations.
        live_scope_dict = runtime.reflect.get(
            runtime.global_object, "ρσ_live_scope_dict"
        )
        return runtime.reflect.apply(live_scope_dict, runtime.undefined, [value, True])

    if _core._builtins_is_python_class(value):
        if not _core._builtins_class_namespace_cache.has(value):
            _core._builtins_class_namespace_cache.set(
                value, _core.ρσ_class_namespace_proxy(value)
            )
        return _core._builtins_class_namespace_cache.get(value)

    return _callable_namespace_snapshot(value)


def _delete_instance_attribute(value: Any, name: str) -> bool:
    namespace = _stored_namespace(value)
    if namespace is None:
        fields = _stored_fields(value)
        if fields is not None and fields.has(name):
            runtime.reflect.apply(runtime.reflect.get(fields, "delete"), fields, [name])
            runtime.reflect.deleteProperty(value, name)
            return True
    if namespace is None:
        raise AttributeError("object has no attribute '" + name + "'")
    values = runtime.reflect.get(namespace, "jsmap")
    keys = runtime.reflect.get(namespace, "keymap")
    if not values.has(name):
        raise AttributeError("object has no attribute '" + name + "'")
    runtime.reflect.apply(runtime.reflect.get(values, "delete"), values, [name])
    runtime.reflect.apply(runtime.reflect.get(keys, "delete"), keys, [name])
    return True


def _replace_function_namespace(instance: Any, namespace: Any) -> None:
    """Replace an instance namespace while preserving its host identity."""
    if not _core._builtins_member_is_function(namespace, "items"):
        raise TypeError("__dict__ must be set to a dictionary")
    for key in list(runtime.object.keys(instance)):
        runtime.reflect.deleteProperty(instance, key)
    for pair in namespace.items():
        key = pair[0]
        if not runtime.strict_equal(runtime.jstype(key), "string"):
            raise TypeError("__dict__ keys must be strings")
        runtime.reflect.set(instance, key, pair[1])
