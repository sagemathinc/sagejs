"""Exercise common Python equality and ordering dispatch shapes."""

from time import perf_counter


def report(name, answer, elapsed):
    print(name, answer, elapsed)


started = perf_counter()
primitive_equal = 0
for index in range(1_000_000):
    primitive_equal += index == index % 997
report('primitive-equality', primitive_equal, perf_counter() - started)


started = perf_counter()
primitive_order = 0
for index in range(1_000_000):
    primitive_order += index % 97 < 48
report('primitive-ordering', primitive_order, perf_counter() - started)


started = perf_counter()
primitive_truth = 0
for index in range(1_000_000):
    primitive_truth += bool(index % 2)
report('primitive-truthiness', primitive_truth, perf_counter() - started)


class Comparable:

    def __init__(self, value):
        self.value = value

    def __eq__(self, other):
        return self.value == other.value

    def __lt__(self, other):
        return self.value < other.value


left = Comparable(17)
right = Comparable(23)

started = perf_counter()
object_equal = 0
for _index in range(250_000):
    object_equal += left == right
report('object-equality', object_equal, perf_counter() - started)


started = perf_counter()
object_order = 0
for _index in range(250_000):
    object_order += left < right
report('object-ordering', object_order, perf_counter() - started)


started = perf_counter()
object_truth = 0
for _index in range(250_000):
    object_truth += bool(left)
report('object-truthiness', object_truth, perf_counter() - started)
