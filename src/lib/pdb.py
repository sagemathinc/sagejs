"""Minimal :mod:`pdb` surface for debugger-aware Python frameworks.

Sage.js does not yet expose V8 execution frames as mutable Python frames, so
interactive statement-level debugging is a later milestone.  Keeping the
standard entry points importable lets tools such as pytest install their
debugger hooks without changing normal, non-debug test execution.
"""

import bdb


class Pdb(bdb.Bdb):
    def __init__(self, *args, **kwargs):
        del args, kwargs
        self.quitting = False

    def set_trace(self, frame=None):
        del frame
        raise NotImplementedError(
            'interactive pdb requires Sage.js frame-debugging support')

    def post_mortem(self, traceback=None):
        del traceback
        raise NotImplementedError(
            'post-mortem pdb requires Sage.js frame-debugging support')

    def interaction(self, frame, traceback):
        del frame, traceback
        raise NotImplementedError(
            'interactive pdb requires Sage.js frame-debugging support')


def set_trace(*args, **kwargs):
    return Pdb().set_trace(*args, **kwargs)


def post_mortem(traceback=None):
    return Pdb().post_mortem(traceback)


def pm():
    import sys
    return post_mortem(sys.exc_info()[2])


def run(statement, globals=None, locals=None):
    del statement, globals, locals
    raise NotImplementedError(
        'pdb.run requires Sage.js frame-debugging support')


def runcall(function, *args, **kwargs):
    return function(*args, **kwargs)
