"""Compiler/runtime ABI helpers implemented as ordinary Python source."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _internal_type_is(actual: Any, expected: str) -> bool:
    return runtime.strict_equal(actual, expected)


def _internal_get_member(value: Any, name: Any) -> Any:
    if value is None or value is runtime.undefined:
        return runtime.undefined
    value_type = runtime.jstype(value)
    if (
        _internal_type_is(value_type, 'object')
        or _internal_type_is(value_type, 'function')
    ):
        return runtime.reflect.get(value, name)
    boxed = runtime.reflect.apply(
        runtime.object, runtime.undefined, [value])
    return runtime.reflect.get(boxed, name)


def _internal_member_is_function(value: Any, name: Any) -> bool:
    return _internal_type_is(
        runtime.jstype(_internal_get_member(value, name)),
        'function',
    )


def _internal_is_native_map(value: Any) -> bool:
    return (
        value is not None
        and _internal_get_member(value, 'constructor')
        is runtime.map_class
    )


def _internal_is_plain_object(value: Any) -> bool:
    if not _internal_type_is(runtime.jstype(value), 'object'):
        return False
    prototype = runtime.object.getPrototypeOf(value)
    return (
        prototype is None
        or prototype is runtime.object.prototype
    )


@runtime.native_method
def ρσ_python_iterator_next(self: Any) -> Any:
    result = runtime.object.create(None)
    try:
        value = runtime.reflect.apply(
            _internal_get_member(self, '__next__'),
            self,
            [],
        )
        runtime.reflect.set(result, 'value', value)
        runtime.reflect.set(result, 'done', False)
    except StopIteration:
        runtime.reflect.set(result, 'value', runtime.undefined)
        runtime.reflect.set(result, 'done', True)
    return result


@runtime.sequence_class
class _PythonSequenceIterator:
    """Adapt Python's legacy ``__getitem__`` iteration protocol to ES."""

    def __init__(self, sequence: Any) -> None:
        self._sequence = sequence
        self._index = 0

    def __iter__(self) -> _PythonSequenceIterator:
        return self

    def __next__(self) -> Any:
        index = self._index
        self._index += 1
        try:
            return runtime.reflect.apply(
                _internal_get_member(self._sequence, '__getitem__'),
                self._sequence,
                [index],
            )
        except IndexError:
            raise StopIteration  # noqa: B904
        except StopIteration:
            raise StopIteration  # noqa: B904


def ρσ_check_unbound(value: Any, name: str) -> Any:
    if value is runtime.undefined:
        raise NameError(
            "local variable '" + name +
            "' referenced before assignment")
    return value


def ρσ_delete_name(value: Any, name: str) -> Any:
    ρσ_check_unbound(value, name)
    return runtime.undefined


def ρσ_eslice(
    array: Any,
    step: int,
    start: Any,
    end: Any,
) -> Any:
    is_string = (
        _internal_type_is(runtime.jstype(array), 'string')
        or runtime.instance_of(array, runtime.string_class)
    )
    if is_string:
        array = array.split('')

    if step < 0:
        step = -step
        array = array.slice().reverse()
        if start is not runtime.undefined:
            start = array.length - start - 1
        if end is not runtime.undefined:
            end = array.length - end - 1
    if start is runtime.undefined:
        start = 0
    if end is runtime.undefined:
        end = array.length

    answer = []
    index = 0
    for value in array.slice(start, end):
        if index % step == 0:
            answer.append(value)
        index += 1
    if is_string:
        return str.join('', answer)
    return answer


def ρσ_delslice(
    array: Any,
    step: int,
    start: Any,
    end: Any,
) -> Any:
    is_string = (
        _internal_type_is(runtime.jstype(array), 'string')
        or runtime.instance_of(array, runtime.string_class)
    )
    if is_string:
        array = array.split('')
    if step < 0:
        if start is runtime.undefined:
            start = array.length
        if end is runtime.undefined:
            end = 0
        start, end, step = end, start, -step
    if start is runtime.undefined:
        start = 0
    if end is runtime.undefined:
        end = array.length

    if step == 1:
        array.splice(start, end - start)
    elif end > start:
        indices = []
        for index in range(start, end, step):
            indices.append(index)
        for position in range(len(indices) - 1, -1, -1):
            array.splice(indices[position], 1)

    if is_string:
        return array.join('')
    return array


def ρσ_flatten(array: Any) -> list[Any]:
    answer = []
    for value in array:
        if runtime.array.isArray(value):
            for item in ρσ_flatten(value):
                answer.append(item)
        else:
            answer.append(value)
    return answer


def ρσ_unpack_asarray(count: Any, iterable: Any) -> Any:
    if runtime.arraylike(iterable):
        answer = iterable
    else:
        answer = []
        iterator_method = _internal_get_member(
            iterable, runtime.iterator_symbol)
        if _internal_type_is(runtime.jstype(iterator_method), 'function'):
            if _internal_is_native_map(iterable):
                iterator = iterable.keys()
            else:
                iterator = runtime.reflect.apply(
                    iterator_method, iterable, [])
            result = iterator.next()
            while (
                not result.done
                and (
                    count is runtime.number.POSITIVE_INFINITY
                    or len(answer) <= count
                )
            ):
                answer.append(result.value)
                result = iterator.next()
    if (
        count is not runtime.number.POSITIVE_INFINITY
        and len(answer) != count
    ):
        raise ValueError(
            'not enough values to unpack'
            if len(answer) < count
            else 'too many values to unpack')
    return answer


def ρσ_unpack_starred(
    leading_count: int,
    trailing_count: int,
    iterable: Any,
) -> Any:
    answer = ρσ_unpack_asarray(
        runtime.number.POSITIVE_INFINITY, iterable)
    if len(answer) < leading_count + trailing_count:
        raise ValueError('not enough values to unpack')
    return answer


def ρσ_unpack_nested(pattern: Any, iterable: Any) -> list[Any]:
    values = ρσ_unpack_asarray(len(pattern), iterable)
    answer = []
    for index in range(len(pattern)):
        nested_pattern = pattern[index]
        if nested_pattern is None:
            answer.append(values[index])
        else:
            for value in ρσ_unpack_nested(
                nested_pattern, values[index]
            ):
                answer.append(value)
    return answer


def ρσ_extends(child: Any, parent: Any) -> None:
    child.prototype = runtime.object.create(parent.prototype)
    child.prototype.constructor = child


def ρσ_native_method(target_function: Any) -> Any:
    """Adapt an ordinary ``(self, *args)`` function to a JS object method."""
    return runtime.native_method_adapter(target_function)


def ρσ_strict_equal(left: Any, right: Any) -> bool:
    return left is right


def ρσ_sequence_proxy(instance: Any) -> Any:
    integer_property = runtime.regexp(r'^-?[0-9]+$')

    def get_item(
        target: Any,
        property_name: Any,
        receiver: Any,
    ) -> Any:
        if (
            _internal_type_is(
                runtime.jstype(property_name), 'string')
            and integer_property.test(property_name)
        ):
            return target.__getitem__(runtime.number(property_name))
        if runtime.strict_equal(property_name, 'length'):
            return target.__len__()
        value = runtime.reflect.get(target, property_name, receiver)
        if (
            value is runtime.undefined
            and _internal_type_is(
                runtime.jstype(property_name), 'string')
            and runtime.string_find(property_name, '__') != 0
        ):
            getattr_method = runtime.reflect.get(target, '__getattr__')
            if _internal_type_is(
                runtime.jstype(getattr_method), 'function'
            ):
                return runtime.reflect.apply(
                    getattr_method, target, [property_name])
        return value

    def set_item(
        target: Any,
        property_name: Any,
        value: Any,
        receiver: Any,
    ) -> bool:
        if (
            _internal_type_is(
                runtime.jstype(property_name), 'string')
            and integer_property.test(property_name)
        ):
            target.__setitem__(runtime.number(property_name), value)
            return True
        return runtime.reflect.set(
            target, property_name, value, receiver)

    return runtime.reflect.construct(
        runtime.proxy_class,
        [instance, {'get': get_item, 'set': set_item}],
    )


def _internal_set_class_repr(wrapper: Any, target: Any) -> None:
    if (
        runtime.object.getOwnPropertyDescriptor(
            wrapper, '__repr__')
        is not runtime.undefined
    ):
        return

    def class_repr() -> str:
        return "<class '" + target.name + "'>"

    runtime.object.defineProperty(
        wrapper,
        '__repr__',
        {'configurable': True, 'value': class_repr},
    )


def ρσ_callable_sequence_class(target: Any) -> Any:
    def call_class(
        target_class: Any,
        _this_argument: Any,
        call_args: Any,
    ) -> Any:
        return ρσ_sequence_proxy(
            runtime.reflect.construct(target_class, call_args))

    def construct_class(
        target_class: Any,
        call_args: Any,
        new_target: Any,
    ) -> Any:
        return ρσ_sequence_proxy(
            runtime.reflect.construct(
                target_class, call_args, new_target)
        )

    wrapper = runtime.reflect.construct(
        runtime.proxy_class,
        [
            target,
            {'apply': call_class, 'construct': construct_class},
        ],
    )
    target.prototype.constructor = wrapper
    _internal_set_class_repr(wrapper, target)
    return wrapper


def ρσ_callable_instance_class_adapter(target: Any) -> Any:
    def make_instance(target_class: Any, call_args: Any) -> Any:
        def callable_instance(*instance_args: Any) -> Any:
            method = _internal_get_member(
                callable_instance, '__call__')
            return runtime.reflect.apply(
                method, callable_instance, instance_args)

        runtime.object.setPrototypeOf(
            callable_instance, target_class.prototype)
        runtime.reflect.apply(
            target_class, callable_instance, call_args)
        return callable_instance

    def call_class(
        target_class: Any,
        _this_argument: Any,
        call_args: Any,
    ) -> Any:
        return make_instance(target_class, call_args)

    def construct_class(
        target_class: Any,
        call_args: Any,
        _new_target: Any,
    ) -> Any:
        return make_instance(target_class, call_args)

    wrapper = runtime.reflect.construct(
        runtime.proxy_class,
        [
            target,
            {'apply': call_class, 'construct': construct_class},
        ],
    )
    target.prototype.constructor = wrapper
    _internal_set_class_repr(wrapper, target)
    return wrapper


def ρσ_in(value: Any, container: Any) -> bool:
    if _internal_type_is(runtime.jstype(container), 'string'):
        return container.indexOf(value) != -1
    if _internal_member_is_function(container, '__contains__'):
        return runtime.reflect.apply(
            _internal_get_member(container, '__contains__'),
            container,
            [value],
        )
    if (
        runtime.instance_of(container, runtime.map_class)
        or runtime.instance_of(container, runtime.set_class)
    ):
        return container.has(value)
    if runtime.arraylike(container):
        return runtime.reflect.apply(
            runtime.list_contains, container, [value])
    container_type = runtime.jstype(container)
    if (
        not _internal_type_is(container_type, 'object')
        and not _internal_type_is(container_type, 'function')
    ):
        raise TypeError('argument is not iterable')
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        container,
        [value],
    )


def ρσ_Iterable(iterable: Any) -> Any:
    """Return an ES iterable implementing Python's iteration protocol."""
    if runtime.arraylike(iterable):
        return iterable
    iterator_method = _internal_get_member(
        iterable, runtime.iterator_symbol)
    if _internal_type_is(runtime.jstype(iterator_method), 'function'):
        if _internal_is_native_map(iterable):
            return iterable.keys()
        # Let JavaScript's ``for of`` invoke the iterator method exactly
        # once.  Calling it here as well breaks self-iterating proxies and
        # generators used by the compiler itself.
        return iterable
    if _internal_member_is_function(iterable, '__getitem__'):
        return _PythonSequenceIterator(iterable)
    # Keyword-argument dictionaries and a few legacy library mappings are
    # represented by null-prototype or ordinary JavaScript objects.
    if _internal_is_plain_object(iterable):
        return runtime.object.keys(iterable)
    raise TypeError('object is not iterable')


def ρσ_desugar_kwargs(sources: Any) -> Any:
    answer = runtime.object.create(None)
    answer[runtime.kwargs_symbol] = True
    for source in sources:
        if _internal_member_is_function(source, 'keys'):
            keys = runtime.reflect.apply(
                _internal_get_member(source, 'keys'), source, [])
        elif _internal_is_plain_object(source):
            keys = runtime.object.keys(source)
        else:
            raise TypeError('argument after ** must be a mapping')
        for key in keys:
            if not _internal_type_is(runtime.jstype(key), 'string'):
                raise TypeError('keywords must be strings')
            if _internal_has_own(answer, key):
                raise TypeError(
                    "multiple values for keyword argument '" + key + "'")
            if _internal_member_is_function(source, '__getitem__'):
                answer[key] = runtime.reflect.apply(
                    _internal_get_member(source, '__getitem__'),
                    source,
                    [key],
                )
            else:
                answer[key] = source[key]
    return answer


def ρσ_desugar_kwargs_legacy(sources: Any) -> Any:
    """Retain the historical permissive keyword merge in Sage mode."""
    answer = runtime.object.create(None)
    answer[runtime.kwargs_symbol] = True
    for source in sources:
        runtime.object.assign(answer, source)
    return answer


def _internal_has_own(value: Any, name: Any) -> bool:
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        value,
        [name],
    )


def ρσ_interpolate_kwargs(
    receiver: Any,
    target_function: Any,
    supplied_args: Any,
) -> Any:
    keyword_object = supplied_args[-1]
    if (
        _internal_get_member(
            target_function, '__positional_only__')
        and runtime.object.keys(keyword_object).length
    ):
        raise TypeError(
            'function takes no keyword arguments')
    argnames = _internal_get_member(
        target_function, '__argnames__')
    keyword_only = _internal_get_member(
        target_function, '__kwonly__')
    if not argnames and not keyword_only:
        return runtime.reflect.apply(
            target_function, receiver, supplied_args)
    if not argnames:
        argnames = runtime.reflect.construct(runtime.array, [0])

    keyword_object = supplied_args.pop()
    if _internal_get_member(
        target_function, '__handles_kwarg_interpolation__'
    ):
        argument_count = max(supplied_args.length, argnames.length)
        call_args = runtime.reflect.construct(
            runtime.array, [argument_count + 1])
        call_args[-1] = keyword_object
        for index in range(argument_count):
            if index < argnames.length:
                property_name = argnames[index]
                if _internal_has_own(
                    keyword_object, property_name
                ):
                    if index < supplied_args.length:
                        raise TypeError(
                            "multiple values for argument '"
                            + property_name + "'")
                    call_args[index] = keyword_object[property_name]
                    runtime.reflect.deleteProperty(
                        keyword_object, property_name)
                elif index < supplied_args.length:
                    call_args[index] = supplied_args[index]
            else:
                call_args[index] = supplied_args[index]
        if not _internal_get_member(target_function, '__varkw__'):
            for unexpected in runtime.object.keys(keyword_object):
                if (
                    not keyword_only
                    or keyword_only.indexOf(unexpected) == -1
                ):
                    raise TypeError(
                        "unexpected keyword argument '"
                        + unexpected + "'")
        return runtime.reflect.apply(
            target_function, receiver, call_args)

    for index in range(argnames.length):
        property_name = argnames[index]
        if _internal_has_own(keyword_object, property_name):
            if index < supplied_args.length:
                raise TypeError(
                    "multiple values for argument '"
                    + property_name + "'")
            supplied_args[index] = keyword_object[property_name]
            runtime.reflect.deleteProperty(
                keyword_object, property_name)
    for unexpected in runtime.object.keys(keyword_object):
        if (
            not keyword_only
            or keyword_only.indexOf(unexpected) == -1
        ):
            raise TypeError(
                "unexpected keyword argument '" + unexpected + "'")
    return runtime.reflect.apply(
        target_function, receiver, supplied_args)


def ρσ_interpolate_kwargs_legacy(
    receiver: Any,
    target_function: Any,
    supplied_args: Any,
) -> Any:
    keyword_object = supplied_args[-1]
    argnames = _internal_get_member(
        target_function, '__argnames__')
    if not argnames:
        return runtime.reflect.apply(
            target_function, receiver, supplied_args)

    keyword_object = supplied_args.pop()
    if _internal_get_member(
        target_function, '__handles_kwarg_interpolation__'
    ):
        argument_count = max(supplied_args.length, argnames.length)
        call_args = runtime.reflect.construct(
            runtime.array, [argument_count + 1])
        call_args[-1] = keyword_object
        for index in range(argument_count):
            if index < argnames.length:
                property_name = argnames[index]
                if _internal_has_own(
                    keyword_object, property_name
                ):
                    call_args[index] = keyword_object[property_name]
                    runtime.reflect.deleteProperty(
                        keyword_object, property_name)
                elif index < supplied_args.length:
                    call_args[index] = supplied_args[index]
            else:
                call_args[index] = supplied_args[index]
        return runtime.reflect.apply(
            target_function, receiver, call_args)

    for index in range(argnames.length):
        property_name = argnames[index]
        if _internal_has_own(keyword_object, property_name):
            supplied_args[index] = keyword_object[property_name]
    return runtime.reflect.apply(
        target_function, receiver, supplied_args)


def ρσ_interpolate_kwargs_constructor(
    receiver: Any,
    use_apply: bool,
    target_function: Any,
    supplied_args: Any,
) -> Any:
    if use_apply:
        runtime.reflect.apply(
            target_function, receiver, supplied_args)
    else:
        ρσ_interpolate_kwargs(
            receiver, target_function, supplied_args)
    return receiver


def ρσ_interpolate_kwargs_constructor_legacy(
    receiver: Any,
    use_apply: bool,
    target_function: Any,
    supplied_args: Any,
) -> Any:
    if use_apply:
        runtime.reflect.apply(
            target_function, receiver, supplied_args)
    else:
        ρσ_interpolate_kwargs_legacy(
            receiver, target_function, supplied_args)
    return receiver


def ρσ_getitem(value: Any, key: Any) -> Any:
    if _internal_member_is_function(value, '__getitem__'):
        return runtime.reflect.apply(
            _internal_get_member(value, '__getitem__'),
            value,
            [key],
        )
    if _internal_get_member(key, '__sagejs_slice__'):
        indices = runtime.reflect.apply(
            _internal_get_member(key, 'indices'),
            key,
            [value.length],
        )
        answer = []
        for index in range(indices[0], indices[1], indices[2]):
            answer.append(value[index])
        if _internal_type_is(runtime.jstype(value), 'string'):
            return ''.join(answer)
        if (
            runtime.array.isArray(value)
            and runtime.object.isFrozen(value)
        ):
            return runtime.math_tuple(answer)
        return answer
    if _internal_type_is(runtime.jstype(key), 'number') and key < 0:
        key += value.length
    return value[key]


def ρσ_setitem(value: Any, key: Any, member: Any) -> None:
    if _internal_member_is_function(value, '__setitem__'):
        runtime.reflect.apply(
            _internal_get_member(value, '__setitem__'),
            value,
            [key, member],
        )
        return
    if _internal_get_member(key, '__sagejs_slice__'):
        if not _internal_member_is_function(value, 'splice'):
            raise TypeError('object does not support slice assignment')
        indices = runtime.reflect.apply(
            _internal_get_member(key, 'indices'),
            key,
            [value.length],
        )
        if (
            not runtime.arraylike(member)
            and not _internal_member_is_function(
                member, runtime.iterator_symbol)
        ):
            raise TypeError(
                'can only assign an iterable to a slice')
        replacement = [item for item in member]
        if indices[2] == 1:
            splice_args = [
                indices[0],
                indices[1] - indices[0],
            ]
            splice_args.extend(replacement)
            runtime.reflect.apply(
                _internal_get_member(value, 'splice'),
                value,
                splice_args,
            )
            return
        positions = [
            index for index in range(
                indices[0], indices[1], indices[2])
        ]
        if len(positions) != len(replacement):
            raise ValueError(
                'attempt to assign sequence of size '
                + str(len(replacement))
                + ' to extended slice of size '
                + str(len(positions))
            )
        for position_index in range(len(positions)):
            value[positions[position_index]] = (
                replacement[position_index]
            )
        return
    if _internal_type_is(runtime.jstype(key), 'number') and key < 0:
        key += value.length
    value[key] = member


def ρσ_delitem(value: Any, key: Any) -> None:
    if _internal_member_is_function(value, '__delitem__'):
        runtime.reflect.apply(
            _internal_get_member(value, '__delitem__'),
            value,
            [key],
        )
        return
    if _internal_get_member(key, '__sagejs_slice__'):
        if not _internal_member_is_function(value, 'splice'):
            raise TypeError('object does not support slice deletion')
        indices = runtime.reflect.apply(
            _internal_get_member(key, 'indices'),
            key,
            [value.length],
        )
        positions = [
            index for index in range(
                indices[0], indices[1], indices[2])
        ]
        positions.sort()
        positions.reverse()
        for position in positions:
            value.splice(position, 1)
        return
    if _internal_member_is_function(value, 'splice'):
        value.splice(key, 1)
        return
    if _internal_type_is(runtime.jstype(key), 'number') and key < 0:
        key += value.length
    runtime.reflect.deleteProperty(value, key)


def ρσ_bound_index(index: Any, array: Any) -> Any:
    if _internal_type_is(runtime.jstype(index), 'number') and index < 0:
        index += array.length
    return index


def ρσ_splice(
    array: Any,
    values: Any,
    start: Any,
    end: Any,
) -> None:
    if not start:
        start = 0
    if start < 0:
        start += array.length
    if end is runtime.undefined:
        end = array.length
    if end < 0:
        end += array.length
    if _internal_member_is_function(array, '__setslice__'):
        runtime.reflect.apply(
            _internal_get_member(array, '__setslice__'),
            array,
            [start, end, values],
        )
        return
    call_args = [start, end - start]
    for value in values:
        call_args.append(value)
    runtime.reflect.apply(
        runtime.array.prototype.splice, array, call_args)


def _internal_exists_not_null(expression: Any) -> bool:
    return expression is not runtime.undefined and expression is not None


def _internal_exists_default_object(expression: Any) -> Any:
    if expression is runtime.undefined or expression is None:
        return runtime.object.create(None)
    return expression


def _internal_exists_callable(expression: Any) -> Any:
    if _internal_type_is(runtime.jstype(expression), 'function'):
        return expression

    def undefined_function() -> Any:
        return runtime.undefined

    return undefined_function


def _internal_exists_getitem(expression: Any) -> Any:
    if (
        expression is not runtime.undefined
        and expression is not None
        and _internal_member_is_function(expression, '__getitem__')
    ):
        return expression

    def undefined_getitem(_key: Any) -> Any:
        return runtime.undefined

    return {'__getitem__': undefined_getitem}


def _internal_exists_alternative(
    expression: Any,
    alternative: Any,
) -> Any:
    if expression is runtime.undefined or expression is None:
        return alternative
    return expression


ρσ_exists = {
    'n': _internal_exists_not_null,
    'd': _internal_exists_default_object,
    'c': _internal_exists_callable,
    'g': _internal_exists_getitem,
    'e': _internal_exists_alternative,
}


def ρσ_mixin(*classes: Any) -> None:
    """Copy missing prototype members using the legacy Sage.js MRO."""
    seen = runtime.object.create(None)
    skipped = [
        '__argnames__',
        '__handles_kwarg_interpolation__',
        '__init__',
        '__annotations__',
        '__doc__',
        '__bind_methods__',
        '__bases__',
        'constructor',
        '__class__',
    ]
    for name in skipped:
        seen[name] = True

    resolved_properties = {}
    target = classes[0].prototype

    def tuple_mixin_initializer(
        tuple_initializer: Any,
        original_initializer: Any,
    ) -> Any:
        def initialize_tuple_mixin(
            self: Any,
            *args: Any,
        ) -> Any:
            runtime.reflect.apply(tuple_initializer, self, args)
            return runtime.reflect.apply(
                original_initializer, self, args)

        return runtime.native_method(initialize_tuple_mixin)

    for class_index in range(1, len(classes)):
        if classes[class_index] is not runtime.tuple_builtin:
            continue
        tuple_initializer = classes[class_index].prototype.__init__
        original_initializer = target.__init__
        target.__init__ = tuple_mixin_initializer(
            tuple_initializer, original_initializer)
        break

    prototype = target
    while prototype and prototype is not runtime.object.prototype:
        for name in runtime.object.getOwnPropertyNames(prototype):
            seen[name] = True
        prototype = runtime.object.getPrototypeOf(prototype)

    for class_index in range(1, len(classes)):
        prototype = classes[class_index].prototype
        while prototype and prototype is not runtime.object.prototype:
            for name in runtime.object.getOwnPropertyNames(prototype):
                if seen[name]:
                    continue
                seen[name] = True
                resolved_properties[name] = (
                    runtime.object.getOwnPropertyDescriptor(
                        prototype, name)
                )
            prototype = runtime.object.getPrototypeOf(prototype)
    runtime.object.defineProperties(target, resolved_properties)


def ρσ_instanceof(value: Any, *candidates: Any) -> bool:
    bases = []
    constructor = _internal_get_member(value, 'constructor')
    prototype = _internal_get_member(constructor, 'prototype')
    if prototype is not runtime.undefined:
        candidate_bases = _internal_get_member(
            prototype, '__bases__')
        if candidate_bases:
            bases = candidate_bases

    for candidate in candidates:
        if runtime.instance_of(value, candidate):
            return True
        if (
            (
                candidate is runtime.array
                or candidate is runtime.list_constructor
                or candidate is runtime.tuple_builtin
            )
            and runtime.array.isArray(value)
            and (
                candidate is not runtime.tuple_builtin
                or runtime.object.isFrozen(value)
            )
        ):
            return True
        if (
            candidate is runtime.string_builtin
            and (
                _internal_type_is(runtime.jstype(value), 'string')
                or runtime.instance_of(
                    value, runtime.string_class)
            )
        ):
            return True
        if (
            candidate is runtime.int_builtin
            and _internal_type_is(runtime.jstype(value), 'number')
            and runtime.number.isInteger(value)
        ):
            return True
        if (
            candidate is runtime.float_builtin
            and _internal_type_is(runtime.jstype(value), 'number')
            and not runtime.number.isInteger(value)
        ):
            return True
        for base_index in range(1, len(bases)):
            base = bases[base_index]
            while base:
                if candidate is base:
                    return True
                base_prototype = runtime.object.getPrototypeOf(
                    base.prototype)
                if not base_prototype:
                    break
                base = base_prototype.constructor
    return False
