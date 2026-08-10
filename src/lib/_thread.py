"""Minimal native-thread primitives for Sage.js's single event-loop thread.

Synchronous Python execution cannot be preempted by another JavaScript task,
so these locks provide the standard API without pretending to create OS
threads.  Worker-backed concurrency lives in :mod:`threading` and
:mod:`multiprocessing` at a higher layer.
"""


class LockType:
    def __init__(self):
        self._locked = False

    def acquire(self, blocking=True, timeout=-1):
        del timeout
        if self._locked:
            if blocking:
                return False
            return False
        self._locked = True
        return True

    def release(self):
        if not self._locked:
            raise RuntimeError("release unlocked lock")
        self._locked = False

    def locked(self):
        return self._locked

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        del exc_type, exc_value, traceback
        self.release()


def allocate_lock():
    return LockType()


def get_ident():
    return 1


def get_native_id():
    return 1


def stack_size(size=None):
    if size is not None and size != 0:
        raise ValueError("custom thread stack sizes are not supported")
    return 0


TIMEOUT_MAX = 2147483647
error = RuntimeError
Lock = LockType
RLock = LockType
