"""Portable platform queries for the Sage.js Python runtime."""

import sys
import sagejs.runtime as runtime


def python_implementation():
    return "SageJS"


def python_version():
    return sys.version.split()[0]


def python_version_tuple():
    return tuple(python_version().split("."))


def system():
    value = sys.platform
    if value == "win32":
        return "Windows"
    if value == "darwin":
        return "Darwin"
    if value == "linux":
        return "Linux"
    return str(value)


def machine():
    process = runtime.reflect.get(runtime.global_object, "process")
    value = runtime.reflect.get(process, "arch")
    return "" if value is runtime.undefined else str(value)


def architecture():
    return ("64bit" if "64" in machine() else "32bit", "")


def release():
    return ""


def version():
    return ""


def node():
    return ""


def platform(aliased=False, terse=False):
    del aliased, terse
    return system() + "-" + machine()
