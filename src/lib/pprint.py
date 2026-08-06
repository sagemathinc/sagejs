"""Data pretty printing compatible with Python's :mod:`pprint` API.

The implementation is intentionally written in portable Python so it works
in every Sage.js host.  It implements the public formatting interface used by
ordinary pure-Python packages, including recursive-container detection and
width-aware multiline output.
"""


def _sorted_items(value, sort_dicts):
    items = list(value.items())
    if not sort_dicts:
        return items
    try:
        return sorted(items, key=lambda pair: pair[0])
    except TypeError:
        return sorted(
            items,
            key=lambda pair: (type(pair[0]).__name__, repr(pair[0])),
        )


def _container_parts(value, level, depth, context, printer):
    if depth is not None and level >= depth:
        return '...', True, False

    identity = id(value)
    if identity in context:
        return (
            "<Recursion on " + type(value).__name__
            + " with id=" + str(identity) + ">",
            False,
            True,
        )

    context.add(identity)
    readable = True
    recursive = False
    try:
        if isinstance(value, dict):
            entries = []
            for key, item in _sorted_items(value, printer._sort_dicts):
                key_text, key_readable, key_recursive = _format_value(
                    key, level + 1, depth, context, printer)
                item_text, item_readable, item_recursive = _format_value(
                    item, level + 1, depth, context, printer)
                entries.append(key_text + ': ' + item_text)
                readable = readable and key_readable and item_readable
                recursive = recursive or key_recursive or item_recursive
            return _join_container(
                entries, '{', '}', level, printer), readable, recursive

        entries = []
        for item in value:
            text, item_readable, item_recursive = _format_value(
                item, level + 1, depth, context, printer)
            entries.append(text)
            readable = readable and item_readable
            recursive = recursive or item_recursive

        if isinstance(value, list):
            opening, closing = '[', ']'
        elif isinstance(value, tuple):
            opening, closing = '(', ')'
            if len(entries) == 1:
                entries[0] += ','
        elif isinstance(value, frozenset):
            if not entries:
                return 'frozenset()', True, False
            opening, closing = 'frozenset({', '})'
        else:
            if not entries:
                return 'set()', True, False
            if printer._sort_dicts:
                entries.sort()
            opening, closing = '{', '}'
        return _join_container(
            entries, opening, closing, level, printer), readable, recursive
    finally:
        context.remove(identity)


def _join_container(entries, opening, closing, level, printer):
    if not entries:
        return opening + closing
    one_line = opening + ', '.join(entries) + closing
    available = printer._width - level * printer._indent_per_level
    if '\n' not in one_line and len(one_line) <= available:
        return one_line
    indentation = ' ' * ((level + 1) * printer._indent_per_level)
    closing_indent = ' ' * (level * printer._indent_per_level)
    return (
        opening + '\n' + indentation
        + (',\n' + indentation).join(entries)
        + '\n' + closing_indent + closing
    )


def _format_value(value, level, depth, context, printer):
    if isinstance(value, (dict, list, tuple, set, frozenset)):
        return _container_parts(value, level, depth, context, printer)
    try:
        text = repr(value)
        return text, True, False
    except Exception:
        return (
            '<' + type(value).__name__ + ' instance>',
            False,
            False,
        )


class PrettyPrinter:
    """Format Python values for readable terminal and notebook output."""

    def __init__(
        self,
        indent=1,
        width=80,
        depth=None,
        stream=None,
        *,
        compact=False,
        sort_dicts=True,
        underscore_numbers=False,
    ):
        if indent < 1:
            raise ValueError('indent must be >= 1')
        if width < 1:
            raise ValueError('width must be >= 1')
        if depth is not None and depth <= 0:
            raise ValueError('depth must be > 0')
        self._indent_per_level = int(indent)
        self._width = int(width)
        self._depth = depth
        self._stream = stream
        self._compact = compact
        self._sort_dicts = sort_dicts
        self._underscore_numbers = underscore_numbers

    def pformat(self, value):
        return _format_value(
            value, 0, self._depth, set(), self)[0]

    def pprint(self, value):
        print(self.pformat(value), file=self._stream)

    def isrecursive(self, value):
        return self.format(value, {}, 0, 0)[2]

    def isreadable(self, value):
        readable, recursive = self.format(value, {}, 0, 0)[1:]
        return readable and not recursive

    def format(self, value, context, maxlevels, level):
        depth = self._depth
        if maxlevels:
            depth = maxlevels
        active = set(context)
        return _format_value(value, level, depth, active, self)


def pformat(
    value,
    indent=1,
    width=80,
    depth=None,
    *,
    compact=False,
    sort_dicts=True,
    underscore_numbers=False,
):
    return PrettyPrinter(
        indent=indent,
        width=width,
        depth=depth,
        compact=compact,
        sort_dicts=sort_dicts,
        underscore_numbers=underscore_numbers,
    ).pformat(value)


def pprint(
    value,
    stream=None,
    indent=1,
    width=80,
    depth=None,
    *,
    compact=False,
    sort_dicts=True,
    underscore_numbers=False,
):
    PrettyPrinter(
        indent=indent,
        width=width,
        depth=depth,
        stream=stream,
        compact=compact,
        sort_dicts=sort_dicts,
        underscore_numbers=underscore_numbers,
    ).pprint(value)


def pp(value, *args, sort_dicts=False, **keywords):
    return pprint(value, *args, sort_dicts=sort_dicts, **keywords)


def saferepr(value):
    return PrettyPrinter().format(value, {}, 0, 0)[0]


def isreadable(value):
    return PrettyPrinter().isreadable(value)


def isrecursive(value):
    return PrettyPrinter().isrecursive(value)


_safe_repr = saferepr
