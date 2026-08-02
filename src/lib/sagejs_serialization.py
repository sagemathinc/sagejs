"""Safe, versioned serialization for Sage.js mathematical objects.

Unlike Python pickle, this format contains data only: loading it never imports
modules or executes source code.  The same v1 object graph is used by
``multiprocessing`` worker threads and by these durable-storage helpers.
Parents are serialized explicitly and shared references are preserved.
"""

import sagejs.runtime as runtime


def _host_call(operation, *args):
    host = runtime.reflect.get(runtime.global_object, '__sagejs_host__')
    if host is runtime.undefined:
        raise NotImplementedError(
            'Sage.js serialization requires a host serialization capability')
    result = runtime.reflect.apply(
        runtime.reflect.get(host, 'call'), host, [operation, list(args)])
    if not runtime.reflect.get(result, 'ok'):
        error = runtime.reflect.get(result, 'error')
        message = runtime.reflect.get(error, 'message')
        raise ValueError(message)
    return runtime.reflect.get(result, 'value')


def dumps(value):
    """Return a portable Sage.js serialization v1 byte string.

    The result is deterministic UTF-8 JSON with binary blocks represented as
    base64.  Worker-thread transport uses the same object records with
    transferable binary blocks and does not pay this base64 cost.
    """
    return bytes(_host_call('serializationDumps', value), 'utf-8')


def loads(source):
    """Load a value written by :func:`dumps` without executing code."""
    if isinstance(source, bytes) or isinstance(source, bytearray):
        source = bytes(source).decode('utf-8')
    if not isinstance(source, str):
        raise TypeError('loads() requires bytes, bytearray, or str')
    return _host_call('serializationLoads', source)


def dump(value, file):
    """Write ``value`` to a binary file-like object and return ``None``."""
    file.write(dumps(value))


def load(file):
    """Read one Sage.js serialization v1 value from a file-like object."""
    return loads(file.read())


SCHEMA = 'https://sagejs.org/serialization/v1'
VERSION = 1
