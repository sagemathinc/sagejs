"""Check the diagnostic wrapper's argument forwarding and failure propagation."""

import ast
import importlib
import inspect
from pathlib import Path
import sys
import types

directory = Path(__file__).resolve().parent
sys.path.insert(0, str(directory.parent.parent / "src" / "lib"))
parent = types.ModuleType("arena_wrapper_probe")
parent.__path__ = [str(directory)]
sys.modules[parent.__name__] = parent
dependency = types.ModuleType(parent.__name__ + ".prepared_class_group_attempt")
seen = []


def prepared(*args):
    seen.append(args)
    return 17


dependency.pari_prepared_class_group_attempt = prepared
sys.modules[dependency.__name__] = dependency
module = importlib.import_module(parent.__name__ + ".prepared_class_group_arena")
original = ast.parse((directory / "prepared_class_group_attempt.py").read_text())
definition = next(
    node
    for node in original.body
    if isinstance(node, ast.FunctionDef)
    and node.name == "pari_prepared_class_group_attempt"
)
expected = [arg.arg for arg in definition.args.args]
function = module.pari_prepared_class_group_arena
assert list(inspect.signature(function).parameters) == expected + ["temporary_limit"]
values = tuple(object() for _ in expected)
assert function(*values, 128 * 1024 * 1024) == 17
assert len(seen) == 1 and all(a is b for a, b in zip(seen[0], values, strict=True))

events = []


class Context:
    def __init__(self, resident, temporary):
        assert resident == 0 and temporary == 23

    def __enter__(self):
        events.append("enter")
        return self

    def __exit__(self, kind, value, traceback):
        events.append(("exit", kind))
        return False


failure = RuntimeError("prepared computation failed")


def failing(*args):
    raise failure


module.NativeExactArena = Context
module.pari_prepared_class_group_attempt = failing
try:
    function(*values, 23)
except RuntimeError as error:
    assert error is failure
else:
    raise AssertionError("wrapper suppressed failure")
assert events == ["enter", ("exit", RuntimeError)]
print("Arena wrapper signature, identity forwarding and failure propagation pass")
