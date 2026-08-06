"""Python 3.14 annotation access used by runtime frameworks."""


class Format:
    VALUE = 1
    VALUE_WITH_FAKE_GLOBALS = 2
    FORWARDREF = 3
    STRING = 4


def get_annotations(
    obj,
    *,
    globals=None,
    locals=None,
    eval_str=False,
    format=Format.VALUE,
):
    del globals, locals, eval_str, format
    return dict(getattr(obj, '__annotations__', {}))
