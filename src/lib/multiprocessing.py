"""Process-like parallelism backed by Sage.js worker threads.

The initial Sage.js implementation provides the familiar synchronous
``Pool.map`` and ``Pool.starmap`` interfaces.  Workers are persistent isolated
Sage.js evaluators in one operating-system process.  This is well suited to
CPU-bound research computations and avoids exposing Node.js primitives to
Python code.

Task functions and values cross an isolation boundary.  Module-level
functions and self-contained top-level functions work; closures do not yet.
The first serializer supports ``None``, booleans, strings, numbers, exact
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
    return runtime.reflect.get(runtime.global_object, '__sagejs_host__')


def _host_call(operation, *args):
    host = _host_object()
    if host is runtime.undefined:
        raise NotImplementedError(
            'multiprocessing requires a worker-thread host capability'
        )
    method = runtime.reflect.get(host, 'call')
    result = runtime.reflect.apply(method, host, [operation, list(args)])
    if not _property(result, 'ok', False):
        error = _property(result, 'error')
        remote_name = _property(error, 'remoteName', None)
        remote_message = _property(error, 'remoteMessage', None)
        if remote_name is not None:
            if remote_message is None:
                remote_message = _property(
                    error, 'message', 'multiprocessing worker failed')
            if remote_name == 'TypeError':
                exception_class = TypeError
            elif remote_name == 'ValueError':
                exception_class = ValueError
            elif remote_name == 'ZeroDivisionError':
                exception_class = ZeroDivisionError
            elif remote_name == 'NotImplementedError':
                exception_class = NotImplementedError
            elif remote_name == 'OSError':
                exception_class = OSError
            else:
                exception_class = RuntimeError
            if exception_class is RuntimeError and remote_name != 'RuntimeError':
                remote_message = remote_name + ': ' + remote_message
            raise exception_class(remote_message)
        name = _property(error, 'name', 'RuntimeError')
        message = _property(error, 'message', 'multiprocessing worker failed')
        raise RuntimeError(name + ': ' + message)
    return _property(result, 'value')


def cpu_count():
    """Return the number of CPUs available to this Sage.js process."""
    return os.cpu_count()


class Pool:
    """A persistent pool of isolated Sage.js worker evaluators.

    ``processes`` defaults to :func:`cpu_count`.  The API is synchronous and
    preserves input order, matching Python's ``multiprocessing.Pool`` for the
    currently implemented methods.
    """

    def __init__(self, processes=None, initializer=None, initargs=(),
                 maxtasksperchild=None):
        if initializer is not None:
            raise NotImplementedError('Pool initializer is not implemented yet')
        if initargs:
            raise ValueError('initargs requires an initializer')
        if maxtasksperchild is not None:
            raise NotImplementedError(
                'Pool maxtasksperchild is not implemented yet'
            )
        if processes is None:
            processes = cpu_count() or 1
        if not isinstance(processes, int) or processes < 1:
            raise ValueError('Number of processes must be at least 1')
        self._processes = processes
        self._pool_id = _host_call('multiprocessingCreatePool', processes)
        self._state = 'RUN'

    def _check_running(self):
        if self._state != 'RUN':
            raise ValueError('Pool not running')

    def map(self, func, iterable, chunksize=None):
        """Apply ``func`` to every item and return results in input order."""
        self._check_running()
        if chunksize is not None and chunksize < 1:
            raise ValueError('Chunksize must be 1+, not ' + repr(chunksize))
        values = list(iterable)
        return list(_host_call(
            'multiprocessingMap', self._pool_id, func, values, False
        ))

    def starmap(self, func, iterable, chunksize=None):
        """Apply ``func(*args)`` to each argument sequence in order."""
        self._check_running()
        if chunksize is not None and chunksize < 1:
            raise ValueError('Chunksize must be 1+, not ' + repr(chunksize))
        values = [list(argument_values) for argument_values in iterable]
        return list(_host_call(
            'multiprocessingMap', self._pool_id, func, values, True
        ))

    def close(self):
        """Finish outstanding work and release the workers."""
        if self._state == 'RUN':
            _host_call('multiprocessingClosePool', self._pool_id)
            self._state = 'CLOSE'

    def terminate(self):
        """Release the workers.

        The current synchronous API has no outstanding work when this method
        can run, so termination and orderly close are equivalent.
        """
        self.close()

    def join(self):
        """Wait for worker shutdown after :meth:`close` or :meth:`terminate`."""
        if self._state == 'RUN':
            raise ValueError('Pool is still running')

    def __enter__(self):
        self._check_running()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.terminate()
        return False


def get_start_method(allow_none=False):
    """Return ``'sagejs-worker'`` for the worker-thread execution model."""
    return 'sagejs-worker'


def get_all_start_methods():
    """Return the execution models supported by this runtime."""
    return ['sagejs-worker']
