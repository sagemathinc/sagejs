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


def merge(*iterables, key=None, reverse=False):
    values = []
    for iterable in iterables:
        values.extend(iterable)
    values.sort(key=key, reverse=reverse)
    return iter(values)


def nsmallest(count, iterable, key=None):
    return sorted(iterable, key=key)[:count]


def nlargest(count, iterable, key=None):
    return sorted(iterable, key=key, reverse=True)[:count]

