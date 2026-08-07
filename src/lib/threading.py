"""Small single-thread-compatible portion of :mod:`threading`.

JavaScript workers do not share Python object heaps, so ordinary module code
executes in one thread.  These synchronization objects therefore retain the
CPython API while providing the correct uncontended behavior.
"""


class local:
    pass


class ExceptHookArgs:
    """Container shape accepted by :data:`threading.excepthook`."""

    def __init__(self, values=()):
        values = tuple(values)
        self.exc_type = values[0] if len(values) > 0 else None
        self.exc_value = values[1] if len(values) > 1 else None
        self.exc_traceback = values[2] if len(values) > 2 else None
        self.thread = values[3] if len(values) > 3 else None


def _default_excepthook(args):
    """Report an uncaught worker exception through the ordinary hook."""
    import sys
    sys.excepthook(args.exc_type, args.exc_value, args.exc_traceback)


excepthook = _default_excepthook
__excepthook__ = _default_excepthook


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


def main_thread():
    return _main_thread


def get_ident():
    return _main_thread.ident


class _MainThread:
    name = 'MainThread'
    ident = 1
    daemon = False

    def is_alive(self):
        return True


_main_thread = _MainThread()
