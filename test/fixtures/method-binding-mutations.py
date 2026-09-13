class A:
    def method(self, value=0):
        return ("old", value)


a = A()
saved = a.method
assert a.method is not a.method
assert "method" not in a.__dict__


def replacement(self, value=0):
    return ("new", value)


A.method = replacement
assert a.method() == ("new", 0)
assert saved() == ("old", 0)
assert "method" not in a.__dict__

a.method = a.method
assert "method" in a.__dict__


def third(self, value=0):
    return ("third", value)


A.method = third
assert a.method() == ("new", 0)
del a.method
assert a.method() == ("third", 0)
del A.method
assert not hasattr(a, "method")
assert saved(5) == ("old", 5)


class B:
    def method(self, value=0):
        return ("B", value)


a.__class__ = B
assert a.method() == ("B", 0)


def change():
    B.method = replacement
    return 9


assert a.method(change()) == ("B", 9)
assert a.method(8) == ("new", 8)


class CallableA:
    def __call__(self):
        return 11


class CallableB:
    def __call__(self):
        return 13


c = CallableA()
assert c() == 11
c.__class__ = CallableB
assert c() == 13


class RaisingConstructor:
    @property
    def constructor(self):
        raise AssertionError("must not inspect constructor")

    def method(self):
        return 17


r = RaisingConstructor()
assert r.method() == 17
assert callable(RaisingConstructor.__dict__["method"])
assert RaisingConstructor.__dict__["method"] is RaisingConstructor.method
assert isinstance(RaisingConstructor.__dict__["constructor"], property)


class Data:
    def __get__(self, instance, owner):
        return 23

    def __set__(self, instance, value):
        instance.data_written = value


r.method = r.method
RaisingConstructor.method = Data()
assert r.method == 23
r.method = 29
assert r.data_written == 29


class Marker:
    def method(self):
        return 31


def explicit():
    return 37


explicit.__sagejs_eager_bound_cache__ = True
marked = Marker()
marked.method = explicit
assert marked.method is explicit
assert marked.method() == 37


class Empty:
    pass


class Secondary:
    def inherited(self):
        return self.payload


class Mixed(Empty, Secondary):
    pass


mixed = Mixed()
mixed.payload = 41
assert mixed.inherited() == 41
assert Mixed.inherited(mixed) == 41
assert Secondary.__dict__["inherited"] is Mixed.inherited


class StaticOverride(Secondary):
    inherited = staticmethod(lambda: 43)


overridden = StaticOverride()
assert StaticOverride.inherited() == 43
assert overridden.inherited() == 43
assert "inherited" not in overridden.__dict__

# Repeated class creation must capture each definition's prototype and target.
instances = []
for index in range(3):

    class Repeated:
        def first(self, value=index):
            return value

        def second(self, value=index + 10):
            return value

    instances.append(Repeated())

assert [item.first() for item in instances] == [0, 1, 2]
assert [item.second() for item in instances] == [10, 11, 12]
assert instances[0].first.__self__ is instances[0]
assert instances[0].first.__func__ is not instances[1].first.__func__

print("method-binding-oracle-ok")
