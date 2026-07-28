# Sage.js exception classes backed by JavaScript Error objects.
#
# Copyright (C) 2015 Kovid Goyal
# Copyright (C) 2026 Sage.js contributors
# License: BSD-3-Clause

from __future__ import annotations

import sagejs.runtime as runtime

NameError = runtime.reference_error


class Exception(runtime.error):

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
        return self.name + ': ' + self.message

    def __str__(self) -> str:
        return self.message


class AttributeError(Exception):
    pass


class IndexError(Exception):
    pass


class KeyError(Exception):

    def __str__(self) -> str:
        if len(self.args) == 1:
            return runtime.repr(self.args[0])
        return Exception.__str__(self)


class ValueError(Exception):
    pass


class NotImplementedError(Exception):
    pass


class UnicodeDecodeError(Exception):
    pass


class AssertionError(Exception):
    pass


class ZeroDivisionError(Exception):
    pass


class OverflowError(Exception):
    pass


class StopIteration(Exception):
    pass
