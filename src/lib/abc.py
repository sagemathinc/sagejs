"""Abstract-base-class helpers used by pure-Python libraries."""

_abc_cache_token = 0


class ABCMeta(type):
    def register(cls, subclass):
        return _register(cls, subclass)


class ABC:
    @classmethod
    def register(cls, subclass):
        return _register(cls, subclass)

    @classmethod
    def __class_getitem__(cls, _arguments):
        # Collection ABC subscriptions are used overwhelmingly in annotations.
        # Preserve the runtime origin while keeping this lightweight until the
        # complete GenericAlias reflection surface is needed.
        return cls


def _register(cls, subclass):
    """Register *subclass* as a virtual subclass of ``cls`` and its ABCs."""
    global _abc_cache_token
    # Sage.js represents fundamental types such as ``list`` and ``dict`` by
    # callable host constructors without a writable CPython ``__bases__``
    # slot.  They are nevertheless valid classes and must be registrable by
    # collections.abc.  Non-callable instances remain invalid.
    if not callable(subclass):
        raise TypeError("Can only register classes")
    mro = getattr(cls, "__mro__", (cls,))
    for base in mro:
        if base is object:
            continue
        namespace = getattr(base, "__dict__", {})
        registry = namespace.get("_abc_registry")
        if registry is None:
            registry = []
            setattr(base, "_abc_registry", registry)
        if subclass not in registry:
            registry.append(subclass)
    _abc_cache_token += 1
    return subclass


def abstractmethod(function):
    function.__isabstractmethod__ = True
    return function


def abstractclassmethod(function):
    return classmethod(abstractmethod(function))


def abstractstaticmethod(function):
    return staticmethod(abstractmethod(function))


def abstractproperty(function):
    return property(abstractmethod(function))


def get_cache_token():
    return _abc_cache_token


def update_abstractmethods(cls):
    return cls
