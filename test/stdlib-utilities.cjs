"use strict";

// Focused compatibility vectors adapted from CPython's test_collections,
// test_functools, test_statistics, test_bisect, test_heapq, and
// test_contextlib suites.
const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

async function testUtilityModules() {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(
      [
        "from collections import Counter, defaultdict, ChainMap, deque, namedtuple",
        "counter = Counter('abracadabra')",
        "print(counter.most_common(3), counter.total(), sorted(counter.elements()))",
        "counter.subtract('aaaaz'); print(counter['a'], counter['z'], counter['missing'])",
        "print(Counter('ab') + Counter('bcc'))",
        "groups = defaultdict(list); groups['odd'].extend([1, 3]); print(groups['odd'], groups['even'])",
        "mapping = ChainMap({'x': 1}, {'x': 2, 'y': 3})",
        "mapping['z'] = 4; print(mapping['x'], mapping['y'], mapping['z'], sorted(mapping))",
        "queue = deque([1, 2, 3], maxlen=4); queue.rotate(); queue.appendleft(0); print(queue, queue.count(3), queue.index(1))",
        "Point = namedtuple('Point', 'x y'); point = Point(2, y=5); print(point, point.x, point[1])",
        "from functools import reduce, partial, lru_cache, cached_property, cmp_to_key",
        "print(reduce(lambda left, right: left + right, [1, 2, 3]), reduce(lambda left, right: left + right, [], None))",
        "power = partial(pow, 2); print(power(10), power.func is pow, power.args)",
        "@lru_cache(maxsize=2)",
        "def square(value): return value * value",
        "print(square(3), square(3), square(4), square.cache_info())",
        "class Sample:",
        "    def __init__(self):",
        "        self.calls = 0",
        "    @cached_property",
        "    def value(self):",
        "        self.calls += 1",
        "        return 17",
        "sample = Sample(); print(sample.value, sample.value, sample.calls)",
        "print(sorted(['bbb', 'a', 'cc'], key=cmp_to_key(lambda left, right: len(left) - len(right))))",
        "import statistics",
        "print(statistics.mean([1, 2, 3, 4]), statistics.median([1, 9, 3, 7]))",
        "print(statistics.pvariance([1, 2, 3]), statistics.variance([1, 2, 3]))",
        "print(round(statistics.geometric_mean([1, 4, 16]), 6), statistics.harmonic_mean([1, 2, 4]))",
        "print(statistics.mode([1, 2, 2, 3]), statistics.multimode('aabbbbccddd'))",
        "print(statistics.quantiles([1, 2, 3, 4, 5], method='inclusive'))",
        "print(statistics.covariance([1, 2, 3], [2, 4, 6]), statistics.correlation([1, 2, 3], [2, 4, 6]))",
        "print(statistics.linear_regression([1, 2, 3], [2, 4, 6]))",
        "import bisect, heapq",
        "values = [1, 3, 5]; bisect.insort(values, 4); print(values, bisect.bisect_left(values, 3), bisect.bisect(values, 3))",
        "heapq.heapify(values); print([heapq.heappop(values) for _ in range(len(values))])",
        "heap = [3, 5]; heapq.heapify(heap); print(heapq.heappushpop(heap, 4), heapq.nsmallest(2, [9, 1, 7, 2]))",
        "print(list(heapq.merge([1, 3, 5], [2, 4, 6])))",
        "print(list(heapq.merge([6, 4, 2], [5, 3, 1], reverse=True)))",
        "print(list(heapq.merge(['dog', 'horse'], ['cat', 'fish', 'kangaroo'], key=len)))",
        "consumed = []",
        "def sorted_source(label, values):",
        "    for value in values:",
        "        consumed.append(label + str(value))",
        "        yield value",
        "merged = heapq.merge(sorted_source('a', [1, 3]), sorted_source('b', [2, 4]))",
        "print(consumed); print(next(merged), consumed); print(next(merged), consumed)",
        "from contextlib import closing, contextmanager, nullcontext, suppress",
        "with suppress(KeyError): {'x': 1}['missing']",
        "with nullcontext(23) as value: print(value)",
        "events = []",
        "@contextmanager",
        "def managed():",
        "    events.append('enter')",
        "    try: yield 29",
        "    finally: events.append('exit')",
        "with managed() as value: events.append(value)",
        "print(events)",
      ].join("\n"),
    );
    assert.equal(
      result.stdout.trim(),
      [
        "[('a', 5), ('b', 2), ('r', 2)] 11 ['a', 'a', 'a', 'a', 'a', 'b', 'b', 'c', 'd', 'r', 'r']",
        "1 -1 0",
        "Counter({'a': 1, 'b': 2, 'c': 2})",
        "[1, 3] []",
        "1 3 4 ['x', 'y', 'z']",
        "deque([0, 3, 1, 2], maxlen=4) 1 2",
        "Point(x=2, y=5) 2 5",
        "6 None",
        "1024 True (2,)",
        "9 9 16 CacheInfo(hits=1, misses=2, maxsize=2, currsize=2)",
        "17 17 1",
        "['a', 'cc', 'bbb']",
        "2.5 5",
        "0.6666666666666666 1",
        "4 1.7142857142857142",
        "2 ['b']",
        "[2, 3, 4]",
        "2 1",
        "LinearRegression(slope=2, intercept=0)",
        "[1, 3, 4, 5] 1 2",
        "[1, 3, 4, 5]",
        "3 [1, 2]",
        "[1, 2, 3, 4, 5, 6]",
        "[6, 5, 4, 3, 2, 1]",
        "['dog', 'cat', 'fish', 'horse', 'kangaroo']",
        "[]",
        "1 ['a1', 'b2']",
        "2 ['a1', 'b2', 'a3']",
        "23",
        "['enter', 29, 'exit']",
      ].join("\n"),
    );
  } finally {
    await session.close();
  }
}

testUtilityModules()
  .then(() => console.log("Sage.js portable utility stdlib passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
