# Deliberately no import: builtin namespace setup is not an import side effect.
def public_dir():
    return dir


def public_len():
    return len


def public_isinstance():
    return isinstance


assert public_len()([1, 2, 3]) == 3
assert public_isinstance()(1, int)
assert "append" in public_dir()([])
