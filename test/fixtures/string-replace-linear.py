from __future__ import annotations


def codes(text):
    return [ord(character) for character in text]


for text in ("", "aaaa", "abab", "a\U0001f600a", "a\ud800a"):
    for old in ("", "a", "aa", "ab", "\U0001f600", "\ud800", "z"):
        for new in ("", "$&", "$$", "$`'", "x\U0001f600"):
            for count in (-7, -1, 0, 1, 2, 100):
                print(codes(text.replace(old, new, count)))
            print(codes(text.replace(old, new)))

for old, new, count in (("a", "", -1), ("a", "zz", 2), ("", "x", -1)):
    print(codes(("a" * 1000).replace(old, new, count)))

print(codes(str.replace("ababa", "a", "$&", count=2)))
