"""Select the instance-dictionary layout base for multiple inheritance.

This small module is independent of the lazy namespace implementation: class
creation can request a layout while that implementation is still importing.
"""

import sagejs.runtime as runtime


def _layout_anchor(owner):
    core = runtime.reflect.get(
        runtime.reflect.get(runtime.global_object, "__sagejs_baselib_modules__"),
        "sagejs._baselib.builtins",
    )
    mro = core._builtins_get_member(owner, "__mro__")
    if not runtime.array.isArray(mro):
        mro = [owner]
    for base in mro:
        if not core._builtins_heap_class_keys.has(base):
            return base
        prototype = runtime.reflect.get(base, "prototype")
        slots = runtime.object.getOwnPropertyDescriptor(prototype, "__slots__")
        if slots is not runtime.undefined:
            names = runtime.reflect.get(slots, "value")
            if runtime.strict_equal(runtime.jstype(names), "string"):
                names = [names]
            for name in names:
                if name not in ("__dict__", "__weakref__"):
                    return base
    return object


def select_instance_dict_base(bases):
    core = runtime.reflect.get(
        runtime.reflect.get(runtime.global_object, "__sagejs_baselib_modules__"),
        "sagejs._baselib.builtins",
    )
    selected = object
    anchor = object
    for base in bases:
        candidate_anchor = _layout_anchor(base)
        candidate_mro = core._builtins_get_member(candidate_anchor, "__mro__")
        if selected is object or (
            candidate_anchor is not anchor
            and (
                anchor is object
                or runtime.array.isArray(candidate_mro)
                and any(base is anchor for base in candidate_mro)
            )
        ):
            selected = base
            anchor = candidate_anchor
    return selected
