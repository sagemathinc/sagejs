"""Python string behavior for the Sage.js runtime."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_Str = str
WHITESPACE = ' \t\n\r\x0b\x0c'
_NATIVE_REPLACE = runtime.string_class.prototype.replace
_NATIVE_SPLIT = runtime.string_class.prototype.split


def _value_type_is(value: Any, expected: _Str) -> bool:
    return runtime.strict_equal(runtime.jstype(value), expected)


def _native_string(value: Any) -> _Str:
    return runtime.string(value)


def _string_call(value: Any, name: _Str, *call_args: Any) -> Any:
    return runtime.reflect.apply(
        runtime.reflect.get(runtime.string_class.prototype, name),
        value,
        call_args,
    )


def _index_of(value: Any, needle: Any, start: Any = 0) -> int:
    return _string_call(value, 'indexOf', needle, start)


def _lower(value: Any) -> _Str:
    return _string_call(value, 'toLowerCase')


def _upper(value: Any) -> _Str:
    return _string_call(value, 'toUpperCase')


def _native_replace(
    string: Any, pattern: Any, replacement: Any,
) -> _Str:
    return runtime.reflect.apply(
        _NATIVE_REPLACE, string, [pattern, replacement])


def _native_split(string: Any, separator: Any) -> Any:
    return runtime.reflect.apply(
        _NATIVE_SPLIT, string, [separator])


def _string_tag(value: Any) -> _Str:
    return runtime.reflect.apply(
        runtime.object.prototype.toString, value, []
    ).slice(8, -1)


def _repr_js_builtin(value: Any, as_array: bool = False) -> _Str:
    entries = []
    brackets = '[]' if as_array else '{}'
    if as_array:
        for item in value:
            entries.append(ρσ_repr(item))
    else:
        for key in runtime.object.keys(value):
            entries.append(ρσ_repr(key) + ': ' + ρσ_repr(value[key]))
    return brackets[0] + _str_join(', ', entries) + brackets[1]


def _repr_python_string(value: _Str) -> _Str:
    quote = "'"
    if "'" in value and '"' not in value:
        quote = '"'
    answer = quote
    digits = '0123456789abcdef'
    for character in value:
        if character == '\\' or character == quote:
            answer += '\\' + character
            continue
        if character == '\t':
            answer += r'\t'
            continue
        if character == '\n':
            answer += r'\n'
            continue
        if character == '\r':
            answer += r'\r'
            continue
        code = _string_call(character, 'charCodeAt', 0)
        if code < 32 or code == 127:
            answer += (
                r'\x' + digits[(code >> 4) & 15]
                + digits[code & 15]
            )
        else:
            answer += character
    return answer + quote


def ρσ_repr(value: Any) -> _Str:
    if value is None:
        return 'None'
    if value is runtime.undefined:
        return 'None'
    representation = value
    repr_method = runtime.reflect.get(
        runtime.reflect.apply(
            runtime.object, runtime.undefined, [value]),
        '__repr__',
    )
    if _value_type_is(repr_method, 'function'):
        representation = runtime.reflect.apply(
            repr_method, value, [])
    elif value is True or value is False:
        representation = 'True' if value else 'False'
    elif runtime.array.isArray(value):
        representation = _repr_js_builtin(value, True)
    elif _value_type_is(value, 'string'):
        representation = _repr_python_string(value)
    elif _value_type_is(value, 'function'):
        representation = value.toString()
    elif _value_type_is(value, 'object'):
        if runtime.reflect.get(value, 'toString') is runtime.undefined:
            representation = _repr_js_builtin(value)
        else:
            name = _string_tag(value)
            if name == 'Generator':
                generator_name = runtime.reflect.get(value, '__qualname__')
                if not _value_type_is(generator_name, 'string'):
                    generator_name = '<anonymous>'
                return '<generator object ' + generator_name + '>'
            typed_arrays = (
                'Int8Array Uint8Array Uint8ClampedArray '
                'Int16Array Uint16Array Int32Array Uint32Array '
                'Float32Array Float64Array'
            )
            if name in typed_arrays:
                entries = []
                for item in value:
                    entries.append(string_format('0x{:02x}', item))
                return name + '([' + _str_join(', ', entries) + '])'
            representation = value.toString()
            if representation == '[object Object]':
                return _repr_js_builtin(value)
            try:
                representation = runtime.json.stringify(value)
            except Exception:
                pass
    return _native_string(representation)


def ρσ_str(
    value: Any = '',
    encoding: Any = runtime.undefined,
    errors: Any = runtime.undefined,
    *extra: Any,
) -> _Str:
    if len(extra):
        raise TypeError('str() takes at most 3 arguments')
    if encoding is not runtime.undefined:
        decoder = runtime.reflect.get(value, 'decode')
        if not _value_type_is(decoder, 'function'):
            raise TypeError('decoding to str requires a bytes-like object')
        call_args = [encoding]
        if errors is not runtime.undefined:
            call_args.append(errors)
        return runtime.reflect.apply(decoder, value, call_args)
    if errors is not runtime.undefined:
        raise TypeError('errors without a string argument')
    if value is None:
        return 'None'
    if value is runtime.undefined:
        return 'None'
    boxed = runtime.reflect.apply(
        runtime.object, runtime.undefined, [value])
    str_method = runtime.reflect.get(boxed, '__str__')
    repr_method = runtime.reflect.get(boxed, '__repr__')
    if _value_type_is(str_method, 'function'):
        answer = runtime.reflect.apply(str_method, value, [])
    elif _value_type_is(repr_method, 'function'):
        answer = runtime.reflect.apply(repr_method, value, [])
    elif value is True or value is False:
        answer = 'True' if value else 'False'
    elif runtime.array.isArray(value):
        answer = _repr_js_builtin(value, True)
    elif runtime.reflect.get(boxed, 'toString') is not runtime.undefined:
        answer = runtime.reflect.apply(
            runtime.reflect.get(boxed, 'toString'), value, [])
        if answer == '[object Object]':
            answer = _repr_js_builtin(value)
    else:
        answer = _repr_js_builtin(value)
    return _native_string(answer)


def _js_options(**values: Any) -> Any:
    answer = runtime.object.create(None)
    for key in runtime.object.keys(values):
        answer[key] = values[key]
    return answer


def _grouped(value: Any, separator: _Str) -> _Str:
    answer = value.toLocaleString(
        runtime.undefined, _js_options(useGrouping=True))
    if separator == ',':
        return answer
    locale_separator = runtime.number(1234).toLocaleString()[1]
    return _native_replace(answer, locale_separator, separator)


def _fixed(value: Any, precision: int, separator: _Str) -> _Str:
    if not separator:
        return value.toFixed(precision)
    return value.toLocaleString(
        runtime.undefined,
        _js_options(
            useGrouping=True,
            minimumFractionDigits=precision,
            maximumFractionDigits=precision,
        ),
    )


def _repeat(text: _Str, count: int) -> _Str:
    if count <= 0:
        return ''
    return _string_call(text, 'repeat', count)


def _resolve_format_spec(specification: _Str, keywords: Any) -> _Str:
    pattern = runtime.regexp(r'[{]([a-zA-Z0-9_]+)[}]', 'g')

    def replace(_match: _Str, key: _Str) -> _Str:
        if not runtime.reflect.apply(
            runtime.object.prototype.hasOwnProperty,
            keywords,
            [key],
        ):
            return ''
        return _native_string(keywords[key])

    return _native_replace(specification, pattern, replace)


def _apply_formatting(
    original: Any,
    specification: _Str,
    keywords: Any,
) -> _Str:
    if _index_of(specification, '{') != -1:
        specification = _resolve_format_spec(specification, keywords)
    pattern = runtime.regexp(
        r'([^{}](?=[<>=^]))?([<>=^])?([-+ ])?(#)?(0)?'
        r'(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?'
    )
    match = _string_call(specification, 'match', pattern)
    if match is None:
        return _native_string(original)
    (
        fill,
        align,
        sign,
        alternate,
        zero_pad,
        width_text,
        grouping,
        precision_text,
        format_type
    ) = match[1:]

    if zero_pad:
        fill = fill or '0'
        align = align or '='
    else:
        fill = fill or ' '

    numeric_value = runtime.number(original)
    is_numeric = not runtime.is_nan(numeric_value)
    precision = runtime.parse_int(precision_text, 10)
    lower_type = _lower(format_type or '')
    value = original

    if format_type == 'n':
        if grouping:
            raise ValueError("Cannot specify ',' with 'n'")
        value = numeric_value.toLocaleString()
        is_numeric = True
    elif lower_type in ('b', 'c', 'd', 'o', 'x'):
        value = runtime.parse_int(original, 10)
        is_numeric = True
        if lower_type == 'b':
            value = value.toString(2)
            if alternate:
                value = '0b' + value
        elif lower_type == 'c':
            value = runtime.string_class.fromCodePoint(value)
        elif lower_type == 'd':
            if grouping:
                value = _grouped(value, grouping)
            else:
                value = value.toString(10)
        elif lower_type == 'o':
            value = value.toString(8)
            if alternate:
                value = '0o' + value
        else:
            value = value.toString(16)
            if format_type == 'x':
                value = value.toLowerCase()
            else:
                value = value.toUpperCase()
            if alternate:
                value = '0x' + value
    elif lower_type in ('e', 'f', 'g', '%'):
        is_numeric = True
        value = runtime.parse_float(original)
        digits = 6 if runtime.is_nan(precision) else precision
        if lower_type == 'e':
            value = value.toExponential(digits)
            if format_type == 'E':
                value = value.toUpperCase()
            else:
                value = value.toLowerCase()
        elif lower_type == 'f':
            value = _fixed(value, digits, grouping)
            if format_type == 'F':
                value = _upper(value)
        elif lower_type == '%':
            value *= 100
            value = _fixed(value, digits, grouping) + '%'
        else:
            digits = max(1, digits)
            exponent = runtime.parse_int(
                _native_split(
                    value.toExponential(digits - 1).toLowerCase(),
                    'e',
                )[1],
                10,
            )
            if -4 <= exponent < digits:
                value = _fixed(
                    value, digits - 1 - exponent, grouping)
            else:
                value = value.toExponential(digits - 1)
            value = _native_replace(
                value, runtime.regexp(r'0+$', 'g'), '')
            if value[-1] in '.,':
                value = value[:-1]
            if format_type == 'G':
                value = _upper(value)
    else:
        if lower_type == 's':
            is_numeric = False
        if grouping:
            value = runtime.parse_int(value, 10)
            if runtime.is_nan(value):
                raise ValueError('Must use numbers with , or _')
            value = _grouped(value, grouping)
        value = _native_string(value)
        if not runtime.is_nan(precision):
            value = value[:precision]

    align = align or ('>' if is_numeric else '<')
    value = _native_string(value)
    if is_numeric and sign:
        number_value = runtime.number(value)
        if not runtime.is_nan(number_value) and number_value >= 0:
            if sign in (' ', '+'):
                value = sign + value

    if is_numeric and width_text and width_text[0] == '0':
        width_text = width_text[1:]
        fill, align = '0', '='
    width = runtime.parse_int(width_text or '-1', 10)
    if runtime.is_nan(width):
        raise ValueError(
            'Invalid width specification: ' + width_text)

    if fill and len(value) < width:
        padding = width - len(value)
        if align == '<':
            value += _repeat(fill, padding)
        elif align == '>':
            value = _repeat(fill, padding) + value
        elif align == '^':
            left = padding // 2
            value = (
                _repeat(fill, left)
                + value
                + _repeat(fill, padding - left)
            )
        elif align == '=':
            if value[0] in '+- ':
                value = (
                    value[0] + _repeat(fill, padding) + value[1:]
                )
            else:
                value = _repeat(fill, padding) + value
        else:
            raise ValueError('Unrecognized alignment: ' + align)
    return value


def _resolve_field(path: _Str, value: Any) -> Any:
    position = 0
    while position < len(path):
        marker = path[position]
        position += 1
        end = position
        if marker == '[':
            while end < len(path) and path[end] != ']':
                end += 1
            key = path[position:end]
            value = value[key]
            position = end + 1
        else:
            while (
                end < len(path)
                and path[end] not in '.['
            ):
                end += 1
            key = path[position:end]
            value = getattr(value, key)
            position = end
    return value


def string_format(
    template: Any,
    *format_args: Any,
    **keywords: Any,
) -> _Str:
    if template is runtime.undefined:
        raise TypeError('Template is required')
    template = _native_string(template)
    automatic = False
    manual = False
    next_index = 0

    def render(markup: _Str) -> _Str:
        nonlocal automatic, manual, next_index
        conversion = ''
        specification = ''
        field = markup
        bang = _str_find(field, '!')
        colon = _str_find(field, ':')
        split_at = len(field)
        if bang != -1:
            split_at = min(split_at, bang)
        if colon != -1:
            split_at = min(split_at, colon)
        key = field[:split_at]
        if bang != -1:
            end = colon if colon != -1 else len(field)
            conversion = field[bang + 1:end]
        if colon != -1:
            specification = field[colon + 1:]
        if conversion and conversion not in ('a', 'r', 's'):
            raise ValueError(
                'Unknown conversion specifier: ' + conversion)

        show_key = _string_call(key, 'endsWith', '=')
        if show_key:
            key = key[:-1]
        root_end = 0
        while root_end < len(key) and key[root_end] not in '.[':
            root_end += 1
        root = key[:root_end]
        if root:
            manual = True
            if automatic:
                raise ValueError(
                    'cannot switch from automatic field numbering '
                    'to manual field specification'
                )
            index = runtime.parse_int(root, 10)
            if runtime.is_nan(index):
                if not runtime.reflect.apply(
                    runtime.object.prototype.hasOwnProperty,
                    keywords,
                    [root],
                ):
                    raise KeyError(root)
                value = keywords[root]
            else:
                if index >= len(format_args):
                    raise IndexError(root)
                value = format_args[index]
            value = _resolve_field(key[root_end:], value)
        else:
            automatic = True
            if manual:
                raise ValueError(
                    'cannot switch from manual field specification '
                    'to automatic field numbering'
                )
            if next_index >= len(format_args):
                raise IndexError(
                    'Not enough arguments to match template: '
                    + template
                )
            value = format_args[next_index]
            next_index += 1
        if _value_type_is(value, 'function'):
            value = value()
        if conversion == 'r':
            answer = ρσ_repr(value)
        elif conversion == 's':
            answer = ρσ_str(value)
        else:
            answer = ρσ_str(value)
        if specification:
            answer = _apply_formatting(
                answer, specification, keywords)
        if show_key:
            answer = key + '=' + answer
        return answer

    answer = ''
    position = 0
    while position < len(template):
        character = template[position]
        if character == '{':
            if (
                position + 1 < len(template)
                and template[position + 1] == '{'
            ):
                answer += '{'
                position += 2
                continue
            depth = 1
            end = position + 1
            while end < len(template) and depth:
                if template[end] == '{':
                    depth += 1
                elif template[end] == '}':
                    depth -= 1
                end += 1
            if depth:
                raise ValueError("expected '}' before end of string")
            answer += render(template[position + 1:end - 1])
            position = end
            continue
        if (
            character == '}'
            and position + 1 < len(template)
            and template[position + 1] == '}'
        ):
            answer += '}'
            position += 2
            continue
        answer += character
        position += 1
    return answer


def _str_capitalize(string: Any) -> _Str:
    string = _native_string(string)
    if string:
        return _upper(string[0]) + _lower(string[1:])
    return string


def _str_center(string: Any, width: int, fill: _Str = ' ') -> _Str:
    string = _native_string(string)
    padding = max(0, width - len(string))
    left = padding // 2
    return _repeat(fill, left) + string + _repeat(fill, padding - left)


def _str_bounds(
    string: _Str,
    start: Any,
    end: Any,
) -> list[int]:
    if start is runtime.undefined or start is None:
        normalized_start = 0
    else:
        normalized_start = int(start)
        if normalized_start < 0:
            normalized_start = max(
                0, len(string) + normalized_start)
    if end is runtime.undefined or end is None:
        normalized_end = len(string)
    else:
        normalized_end = int(end)
        if normalized_end < 0:
            normalized_end = max(
                0, len(string) + normalized_end)
        else:
            normalized_end = min(len(string), normalized_end)
    return [normalized_start, normalized_end]


def _str_require_string(value: Any, method_name: _Str) -> _Str:
    if not _value_type_is(value, 'string'):
        raise TypeError(
            method_name + '() argument must be str')
    return value


def _str_count(
    string: Any,
    needle: _Str,
    start: int = 0,
    end: Any = runtime.undefined,
) -> int:
    string = _native_string(string)
    needle = _str_require_string(needle, 'count')
    start, stop = _str_bounds(string, start, end)
    if start > len(string) or stop < start:
        return 0
    if not needle:
        return stop - start + 1
    answer = 0
    position = start
    while position != -1:
        position = string.indexOf(needle, position)
        if position != -1 and position + len(needle) <= stop:
            answer += 1
            position += len(needle)
        else:
            break
    return answer


def _str_startswith(
    string: Any,
    prefixes: Any,
    start: int = 0,
    end: Any = runtime.undefined,
) -> bool:
    string = _native_string(string)
    if _value_type_is(prefixes, 'string'):
        prefixes = [prefixes]
    elif not runtime.array.isArray(prefixes):
        raise TypeError(
            'startswith first arg must be str or a tuple of str')
    start, stop = _str_bounds(string, start, end)
    if start > len(string):
        return False
    candidate = string.slice(start, stop)
    for prefix in prefixes:
        prefix = _str_require_string(prefix, 'startswith')
        if candidate.indexOf(prefix) == 0:
            return True
    return False


def _str_endswith(
    string: Any,
    suffixes: Any,
    start: int = 0,
    end: Any = runtime.undefined,
) -> bool:
    string = _native_string(string)
    if _value_type_is(suffixes, 'string'):
        suffixes = [suffixes]
    elif not runtime.array.isArray(suffixes):
        raise TypeError(
            'endswith first arg must be str or a tuple of str')
    start, stop = _str_bounds(string, start, end)
    if start > len(string):
        return False
    candidate = string.slice(start, stop)
    for suffix in suffixes:
        suffix = _str_require_string(suffix, 'endswith')
        if (
            len(suffix) <= len(candidate)
            and candidate.lastIndexOf(suffix)
            == len(candidate) - len(suffix)
        ):
            return True
    return False


def _str_find(
    string: Any,
    needle: _Str,
    start: int = 0,
    end: Any = runtime.undefined,
) -> int:
    string = _native_string(string)
    needle = _str_require_string(needle, 'find')
    start, stop = _str_bounds(string, start, end)
    if start > len(string) or stop < start:
        return -1
    answer = string.slice(start, stop).indexOf(needle)
    return -1 if answer == -1 else start + answer


def _str_rfind(
    string: Any,
    needle: _Str,
    start: int = 0,
    end: Any = runtime.undefined,
) -> int:
    string = _native_string(string)
    needle = _str_require_string(needle, 'rfind')
    start, stop = _str_bounds(string, start, end)
    if start > len(string) or stop < start:
        return -1
    answer = string.slice(start, stop).lastIndexOf(needle)
    return -1 if answer == -1 else start + answer


def _str_index(string: Any, needle: _Str, start: int = 0, end: Any = runtime.undefined) -> int:
    answer = _str_find(string, needle, start, end)
    if answer == -1:
        raise ValueError('substring not found')
    return answer


def _str_rindex(string: Any, needle: _Str, start: int = 0, end: Any = runtime.undefined) -> int:
    answer = _str_rfind(string, needle, start, end)
    if answer == -1:
        raise ValueError('substring not found')
    return answer


def _str_islower(string: Any) -> bool:
    string = _native_string(string)
    return (
        runtime.regexp(r'[a-z]').test(string)
        and not runtime.regexp(r'[A-Z]').test(string)
    )


def _str_isupper(string: Any) -> bool:
    string = _native_string(string)
    return (
        runtime.regexp(r'[A-Z]').test(string)
        and not runtime.regexp(r'[a-z]').test(string)
    )


def _str_isspace(string: Any) -> bool:
    string = _native_string(string)
    return bool(string) and runtime.regexp(r'^\s+$').test(string)


def _str_isalpha(string: Any) -> bool:
    return runtime.regexp(r'^[A-Za-z]+$').test(
        _native_string(string))


def _str_isdigit(string: Any) -> bool:
    return runtime.regexp(r'^[0-9]+$').test(
        _native_string(string))


def _str_join(separator: Any, iterable: Any) -> _Str:
    separator = _str_require_string(separator, 'join')
    values = []
    for value in iterable:
        values.append(_str_require_string(value, 'join'))
    return runtime.reflect.apply(
        runtime.array.prototype.join,
        values,
        [separator],
    )


def _str_ljust(string: Any, width: int, fill: _Str = ' ') -> _Str:
    string = _native_string(string)
    return string + _repeat(fill, max(0, width - len(string)))


def _str_rjust(string: Any, width: int, fill: _Str = ' ') -> _Str:
    string = _native_string(string)
    return _repeat(fill, max(0, width - len(string))) + string


def _str_lower(string: Any) -> _Str:
    return _lower(string)


def _str_upper(string: Any) -> _Str:
    return _upper(string)


def _str_lstrip(string: Any, characters: Any = runtime.undefined) -> _Str:
    string = _native_string(string)
    if characters is runtime.undefined or characters is None:
        chars = WHITESPACE
    else:
        chars = _str_require_string(characters, 'lstrip')
    position = 0
    while (
        position < len(string)
        and _index_of(chars, string[position]) != -1
    ):
        position += 1
    return string[position:]


def _str_rstrip(string: Any, characters: Any = runtime.undefined) -> _Str:
    string = _native_string(string)
    if characters is runtime.undefined or characters is None:
        chars = WHITESPACE
    else:
        chars = _str_require_string(characters, 'rstrip')
    position = len(string) - 1
    while (
        position >= 0
        and _index_of(chars, string[position]) != -1
    ):
        position -= 1
    return string[:position + 1]


def _str_strip(string: Any, characters: Any = runtime.undefined) -> _Str:
    return _str_lstrip(
        _str_rstrip(string, characters), characters)


def _str_partition(string: Any, separator: _Str) -> Any:
    string = _native_string(string)
    if not _value_type_is(separator, 'string'):
        raise TypeError('partition() argument must be str')
    if separator == '':
        raise ValueError('empty separator')
    position = string.indexOf(separator)
    if position == -1:
        return runtime.math_tuple([string, '', ''])
    return runtime.math_tuple([
        string[:position],
        separator,
        string[position + len(separator):],
    ])


def _str_rpartition(string: Any, separator: _Str) -> Any:
    string = _native_string(string)
    if not _value_type_is(separator, 'string'):
        raise TypeError('rpartition() argument must be str')
    if separator == '':
        raise ValueError('empty separator')
    position = string.lastIndexOf(separator)
    if position == -1:
        return runtime.math_tuple(['', '', string])
    return runtime.math_tuple([
        string[:position],
        separator,
        string[position + len(separator):],
    ])


def _str_replace(
    string: Any,
    old: _Str,
    replacement: _Str,
    replacement_count: Any = runtime.undefined,
) -> _Str:
    string = _native_string(string)
    old = _str_require_string(old, 'replace')
    replacement = _str_require_string(
        replacement, 'replace')
    if replacement_count is runtime.undefined:
        remaining = runtime.number.MAX_SAFE_INTEGER
    else:
        remaining = int(replacement_count)
        if remaining < 0:
            remaining = runtime.number.MAX_SAFE_INTEGER
    if remaining == 0:
        return string
    if old == '':
        pieces = []
        position = 0
        while position <= len(string):
            if remaining > 0:
                pieces.append(replacement)
                remaining -= 1
            if position < len(string):
                pieces.append(string[position])
            position += 1
        return _str_join('', pieces)
    position = 0
    while remaining > 0:
        found = string.indexOf(old, position)
        if found == -1:
            break
        string = (
            string[:found] + replacement
            + string[found + len(old):]
        )
        position = found + len(replacement)
        remaining -= 1
    return string


def _str_split(
    string: Any,
    separator: Any = runtime.undefined,
    maxsplit: int = -1,
) -> Any:
    string = _native_string(string)
    maxsplit = int(maxsplit)
    if separator is runtime.undefined or separator is None:
        parts = []
        position = 0
        while position < len(string):
            while (
                position < len(string)
                and _index_of(WHITESPACE, string[position]) != -1
            ):
                position += 1
            if position >= len(string):
                break
            if maxsplit >= 0 and len(parts) >= maxsplit:
                parts.append(string[position:])
                break
            end = position
            while (
                end < len(string)
                and _index_of(WHITESPACE, string[end]) == -1
            ):
                end += 1
            parts.append(string[position:end])
            position = end
        return parts

    separator = _str_require_string(separator, 'split')
    if separator == '':
        raise ValueError('empty separator')
    if maxsplit == 0:
        return [string]
    parts = []
    position = 0
    while maxsplit < 0 or len(parts) < maxsplit:
        found = string.indexOf(separator, position)
        if found == -1:
            break
        parts.append(string[position:found])
        position = found + len(separator)
    parts.append(string[position:])
    return parts


def _str_rsplit(
    string: Any,
    separator: Any = runtime.undefined,
    maxsplit: int = -1,
) -> Any:
    string = _native_string(string)
    maxsplit = int(maxsplit)
    if maxsplit < 0:
        return _str_split(string, separator)
    if separator is runtime.undefined or separator is None:
        parts = []
        position = len(string) - 1
        while (
            position >= 0
            and _index_of(WHITESPACE, string[position]) != -1
        ):
            position -= 1
        while len(parts) < maxsplit and position >= 0:
            end = position + 1
            while (
                position >= 0
                and _index_of(WHITESPACE, string[position]) == -1
            ):
                position -= 1
            parts.insert(0, string[position + 1:end])
            while (
                position >= 0
                and _index_of(WHITESPACE, string[position]) != -1
            ):
                position -= 1
        if position >= 0:
            parts.insert(0, string[:position + 1])
        return parts
    else:
        separator = _str_require_string(separator, 'rsplit')
        if separator == '':
            raise ValueError('empty separator')
        parts = list(_native_split(string, separator))
    if len(parts) <= maxsplit + 1:
        return parts
    head = _str_join(separator, parts[:len(parts) - maxsplit])
    return [head] + parts[len(parts) - maxsplit:]


def _str_splitlines(string: Any, keepends: bool = False) -> Any:
    string = _native_string(string)
    answer = []
    start = 0
    position = 0
    while position < len(string):
        if string[position] != '\n' and string[position] != '\r':
            position += 1
            continue
        newline_end = position + 1
        if (
            string[position] == '\r'
            and newline_end < len(string)
            and string[newline_end] == '\n'
        ):
            newline_end += 1
        end = newline_end if keepends else position
        answer.append(string[start:end])
        start = newline_end
        position = newline_end
    if start < len(string):
        answer.append(string[start:])
    return answer


def _str_swapcase(string: Any) -> _Str:
    answer = []
    for character in _native_string(string):
        lowered = _lower(character)
        if lowered == character:
            answer.append(_upper(character))
        else:
            answer.append(lowered)
    return runtime.reflect.apply(
        runtime.array.prototype.join, answer, [''])


def _str_zfill(string: Any, width: int) -> _Str:
    string = _native_string(string)
    return _repeat('0', max(0, width - len(string))) + string


def _integer_format(value: Any, base: int, uppercase: bool) -> _Str:
    if value is True:
        value = 1
    elif value is False:
        value = 0
    if not (
        _value_type_is(value, 'number')
        or _value_type_is(value, 'bigint')
    ):
        int_method = runtime.reflect.get(value, '__int__')
        if not _value_type_is(int_method, 'function'):
            raise TypeError('%d format: a real number is required')
        value = runtime.reflect.apply(int_method, value, [])
    negative = value < 0
    integer = runtime.bigint(value)
    if negative:
        integer = -integer
    boxed_integer = runtime.reflect.apply(
        runtime.object, runtime.undefined, [integer])
    digits = runtime.reflect.apply(
        runtime.reflect.get(boxed_integer, 'toString'),
        integer,
        [base],
    )
    if uppercase:
        digits = _upper(digits)
    return ('-' if negative else '') + digits


def _str_percent_format(format_string: Any, operands: Any) -> _Str:
    format_string = _native_string(format_string)
    values = operands if runtime.array.isArray(operands) else [operands]
    value_index = 0
    answer = ''
    position = 0
    while position < len(format_string):
        if format_string[position] != '%':
            answer += format_string[position]
            position += 1
            continue
        position += 1
        if position < len(format_string) and format_string[position] == '%':
            answer += '%'
            position += 1
            continue
        flags = ''
        while (
            position < len(format_string)
            and format_string[position] in '#0-+ '
        ):
            flags += format_string[position]
            position += 1
        width_text = ''
        while (
            position < len(format_string)
            and '0' <= format_string[position] <= '9'
        ):
            width_text += format_string[position]
            position += 1
        precision = runtime.undefined
        if position < len(format_string) and format_string[position] == '.':
            position += 1
            precision_text = ''
            while (
                position < len(format_string)
                and '0' <= format_string[position] <= '9'
            ):
                precision_text += format_string[position]
                position += 1
            precision = int(precision_text or '0')
        if position >= len(format_string):
            raise ValueError('incomplete format')
        conversion = format_string[position]
        position += 1
        if value_index >= len(values):
            raise TypeError('not enough arguments for format string')
        value = values[value_index]
        value_index += 1
        prefix = ''
        if conversion in 'diuoxX':
            base = 10
            if conversion in 'xX':
                base = 16
            elif conversion == 'o':
                base = 8
            replacement = _integer_format(
                value, base, conversion == 'X')
            negative = replacement[0] == '-'
            if negative:
                replacement = replacement[1:]
                prefix = '-'
            elif '+' in flags:
                prefix = '+'
            elif ' ' in flags:
                prefix = ' '
            if '#' in flags:
                if conversion == 'x':
                    prefix += '0x'
                elif conversion == 'X':
                    prefix += '0X'
                elif conversion == 'o':
                    prefix += '0o'
            if precision is not runtime.undefined:
                replacement = _repeat(
                    '0', max(0, precision - len(replacement))
                ) + replacement
        elif conversion == 's':
            replacement = str(value)
            if precision is not runtime.undefined:
                replacement = replacement[:precision]
        elif conversion == 'r':
            replacement = repr(value)
            if precision is not runtime.undefined:
                replacement = replacement[:precision]
        elif conversion == 'c':
            replacement = (
                value
                if _value_type_is(value, 'string')
                else chr(value)
            )
            if len(replacement) != 1:
                raise TypeError('%c requires int or char')
        else:
            raise ValueError(
                'unsupported format character ' + conversion)
        width = int(width_text or '0')
        padding = max(0, width - len(prefix) - len(replacement))
        if '-' in flags:
            replacement = prefix + replacement + _repeat(' ', padding)
        elif '0' in flags and precision is runtime.undefined:
            replacement = prefix + _repeat('0', padding) + replacement
        else:
            replacement = _repeat(' ', padding) + prefix + replacement
        answer += replacement
    if value_index != len(values):
        raise TypeError('not all arguments converted during string formatting')
    return answer


def _define_string_method(
    name: _Str,
    implementation: Any,
) -> None:
    native_method = runtime.native_method(implementation)
    runtime.reflect.set(
        runtime.reflect.get(ρσ_str, 'prototype'),
        name,
        native_method,
    )
    if (
        runtime.reflect.get(runtime.string_class.prototype, name)
        is runtime.undefined
    ):
        runtime.reflect.set(
            runtime.string_class.prototype,
            name,
            native_method,
        )
    runtime.reflect.set(ρσ_str, name, implementation)


_define_string_method('format', string_format)
_define_string_method('__mod__', _str_percent_format)
_define_string_method('capitalize', _str_capitalize)
_define_string_method('center', _str_center)
_define_string_method('count', _str_count)
_define_string_method('endswith', _str_endswith)
_define_string_method('startswith', _str_startswith)
_define_string_method('find', _str_find)
_define_string_method('rfind', _str_rfind)
_define_string_method('index', _str_index)
_define_string_method('rindex', _str_rindex)
_define_string_method('islower', _str_islower)
_define_string_method('isupper', _str_isupper)
_define_string_method('isspace', _str_isspace)
_define_string_method('isalpha', _str_isalpha)
_define_string_method('isdigit', _str_isdigit)
_define_string_method('join', _str_join)
_define_string_method('ljust', _str_ljust)
_define_string_method('rjust', _str_rjust)
_define_string_method('lower', _str_lower)
_define_string_method('upper', _str_upper)
_define_string_method('lstrip', _str_lstrip)
_define_string_method('rstrip', _str_rstrip)
_define_string_method('strip', _str_strip)
_define_string_method('partition', _str_partition)
_define_string_method('rpartition', _str_rpartition)
_define_string_method('replace', _str_replace)
_define_string_method('split', _str_split)
_define_string_method('rsplit', _str_rsplit)
_define_string_method('splitlines', _str_splitlines)
_define_string_method('swapcase', _str_swapcase)
_define_string_method('zfill', _str_zfill)

runtime.reflect.set(ρσ_str, 'ascii_lowercase', 'abcdefghijklmnopqrstuvwxyz')
runtime.reflect.set(ρσ_str, 'ascii_uppercase', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
runtime.reflect.set(
    ρσ_str,
    'ascii_letters',
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
)
runtime.reflect.set(ρσ_str, 'digits', '0123456789')
runtime.reflect.set(
    ρσ_str, 'punctuation', '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')
runtime.reflect.set(
    ρσ_str,
    'printable',
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ \t\n\r\x0b\x0c',
)
runtime.reflect.set(ρσ_str, 'whitespace', WHITESPACE)

str = ρσ_str
repr = ρσ_repr
