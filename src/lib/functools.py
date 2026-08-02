"""Common higher-order function utilities."""

from collections import namedtuple
import sagejs.runtime as runtime


_missing = object()


def reduce(function, iterable, initializer=_missing):
    iterator = iter(iterable)
    if initializer is _missing:
        try:
            value = next(iterator)
        except StopIteration:
            raise TypeError('reduce() of empty iterable with no initial value')
    else:
        value = initializer
    for item in iterator:
        value = function(value, item)
    return value


class partial:
    def __init__(self, function, *args, **keywords):
        if not callable(function):
            raise TypeError('the first argument must be callable')
        self.func = function
        self.args = tuple(args)
        self.keywords = dict(keywords)

    def __call__(self, *args, **keywords):
        combined = dict(self.keywords)
        combined.update(keywords)
        return self.func(*self.args, *args, **combined)

    def __repr__(self):
        return 'functools.partial(' + repr(self.func) + ')'


def update_wrapper(wrapper, wrapped, assigned=('__module__', '__name__', '__qualname__', '__doc__', '__annotations__'), updated=('__dict__',)):
    del updated
    for attribute in assigned:
        if hasattr(wrapped, attribute):
            try:
                setattr(wrapper, attribute, getattr(wrapped, attribute))
            except Exception:
                pass
    try:
        wrapper.__wrapped__ = wrapped
    except Exception:
        pass
    return wrapper


def wraps(wrapped, assigned=('__module__', '__name__', '__qualname__', '__doc__', '__annotations__'), updated=('__dict__',)):
    def decorate(wrapper):
        return update_wrapper(wrapper, wrapped, assigned, updated)
    return decorate


_CacheInfo = namedtuple('CacheInfo', 'hits misses maxsize currsize')


def _same_call(left_args, left_keywords, right_args, right_keywords, typed):
    if list(left_args) != list(right_args):
        return False
    if list(left_keywords.items()) != list(right_keywords.items()):
        return False
    if typed:
        return [type(value) for value in left_args] == [type(value) for value in right_args]
    return True


def lru_cache(maxsize=128, typed=False):
    if callable(maxsize):
        function = maxsize
        return lru_cache()(function)

    def decorate(function):
        entries = []
        hits = [0]
        misses = [0]

        def cached(*args, **keywords):
            for index in range(len(entries)):
                old_args, old_keywords, value = entries[index]
                if _same_call(old_args, old_keywords, args, keywords, typed):
                    hits[0] += 1
                    entry = entries.pypop(index)
                    entries.append(entry)
                    return value
            misses[0] += 1
            value = function(*args, **keywords)
            if maxsize != 0:
                entries.append((list(args), dict(keywords), value))
                if maxsize is not None and len(entries) > maxsize:
                    entries.pypop(0)
            return value

        def cache_info():
            return _CacheInfo(hits[0], misses[0], maxsize, len(entries))

        def cache_clear():
            entries.clear()
            hits[0] = 0
            misses[0] = 0

        cached.cache_info = cache_info
        cached.cache_clear = cache_clear
        cached.cache_parameters = lambda: {'maxsize': maxsize, 'typed': typed}
        return update_wrapper(cached, function)

    return decorate


def cache(function):
    return lru_cache(maxsize=None)(function)


class cached_property:
    def __init__(self, function):
        self.func = function
        self.attrname = getattr(function, '__name__', None)
        self.__doc__ = getattr(function, '__doc__', None)

    def __set_name__(self, owner, name):
        del owner
        self.attrname = name

    def __get__(self, instance, owner=None):
        del owner
        if instance is None:
            return self
        if runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            instance,
            [self.attrname],
        ):
            return runtime.reflect.get(instance, self.attrname)
        value = runtime.reflect.apply(
            runtime.reflect.get(self, 'func'),
            instance,
            [],
        )
        setattr(instance, self.attrname, value)
        return value


class _KeyWrapper:
    def __init__(self, obj, comparison):
        self.obj = obj
        self._comparison = comparison

    def __lt__(self, other):
        return self._comparison(self.obj, other.obj) < 0

    def __gt__(self, other):
        return self._comparison(self.obj, other.obj) > 0

    def __eq__(self, other):
        return self._comparison(self.obj, other.obj) == 0

    def __le__(self, other):
        return self._comparison(self.obj, other.obj) <= 0

    def __ge__(self, other):
        return self._comparison(self.obj, other.obj) >= 0


def cmp_to_key(comparison):
    return lambda obj: _KeyWrapper(obj, comparison)


def total_ordering(cls):
    if hasattr(cls, '__lt__') and hasattr(cls, '__eq__'):
        if not hasattr(cls, '__le__'):
            setattr(cls, '__le__', lambda self, other: self < other or self == other)
        if not hasattr(cls, '__gt__'):
            setattr(cls, '__gt__', lambda self, other: not (self < other or self == other))
        if not hasattr(cls, '__ge__'):
            setattr(cls, '__ge__', lambda self, other: not self < other)
    return cls
