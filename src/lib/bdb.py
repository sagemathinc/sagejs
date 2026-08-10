"""Minimal debugger exceptions used by test runners.

Interactive tracing and breakpoint control are host-integration features and
are intentionally deferred; ``BdbQuit`` is part of the public exception
surface consumed by pytest even when debugging is disabled.
"""


class BdbQuit(Exception):
    pass


class Bdb:
    """Import-compatible base for debuggers without mutable frame support."""

    def __init__(self, *args, **kwargs):
        del args, kwargs
        self.quitting = False

    def reset(self):
        self.quitting = False

    def set_trace(self, frame=None):
        del frame
        raise NotImplementedError(
            "interactive debugging requires Sage.js frame-debugging support"
        )

    def run(self, command, globals=None, locals=None):
        del command, globals, locals
        raise NotImplementedError(
            "interactive debugging requires Sage.js frame-debugging support"
        )

    def runcall(self, function, *args, **kwargs):
        return function(*args, **kwargs)
