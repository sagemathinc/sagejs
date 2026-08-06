"""Runtime introspection for Sage.js callables.

The compiler records argument names, defaults, varargs, keyword-only names,
and annotations on every generated function.  This module exposes that data
through the familiar :mod:`inspect` ``Signature`` API used by decorators and
pure-Python frameworks.
"""


_empty = object()


class Parameter:
    POSITIONAL_ONLY = 0
    POSITIONAL_OR_KEYWORD = 1
    VAR_POSITIONAL = 2
    KEYWORD_ONLY = 3
    VAR_KEYWORD = 4
    empty = _empty

    def __init__(
        self,
        name,
        kind=1,
        default=_empty,
        annotation=_empty,
    ):
        self.name = name
        self.kind = kind
        self.default = default
        self.annotation = annotation

    def replace(self, *, name=None, kind=None, annotation=_empty, default=_empty):
        return Parameter(
            self.name if name is None else name,
            self.kind if kind is None else kind,
            self.default if default is _empty else default,
            self.annotation if annotation is _empty else annotation,
        )


class Signature:
    empty = _empty

    def __init__(self, parameters=None, return_annotation=_empty):
        self.parameters = {
            parameter.name: parameter for parameter in (parameters or ())
        }
        self.return_annotation = return_annotation

    def replace(self, *, parameters=None, return_annotation=_empty):
        return Signature(
            self.parameters.values() if parameters is None else parameters,
            self.return_annotation
            if return_annotation is _empty else return_annotation,
        )


def signature(callable, *, follow_wrapped=True, globals=None, locals=None, eval_str=False):
    del globals, locals, eval_str
    if follow_wrapped:
        while hasattr(callable, '__wrapped__'):
            callable = callable.__wrapped__
    names = getattr(callable, '__argnames__', None)
    if names is None:
        call = getattr(callable, '__call__', None)
        if call is None or call is callable:
            raise ValueError('callable is not supported by signature')
        return signature(call, follow_wrapped=follow_wrapped)
    # Compiler metadata is intentionally stored as lightweight JavaScript
    # records.  Normalize it to Python mappings before using the public dict
    # API; third-party decorators should never have to know the distinction.
    defaults = dict(getattr(callable, '__defaults__', {}))
    annotations = dict(getattr(callable, '__annotations__', {}))
    parameters = []
    positional_only = getattr(callable, '__positional_only__', 0)
    if positional_only is True:
        positional_only = len(names)
    for index, name in enumerate(names):
        kind = (
            Parameter.POSITIONAL_ONLY
            if index < positional_only
            else Parameter.POSITIONAL_OR_KEYWORD
        )
        parameters.append(Parameter(
            name,
            kind,
            defaults.get(name, _empty),
            annotations.get(name, _empty),
        ))
    varargs = getattr(callable, '__varargs__', None)
    if varargs is not None:
        parameters.append(Parameter(
            varargs, Parameter.VAR_POSITIONAL,
            annotation=annotations.get(varargs, _empty)))
    for name in getattr(callable, '__kwonly__', ()):
        parameters.append(Parameter(
            name,
            Parameter.KEYWORD_ONLY,
            defaults.get(name, _empty),
            annotations.get(name, _empty),
        ))
    kwargs = getattr(callable, '__varkw__', None)
    if kwargs is not None:
        parameters.append(Parameter(
            kwargs, Parameter.VAR_KEYWORD,
            annotation=annotations.get(kwargs, _empty)))
    return Signature(parameters, annotations.get('return', _empty))


def isfunction(value):
    return callable(value) and hasattr(value, '__argnames__')


def ismethod(value):
    return callable(value) and hasattr(value, '__self__')


def isclass(value):
    return isinstance(value, type)


def get_annotations(obj, *, globals=None, locals=None, eval_str=False):
    del globals, locals, eval_str
    return dict(getattr(obj, '__annotations__', {}))
