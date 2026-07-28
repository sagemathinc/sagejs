# Sage.js exception classes backed by JavaScript Error objects.
#
# Copyright (C) 2015 Kovid Goyal
# Copyright (C) 2026 Sage.js contributors
# License: BSD-3-Clause

from __future__ import annotations

import sagejs.runtime as runtime

NameError = runtime.reference_error


def ρσ_exception_value(value: object) -> object:
    if runtime.strict_equal(runtime.jstype(value), 'function'):
        return runtime.reflect.construct(value, [])
    return value


class BaseException(runtime.error):

    def __init__(self, *args: object) -> None:
        self.args = runtime.math_tuple(list(args))
        if len(args) == 0:
            message = ''
        elif len(args) == 1:
            message = runtime.string(args[0])
        else:
            message = runtime.repr(self.args)
        self.message = message
        self.name = self.constructor.name
        error = runtime.error(message)
        error.name = self.name
        self.stack = error.stack

    def __repr__(self) -> str:
        return self.name + runtime.repr(self.args)

    def __str__(self) -> str:
        return self.message


class Exception(BaseException):
    pass


# Native JavaScript failures participate in Python's Exception hierarchy.
# Keeping their native constructors means errors raised by the runtime itself
# are caught by the corresponding Python ``except`` clauses.
runtime.object.setPrototypeOf(
    runtime.reflect.get(runtime.type_error, 'prototype'),
    runtime.reflect.get(Exception, 'prototype'),
)
runtime.object.setPrototypeOf(
    runtime.reflect.get(runtime.reference_error, 'prototype'),
    runtime.reflect.get(Exception, 'prototype'),
)
runtime.object.setPrototypeOf(
    runtime.reflect.get(runtime.syntax_error, 'prototype'),
    runtime.reflect.get(Exception, 'prototype'),
)


class SystemExit(BaseException):

    def __init__(self, *args: object) -> None:
        BaseException.__init__(self, *args)
        self.code = args[0] if len(args) > 0 else None


class KeyboardInterrupt(BaseException):
    pass


class AttributeError(Exception):
    pass


class ArithmeticError(Exception):
    pass


class LookupError(Exception):
    pass


class IndexError(LookupError):
    pass


class KeyError(LookupError):

    def __str__(self) -> str:
        if len(self.args) == 1:
            return runtime.repr(self.args[0])
        return Exception.__str__(self)


class ValueError(Exception):
    pass


class EOFError(Exception):
    pass


class ImportError(Exception):
    pass


class MemoryError(Exception):
    pass


class OSError(Exception):

    def __init__(self, *args: object) -> None:
        Exception.__init__(self, *args)
        self.errno = args[0] if len(args) > 0 else None


class IndentationError(runtime.syntax_error):
    pass


class RuntimeError(Exception):
    pass


class NotImplementedError(RuntimeError):
    pass


class UnicodeDecodeError(Exception):
    pass


class AssertionError(Exception):
    pass


class ZeroDivisionError(ArithmeticError):
    pass


class OverflowError(ArithmeticError):
    pass


class GeneratorExit(BaseException):
    pass


class StopIteration(Exception):

    def __init__(self, *args: object) -> None:
        Exception.__init__(self, *args)
        self.value = args[0] if len(args) > 0 else None


for _exception_class in [
    BaseException,
    Exception,
    SystemExit,
    KeyboardInterrupt,
    AttributeError,
    ArithmeticError,
    LookupError,
    IndexError,
    KeyError,
    ValueError,
    EOFError,
    ImportError,
    MemoryError,
    OSError,
    IndentationError,
    NotImplementedError,
    UnicodeDecodeError,
    AssertionError,
    ZeroDivisionError,
    OverflowError,
    RuntimeError,
    GeneratorExit,
    StopIteration,
]:
    runtime.set_class_repr(
        _exception_class,
        "<class '" + _exception_class.__name__ + "'>",
    )
