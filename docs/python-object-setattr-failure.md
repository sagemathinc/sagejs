# Rejected host writes through `object.__setattr__`

The final host fallback in `object.__setattr__` must inspect the boolean result
of `Reflect.set`. A `false` result now raises the same `AttributeError` and
read-only message as ordinary `setattr`, instead of silently reporting success.
This includes frozen native receivers, additions to nonextensible receivers,
and writes blocked by own or inherited read-only properties.

Name validation, `__class__` handling, Python data descriptors, and owned
instance-dictionary storage retain their existing precedence. There is no new
global `Reflect` behavior, freeze policy, storage representation, or native
dependency. Existing exceptions from native or Python setters propagate
unchanged. A successful setter remains successful even if the setter returns
`None` or `False`: the host write result, not the setter's return value, decides
whether assignment succeeded. An accessor setter can still succeed on a frozen
host object.

Run `node test/python-object-setattr-failure.cjs` after building. It compiles the
actual source function and a reconstruction of its unchecked predecessor, and
compares corrected behavior with ordinary `setattr` and the shipped runtime.
The old implementation's silent failures are explicitly reproduced. Native
receiver cases cover failed and successful writes, setter identity and
exceptions, and non-instance-dictionary storage. Python descriptor examples run
against CPython as well. Host freezing has no direct CPython equivalent; its
failure-message oracle is the existing Sage.js ordinary assignment contract.
For pre-build source diagnostics, `SAGEJS_OBJECT_SETATTR_COMPILER_ROOT` selects
a read-only compiler/runtime seed and omits the shipped-candidate assertion.
