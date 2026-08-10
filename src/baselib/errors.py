# Sage.js exception classes backed by JavaScript Error objects.
#
# Copyright (C) 2015 Kovid Goyal
# Copyright (C) 2026 Sage.js contributors
# License: BSD-3-Clause

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

NameError = runtime.reference_error


def ρσ_exception_value(value: object) -> object:
    if runtime.strict_equal(runtime.jstype(value), "function"):
        value = runtime.reflect.construct(value, [])
    error_tag = runtime.reflect.apply(
        runtime.object.prototype.toString,
        value,
        [],
    )
    if runtime.instance_of(value, runtime.error) or runtime.string(error_tag).endswith(
        "Error]"
    ):
        return value
    raise TypeError("exceptions must derive from BaseException")


def ρσ_function_argument_error(
    message: str,
    target_function: object,
) -> object:
    """Create an argument-binding error attributed to the Python call site."""
    error = runtime.type_error(message)
    capture = runtime.reflect.get(runtime.error, "captureStackTrace")
    if runtime.strict_equal(runtime.jstype(capture), "function"):
        runtime.reflect.apply(capture, runtime.error, [error, target_function])
    runtime.reflect.set(error, "__sagejs_argument_error__", True)
    return error


class BaseException(runtime.error):
    def __init__(self, *args: object) -> None:
        self.args = runtime.math_tuple(list(args))
        if len(args) == 0:
            message = ""
        elif len(args) == 1:
            message = runtime.string(args[0])
        else:
            message = runtime.repr(self.args)
        self.message = message
        self.name = self.constructor.name
        error = runtime.error(message)
        error.name = self.name
        self.stack = error.stack
        # Until an embedding provides structured frame objects, the native
        # Error itself is our traceback-like carrier.  ``traceback.extract_tb``
        # understands its stack string.
        self.__traceback__ = self
        self.__cause__ = None
        self.__context__ = None
        self.__suppress_context__ = False

    def __repr__(self) -> str:
        return self.name + runtime.repr(self.args)

    def __str__(self) -> str:
        return self.message

    def with_traceback(self, traceback: object) -> BaseException:
        self.__traceback__ = traceback
        return self


class Exception(BaseException):
    pass


class BaseExceptionGroup(BaseException):
    """A group of exceptions, compatible with Python 3.11's core surface.

    Sage.js does not yet implement `except*` lowering, but ordinary Python
    libraries use the group classes for annotations and explicit inspection.
    Keeping the standard constructor and attributes makes those uses work
    without pretending that exception-group control flow is complete.
    """

    def __init__(self, message: str, exceptions: Any) -> None:
        values = tuple(exceptions)
        if len(values) == 0:
            raise ValueError(  # pyright: ignore[reportGeneralTypeIssues]
                "exceptions must be a non-empty sequence"
            )
        for value in values:
            if not isinstance(value, BaseException):
                raise TypeError(
                    "exceptions must be a sequence of BaseException instances"
                )
        BaseException.__init__(self, message, values)
        self.message = message
        self.exceptions = values

    def derive(self, exceptions: Any) -> BaseExceptionGroup:
        return self.constructor(self.message, exceptions)

    @classmethod
    def __class_getitem__(cls, _arguments: object) -> object:
        # The concrete group classes are generic in CPython.  Runtime typing
        # information is intentionally lightweight in Sage.js.
        return cls


class ExceptionGroup(BaseExceptionGroup, Exception):
    def __init__(self, message: str, exceptions: Any) -> None:
        values = tuple(exceptions)
        for value in values:
            if not isinstance(value, Exception):
                raise TypeError("Cannot nest BaseExceptions in an ExceptionGroup")
        BaseExceptionGroup.__init__(self, message, values)


# Native JavaScript failures participate in Python's Exception hierarchy.
# Keeping their native constructors means errors raised by the runtime itself
# are caught by the corresponding Python ``except`` clauses.
runtime.object.setPrototypeOf(
    runtime.reflect.get(runtime.type_error, "prototype"),
    runtime.reflect.get(Exception, "prototype"),
)
runtime.object.setPrototypeOf(
    runtime.reflect.get(runtime.reference_error, "prototype"),
    runtime.reflect.get(Exception, "prototype"),
)
runtime.object.setPrototypeOf(
    runtime.reflect.get(runtime.syntax_error, "prototype"),
    runtime.reflect.get(Exception, "prototype"),
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


class Warning(Exception):
    pass


class UserWarning(Warning):
    pass


class DeprecationWarning(Warning):
    pass


class PendingDeprecationWarning(Warning):
    pass


class SyntaxWarning(Warning):
    pass


class RuntimeWarning(Warning):
    pass


class FutureWarning(Warning):
    pass


class ImportWarning(Warning):
    pass


class UnicodeWarning(Warning):
    pass


class BytesWarning(Warning):
    pass


class ResourceWarning(Warning):
    pass


class OSError(Exception):
    def __init__(self, *args: object) -> None:
        Exception.__init__(self, *args)
        self.errno = args[0] if len(args) > 0 else None
        self.strerror = args[1] if len(args) > 1 else None
        self.filename = args[2] if len(args) > 2 else None
        self.filename2 = args[3] if len(args) > 3 else None
        if self.errno is not None and self.strerror is not None:
            message = "[Errno " + str(self.errno) + "] " + str(self.strerror)
            if self.filename is not None:
                message += ": " + runtime.repr(self.filename)
            if self.filename2 is not None:
                message += " -> " + runtime.repr(self.filename2)
            self.message = message


class FileNotFoundError(OSError):
    pass


class FileExistsError(OSError):
    pass


class PermissionError(OSError):
    pass


class IsADirectoryError(OSError):
    pass


class NotADirectoryError(OSError):
    pass


# Python 3 keeps these historical names as exact aliases, and compatibility
# libraries such as pytest's bundled ``py.error`` still import them.
EnvironmentError = OSError
IOError = OSError


class IndentationError(runtime.syntax_error):
    pass


class RuntimeError(Exception):
    pass


class RecursionError(RuntimeError):
    pass


class NotImplementedError(RuntimeError):
    pass


class UnicodeError(ValueError):
    pass


class UnicodeEncodeError(UnicodeError):
    pass


class UnicodeDecodeError(UnicodeError):
    pass


class UnicodeTranslateError(UnicodeError):
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


class StopAsyncIteration(Exception):
    pass


class ρσ_non_exception_throw(BaseException):
    def __init__(self, value: object) -> None:
        BaseException.__init__(self, value)
        self.value = value


for _exception_class in [
    BaseException,
    Exception,
    BaseExceptionGroup,
    ExceptionGroup,
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
    Warning,
    UserWarning,
    DeprecationWarning,
    PendingDeprecationWarning,
    SyntaxWarning,
    RuntimeWarning,
    FutureWarning,
    ImportWarning,
    UnicodeWarning,
    BytesWarning,
    ResourceWarning,
    OSError,
    FileNotFoundError,
    FileExistsError,
    PermissionError,
    IsADirectoryError,
    NotADirectoryError,
    IndentationError,
    NotImplementedError,
    UnicodeError,
    UnicodeEncodeError,
    UnicodeDecodeError,
    UnicodeTranslateError,
    AssertionError,
    ZeroDivisionError,
    OverflowError,
    RuntimeError,
    RecursionError,
    GeneratorExit,
    StopIteration,
    StopAsyncIteration,
]:
    runtime.set_class_repr(
        _exception_class,
        "<class '" + _exception_class.__name__ + "'>",
    )
