"""Execute ordinary library source on CPython; this is not a Sage runtime test."""

import pathlib
import re
import sys
import traceback
import types


sys.dont_write_bytecode = True
unittest_path, warnings_path, fixture_path, mode = sys.argv[1:]
model = types.ModuleType("unittest")
model.__file__ = unittest_path
exec(
    compile(pathlib.Path(unittest_path).read_text(), unittest_path, "exec"),
    model.__dict__,
)
sys.modules["unittest"] = model

if mode == "source-warnings":
    package = types.ModuleType("sagejs")
    package.__path__ = []
    runtime = types.ModuleType("sagejs.runtime")
    package.runtime = runtime
    sys.modules["sagejs"] = package
    sys.modules["sagejs.runtime"] = runtime
    warning_model = types.ModuleType("warnings")
    warning_model.__file__ = warnings_path
    exec(
        compile(pathlib.Path(warnings_path).read_text(), warnings_path, "exec"),
        warning_model.__dict__,
    )
    sys.modules["warnings"] = warning_model
elif mode != "native-warnings":
    raise ValueError("unknown source-model mode")

exec(
    compile(pathlib.Path(fixture_path).read_text(), fixture_path, "exec"),
    {"__name__": "__main__"},
)
