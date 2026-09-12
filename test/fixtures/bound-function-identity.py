class Base:
    def method(self, value=3, *, scale=2):
        return self.offset + value * scale


class Derived(Base):
    pass


instance = Derived()
instance.offset = 10
saved = instance.method
public_function = Base.method
assert saved.__func__ is public_function
assert getattr(saved, "__func__") is public_function
assert Derived.method is public_function
assert instance.method.__func__ is public_function
assert saved.__self__ is instance
assert hash(saved) == hash(instance.method)
assert saved() == 16
assert saved(value=4, scale=3) == 22
assert saved.__func__(instance, value=4, scale=3) == 22
assert public_function.__defaults__ == (3,)
assert public_function.__kwdefaults__ == {"scale": 2}
saved.__func__.__defaults__ = (5,)
saved.__func__.__kwdefaults__ = {"scale": 4}
assert saved() == 30
assert Base.method(instance) == 30
assert instance.method() == 30


def replacement(self, value=7):
    return self.offset + value


Base.method = replacement
assert instance.method.__func__ is replacement
assert saved.__func__ is public_function
assert instance.method() == 17
assert saved() == 30
print("bound function identity passed")
