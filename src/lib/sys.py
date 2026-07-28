__name__ = 'sys'


class _Implementation:
    def __init__(self):
        self.name = 'cpython'
        self.version = (3, 14, 4)

    def __repr__(self):
        return (
            "namespace(name='cpython', version="
            + repr(self.version)
            + ')'
        )

    __str__ = __repr__


implementation = _Implementation()


class TextIOWrapper:
    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return "<_io.TextIOWrapper name='" + self.name + "'>"

    __str__ = __repr__


stdin = TextIOWrapper('<stdin>')
stdout = TextIOWrapper('<stdout>')
stderr = TextIOWrapper('<stderr>')


def exit(status=None):
    if status is None:
        raise SystemExit
    raise SystemExit(status)

argv = process.argv
path = [process.cwd()]
byteorder = 'little'

# Node.js targets supported by Sage.js are 64-bit platforms.  Keep this exact
# even when this module is compiled by a bootstrap compiler whose own numeric
# literals are JavaScript Numbers.
maxsize = int('9223372036854775807')

# CPython exposes a descriptive implementation version here.  Code should
# generally use ``sys.version_info`` for feature checks, but ``version`` is a
# standard public attribute and must at least be a string.
version = 'Sage.js'


def intern(value):
    if not isinstance(value, str):
        raise TypeError('intern() argument must be str')
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
