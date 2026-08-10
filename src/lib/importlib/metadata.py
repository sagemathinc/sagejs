"""Metadata discovery subset for isolated pure-Python environments."""


class PackageNotFoundError(ImportError):
    pass


class EntryPoint:
    def __init__(self, name, value, group):
        self.name = name
        self.value = value
        self.group = group

    def load(self):
        module_name, separator, attribute = self.value.partition(":")
        module = __import__(module_name, globals(), locals(), ["*"], 0)
        if not separator:
            return module
        value = module
        for name in attribute.split("."):
            value = getattr(value, name)
        return value


class EntryPoints(list):
    def select(self, **params):
        return EntryPoints(
            item
            for item in self
            if all(getattr(item, name) == value for name, value in params.items())
        )


class Distribution:
    metadata = {}
    entry_points = EntryPoints()

    @classmethod
    def from_name(cls, name):
        raise PackageNotFoundError(name)


def entry_points(**params):
    points = EntryPoints()
    return points.select(**params) if params else points


def distributions(**kwargs):
    del kwargs
    return iter(())


def distribution(name):
    raise PackageNotFoundError(name)


def version(name):
    return distribution(name).version


def metadata(name):
    return distribution(name).metadata


def files(name):
    return distribution(name).files


def requires(name):
    return distribution(name).requires
