"""Safe, versioned serialization for Sage.js mathematical objects.

Unlike Python pickle, this format contains data only: loading it never imports
modules or executes source code.  The same v1 object graph is used by
``multiprocessing`` worker threads and by these durable-storage helpers.
Parents are serialized explicitly and shared references are preserved.
"""

import sagejs.runtime as runtime


def _host_call(operation, *args):
    host = runtime.reflect.get(runtime.global_object, "__sagejs_host__")
    if host is runtime.undefined:
        raise NotImplementedError(
            "Sage.js serialization requires a host serialization capability"
        )
    result = runtime.reflect.apply(
        runtime.reflect.get(host, "call"), host, [operation, list(args)]
    )
    if not runtime.reflect.get(result, "ok"):
        error = runtime.reflect.get(result, "error")
        message = runtime.reflect.get(error, "message")
        raise ValueError(message)
    return runtime.reflect.get(result, "value")


def dumps(value):
    """Return a portable binary SagePack v1 byte string.

    The result has deterministic UTF-8 object metadata and unexpanded binary
    blocks.  It contains data only and loading it never executes code.
    """
    return bytes(_host_call("serializationPack", value))


def loads(source):
    """Load binary SagePack v1 or legacy serialization-v1 JSON safely."""
    if isinstance(source, bytes) or isinstance(source, bytearray):
        raw = bytes(source)
        if raw[:8] == b"SAGEPK1\x00":
            return _host_call("serializationUnpack", raw)
        source = raw.decode("utf-8")
    if isinstance(source, str):
        return _host_call("serializationLoads", source)
    else:
        raise TypeError("loads() requires bytes, bytearray, or str")


def dump(value, file):
    """Write ``value`` to a binary file-like object and return ``None``."""
    file.write(dumps(value))


def load(file):
    """Read one Sage.js serialization v1 value from a file-like object."""
    return loads(file.read())


SCHEMA = "https://sagejs.org/serialization/v1"
VERSION = 1
