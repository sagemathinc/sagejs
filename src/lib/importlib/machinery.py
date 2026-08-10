"""Nominal loader classes and module specs for import compatibility."""

from __future__ import annotations

from importlib.util import ModuleSpec
from importlib.util import find_spec


class BuiltinImporter:
    @classmethod
    def find_spec(cls, fullname, path=None, target=None):
        return find_spec(fullname)


class FrozenImporter(BuiltinImporter):
    pass


class PathFinder:
    @classmethod
    def find_spec(cls, fullname, path=None, target=None):
        return find_spec(fullname)

    @classmethod
    def invalidate_caches(cls):
        return None


class FileFinder:
    def __init__(self, path, *loader_details):
        self.path = path
        self.loader_details = loader_details

    def find_spec(self, fullname, target=None):
        return find_spec(fullname)

    @classmethod
    def path_hook(cls, *loader_details):
        def hook(path):
            return cls(path, *loader_details)

        return hook


class SourceFileLoader:
    def __init__(self, fullname, path):
        self.name = fullname
        self.path = path

    def get_filename(self, fullname):
        return self.path

    def get_data(self, path):
        with open(path, "rb") as stream:
            return stream.read()


class SourcelessFileLoader(SourceFileLoader):
    pass


class ExtensionFileLoader(SourceFileLoader):
    pass


class NamespaceLoader:
    def __init__(self, name, path, path_finder=None):
        self.name = name
        self.path = path
        self.path_finder = path_finder


SOURCE_SUFFIXES = [".py"]
BYTECODE_SUFFIXES = [".pyc"]
EXTENSION_SUFFIXES = []
DEBUG_BYTECODE_SUFFIXES = BYTECODE_SUFFIXES
OPTIMIZED_BYTECODE_SUFFIXES = BYTECODE_SUFFIXES
all_suffixes = lambda: SOURCE_SUFFIXES + BYTECODE_SUFFIXES + EXTENSION_SUFFIXES


__all__ = [
    "ModuleSpec",
    "BuiltinImporter",
    "FrozenImporter",
    "PathFinder",
    "FileFinder",
    "SourceFileLoader",
    "SourcelessFileLoader",
    "ExtensionFileLoader",
    "NamespaceLoader",
    "SOURCE_SUFFIXES",
    "BYTECODE_SUFFIXES",
    "EXTENSION_SUFFIXES",
    "all_suffixes",
]
