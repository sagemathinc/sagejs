"""Small Python ``types`` compatibility layer used by Sage.js."""

from __future__ import annotations

from typing import Any, Callable


class ModuleType:
    """Mutable module namespace compatible with ``types.ModuleType``."""

    def __init__(self, name, doc=None):
        self.__name__ = name
        self.__doc__ = doc
        self.__package__ = None
        self.__loader__ = None
        self.__spec__ = None

    def __repr__(self):
        return "<module '" + self.__name__ + "'>"


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


def MappingProxyType(mapping):
    """Return a mapping view.

    The initial runtime representation shares the input dictionary, matching
    CPython's live-view behavior.  Mutation rejection will be added with the
    general read-only mapping protocol; consumers such as TOML parsers only
    read this object.
    """
    return mapping


FunctionType = type(lambda: None)
LambdaType = FunctionType
BuiltinFunctionType = FunctionType
BuiltinMethodType = FunctionType
GeneratorType = type((value for value in ()))
NoneType = type(None)


def coroutine(function: Callable[..., Any]) -> Callable[..., Any]:
    """Mark a generator function as awaitable.

    Sage.js represents both generator-based coroutines and native
    ``async def`` coroutines with its generator protocol, so the marker does
    not require a wrapper.
    """
    return function
