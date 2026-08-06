"""Nominal import-loader base classes used by package feature detection."""


class Loader:
    def create_module(self, spec):
        return None

    def exec_module(self, module):
        raise NotImplementedError


class ResourceLoader(Loader):
    def get_data(self, path):
        raise OSError


class InspectLoader(Loader):
    pass


class ExecutionLoader(InspectLoader):
    pass


class FileLoader(Loader):
    pass


class SourceLoader(ResourceLoader, ExecutionLoader):
    pass


class MetaPathFinder:
    def find_spec(self, fullname, path, target=None):
        return None


class PathEntryFinder:
    def find_spec(self, fullname, target=None):
        return None
