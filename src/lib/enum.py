"""Python-compatible enumeration classes for pure-Python packages.

The implementation intentionally concentrates on the data-model surface used
by libraries: member construction, aliases, iteration, lookup by value or
name, identity, and the standard ``name``/``value`` attributes.  Bitwise Flag
combination remains a later compatibility layer.
"""

import sagejs.runtime as runtime


class _AutoValue:
    _next = 0

    def __init__(self):
        type(self)._next += 1
        self.value = type(self)._next

    def __bool__(self):
        return False

    def __repr__(self):
        return 'auto(' + repr(self.value) + ')'


def auto():
    return _AutoValue()


def _member_candidates(namespace):
    for name, value in namespace.items():
        if name.startswith('_') or callable(value):
            continue
        yield name, value


class EnumType(type):

    def __new__(metaclass, name, bases, namespace):
        cls = type.__new__(metaclass, name, bases, namespace)
        member_names = []
        member_map = {}
        value_members = []
        for member_name, declared_value in _member_candidates(namespace):
            value = (
                declared_value.value
                if isinstance(declared_value, _AutoValue)
                else declared_value
            )
            member = None
            for previous_value, previous_member in value_members:
                if previous_value == value:
                    member = previous_member
                    break
            if member is None:
                member = object.__new__(cls)
                member._name_ = member_name
                member._value_ = value
                member.name = member_name
                member.value = value
                member_names.append(member_name)
                value_members.append((value, member))
            member_map[member_name] = member
            setattr(cls, member_name, member)

        cls._member_names_ = member_names
        cls._member_map_ = member_map
        cls.__members__ = member_map

        # JavaScript ``for of`` is the compiler's fast iteration path.  Publish
        # it directly while retaining ordinary Python metadata above.
        def enum_iterator():
            return iter([member_map[item] for item in member_names])

        runtime.reflect.set(cls, runtime.iterator_symbol, enum_iterator)
        return cls


# Python 3.11 exposes both spellings.
EnumMeta = EnumType


class Enum(metaclass=EnumType):

    def __new__(cls, value):
        if isinstance(value, cls):
            return value
        for member in cls:
            if member.value == value:
                return member
        raise ValueError(repr(value) + ' is not a valid ' + cls.__name__)

    def __repr__(self):
        return '<' + type(self).__name__ + '.' + self.name + ': ' + repr(self.value) + '>'

    def __str__(self):
        return type(self).__name__ + '.' + self.name

    def __hash__(self):
        return hash(self.name)


class IntEnum(Enum):
    def __int__(self):
        return int(self.value)

    def __index__(self):
        return int(self.value)

    def __bool__(self):
        return bool(self.value)

    def __eq__(self, other):
        if isinstance(other, IntEnum):
            other = other.value
        return self.value == other

    def __hash__(self):
        return hash(self.value)


class StrEnum(Enum):
    pass


class Flag(Enum):
    pass


class IntFlag(Flag):
    pass


KEEP = 'keep'
CONFORM = 'conform'
EJECT = 'eject'
STRICT = 'strict'


def unique(cls):
    if len(cls.__members__) != len(cls._member_names_):
        raise ValueError('duplicate values found in ' + cls.__name__)
    return cls


def verify(*checks):
    del checks
    return lambda cls: cls
