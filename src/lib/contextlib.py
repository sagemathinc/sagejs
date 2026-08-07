"""Utilities for common context-manager patterns."""

from functools import wraps


class AbstractContextManager:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        del exc_type, exc_value, traceback
        return None


class ContextDecorator:
    def _recreate_cm(self):
        return self

    def __call__(self, function):
        @wraps(function)
        def inner(*args, **keywords):
            with self._recreate_cm():
                return function(*args, **keywords)
        return inner


class closing(AbstractContextManager):
    def __init__(self, thing):
        self.thing = thing

    def __enter__(self):
        return self.thing

    def __exit__(self, *unused):
        del unused
        self.thing.close()
        return False


class nullcontext(AbstractContextManager):
    def __init__(self, enter_result=None):
        self.enter_result = enter_result

    def __enter__(self):
        return self.enter_result


class suppress(AbstractContextManager):
    def __init__(self, *exceptions):
        self._exceptions = exceptions

    def __exit__(self, exc_type, exc_value, traceback):
        del exc_value, traceback
        return exc_type is not None and issubclass(exc_type, self._exceptions)


class ExitStack(AbstractContextManager):
    def __init__(self):
        self._exit_callbacks = []

    def push(self, exit):
        callback = exit.__exit__ if hasattr(exit, '__exit__') else exit
        self._exit_callbacks.append(callback)
        return exit

    def callback(self, callback, *args, **kwargs):
        def exit_callback(exc_type, exc_value, traceback):
            del exc_type, exc_value, traceback
            callback(*args, **kwargs)
            return False
        self._exit_callbacks.append(exit_callback)
        return callback

    def enter_context(self, context_manager):
        result = context_manager.__enter__()
        self._exit_callbacks.append(context_manager.__exit__)
        return result

    def pop_all(self):
        other = type(self)()
        other._exit_callbacks = self._exit_callbacks
        self._exit_callbacks = []
        return other

    def close(self):
        self.__exit__(None, None, None)

    def __exit__(self, exc_type, exc_value, traceback):
        suppressed = False
        while self._exit_callbacks:
            callback = self._exit_callbacks.pop()
            if callback(exc_type, exc_value, traceback):
                exc_type = exc_value = traceback = None
                suppressed = True
        return suppressed


class _GeneratorContextManager(ContextDecorator, AbstractContextManager):
    def __init__(self, function, args, keywords):
        self.function = function
        self.args = args
        self.keywords = keywords
        self.generator = function(*args, **keywords)

    def _recreate_cm(self):
        return type(self)(self.function, self.args, self.keywords)

    def __enter__(self):
        try:
            return next(self.generator)
        except StopIteration:
            raise RuntimeError("generator didn't yield")

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is None:
            try:
                next(self.generator)
            except StopIteration:
                return False
            raise RuntimeError("generator didn't stop")
        try:
            self.generator.throw(exc_type, exc_value, traceback)
        except StopIteration as stop:
            return stop is not exc_value
        except exc_type:
            return False
        raise RuntimeError("generator didn't stop after throw()")


def contextmanager(function):
    @wraps(function)
    def helper(*args, **keywords):
        return _GeneratorContextManager(function, args, keywords)
    return helper
