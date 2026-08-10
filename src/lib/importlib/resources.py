"""Portable file-oriented subset of :mod:`importlib.resources`."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path


def _module(anchor):
    if isinstance(anchor, str):
        return __import__(anchor, globals(), locals(), ["*"], 0)
    return anchor


def files(anchor):
    """Return the package directory as a ``pathlib.Path`` traversable."""
    module = _module(anchor)
    filename = getattr(module, "__file__", None)
    if filename is None:
        raise TypeError("package has no filesystem location")
    path = Path(filename)
    return path if path.is_dir() else path.parent


def open_binary(package, resource):
    return files(package).joinpath(resource).open("rb")


def open_text(package, resource, encoding="utf-8", errors="strict"):
    return files(package).joinpath(resource).open("r", encoding=encoding, errors=errors)


def read_binary(package, resource):
    with open_binary(package, resource) as stream:
        return stream.read()


def read_text(package, resource, encoding="utf-8", errors="strict"):
    with open_text(package, resource, encoding, errors) as stream:
        return stream.read()


def is_resource(package, name):
    return files(package).joinpath(name).is_file()


def contents(package):
    return [path.name for path in files(package).iterdir()]


@contextmanager
def as_file(path):
    """Yield filesystem-backed traversables unchanged."""
    yield path
