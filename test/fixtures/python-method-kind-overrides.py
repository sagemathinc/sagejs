class Base:
    @staticmethod
    def choose(value):
        return ("base-static", value)

    @classmethod
    def factory(cls, value):
        return ("base-class", cls.__name__, value)


class Derived(Base):
    @classmethod
    def choose(cls, value):
        return ("derived-class", cls.__name__, super().choose(value))

    @staticmethod
    def factory(value):
        return ("derived-static", value)


assert Base.choose(1) == ("base-static", 1)
assert Base.factory(2) == ("base-class", "Base", 2)
assert Derived.choose(3) == ("derived-class", "Derived", ("base-static", 3))
assert Derived().choose(4) == ("derived-class", "Derived", ("base-static", 4))
assert Derived.factory(5) == ("derived-static", 5)
assert Derived().factory(6) == ("derived-static", 6)


class Plain(Base):
    def choose(self, value):
        return ("plain-instance", value)

    def factory(self, value):
        return ("plain-instance-factory", value)


assert Plain().choose(7) == ("plain-instance", 7)
assert Plain().factory(8) == ("plain-instance-factory", 8)


class Root:
    def value(self):
        return "root"


class Left(Root):
    pass


class Right(Root):
    def value(self):
        return "right"


class Join(Left, Right):
    pass


# A JavaScript primary-prototype walk finds Root before Right; Python's C3
# order finds Right first, including for an inherited secondary-base method.
assert Join().value() == "right"
