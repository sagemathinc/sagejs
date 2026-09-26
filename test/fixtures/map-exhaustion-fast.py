class ExhaustedWithValue:
    def __iter__(self):
        return self

    def __next__(self):
        raise StopIteration("done")


print("valued stop", list(map(lambda value: value, ExhaustedWithValue())))


class TransientStop:
    def __init__(self):
        self.position = 0

    def __iter__(self):
        return self

    def __next__(self):
        self.position += 1
        if self.position == 1:
            raise StopIteration(42)
        if self.position == 2:
            return 7
        raise StopIteration(99)


resumed_after_stop = map(lambda value: value, TransientStop())
try:
    next(resumed_after_stop)
except StopIteration as error:
    print("input stop args", error.args)
print("input stop resumes", next(resumed_after_stop))
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


def fail_once(value):
    if value == 1:
        raise ValueError("first")
    return value


resumable = map(fail_once, [1, 2])
try:
    next(resumable)
except ValueError as error:
    print("callback error", str(error))
print("callback resume", next(resumable), iter(resumable) is resumable)


def stop_first(value):
    if value == 1:
        raise StopIteration("first")
    return value


stopped_then_resumed = map(stop_first, [1, 2])
try:
    next(stopped_then_resumed)
except StopIteration as error:
    print("callback stop identity", error.value)
print("callback stop resumes", next(stopped_then_resumed))


class MutableCallable:
    def __call__(self, value):
        return value + 1


mutable_callback = map(MutableCallable(), [1, 2])
print("callable before mutation", next(mutable_callback))
MutableCallable.__call__ = lambda self, value: value + 10
print("callable after mutation", next(mutable_callback))


class TransientIteratorError:
    def __init__(self):
        self.position = 0

    def __iter__(self):
        return self

    def __next__(self):
        self.position += 1
        if self.position == 1:
            raise ValueError("input")
        if self.position == 2:
            return 7
        raise StopIteration


transient = map(lambda value: value, TransientIteratorError())
try:
    next(transient)
except ValueError as error:
    print("input error", str(error))
print("input resumes", next(transient))

stopped_pair = map(lambda left, right: stop_in_callback(left), [1], [2])
try:
    next(stopped_pair)
except StopIteration as error:
    print("paired callback stop", error.value)

events = []


class EagerIterable:
    def __iter__(self):
        events.append("iter")
        return iter([3])


eager = map(lambda value: value, EagerIterable())
print("eager", events, list(eager))
try:
    map(lambda: None)
except TypeError as error:
    print("no iterables", str(error))
