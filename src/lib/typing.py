"""Runtime-focused subset of :mod:`typing` for pure-Python packages.

Sage.js erases most annotations, as CPython does unless an application asks
for them explicitly.  The objects below preserve the runtime behavior that
packages commonly depend on: subscription, type variables, identity
decorators, ``TYPE_CHECKING``, and the marker bases used by ``Generic``,
``Protocol``, ``NamedTuple``, and ``TypedDict``.
"""

TYPE_CHECKING = False


class _TypingAlias:
    def __init__(self, origin, args):
        self.__origin__ = origin
        self.__args__ = args if isinstance(args, tuple) else (args,)

    def __repr__(self):
        return repr(self.__origin__) + '[' + ', '.join(
            repr(value) for value in self.__args__) + ']'

    def __or__(self, other):
        return _TypingUnion((self, other))

    def __ror__(self, other):
        return _TypingUnion((other, self))


class _TypingUnion:
    def __init__(self, values):
        self.__args__ = values

    def __or__(self, other):
        return _TypingUnion(self.__args__ + (other,))

    def __ror__(self, other):
        return _TypingUnion((other,) + self.__args__)


# CPython exposes this implementation detail and a number of widely used
# packages probe for it.  Keeping the alias costs nothing and is more useful
# than forcing each package to special-case Sage.js.
_GenericAlias = _TypingAlias


class _SpecialForm:
    def __init__(self, name, origin=None):
        self._name = name
        self._origin = origin

    def __getitem__(self, args):
        return _TypingAlias(self._origin or self, args)

    def __repr__(self):
        return 'typing.' + self._name


class _SubscriptableMarker:
    @classmethod
    def __class_getitem__(cls, _args):
        return cls


class Generic(_SubscriptableMarker):
    pass


class Protocol(Generic):
    pass


class TypedDict(dict):
    pass


class NamedTuple(tuple, _SubscriptableMarker):
    """Marker base; the compiler supplies fields for class-syntax forms."""


class SupportsInt(Protocol):
    pass


class SupportsFloat(Protocol):
    pass


class SupportsComplex(Protocol):
    pass


class SupportsBytes(Protocol):
    pass


class SupportsIndex(Protocol):
    pass


class SupportsAbs(Protocol):
    pass


class SupportsRound(Protocol):
    pass


class _TypeVariable:
    def __init__(self, name, constraints, bound=None, **options):
        self.__name__ = name
        self.__constraints__ = constraints
        self.__bound__ = bound
        self.__covariant__ = bool(options.get('covariant', False))
        self.__contravariant__ = bool(options.get('contravariant', False))

    def __repr__(self):
        return '~' + self.__name__


def TypeVar(name, *constraints, bound=None, **options):
    return _TypeVariable(name, constraints, bound=bound, **options)


def ParamSpec(name, **options):
    return _TypeVariable(name, (), **options)


def TypeVarTuple(name, **options):
    return _TypeVariable(name, (), **options)


def NewType(name, supertype):
    def new_type(value):
        return value
    new_type.__name__ = name
    new_type.__supertype__ = supertype
    return new_type


def cast(_type, value):
    return value


def assert_type(value, _type):
    return value


def assert_never(value):
    raise AssertionError('Expected code to be unreachable, but got: ' + repr(value))


def reveal_type(value):
    return value


def overload(function):
    return function


def no_type_check(function):
    return function


def runtime_checkable(cls):
    return cls


def final(value):
    return value


def override(value):
    return value


def get_origin(value):
    return getattr(value, '__origin__', None)


def get_args(value):
    return getattr(value, '__args__', ())


def get_type_hints(obj, globalns=None, localns=None, include_extras=False):
    return dict(getattr(obj, '__annotations__', {}))


def _identity_decorator(*args, **kwargs):
    if len(args) == 1 and callable(args[0]) and not kwargs:
        return args[0]

    def decorate(value):
        return value
    return decorate


dataclass_transform = _identity_decorator
deprecated = _identity_decorator


Any = _SpecialForm('Any')
NoReturn = _SpecialForm('NoReturn')
Never = _SpecialForm('Never')
Union = _SpecialForm('Union')
Optional = _SpecialForm('Optional')
Literal = _SpecialForm('Literal')
Annotated = _SpecialForm('Annotated')
ClassVar = _SpecialForm('ClassVar')
Final = _SpecialForm('Final')
Concatenate = _SpecialForm('Concatenate')
Unpack = _SpecialForm('Unpack')
Required = _SpecialForm('Required')
NotRequired = _SpecialForm('NotRequired')
TypeGuard = _SpecialForm('TypeGuard')
Self = _SpecialForm('Self')
TypeAlias = _SpecialForm('TypeAlias')

List = _SpecialForm('List', list)
Dict = _SpecialForm('Dict', dict)
Tuple = _SpecialForm('Tuple', tuple)
Set = _SpecialForm('Set', set)
FrozenSet = _SpecialForm('FrozenSet', frozenset)
Type = _SpecialForm('Type', type)
Callable = _SpecialForm('Callable')
Iterable = _SpecialForm('Iterable')
Iterator = _SpecialForm('Iterator')
Generator = _SpecialForm('Generator')
Sequence = _SpecialForm('Sequence')
MutableSequence = _SpecialForm('MutableSequence')
Mapping = _SpecialForm('Mapping')
MutableMapping = _SpecialForm('MutableMapping')
Collection = _SpecialForm('Collection')
Container = _SpecialForm('Container')
Reversible = _SpecialForm('Reversible')
AbstractSet = _SpecialForm('AbstractSet')
ContextManager = _SpecialForm('ContextManager')
AsyncContextManager = _SpecialForm('AsyncContextManager')
AsyncIterable = _SpecialForm('AsyncIterable')
AsyncIterator = _SpecialForm('AsyncIterator')
Coroutine = _SpecialForm('Coroutine')
Awaitable = _SpecialForm('Awaitable')
Pattern = _SpecialForm('Pattern')
Match = _SpecialForm('Match')
class IO(_SubscriptableMarker):
    pass


class TextIO(IO):
    pass


class BinaryIO(IO):
    pass


AnyStr = TypeVar('AnyStr', str, bytes)
