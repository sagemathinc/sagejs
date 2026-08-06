"""Unicode character properties backed by JavaScript Unicode and ICU.

The browser/Node runtime supplies normalization and Unicode general-category
tables.  The bidirectional helper covers the classes used by IDNA and ordinary
text processing; uncommon formatting controls conservatively report an empty
class.
"""

import sagejs.runtime as runtime


unidata_version = '16.0.0'


def _character(value):
    value = str(value)
    if len(value) != 1:
        raise TypeError('argument must be a unicode character, not string')
    return value


def _matches(character, property_name):
    expression = runtime.regexp(
        '^\\p{' + property_name + '}$',
        'u',
    )
    return bool(expression.test(character))


def normalize(form, value):
    if form not in ('NFC', 'NFD', 'NFKC', 'NFKD'):
        raise ValueError('invalid normalization form')
    return runtime.reflect.apply(
        runtime.string_class.prototype.normalize,
        str(value),
        [form],
    )


def is_normalized(form, value):
    return normalize(form, value) == value


def category(value):
    character = _character(value)
    categories = (
        'Lu', 'Ll', 'Lt', 'Lm', 'Lo',
        'Mn', 'Mc', 'Me',
        'Nd', 'Nl', 'No',
        'Pc', 'Pd', 'Ps', 'Pe', 'Pi', 'Pf', 'Po',
        'Sm', 'Sc', 'Sk', 'So',
        'Zs', 'Zl', 'Zp',
        'Cc', 'Cf', 'Cs', 'Co', 'Cn',
    )
    for candidate in categories:
        if _matches(character, candidate):
            return candidate
    return 'Cn'


def combining(value):
    return 230 if category(value) in ('Mn', 'Mc', 'Me') else 0


def bidirectional(value):
    character = _character(value)
    point = ord(character)
    kind = category(character)
    if kind in ('Mn', 'Mc', 'Me'):
        return 'NSM'
    if character in ('\n', '\r'):
        return 'B'
    if character in ('\t', ' '):
        return 'WS'
    if '0' <= character <= '9':
        return 'EN'
    if 0x0590 <= point <= 0x05FF:
        return 'R'
    if (
        0x0600 <= point <= 0x08FF
        or 0xFB50 <= point <= 0xFDFF
        or 0xFE70 <= point <= 0xFEFF
    ):
        if 0x0660 <= point <= 0x0669:
            return 'AN'
        return 'AL'
    if kind[0] in ('L', 'N'):
        return 'L'
    return ''


def name(value, default=runtime.undefined):
    character = _character(value)
    if _matches(character, 'Assigned'):
        # ECMAScript does not expose the human-readable UCD name.  Callers
        # commonly use truthiness to distinguish assigned code points.
        return 'U+' + hex(ord(character))[2:].upper().zfill(4)
    if default is not runtime.undefined:
        return default
    raise ValueError('no such name')


def decomposition(value):
    character = _character(value)
    decomposed = normalize('NFD', character)
    if decomposed == character:
        return ''
    return ' '.join(hex(ord(item))[2:].upper().zfill(4) for item in decomposed)


def mirrored(_value):
    return 0


def east_asian_width(value):
    point = ord(_character(value))
    if (
        0x1100 <= point <= 0x115F
        or 0x2E80 <= point <= 0xA4CF
        or 0xAC00 <= point <= 0xD7A3
        or 0xF900 <= point <= 0xFAFF
        or 0xFE10 <= point <= 0xFE6F
        or 0xFF00 <= point <= 0xFF60
    ):
        return 'W'
    return 'Na'
