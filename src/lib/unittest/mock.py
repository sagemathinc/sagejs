"""Portable core of Python's `unittest.mock` API.

This module implements the mocking facilities used by pure-Python libraries
in Sage.js: callable mocks with call histories and assertions, patching by
object or dotted name, mapping patches, sentinels, and the standard `call`
builder. It intentionally stays independent of threads and `asyncio` so it
can run in both Node and browser runtimes.
"""

from __future__ import annotations

import importlib


class _Default:
    def __repr__(self):
        return "sentinel.DEFAULT"


DEFAULT = _Default()


class _Any:
    def __eq__(self, other):
        return True

    def __ne__(self, other):
        return False

    def __repr__(self):
        return "<ANY>"


ANY = _Any()


class _SentinelValue:
    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return "sentinel.%s" % self.name


class _Sentinel:
    def __init__(self):
        self._values = {"DEFAULT": DEFAULT}

    def __getattr__(self, name):
        if name not in self._values:
            self._values[name] = _SentinelValue(name)
        return self._values[name]


sentinel = _Sentinel()


class _Call:
    def __init__(self, args=(), kwargs=None, name=""):
        self.args = tuple(args)
        self.kwargs = dict(kwargs or {})
        self.name = name

    def __eq__(self, other):
        if not isinstance(other, _Call):
            return False
        return (
            self.name == other.name
            and self.args == other.args
            and self.kwargs == other.kwargs
        )

    def __repr__(self):
        arguments = [repr(value) for value in self.args]
        arguments.extend("%s=%r" % item for item in self.kwargs.items())
        prefix = "call" + (("." + self.name) if self.name else "")
        return "%s(%s)" % (prefix, ", ".join(arguments))

    def __getattr__(self, name):
        qualified = name if not self.name else self.name + "." + name
        return _Call(name=qualified)

    def __call__(self, *args, **kwargs):
        return _Call(args, kwargs, self.name)


call = _Call()


class Mock:
    """A callable test double with Python-compatible call accounting."""

    def __init__(
        self,
        spec=None,
        side_effect=None,
        return_value=DEFAULT,
        wraps=None,
        name=None,
        **kwargs,
    ):
        self._mock_spec = spec
        self._mock_side_effect = side_effect
        self._mock_wraps = wraps
        self._mock_name = name
        self._mock_return_value = return_value
        self._mock_children = {}
        self.called = False
        self.call_count = 0
        self.call_args = None
        self.call_args_list = []
        self.mock_calls = []
        self.method_calls = []
        for key, value in kwargs.items():
            setattr(self, key, value)

    @property
    def return_value(self):
        if self._mock_return_value is DEFAULT:
            self._mock_return_value = type(self)(name="()")
        return self._mock_return_value

    @return_value.setter
    def return_value(self, value):
        self._mock_return_value = value

    @property
    def side_effect(self):
        return self._mock_side_effect

    @side_effect.setter
    def side_effect(self, value):
        self._mock_side_effect = value

    def __call__(self, *args, **kwargs):
        current_call = _Call(args, kwargs)
        self.called = True
        self.call_count += 1
        self.call_args = current_call
        self.call_args_list.append(current_call)
        self.mock_calls.append(current_call)

        effect = self._mock_side_effect
        if effect is not None:
            if isinstance(effect, BaseException):
                raise effect
            if isinstance(effect, type) and issubclass(effect, BaseException):
                raise effect()
            if callable(effect):
                result = effect(*args, **kwargs)
                if result is not DEFAULT:
                    return result
        if self._mock_wraps is not None:
            return self._mock_wraps(*args, **kwargs)
        return self.return_value

    def __getattr__(self, name):
        if name.startswith("_mock_"):
            raise AttributeError(name)
        if name not in self._mock_children:
            self._mock_children[name] = type(self)(name=name)
        return self._mock_children[name]

    def reset_mock(self, return_value=False, side_effect=False):
        self.called = False
        self.call_count = 0
        self.call_args = None
        self.call_args_list = []
        self.mock_calls = []
        self.method_calls = []
        for child in self._mock_children.values():
            child.reset_mock(return_value=return_value, side_effect=side_effect)
        if return_value:
            self._mock_return_value = DEFAULT
        if side_effect:
            self._mock_side_effect = None

    def assert_called(self):
        if not self.called:
            raise AssertionError("Expected mock to have been called.")

    def assert_not_called(self):
        if self.called:
            raise AssertionError(
                "Expected mock to not have been called. Called %s times."
                % self.call_count
            )

    def assert_called_once(self):
        if self.call_count != 1:
            raise AssertionError(
                "Expected mock to have been called once. Called %s times."
                % self.call_count
            )

    def assert_called_with(self, *args, **kwargs):
        expected = _Call(args, kwargs)
        if self.call_args != expected:
            raise AssertionError(
                "Expected: %r\n  Actual: %r" % (expected, self.call_args)
            )

    def assert_called_once_with(self, *args, **kwargs):
        self.assert_called_once()
        self.assert_called_with(*args, **kwargs)

    def assert_any_call(self, *args, **kwargs):
        expected = _Call(args, kwargs)
        if expected not in self.call_args_list:
            raise AssertionError("%r call not found" % expected)

    def assert_has_calls(self, calls, any_order=False):
        expected = list(calls)
        if any_order:
            remaining = list(self.mock_calls)
            for expected_call in expected:
                if expected_call not in remaining:
                    raise AssertionError("Calls not found: %r" % expected)
                remaining.remove(expected_call)
            return
        width = len(expected)
        for index in range(len(self.mock_calls) - width + 1):
            if self.mock_calls[index : index + width] == expected:
                return
        raise AssertionError(
            "Calls not found.\nExpected: %r\n  Actual: %r" % (expected, self.mock_calls)
        )


class MagicMock(Mock):
    """Mock variant used where Python's standard API requests magic methods."""


class NonCallableMock(Mock):
    def __call__(self, *args, **kwargs):
        raise TypeError("%r is not callable" % self)


class NonCallableMagicMock(NonCallableMock, MagicMock):
    pass


class PropertyMock(Mock):
    def __get__(self, obj, obj_type=None):
        return self()

    def __set__(self, obj, value):
        self(value)


def create_autospec(spec, spec_set=False, instance=False, **kwargs):
    return MagicMock(spec=spec, **kwargs)


class _Patcher:
    def __init__(self, target, attribute, new=DEFAULT):
        self.target = target
        self.attribute = attribute
        self.new = new
        self.original = DEFAULT
        self.created = None

    def __enter__(self):
        try:
            self.original = getattr(self.target, self.attribute)
        except AttributeError:
            self.original = DEFAULT
        self.created = (
            MagicMock(name=self.attribute) if self.new is DEFAULT else self.new
        )
        setattr(self.target, self.attribute, self.created)
        return self.created

    def __exit__(self, exception_type, exception, tb):
        if self.original is DEFAULT:
            delattr(self.target, self.attribute)
        else:
            setattr(self.target, self.attribute, self.original)
        return False

    def __call__(self, function):
        def patched(*args, **kwargs):
            with self as created:
                if self.new is DEFAULT:
                    return function(*args, created, **kwargs)
                return function(*args, **kwargs)

        patched.__name__ = getattr(function, "__name__", "patched")
        patched.__doc__ = getattr(function, "__doc__", None)
        return patched


class _PatchDict:
    def __init__(self, mapping, values=(), clear=False, **kwargs):
        self.mapping = _resolve_dotted(mapping) if isinstance(mapping, str) else mapping
        self.values = dict(values)
        self.values.update(kwargs)
        self.clear = clear
        self.original = None

    def __enter__(self):
        self.original = dict(self.mapping)
        if self.clear:
            _clear_mapping(self.mapping)
        self.mapping.update(self.values)
        return self.mapping

    def __exit__(self, exception_type, exception, tb):
        _clear_mapping(self.mapping)
        self.mapping.update(self.original)
        return False

    def __call__(self, function):
        def patched(*args, **kwargs):
            with self:
                return function(*args, **kwargs)

        patched.__name__ = getattr(function, "__name__", "patched")
        patched.__doc__ = getattr(function, "__doc__", None)
        return patched


def _clear_mapping(mapping):
    try:
        mapping.clear()
    except AttributeError:
        for key in list(mapping):
            del mapping[key]


def _resolve_dotted(name):
    pieces = name.split(".")
    module = None
    boundary = 0
    for index in range(len(pieces), 0, -1):
        try:
            module = importlib.import_module(".".join(pieces[:index]))
            boundary = index
            break
        except ImportError:
            pass
    if module is None:
        raise ImportError(name)
    value = module
    for piece in pieces[boundary:]:
        value = getattr(value, piece)
    return value


def _patch(target, new=DEFAULT, **kwargs):
    if kwargs:
        raise TypeError("unsupported patch options: %s" % ", ".join(kwargs))
    parent_name, attribute = target.rsplit(".", 1)
    return _Patcher(_resolve_dotted(parent_name), attribute, new)


def _patch_object(target, attribute, new=DEFAULT, **kwargs):
    if kwargs:
        raise TypeError("unsupported patch options: %s" % ", ".join(kwargs))
    return _Patcher(target, attribute, new)


_patch.object = _patch_object
_patch.dict = _PatchDict
patch = _patch


def mock_open(mock=None, read_data=""):
    handle = MagicMock(name="handle")
    handle.read.return_value = read_data
    handle.readline.return_value = read_data
    handle.readlines.return_value = read_data.splitlines(True)
    opener = mock or MagicMock(name="open")
    opener.return_value = handle
    return opener


def seal(mock):
    return mock


AsyncMock = MagicMock
ThreadingMock = MagicMock
FILTER_DIR = True


__all__ = [
    "ANY",
    "AsyncMock",
    "DEFAULT",
    "FILTER_DIR",
    "MagicMock",
    "Mock",
    "NonCallableMagicMock",
    "NonCallableMock",
    "PropertyMock",
    "ThreadingMock",
    "call",
    "create_autospec",
    "mock_open",
    "patch",
    "seal",
    "sentinel",
]
