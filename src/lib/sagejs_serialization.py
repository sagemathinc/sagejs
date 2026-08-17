"""Safe, versioned serialization for Sage.js mathematical objects.

Unlike Python pickle, this format contains data only: loading it never imports
modules or executes source code.  The same v1 object graph is used by
`multiprocessing` worker threads and by these durable-storage helpers.
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


def loads_integer_tuple_table(source):
    """Load compact JSON `int -> int -> tuple[int, ...]` table data.

    This bounded format is intended for large, trusted package data whose
    integers fit exactly in JavaScript numbers. The result is an ordinary
    mutable Python dictionary with tuple leaves.
    """
    if isinstance(source, bytes) or isinstance(source, bytearray):
        source = bytes(source).decode("utf-8")
    if not isinstance(source, str):
        raise TypeError("loads_integer_tuple_table() requires bytes, bytearray, or str")
    return _host_call("serializationLoadsIntegerTupleTable", source)


def load_integer_tuple_table(filename):
    """Load a compact integer tuple table directly from `filename`."""
    return _host_call("serializationLoadIntegerTupleTable", str(filename))


def integer_tuple_table_view(table, kind):
    """Materialize one dynamic view of an integer tuple table."""
    return _host_call("serializationIntegerTupleTableView", table, kind)


def dump(value, file):
    """Write `value` to a binary file-like object and return `None`."""
    file.write(dumps(value))


def load(file):
    """Read one Sage.js serialization v1 value from a file-like object."""
    return loads(file.read())


SCHEMA = "https://sagejs.org/serialization/v1"
VERSION = 1
