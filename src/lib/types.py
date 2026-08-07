"""Small Python ``types`` compatibility layer used by Sage.js."""

from __future__ import annotations

from typing import Any, Callable

import sagejs.runtime as runtime


class ModuleType:
    """Mutable module namespace compatible with ``types.ModuleType``."""

    __sagejs_module_type__ = True

    def __init__(self, name, doc=None):
        self.__name__ = name
        self.__doc__ = doc
        self.__package__ = None
        self.__loader__ = None
        self.__spec__ = None

    def __repr__(self):
        return "<module '" + self.__name__ + "'>"


# Compiled imports use lightweight live namespace objects rather than
# allocating ``ModuleType`` for every module.  Publish the Python class so the
# builtin ``type``/``isinstance`` operations can preserve CPython semantics
# for those native namespaces.
runtime.reflect.set(
    runtime.global_object, '__sagejs_module_type_class__', ModuleType)


def MethodType(function, instance, cls=None):
    if instance is None:
        return function
    return function.__get__(instance, type(instance))


def resolve_bases(bases):
    answer = []
    for base in bases:
        resolver = getattr(base, '__mro_entries__', None)
        if resolver is None:
            answer.append(base)
        else:
            answer.extend(resolver(bases))
    return tuple(answer)


class DynamicClassAttribute(property):
    pass


class MappingProxyType:
    """Read-only live view of a mapping."""

    def __init__(self, mapping):
        self._mapping = mapping

    def __getitem__(self, key):
        return self._mapping[key]

    def __iter__(self):
        return iter(self._mapping)

    def __len__(self):
        return len(self._mapping)

    def __contains__(self, key):
        return key in self._mapping

    def get(self, key, default=None):
        return self._mapping.get(key, default)

    def keys(self):
        return self._mapping.keys()

    def values(self):
        return self._mapping.values()

    def items(self):
        return self._mapping.items()

    def copy(self):
        return self._mapping.copy()

    def __repr__(self):
        return 'mappingproxy(' + repr(self._mapping) + ')'


FunctionType = type(lambda: None)
LambdaType = FunctionType
BuiltinFunctionType = FunctionType
BuiltinMethodType = FunctionType
GeneratorType = type((value for value in ()))
CodeType = type((lambda: None).__code__)
# Native JavaScript stacks do not expose CPython frame/traceback objects yet;
# these names primarily serve runtime annotation and compatibility imports.


class NoneType:
    pass


class FrameType:
    pass


class TracebackType:
    pass


GenericAlias = type(list[int])


class SimpleNamespace:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def __repr__(self):
        values = ', '.join(
            name + '=' + repr(value)
            for name, value in sorted(self.__dict__.items()))
        return 'namespace(' + values + ')'

    def __eq__(self, other):
        return (
            isinstance(other, SimpleNamespace)
            and self.__dict__ == other.__dict__)


def coroutine(function: Callable[..., Any]) -> Callable[..., Any]:
    """Mark a generator function as awaitable.

    Sage.js represents both generator-based coroutines and native
    ``async def`` coroutines with its generator protocol, so the marker does
    not require a wrapper.
    """
    return function
