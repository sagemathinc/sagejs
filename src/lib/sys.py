__name__ = "sys"

import sagejs.runtime as runtime


_version_fields = ["major", "minor", "micro", "releaselevel", "serial"]
version_info = runtime.named_tuple(
    [3, 14, 4, "final", 0], "version_info", _version_fields
)


def _implementation_version(text):
    """Describe the product release, independently of the Python target."""
    parts = text.split("+", 1)[0].split("-", 1)
    numbers = [int(part) for part in parts[0].split(".")]
    if len(numbers) != 3 or any(part < 0 for part in numbers):
        raise ValueError("invalid Sage.js release version: " + text)
    level, serial = "final", 0
    if len(parts) == 2:
        prerelease = parts[1].split(".")
        levels = {"alpha": "alpha", "beta": "beta", "rc": "candidate"}
        if prerelease[0] not in levels or len(prerelease) > 2:
            raise ValueError("unsupported Sage.js prerelease version: " + text)
        level = levels[prerelease[0]]
        serial = int(prerelease[1]) if len(prerelease) == 2 else 0
        if serial < 0:
            raise ValueError("invalid Sage.js prerelease serial: " + text)
    return runtime.named_tuple(
        numbers + [level, serial], "version_info", _version_fields
    )


_product_metadata = runtime.reflect.get(
    runtime.global_object, "__sagejs_version_info__"
)
if _product_metadata is runtime.undefined:
    raise RuntimeError("the Sage.js host did not install version metadata")
_product_version = runtime.reflect.get(_product_metadata, "version")
if not isinstance(_product_version, str):
    raise RuntimeError("the Sage.js host installed invalid version metadata")


class _Implementation:
    def __init__(self):
        self.name = "sagejs"
        self.version = _implementation_version(_product_version)
        # There is no CPython bytecode ABI.  A distinct stable tag keeps
        # package tooling from confusing Sage.js caches with CPython pycs.
        self.cache_tag = "sagejs-314"

    def __repr__(self):
        return (
            "namespace(name='sagejs', version="
            + repr(self.version)
            + ", cache_tag='sagejs-314')"
        )

    __str__ = __repr__


implementation = _Implementation()

# Values follow CPython on the 64-bit platforms supported by Sage.js.  The
# named tuple shape matters to numeric packages that reproduce Python's hash
# contract for their own exact numeric types.
hash_info = runtime.named_tuple(
    [64, 2305843009213693951, 314159, 0, 1000003, "siphash13", 64, 128, 0],
    "hash_info",
    [
        "width",
        "modulus",
        "inf",
        "nan",
        "imag",
        "algorithm",
        "hash_bits",
        "seed_bits",
        "cutoff",
    ],
)


class TextIOWrapper:
    def __init__(self, name):
        self.name = name
        self.encoding = "utf-8"
        self.errors = "strict"
        self.closed = False

    def _stream(self):
        if self.name == "<stderr>":
            return process.stderr
        if self.name == "<stdin>":
            return process.stdin
        return process.stdout

    def write(self, value):
        value = str(value)
        stream = self._stream()
        method = runtime.reflect.get(stream, "write")
        if method is not runtime.undefined:
            runtime.reflect.apply(method, stream, [value])
        return len(value)

    def flush(self):
        return None

    def isatty(self):
        value = runtime.reflect.get(self._stream(), "isTTY")
        return False if value is runtime.undefined else bool(value)

    def fileno(self):
        if self.name == "<stdin>":
            return 0
        if self.name == "<stderr>":
            return 2
        return 1

    def writable(self):
        return self.name != "<stdin>"

    def readable(self):
        return self.name == "<stdin>"

    def seekable(self):
        return False

    def __repr__(self):
        return "<_io.TextIOWrapper name='" + self.name + "'>"

    __str__ = __repr__


stdin = TextIOWrapper("<stdin>")
stdout = TextIOWrapper("<stdout>")
stderr = TextIOWrapper("<stderr>")


def exit(status=None):
    if status is None:
        raise SystemExit
    raise SystemExit(status)


def exc_info():
    """Return information about the exception most recently being handled.

    Compiled exception handlers publish their normalized exception through a
    shared runtime slot because lazy modules execute in separate JavaScript
    closures.  Sage.js exceptions carry a native JavaScript stack rather
    than CPython frame objects.  The third tuple entry is therefore an empty
    traceback sequence: consumers can format the value and native stack,
    while frame-oriented tools see no invented Python frames instead of
    accidentally iterating a host `Error` object.
    """
    error = runtime.reflect.get(runtime.global_object, "__sagejs_last_exception__")
    if error is runtime.undefined or error is None:
        return (None, None, None)
    return (type(error), error, ())


def exception():
    """Return the active exception, matching Python 3.11 and newer."""
    return exc_info()[1]


def _default_excepthook(exc_type, exc_value, exc_traceback):
    import traceback

    print(
        "".join(traceback.format_exception(exc_type, exc_value, exc_traceback)),
        end="",
    )


def _default_unraisablehook(unraisable):
    value = getattr(unraisable, "exc_value", None)
    if value is not None:
        _default_excepthook(
            getattr(unraisable, "exc_type", type(value)),
            value,
            getattr(unraisable, "exc_traceback", None),
        )


excepthook = _default_excepthook
__excepthook__ = _default_excepthook
unraisablehook = _default_unraisablehook
__unraisablehook__ = _default_unraisablehook

argv = process.argv
path = [process.cwd()]
byteorder = "little"

# Node.js targets supported by Sage.js are 64-bit platforms.  Keep this exact
# even when this module is compiled by a bootstrap compiler whose own numeric
# literals are JavaScript Numbers.
maxsize = int("9223372036854775807")
maxunicode = 0x10FFFF

# The leading version is the language target, not the embedded Node version
# or product version. Packages should use `version_info` for feature checks.
version = ".".join(str(part) for part in version_info[:3]) + (
    " (Sage.js " + _product_version + "; Python-to-JavaScript runtime)"
)
executable = process.execPath
modules = runtime.live_scope_dict(runtime.modules)
meta_path = []
path_hooks = []
path_importer_cache = {}
platform = process.platform
prefix = process.cwd()
base_prefix = prefix
exec_prefix = prefix
base_exec_prefix = prefix
hexversion = (3 << 24) | (14 << 16) | (4 << 8) | 0xF0
api_version = 1013
warnoptions = []
dont_write_bytecode = True
pycache_prefix = None
_recursion_limit = 1000


def getrecursionlimit():
    return _recursion_limit


def setrecursionlimit(limit):
    global _recursion_limit
    limit = int(limit)
    if limit < 1:
        raise ValueError("recursion limit must be greater than 0")
    _recursion_limit = limit


def intern(value):
    if not isinstance(value, str):
        raise TypeError("intern() argument must be str")
    return value


def getsizeof(value):
    """Return a stable positive size estimate.

    Sage.js does not expose V8's object allocation size.  Python code uses
    this API primarily for relative accounting, so report sequence and mapping
    lengths when available and one unit for other live objects.
    """
    try:
        return max(8, len(value))
    except TypeError:
        return 8
