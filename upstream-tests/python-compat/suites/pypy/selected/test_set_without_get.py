def test_set_without_get():
    class Descr(object):

        def __init__(self, name):
            self.name = name

        def __set__(self, obj, value):
            obj.__dict__[self.name] = value
    descr = Descr("a")

    class X(object):
        a = descr

    x = X()
    assert x.a is descr
    x.a = 42
    assert x.a == 42


test_set_without_get()
