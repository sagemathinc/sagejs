"""Dynamic callable classes and inherited callable slots retain exact type."""


def invoke(self):
    return 23


Dynamic = type(
    "DynamicCallable",
    (),
    {"__call__": invoke, "constructor": 91, "__python_type__": str},
)
value = Dynamic()
assert type(value) is Dynamic
assert value() == 23
value.constructor = int
value.__python_type__ = list
assert type(value) is Dynamic
assert value() == 23

Child = type("DynamicCallableChild", (Dynamic,), {})
child = Child()
assert type(child) is Child
assert child() == 23
print("dynamic callable passed")
