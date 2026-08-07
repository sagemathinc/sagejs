"""Compiler/runtime ABI helpers implemented as ordinary Python source."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _internal_type_is(actual: Any, expected: str) -> bool:
    return runtime.strict_equal(actual, expected)


def _internal_get_member(value: Any, name: Any) -> Any:
    if value is None or value is runtime.undefined:
        return runtime.undefined
    return runtime.native_get(value, name)


def _internal_member_is_function(value: Any, name: Any) -> bool:
    return _internal_type_is(
        runtime.jstype(_internal_get_member(value, name)),
        'function',
    )


def _internal_call_member(
    value: Any,
    name: Any,
    call_args: list[Any],
) -> Any:
    method = _internal_get_member(value, name)
    if _internal_get_member(method, '__staticmethod__') is True:
        return runtime.reflect.apply(
            method, runtime.undefined, call_args)
    if _internal_get_member(
        method, '__python_descriptor__'
    ) is True and _internal_get_member(
        method, '__self__'
    ) is runtime.undefined:
        explicit_args = runtime.reflect.apply(
            runtime.array.prototype.slice, call_args, [])
        explicit_args.unshift(value)
        return runtime.reflect.apply(
            method, runtime.undefined, explicit_args)
    return runtime.reflect.apply(method, value, call_args)


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
        value = _internal_call_member(self, '__next__', [])
        runtime.reflect.set(result, 'value', value)
        runtime.reflect.set(result, 'done', False)
    except StopIteration as error:
        runtime.reflect.set(result, 'value', error.value)
        runtime.reflect.set(result, 'done', True)
    return result


class ρσ_yield_from_return(BaseException):

    def __init__(self, value: Any) -> None:
        BaseException.__init__(self, value)
        self.value = value


def ρσ_yield_from_impl(iterable: Any) -> Any:
    """Delegate to a Python iterator using the PEP 380 protocol."""
    iterator = iter(iterable)
    send_method = runtime.undefined
    try:
        yielded = next(iterator)
    except StopIteration as error:
        raise ρσ_yield_from_return(error.value)  # noqa: B904

    while True:
        try:
            sent = yield yielded
        except GeneratorExit as error:
            close_method = _internal_get_member(iterator, 'close')
            if _internal_type_is(
                runtime.jstype(close_method), 'function'
            ):
                runtime.reflect.apply(close_method, iterator, [])
            raise error  # noqa: B904
        except BaseException as error:
            throw_method = _internal_get_member(iterator, 'throw')
            if not _internal_type_is(
                runtime.jstype(throw_method), 'function'
            ):
                if isinstance(error, runtime.non_exception_throw):
                    raise TypeError(  # noqa: B904
                        'exceptions must derive from BaseException')
                raise error  # noqa: B904
            if isinstance(error, runtime.non_exception_throw):
                throw_argument = _internal_get_member(error, 'value')
                throw_arguments = [throw_argument]
            else:
                throw_argument = _internal_get_member(
                    error, '__sagejs_throw_original__')
                if throw_argument is runtime.undefined:
                    throw_argument = error
                throw_arguments = [throw_argument]
                original_args = _internal_get_member(
                    error, '__sagejs_throw_args__')
                if original_args is not runtime.undefined:
                    throw_arguments.extend(original_args)
            try:
                yielded = runtime.reflect.apply(
                    throw_method, iterator, throw_arguments)
            except StopIteration as stop:
                raise ρσ_yield_from_return(  # noqa: B904
                    stop.value)
        else:
            try:
                if sent is None:
                    yielded = next(iterator)
                else:
                    send_method = _internal_get_member(iterator, 'send')
                    if not _internal_type_is(
                        runtime.jstype(send_method), 'function'
                    ):
                        raise AttributeError(
                            "'iterator' object has no attribute 'send'")
                    yielded = runtime.reflect.apply(
                        send_method, iterator, [sent])
            except StopIteration as stop:
                raise ρσ_yield_from_return(  # noqa: B904
                    stop.value)


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
            return _internal_call_member(
                self._sequence, '__getitem__', [index])
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
        # This is a compiler-internal staging vector, not a user-visible
        # Python list.  Starred assignment wraps its slice explicitly.
        answer = runtime.reflect.construct(runtime.array, [])
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
                answer.push(result.value)
                result = iterator.next()
    if (
        count is not runtime.number.POSITIVE_INFINITY
        and not runtime.strict_equal(len(answer), count)
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
    # Generated destructuring consumes this vector immediately by index.
    answer = runtime.reflect.construct(runtime.array, [])
    for index in range(len(pattern)):
        nested_pattern = pattern[index]
        if nested_pattern is None:
            answer.push(values[index])
        else:
            for value in ρσ_unpack_nested(
                nested_pattern, values[index]
            ):
                answer.push(value)
    return answer


def ρσ_extends(child: Any, parent: Any) -> None:
    child.prototype = runtime.object.create(parent.prototype)
    child.prototype.constructor = child


def ρσ_validate_class_bases(bases: Any) -> None:
    """Reject non-types and incompatible native instance layouts."""
    native_layouts = 0
    for index in range(len(bases)):
        base = bases[index]
        if (
            not runtime.strict_equal(runtime.jstype(base), 'function')
            or base is runtime.function_class
        ):
            raise TypeError('bases must be types')
        for previous_index in range(index):
            if base is bases[previous_index]:
                raise TypeError('duplicate base class')
        prototype = runtime.reflect.get(base, 'prototype')
        if prototype is runtime.undefined:
            raise TypeError('bases must be types')
        if not runtime.reflect.has(prototype, '__bases__'):
            native_layouts += 1
    if native_layouts > 1:
        raise TypeError('multiple bases have instance lay-out conflict')


def ρσ_native_method(target_function: Any) -> Any:
    """Adapt an ordinary ``(self, *args)`` function to a JS object method."""
    return runtime.native_method_adapter(target_function)


def ρσ_strict_equal(left: Any, right: Any) -> bool:
    return left is right


def ρσ_sequence_proxy(instance: Any) -> Any:
    integer_property = runtime.regexp(r'^-?[0-9]+$')
    integer_tuple_property = runtime.regexp(
        r'^\[?-?[0-9]+(?:,\s*-?[0-9]+)+\]?$')
    integer_tuple_cleanup = runtime.regexp(r'[\[\]\s]', 'g')

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
        if (
            _internal_type_is(
                runtime.jstype(property_name), 'string')
            and integer_tuple_property.test(property_name)
        ):
            property_name = runtime.reflect.apply(
                runtime.string_class.prototype.replace,
                property_name,
                [integer_tuple_cleanup, ''],
            )
            parts = runtime.reflect.apply(
                runtime.string_class.prototype.split,
                property_name,
                [','],
            )
            indices = []
            for part in parts:
                indices.append(runtime.number(part))
            return target.__getitem__(runtime.math_tuple(indices))
        if runtime.strict_equal(property_name, 'length'):
            return target.__len__()
        if runtime.strict_equal(property_name, 'slice'):
            existing_slice = runtime.reflect.get(
                target, property_name, receiver)
            if _internal_type_is(
                runtime.jstype(existing_slice), 'function'
            ):
                return existing_slice

            def slice_items(
                start: Any = runtime.undefined,
                stop: Any = runtime.undefined,
            ) -> list[Any]:
                length = target.__len__()
                if start is runtime.undefined:
                    start = 0
                else:
                    start = int(start)
                    if start < 0:
                        start = max(length + start, 0)
                    else:
                        start = min(start, length)
                if stop is runtime.undefined:
                    stop = length
                else:
                    stop = int(stop)
                    if stop < 0:
                        stop = max(length + stop, 0)
                    else:
                        stop = min(stop, length)
                return [
                    target.__getitem__(index)
                    for index in range(start, stop)
                ]

            return slice_items
        value = runtime.reflect.get(target, property_name, receiver)
        # Sequence classes are exposed through a Proxy.  Their ordinary
        # baselib constructor may already have bound a method to the raw
        # target; rebind that method to the public proxy so returning ``self``
        # preserves Python object identity.
        if (
            _internal_type_is(runtime.jstype(value), 'function')
            and runtime.reflect.get(value, '__self__') is target
        ):
            unbound = runtime.reflect.get(value, '__func__')
            if _internal_type_is(runtime.jstype(unbound), 'function'):
                value = runtime.reflect.apply(
                    runtime.function_class.prototype.bind,
                    unbound,
                    [receiver],
                )
                runtime.object.assign(
                    value,
                    runtime.reflect.get(target, property_name),
                )
                runtime.reflect.set(value, '__func__', unbound)
                runtime.reflect.set(value, '__self__', receiver)
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

    handler = runtime.object.create(None)
    runtime.reflect.set(handler, 'get', get_item)
    runtime.reflect.set(handler, 'set', set_item)
    return runtime.reflect.construct(
        runtime.proxy_class,
        [instance, handler],
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

    runtime.reflect.set(
        class_repr, '__sagejs_internal_class_repr__', True)

    descriptor = runtime.object.create(None)
    runtime.reflect.set(descriptor, 'configurable', True)
    runtime.reflect.set(descriptor, 'value', class_repr)
    runtime.object.defineProperty(wrapper, '__repr__', descriptor)


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

    handler = runtime.object.create(None)
    runtime.reflect.set(handler, 'apply', call_class)
    runtime.reflect.set(handler, 'construct', construct_class)
    wrapper = runtime.reflect.construct(
        runtime.proxy_class,
        [target, handler],
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

        # Host functions have configurable own ``name`` and ``length``
        # properties.  They are representation details here: retaining them
        # would shadow Python properties or attributes with those perfectly
        # ordinary names on callable instances (pytest's MarkDecorator uses
        # ``name`` directly).
        runtime.reflect.deleteProperty(callable_instance, 'name')
        runtime.reflect.deleteProperty(callable_instance, 'length')
        runtime.object.setPrototypeOf(
            callable_instance, target_class.prototype)
        # Callable Python instances are represented by host functions so that
        # ordinary positional calls stay cheap.  Keep an explicit marker: a
        # host ``typeof value === 'function'`` check alone cannot distinguish
        # these adapters from real Python functions when keyword arguments
        # must be matched against ``value.__call__``.
        runtime.reflect.set(
            callable_instance, '__sagejs_callable_instance__', True)
        # A host function is only the representation of this Python object;
        # its Python type remains the callable class.  This makes ``type(x)``
        # and ``x.__class__(...)`` behave normally for objects such as
        # Pluggy's TagTracerSub.
        # JavaScript passes the Proxy's hidden target to apply/construct
        # traps, but Python identity must use the public class object.  This
        # preserves CPython's exact ``type(C()) is C`` guarantee.
        runtime.reflect.set(
            callable_instance, '__python_type__', wrapper)
        for function_member in ['apply', 'bind', 'call']:
            runtime.reflect.set(
                callable_instance,
                function_member,
                runtime.reflect.get(
                    runtime.function_class.prototype,
                    function_member,
                ),
            )
        bind_methods = _internal_get_member(
            target_class.prototype, '__bind_methods__')
        if _internal_type_is(
            runtime.jstype(bind_methods), 'function'
        ):
            runtime.reflect.apply(
                bind_methods, callable_instance, [])
        initializer = _internal_get_member(
            target_class.prototype, '__init__')
        if _internal_type_is(
            runtime.jstype(initializer), 'function'
        ):
            if _internal_get_member(
                initializer, '__python_descriptor__'
            ) is True:
                initializer_args = [callable_instance]
                for argument in call_args:
                    initializer_args.append(argument)
                runtime.reflect.apply(
                    initializer, runtime.undefined, initializer_args)
            else:
                runtime.reflect.apply(
                    initializer, callable_instance, call_args)
        if (
            runtime.strict_equal(
                _internal_get_member(
                    callable_instance, '__sagejs_sequence_proxy__'),
                True,
            )
            and _internal_member_is_function(
                callable_instance, '__getitem__')
            and _internal_member_is_function(
                callable_instance, '__len__')
        ):
            return ρσ_sequence_proxy(callable_instance)
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

    handler = runtime.object.create(None)
    runtime.reflect.set(handler, 'apply', call_class)
    runtime.reflect.set(handler, 'construct', construct_class)
    wrapper = runtime.reflect.construct(
        runtime.proxy_class,
        [target, handler],
    )
    runtime.reflect.set(
        wrapper, '__sagejs_callable_instance_class__', True)
    target.prototype.constructor = wrapper
    _internal_set_class_repr(wrapper, target)
    return wrapper


def ρσ_in(value: Any, container: Any) -> bool:
    if _internal_type_is(runtime.jstype(container), 'string'):
        if not _internal_type_is(runtime.jstype(value), 'string'):
            raise TypeError(
                "'in <string>' requires string as left operand")
        return container.indexOf(value) != -1
    if _internal_member_is_function(container, '__contains__'):
        return bool(_internal_call_member(
            container, '__contains__', [value]))
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
        python_iterator = _internal_get_member(iterable, '__iter__')
        if _internal_get_member(
            python_iterator, '__python_descriptor__'
        ) is True:
            return _internal_call_member(iterable, '__iter__', [])
        return iterable
    python_iterator = _internal_get_member(iterable, '__iter__')
    if _internal_get_member(
        python_iterator, '__python_descriptor__'
    ) is True:
        return _internal_call_member(iterable, '__iter__', [])
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
            keys = _internal_call_member(source, 'keys', [])
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
                answer[key] = _internal_call_member(
                    source, '__getitem__', [key])
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
    if (
        not _internal_type_is(runtime.jstype(target_function), 'function')
        or _internal_get_member(
            target_function, '__sagejs_callable_instance__') is True
    ):
        receiver = target_function
        target_function = runtime.reflect.apply(
            runtime.reflect.get(runtime.global_object, 'ρσ_getattr'),
            runtime.undefined,
            [target_function, '__call__'],
        )
    elif (
        not _internal_get_member(target_function, '__argnames__')
        and not _internal_get_member(target_function, '__kwonly__')
        and _internal_get_member(
            target_function, '__sagejs_callable_instance_class__') is not True
    ):
        # Descriptor lookup can expose a callable-instance adapter as another
        # host function (for example ``pytest.hookimpl``).  Such an adapter has
        # no meaningful signature of its own; its bound ``__call__`` method
        # carries the Python keyword metadata.
        callable_method = runtime.reflect.apply(
            runtime.reflect.get(runtime.global_object, 'ρσ_getattr'),
            runtime.undefined,
            [target_function, '__call__', None],
        )
        if (
            callable_method is not None
            and (
                _internal_get_member(callable_method, '__argnames__')
                or _internal_get_member(callable_method, '__kwonly__')
            )
        ):
            receiver = target_function
            target_function = callable_method
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
        call_args[argument_count] = keyword_object
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
    if (
        not _internal_type_is(runtime.jstype(target_function), 'function')
        or _internal_get_member(
            target_function, '__sagejs_callable_instance__') is True
    ):
        receiver = target_function
        target_function = runtime.reflect.apply(
            runtime.reflect.get(runtime.global_object, 'ρσ_getattr'),
            runtime.undefined,
            [target_function, '__call__'],
        )
    elif (
        not _internal_get_member(target_function, '__argnames__')
        and _internal_get_member(
            target_function, '__sagejs_callable_instance_class__') is not True
    ):
        callable_method = runtime.reflect.apply(
            runtime.reflect.get(runtime.global_object, 'ρσ_getattr'),
            runtime.undefined,
            [target_function, '__call__', None],
        )
        if (
            callable_method is not None
            and _internal_get_member(callable_method, '__argnames__')
        ):
            receiver = target_function
            target_function = callable_method
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
        call_args[argument_count] = keyword_object
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
        result = runtime.reflect.apply(
            target_function, receiver, supplied_args)
    else:
        result = ρσ_interpolate_kwargs(
            receiver, target_function, supplied_args)
    if (
        result is not None
        and result is not runtime.undefined
        and (
            runtime.strict_equal(runtime.jstype(result), 'object')
            or runtime.strict_equal(runtime.jstype(result), 'function')
        )
    ):
        return result
    return receiver


def ρσ_interpolate_kwargs_constructor_legacy(
    receiver: Any,
    use_apply: bool,
    target_function: Any,
    supplied_args: Any,
) -> Any:
    if use_apply:
        result = runtime.reflect.apply(
            target_function, receiver, supplied_args)
    else:
        result = ρσ_interpolate_kwargs_legacy(
            receiver, target_function, supplied_args)
    if (
        result is not None
        and result is not runtime.undefined
        and (
            runtime.strict_equal(runtime.jstype(result), 'object')
            or runtime.strict_equal(runtime.jstype(result), 'function')
        )
    ):
        return result
    return receiver


def _internal_native_getitem(value: Any, key: Any) -> Any:
    """Read a JavaScript property, boxing non-null primitives as JS does."""
    if value is None or value is runtime.undefined:
        raise TypeError('object is not subscriptable')
    return runtime.native_get(value, key)


def ρσ_type_union(left: Any, right: Any) -> Any:
    union_values = []
    for value in [left, right]:
        if _internal_get_member(value, '__sagejs_union_type__') is True:
            for argument in _internal_get_member(value, '__args__'):
                if argument not in union_values:
                    union_values.push(argument)  # type: ignore[attr-defined]
        elif value not in union_values:
            union_values.push(value)  # type: ignore[attr-defined]
    union = runtime.object.create(None)
    runtime.reflect.set(union, '__sagejs_union_type__', True)
    runtime.reflect.set(union, '__args__', runtime.math_tuple(union_values))

    def union_or(other: Any) -> Any:
        return ρσ_type_union(union, other)

    def union_ror(other: Any) -> Any:
        return ρσ_type_union(other, union)

    runtime.reflect.set(union, '__or__', union_or)
    runtime.reflect.set(union, '__ror__', union_ror)
    return union


def ρσ_match_pattern(subject: Any, pattern: Any) -> Any:
    """Return structural-pattern captures, or ``None`` when it does not match.

    The compiler represents patterns as small tagged lists.  Keeping the
    matching rules here gives every backend the same semantics and avoids
    expanding nested class/OR patterns into large JavaScript condition trees.
    Assertion rewriting is deliberately independent of this helper.
    """
    captures = {}

    def merge(destination: Any, source: Any) -> None:
        for name in runtime.object.keys(source):
            runtime.reflect.set(
                destination, name, runtime.native_get(source, name))

    def match(value: Any, descriptor: Any, bindings: Any) -> bool:
        kind = descriptor[0]
        if kind == 'wildcard':
            return True
        if kind == 'capture':
            runtime.reflect.set(bindings, descriptor[1], value)
            return True
        if kind == 'as':
            nested = {}
            if not match(value, descriptor[1], nested):
                return False
            merge(bindings, nested)
            runtime.reflect.set(bindings, descriptor[2], value)
            return True
        if kind == 'value':
            return value == descriptor[1]
        if kind == 'or':
            for alternative in descriptor[1]:
                nested = {}
                if match(value, alternative, nested):
                    merge(bindings, nested)
                    return True
            return False
        if kind == 'sequence':
            if not isinstance(value, (list, tuple)):
                return False
            parts = descriptor[1]
            if len(value) != len(parts):
                return False
            nested = {}
            for index in range(len(parts)):
                if not match(value[index], parts[index], nested):
                    return False
            merge(bindings, nested)
            return True
        if kind == 'class':
            expected = descriptor[1]
            if not isinstance(value, expected):
                return False
            positional = descriptor[2]
            keywords = descriptor[3]
            match_args = getattr(expected, '__match_args__', ())
            if len(positional) > len(match_args):
                raise TypeError(
                    f'{getattr(expected, "__name__", expected)!r} accepts '
                    f'{len(match_args)} positional sub-patterns '
                    f'({len(positional)} given)')
            nested = {}
            try:
                for index in range(len(positional)):
                    if not match(
                        getattr(value, match_args[index]),
                        positional[index],
                        nested,
                    ):
                        return False
                for entry in keywords:
                    if not match(
                        getattr(value, entry[0]), entry[1], nested
                    ):
                        return False
            except AttributeError:
                return False
            merge(bindings, nested)
            return True
        raise RuntimeError(f'unknown structural pattern kind {kind!r}')

    return captures if match(subject, pattern, captures) else None


def ρσ_generic_alias(origin: Any, type_arguments: Any) -> Any:
    alias = runtime.object.create(None)
    runtime.reflect.set(alias, '__origin__', origin)
    runtime.reflect.set(
        alias,
        '__args__',
        type_arguments
        if runtime.array.isArray(type_arguments)
        else runtime.math_tuple([type_arguments]),
    )

    def alias_or(other: Any) -> Any:
        return ρσ_type_union(alias, other)

    def alias_ror(other: Any) -> Any:
        return ρσ_type_union(other, alias)

    runtime.reflect.set(alias, '__or__', alias_or)
    runtime.reflect.set(alias, '__ror__', alias_ror)
    return alias


def ρσ_getitem(value: Any, key: Any) -> Any:
    # ``__class_getitem__`` is commonly a classmethod inherited from an ABC.
    # Use Python descriptor lookup so the defining class does not accidentally
    # become the receiver when a subclass is subscribed.
    class_getitem = getattr(
        value, '__class_getitem__', None)
    if _internal_type_is(runtime.jstype(class_getitem), 'function'):
        bound_receiver = runtime.reflect.get(class_getitem, '__self__')
        receiver = (
            value
            if bound_receiver is runtime.undefined
            else bound_receiver
        )
        return runtime.reflect.apply(
            class_getitem, receiver, [key])
    if (
        value is runtime.list_constructor
        or value is runtime.tuple_builtin
        or value is runtime.string_builtin
        or value is runtime.int_builtin
        or value is runtime.reflect.get(runtime.global_object, 'ρσ_dict')
        or value is runtime.reflect.get(runtime.global_object, 'ρσ_set')
        or value is runtime.reflect.get(runtime.global_object, 'ρσ_frozenset')
        or value is runtime.reflect.get(runtime.global_object, 'ρσ_type')
    ):
        return ρσ_generic_alias(value, key)
    # Native lists and tuples are JavaScript arrays.  Keep their overwhelmingly
    # common integer-index path monomorphic instead of performing reflective
    # special-method discovery for every access in a Python loop.
    if runtime.array.isArray(value):
        key_type = runtime.jstype(key)
        integer_index = True
        if _internal_type_is(key_type, 'boolean'):
            key = 1 if key else 0
        elif _internal_type_is(key_type, 'bigint'):
            if key < -value.length or key >= value.length:
                raise IndexError('index out of range')
            key = runtime.number(key)
        elif _internal_type_is(key_type, 'number'):
            if not runtime.number.isInteger(key):
                raise TypeError(
                    'sequence indices must be integers or slices')
        else:
            integer_index = False
        if integer_index:
            if key < 0:
                key += value.length
            if key < 0 or key >= value.length:
                raise IndexError('index out of range')
            return _internal_native_getitem(value, key)
    if _internal_member_is_function(value, '__getitem__'):
        return _internal_call_member(value, '__getitem__', [key])
    if _internal_get_member(key, '__sagejs_slice__'):
        indices = runtime.reflect.apply(
            _internal_get_member(key, 'indices'),
            key,
            [value.length],
        )
        answer = []
        for index in range(indices[0], indices[1], indices[2]):
            runtime.reflect.apply(
                runtime.array.prototype.push,
                answer,
                [value[index]],
            )
        if _internal_type_is(runtime.jstype(value), 'string'):
            return runtime.reflect.apply(
                runtime.reflect.get(answer, 'join'), answer, [''])
        if (
            runtime.array.isArray(value)
            and runtime.object.isFrozen(value)
        ):
            return runtime.math_tuple(answer)
        return answer
    if _internal_get_member(
        value, 'ρσ_object_id'
    ) is not runtime.undefined and not runtime.arraylike(value):
        raise TypeError('object is not subscriptable')
    if runtime.arraylike(value):
        key_type = runtime.jstype(key)
        if _internal_type_is(key_type, 'boolean'):
            key = 1 if key else 0
        elif _internal_type_is(key_type, 'bigint'):
            if key < -value.length or key >= value.length:
                raise IndexError('index out of range')
            key = runtime.number(key)
        elif (
            not _internal_type_is(key_type, 'number')
            or not runtime.number.isInteger(key)
        ):
            raise TypeError('sequence indices must be integers or slices')
        if key < 0:
            key += value.length
        if key < 0 or key >= value.length:
            raise IndexError('index out of range')
        return _internal_native_getitem(value, key)
    if _internal_type_is(runtime.jstype(key), 'number') and key < 0:
        key += value.length
    return _internal_native_getitem(value, key)


def ρσ_setitem(value: Any, key: Any, member: Any) -> None:
    # See the matching read fast path above.  Preserve the existing assignment
    # behavior (including JavaScript's frozen-array TypeError for tuples).
    if (
        runtime.array.isArray(value)
        and _internal_type_is(runtime.jstype(key), 'number')
        and runtime.number.isInteger(key)
    ):
        if runtime.object.isFrozen(value):
            raise TypeError('tuple object does not support item assignment')
        if key < 0:
            key += value.length
        runtime.reflect.set(value, key, member)
        return
    if _internal_member_is_function(value, '__setitem__'):
        _internal_call_member(value, '__setitem__', [key, member])
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
    runtime.reflect.set(value, key, member)


def ρσ_delitem(value: Any, key: Any) -> None:
    if _internal_member_is_function(value, '__delitem__'):
        _internal_call_member(value, '__delitem__', [key])
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


def ρσ_compute_mro(cls: Any, bases: Any) -> Any:
    """Return the C3 linearization for a newly created Python class."""
    sequences = []
    for base in bases:
        inherited = _internal_get_member(base, '__mro__')
        sequence = []
        if inherited is runtime.undefined:
            sequence.push(base)  # type: ignore[attr-defined]
        else:
            for item in inherited:
                sequence.push(item)  # type: ignore[attr-defined]
        sequences.push(sequence)  # type: ignore[attr-defined]
    direct_bases = []
    for base in bases:
        direct_bases.push(base)  # type: ignore[attr-defined]
    sequences.push(direct_bases)  # type: ignore[attr-defined]

    result = [cls]
    while True:
        active_sequences = []
        for sequence in sequences:
            if sequence.length:  # type: ignore[attr-defined]
                active_sequences.push(sequence)  # type: ignore[attr-defined]
        sequences = active_sequences
        if not sequences.length:  # type: ignore[attr-defined]
            return runtime.object.freeze(result)

        candidate = runtime.undefined
        for sequence in sequences:
            head = sequence[0]
            blocked = False
            for other in sequences:
                first = True
                for item in other:
                    if first:
                        first = False
                        continue
                    if item is head:
                        blocked = True
                        break
                if blocked:
                    break
            if not blocked:
                candidate = head
                break

        if candidate is runtime.undefined:
            raise TypeError(
                'Cannot create a consistent method resolution order (MRO)')
        result.push(candidate)  # type: ignore[attr-defined]
        for sequence in sequences:
            if sequence and sequence[0] is candidate:
                sequence.shift()  # type: ignore[attr-defined]


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
        '__mro__',
        'constructor',
        '__class__',
    ]
    for name in skipped:
        seen[name] = True

    resolved_properties = {}
    target = classes[0].prototype
    primary_prototype = runtime.object.getPrototypeOf(target)
    python_type_prototype = _internal_get_member(type, 'prototype')
    for class_index in range(1, len(classes)):
        secondary_prototype = _internal_get_member(
            classes[class_index], 'prototype')
        if secondary_prototype is runtime.undefined:
            raise TypeError('bases must be types')
        if (
            classes[class_index] is runtime.tuple_builtin
            and primary_prototype is python_type_prototype
        ):
            raise TypeError(
                'multiple bases have instance lay-out conflict')

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

    mixed_tuple_secondary = False
    for class_index in range(1, len(classes)):
        if classes[class_index] is not runtime.tuple_builtin:
            continue
        tuple_initializer = classes[class_index].prototype.__init__
        original_initializer = target.__init__
        target.__init__ = tuple_mixin_initializer(
            tuple_initializer, original_initializer)
        mixed_tuple_secondary = True
        break
    if not mixed_tuple_secondary:
        prototype = target
        tuple_prototype = runtime.reflect.get(
            runtime.tuple_builtin, 'prototype')
        primary_is_tuple = False
        while prototype and prototype is not runtime.object.prototype:
            if prototype is tuple_prototype:
                primary_is_tuple = True
                break
            prototype = runtime.object.getPrototypeOf(prototype)
        if primary_is_tuple:
            for class_index in range(1, len(classes)):
                secondary_initializer = runtime.reflect.get(
                    runtime.reflect.get(
                        classes[class_index], 'prototype'),
                    '__init__',
                )
                if runtime.strict_equal(
                    runtime.jstype(secondary_initializer),
                    'function',
                ):
                    target.__init__ = tuple_mixin_initializer(
                        target.__init__,
                        secondary_initializer,
                    )
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


def ρσ_instanceof_one(value: Any, candidate: Any) -> bool:
    """Test one ``isinstance`` candidate without a variadic call frame."""
    value_type = runtime.jstype(value)
    if _internal_get_member(candidate, '__sagejs_union_type__') is True:
        for nested_candidate in _internal_get_member(candidate, '__args__'):
            if ρσ_instanceof_one(value, nested_candidate):
                return True
        return False
    if (
        runtime.array.isArray(candidate)
        and runtime.object.isFrozen(candidate)
    ):
        for nested_candidate in candidate:
            if ρσ_instanceof_one(value, nested_candidate):
                return True
        return False
    if _internal_get_member(candidate, '__sagejs_module_type__') is True:
        module_namespaces = runtime.reflect.get(
            runtime.global_object, '__sagejs_module_namespaces__')
        if module_namespaces is not runtime.undefined:
            has_module = runtime.reflect.get(module_namespaces, 'has')
            if runtime.reflect.apply(
                has_module, module_namespaces, [value]
            ):
                return True
    # Check the native representations of Python's fundamental types before
    # inspecting constructors and prototype chains.  In particular, numeric
    # libraries make ``isinstance(x, int_types)`` a very hot operation and
    # JavaScript primitives have no useful Python inheritance metadata to
    # discover.
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
            _internal_type_is(value_type, 'string')
            or runtime.instance_of(
                value, runtime.string_class)
        )
    ):
        return True
    if (
        candidate is runtime.bool_builtin
        and _internal_type_is(value_type, 'boolean')
    ):
        return True
    if (
        candidate is runtime.int_builtin
        and (
            _internal_type_is(value_type, 'bigint')
            or _internal_type_is(value_type, 'boolean')
            or (
                _internal_type_is(value_type, 'number')
                and runtime.number.isInteger(value)
            )
        )
    ):
        return True
    if (
        candidate is runtime.float_builtin
        and _internal_type_is(value_type, 'number')
        and not runtime.number.isInteger(value)
    ):
        return True
    if (
        _internal_type_is(runtime.jstype(candidate), 'function')
        and runtime.instance_of(value, candidate)
        # JavaScript represents both Python functions and Python classes
        # with native Function objects.  ``types.FunctionType`` is the
        # native Function constructor, but CPython does not consider a
        # class to be a function. Python classes have their own
        # ``__bases__`` marker on the constructor; checking the prototype
        # would misclassify ordinary functions when that name is inherited.
        and not (
            candidate is runtime.function_class
            and _internal_type_is(value_type, 'function')
            and runtime.reflect.apply(
                runtime.object.prototype.hasOwnProperty,
                value,
                ['__bases__'],
            )
        )
    ):
        return True
    # Some Python runtime types (notably ``function``) are represented by
    # callable adapters rather than JavaScript constructors. Check their
    # explicit marker after the native class path, which handles ordinary
    # user-defined classes without another property lookup.
    if candidate is _internal_get_member(value, '__python_type__'):
        return True
    if (
        candidate is type
        and _internal_type_is(value_type, 'function')
        and runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            value,
            ['__bases__'],
        )
    ):
        return True
    registry = _internal_get_member(candidate, '_abc_registry')
    if not runtime.array.isArray(registry):
        candidate_prototype = _internal_get_member(candidate, 'prototype')
        registry = _internal_get_member(
            candidate_prototype, '_abc_registry')
    if not runtime.array.isArray(registry):
        candidate_mro = _internal_get_member(candidate, '__mro__')
        if candidate_mro is not runtime.undefined:
            for candidate_base in candidate_mro:
                base_prototype = _internal_get_member(
                    candidate_base, 'prototype')
                registry = _internal_get_member(
                    base_prototype, '_abc_registry')
                if runtime.array.isArray(registry):
                    break
    if runtime.array.isArray(registry):
        for registered_class in registry:
            if ρσ_instanceof_one(value, registered_class):
                return True
    # Only user-defined classes need the Python multiple-inheritance walk.
    # Deferring it until every direct test has failed avoids allocating a
    # temporary list and boxing primitives on the common path.
    constructor = _internal_get_member(value, 'constructor')
    prototype = _internal_get_member(constructor, 'prototype')
    if prototype is runtime.undefined:
        return False
    # The JavaScript prototype chain can represent only the primary base.
    # Metaclass rebuilding and mixin copying also make a hand-walk through
    # ``prototype.__bases__`` less authoritative than Python's computed C3
    # linearization.  Use the class MRO first; this is precisely the semantic
    # relation that ``isinstance`` is required to answer.
    mro = _internal_get_member(constructor, '__mro__')
    if mro is not runtime.undefined:
        for base in mro:
            if candidate is base:
                return True
    bases = _internal_get_member(prototype, '__bases__')
    if not bases:
        return False
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


def ρσ_instanceof(value: Any, *candidates: Any) -> bool:
    """Variadic compatibility entry point used for literal type tuples."""
    for candidate in candidates:
        if ρσ_instanceof_one(value, candidate):
            return True
    return False
