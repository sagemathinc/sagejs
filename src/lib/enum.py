"""Pragmatic enum surface for pure-Python packages.

Class members retain their immutable declared values, which preserves the
identity comparisons and sentinel behavior used by common libraries.  A full
Enum metaclass with iteration and aliases is tracked as a deeper compatibility
layer.
"""


class _AutoValue:
    _next = 0

    def __init__(self):
        type(self)._next += 1
        self.value = type(self)._next

    def __bool__(self):
        # ``attrs`` intentionally uses an auto-valued Enum member as its
        # false-valued NOTHING sentinel.
        return False

    def __repr__(self):
        return 'auto(' + repr(self.value) + ')'


def auto():
    return _AutoValue()


class Enum:
    pass


class IntEnum(int, Enum):
    pass


class StrEnum(str, Enum):
    pass


class Flag(Enum):
    pass


class IntFlag(int, Flag):
    pass


KEEP = 'keep'
CONFORM = 'conform'
EJECT = 'eject'
STRICT = 'strict'


def unique(cls):
    return cls


def verify(*checks):
    del checks
    return lambda cls: cls
