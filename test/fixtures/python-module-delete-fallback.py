import builtins

len = lambda value: 99
lambda_reader = lambda: len([1, 2])


def function_reader():
    return len([1, 2, 3])


assert lambda_reader() == 99
assert function_reader() == 99
del len
assert lambda_reader() == 2
assert function_reader() == 3

abs = lambda value: 77
absolute_reader = lambda: abs(-4)


def delete_global():
    global abs
    del abs


assert absolute_reader() == 77
delete_global()
assert absolute_reader() == 4

missing_after_delete = 42
read_missing = lambda: missing_after_delete
del missing_after_delete
try:
    read_missing()
except NameError:
    pass
else:
    raise AssertionError("deleted module binding remained visible")

min = lambda values: -1
max = lambda values: -1
extrema = lambda: (min([2, 3]), max([2, 3]))
del min, max
assert extrema() == (2, 3)


# A local deletion must not fall back to a builtin.
def local_delete():
    len = 9
    del len
    return len


try:
    local_delete()
except UnboundLocalError:
    pass
else:
    raise AssertionError("deleted local fell through to builtins")

assert builtins.len([1]) == 1


def double_delete():
    value = 1
    del value
    del value


try:
    double_delete()
except UnboundLocalError as error:
    assert isinstance(error, NameError)
    assert isinstance(error, Exception)
    assert len(error.args) == 1
else:
    raise AssertionError("deleting an unbound local must fail")


def enclosing():
    value = 1

    def read_cell():
        nonlocal value
        return value

    del value
    return read_cell


try:
    enclosing()()
except NameError as error:
    assert not isinstance(error, UnboundLocalError)
else:
    raise AssertionError("empty enclosing cell must raise NameError")

error = UnboundLocalError("missing")
assert error.args == ("missing",)
assert str(error) == "missing"
assert isinstance(error, NameError)
assert isinstance(error, Exception)
