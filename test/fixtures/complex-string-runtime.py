assert complex("1+2j") == 1 + 2j
assert complex("-3.5e2-4e-1j") == -350 - 0.4j
assert complex("j") == 1j
assert complex("-j") == -1j
assert complex("( 2 +3j )") == 2 + 3j

try:
    complex("1+2j", 3)
except TypeError:
    pass
else:
    raise AssertionError("a complex string cannot have a second argument")
