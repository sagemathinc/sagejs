from contextlib import contextmanager
from inspect import getfullargspec, signature


class AllocatingMeta(type):
    def __new__(mcls, name, bases, namespace, **keywords):
        namespace["allocated_by"] = mcls.__name__
        return super().__new__(mcls, name, bases, namespace, **keywords)

    def __init__(cls, name, bases, namespace, **keywords):
        super().__init__(name, bases, namespace, **keywords)
        cls.initialized_by = type(cls).__name__


class AllocatedProduct(metaclass=AllocatingMeta):
    answer = 42


assert type(AllocatedProduct) is AllocatingMeta
assert AllocatedProduct.allocated_by == "AllocatingMeta"
assert AllocatedProduct.initialized_by == "AllocatingMeta"
assert AllocatedProduct.answer == 42
assert isinstance(AllocatedProduct(), AllocatedProduct)

DynamicAllocatedProduct = type(
    "DynamicAllocatedProduct",
    (AllocatedProduct,),
    {"answer": 84},
)
assert type(DynamicAllocatedProduct) is AllocatingMeta
assert DynamicAllocatedProduct.allocated_by == "AllocatingMeta"
assert DynamicAllocatedProduct.initialized_by == "AllocatingMeta"
assert DynamicAllocatedProduct.answer == 84


class BuiltinClassAttributes:
    list_class = list
    set_class = set
    dict_class = dict


builtin_class_attributes = BuiltinClassAttributes()
assert builtin_class_attributes.list_class is list
assert builtin_class_attributes.set_class is set
assert builtin_class_attributes.dict_class is dict

# Recognizing builtin constructors as Python classes must not reinterpret
# their explicit-self class APIs as JavaScript receiver methods.
assert str.replace("class_member", "_", "-") == "class-member"
values = []
list.append(values, 5)
assert values == [5]


class SetupBaseMeta(type):
    def __init__(cls, name, bases, namespace):
        super().__init__(name, bases, namespace)
        cls.setup_class(namespace)

    def setup_class(cls, namespace):
        cls.setup_marker = "base"


class SetupDerivedMeta(SetupBaseMeta):
    def setup_class(cls, namespace):
        cls.setup_marker = "derived"


class SetupProduct(metaclass=SetupDerivedMeta):
    pass


assert SetupProduct.setup_marker == "derived"
assert SetupProduct.mro() == list(SetupProduct.__mro__)
assert type.mro(SetupProduct) == list(SetupProduct.__mro__)


class InheritedClassMethod:
    @classmethod
    def owner(cls):
        return cls


class InheritedClassMethodChild(InheritedClassMethod):
    pass


assert InheritedClassMethodChild().owner() is InheritedClassMethodChild


class CustomDirectory:
    def __dir__(self):
        return super().__dir__() + ["custom_entry"]


assert "custom_entry" in dir(CustomDirectory())
assert issubclass(ModuleNotFoundError, ImportError)


class DecoratedProperty:
    def __init__(self):
        self.entered = False

    @property
    @contextmanager
    def scope(self):
        self.entered = True
        try:
            yield self
        finally:
            self.entered = False


decorated = DecoratedProperty()
with decorated.scope as active:
    assert active is decorated
    assert decorated.entered
assert not decorated.entered


class DecoratedMethod:
    def __init__(self):
        self.entered = False

    @contextmanager
    def scope(self):
        self.entered = True
        try:
            yield self
        finally:
            self.entered = False


decorated_method = DecoratedMethod()
with decorated_method.scope() as active:
    assert active is decorated_method
    assert decorated_method.entered
assert not decorated_method.entered


class CallableDecorator:
    def __call__(self, function):
        function.decorated_by_instance = True
        return function


def callable_decorator_factory():
    return CallableDecorator()


@callable_decorator_factory()
def dynamically_decorated():
    return 7


assert dynamically_decorated() == 7
assert dynamically_decorated.decorated_by_instance


class EmptyMixin:
    pass


class StatefulBase:
    def __init__(self, value):
        self.value = value


class MixedState(EmptyMixin, StatefulBase):
    pass


assert MixedState(31).value == 31


class KeywordCollision(metaclass=AllocatingMeta):
    def __init__(__self, cls, self):
        __self.values = (cls, self)


keyword_collision = KeywordCollision(cls=3, self=5)
assert keyword_collision.values == (3, 5)


def positional_only_keyword_collision(value, /, **kwargs):
    return value, kwargs


assert positional_only_keyword_collision(1, value=2) == (1, {"value": 2})


class IntrospectionMethod:
    def callback(self, change):
        return change


introspection_method = IntrospectionMethod()
assert list(signature(introspection_method.callback).parameters) == ["change"]
assert getfullargspec(introspection_method.callback).args == ["self", "change"]


class AnnotatedInitializer:
    def __init__(self, value: int = 1) -> None:
        self.value = value


annotated_initializer_signature = signature(AnnotatedInitializer)
assert list(annotated_initializer_signature.parameters) == ["value"]
assert annotated_initializer_signature.parameters["value"].annotation is int
assert annotated_initializer_signature.return_annotation is None
assert getattr(AnnotatedInitializer, "__annotations__", {}) == {}


class CustomAllocatorOnly:
    def __new__(cls, *args, **kwargs):
        instance = object.__new__(cls)
        instance.received = (args, kwargs)
        return instance


custom_allocator_only = CustomAllocatorOnly(1, label=2)
assert custom_allocator_only.received == ((1,), {"label": 2})


class AnnotatedAllocatorOnly:
    def __new__(cls, value: str = "value") -> "AnnotatedAllocatorOnly":
        instance = object.__new__(cls)
        instance.value = value
        return instance


annotated_allocator_signature = signature(AnnotatedAllocatorOnly)
assert list(annotated_allocator_signature.parameters) == ["value"]
assert annotated_allocator_signature.parameters["value"].annotation is str
assert annotated_allocator_signature.return_annotation == "AnnotatedAllocatorOnly"
assert getattr(AnnotatedAllocatorOnly, "__annotations__", {}) == {}


class DynamicBase:
    pass


DynamicSubclass = type("DynamicSubclass", (DynamicBase,), {})
dynamic_instance = DynamicBase()
dynamic_instance.__class__ = DynamicSubclass
assert type(dynamic_instance) is DynamicSubclass
assert isinstance(dynamic_instance, DynamicBase)


class StrictInitializer:
    def __init__(self):
        pass


class InheritedStrictInitializer(StrictInitializer):
    pass


try:
    InheritedStrictInitializer(unexpected=True)
except TypeError:
    pass
else:
    raise AssertionError("synthetic __init__ silently discarded a keyword")

for builtin_class in (bool, dict, float, int, list, set, str, tuple):
    assert issubclass(builtin_class, object)

assert issubclass(DeprecationWarning, Warning)
assert not issubclass(DeprecationWarning, PendingDeprecationWarning)
