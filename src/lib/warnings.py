"""Compatible core of :mod:`warnings` for pure-Python packages.

Node does not expose CPython's warning registry, but package initialization
mostly needs filtering, ``catch_warnings``, and the modern ``deprecated``
decorator.  This module keeps those APIs deterministic and sends visible
warnings through the host console.
"""

import functools
import sagejs.runtime as runtime


filters = []
defaultaction = 'default'
onceregistry = {}


def filterwarnings(
    action,
    message='',
    category=Warning,
    module='',
    lineno=0,
    append=False,
):
    entry = (action, message, category, module, lineno)
    if append:
        filters.append(entry)
    else:
        filters.insert(0, entry)


def simplefilter(action, category=Warning, lineno=0, append=False):
    filterwarnings(action, category=category, lineno=lineno, append=append)


def resetwarnings():
    filters.clear()


def _action_for(category):
    for action, _message, selected, _module, _lineno in filters:
        if issubclass(category, selected):
            return action
    return defaultaction


def warn(message, category=None, stacklevel=1, source=None):
    if category is None:
        category = UserWarning
    if isinstance(message, Warning):
        category = type(message)
        text = str(message)
    else:
        text = str(message)
    action = _action_for(category)
    if action == 'ignore':
        return None
    if action == 'error':
        raise category(text)
    process.emitWarning(text, {'type': category.__name__})
    return None


def warn_explicit(
    message,
    category,
    filename,
    lineno,
    module=None,
    registry=None,
    module_globals=None,
    source=None,
):
    return warn(message, category=category)


class catch_warnings:
    def __init__(self, record=False, module=None):
        self._record = record
        self._saved = None
        self._log = []

    def __enter__(self):
        self._saved = list(filters)
        return self._log if self._record else None

    def __exit__(self, exception_type, exception, traceback):
        filters.clear()
        filters.extend(self._saved)
        return False


def deprecated(message, *, category=DeprecationWarning, stacklevel=1):
    """Mark a function or class deprecated, following Python 3.13's API."""
    def decorate(value):
        if isinstance(value, type):
            original = value.__init__

            @functools.wraps(original)
            def initialize(self, *args, **kwargs):
                warn(message, category=category, stacklevel=stacklevel + 1)
                original(self, *args, **kwargs)

            value.__init__ = initialize
            return value

        @functools.wraps(value)
        def wrapper(*args, **kwargs):
            warn(message, category=category, stacklevel=stacklevel + 1)
            return value(*args, **kwargs)

        return wrapper
    return decorate
