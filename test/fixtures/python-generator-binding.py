def test_call_time():
    def gen(required, *, flag):
        yield required, flag

    for args, kwargs in (((), {}), ((1,), {}), ((1, 2), {"flag": True})):
        try:
            gen(*args, **kwargs)
        except TypeError:
            pass
        else:
            raise AssertionError("binding was deferred until resume")


def test_bound_defaults():
    def gen(value=1, *, flag=3):
        yield value, flag

    iterator = gen()
    gen.__defaults__ = (2,)
    gen.__kwdefaults__["flag"] = 4
    assert next(iterator) == (1, 3)
    assert next(gen()) == (2, 4)


def test_parameter_assignment():
    def gen(value):
        value += 1
        yield value
        value += 1
        yield value

    first, second = gen(2), gen(10)
    assert next(first) == 3
    assert next(second) == 11
    assert next(first) == 4
    assert next(second) == 12


def test_bound_keywords():
    def gen(value, /, *items, flag=2, **keywords):
        yield value, items, flag, keywords

    assert next(gen(1, 3, 4, flag=5, extra=6)) == (1, (3, 4), 5, {"extra": 6})


def test_method_receiver():
    class C:
        def gen(self, value=1):
            yield self, value

        @classmethod
        def cls_gen(cls, value=1):
            yield cls, value

        @staticmethod
        def static_gen(value=1):
            yield value

    instance = C()
    assert next(instance.gen()) == (instance, 1)
    assert next(C.gen(instance, 2)) == (instance, 2)
    assert next(C.cls_gen(3)) == (C, 3)
    assert next(instance.static_gen(4)) == 4


def test_rebound_name():
    def gen(value=1):
        yield value

    iterator = gen()
    gen = None
    assert next(iterator) == 1


def test_binding_context():
    def gen(value):
        yield value

    def ordinary(value):
        return value

    outer = KeyError("caller")
    try:
        raise outer
    except KeyError:
        for function in (gen, ordinary):
            try:
                function(1, 2)
            except TypeError as error:
                assert error.__context__ is outer
            else:
                raise AssertionError("binding was deferred")
