"""Runtime introspection for Sage.js callables.

The compiler records argument names, defaults, varargs, keyword-only names,
and annotations on every generated function.  This module exposes that data
through the familiar :mod:`inspect` `Signature` API used by decorators and
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

    def _as_tuple(self):
        return (
            self.args,
            self.varargs,
            self.varkw,
            self.defaults,
            self.kwonlyargs,
            self.kwonlydefaults,
            self.annotations,
        )

    def __len__(self):
        return 7

    def __iter__(self):
        return iter(self._as_tuple())

    def __getitem__(self, index):
        return self._as_tuple()[index]


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
            if return_annotation is _empty
            else return_annotation,
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
                    raise TypeError("multiple values for argument '" + name + "'")
                continue
            if (
                parameter.kind != Parameter.POSITIONAL_ONLY
                and name in remaining_keywords
            ):
                arguments[name] = remaining_keywords.pop(name)
                continue
            if not partial and parameter.default is _empty:
                raise TypeError("missing a required argument: '" + name + "'")
        if positional:
            raise TypeError("too many positional arguments")
        if remaining_keywords:
            name = next(iter(remaining_keywords))
            raise TypeError("got an unexpected keyword argument '" + name + "'")
        return BoundArguments(self, arguments)


def signature(
    callable,
    *,
    follow_wrapped=True,
    globals=None,
    locals=None,
    eval_str=False,
    annotation_format=None,
):
    del globals, locals, eval_str, annotation_format
    explicit = getattr(callable, "__signature__", None)
    if explicit is not None:
        return explicit
    if follow_wrapped:
        while hasattr(callable, "__wrapped__"):
            callable = callable.__wrapped__
    names = getattr(callable, "__argnames__", None)
    if names is None:
        call = getattr(callable, "__call__", None)
        if call is None or call is callable:
            raise ValueError("callable is not supported by signature")
        return signature(call, follow_wrapped=follow_wrapped)
    names = list(names)
    if (
        getattr(callable, "__sagejs_method_signature_excludes_self__", False)
        and getattr(callable, "__self__", None) is None
    ):
        # Method code is emitted with JavaScript's receiver as ``self``, so
        # its fast-call metadata omits that source parameter.  An unbound
        # function exposed through ``bound_method.__func__`` must nevertheless
        # have CPython's introspection signature; libraries such as pluggy use
        # this distinction to discover hook arguments.
        names.insert(0, "self")
    # Compiler metadata is intentionally stored as lightweight JavaScript
    # records.  Normalize it to Python mappings before using the public dict
    # API; third-party decorators should never have to know the distinction.
    defaults = dict(getattr(callable, "__defaults__", {}))
    annotations = dict(getattr(callable, "__annotations__", {}))
    parameters = []
    positional_only = getattr(callable, "__positional_only__", 0)
    if positional_only is True:
        positional_only = len(names)
    for index, name in enumerate(names):
        kind = (
            Parameter.POSITIONAL_ONLY
            if index < positional_only
            else Parameter.POSITIONAL_OR_KEYWORD
        )
        parameters.append(
            Parameter(
                name,
                kind,
                defaults.get(name, _empty),
                annotations.get(name, _empty),
            )
        )
    varargs = getattr(callable, "__varargs__", None)
    if varargs is not None:
        parameters.append(
            Parameter(
                varargs,
                Parameter.VAR_POSITIONAL,
                annotation=annotations.get(varargs, _empty),
            )
        )
    for name in getattr(callable, "__kwonly__", ()):
        parameters.append(
            Parameter(
                name,
                Parameter.KEYWORD_ONLY,
                defaults.get(name, _empty),
                annotations.get(name, _empty),
            )
        )
    kwargs = getattr(callable, "__varkw__", None)
    if kwargs is not None:
        parameters.append(
            Parameter(
                kwargs,
                Parameter.VAR_KEYWORD,
                annotation=annotations.get(kwargs, _empty),
            )
        )
    return Signature(parameters, annotations.get("return", _empty))


def isfunction(value):
    return callable(value) and hasattr(value, "__argnames__")


def ismethod(value):
    return callable(value) and hasattr(value, "__self__")


def isclass(value):
    return isinstance(value, type)


def isabstract(value):
    """Return whether `value` is an abstract class.

    The host runtime does not expose CPython's private type flags, so use the
    public abstract-method protocol.  The fallback scan also covers the short
    interval while an `ABCMeta` subclass is being initialized.
    """
    if not isclass(value):
        return False
    abstract_methods = getattr(value, "__abstractmethods__", None)
    if abstract_methods:
        return True
    for member in value.__dict__.values():
        if getattr(member, "__isabstractmethod__", False):
            return True
    for base in value.__bases__:
        for name in getattr(base, "__abstractmethods__", ()):
            member = getattr(value, name, None)
            if getattr(member, "__isabstractmethod__", False):
                return True
    return False


def isroutine(value):
    return isfunction(value) or ismethod(value)


def isgeneratorfunction(value):
    return bool(getattr(value, "__is_generator__", False))


def iscoroutinefunction(value):
    return bool(getattr(value, "__is_coroutine__", False))


def isasyncgenfunction(value):
    return isgeneratorfunction(value) and iscoroutinefunction(value)


def getfullargspec(callable):
    """Return CPython-compatible argument metadata for a callable."""
    # Unlike ``signature()``, CPython's legacy ``getfullargspec()`` does not
    # strip the leading receiver from a bound method.  Traitlets intentionally
    # relies on this distinction when adapting old ``on_trait_change``
    # callbacks.  Inspect the underlying function when one is available.
    inspection_target = getattr(callable, "__func__", callable)
    sig = signature(inspection_target, follow_wrapped=False)
    args = []
    varargs = None
    varkw = None
    defaults_by_name = {}
    kwonlyargs = []
    kwonlydefaults = {}
    annotations = dict(getattr(inspection_target, "__annotations__", {}))
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
    return dict(getattr(obj, "__annotations__", {}))


class _PortableFrameCode:
    co_name = "currentframe"
    co_filename = "<sagejs>"


class _PortableFrame:
    """Minimal frame protocol for libraries doing stack-level bookkeeping."""

    def __init__(self):
        self.f_code = _PortableFrameCode()
        self.f_back = None
        self.f_globals = {"__name__": "__main__"}
        self.f_locals = {}
        self.f_lineno = 0


def currentframe():
    """Return a minimal portable frame for introspection bookkeeping.

    JavaScript does not expose CPython frame objects, but warning and
    decorator libraries commonly need only `f_code`, `f_globals`, `f_locals`,
    and `f_back`.  This object deliberately provides just that protocol.
    """
    return _PortableFrame()


def getouterframes(frame, context=1):
    """Return portable frame-info tuples following `frame.f_back`."""
    del context
    result = []
    while frame is not None:
        result.append(
            (
                frame,
                frame.f_code.co_filename,
                frame.f_lineno,
                frame.f_code.co_name,
                None,
                None,
            )
        )
        frame = frame.f_back
    return result


def unwrap(func, *, stop=None):
    """Follow `__wrapped__` links and return the innermost callable.

    `stop` has the same meaning as in CPython: it is tested before each
    link is followed. Wrapper cycles are rejected instead of looping.
    """
    seen = set()
    while hasattr(func, "__wrapped__"):
        if stop is not None and stop(func):
            break
        marker = id(func)
        if marker in seen:
            raise ValueError("wrapper loop when unwrapping " + repr(func))
        seen.add(marker)
        func = func.__wrapped__
    if id(func) in seen:
        raise ValueError("wrapper loop when unwrapping " + repr(func))
    return func


def getfile(obj):
    """Return the filename associated with a module, callable, or code object."""
    filename = getattr(obj, "co_filename", None)
    if filename is not None:
        return filename
    code = getattr(obj, "__code__", None)
    filename = getattr(code, "co_filename", None)
    if filename is not None:
        return filename
    filename = getattr(obj, "__file__", None)
    if filename is not None:
        return filename
    if isclass(obj):
        import sys

        module = sys.modules.get(getattr(obj, "__module__", ""))
        filename = getattr(module, "__file__", None)
        if filename is not None:
            return filename
    raise TypeError("source filename is not available")


def getsourcefile(obj):
    """Return the Python source filename for *obj* when it is available."""
    filename = getfile(obj)
    if filename.endswith((".pyc", ".pyo")):
        return filename[:-1]
    return filename


def getmro(cls):
    """Return the method resolution order of `cls` as a tuple."""
    if not isclass(cls):
        raise AttributeError("__mro__")
    return tuple(cls.__mro__)


def getsourcelines(obj):
    """Return source lines and the first line number for `obj`.

    Sage.js only reports source text when the compiler attached an exact
    `__firstlineno__`.  Raising `OSError` when that metadata is unavailable
    matches CPython's failure contract and avoids inventing a misleading
    location for generated callables.
    """
    first_line = getattr(obj, "__firstlineno__", None)
    if first_line is None:
        raise OSError("exact source line metadata is unavailable")
    import linecache

    lines = linecache.getlines(getsourcefile(obj))
    if not lines:
        raise OSError("source code is unavailable")
    return lines[first_line - 1 :], first_line
