"""Min-heap queue algorithms."""


def _siftup(heap, position):
    item = heap[position]
    while position > 0:
        parent = (position - 1) // 2
        if not item < heap[parent]:
            break
        heap[position] = heap[parent]
        position = parent
    heap[position] = item


def _siftdown(heap, position):
    length = len(heap)
    item = heap[position]
    while True:
        left = 2 * position + 1
        if left >= length:
            break
        right = left + 1
        child = right if right < length and heap[right] < heap[left] else left
        if not heap[child] < item:
            break
        heap[position] = heap[child]
        position = child
    heap[position] = item


def heappush(heap, item):
    heap.append(item)
    _siftup(heap, len(heap) - 1)


def heappop(heap):
    if not heap:
        raise IndexError('index out of range')
    last = heap.pypop()
    if not heap:
        return last
    answer = heap[0]
    heap[0] = last
    _siftdown(heap, 0)
    return answer


def heapreplace(heap, item):
    if not heap:
        raise IndexError('index out of range')
    answer = heap[0]
    heap[0] = item
    _siftdown(heap, 0)
    return answer


def heappushpop(heap, item):
    if heap and heap[0] < item:
        item, heap[0] = heap[0], item
        _siftdown(heap, 0)
    return item


def heapify(heap):
    for position in range(len(heap) // 2 - 1, -1, -1):
        _siftdown(heap, position)


class _MergeEntry:
    def __init__(self, value, key_value, order, iterator, reverse):
        self.value = value
        self.key_value = key_value
        self.order = order
        self.iterator = iterator
        self.reverse = reverse

    def __lt__(self, other):
        if self.reverse:
            if other.key_value < self.key_value:
                return True
            if self.key_value < other.key_value:
                return False
        else:
            if self.key_value < other.key_value:
                return True
            if other.key_value < self.key_value:
                return False
        return self.order < other.order


def merge(*iterables, key=None, reverse=False):
    heap = []
    for order, iterable in enumerate(iterables):
        iterator = iter(iterable)
        try:
            value = next(iterator)
        except StopIteration:
            continue
        key_value = value if key is None else key(value)
        heappush(
            heap,
            _MergeEntry(value, key_value, order, iterator, reverse))

    while heap:
        entry = heap[0]
        yield entry.value
        try:
            entry.value = next(entry.iterator)
        except StopIteration:
            heappop(heap)
            continue
        entry.key_value = entry.value if key is None else key(entry.value)
        heapreplace(heap, entry)


def nsmallest(n, iterable, key=None):
    if n <= 0:
        return []
    return sorted(iterable, key=key)[:n]


def nlargest(n, iterable, key=None):
    if n <= 0:
        return []
    return sorted(iterable, key=key, reverse=True)[:n]
