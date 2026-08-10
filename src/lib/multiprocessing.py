"""Process-like parallelism backed by Sage.js worker threads.

Sage.js provides the familiar synchronous and asynchronous `Pool`
interfaces. Workers are persistent isolated Sage.js evaluators in one
operating-system process. This is well suited to CPU-bound research
computations and avoids exposing Node.js primitives to Python code.

Task functions and values cross an isolation boundary.  Module-level
functions and self-contained top-level functions work; closures do not yet.
The first serializer supports `None`, booleans, strings, numbers, exact
integers, and nested lists or tuples.
"""

import os
import sagejs.runtime as runtime


def _property(value, key, fallback=None):
    result = runtime.reflect.get(value, key)
    if result is runtime.undefined:
        return fallback
    return result


def _host_object():
    return runtime.reflect.get(runtime.global_object, "__sagejs_host__")


def _host_call(operation, *args):
    host = _host_object()
    if host is runtime.undefined:
        raise NotImplementedError(
            "multiprocessing requires a worker-thread host capability"
        )
    method = runtime.reflect.get(host, "call")
    result = runtime.reflect.apply(method, host, [operation, list(args)])
    if not _property(result, "ok", False):
        error = _property(result, "error")
        remote_name = _property(error, "remoteName", None)
        remote_message = _property(error, "remoteMessage", None)
        if remote_name is not None:
            if remote_message is None:
                remote_message = _property(
                    error, "message", "multiprocessing worker failed"
                )
            raise _remote_exception(remote_name, remote_message)
        name = _property(error, "name", "RuntimeError")
        message = _property(error, "message", "multiprocessing worker failed")
        raise _remote_exception(name, message)
    return _property(result, "value")


def _remote_exception(remote_name, remote_message):
    if remote_name == "TypeError":
        exception_class = TypeError
    elif remote_name == "ValueError":
        exception_class = ValueError
    elif remote_name == "ZeroDivisionError":
        exception_class = ZeroDivisionError
    elif remote_name == "NotImplementedError":
        exception_class = NotImplementedError
    elif remote_name == "OSError":
        exception_class = OSError
    elif remote_name == "KeyError":
        exception_class = KeyError
    elif remote_name == "IndexError":
        exception_class = IndexError
    elif remote_name == "AttributeError":
        exception_class = AttributeError
    elif remote_name == "OverflowError":
        exception_class = OverflowError
    elif remote_name == "AssertionError":
        exception_class = AssertionError
    elif remote_name == "ImportError":
        exception_class = ImportError
    elif remote_name == "NameError":
        exception_class = NameError
    else:
        exception_class = RuntimeError
    if exception_class is RuntimeError and remote_name != "RuntimeError":
        remote_message = remote_name + ": " + remote_message
    return exception_class(remote_message)


class TimeoutError(Exception):
    """Raised when an asynchronous pool result misses its deadline."""


class ApplyResult:
    """Result handle returned by :meth:`Pool.apply_async`.

    Callbacks run in the parent evaluator when the result is polled, waited
    for, retrieved, or collected by :meth:`Pool.join`. Sage.js deliberately
    does not add a Python-visible callback-handler thread.
    """

    def __init__(self, pool, job_id, single=False, callback=None, error_callback=None):
        self._pool = pool
        self._job_id = job_id
        self._single = single
        self._callback = callback
        self._error_callback = error_callback
        self._resolved = False
        self._success = False
        self._value = None

    def _resolve(self, timeout):
        if self._resolved:
            return True
        if timeout is None:
            timeout_ms = None
        else:
            timeout_ms = max(0, int(float(timeout) * 1000))
        result = _host_call(
            "multiprocessingJobResult",
            self._pool._pool_id,
            self._job_id,
            timeout_ms,
        )
        if not _property(result, "ready", False):
            return False
        self._success = _property(result, "ok", False)
        if self._success:
            values = list(_property(result, "value", []))
            if self._single:
                self._value = values[0]
            else:
                self._value = values
        else:
            error = _property(result, "error")
            self._value = _remote_exception(
                _property(error, "name", "RuntimeError"),
                _property(error, "message", "multiprocessing worker failed"),
            )
        self._resolved = True
        _host_call(
            "multiprocessingForgetJob",
            self._pool._pool_id,
            self._job_id,
        )
        pool = self._pool
        self._pool = None
        pool._discard_result(self)
        if self._success and self._callback is not None:
            self._callback(self._value)
        elif not self._success and self._error_callback is not None:
            self._error_callback(self._value)
        return True

    def ready(self):
        return self._resolve(0)

    def successful(self):
        if not self.ready():
            raise ValueError(repr(self) + " not ready")
        return self._success

    def wait(self, timeout=None):
        self._resolve(timeout)

    def get(self, timeout=None):
        if not self._resolve(timeout):
            raise TimeoutError()
        if self._success:
            return self._value
        raise self._value


AsyncResult = ApplyResult


class MapResult(ApplyResult):
    """Result handle returned by :meth:`Pool.map_async`."""


def cpu_count():
    """Return the number of CPUs available to this Sage.js process."""
    return os.cpu_count()


def _apply_call(func, args, kwds):
    """Worker-side adapter for `Pool.apply` keyword arguments."""
    return func(*args, **kwds)


class Pool:
    """A persistent pool of isolated Sage.js worker evaluators.

    `processes` defaults to :func:`cpu_count`. Results preserve input order;
    unordered iterators may return any completion order.
    """

    def __init__(
        self, processes=None, initializer=None, initargs=(), maxtasksperchild=None
    ):
        if initargs:
            if initializer is None:
                raise ValueError("initargs requires an initializer")
        if maxtasksperchild is not None:
            raise NotImplementedError("Pool maxtasksperchild is not implemented yet")
        if processes is None:
            processes = cpu_count() or 1
        if not isinstance(processes, int) or processes < 1:
            raise ValueError("Number of processes must be at least 1")
        self._processes = processes
        self._pool_id = _host_call(
            "multiprocessingCreatePool",
            processes,
            initializer,
            list(initargs),
        )
        self._async_results = []
        self._state = "RUN"

    def _check_running(self):
        if self._state != "RUN":
            raise ValueError("Pool not running")

    def map(self, func, iterable, chunksize=None):
        """Apply `func` to every item and return results in input order."""
        self._check_running()
        if chunksize is not None and chunksize < 1:
            raise ValueError("Chunksize must be 1+, not " + repr(chunksize))
        values = list(iterable)
        return list(
            _host_call("multiprocessingMap", self._pool_id, func, values, False)
        )

    def apply(self, func, args=(), kwds=None):
        """Apply `func` once in a worker and return its result."""
        self._check_running()
        if kwds is None:
            kwds = {}
        positional_values = list(args)
        keyword_values = dict(kwds)
        return list(
            _host_call(
                "multiprocessingMap",
                self._pool_id,
                _apply_call,
                [[func, positional_values, keyword_values]],
                True,
            )
        )[0]

    def _submit(
        self, func, values, star, single=False, callback=None, error_callback=None
    ):
        self._check_running()
        job_id = _host_call(
            "multiprocessingSubmitMap",
            self._pool_id,
            func,
            values,
            star,
        )
        if single:
            result_class = ApplyResult
        else:
            result_class = MapResult
        result = result_class(
            self,
            job_id,
            single=single,
            callback=callback,
            error_callback=error_callback,
        )
        self._async_results.append(result)
        return result

    def _discard_result(self, result):
        if result in self._async_results:
            self._async_results.remove(result)

    def apply_async(self, func, args=(), kwds=None, callback=None, error_callback=None):
        """Submit one call and return an :class:`AsyncResult` immediately."""
        if kwds is None:
            kwds = {}
        return self._submit(
            _apply_call,
            [[func, list(args), dict(kwds)]],
            True,
            single=True,
            callback=callback,
            error_callback=error_callback,
        )

    def map_async(
        self, func, iterable, chunksize=None, callback=None, error_callback=None
    ):
        """Submit an ordered map and return a :class:`MapResult`."""
        if chunksize is not None and chunksize < 1:
            raise ValueError("Chunksize must be 1+, not " + repr(chunksize))
        return self._submit(
            func,
            list(iterable),
            False,
            callback=callback,
            error_callback=error_callback,
        )

    def starmap(self, func, iterable, chunksize=None):
        """Apply `func(*args)` to each argument sequence in order."""
        self._check_running()
        if chunksize is not None and chunksize < 1:
            raise ValueError("Chunksize must be 1+, not " + repr(chunksize))
        values = [list(argument_values) for argument_values in iterable]
        return list(_host_call("multiprocessingMap", self._pool_id, func, values, True))

    def starmap_async(
        self, func, iterable, chunksize=None, callback=None, error_callback=None
    ):
        """Submit `func(*args)` calls and return a :class:`MapResult`."""
        if chunksize is not None and chunksize < 1:
            raise ValueError("Chunksize must be 1+, not " + repr(chunksize))
        values = [list(argument_values) for argument_values in iterable]
        return self._submit(
            func,
            values,
            True,
            callback=callback,
            error_callback=error_callback,
        )

    def imap(self, func, iterable, chunksize=1):
        """Return an ordered iterator of worker results.

        The current synchronous host computes the submitted batch before the
        iterator is returned. Iteration order and exceptions match CPython;
        streaming submission is reserved for the asynchronous pool layer.
        """
        if chunksize < 1:
            raise ValueError("Chunksize must be 1+, not " + repr(chunksize))
        return iter(self.map(func, iterable, chunksize))

    def imap_unordered(self, func, iterable, chunksize=1):
        """Return an iterator of worker results in an unspecified order.

        Ordered output is a valid unspecified order and keeps the initial
        synchronous worker protocol deterministic.
        """
        if chunksize < 1:
            raise ValueError("Chunksize must be 1+, not " + repr(chunksize))
        return iter(self.map(func, iterable, chunksize))

    def close(self):
        """Stop accepting work; pending tasks finish before :meth:`join`."""
        if self._state == "RUN":
            _host_call("multiprocessingClosePool", self._pool_id)
            self._state = "CLOSE"

    def terminate(self):
        """Stop the workers immediately and fail pending result handles."""
        if self._state != "TERMINATE":
            _host_call("multiprocessingTerminatePool", self._pool_id)
            self._state = "TERMINATE"

    def join(self):
        """Wait for worker shutdown after :meth:`close` or :meth:`terminate`."""
        if self._state == "RUN":
            raise ValueError("Pool is still running")
        _host_call("multiprocessingJoinPool", self._pool_id)
        for result in list(self._async_results):
            result.wait(0)

    def __enter__(self):
        self._check_running()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.terminate()
        return False


def get_start_method(allow_none=False):
    """Return `'sagejs-worker'` for the worker-thread execution model."""
    return "sagejs-worker"


def get_all_start_methods():
    """Return the execution models supported by this runtime."""
    return ["sagejs-worker"]
