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


def _get_member(value: Any, name: str) -> Any:
    if value is None or value is runtime.undefined:
        return runtime.undefined
    if (
        runtime.strict_equal(runtime.jstype(value), 'object')
        or runtime.strict_equal(runtime.jstype(value), 'function')
    ):
        return runtime.reflect.get(value, name)
    boxed = runtime.reflect.apply(
        runtime.object, runtime.undefined, [value])
    return runtime.reflect.get(boxed, name)


def equals(left: Any, right: Any) -> bool:
    left_type = runtime.jstype(left)
    right_type = runtime.jstype(right)
    if (
        runtime.strict_equal(left_type, 'object')
        and runtime.reflect.apply(
            runtime.object.prototype.toString,
            left,
            [],
        ) == '[object String]'
        and runtime.object.getPrototypeOf(left)
        is not runtime.string_class.prototype
    ):
        left = runtime.reflect.apply(
            runtime.string_class.prototype.valueOf,
            left,
            [],
        )
        left_type = 'string'
    if (
        runtime.strict_equal(right_type, 'object')
        and runtime.reflect.apply(
            runtime.object.prototype.toString,
            right,
            [],
        ) == '[object String]'
        and runtime.object.getPrototypeOf(right)
        is not runtime.string_class.prototype
    ):
        right = runtime.reflect.apply(
            runtime.string_class.prototype.valueOf,
            right,
            [],
        )
        right_type = 'string'
    if runtime.strict_equal(left_type, 'boolean'):
        left = 1 if left else 0
        left_type = 'number'
    if runtime.strict_equal(right_type, 'boolean'):
        right = 1 if right else 0
        right_type = 'number'
    if (
        (
            runtime.strict_equal(left_type, 'bigint')
            and runtime.strict_equal(right_type, 'number')
            and runtime.number.isSafeInteger(right)
        )
        or (
            runtime.strict_equal(right_type, 'bigint')
            and runtime.strict_equal(left_type, 'number')
            and runtime.number.isSafeInteger(left)
        )
    ):
        return runtime.bigint(left) is runtime.bigint(right)

    left_is_primitive = (
        not runtime.strict_equal(left_type, 'object')
        and not runtime.strict_equal(left_type, 'function')
    )
    right_is_primitive = (
        not runtime.strict_equal(right_type, 'object')
        and not runtime.strict_equal(right_type, 'function')
    )
    if left_is_primitive and right_is_primitive:
        if runtime.strict_equal(left_type, right_type):
            return left is right
        return False

    if (
        left is not None
        and runtime.strict_equal(
            runtime.jstype(_get_member(left, '__eq__')),
            'function',
        )
    ):
        return left.__eq__(right)
    if (
        right is not None
        and runtime.strict_equal(
            runtime.jstype(_get_member(right, '__eq__')),
            'function',
        )
    ):
        return right.__eq__(left)

    if left is right:
        return True

    if left is None or right is None:
        return False

    if runtime.arraylike(left) and runtime.arraylike(right):
        if (
            runtime.array.isArray(left)
            and runtime.array.isArray(right)
            and runtime.object.isFrozen(left)
            is not runtime.object.isFrozen(right)
        ):
            return False
        if left.length != right.length:
            return False
        for index in range(left.length):
            if not equals(left[index], right[index]):
                return False
        return True

    if (
        left is not None
        and right is not None
        and runtime.strict_equal(left_type, 'object')
        and runtime.strict_equal(right_type, 'object')
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
    if (
        left is not None
        and runtime.strict_equal(
            runtime.jstype(_get_member(left, '__ne__')),
            'function',
        )
    ):
        return left.__ne__(right)
    if (
        left is not None
        and runtime.strict_equal(
            runtime.jstype(_get_member(left, '__eq__')),
            'function',
        )
    ):
        return not left.__eq__(right)
    if (
        right is not None
        and runtime.strict_equal(
            runtime.jstype(_get_member(right, '__ne__')),
            'function',
        )
    ):
        return right.__ne__(left)
    if (
        right is not None
        and runtime.strict_equal(
            runtime.jstype(_get_member(right, '__eq__')),
            'function',
        )
    ):
        return not right.__eq__(left)
    return not equals(left, right)


@runtime.native_method
def _list_extend(self: Any, iterable: Any) -> None:
    if (
        runtime.array.isArray(iterable)
        or runtime.strict_equal(runtime.jstype(iterable), 'string')
    ):
        start = self.length
        self.length += iterable.length
        for index in range(iterable.length):
            self[start + index] = iterable[index]
        return
    for value in iterable:
        self.push(value)


@runtime.native_method
def _list_init(
    self: Any,
    iterable: Any = runtime.undefined,
) -> None:
    self.length = 0
    if iterable is not runtime.undefined:
        runtime.reflect.apply(_list_extend, self, [iterable])


@runtime.native_method
def _list_index(
    self: Any,
    value: Any,
    start: int = 0,
    stop: Any = runtime.undefined,
) -> int:
    start = int(start)
    if start < 0:
        start = max(0, self.length + start)
    if stop is runtime.undefined:
        stop = self.length
    else:
        stop = int(stop)
        if stop < 0:
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


def _list_less_than(left: Any, right: Any) -> bool:
    method = _get_member(left, '__lt__')
    if runtime.strict_equal(runtime.jstype(method), 'function'):
        return runtime.reflect.apply(method, left, [right])
    return runtime.native_lt(left, right)


@runtime.native_method
def _list_sort(
    self: Any,
    key: Callable[[Any], Any] | None = None,
    reverse: bool = False,
) -> None:
    decorated = _new_array(self.length)
    for index in range(self.length):
        sort_key = self[index] if key is None else key(self[index])
        decorated[index] = [sort_key, index, self[index]]

    multiplier = -1 if reverse else 1

    def compare(left: Any, right: Any) -> int:
        if _list_less_than(left[0], right[0]):
            return -multiplier
        if _list_less_than(right[0], left[0]):
            return multiplier
        return left[1] - right[1]

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
    if (
        runtime.array.isArray(other)
        and runtime.object.isFrozen(self)
        is not runtime.object.isFrozen(other)
    ):
        return False
    if self.length != other.length:
        return False
    for index in range(self.length):
        if not equals(self[index], other[index]):
            return False
    return True


@runtime.native_method
def _list_mul(self: Any, other: Any) -> Any:
    count = int(other)
    if count <= 0 or self.length == 0:
        return list_constructor()
    result_length = runtime.native_mul(self.length, count)
    answer = _new_array(result_length)
    for repeat in range(count):
        offset = runtime.native_mul(repeat, self.length)
        for index in range(self.length):
            answer[offset + index] = self[index]
    return list_decorate(answer)


@runtime.native_method
def _list_iadd(self: Any, other: Any) -> Any:
    runtime.reflect.apply(_list_extend, self, [other])
    return self


_list_prototype_cache = runtime.undefined


def _list_prototype() -> Any:
    global _list_prototype_cache
    if _list_prototype_cache is runtime.undefined:
        prototype = runtime.object.create(runtime.array.prototype)
        prototype.append = runtime.array.prototype.push
        prototype.toString = _list_to_string
        prototype.inspect = _list_to_string
        prototype.__init__ = _list_init
        prototype.extend = _list_extend
        prototype.index = _list_index
        prototype.pop = _list_pop
        prototype.pypop = _list_pop
        prototype.remove = _list_remove
        prototype.insert = _list_insert
        prototype.copy = _list_copy
        prototype.clear = _list_clear
        prototype.count = _list_count
        prototype.concat = _list_concat
        prototype.pysort = _list_sort
        prototype.sort = _list_sort
        prototype.slice = _list_slice
        prototype.as_array = _list_as_array
        prototype.__len__ = _list_len
        prototype.__contains__ = _list_contains
        prototype.__eq__ = _list_eq
        prototype.__mul__ = _list_mul
        prototype.__rmul__ = _list_mul
        prototype.__iadd__ = _list_iadd
        prototype.constructor = list_constructor
        _list_prototype_cache = prototype
    return _list_prototype_cache


def ρσ_list_decorate(answer: Any) -> Any:
    runtime.object.setPrototypeOf(answer, _list_prototype())
    return answer


def ρσ_list_constructor(iterable: Any = runtime.undefined) -> Any:
    if iterable is runtime.undefined:
        answer = _new_array()
    elif runtime.arraylike(iterable):
        answer = runtime.reflect.apply(
            runtime.array.prototype.slice, iterable, [])
    elif runtime.strict_equal(runtime.jstype(iterable), 'number'):
        answer = _new_array(iterable)
    else:
        answer = runtime.reflect.apply(
            runtime.reflect.get(runtime.array, 'from'),
            runtime.array,
            [iterable],
        )
    return list_decorate(answer)


def _container_pop_keyword(
    keywords: Any,
    name: str,
    default_value: Any,
) -> Any:
    pop_method = _get_member(keywords, 'pop')
    if runtime.strict_equal(runtime.jstype(pop_method), 'function'):
        get_method = _get_member(keywords, 'get')
        contains_method = _get_member(keywords, '__contains__')
        if runtime.strict_equal(
            runtime.jstype(contains_method), 'function'
        ):
            contains = runtime.reflect.apply(
                contains_method, keywords, [name])
        else:
            contains = _has_own(keywords, name)
        answer = runtime.reflect.apply(
            get_method, keywords, [name, default_value])
        if contains:
            runtime.reflect.apply(pop_method, keywords, [name])
        return answer
    if _has_own(keywords, name):
        answer = runtime.reflect.get(keywords, name)
        runtime.reflect.deleteProperty(keywords, name)
        return answer
    return default_value


def sorted(
    iterable: Any,
    *positional: Any,
    **keywords: Any,
) -> Any:
    if len(positional):
        raise TypeError('sorted() takes 1 positional argument')
    key = _container_pop_keyword(keywords, 'key', None)
    reverse = _container_pop_keyword(keywords, 'reverse', False)
    if runtime.strict_equal(
        runtime.jstype(_get_member(keywords, 'keys')),
        'function',
    ):
        remaining = list(keywords.keys())
    else:
        remaining = runtime.object.keys(keywords)
    if len(remaining):
        raise TypeError(
            "unexpected keyword argument '" + remaining[0] + "'")
    answer = list_constructor(iterable)
    answer.pysort(key, reverse)
    return answer


def _set_normalize_value(value: Any) -> Any:
    if value is True or value is False:
        return int(value)
    if runtime.is_exact_integer(value):
        return runtime.normalize_integer(runtime.bigint(value))
    return value


def _set_has_value(native_set: Any, value: Any) -> bool:
    normalized = _set_normalize_value(value)
    if native_set.has(normalized):
        return True
    if runtime.strict_equal(normalized, 0):
        return native_set.has(False)
    if runtime.strict_equal(normalized, 1):
        return native_set.has(True)
    return False


def _set_delete_value(native_set: Any, value: Any) -> bool:
    normalized = _set_normalize_value(value)
    if native_set.delete(normalized):
        return True
    if runtime.strict_equal(normalized, 0):
        return native_set.delete(False)
    if runtime.strict_equal(normalized, 1):
        return native_set.delete(True)
    return False


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
        return _set_has_value(self.jsset, value)

    has = __contains__

    def __iter__(self) -> Any:
        return self.jsset.values()

    def add(self, value: Any) -> None:
        if not self.has(value):
            if value is True or value is False:
                self.jsset.add(value)
            else:
                self.jsset.add(_set_normalize_value(value))

    def clear(self) -> None:
        self.jsset.clear()

    def copy(self) -> SageSet:
        answer = runtime.object.create(
            runtime.object.getPrototypeOf(self))
        answer.jsset = runtime.reflect.construct(
            runtime.set_class, [self.jsset])
        return answer

    def discard(self, value: Any) -> None:
        _set_delete_value(self.jsset, value)

    @staticmethod
    def _from_iterable(other: Any) -> Any:
        if (
            isinstance(other, SageSet)
            or isinstance(other, SageFrozenSet)
        ):
            return other
        return SageSet(other)

    @staticmethod
    def _require_set(other: Any) -> Any:
        if (
            not isinstance(other, SageSet)
            and not isinstance(other, SageFrozenSet)
        ):
            raise TypeError('set operands must be sets')
        return other

    def difference(self, *others: Any) -> SageSet:
        converted = [self._from_iterable(other) for other in others]
        answer = SageSet()
        for value in self:
            if not any(other.has(value) for other in converted):
                answer.jsset.add(value)
        return answer

    def difference_update(self, *others: Any) -> None:
        converted = [self._from_iterable(other) for other in others]
        for value in list_constructor(self):
            if any(other.has(value) for other in converted):
                self.jsset.delete(value)

    def intersection(self, *others: Any) -> SageSet:
        converted = [self._from_iterable(other) for other in others]
        answer = SageSet()
        for value in self:
            if all(other.has(value) for other in converted):
                answer.jsset.add(value)
        return answer

    def intersection_update(self, *others: Any) -> None:
        converted = [self._from_iterable(other) for other in others]
        for value in list_constructor(self):
            if not all(other.has(value) for other in converted):
                self.jsset.delete(value)

    def isdisjoint(self, other: Any) -> bool:
        converted = self._from_iterable(other)
        for value in self:
            if converted.has(value):
                return False
        return True

    def issubset(self, other: Any) -> bool:
        converted = self._from_iterable(other)
        for value in self:
            if not converted.has(value):
                return False
        return True

    def issuperset(self, other: Any) -> bool:
        return self._from_iterable(other).issubset(self)

    def pop(self) -> Any:
        result = self.jsset.values().next()
        if result.done:
            raise KeyError('pop from an empty set')
        self.jsset.delete(result.value)
        return result.value

    def remove(self, value: Any) -> None:
        if not _set_delete_value(self.jsset, value):
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
                self.add(value)

    def __or__(self, other: Any) -> SageSet:
        return self.union(self._require_set(other))

    def __and__(self, other: Any) -> SageSet:
        return self.intersection(self._require_set(other))

    def __xor__(self, other: Any) -> SageSet:
        return self.symmetric_difference(self._require_set(other))

    def __sub__(self, other: Any) -> SageSet:
        return self.difference(self._require_set(other))

    def __ior__(self, other: Any) -> SageSet:
        self.update(self._require_set(other))
        return self

    def __iand__(self, other: Any) -> SageSet:
        self.intersection_update(self._require_set(other))
        return self

    def __ixor__(self, other: Any) -> SageSet:
        self.symmetric_difference_update(self._require_set(other))
        return self

    def __isub__(self, other: Any) -> SageSet:
        self.difference_update(self._require_set(other))
        return self

    def __repr__(self) -> str:
        if self.size == 0:
            return 'set()'
        entries = list_constructor()
        for value in self:
            entries.push(runtime.repr(value))
        return '{' + entries.join(', ') + '}'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__

    def __eq__(self, other: object) -> bool:
        if (
            not isinstance(other, SageSet)
            and not isinstance(other, SageFrozenSet)
        ):
            return False
        if self.size != other.size:
            return False
        return self.issubset(other)

    def __le__(self, other: Any) -> bool:
        return self.issubset(self._require_set(other))

    def __lt__(self, other: Any) -> bool:
        converted = self._require_set(other)
        return self.size < converted.size and self.issubset(converted)

    def __ge__(self, other: Any) -> bool:
        return self.issuperset(self._require_set(other))

    def __gt__(self, other: Any) -> bool:
        converted = self._require_set(other)
        return self.size > converted.size and self.issuperset(converted)


class SageFrozenSet:

    def __init__(self, iterable: Any = runtime.undefined) -> None:
        mutable = SageSet(iterable)
        self.jsset = mutable.jsset

    @property
    def length(self) -> int:
        return self.jsset.size

    @property
    def size(self) -> int:
        return self.jsset.size

    def __len__(self) -> int:
        return self.jsset.size

    def __contains__(self, value: Any) -> bool:
        return _set_has_value(self.jsset, value)

    has = __contains__

    def __iter__(self) -> Any:
        return self.jsset.values()

    def copy(self) -> SageFrozenSet:
        return self

    @staticmethod
    def _from_iterable(other: Any) -> Any:
        if (
            isinstance(other, SageSet)
            or isinstance(other, SageFrozenSet)
        ):
            return other
        return SageSet(other)

    @staticmethod
    def _require_set(other: Any) -> Any:
        if (
            not isinstance(other, SageSet)
            and not isinstance(other, SageFrozenSet)
        ):
            raise TypeError('frozenset operands must be sets')
        return other

    def difference(self, *others: Any) -> SageFrozenSet:
        converted = [self._from_iterable(other) for other in others]
        values = [
            value for value in self
            if not any(other.has(value) for other in converted)
        ]
        return SageFrozenSet(values)

    def intersection(self, *others: Any) -> SageFrozenSet:
        converted = [self._from_iterable(other) for other in others]
        values = [
            value for value in self
            if all(other.has(value) for other in converted)
        ]
        return SageFrozenSet(values)

    def isdisjoint(self, other: Any) -> bool:
        converted = self._from_iterable(other)
        for value in self:
            if converted.has(value):
                return False
        return True

    def issubset(self, other: Any) -> bool:
        converted = self._from_iterable(other)
        for value in self:
            if not converted.has(value):
                return False
        return True

    def issuperset(self, other: Any) -> bool:
        return self._from_iterable(other).issubset(self)

    def symmetric_difference(self, other: Any) -> SageFrozenSet:
        converted = self._from_iterable(other)
        values = [
            value for value in self
            if not converted.has(value)
        ]
        for value in converted:
            if not self.has(value):
                values.append(value)
        return SageFrozenSet(values)

    def union(self, *others: Any) -> SageFrozenSet:
        mutable = SageSet(self)
        mutable.update(*others)
        return SageFrozenSet(mutable)

    def __or__(self, other: Any) -> SageFrozenSet:
        return self.union(self._require_set(other))

    def __and__(self, other: Any) -> SageFrozenSet:
        return self.intersection(self._require_set(other))

    def __xor__(self, other: Any) -> SageFrozenSet:
        return self.symmetric_difference(self._require_set(other))

    def __sub__(self, other: Any) -> SageFrozenSet:
        return self.difference(self._require_set(other))

    def __repr__(self) -> str:
        if self.size == 0:
            return 'frozenset()'
        entries = list_constructor()
        for value in self:
            entries.push(runtime.repr(value))
        return 'frozenset({' + entries.join(', ') + '})'

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__

    def __eq__(self, other: object) -> bool:
        if (
            not isinstance(other, SageSet)
            and not isinstance(other, SageFrozenSet)
        ):
            return False
        return self.size == other.size and self.issubset(other)

    def __le__(self, other: Any) -> bool:
        return self.issubset(self._require_set(other))

    def __lt__(self, other: Any) -> bool:
        converted = self._require_set(other)
        return self.size < converted.size and self.issubset(converted)

    def __ge__(self, other: Any) -> bool:
        return self.issuperset(self._require_set(other))

    def __gt__(self, other: Any) -> bool:
        converted = self._require_set(other)
        return self.size > converted.size and self.issuperset(converted)


def ρσ_set(iterable: Any = runtime.undefined) -> SageSet:
    return SageSet(iterable)


def ρσ_frozenset(
    iterable: Any = runtime.undefined,
) -> SageFrozenSet:
    if isinstance(iterable, SageFrozenSet):
        return iterable
    return SageFrozenSet(iterable)


def set_wrap(native_set: Any) -> SageSet:
    answer = SageSet()
    answer.jsset = native_set
    return answer


def _dict_normalize_key(key: Any) -> Any:
    if isinstance(key, SageSet):
        raise TypeError("unhashable type: 'set'")
    if key is True:
        return 1
    if key is False:
        return 0
    if runtime.is_exact_integer(key):
        return runtime.normalize_integer(runtime.bigint(key))
    return key


class _DictView:

    def __init__(self, dictionary: SageDict, kind: str) -> None:
        self._dictionary = dictionary
        self._kind = kind

    def _snapshot(self) -> Any:
        answer = list_constructor()
        for normalized_key in self._dictionary.jsmap.keys():
            key = self._dictionary.keymap.get(normalized_key)
            if self._kind == 'keys':
                answer.push(key)
            elif self._kind == 'values':
                answer.push(
                    self._dictionary.jsmap.get(normalized_key))
            else:
                answer.push(runtime.math_tuple([
                    key,
                    self._dictionary.jsmap.get(normalized_key),
                ]))
        return answer

    def __len__(self) -> int:
        return len(self._dictionary)

    def __iter__(self) -> Any:
        return iter(self._snapshot())

    def __contains__(self, value: Any) -> bool:
        if self._kind == 'keys':
            return value in self._dictionary
        for item in self._snapshot():
            if equals(item, value):
                return True
        return False

    def __add__(self, _other: Any) -> Any:
        raise TypeError(
            "unsupported operand type(s) for +: 'dict_" +
            self._kind + "'")

    def __hash__(self) -> int:
        if self._kind != 'values':
            raise TypeError(
                "unhashable type: 'dict_" + self._kind + "'")
        return id(self)

    def __repr__(self) -> str:
        return (
            'dict_' + self._kind + '(' +
            runtime.repr(self._snapshot()) + ')'
        )

    __str__ = __repr__
    toString = __repr__
    inspect = __repr__


class SageDict:

    def __init__(
        self,
        iterable: Any = runtime.undefined,
        **keywords: Any,
    ) -> None:
        self.jsmap = _new_map()
        self.keymap = _new_map()
        if iterable is not runtime.undefined:
            self.update(iterable)
        if len(keywords):
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
        return self.jsmap.has(_dict_normalize_key(key))

    has = __contains__

    def __iter__(self) -> Any:
        return iter(self.keys())

    def __setitem__(self, key: Any, value: Any) -> None:
        normalized_key = _dict_normalize_key(key)
        if not self.jsmap.has(normalized_key):
            self.keymap.set(normalized_key, key)
        self.jsmap.set(normalized_key, value)

    set = __setitem__

    def __delitem__(self, key: Any) -> None:
        normalized_key = _dict_normalize_key(key)
        if not self.jsmap.has(normalized_key):
            raise KeyError(key)
        self.jsmap.delete(normalized_key)
        self.keymap.delete(normalized_key)

    def __getitem__(self, key: Any) -> Any:
        normalized_key = _dict_normalize_key(key)
        answer = self.jsmap.get(normalized_key)
        if (
            answer is runtime.undefined
            and not self.jsmap.has(normalized_key)
        ):
            raise KeyError(key)
        return answer

    def clear(self) -> None:
        self.jsmap.clear()
        self.keymap.clear()

    def copy(self) -> SageDict:
        answer = runtime.object.create(
            runtime.object.getPrototypeOf(self))
        answer.jsmap = runtime.reflect.construct(
            runtime.map_class, [self.jsmap])
        answer.keymap = runtime.reflect.construct(
            runtime.map_class, [self.keymap])
        return answer

    def keys(self) -> Any:
        return _DictView(self, 'keys')

    def values(self) -> Any:
        return _DictView(self, 'values')

    def items(self) -> Any:
        return _DictView(self, 'items')

    entries = items

    def get(
        self,
        key: Any,
        default_value: Any = runtime.undefined,
    ) -> Any:
        normalized_key = _dict_normalize_key(key)
        answer = self.jsmap.get(normalized_key)
        if (
            answer is runtime.undefined
            and not self.jsmap.has(normalized_key)
        ):
            return (
                None
                if default_value is runtime.undefined
                else default_value
            )
        return answer

    def setdefault(
        self,
        key: Any,
        default_value: Any = None,
    ) -> Any:
        normalized_key = _dict_normalize_key(key)
        if not self.jsmap.has(normalized_key):
            self.keymap.set(normalized_key, key)
            self.jsmap.set(normalized_key, default_value)
            return default_value
        return self.jsmap.get(normalized_key)

    # Historical Sage.js spelling retained for compatibility.
    set_default = setdefault

    @staticmethod
    def fromkeys(
        iterable: Any,
        value: Any = None,
    ) -> SageDict:
        answer = SageDict()
        for key in iterable:
            answer.__setitem__(key, value)
        return answer

    def pop(
        self,
        key: Any,
        default_value: Any = runtime.undefined,
    ) -> Any:
        normalized_key = _dict_normalize_key(key)
        answer = self.jsmap.get(normalized_key)
        if (
            answer is runtime.undefined
            and not self.jsmap.has(normalized_key)
        ):
            if default_value is runtime.undefined:
                raise KeyError(key)
            return default_value
        self.jsmap.delete(normalized_key)
        self.keymap.delete(normalized_key)
        return answer

    def popitem(self) -> Any:
        result = self.jsmap.entries().next()
        if result.done:
            raise KeyError('dict is empty')
        self.jsmap.delete(result.value[0])
        key = self.keymap.get(result.value[0])
        self.keymap.delete(result.value[0])
        return runtime.math_tuple([key, result.value[1]])

    def update(
        self,
        iterable: Any = runtime.undefined,
        **keywords: Any,
    ) -> None:
        if iterable is not runtime.undefined:
            if isinstance(iterable, SageDict):
                source = iterable.items()
                for pair in source:
                    self.__setitem__(pair[0], pair[1])
            elif isinstance(iterable, runtime.map_class):
                for pair in iterable.entries():
                    self.__setitem__(pair[0], pair[1])
            elif runtime.array.isArray(iterable):
                for pair in iterable:
                    if len(pair) != 2:
                        raise ValueError(
                            'dictionary update sequence element has '
                            'length ' + str(len(pair)) + '; 2 is required')
                    self.__setitem__(pair[0], pair[1])
            elif (
                runtime.strict_equal(
                    runtime.jstype(
                        runtime.reflect.get(
                            iterable, runtime.iterator_symbol
                        )
                    ),
                    'function',
                )
            ):
                for pair in iterable:
                    if len(pair) != 2:
                        raise ValueError(
                            'dictionary update sequence element has '
                            'length ' + str(len(pair)) + '; 2 is required')
                    self.__setitem__(pair[0], pair[1])
            else:
                for key in runtime.object.keys(iterable):
                    self.__setitem__(key, iterable[key])
        for key in keywords:
            self.__setitem__(key, keywords[key])

    def __repr__(self) -> str:
        entries = list_constructor()
        for normalized_key in self.jsmap.keys():
            entries.push(
                runtime.repr(self.keymap.get(normalized_key))
                + ': ' + runtime.repr(
                    self.jsmap.get(normalized_key))
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
            normalized_key = _dict_normalize_key(pair[0])
            if not self.jsmap.has(normalized_key):
                return False
            if not equals(
                self.jsmap.get(normalized_key), pair[1]
            ):
                return False
        return True

    def as_object(self) -> Any:
        answer = runtime.object.create(None)
        for normalized_key in self.jsmap.keys():
            answer[self.keymap.get(normalized_key)] = (
                self.jsmap.get(normalized_key)
            )
        return answer


def ρσ_dict(
    iterable: Any = runtime.undefined,
    **keywords: Any,
) -> SageDict:
    return SageDict(iterable, **keywords)


def ρσ_scope_dict(values: Any) -> SageDict:
    answer = SageDict()
    for key in runtime.object.keys(values):
        if values[key] is not runtime.undefined:
            answer.__setitem__(key, values[key])
    return answer


runtime.reflect.set(ρσ_dict, 'fromkeys', SageDict.fromkeys)


def dict_wrap(native_map: Any) -> SageDict:
    answer = SageDict()
    for pair in native_map.entries():
        answer.__setitem__(pair[0], pair[1])
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
    ρσ_frozenset,
    'prototype',
    runtime.reflect.get(SageFrozenSet, 'prototype'),
)
runtime.reflect.set(
    ρσ_dict,
    'prototype',
    runtime.reflect.get(SageDict, 'prototype'),
)
runtime.reflect.set(
    runtime.reflect.get(SageDict, 'prototype'),
    '__python_type__',
    ρσ_dict,
)
runtime.reflect.set(
    runtime.reflect.get(SageSet, 'prototype'),
    '__python_type__',
    ρσ_set,
)
runtime.reflect.set(
    runtime.reflect.get(SageFrozenSet, 'prototype'),
    '__python_type__',
    ρσ_frozenset,
)
list_constructor = ρσ_list_constructor
runtime.reflect.set(
    list_constructor, 'prototype', _list_prototype())
runtime.reflect.set(
    _list_prototype(), '__python_type__', list_constructor)
runtime.set_class_repr(ρσ_dict, "<class 'dict'>")
runtime.set_class_repr(ρσ_set, "<class 'set'>")
runtime.set_class_repr(ρσ_frozenset, "<class 'frozenset'>")
list_decorate = ρσ_list_decorate
list = ρσ_list_constructor
list_wrap = ρσ_list_decorate
set = ρσ_set
frozenset = ρσ_frozenset
dict = ρσ_dict
