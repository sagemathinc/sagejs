def test_nested_scope4():
    def f():
        x = 3
        def g():
            return x
        a = g()
        x = 4
        b = g()
        return (a, b)
    assert f() == (3, 4)


test_nested_scope4()
