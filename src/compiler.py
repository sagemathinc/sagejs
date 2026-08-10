# vim:fileencoding=utf-8
# License: BSD
# Copyright: 2015, Kovid Goyal <kovid at kovidgoyal.net>
# globals: console

from utils import DefaultsError, string_template
from errors import ImportError, SyntaxError
from compiler_version import get_compiler_version
from output.stream import OutputStream
from output.codegen import generate_code

generate_code()  # create the print methods on the AST nodes

# The following allows this module to be used from a pure javascript, require()
# based environment like Node.js
if jstype(exports) is "object":
    exports.DefaultsError = DefaultsError
    exports.get_compiler_version = get_compiler_version
    exports.OutputStream = OutputStream
    exports.string_template = string_template  # noqa:undef
    exports.ImportError = ImportError
    exports.SyntaxError = SyntaxError
    # Magic! Export all the AST_* nodes
    ast = ρσ_modules["ast_types"]
    for ast_node in ast:
        if ast_node.substr(0, 4) is "AST_":
            exports[ast_node] = ast[ast_node]  # noqa:undef
