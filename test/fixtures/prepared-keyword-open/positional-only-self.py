def external(self, /, value):
    return value


class Target:
    pass


Target.method = external
target = Target()
saved = target.method
results = []
for operation in (
    lambda: target.method(value=3),
    lambda: saved(value=3),
    lambda: Target.method(target, value=3),
):
    try:
        results.append(operation())
    except TypeError:
        results.append("TypeError")
print(results)
assert results == [3, 3, 3]
