class Meta(type):
    pass


class Base(metaclass=Meta):
    def method(self, /, value, *args, **kwargs):
        return [self.tag, value, list(args), kwargs]

    @classmethod
    def class_method(cls, /, value):
        return [cls.__name__, value]

    @staticmethod
    def static_method(value):
        return value


class Derived(Base):
    def probe(self, /, *args, **kwargs):
        lookup = super(Derived, self)
        saved = lookup.method
        assert lookup.method(*args, **kwargs) == [17, 2, [3], {"extra": 5}]
        assert saved(value=4) == [17, 4, [], {}]
        assert saved.__self__ is self
        assert lookup.class_method(value=9) == ["Derived", 9]
        assert lookup.static_method(value=11) == 11


instance = Derived()
instance.tag = 17
instance.probe(2, 3, extra=5)


class LegacyBase:
    def __init__(self, first="default", enabled=False):
        self.first = first
        self.enabled = enabled


class Gap(LegacyBase):
    pass


class LegacyDerived(Gap):
    def __init__(self):
        super().__init__(enabled=True)


legacy = LegacyDerived()
assert legacy.first == "default"
assert legacy.enabled is True
print("super-prepared-binding-ok")
