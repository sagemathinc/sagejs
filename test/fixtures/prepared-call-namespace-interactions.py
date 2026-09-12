events = []


class Plain:
    def imported(self, value):
        return (self.tag, "plain", value)


class Meta(type):
    @classmethod
    def __prepare__(mcls, name, bases):
        return {"imported": Plain.imported}


class Prepared(metaclass=Meta):
    def method(self, value):
        return (self.tag, "prepared", value)

    alias = method
    imported_alias = imported

    @property
    def callback(self):
        events.append("get")
        return self.method

    @property
    def missing_callback(self):
        events.append("missing-get")
        raise AttributeError("use fallback")

    def __getattr__(self, name):
        events.append("fallback:" + name)
        return lambda value: ("fallback", value)

    @staticmethod
    def static(value):
        return ("static", value)

    static_alias = static

    @classmethod
    def class_method(cls, value):
        return (cls, value)

    class_alias = class_method


class Child(Prepared):
    pass


p = Prepared()
p.tag = "P"
c = Child()
c.tag = "C"
assert p.method(1) == ("P", "prepared", 1)
assert p.alias(2) == ("P", "prepared", 2)
assert p.imported_alias(3) == ("P", "plain", 3)
assert c.imported_alias(4) == ("C", "plain", 4)
assert Prepared.alias is Prepared.method
assert p.alias.__func__ is Prepared.method
assert Prepared.imported_alias is Plain.imported
assert p.imported_alias.__func__ is Plain.imported
assert Prepared.static_alias is Prepared.static
assert p.static_alias(5) == ("static", 5)
assert c.class_alias(6) == (Child, 6)


class Legacy:
    method = Prepared.method


legacy = Legacy()
legacy.tag = "L"
assert legacy.method(7) == ("L", "prepared", 7)


def replacement(self, value):
    return (self.tag, "replacement", value)


def mutate():
    events.append("arg")
    Prepared.method = replacement
    return 8


p.__dict__["callback"] = lambda value: "wrong shadow"
saved = p.alias
assert p.callback(mutate()) == ("P", "prepared", 8)
assert events == ["get", "arg"]
assert p.callback(9) == ("P", "replacement", 9)
assert saved(10) == ("P", "prepared", 10)
p.alias = lambda value: ("own", value)
assert p.alias(11) == ("own", 11)


class Data:
    def __get__(self, instance, owner):
        return lambda value: ("data", value)

    def __set__(self, instance, value):
        pass


Prepared.alias = Data()
assert p.alias(12) == ("data", 12)
events.clear()
assert p.missing_callback(mutate()) == ("fallback", 8)
assert events == ["missing-get", "fallback:missing_callback", "arg"]
print("prepared-call-namespace-interactions-ok")
