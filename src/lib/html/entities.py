"""Common HTML named character references.

This module provides the CPython ``html.entities`` API.  The compact table
covers the named references used most frequently by text-processing packages;
the full WHATWG table remains an explicitly measured standard-library gap.
"""

name2codepoint = {
    "amp": 38,
    "apos": 39,
    "cent": 162,
    "copy": 169,
    "euro": 8364,
    "gt": 62,
    "lt": 60,
    "nbsp": 160,
    "pound": 163,
    "quot": 34,
    "reg": 174,
    "yen": 165,
}

codepoint2name = {value: name for name, value in name2codepoint.items()}
entitydefs = {name: chr(value) for name, value in name2codepoint.items()}

# HTML5 accepts both spellings for these legacy names.  Values are strings,
# exactly as in CPython's ``html.entities.html5`` mapping.
html5 = {}
for _name, _value in entitydefs.items():
    html5[_name] = _value
    html5[_name + ";"] = _value
