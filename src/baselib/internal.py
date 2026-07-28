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


def ρσ_unpack_asarray(count: int, iterable: Any) -> Any:
    if runtime.arraylike(iterable):
        return iterable
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
        while not result.done and len(answer) < count:
            answer.append(result.value)
            result = iterator.next()
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
        return runtime.reflect.get(target, property_name, receiver)

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
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        container,
        [value],
    )


def ρσ_Iterable(iterable: Any) -> Any:
    """Return the eager iterable used by generated ``for`` loops."""
    if runtime.arraylike(iterable):
        return iterable
    iterator_method = _internal_get_member(
        iterable, runtime.iterator_symbol)
    if _internal_type_is(runtime.jstype(iterator_method), 'function'):
        if _internal_is_native_map(iterable):
            iterator = iterable.keys()
        else:
            iterator = runtime.reflect.apply(
                iterator_method, iterable, [])
        answer = []
        result = iterator.next()
        while not result.done:
            answer.append(result.value)
            result = iterator.next()
        return answer
    return runtime.object.keys(iterable)


def ρσ_desugar_kwargs(sources: Any) -> Any:
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


def ρσ_getitem(value: Any, key: Any) -> Any:
    if _internal_member_is_function(value, '__getitem__'):
        return runtime.reflect.apply(
            _internal_get_member(value, '__getitem__'),
            value,
            [key],
        )
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
            )
            and runtime.array.isArray(value)
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
