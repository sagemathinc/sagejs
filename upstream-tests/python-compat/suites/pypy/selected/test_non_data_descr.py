def test_non_data_descr():
    class X(object):
        def f(self):
            return 42
    x = X()
    assert x.f() == 42
    x.f = 43
    assert x.f == 43
    del x.f
    assert x.f() == 42


test_non_data_descr()
