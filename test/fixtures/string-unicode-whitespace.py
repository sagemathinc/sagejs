from __future__ import annotations


def codes(parts):
    return [[ord(character) for character in part] for part in parts]


spaces = " \t\n\r\x0b\x0c\x1c\x1d\x1e\x1f\x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"
for space in spaces:
    text = "a" + space + "b"
    print(ord(space), space.isspace(), codes(text.split()), codes(text.split(None, 1)))
    print(
        codes(text.rsplit(None, 1)),
        [ord(character) for character in text.strip()],
        [ord(character) for character in (space + "a" + space).strip()],
    )

for text in ("", "  ", " a b ", "a\ufeffb", "\ufeff", " a\ufeffb "):
    print(
        [ord(character) for character in text],
        text.isspace(),
        codes(text.split()),
        codes(text.split(None, 0)),
    )

for text in ("", "  ", " a b ", "a  b  c", "\u2003a\u0085b\u3000c\u202f"):
    for limit in (-3, -1, 0, 1, 2, 3):
        print(codes(text.split(None, limit)), codes(text.rsplit(None, limit)))

parts = "a b".split()
parts.append("c")
print(parts)
