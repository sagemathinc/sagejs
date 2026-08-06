"""Abstract-base-class helpers used by pure-Python libraries."""


_abc_cache_token = 0


class ABCMeta(type):
    def register(cls, subclass):
        return _register(cls, subclass)


class ABC:
    @classmethod
    def register(cls, subclass):
        return _register(cls, subclass)


def _register(cls, subclass):
    """Register *subclass* as a virtual subclass of ``cls`` and its ABCs."""
    global _abc_cache_token
    if not callable(subclass) or not hasattr(subclass, '__bases__'):
        raise TypeError('Can only register classes')
    mro = getattr(cls, '__mro__', (cls,))
    for base in mro:
        namespace = getattr(base, '__dict__', {})
        registry = namespace.get('_abc_registry')
        if registry is None:
            registry = []
            setattr(base, '_abc_registry', registry)
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
