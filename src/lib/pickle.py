"""A compact Python-object pickle compatibility layer for Sage.js.

This module implements the public ``dump``/``dumps``/``load``/``loads`` API
needed by pure-Python libraries.  Its wire format is Sage.js-specific and is
not compatible with CPython's pickle opcodes.  Like CPython pickle, loading
may import modules and invoke object reconstruction hooks, so data from an
untrusted source must never be loaded.
"""

import json


HIGHEST_PROTOCOL = 5
DEFAULT_PROTOCOL = 4

_MAGIC = b'SAGEJS-PICKLE-1\n'
_TAG = '__sagejs_pickle__'


class PickleError(Exception):
    pass


class PicklingError(PickleError):
    pass


class UnpicklingError(PickleError):
    pass


def _encode(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        return {_TAG: 'bytes', 'hex': value.hex()}
    if isinstance(value, bytearray):
        return {_TAG: 'bytearray', 'hex': bytes(value).hex()}
    if isinstance(value, tuple):
        return {_TAG: 'tuple', 'items': [_encode(item) for item in value]}
    if isinstance(value, list):
        return {_TAG: 'list', 'items': [_encode(item) for item in value]}
    if isinstance(value, dict):
        return {
            _TAG: 'dict',
            'items': [
                [_encode(key), _encode(item)]
                for key, item in value.items()
            ],
        }
    if isinstance(value, set):
        return {_TAG: 'set', 'items': [_encode(item) for item in value]}
    if isinstance(value, frozenset):
        return {
            _TAG: 'frozenset',
            'items': [_encode(item) for item in value],
        }

    cls = type(value)
    module = getattr(cls, '__module__', None)
    class_name = getattr(cls, '__name__', None)
    name = getattr(cls, '__qualname__', class_name)
    # mpmath creates its public context-bound classes dynamically and then
    # publishes them from its package.  Canonicalize those stable public
    # names even on runtimes where dynamic type() cannot infer its caller's
    # module name.
    if class_name in ('mpf', 'mpc') and (
        hasattr(value, '_mpf_') or hasattr(value, '_mpc_')
    ):
        module = 'mpmath'
        name = class_name
    if not module or not name or '<locals>' in name:
        raise PicklingError(
            "can't pickle " + repr(cls) + ': no importable class name')

    if hasattr(value, '__getstate__'):
        state = value.__getstate__()
    elif hasattr(value, '__dict__'):
        state = dict(value.__dict__)
    else:
        raise PicklingError(
            "can't pickle " + repr(cls) + ': no object state')
    return {
        _TAG: 'object',
        'module': module,
        'name': name,
        'state': _encode(state),
    }


def _resolve_class(module_name, qualified_name):
    value = __import__(module_name, fromlist=['*'])
    for part in qualified_name.split('.'):
        value = getattr(value, part)
    return value


def _decode(value):
    if not isinstance(value, dict) or _TAG not in value:
        return value
    kind = value[_TAG]
    if kind == 'bytes':
        return bytes.fromhex(value['hex'])
    if kind == 'bytearray':
        return bytearray.fromhex(value['hex'])
    if kind == 'tuple':
        return tuple(_decode(item) for item in value['items'])
    if kind == 'list':
        return [_decode(item) for item in value['items']]
    if kind == 'dict':
        return {
            _decode(pair[0]): _decode(pair[1])
            for pair in value['items']
        }
    if kind == 'set':
        return set(_decode(item) for item in value['items'])
    if kind == 'frozenset':
        return frozenset(_decode(item) for item in value['items'])
    if kind == 'object':
        cls = _resolve_class(value['module'], value['name'])
        try:
            instance = cls.__new__(cls)
        except Exception:
            instance = object.__new__(cls)
        state = _decode(value['state'])
        if hasattr(instance, '__setstate__'):
            instance.__setstate__(state)
        elif isinstance(state, dict):
            instance.__dict__.update(state)
        else:
            raise UnpicklingError(
                'object state is not a mapping and has no __setstate__')
        return instance
    raise UnpicklingError('unknown Sage.js pickle record: ' + repr(kind))


def dumps(obj, protocol=None, *, fix_imports=True, buffer_callback=None):
    del fix_imports
    if buffer_callback is not None:
        raise PicklingError('out-of-band pickle buffers are not supported')
    if protocol is not None and not (0 <= protocol <= HIGHEST_PROTOCOL):
        raise ValueError('pickle protocol must be <= ' + str(HIGHEST_PROTOCOL))
    payload = json.dumps(_encode(obj), separators=(',', ':'))
    return _MAGIC + payload.encode('utf-8')


def loads(data, *, fix_imports=True, encoding='ASCII', errors='strict', buffers=None):
    del fix_imports, encoding, errors
    if buffers is not None:
        raise UnpicklingError('out-of-band pickle buffers are not supported')
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError('a bytes-like object is required')
    raw = bytes(data)
    if raw[:len(_MAGIC)] != _MAGIC:
        raise UnpicklingError('unsupported pickle data')
    try:
        payload = raw[len(_MAGIC):].decode('utf-8')
        return _decode(json.loads(payload))
    except (PickleError, ImportError, AttributeError):
        raise
    except Exception as error:
        raise UnpicklingError(str(error))


def dump(obj, file, protocol=None, *, fix_imports=True, buffer_callback=None):
    file.write(dumps(
        obj,
        protocol,
        fix_imports=fix_imports,
        buffer_callback=buffer_callback,
    ))


def load(file, *, fix_imports=True, encoding='ASCII', errors='strict', buffers=None):
    return loads(
        file.read(),
        fix_imports=fix_imports,
        encoding=encoding,
        errors=errors,
        buffers=buffers,
    )
