# Retained allocation-entrypoint gap, independent of dictionary reinitialization.
# CPython passes; the pre-fix Sage.js runtime resolves type.__new__ and raises.
class Child(dict):
    pass


fresh = dict.__new__(dict)
dict.__init__(fresh, fresh=1)
assert fresh == {"fresh": 1}
fresh_child = dict.__new__(Child)
dict.__init__(fresh_child, fresh=2)
assert type(fresh_child) is Child and fresh_child == {"fresh": 2}
print("dict-explicit-new-ok")
