"""Formatting helpers for Sage.js JavaScript exception stacks."""

import sagejs.runtime as runtime


def _stack(error):
    if error is None or error is runtime.undefined:
        return ''
    value = runtime.reflect.get(error, 'stack')
    if value is runtime.undefined:
        return str(error)
    return str(value)


def format_exception(exc=runtime.undefined, value=None, tb=None, limit=None,
                     chain=True):
    """Format an exception using its native JavaScript stack when present."""
    if exc is runtime.undefined:
        exc = runtime.last_exception
    elif value is not None:
        exc = value
    text = _stack(exc)
    if not text:
        return []
    lines = text.splitlines()
    heading = lines[0]
    body = lines[1:]
    name = runtime.reflect.get(exc, 'name')
    if name is not runtime.undefined:
        sentinel = 'at new ' + str(name)
        for index in range(len(body)):
            if body[index].strip().startswith(sentinel):
                body = body[index + 1:]
                break
    if limit is not None:
        body = body[:limit] if limit >= 0 else body[limit:]
    body.reverse()
    lines = ['Traceback (most recent call last):'] + body + [heading]
    return [line + '\n' for line in lines]


def format_exc(limit=None, chain=True):
    return ''.join(format_exception(limit=limit, chain=chain))


def print_exc(limit=None, file=None, chain=True):
    print(format_exc(limit, chain), end='')


def format_stack(frame=None, limit=None):
    error = runtime.reflect.construct(runtime.error, [])
    lines = _stack(error).splitlines()[1:]
    for index in range(len(lines)):
        if 'format_stack' in lines[index]:
            lines = lines[index + 1:]
            break
    lines.reverse()
    if limit is not None:
        lines = lines[:limit] if limit >= 0 else lines[limit:]
    return [line + '\n' for line in lines]


def print_stack(frame=None, limit=None, file=None):
    print(''.join(format_stack(frame, limit)), end='')
