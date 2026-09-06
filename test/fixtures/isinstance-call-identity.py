import builtins

original = builtins.isinstance
events = []

assert isinstance is original
assert builtins.isinstance is original
for check in [isinstance, builtins.isinstance, original]:
    assert check(1, int) is True
    assert check("text", int) is False
    assert check(1, (str, (float, int))) is True
    assert check(1, ()) is False
    assert check(1, (int, [])) is True
    assert check(*[1, int]) is True
    assert check(*(1,), *(int,), **{}) is True
    for call in [
        lambda: check(),
        lambda: check(1),
        lambda: check(1, int, str),
        lambda: check(1, [int]),
        lambda: check(1, ([], int)),
        lambda: check(value=1, classinfo=int),
        lambda: check(**{"value": 1, "classinfo": int}),
        lambda: check(*(1, int, str)),
    ]:
        try:
            call()
        except TypeError:
            pass
        else:
            raise AssertionError("first-class builtin must reject invalid calls")

# Bare calls exercise the spelling that previously bypassed ordinary dispatch.
assert isinstance(1, (str, (float, int))) is True
assert isinstance(1, ()) is False
assert isinstance(1, (int, [])) is True
assert isinstance(*(1,), *(int,), **{}) is True


def shadow(*args, **kwargs):
    return ("shadow", args, kwargs)


def parameter(isinstance):
    return isinstance(value=1, arbitrary=2)


assert parameter(shadow) == ("shadow", (), {"value": 1, "arbitrary": 2})


def closure():
    isinstance = shadow

    def invoke():
        return isinstance(7)

    return invoke()


assert closure() == ("shadow", (7,), {})


class ClassBody:
    isinstance = staticmethod(shadow)
    answer = isinstance(flag=3)


assert ClassBody.answer == ("shadow", (), {"flag": 3})

isinstance = shadow
assert isinstance() == ("shadow", (), {})
assert isinstance(1, 2, 3) == ("shadow", (1, 2, 3), {})
del isinstance
assert isinstance(1, int) is True
assert isinstance(*[1, int]) is True
assert isinstance(1, int, **{}) is True


def argument():
    events.append("argument")
    return 1


for call in [
    lambda: isinstance(argument()),
    lambda: isinstance(argument(), int, object),
    lambda: isinstance(value=argument(), classinfo=int),
    lambda: isinstance(argument(), [int]),
]:
    events.clear()
    try:
        call()
    except TypeError:
        pass
    else:
        raise AssertionError("builtin call must fail at runtime")
    assert events == ["argument"]


def unbound_local():
    answer = isinstance(argument(), int)
    isinstance = shadow
    return answer


events.clear()
try:
    unbound_local()
except UnboundLocalError:
    pass
else:
    raise AssertionError("callee lookup must observe unbound local")
assert events == []


def replace_during_argument():
    builtins.isinstance = shadow
    events.append("replace")
    return 1


try:
    # Callee is captured before arguments mutate the public builtin binding.
    assert isinstance(replace_during_argument(), int) is True
    assert isinstance(4, flag=5) == ("shadow", (4,), {"flag": 5})
    assert builtins.isinstance(4, flag=5) == ("shadow", (4,), {"flag": 5})
    assert isinstance(*[8], **{"flag": 9}) == ("shadow", (8,), {"flag": 9})
    assert original(1, int) is True
    del builtins.isinstance
    try:
        isinstance(argument(), int)
    except NameError:
        pass
    else:
        raise AssertionError("deleted builtin must fail name lookup")
    assert events == ["replace"]
finally:
    builtins.isinstance = original
