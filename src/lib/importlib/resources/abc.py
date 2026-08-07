"""Resource-reader protocols used by modern import tooling."""


class ResourceReader:
    def open_resource(self, resource):
        raise FileNotFoundError(resource)

    def resource_path(self, resource):
        raise FileNotFoundError(resource)

    def is_resource(self, path):
        return False

    def contents(self):
        return iter(())


class TraversableResources(ResourceReader):
    def files(self):
        raise FileNotFoundError
