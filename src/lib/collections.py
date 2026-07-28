"""Small Python-compatible collection types used by Sage.js.

The implementations favor Python semantics over exposing JavaScript's native
collection APIs.  They can be replaced internally without changing this
module's public interface.
"""

from typing import Any, Iterator

import sagejs.runtime as runtime


@runtime.sequence_class
class deque:

    def __init__(
        self,
        iterable: Any = (),
        maxlen: Any = None,
    ) -> None:
        if maxlen is not None:
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
        if index < 0:
            index += len(self._values)
        if index < 0 or index >= len(self._values):
            raise IndexError('deque index out of range')
        return index

    def __getitem__(self, index: int) -> Any:
        return self._values[self._bound_index(index)]

    def __setitem__(self, index: int, value: Any) -> None:
        self._values[self._bound_index(index)] = value

    def __delitem__(self, _index: Any) -> None:
        raise TypeError('sequence index must be integer, not slice')

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

    def __contains__(self, key: Any) -> bool:
        return key in self._data

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

    def __repr__(self) -> str:
        return 'OrderedDict(' + repr(list(self._data.items())) + ')'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__


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
        keyword_names = runtime.object.keys(keywords)
        for index in range(len(args)):
            if names[index] in keyword_names:
                raise TypeError('unexpected or duplicate keyword argument')
        for index in range(len(args), len(names)):
            name = names[index]
            if name not in keyword_names:
                raise TypeError('missing required argument: ' + name)
            values.append(keywords[name])
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
