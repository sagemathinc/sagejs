"""Small, compatible module-spec layer for :mod:`importlib.util`."""

import sys


class ModuleSpec:
    def __init__(
        self,
        name,
        loader,
        *,
        origin=None,
        loader_state=None,
        is_package=None,
    ):
        self.name = name
        self.loader = loader
        self.origin = origin
        self.loader_state = loader_state
        self.submodule_search_locations = [] if is_package else None
        self.cached = None
        self.has_location = origin is not None

    @property
    def parent(self):
        if self.submodule_search_locations is not None:
            return self.name
        return self.name.rpartition(".")[0]


def spec_from_loader(name, loader, *, origin=None, is_package=None):
    if is_package is None and loader is not None:
        method = getattr(loader, "is_package", None)
        if method is not None:
            is_package = method(name)
    return ModuleSpec(
        name,
        loader,
        origin=origin,
        is_package=bool(is_package),
    )


def spec_from_file_location(
    name,
    location=None,
    *,
    loader=None,
    submodule_search_locations=None,
):
    spec = ModuleSpec(
        name,
        loader,
        origin=location,
        is_package=submodule_search_locations is not None,
    )
    if submodule_search_locations is not None:
        spec.submodule_search_locations = list(submodule_search_locations)
    return spec


def module_from_spec(spec):
    creator = getattr(spec.loader, "create_module", None)
    if creator is not None:
        module = creator(spec)
        if module is not None:
            return module
    return type(sys)(spec.name)


def resolve_name(name, package):
    if not name.startswith("."):
        return name
    if not package:
        raise ImportError("no package specified for relative import")
    level = len(name) - len(name.lstrip("."))
    parts = package.split(".")
    if level > len(parts):
        raise ImportError("attempted relative import beyond top-level package")
    prefix = ".".join(parts[: len(parts) - level + 1])
    tail = name[level:]
    return prefix + ("." + tail if tail else "")


def find_spec(name, package=None):
    module = sys.modules.get(name)
    if module is None:
        return None
    return getattr(module, "__spec__", None)
