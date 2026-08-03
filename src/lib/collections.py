"""Small Python-compatible collection types used by Sage.js.

The implementations favor Python semantics over exposing JavaScript's native
collection APIs.  They can be replaced internally without changing this
module's public interface.
"""

from typing import Any, Iterator

import sagejs.runtime as runtime


def _type_name(value: Any) -> str:
    name = type(value).__name__
    if name.startswith('ρσ_'):
        return name[3:]
    return name


def _as_index(value: Any, *, slice_bound: bool = False) -> int:
    if value is True or value is False or isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        if slice_bound:
            raise TypeError(
                'slice indices must be integers or have an __index__ method')
        raise TypeError(
            "'" + _type_name(value)
            + "' object cannot be interpreted as an integer")
    answer = method()
    if not (answer is True or answer is False or isinstance(answer, int)):
        raise TypeError(
            '__index__ returned non-int (type '
            + _type_name(answer) + ')')
    return int(answer)


@runtime.sequence_class
class deque:

    def __init__(
        self,
        iterable: Any = (),
        maxlen: Any = None,
    ) -> None:
        if maxlen is not None:
            if not isinstance(maxlen, int):
                raise TypeError('an integer is required')
            maxlen = int(maxlen)
            if maxlen < 0:
                raise ValueError('maxlen must be non-negative')
        self.maxlen = maxlen
        self._values = []
        self.extend(iterable)

    def __len__(self) -> int:
        return len(self._values)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._values)

    def _bound_index(self, index: int) -> int:
        index = _as_index(index)
        if index < 0:
            index += len(self._values)
        if index < 0 or index >= len(self._values):
            raise IndexError('deque index out of range')
        return index

    def __getitem__(self, index: int) -> Any:
        return self._values[self._bound_index(index)]

    def __setitem__(self, index: int, value: Any) -> None:
        self._values[self._bound_index(index)] = value

    def __delitem__(self, index: int) -> None:
        self._values.pypop(self._bound_index(index))

    def __eq__(self, other: Any) -> Any:
        if not isinstance(other, deque):
            return NotImplemented
        return self._values == other._values

    def __ne__(self, other: Any) -> Any:
        if not isinstance(other, deque):
            return NotImplemented
        return self._values != other._values

    def __lt__(self, other: Any) -> Any:
        if not isinstance(other, deque):
            return NotImplemented
        return self._values < other._values

    def __le__(self, other: Any) -> Any:
        if not isinstance(other, deque):
            return NotImplemented
        return self._values <= other._values

    def __gt__(self, other: Any) -> Any:
        if not isinstance(other, deque):
            return NotImplemented
        return self._values > other._values

    def __ge__(self, other: Any) -> Any:
        if not isinstance(other, deque):
            return NotImplemented
        return self._values >= other._values

    def __add__(self, other: Any) -> Any:
        if not isinstance(other, deque):
            other_name = 'list' if isinstance(other, list) else _type_name(other)
            raise TypeError(
                'can only concatenate deque (not "'
                + other_name + '") to deque')
        return type(self)(self._values + other._values, self.maxlen)

    def __mul__(self, count: Any) -> Any:
        count = _as_index(count)
        return type(self)(self._values * max(0, count), self.maxlen)

    __rmul__ = __mul__

    def __imul__(self, count: Any) -> Any:
        count = _as_index(count)
        values = self._values * max(0, count)
        self.clear()
        self.extend(values)
        return self

    def __invert__(self) -> None:
        raise TypeError("bad operand type for unary ~: 'deque'")

    def slice(self, *_bounds: Any) -> None:
        raise TypeError('sequence index must be integer, not slice')

    def __setslice__(
        self,
        _start: Any,
        _end: Any,
        _values: Any,
    ) -> None:
        raise TypeError('sequence index must be integer, not slice')

    def append(self, value: Any) -> None:
        if self.maxlen == 0:
            return
        if self.maxlen is not None and len(self._values) == self.maxlen:
            self._values.pypop(0)
        self._values.append(value)

    def appendleft(self, value: Any) -> None:
        if self.maxlen == 0:
            return
        if self.maxlen is not None and len(self._values) == self.maxlen:
            self._values.pypop()
        self._values.insert(0, value)

    def extend(self, iterable: Any) -> None:
        for value in iterable:
            self.append(value)

    def extendleft(self, iterable: Any) -> None:
        for value in iterable:
            self.appendleft(value)

    def pop(self) -> Any:
        if len(self._values) == 0:
            raise IndexError('pop from an empty deque')
        return self._values.pypop()

    def popleft(self) -> Any:
        if len(self._values) == 0:
            raise IndexError('pop from an empty deque')
        return self._values.pypop(0)

    def clear(self) -> None:
        self._values.clear()

    def count(self, value: Any) -> int:
        return sum(1 for item in self._values if item == value)

    def index(self, value: Any, start: int = 0, stop: Any = None) -> int:
        length = len(self._values)
        start = _as_index(start, slice_bound=True)
        if stop is None:
            stop = length
        else:
            stop = _as_index(stop, slice_bound=True)
        if start < 0:
            start = max(0, start + length)
        else:
            start = min(start, length)
        if stop < 0:
            stop = max(0, stop + length)
        else:
            stop = min(stop, length)
        for position in range(start, stop):
            if self._values[position] == value:
                return position
        raise ValueError(repr(value) + ' is not in deque')

    def insert(self, index: int, value: Any) -> None:
        if self.maxlen is not None and len(self._values) >= self.maxlen:
            raise IndexError('deque already at its maximum size')
        self._values.insert(_as_index(index), value)

    def remove(self, value: Any) -> None:
        self._values.pypop(self.index(value))

    def reverse(self) -> None:
        self._values.reverse()

    def rotate(self, count: int = 1) -> None:
        count = _as_index(count)
        length = len(self._values)
        if length == 0:
            return
        count %= length
        self._values[:] = self._values[-count:] + self._values[:-count]

    def copy(self) -> Any:
        return type(self)(self._values, self.maxlen)

    def __repr__(self) -> str:
        suffix = ''
        if self.maxlen is not None:
            suffix = ', maxlen=' + str(self.maxlen)
        return 'deque(' + repr(self._values) + suffix + ')'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__


@runtime.sequence_class
class OrderedDict:

    _order_sensitive_equality = True

    def __init__(
        self,
        iterable: Any = runtime.undefined,
        **keywords: Any,
    ) -> None:
        self._data = dict()
        if iterable is not runtime.undefined:
            self.update(iterable)
        self.update(keywords)

    def __len__(self) -> int:
        return len(self._data)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._data)

    def __reversed__(self) -> Iterator[Any]:
        return reversed(list(self._data))

    def __contains__(self, key: Any) -> bool:
        return key in self._data

    def __eq__(self, other: Any) -> Any:
        if isinstance(other, OrderedDict):
            if (
                self._order_sensitive_equality
                and other._order_sensitive_equality
            ):
                return list(self.items()) == list(other.items())
            return self._data == other._data
        if hasattr(other, 'items'):
            return self._data == other
        return NotImplemented

    def __ne__(self, other: Any) -> Any:
        answer = self.__eq__(other)
        if answer is NotImplemented:
            return answer
        return not answer

    def __getitem__(self, key: Any) -> Any:
        return self._data.__getitem__(key)

    def __setitem__(self, key: Any, value: Any) -> None:
        self._data.__setitem__(key, value)

    def __delitem__(self, key: Any) -> None:
        self._data.__delitem__(key)

    def keys(self) -> Any:
        return self._data.keys()

    def values(self) -> Any:
        return self._data.values()

    def items(self) -> Any:
        return self._data.items()

    def get(self, key: Any, fallback: Any = None) -> Any:
        return self._data.get(key, fallback)

    def setdefault(self, key: Any, value: Any = None) -> Any:
        if key not in self._data:
            self._data.__setitem__(key, value)
        return self._data.__getitem__(key)

    def pop(self, key: Any, *fallback: Any) -> Any:
        if len(fallback) > 1:
            raise TypeError(
                'pop() takes at most 2 arguments ('
                + str(len(fallback) + 1) + ' given)')
        if key in self._data:
            value = self._data.__getitem__(key)
            self._data.__delitem__(key)
            return value
        if fallback:
            return fallback[0]
        raise KeyError(key)

    def clear(self) -> None:
        self._data.clear()

    def copy(self) -> Any:
        return type(self)(self.items())

    def update(
        self,
        iterable: Any = runtime.undefined,
        **keywords: Any,
    ) -> None:
        if iterable is not runtime.undefined:
            if hasattr(iterable, 'items'):
                iterable = iterable.items()
            for key, value in iterable:
                self._data.__setitem__(key, value)
        for key in keywords:
            self._data.__setitem__(key, keywords[key])

    def popitem(self, last: bool = True) -> Any:
        if len(self._data) == 0:
            raise KeyError('dictionary is empty')
        keys = list(self._data.keys())
        key = keys[-1] if last else keys[0]
        value = self._data.__getitem__(key)
        self._data.__delitem__(key)
        return runtime.math_tuple([key, value])

    def move_to_end(self, key: Any, last: bool = True) -> None:
        if key not in self._data:
            raise KeyError(key)
        value = self._data.__getitem__(key)
        self._data.__delitem__(key)
        if last:
            self._data.__setitem__(key, value)
        else:
            self._data = dict([(key, value)] + list(self._data.items()))

    def __repr__(self) -> str:
        return 'OrderedDict(' + repr(list(self._data.items())) + ')'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__


class defaultdict(OrderedDict):

    _order_sensitive_equality = False

    def __init__(self, default_factory: Any = None, *args: Any, **keywords: Any) -> None:
        if default_factory is not None and not callable(default_factory):
            raise TypeError('first argument must be callable or None')
        self.default_factory = default_factory
        OrderedDict.__init__(self, *args, **keywords)

    def __missing__(self, key: Any) -> Any:
        if self.default_factory is None:
            raise KeyError(key)
        value = self.default_factory()
        self._data.__setitem__(key, value)
        return value

    def __getitem__(self, key: Any) -> Any:
        if key not in self._data:
            return self.__missing__(key)
        return self._data.__getitem__(key)

    def copy(self) -> Any:
        return type(self)(self.default_factory, self.items())

    def __repr__(self) -> str:
        return 'defaultdict(' + repr(self.default_factory) + ', ' + repr(self._data) + ')'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__


class Counter(OrderedDict):

    def __init__(self, iterable: Any = runtime.undefined, **keywords: Any) -> None:
        self._data = dict()
        if iterable is not runtime.undefined:
            self.update(iterable)
        self.update(keywords)

    def __missing__(self, key: Any) -> int:
        return 0

    @classmethod
    def fromkeys(cls, iterable: Any, value: Any = None) -> Any:
        del cls, iterable, value
        raise NotImplementedError(
            'Counter.fromkeys() is undefined.  '
            'Use Counter(iterable) instead.')

    def __getitem__(self, key: Any) -> Any:
        if key in self._data:
            return self._data.__getitem__(key)
        return 0

    def copy(self) -> Any:
        return type(self)(self)

    def __eq__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return all(
            self.__getitem__(key) == other.__getitem__(key)
            for counter in (self, other)
            for key in counter
        )

    def __ne__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return not self == other

    def __le__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return all(
            self.__getitem__(key) <= other.__getitem__(key)
            for counter in (self, other)
            for key in counter
        )

    def __lt__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return self <= other and self != other

    def __ge__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return all(
            self.__getitem__(key) >= other.__getitem__(key)
            for counter in (self, other)
            for key in counter
        )

    def __gt__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return self >= other and self != other

    def update(self, iterable: Any = runtime.undefined, **keywords: Any) -> None:
        if iterable is not runtime.undefined:
            if hasattr(iterable, 'items'):
                for key, value in iterable.items():
                    self._data.__setitem__(key, self.__getitem__(key) + value)
            else:
                for key in iterable:
                    self._data.__setitem__(key, self.__getitem__(key) + 1)
        for key, value in keywords.items():
            self._data.__setitem__(key, self.__getitem__(key) + value)

    def subtract(self, iterable: Any = runtime.undefined, **keywords: Any) -> None:
        if iterable is not runtime.undefined:
            if hasattr(iterable, 'items'):
                for key, value in iterable.items():
                    self._data.__setitem__(key, self.__getitem__(key) - value)
            else:
                for key in iterable:
                    self._data.__setitem__(key, self.__getitem__(key) - 1)
        for key, value in keywords.items():
            self._data.__setitem__(key, self.__getitem__(key) - value)

    def elements(self) -> Iterator[Any]:
        for key, count in self._data.items():
            for _index in range(max(0, _as_index(count))):
                yield key

    def total(self) -> Any:
        return sum(self._data.values())

    def most_common(self, count: Any = None) -> list[Any]:
        pairs = list(self._data.items())
        pairs.sort(key=lambda pair: pair[1], reverse=True)
        if count is not None:
            if (
                count is not True
                and count is not False
                and not isinstance(count, int)
            ):
                raise TypeError(
                    "'" + _type_name(count)
                    + "' object cannot be interpreted as an integer")
            if count <= 0:
                pairs = []
            else:
                pairs = pairs[:count]
        return [runtime.math_tuple([key, value]) for key, value in pairs]

    def __repr__(self) -> str:
        return 'Counter(' + repr(self._data) + ')'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__

    def _combine(self, other: Any, operation: Any) -> Any:
        answer = Counter()
        keys = list(self._data)
        for key in other:
            if key not in self._data:
                keys.append(key)
        for key in keys:
            value = operation(self.__getitem__(key), other.__getitem__(key))
            if value > 0:
                answer.__setitem__(key, value)
        return answer

    def __add__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return self._combine(other, lambda left, right: left + right)

    def __sub__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return self._combine(other, lambda left, right: left - right)

    def __and__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return self._combine(other, min)

    def __or__(self, other: Any) -> Any:
        if not isinstance(other, Counter):
            return NotImplemented
        return self._combine(other, max)

    def _keep_positive(self) -> Any:
        nonpositive = [
            key for key, count in self._data.items()
            if not count > 0
        ]
        for key in nonpositive:
            self._data.__delitem__(key)
        return self

    def __iadd__(self, other: Any) -> Any:
        for key, count in other.items():
            self._data.__setitem__(key, self.__getitem__(key) + count)
        return self._keep_positive()

    def __isub__(self, other: Any) -> Any:
        for key, count in other.items():
            self._data.__setitem__(key, self.__getitem__(key) - count)
        return self._keep_positive()

    def __iand__(self, other: Any) -> Any:
        for key, count in self._data.items():
            other_count = other.__getitem__(key)
            if other_count < count:
                self._data.__setitem__(key, other_count)
        return self._keep_positive()

    def __ior__(self, other: Any) -> Any:
        for key, other_count in other.items():
            count = self.__getitem__(key)
            if other_count > count:
                self._data.__setitem__(key, other_count)
        return self._keep_positive()

    def __pos__(self) -> Any:
        return Counter({key: value for key, value in self._data.items() if value > 0})

    def __neg__(self) -> Any:
        return Counter({key: -value for key, value in self._data.items() if value < 0})


class ChainMap:

    def __init__(self, *maps: Any) -> None:
        self.maps = list(maps) if maps else [dict()]

    def __missing__(self, key: Any) -> Any:
        raise KeyError(key)

    def __getitem__(self, key: Any) -> Any:
        for mapping in self.maps:
            try:
                return mapping.__getitem__(key)
            except KeyError:
                pass
        return self.__missing__(key)

    def __setitem__(self, key: Any, value: Any) -> None:
        self.maps[0].__setitem__(key, value)

    def __delitem__(self, key: Any) -> None:
        if key not in self.maps[0]:
            raise KeyError(key)
        self.maps[0].__delitem__(key)

    def __contains__(self, key: Any) -> bool:
        return any(key in mapping for mapping in self.maps)

    def __iter__(self) -> Iterator[Any]:
        seen = set()
        for mapping in reversed(self.maps):
            for key in mapping:
                if key not in seen:
                    seen.add(key)
                    yield key

    def __len__(self) -> int:
        return len(list(self))

    def get(self, key: Any, fallback: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return fallback

    def keys(self) -> Any:
        return list(self)

    def values(self) -> Any:
        return [self.__getitem__(key) for key in self]

    def items(self) -> Any:
        return [runtime.math_tuple([key, self.__getitem__(key)]) for key in self]

    def new_child(self, mapping: Any = None, **keywords: Any) -> Any:
        if mapping is None:
            mapping = dict()
        mapping.update(keywords)
        return type(self)(mapping, *self.maps)

    @property
    def parents(self) -> Any:
        return type(self)(*self.maps[1:])

    def __repr__(self) -> str:
        return 'ChainMap(' + ', '.join(repr(mapping) for mapping in self.maps) + ')'


def _normalize_field_names(field_names: Any) -> list[str]:
    if not isinstance(field_names, (list, tuple, str)):
        raise TypeError('field_names must be a sequence')
    if isinstance(field_names, str):
        parts = field_names.replace(',', ' ').split(' ')
        field_names = [part for part in parts if part]
    answer = list(field_names)
    for name in answer:
        if not isinstance(name, str):
            raise TypeError('field names must be strings')
    return answer


def namedtuple(type_name: str, field_names: Any) -> Any:
    names = _normalize_field_names(field_names)

    def collect_values(args: Any, keywords: Any) -> list[Any]:
        if len(args) > len(names):
            raise TypeError('too many positional arguments')
        values = list(args)
        keyword_names = list(keywords)
        for index in range(len(args)):
            if names[index] in keyword_names:
                raise TypeError('unexpected or duplicate keyword argument')
        for index in range(len(args), len(names)):
            name = names[index]
            if name not in keyword_names:
                raise TypeError('missing required argument: ' + name)
            values.append(keywords.__getitem__(name))
        for name in keyword_names:
            if name not in names:
                raise TypeError('unexpected or duplicate keyword argument')
        return values

    def tuple_class(*args: Any, **keywords: Any) -> Any:
        values = collect_values(args, keywords)
        return runtime.named_tuple(values, type_name, names)

    def tuple_init(
        self: Any,
        *args: Any,
        **keywords: Any,
    ) -> None:
        self._tuple_values = collect_values(args, keywords)

    tuple_class.__name__ = type_name
    tuple_class._fields = runtime.math_tuple(names)
    runtime.object.setPrototypeOf(
        tuple_class.prototype,
        runtime.tuple_builtin.prototype,
    )
    runtime.reflect.set(
        tuple_class.prototype,
        '__init__',
        runtime.native_method(tuple_init),
    )
    return tuple_class
