"""Small binary encoding helpers used by the Sage.js compatibility library.

Unlike the historical RapydScript implementation this module is ordinary
Python.  It deliberately returns Sage.js ``bytes`` objects, which are accepted
by both Python-facing code and native typed-array boundaries.
"""

import base64


def _altchars(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value.encode('ascii')
    return bytes(value)


def base64encode(value, altchars=None, pad_char='='):
    """Return *value* as a Base64 ASCII string.

    ``altchars`` is the optional two-character replacement for ``+/`` and
    ``pad_char`` may be changed or set to the empty string.
    """
    answer = base64.b64encode(bytes(value), _altchars(altchars)).decode('ascii')
    if pad_char != '=':
        answer = answer.replace('=', pad_char)
    return answer


def base64decode(value):
    """Decode a standard Base64 string into bytes."""
    return base64.b64decode(value)


def urlsafe_b64encode(value, pad_char='='):
    """Return URL-safe Base64 text, optionally without padding."""
    answer = base64.urlsafe_b64encode(bytes(value)).decode('ascii')
    if pad_char != '=':
        answer = answer.replace('=', pad_char)
    return answer


def urlsafe_b64decode(value):
    """Decode URL-safe Base64 text, accepting omitted padding."""
    text = str(value)
    text += '=' * (-len(text) % 4)
    return base64.urlsafe_b64decode(text)


def hexlify(value):
    """Return lowercase hexadecimal text for a byte sequence."""
    return bytes(value).hex()


def unhexlify(value):
    """Decode hexadecimal text into bytes."""
    return bytes.fromhex(str(value))


def utf8_decode(value, errors='strict', replacement='?'):
    """Decode UTF-8 bytes.

    The optional ``replacement`` argument is retained for compatibility with
    the original Sage.js helper.
    """
    if errors == 'replace' and replacement != '\ufffd':
        return bytes(value).decode('utf-8', errors).replace('\ufffd', replacement)
    return bytes(value).decode('utf-8', errors)


def utf8_encode_js(value):
    """Portable UTF-8 encoder retained under its historical name."""
    return str(value).encode('utf-8')


utf8_encode = utf8_encode_js


def utf8_encode_native(value):
    """Encode text as UTF-8 bytes."""
    return str(value).encode('utf-8')
