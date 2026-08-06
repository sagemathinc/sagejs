"""Runtime introspection for Sage.js callables.

The compiler records argument names, defaults, varargs, keyword-only names,
and annotations on every generated function.  This module exposes that data
through the familiar :mod:`inspect` ``Signature`` API used by decorators and
pure-Python frameworks.
"""


_empty = object()


class FullArgSpec:
    """The argument description returned by :func:`getfullargspec`."""

    def __init__(
        self,
        args,
        varargs,
        varkw,
        defaults,
        kwonlyargs,
        kwonlydefaults,
        annotations,
    ):
        self.args = args
        self.varargs = varargs
        self.varkw = varkw
        self.defaults = defaults
        self.kwonlyargs = kwonlyargs
        self.kwonlydefaults = kwonlydefaults
        self.annotations = annotations


class BoundArguments:
    """Arguments bound to a :class:`Signature`."""

    def __init__(self, signature, arguments):
        self.signature = signature
        self.arguments = arguments

    @property
    def args(self):
        values = []
        for parameter in self.signature.parameters.values():
            if parameter.kind == Parameter.VAR_POSITIONAL:
                values.extend(self.arguments.get(parameter.name, ()))
                continue
            if parameter.kind not in (
                Parameter.POSITIONAL_ONLY,
                Parameter.POSITIONAL_OR_KEYWORD,
            ):
                break
            if parameter.name not in self.arguments:
                break
            values.append(self.arguments[parameter.name])
        return tuple(values)

    @property
    def kwargs(self):
        result = {}
        positional_names = set()
        remaining = len(self.args)
        for parameter in self.signature.parameters.values():
            if remaining <= 0:
                break
            if parameter.kind == Parameter.VAR_POSITIONAL:
                remaining = 0
                break
            if parameter.kind in (
                Parameter.POSITIONAL_ONLY,
                Parameter.POSITIONAL_OR_KEYWORD,
            ):
                positional_names.add(parameter.name)
                remaining -= 1
        for parameter in self.signature.parameters.values():
            if parameter.kind == Parameter.VAR_KEYWORD:
                result.update(self.arguments.get(parameter.name, {}))
            elif (
                parameter.name in self.arguments
                and parameter.name not in positional_names
                and parameter.kind != Parameter.VAR_POSITIONAL
            ):
                result[parameter.name] = self.arguments[parameter.name]
        return result

    def apply_defaults(self):
        for parameter in self.signature.parameters.values():
            if parameter.name in self.arguments:
                continue
            if parameter.default is not _empty:
                self.arguments[parameter.name] = parameter.default
            elif parameter.kind == Parameter.VAR_POSITIONAL:
                self.arguments[parameter.name] = ()
            elif parameter.kind == Parameter.VAR_KEYWORD:
                self.arguments[parameter.name] = {}


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

    def bind(self, *args, **kwargs):
        return self._bind(args, kwargs, partial=False)

    def bind_partial(self, *args, **kwargs):
        return self._bind(args, kwargs, partial=True)

    def _bind(self, values, keywords, partial):
        arguments = {}
        positional = list(values)
        remaining_keywords = dict(keywords)
        for parameter in self.parameters.values():
            name = parameter.name
            if parameter.kind == Parameter.VAR_POSITIONAL:
                arguments[name] = tuple(positional)
                positional = []
                continue
            if parameter.kind == Parameter.VAR_KEYWORD:
                arguments[name] = remaining_keywords
                remaining_keywords = {}
                continue
            if parameter.kind == Parameter.KEYWORD_ONLY:
                if name in remaining_keywords:
                    arguments[name] = remaining_keywords.pop(name)
                elif not partial and parameter.default is _empty:
                    raise TypeError("missing a required argument: '" + name + "'")
                continue
            if positional:
                arguments[name] = positional.pop(0)
                if name in remaining_keywords:
                    raise TypeError(
                        "multiple values for argument '" + name + "'")
                continue
            if parameter.kind != Parameter.POSITIONAL_ONLY and name in remaining_keywords:
                arguments[name] = remaining_keywords.pop(name)
                continue
            if not partial and parameter.default is _empty:
                raise TypeError("missing a required argument: '" + name + "'")
        if positional:
            raise TypeError('too many positional arguments')
        if remaining_keywords:
            name = next(iter(remaining_keywords))
            raise TypeError("got an unexpected keyword argument '" + name + "'")
        return BoundArguments(self, arguments)


def signature(callable, *, follow_wrapped=True, globals=None, locals=None, eval_str=False):
    del globals, locals, eval_str
    explicit = getattr(callable, '__signature__', None)
    if explicit is not None:
        return explicit
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


def isroutine(value):
    return isfunction(value) or ismethod(value)


def isgeneratorfunction(value):
    return bool(getattr(value, '__is_generator__', False))


def iscoroutinefunction(value):
    return bool(getattr(value, '__is_coroutine__', False))


def getfullargspec(callable):
    """Return CPython-compatible argument metadata for a callable."""
    sig = signature(callable, follow_wrapped=False)
    args = []
    varargs = None
    varkw = None
    defaults_by_name = {}
    kwonlyargs = []
    kwonlydefaults = {}
    annotations = dict(getattr(callable, '__annotations__', {}))
    for parameter in sig.parameters.values():
        if parameter.kind in (
            Parameter.POSITIONAL_ONLY,
            Parameter.POSITIONAL_OR_KEYWORD,
        ):
            args.append(parameter.name)
            if parameter.default is not _empty:
                defaults_by_name[parameter.name] = parameter.default
        elif parameter.kind == Parameter.VAR_POSITIONAL:
            varargs = parameter.name
        elif parameter.kind == Parameter.KEYWORD_ONLY:
            kwonlyargs.append(parameter.name)
            if parameter.default is not _empty:
                kwonlydefaults[parameter.name] = parameter.default
        elif parameter.kind == Parameter.VAR_KEYWORD:
            varkw = parameter.name
    default_names = []
    for name in reversed(args):
        if name not in defaults_by_name:
            break
        default_names.append(name)
    default_names.reverse()
    defaults = tuple(defaults_by_name[name] for name in default_names)
    return FullArgSpec(
        args,
        varargs,
        varkw,
        defaults or None,
        kwonlyargs,
        kwonlydefaults or None,
        annotations,
    )


def get_annotations(obj, *, globals=None, locals=None, eval_str=False):
    del globals, locals, eval_str
    return dict(getattr(obj, '__annotations__', {}))
