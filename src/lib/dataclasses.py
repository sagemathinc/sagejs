"""Practical :mod:`dataclasses` compatibility for pure-Python packages."""

import sagejs.runtime as runtime


class _Missing:
    pass


MISSING = _Missing()


class _KwOnly:
    pass


KW_ONLY = _KwOnly()


def _install_method(cls, name, function):
    """Install a dynamically generated Python function as a native method."""
    prototype = runtime.reflect.get(cls, "prototype")
    runtime.reflect.set(prototype, name, runtime.native_method_adapter(function))


class InitVar:
    def __class_getitem__(cls, item):
        del item
        return cls


class Field:
    def __init__(
        self,
        default=MISSING,
        default_factory=MISSING,
        init=True,
        repr=True,
        hash=None,
        compare=True,
        metadata=None,
        kw_only=False,
    ):
        self.name = None
        self.type = None
        self.default = default
        self.default_factory = default_factory
        self.init = init
        self.repr = repr
        self.hash = hash
        self.compare = compare
        self.metadata = {} if metadata is None else metadata
        self.kw_only = kw_only


def field(
    *,
    default=MISSING,
    default_factory=MISSING,
    init=True,
    repr=True,
    hash=None,
    compare=True,
    metadata=None,
    kw_only=MISSING,
):
    if default is not MISSING and default_factory is not MISSING:
        raise ValueError("cannot specify both default and default_factory")
    return Field(
        default,
        default_factory,
        init,
        repr,
        hash,
        compare,
        metadata,
        False if kw_only is MISSING else kw_only,
    )


def _all_fields(cls):
    answer = []
    seen = set()
    for base in reversed(getattr(cls, "__mro__", (cls,))):
        for item in getattr(base, "__dataclass_fields__", ()):
            if item.name not in seen:
                answer.append(item)
                seen.add(item.name)
    return answer


def _is_init_var(annotation):
    if annotation is InitVar or annotation == "InitVar":
        return True
    if isinstance(annotation, str):
        return annotation.startswith("InitVar[") or ".InitVar[" in annotation
    return False


def dataclass(
    cls=None,
    /,
    *,
    init=True,
    repr=True,
    eq=True,
    order=False,
    unsafe_hash=False,
    frozen=False,
    match_args=True,
    kw_only=False,
    slots=False,
    weakref_slot=False,
):
    del order, frozen, slots, weakref_slot

    def decorate(target):
        inherited = _all_fields(target)
        inherited_names = {item.name for item in inherited}
        own = []
        keyword_mode = kw_only
        annotations = getattr(target, "__annotations__", {})
        namespace = getattr(target, "__dict__", {})
        for name, annotation in annotations.items():
            if annotation is KW_ONLY or annotation == "KW_ONLY":
                keyword_mode = True
                continue
            value = namespace.get(name, MISSING)
            if isinstance(value, Field):
                item = value
                if item.kw_only is False and keyword_mode:
                    item.kw_only = True
            else:
                item = Field(default=value, kw_only=keyword_mode)
            item.name = name
            item.type = annotation
            if name not in inherited_names:
                own.append(item)
        target.__dataclass_fields__ = tuple(inherited + own)
        target.__dataclass_params__ = {
            "init": init,
            "repr": repr,
            "eq": eq,
            "unsafe_hash": unsafe_hash,
        }
        all_items = _all_fields(target)

        existing_init = namespace.get("__init__", MISSING)
        prototype = runtime.reflect.get(target, "prototype")
        prototype_init = runtime.reflect.get(prototype, "__init__")
        if init and (
            existing_init is MISSING
            or getattr(existing_init, "__sagejs_synthetic_init__", False)
            or runtime.reflect.get(prototype_init, "__sagejs_synthetic_init__") is True
        ):

            def generated_init(self, *args, **kwargs):
                positional = list(args)
                init_vars = []
                for item in all_items:
                    if not item.init:
                        if item.default_factory is not MISSING:
                            setattr(self, item.name, item.default_factory())
                        elif item.default is not MISSING:
                            setattr(self, item.name, item.default)
                        continue
                    if positional and not item.kw_only:
                        value = positional.pop(0)
                        if item.name in kwargs:
                            raise TypeError(
                                "multiple values for argument '" + item.name + "'"
                            )
                    elif item.name in kwargs:
                        value = kwargs.pop(item.name)
                    elif item.default_factory is not MISSING:
                        value = item.default_factory()
                    elif item.default is not MISSING:
                        value = item.default
                    else:
                        raise TypeError(
                            "missing required argument: '" + item.name + "'"
                        )
                    if _is_init_var(item.type):
                        init_vars.append(value)
                    else:
                        setattr(self, item.name, value)
                if positional:
                    raise TypeError("too many positional arguments")
                if kwargs:
                    name = next(iter(kwargs))
                    raise TypeError("got an unexpected keyword argument '" + name + "'")
                post_init = getattr(self, "__post_init__", None)
                if post_init is not None:
                    post_init(*init_vars)

            _install_method(target, "__init__", generated_init)

        if repr and "__repr__" not in getattr(target, "__dict__", {}):

            def generated_repr(self):
                values = []
                for item in all_items:
                    if item.repr and hasattr(self, item.name):
                        values.append(item.name + "=" + repr(getattr(self, item.name)))
                return self.__class__.__name__ + "(" + ", ".join(values) + ")"

            _install_method(target, "__repr__", generated_repr)

        if eq and "__eq__" not in getattr(target, "__dict__", {}):

            def generated_eq(self, other):
                if type(self) is not type(other):
                    return NotImplemented
                return all(
                    getattr(self, item.name) == getattr(other, item.name)
                    for item in all_items
                    if item.compare
                )

            _install_method(target, "__eq__", generated_eq)

        if unsafe_hash:

            def generated_hash(self):
                return hash(
                    tuple(
                        getattr(self, item.name)
                        for item in all_items
                        if item.hash is True or (item.hash is None and item.compare)
                    )
                )

            _install_method(target, "__hash__", generated_hash)

        if match_args:
            target.__match_args__ = tuple(
                item.name for item in all_items if item.init and not item.kw_only
            )
        return target

    if cls is None:
        return decorate
    return decorate(cls)


def fields(class_or_instance):
    cls = (
        class_or_instance
        if isinstance(class_or_instance, type)
        else type(class_or_instance)
    )
    if not hasattr(cls, "__dataclass_fields__"):
        raise TypeError("must be called with a dataclass type or instance")
    return tuple(cls.__dataclass_fields__)


def is_dataclass(value):
    cls = value if isinstance(value, type) else type(value)
    return hasattr(cls, "__dataclass_fields__")


def asdict(instance, *, dict_factory=dict):
    if not is_dataclass(instance) or isinstance(instance, type):
        raise TypeError("asdict() should be called on dataclass instances")

    def convert(value):
        if is_dataclass(value) and not isinstance(value, type):
            return dict_factory(
                (item.name, convert(getattr(value, item.name)))
                for item in fields(value)
            )
        if isinstance(value, list):
            return [convert(item) for item in value]
        if isinstance(value, tuple):
            return tuple(convert(item) for item in value)
        if isinstance(value, dict):
            return type(value)(
                (convert(key), convert(item)) for key, item in value.items()
            )
        return value

    return convert(instance)
