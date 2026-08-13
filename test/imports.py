# globals:test_path, assrt
from _import_one import (
    toplevel_var,
    toplevel_func as tf,
    TopLevel,
    true_var,
    test_other,
    increment,
)
from _import_two import toplevel_var2, toplevel_func2, TopLevel2 as TL2


def AClass(x):
    return this


eq = assrt.equal
# Test import of top-level variables and callables
eq(toplevel_var, "foo")
eq(tf("x"), "xtoplevel")
eq(toplevel_var2, "foo2")
eq(toplevel_func2("x"), "xtoplevel2")
eq(test_other, "other")
eq(increment(41), 42)

# Test import of top-level vars in a conditional
eq("true", true_var)

# Test plain imports
import _import_one

eq(hasattr(_import_one, "false_var"), False)
eq(_import_one.toplevel_var, toplevel_var)
eq(_import_one.toplevel_func("x"), tf("x"))

# Test recognition of imported classes
tl = TopLevel("1")
eq(tl.a, "1")
tl2 = TL2("x")
eq(tl2.a, "x")

# Test access to submodules via plain imports
import _import_two.sub, _import_two.sub as ts

eq("sub", _import_two.sub.sub_var)
eq("sub", ts.sub_var)
eq("sub", _import_two.sub.sub_func())

# Test deep import
from _import_two.level2.deep import deep_var

eq("deep", deep_var)

# Test that class accessed via plain import is
# recognized
s = _import_two.sub.Sub(1)
eq(s.a, 1)
s2 = ts.Sub(1)
eq(s2.a, 1)


# Test that a class imported into an inner scope is not recognized as a class
# outside that scope
def inner():
    from _import_one import AClass

    a = AClass(1)
    eq(a.a, 1)


inner()
b = AClass(1)
eq(b, this)

# A module-level `global` statement is a Python no-op; it does not publish the
# binding into another module or onto the JavaScript host.
GLOBAL_SYMBOL = "i am local"
eq(_import_one.GLOBAL_SYMBOL, "i am global")
eq(GLOBAL_SYMBOL, "i am local")

# Missing-import diagnostics are covered by the frontend/module-resolver tests;
# this executable file focuses on successful runtime import semantics.
