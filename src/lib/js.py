# Low-level compiler helpers used to express JavaScript object construction
# without exposing that machinery to ordinary library source.

from __python__ import Object  # type: ignore


# This gives us the new operator as a Python function call:
def js_new(f, *args, **kwds):
    receiver = Object.create(f.prototype)
    supplied_args = args.concat([ρσ_desugar_kwargs([kwds])])
    return ρσ_interpolate_kwargs_constructor(receiver, False, f, supplied_args)


def js_instanceof(obj, cls):
    return r"%js obj instanceof cls"
