"""Small single-thread-compatible portion of :mod:`threading`.

JavaScript workers do not share Python object heaps, so ordinary module code
executes in one thread.  These synchronization objects therefore retain the
CPython API while providing the correct uncontended behavior.
"""


class local:
    pass


class RLock:
    def __init__(self):
        self._depth = 0

    def acquire(self, blocking=True, timeout=-1):
        del blocking, timeout
        self._depth += 1
        return True

    def release(self):
        if self._depth <= 0:
            raise RuntimeError('cannot release un-acquired lock')
        self._depth -= 1

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        del exc_type, exc_value, traceback
        self.release()
        return False


Lock = RLock


def current_thread():
    return _main_thread


class _MainThread:
    name = 'MainThread'
    ident = 1
    daemon = False

    def is_alive(self):
        return True


_main_thread = _MainThread()
