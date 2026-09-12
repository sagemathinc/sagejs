"""Required live constructor-signature gate; not fixed by invocation alone."""


class Ordinary:
    def __init__(self, old=1):
        self.value = old


class Callable:
    def __init__(self, old=1):
        self.value = old

    def __call__(self):
        return self.value


class Child(Ordinary):
    pass


class CallableChild(Callable):
    pass


for cls in (Ordinary, Callable, Child, CallableChild):
    assert cls(old=2).value == 2


def assigned(self, new, *, scale=1):
    self.value = new * scale


Ordinary.__init__ = assigned
Callable.__init__ = assigned
for cls in (Ordinary, Callable, Child, CallableChild):
    assert cls(new=3, scale=4).value == 12
    assert cls(5, scale=6).value == 30
    try:
        cls(old=2)
    except TypeError:
        pass
    else:
        raise AssertionError("stale initializer signature accepted")
    try:
        cls(1, new=2)
    except TypeError:
        pass
    else:
        raise AssertionError("duplicate argument accepted")


class Grandchild(Child):
    pass


assert Grandchild(new=7, scale=8).value == 56


def positional_only(self, new, /, *, scale=1):
    self.value = new * scale


Ordinary.__init__ = positional_only
Callable.__init__ = positional_only
for cls in (Ordinary, Callable, Child, CallableChild, Grandchild):
    arguments = {"scale": 3}
    assert cls(7, **arguments).value == 21
    assert arguments == {"scale": 3}
    try:
        cls(new=7, scale=3)
    except TypeError:
        pass
    else:
        raise AssertionError("positional-only argument accepted by keyword")


def callable_replacement(self, *, value):
    self.value = value


Callable.__init__ = callable_replacement
assert CallableChild(value=17)() == 17

print("dynamic-init-keywords-ok")
