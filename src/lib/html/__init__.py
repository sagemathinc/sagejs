"""Utilities for escaping and unescaping HTML text."""

from .entities import html5


def escape(s, quote=True):
    """Replace HTML-significant characters with safe references."""
    s = str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    if quote:
        s = s.replace('"', '&quot;').replace("'", '&#x27;')
    return s


def unescape(s):
    """Replace numeric and known named character references in *s*."""
    text = str(s)
    start = text.find('&')
    while start >= 0:
        end = text.find(';', start + 1)
        if end < 0:
            break
        name = text[start + 1:end]
        replacement = None
        if name.startswith('#x') or name.startswith('#X'):
            try:
                replacement = chr(int(name[2:], 16))
            except (ValueError, OverflowError):
                pass
        elif name.startswith('#'):
            try:
                replacement = chr(int(name[1:], 10))
            except (ValueError, OverflowError):
                pass
        else:
            replacement = html5.get(name + ';')
        if replacement is None:
            start = text.find('&', start + 1)
        else:
            text = text[:start] + replacement + text[end + 1:]
            start = text.find('&', start + len(replacement))
    return text

