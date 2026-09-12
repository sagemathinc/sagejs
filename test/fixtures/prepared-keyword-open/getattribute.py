events = []


class Base:
    value = 1

    def __getattribute__(self, name):
        events.append(name)
        if name == "value":
            return 41
        return object.__getattribute__(self, name)

    def method(self, value):
        return value


class Target(Base):
    pass


target = Target()
results = []
for operation in (
    lambda: target.value,
    lambda: getattr(target, "value"),
    lambda: object.__getattribute__(target, "value"),
    lambda: target.method(3),
    lambda: target.method(value=3),
):
    events.clear()
    try:
        result = operation()
    except AttributeError:
        result = "AttributeError"
    except TypeError:
        result = "TypeError"
    results.append((result, list(events)))
print(results)
assert results == [
    (41, ["value"]),
    (41, ["value"]),
    (1, []),
    (3, ["method"]),
    (3, ["method"]),
]
