cases = [
    ("0", None),
    ("5", None),
    ("9", None),
    (" 7 ", None),
    ("+7", None),
    ("-7", None),
    ("01", None),
    ("1_0", None),
    ("0x10", 0),
    ("a", 16),
    ("5", 16),
    ("101", 2),
    ("123456789012345678901234567890", None),
    ("", None),
    ("+", None),
    ("a", None),
    ("é", None),
]

for text, base in cases:
    try:
        value = int(text) if base is None else int(text, base)
    except Exception as error:
        print(repr(text), base, type(error).__name__)
    else:
        print(repr(text), base, repr(value), type(value).__name__)
