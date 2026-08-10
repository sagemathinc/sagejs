"""Formatting helpers for Sage.js JavaScript exception stacks."""

import sagejs.runtime as runtime


class FrameSummary:
    """A small CPython-compatible description of one stack frame."""

    def __init__(self, filename, lineno, name, line=None):
        self.filename = filename
        self.lineno = lineno
        self.name = name
        self.line = line

    def __getitem__(self, index):
        values = (self.filename, self.lineno, self.name, self.line)
        return values[index]

    def __iter__(self):
        return iter((self.filename, self.lineno, self.name, self.line))

    def __eq__(self, other):
        try:
            return tuple(self) == tuple(other)
        except Exception:
            return False


# CPython exposes this name for typing and for callers that construct stack
# summaries.  A list is the useful behavioral subset for Sage.js today.
StackSummary = list


def _stack(error):
    if error is None or error is runtime.undefined:
        return ""
    value = runtime.reflect.get(error, "stack")
    if value is runtime.undefined:
        return str(error)
    return str(value)


def format_exception(
    exc=runtime.undefined, value=None, tb=None, limit=None, chain=True
):
    """Format an exception using its native JavaScript stack when present."""
    if exc is runtime.undefined:
        exc = runtime.last_exception
    elif value is not None:
        exc = value
    text = _stack(exc)
    if not text:
        return []
    lines = text.splitlines()
    heading = lines[0]
    body = lines[1:]
    name = runtime.reflect.get(exc, "name")
    if name is not runtime.undefined:
        sentinel = "at new " + str(name)
        for index in range(len(body)):
            if body[index].strip().startswith(sentinel):
                body = body[index + 1 :]
                break
    if limit is not None:
        body = body[:limit] if limit >= 0 else body[limit:]
    body.reverse()
    lines = ["Traceback (most recent call last):"] + body + [heading]
    return [line + "\n" for line in lines]


def format_exception_only(exc, value=None):
    """Format the exception type and value without stack frames."""
    if value is not None:
        exc = value
    name = getattr(type(exc), "__name__", "Exception")
    message = str(exc)
    if message:
        return [name + ": " + message + "\n"]
    return [name + "\n"]


def format_exc(limit=None, chain=True):
    return "".join(format_exception(limit=limit, chain=chain))


def print_exc(limit=None, file=None, chain=True):
    print(format_exc(limit, chain), end="")


def format_stack(frame=None, limit=None):
    error = runtime.reflect.construct(runtime.error, [])
    lines = _stack(error).splitlines()[1:]
    for index in range(len(lines)):
        if "format_stack" in lines[index]:
            lines = lines[index + 1 :]
            break
    lines.reverse()
    if limit is not None:
        lines = lines[:limit] if limit >= 0 else lines[limit:]
    return [line + "\n" for line in lines]


def _frame_from_native_line(text):
    text = text.strip()
    if text.startswith("at "):
        text = text[3:]
    name = "<module>"
    location = text
    open_paren = text.rfind(" (")
    if open_paren >= 0 and text.endswith(")"):
        name = text[:open_paren]
        location = text[open_paren + 2 : -1]
    pieces = location.rsplit(":", 2)
    filename = pieces[0]
    lineno = 0
    if len(pieces) >= 2:
        try:
            lineno = int(pieces[-2])
        except ValueError:
            pass
    return FrameSummary(filename, lineno, name)


def extract_stack(frame=None, limit=None):
    """Extract the current native stack as ``FrameSummary`` objects."""
    error = runtime.reflect.construct(runtime.error, [])
    lines = _stack(error).splitlines()[1:]
    for index in range(len(lines)):
        if "extract_stack" in lines[index]:
            lines = lines[index + 1 :]
            break
    frames = [_frame_from_native_line(line) for line in reversed(lines)]
    # Calls made through the compiler's keyword interpolation helper add a
    # host-only frame which has no Python counterpart.  Discard such frames
    # from the top of the extracted Python stack.
    while frames and frames[-1].name.startswith("ρσ_"):
        frames.pop()
    if limit is not None:
        frames = frames[-limit:] if limit >= 0 else frames[:-limit]
    return frames


def extract_tb(tb, limit=None):
    """Return frame summaries for a native traceback-like value."""
    text = _stack(tb)
    lines = text.splitlines()[1:] if text else []
    frames = [_frame_from_native_line(line) for line in reversed(lines)]
    if (
        frames
        and runtime.reflect.get(tb, "__sagejs_argument_error__")
        is not runtime.undefined
    ):
        # V8 reports binder failures at the generated caller after the three
        # host-only lines which collect ``*args``. Removing that offset makes
        # line-based provenance checks agree with the Python source layout.
        # A future full source-map traceback backend will subsume this narrow
        # adjustment.
        frames[-1].lineno = max(0, frames[-1].lineno - 3)
    if limit is not None:
        frames = frames[-limit:] if limit >= 0 else frames[:-limit]
    return frames


def print_stack(frame=None, limit=None, file=None):
    print("".join(format_stack(frame, limit)), end="")
