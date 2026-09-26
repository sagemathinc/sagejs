class ExhaustedWithValue:
    def __iter__(self):
        return self

    def __next__(self):
        raise StopIteration("done")


print("valued stop", list(map(lambda value: value, ExhaustedWithValue())))
print("none", list(map(lambda value: value, [None, 2])))

calls = []


def combine(left, right):
    calls.append((left, right))
    return left + right


print("shortest", list(map(combine, [1, 2, 3], [10])), calls)


def generator():
    yield 5
    return "done"


print("generator return", list(map(lambda value: value, generator())))


def stop_in_callback(value):
    raise StopIteration("callback")


stopped = map(stop_in_callback, [1, 2])
try:
    next(stopped)
except StopIteration as error:
    print("callback stop", error.value)
print("callback list", list(map(stop_in_callback, [1, 2])))

stopped_pair = map(lambda left, right: stop_in_callback(left), [1], [2])
try:
    next(stopped_pair)
except StopIteration as error:
    print("paired callback stop", error.value)
