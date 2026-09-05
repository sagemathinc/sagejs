from contextlib import contextmanager
from inspect import getcallargs, getfullargspec, signature


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

# Receiver-style builtin methods still implement Python's unbound descriptor
# form when retrieved from the class.  This is used by real packages, notably
# for efficient queue extension in custom list iterators.
values = [3, 1]
list.extend(values, [2])
list.insert(values, 0, 4)
assert list.pop(values) == 2
list.remove(values, 3)
list.sort(values)
list.reverse(values)
assert list.copy(values) == [4, 1]
assert list.count(values, 4) == 1
assert list.index(values, 1) == 1
list.clear(values)
assert values == []


for builtin_value, builtin_type, builtin_name in (
    (None, type(None), "NoneType"),
    (False, bool, "bool"),
    (1, int, "int"),
    (1.5, float, "float"),
    ("text", str, "str"),
    ([], list, "list"),
    ((), tuple, "tuple"),
    ({}, dict, "dict"),
    (set(), set, "set"),
):
    assert builtin_value.__class__ is builtin_type
    assert builtin_type.__name__ == builtin_name
    assert builtin_type.__qualname__ == builtin_name
    assert builtin_type.__module__ == "builtins"


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


class IdentityContains:
    def __eq__(self, other):
        raise AssertionError("list containment compared an identical object")


identity_contains = IdentityContains()
assert identity_contains in [identity_contains]


class DynamicNamespace:
    answer = 42


# A class dictionary is a cached, read-only, live mapping just as CPython's
# mappingproxy is. Retaining the view must not make class updates stale.
dynamic_namespace = DynamicNamespace.__dict__
assert dynamic_namespace["answer"] == 42
setattr(DynamicNamespace, "answer", 44)
assert dynamic_namespace["answer"] == 44
try:
    dynamic_namespace["answer"] = 45
except TypeError:
    pass
else:
    raise AssertionError("a class namespace allowed item assignment")
assert DynamicNamespace.answer == 44
delattr(DynamicNamespace, "answer")
assert "answer" not in dynamic_namespace


class AttributeFactoryProduct:
    def __init__(self, value=0):
        self.value = value


class AttributeFactoryOwner:
    def __init__(self):
        self.factory = AttributeFactoryProduct

    def construct(self):
        return self.factory(*(), **{"value": 17})


# A class stored on an instance is a callable value, not a descriptor which
# binds the owning instance. This must agree for simple and expanded calls.
assert AttributeFactoryOwner().construct().value == 17


class CallableDescriptorBase:
    inherited = property(lambda self: self._value)


class CallableDescriptorInstance(CallableDescriptorBase):
    def __init__(self):
        self._value = 23

    def __call__(self):
        return self._value


callable_descriptor_instance = CallableDescriptorInstance()
assert callable_descriptor_instance.inherited == 23
assert callable_descriptor_instance() == 23
assert callable_descriptor_instance.__dict__["_value"] == 23


class CallableCustomAllocator:
    def __new__(cls, *args, **kwargs):
        instance = object.__new__(cls)
        instance.allocated_with = (args, kwargs)
        return instance

    def __init__(self, value=0, **kwargs):
        self.value = value

    def __call__(self):
        return self.value


callable_custom_allocator = CallableCustomAllocator(29, label=31)
assert callable_custom_allocator.allocated_with == ((29,), {"label": 31})
assert callable_custom_allocator() == 29
assert type(callable_custom_allocator) is CallableCustomAllocator


class ExplicitBaseInitializer:
    def __init__(self, **kwargs):
        self.explicit_value = kwargs["value"]


class ExplicitChildInitializer(ExplicitBaseInitializer):
    def __init__(self, **kwargs):
        ExplicitBaseInitializer.__init__(self, **kwargs)


assert ExplicitChildInitializer(value=37).explicit_value == 37


class KeywordClassMethod:
    @classmethod
    def create(cls, **kwargs):
        instance = cls()
        instance.class_value = kwargs["value"]
        return instance


assert KeywordClassMethod.create(value=41).class_value == 41


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


class ModuleAnnotationTarget:
    pass


class ModuleAnnotatedInitializer:
    def __init__(self, value: ModuleAnnotationTarget) -> None:
        self.value = value


module_annotated_signature = signature(ModuleAnnotatedInitializer)
assert (
    module_annotated_signature.parameters["value"].annotation is ModuleAnnotationTarget
)


def call_shape(a, b=2, *items, flag=3, **options):
    return a, b, items, flag, options


assert getcallargs(call_shape, 1, 4, 5, flag=7, extra=9) == {
    "a": 1,
    "b": 4,
    "items": (5,),
    "flag": 7,
    "options": {"extra": 9},
}

try:
    getcallargs(call_shape)
except TypeError as error:
    assert "missing 1 required positional argument: 'a'" in str(error)
else:
    raise AssertionError("getcallargs accepted a missing required argument")


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
