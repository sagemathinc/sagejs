"""Shallow and recursive copying compatible with ordinary Python objects."""

import sagejs.runtime as runtime

_core = runtime.reflect.get(
    runtime.reflect.get(runtime.global_object, "__sagejs_baselib_modules__"),
    "sagejs._baselib.builtins",
)


def copy(value):
    method = getattr(value, "__copy__", None)
    if method is not None:
        return method()
    if isinstance(value, list):
        return value[:]
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, set):
        return set(value)
    if isinstance(value, tuple) or isinstance(
        value, (str, bytes, int, float, bool, type(None))
    ):
        return value
    prototype = _core.ρσ_instance_prototype(value)
    answer = runtime.object.create(prototype)
    runtime.object.assign(answer, value)
    _core._builtins_namespace_module()._copy_instance_namespace(value, answer)
    return answer


def deepcopy(value, memo=None):
    if memo is None:
        memo = {}
    identity = id(value)
    if identity in memo:
        return memo[identity]
    method = getattr(value, "__deepcopy__", None)
    if method is not None:
        return method(memo)
    if isinstance(value, (str, bytes, int, float, bool, type(None))):
        return value
    if isinstance(value, list):
        answer = []
        memo[identity] = answer
        answer.extend(deepcopy(item, memo) for item in value)
        return answer
    if isinstance(value, tuple):
        return tuple(deepcopy(item, memo) for item in value)
    if isinstance(value, dict):
        answer = {}
        memo[identity] = answer
        for key, item in value.items():
            answer[deepcopy(key, memo)] = deepcopy(item, memo)
        return answer
    if isinstance(value, set):
        answer = set()
        memo[identity] = answer
        for item in value:
            answer.add(deepcopy(item, memo))
        return answer
    answer = copy(value)
    memo[identity] = answer
    namespace = _core.ρσ_instance_namespace(value)
    if namespace is not None:
        _core.ρσ_replace_instance_namespace(answer, deepcopy(namespace, memo))
        return answer
    # Objects without a dictionary may still carry declared slot state.
    # Native private fields are not a synthetic Python namespace.
    for owner in type(value).__mro__:
        slots = owner.__dict__.get("__slots__", ())
        if isinstance(slots, str):
            slots = (slots,)
        for name in slots:
            if name in ("__dict__", "__weakref__"):
                continue
            if name.startswith("__") and not name.endswith("__"):
                owner_name = owner.__name__.lstrip("_")
                if owner_name:
                    name = "_" + owner_name + name
            if hasattr(value, name):
                setattr(answer, name, deepcopy(getattr(value, name), memo))
    return answer


Error = Exception
