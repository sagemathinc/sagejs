"""Python container behavior implemented on modern JavaScript primitives.

Lists remain decorated JavaScript arrays because generated Sage.js code relies
on their native indexing and performance. Sets and dictionaries are small
Python classes backed by the native JavaScript ``Set`` and ``Map`` types.
"""

from __future__ import annotations

from typing import Any, Callable

import sagejs.runtime as runtime


def _new_array(length: Any = runtime.undefined) -> Any:
    constructor_args = [] if length is runtime.undefined else [length]
    return runtime.reflect.construct(runtime.array, constructor_args)


def _new_map() -> Any:
    return runtime.reflect.construct(runtime.map_class, [])


def _new_set() -> Any:
    return runtime.reflect.construct(runtime.set_class, [])


def _has_own(value: Any, key: Any) -> bool:
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        [key],
    )


def _type_is(actual: str, expected: str) -> bool:
    return runtime.strict_equal(actual, expected)


def _get_member(value: Any, name: str) -> Any:
    if value is None or value is runtime.undefined:
        return runtime.undefined
    if (
        _type_is(runtime.jstype(value), 'object')
        or _type_is(runtime.jstype(value), 'function')
    ):
        return runtime.reflect.get(value, name)
    boxed = runtime.reflect.apply(
        runtime.object, runtime.undefined, [value])
    return runtime.reflect.get(boxed, name)


def equals(left: Any, right: Any) -> bool:
    if left is right:
        return True

    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        (
            _type_is(left_type, 'bigint')
            and _type_is(right_type, 'number')
            and runtime.number.isSafeInteger(right)
        )
        or (
            _type_is(right_type, 'bigint')
            and _type_is(left_type, 'number')
            and runtime.number.isSafeInteger(left)
        )
    ):
        return runtime.bigint(left) is runtime.bigint(right)

    if (
        runtime.strict_equal(left_type, right_type)
        and (
            _type_is(left_type, 'number')
            or _type_is(left_type, 'string')
            or _type_is(left_type, 'boolean')
        )
    ):
        return left is right

    if (
        left is not None
        and _type_is(
            runtime.jstype(_get_member(left, '__eq__')),
            'function',
        )
    ):
        return left.__eq__(right)
    if (
        right is not None
        and _type_is(
            runtime.jstype(_get_member(right, '__eq__')),
            'function',
        )
    ):
        return right.__eq__(left)

    if left is None or right is None:
        return False

    if runtime.arraylike(left) and runtime.arraylike(right):
        if left.length != right.length:
            return False
        for index in range(left.length):
            if not equals(left[index], right[index]):
                return False
        return True

    if (
        left is not None
        and right is not None
        and _type_is(left_type, 'object')
        and _type_is(right_type, 'object')
        and (
            runtime.reflect.get(left, 'constructor') is runtime.object
            or runtime.object.getPrototypeOf(left) is None
        )
        and (
            runtime.reflect.get(right, 'constructor') is runtime.object
            or runtime.object.getPrototypeOf(right) is None
        )
    ):
        left_keys = runtime.object.keys(left)
        right_keys = runtime.object.keys(right)
        if left_keys.length != right_keys.length:
            return False
        for key in left_keys:
            if not _has_own(right, key):
                return False
            if not equals(left[key], right[key]):
                return False
        return True
    return False


def not_equals(left: Any, right: Any) -> bool:
    if left is right:
        return False
    if (
        left is not None
        and _type_is(
            runtime.jstype(_get_member(left, '__ne__')),
            'function',
        )
    ):
        return left.__ne__(right)
    if (
        right is not None
        and _type_is(
            runtime.jstype(_get_member(right, '__ne__')),
            'function',
        )
    ):
        return right.__ne__(left)
    return not equals(left, right)


@runtime.native_method
def _list_extend(self: Any, iterable: Any) -> None:
    if (
        runtime.array.isArray(iterable)
        or _type_is(runtime.jstype(iterable), 'string')
    ):
        start = self.length
        self.length += iterable.length
        for index in range(iterable.length):
            self[start + index] = iterable[index]
        return
    for value in iterable:
        self.push(value)


@runtime.native_method
def _list_index(
    self: Any,
    value: Any,
    start: int = 0,
    stop: Any = runtime.undefined,
) -> int:
    if start < 0:
        start = max(0, self.length + start)
    if stop is runtime.undefined:
        stop = self.length
    elif stop < 0:
        stop = self.length + stop
    for index in range(start, min(stop, self.length)):
        if equals(self[index], value):
            return index
    raise ValueError(runtime.string(value) + ' is not in list')


@runtime.native_method
def _list_pop(self: Any, index: Any = runtime.undefined) -> Any:
    if self.length == 0:
        raise IndexError('pop from empty list')
    if index is runtime.undefined:
        index = -1
    answer = self.splice(index, 1)
    if answer.length == 0:
        raise IndexError('pop index out of range')
    return answer[0]


@runtime.native_method
def _list_remove(self: Any, value: Any) -> None:
    index = runtime.reflect.apply(_list_index, self, [value])
    self.splice(index, 1)


@runtime.native_method
def _list_to_string(self: Any) -> str:
    return '[' + self.join(', ') + ']'


@runtime.native_method
def _list_insert(self: Any, index: int, value: Any) -> None:
    if index < 0:
        index += self.length
    index = min(self.length, max(index, 0))
    self.splice(index, 0, value)


@runtime.native_method
def _list_copy(self: Any) -> Any:
    return list_constructor(self)


@runtime.native_method
def _list_clear(self: Any) -> None:
    self.length = 0


@runtime.native_method
def _list_as_array(self: Any) -> Any:
    return runtime.reflect.apply(
        runtime.array.prototype.slice, self, [])


@runtime.native_method
def _list_count(self: Any, value: Any) -> int:
    answer = 0
    for item in self:
        if equals(item, value):
            answer += 1
    return answer


def _list_sort_key(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if (
        _type_is(value_type, 'string')
        or _type_is(value_type, 'number')
        or _type_is(value_type, 'bigint')
    ):
        return value
    return value.toString()


@runtime.native_method
def _list_sort(
    self: Any,
    key: Callable[[Any], Any] | None = None,
    reverse: bool = False,
) -> None:
    key_function = key or _list_sort_key
    decorated = _new_array(self.length)
    for index in range(self.length):
        decorated[index] = [key_function(self[index]), index, self[index]]

    multiplier = -1 if reverse else 1

    def compare(left: Any, right: Any) -> int:
        if left[0] < right[0]:
            return -multiplier
        if left[0] > right[0]:
            return multiplier
        return multiplier * (left[1] - right[1])

    decorated.sort(compare)
    for index in range(self.length):
        self[index] = decorated[index][2]


@runtime.native_method
def _list_concat(self: Any, *others: Any) -> Any:
    answer = runtime.reflect.apply(
        runtime.array.prototype.concat, self, others)
    return list_decorate(answer)


@runtime.native_method
def _list_slice(self: Any, *slice_args: Any) -> Any:
    answer = runtime.reflect.apply(
        runtime.array.prototype.slice, self, slice_args)
    return list_decorate(answer)


@runtime.native_method
def _list_len(self: Any) -> int:
    return self.length


@runtime.native_method
def _list_contains(self: Any, value: Any) -> bool:
    for item in self:
        if equals(item, value):
            return True
    return False


@runtime.native_method
def _list_eq(self: Any, other: Any) -> bool:
    if not runtime.arraylike(other):
        return False
    if self.length != other.length:
        return False
    for index in range(self.length):
        if not equals(self[index], other[index]):
            return False
    return True


@runtime.native_method
def _list_mul(self: Any, other: Any) -> Any:
    answer = list_constructor()
    count = int(other)
    for _ in range(count):
        for value in self:
            answer.push(value)
    return answer


def ρσ_list_decorate(answer: Any) -> Any:
    answer.append = runtime.array.prototype.push
    answer.toString = _list_to_string
    answer.inspect = _list_to_string
    answer.extend = _list_extend
    answer.index = _list_index
    answer.pypop = _list_pop
    answer.remove = _list_remove
    answer.insert = _list_insert
    answer.copy = _list_copy
    answer.clear = _list_clear
    answer.count = _list_count
    answer.concat = _list_concat
    answer.pysort = _list_sort
    answer.slice = _list_slice
    answer.as_array = _list_as_array
    answer.__len__ = _list_len
    answer.__contains__ = _list_contains
    answer.__eq__ = _list_eq
    answer.__mul__ = _list_mul
    answer.constructor = list_constructor
    return answer


def ρσ_list_constructor(iterable: Any = runtime.undefined) -> Any:
    if iterable is runtime.undefined:
        answer = _new_array()
    elif runtime.arraylike(iterable):
        answer = runtime.reflect.apply(
            runtime.array.prototype.slice, iterable, [])
    elif _type_is(runtime.jstype(iterable), 'number'):
        answer = _new_array(iterable)
    else:
        answer = _new_array()
        for value in iterable:
            answer.push(value)
    return list_decorate(answer)


def sorted(
    iterable: Any,
    key: Callable[[Any], Any] | None = None,
    reverse: bool = False,
) -> Any:
    answer = list_constructor(iterable)
    answer.pysort(key, reverse)
    return answer


class SageSet:

    def __init__(self, iterable: Any = runtime.undefined) -> None:
        self.jsset = _new_set()
        if iterable is not runtime.undefined:
            self.update(iterable)

    @property
    def length(self) -> int:
        return self.jsset.size

    @property
    def size(self) -> int:
        return self.jsset.size

    def __len__(self) -> int:
        return self.jsset.size

    def __contains__(self, value: Any) -> bool:
        return self.jsset.has(value)

    has = __contains__

    def __iter__(self) -> Any:
        return self.jsset.values()

    def add(self, value: Any) -> None:
        self.jsset.add(value)

    def clear(self) -> None:
        self.jsset.clear()

    def copy(self) -> SageSet:
        return SageSet(self)

    def discard(self, value: Any) -> None:
        self.jsset.delete(value)

    def difference(self, *others: Any) -> SageSet:
        answer = SageSet()
        for value in self:
            if not any(other.has(value) for other in others):
                answer.jsset.add(value)
        return answer

    def difference_update(self, *others: Any) -> None:
        for value in list_constructor(self):
            if any(other.has(value) for other in others):
                self.jsset.delete(value)

    def intersection(self, *others: Any) -> SageSet:
        answer = SageSet()
        for value in self:
            if all(other.has(value) for other in others):
                answer.jsset.add(value)
        return answer

    def intersection_update(self, *others: Any) -> None:
        for value in list_constructor(self):
            if not all(other.has(value) for other in others):
                self.jsset.delete(value)

    def isdisjoint(self, other: Any) -> bool:
        for value in self:
            if other.has(value):
                return False
        return True

    def issubset(self, other: Any) -> bool:
        for value in self:
            if not other.has(value):
                return False
        return True

    def issuperset(self, other: Any) -> bool:
        return other.issubset(self)

    def pop(self) -> Any:
        result = self.jsset.values().next()
        if result.done:
            raise KeyError('pop from an empty set')
        self.jsset.delete(result.value)
        return result.value

    def remove(self, value: Any) -> None:
        if not self.jsset.delete(value):
            raise KeyError(runtime.string(value))

    def symmetric_difference(self, other: Any) -> SageSet:
        return self.union(other).difference(self.intersection(other))

    def symmetric_difference_update(self, other: Any) -> None:
        common = self.intersection(other)
        self.update(other)
        self.difference_update(common)

    def union(self, *others: Any) -> SageSet:
        answer = self.copy()
        answer.update(*others)
        return answer

    def update(self, *others: Any) -> None:
        for other in others:
            for value in other:
                self.jsset.add(value)

    def __repr__(self) -> str:
        entries = list_constructor()
        for value in self:
            entries.push(runtime.repr(value))
        return '{' + entries.join(', ') + '}'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, SageSet):
            return False
        if self.size != other.size:
            return False
        return self.issubset(other)


def ρσ_set(iterable: Any = runtime.undefined) -> SageSet:
    return SageSet(iterable)


def set_wrap(native_set: Any) -> SageSet:
    answer = SageSet()
    answer.jsset = native_set
    return answer


class SageDict:

    def __init__(
        self,
        iterable: Any = runtime.undefined,
        **keywords: Any,
    ) -> None:
        self.jsmap = _new_map()
        if iterable is not runtime.undefined:
            self.update(iterable)
        if runtime.object.keys(keywords).length:
            self.update(keywords)

    @property
    def length(self) -> int:
        return self.jsmap.size

    @property
    def size(self) -> int:
        return self.jsmap.size

    def __len__(self) -> int:
        return self.jsmap.size

    def __contains__(self, key: Any) -> bool:
        return self.jsmap.has(key)

    has = __contains__

    def __iter__(self) -> Any:
        return self.jsmap.keys()

    def __setitem__(self, key: Any, value: Any) -> None:
        self.jsmap.set(key, value)

    set = __setitem__

    def __delitem__(self, key: Any) -> None:
        self.jsmap.delete(key)

    def __getitem__(self, key: Any) -> Any:
        answer = self.jsmap.get(key)
        if answer is runtime.undefined and not self.jsmap.has(key):
            raise KeyError(runtime.string(key))
        return answer

    def clear(self) -> None:
        self.jsmap.clear()

    def copy(self) -> SageDict:
        return SageDict(self)

    def keys(self) -> Any:
        return self.jsmap.keys()

    def values(self) -> Any:
        return self.jsmap.values()

    def items(self) -> Any:
        return self.jsmap.entries()

    entries = items

    def get(
        self,
        key: Any,
        default_value: Any = runtime.undefined,
    ) -> Any:
        answer = self.jsmap.get(key)
        if answer is runtime.undefined and not self.jsmap.has(key):
            return (
                None
                if default_value is runtime.undefined
                else default_value
            )
        return answer

    def set_default(self, key: Any, default_value: Any) -> Any:
        if not self.jsmap.has(key):
            self.jsmap.set(key, default_value)
            return default_value
        return self.jsmap.get(key)

    @staticmethod
    def fromkeys(
        iterable: Any,
        value: Any = None,
    ) -> SageDict:
        answer = SageDict()
        for key in iterable:
            answer.jsmap.set(key, value)
        return answer

    def pop(
        self,
        key: Any,
        default_value: Any = runtime.undefined,
    ) -> Any:
        answer = self.jsmap.get(key)
        if answer is runtime.undefined and not self.jsmap.has(key):
            if default_value is runtime.undefined:
                raise KeyError(runtime.string(key))
            return default_value
        self.jsmap.delete(key)
        return answer

    def popitem(self) -> Any:
        result = self.jsmap.entries().next()
        if result.done:
            raise KeyError('dict is empty')
        self.jsmap.delete(result.value[0])
        return list_decorate(result.value)

    def update(
        self,
        iterable: Any = runtime.undefined,
        **keywords: Any,
    ) -> None:
        if iterable is not runtime.undefined:
            if isinstance(iterable, SageDict):
                source = iterable.items()
                for pair in source:
                    self.jsmap.set(pair[0], pair[1])
            elif isinstance(iterable, runtime.map_class):
                for pair in iterable.entries():
                    self.jsmap.set(pair[0], pair[1])
            elif runtime.array.isArray(iterable):
                for pair in iterable:
                    self.jsmap.set(pair[0], pair[1])
            elif (
                _type_is(
                    runtime.jstype(
                        runtime.reflect.get(
                            iterable, runtime.iterator_symbol
                        )
                    ),
                    'function',
                )
            ):
                for pair in iterable:
                    self.jsmap.set(pair[0], pair[1])
            else:
                for key in runtime.object.keys(iterable):
                    self.jsmap.set(key, iterable[key])
        for key in runtime.object.keys(keywords):
            self.jsmap.set(key, keywords[key])

    def __repr__(self) -> str:
        entries = list_constructor()
        for pair in self.jsmap.entries():
            entries.push(
                runtime.repr(pair[0])
                + ': ' + runtime.repr(pair[1])
            )
        return '{' + entries.join(', ') + '}'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, SageDict):
            return False
        if self.size != other.size:
            return False
        for pair in other.items():
            if not self.jsmap.has(pair[0]):
                return False
            if not equals(self.jsmap.get(pair[0]), pair[1]):
                return False
        return True

    def as_object(self) -> Any:
        answer = runtime.object.create(None)
        for pair in self.jsmap.entries():
            answer[pair[0]] = pair[1]
        return answer


def ρσ_dict(
    iterable: Any = runtime.undefined,
    **keywords: Any,
) -> SageDict:
    return SageDict(iterable, **keywords)


runtime.reflect.set(ρσ_dict, 'fromkeys', SageDict.fromkeys)


def dict_wrap(native_map: Any) -> SageDict:
    answer = SageDict()
    answer.jsmap = native_map
    return answer


# Stable generated-runtime names used by the compiler.
ρσ_equals = equals
ρσ_not_equals = not_equals
ρσ_list_contains = _list_contains
ρσ_set_wrap = set_wrap
ρσ_dict_wrap = dict_wrap

runtime.reflect.set(
    ρσ_set,
    'prototype',
    runtime.reflect.get(SageSet, 'prototype'),
)
runtime.reflect.set(
    ρσ_dict,
    'prototype',
    runtime.reflect.get(SageDict, 'prototype'),
)

list_constructor = ρσ_list_constructor
list_decorate = ρσ_list_decorate
list = ρσ_list_constructor
list_wrap = ρσ_list_decorate
set = ρσ_set
dict = ρσ_dict
