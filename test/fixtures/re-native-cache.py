import re


pattern = re.compile("a")
assert pattern.search("a", 1) is None
assert pattern.search("a").group() == "a"
assert pattern.search("za", 1).group() == "a"
assert pattern.fullmatch("a").group() == "a"
assert pattern.fullmatch("aa") is None
assert pattern.search("a").group() == "a"

# Sage.js currently permits these assignments even though CPython's Pattern
# properties are read-only. Recompilation must keep the existing live behavior.
pattern.pattern = "b"
assert pattern.search("ba").group() == "b"
pattern.flags = re.IGNORECASE
assert pattern.search("B").group() == "B"
print("native regex reuse passed")
