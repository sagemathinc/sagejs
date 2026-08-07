"""Filesystem resource readers for importlib compatibility."""

from pathlib import Path

from importlib.resources.abc import TraversableResources


class FileReader(TraversableResources):
    def __init__(self, loader):
        self.loader = loader

    def files(self):
        return Path(self.loader.path).parent

    def open_resource(self, resource):
        return self.files().joinpath(resource).open('rb')

    def resource_path(self, resource):
        return str(self.files().joinpath(resource))

    def is_resource(self, path):
        return self.files().joinpath(path).is_file()

    def contents(self):
        return (path.name for path in self.files().iterdir())
