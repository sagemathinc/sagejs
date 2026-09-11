class Callable:
    def __call__(self, value=1):
        return value + 1


c = Callable()
assert c(2) == 3
saved = c.__call__


def replacement(self, value=4):
    assert self is c
    return value + 10


Callable.__call__ = replacement
assert c(3) == 13
assert c(value=5) == 15
assert c(*[6]) == 16
assert c(**{"value": 7}) == 17
assert saved(8) == 9
c.__call__ = lambda value=0: -1
assert c.__call__(2) == -1
assert c(2) == 12
assert c(value=2) == 12

Callable.__call__ = staticmethod(lambda value=3: value * 2)
assert c(5) == 10
assert c(value=6) == 12
Callable.__call__ = None
try:
    c(1)
except TypeError:
    pass
else:
    raise AssertionError("None call slot was accepted")

print("callable-slot-mutation-ok")
