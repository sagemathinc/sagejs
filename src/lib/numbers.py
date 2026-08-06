"""Numeric abstract base classes from Python's :mod:`numbers` protocol."""

def _register(cls, subclass):
    if not callable(subclass):
        raise TypeError('Can only register classes')
    for base in getattr(cls, '__mro__', (cls,)):
        registry = getattr(base, '_abc_registry', None)
        if registry is None:
            registry = []
            setattr(base, '_abc_registry', registry)
        present = False
        for registered in registry:
            if subclass is registered:
                present = True
                break
        if not present:
            registry.append(subclass)
    return subclass


class Number:
    """Root of the numeric tower."""

    @classmethod
    def register(cls, subclass):
        return _register(cls, subclass)


class Complex(Number):
    """Complex-valued numeric objects."""

    @classmethod
    def register(cls, subclass):
        return _register(cls, subclass)


class Real(Complex):
    """Real-valued numeric objects."""

    @classmethod
    def register(cls, subclass):
        return _register(cls, subclass)


class Rational(Real):
    """Exact rational numeric objects."""

    @classmethod
    def register(cls, subclass):
        return _register(cls, subclass)


class Integral(Rational):
    """Integral numeric objects."""

    @classmethod
    def register(cls, subclass):
        return _register(cls, subclass)


Complex.register(complex)
Real.register(float)
Integral.register(int)


__all__ = ['Number', 'Complex', 'Real', 'Rational', 'Integral']
