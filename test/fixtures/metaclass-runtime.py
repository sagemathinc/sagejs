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


class BuiltinClassAttributes:
    list_class = list
    set_class = set
    dict_class = dict


builtin_class_attributes = BuiltinClassAttributes()
assert builtin_class_attributes.list_class is list
assert builtin_class_attributes.set_class is set
assert builtin_class_attributes.dict_class is dict


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
