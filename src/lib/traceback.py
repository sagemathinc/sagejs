"""Formatting helpers for Sage.js JavaScript exception stacks."""

import sagejs.runtime as runtime


class FrameSummary:
    """A small CPython-compatible description of one stack frame."""

    def __init__(
        self, filename, lineno, name, line=None, provenance="unspecified", raw=None
    ):
        self.filename = filename
        self.lineno = lineno
        self.name = name
        self.line = line
        self.provenance = provenance
        self.raw = raw

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


def _mapped_frames(error, boundary):
    hook = runtime.reflect.get(
        runtime.global_object, "__sagejs_capture_python_frames__"
    )
    if hook is runtime.undefined:
        if error is None:
            error = runtime.reflect.construct(runtime.error, [])
            capture = runtime.reflect.get(runtime.error, "captureStackTrace")
            if capture is not runtime.undefined:
                runtime.reflect.apply(capture, runtime.error, [error, boundary])
        return [
            _native_frame(line) for line in reversed(_stack(error).splitlines()[1:])
        ]
    records = runtime.reflect.apply(hook, None, [error, boundary])
    return [
        FrameSummary(
            record.filename,
            record.lineno,
            record.name,
            record.line,
            record.provenance,
            record.raw,
        )
        for record in records
    ]


def _native_frame(raw):
    text = raw.strip()
    if text.startswith("at "):
        text = text[3:]
    paren = text.rfind(" (")
    name = text[:paren] if paren >= 0 else None
    location = text[paren + 2 : -1] if paren >= 0 and text.endswith(")") else text
    parts = location.rsplit(":", 2)
    filename = location
    lineno = 0
    if len(parts) == 3:
        try:
            lineno = int(parts[1])
            int(parts[2])
            filename = parts[0]
        except ValueError:
            lineno = 0
    return FrameSummary(filename, lineno, name, None, "native-stack", raw)


def extract_stack(frame=None, limit=None):
    """Extract the current capture stack with explicit frame provenance.

    `frame` is currently ignored. Registered Node executions have original
    Python coordinates; other frames retain native/generated coordinates.
    """
    frames = _mapped_frames(None, extract_stack)
    if limit == 0:
        return []
    if limit is not None:
        frames = frames[-limit:] if limit >= 0 else frames[:-limit]
    return frames


def extract_tb(tb, limit=None):
    """Return frames from an exception's capture-time stack, not its unwind chain.

    Known incompatibility: positive `limit` keeps the last N captured frames,
    unlike CPython's first N traceback frames; negative limits keep the first N.
    Fixing this requires caught/reraised exception boundaries, not guessed
    truncation of native callers. The pinned pyparsing smoke currently depends
    on this legacy limit behavior as well as the exact source-coordinate fix.
    """
    if tb is None:
        return []
    frames = _mapped_frames(tb, None)
    if limit == 0:
        return []
    if limit is not None:
        frames = frames[-limit:] if limit >= 0 else frames[:-limit]
    return frames


def print_stack(frame=None, limit=None, file=None):
    print("".join(format_stack(frame, limit)), end="")
