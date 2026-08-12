# vim:fileencoding=utf-8
# License: BSD Copyright: 2016, Kovid Goyal <kovid at kovidgoyal.net>
# globals: writefile
from __python__ import hash_literals

from output.statements import declare_vars, display_body
from output.stream import OutputStream
from output.utils import create_doctring
from output.comments import print_comments, output_comments
from output.functions import set_module_name
from compiler_version import get_compiler_version
from utils import cache_file_name
from ast_types import (
    AST_Call,
    AST_Class,
    AST_Import,
    AST_Lambda,
    AST_String,
    AST_SymbolRef,
    AST_Toplevel,
    TreeWalker,
    is_node_type,
)


def control_flow_import_names(module):
    """Return module names assigned by imports nested in control flow."""
    names = {}
    walker = None

    def collect(node, descend):
        if node is module:
            return
        if is_node_type(node, AST_Import) or (
            node.key and (node.argnames is not undefined or node.alias is not undefined)
        ):
            # The parser's import container is transparent to this walk.  A
            # direct module import has only the toplevel as an ancestor; an
            # additional statement/block ancestor means JavaScript ``var``
            # hoisting can mask Python's builtin fallback.
            if walker.stack.length > 2:
                if node.argnames:
                    for argname in node.argnames:
                        local_name = (
                            argname.alias.name if argname.alias else argname.name
                        )
                        names[local_name] = True
                elif node.alias:
                    names[node.alias.name] = True
                elif node.key:
                    names[node.key.split(".")[0]] = True
            return True
        if is_node_type(node, AST_Lambda) or is_node_type(node, AST_Class):
            return True

    walker = TreeWalker(collect)
    module.walk(walker)
    return names


def prepare_numeric_literal_pool(module, output):
    if not output.options.pool_numeric_literals:
        return []
    entries = []
    by_key = {}
    prefix = output.options.numeric_literal_pool_prefix or ""

    def collect(node, descend):
        if (
            is_node_type(node, AST_Call)
            and is_node_type(node.expression, AST_SymbolRef)
            and node.expression.name in ("Integer", "Number", "RealNumber", "ρσ_float")
            and node.args.length is 1
            and is_node_type(node.args[0], AST_String)
        ):
            constructor = node.expression.name
            source = node.args[0].value
            key = constructor + ":" + source
            name = by_key[key]
            if not name:
                name = prefix + "ρσ_const_" + entries.length
                by_key[key] = name
                entries.push(
                    {"name": name, "constructor": constructor, "source": source}
                )
            node.pooled_numeric_name = name
            return True

    module.walk(TreeWalker(collect))
    return entries


def write_numeric_literal_pool(entries, output):
    if not entries.length:
        return
    output.indent()
    output.print("var ")
    for i, entry in enumerate(entries):
        if i:
            output.comma()
            output.space()
        output.print(entry.name)
        output.space()
        output.print("=")
        output.space()
        output.print(entry.constructor)
        output.print("(")
        output.print_string(entry.source)
        output.print(")")
    output.end_statement()


def write_imports(module, output):
    imports = []
    for import_id in Object.keys(module.imports):
        imports.push(module.imports[import_id])

    imports.sort(lambda left, right: left.import_order - right.import_order)
    output.indent()
    if output.options.module_registry:
        output.print("var ρσ_modules = globalThis[")
        output.print_string(output.options.module_registry)
        output.print("] || (globalThis[")
        output.print_string(output.options.module_registry)
        output.print("] = {});")
    elif output.options.baselib_module_id:
        # Baselib modules need a private ``__main__`` alias, but their import
        # lookup must remain connected to the process-wide Python module
        # cache.  A prototype view supplies both properties without replacing
        # the canonical ``__main__`` entry as each baselib module initializes.
        output.print(
            "var ρσ_modules = Object.create(globalThis.ρσ_modules || "
            "(globalThis.ρσ_modules = {}));"
        )
    else:
        # Python has one sys.modules cache per interpreter. Standalone output
        # used to allocate a disconnected registry, which made a function
        # defined in the baselib unable to import a module embedded by the
        # calling program once lexical baselib scopes were introduced.
        output.print(
            "var ρσ_modules = globalThis.ρσ_modules || (globalThis.ρσ_modules = {});"
        )
    output.newline()
    if output.options.baselib_module_id:
        output.indent()
        output.print("ρσ_modules.__main__ = globalThis.__sagejs_baselib_modules__[")
        output.print_string(output.options.baselib_module_id)
        output.print("] || (globalThis.__sagejs_baselib_modules__[")
        output.print_string(output.options.baselib_module_id)
        output.print("] = Object.create(null))")
        output.end_statement()
    if not output.options.baselib_module_id:
        output.indent()
        output.print(
            "if (globalThis.__sagejs_baselib_modules__) "
            "Object.assign(ρσ_modules, globalThis.__sagejs_baselib_modules__)"
        )
        output.end_statement()
    if any(module_.module_id == "builtins" for module_ in imports):
        output.indent()
        output.print("ρσ_modules.builtins = {}")
        output.end_statement()
        output.indent()
        output.print(
            "Object.defineProperties(ρσ_modules.builtins, {"
            "abs:{enumerable:true,get:function(){return abs},"
            "set:function(value){abs=value}},"
            "open:{enumerable:true,get:function(){return ρσ_open},"
            "set:function(value){ρσ_open=value}},"
            "__build_class__:{enumerable:true,"
            "get:function(){return __build_class__},"
            "set:function(value){__build_class__=value}},"
            "__import__:{enumerable:true,"
            "get:function(){return __import__},"
            "set:function(value){__import__=value}}"
            "})"
        )
        output.end_statement()

    # Declare all variable names exported from the modules as global symbols
    nonlocalvars = {}
    for module_ in imports:
        for name in module_.nonlocalvars:
            nonlocalvars[name] = True
    nonlocalvars = Object.getOwnPropertyNames(nonlocalvars).join(", ")
    if nonlocalvars.length:
        output.indent()
        output.print("var " + nonlocalvars)
        output.semicolon()
        output.newline()

    # Create the module objects
    for module_ in imports:
        module_id = module_.module_id
        if module_.dynamic:
            continue
        output.indent()
        if module_id == "__main__" and output.options.reuse_main_module:
            output.print(
                "ρσ_modules.__main__ && "
                "ρσ_modules.__main__.__sagejs_reusable_main__ || ("
                "ρσ_modules.__main__ = new Proxy(ρσ_modules.__main__ || {}, {"
                "set:function(target,name,incoming,receiver){"
                "if (typeof name === 'string' && "
                "!Object.prototype.hasOwnProperty.call(target,name)) "
                "globalThis[name]=incoming;"
                "return Reflect.set(target,name,incoming,receiver)},"
                "deleteProperty:function(target,name){"
                "if (typeof name === 'string') globalThis[name]=undefined;"
                "var descriptor=Reflect.getOwnPropertyDescriptor(target,name);"
                "if (descriptor && typeof descriptor.set === 'function') "
                "return Reflect.set(target,name,undefined,target);"
                "return Reflect.deleteProperty(target,name)},"
                "ownKeys:function(target){"
                "return Reflect.ownKeys(target).filter(function(name){"
                "if (name === '__sagejs_reusable_main__' || "
                "name === '__sagejs_main_magic_initialized__') return false;"
                "return typeof name !== 'string' || "
                "Reflect.get(target,name) !== undefined})}}),"
                "Object.defineProperty(ρσ_modules.__main__,"
                "'__sagejs_reusable_main__',{value:true,configurable:true}),"
                "ρσ_modules.__main__)"
            )
        elif module_id.indexOf(".") is -1:
            output.print("ρσ_modules." + module_id)
        else:
            output.print('ρσ_modules["' + module_id + '"]')
        if not (module_id == "__main__" and output.options.reuse_main_module):
            output.space(), output.print("="), output.space(), output.print("{}")
        output.end_statement()

    # Every loaded child module is also an attribute of its parent package.
    # Python establishes this relationship independently of whether user code
    # wrote ``import package.child`` or ``from package import child``.
    for module_ in imports:
        module_id = module_.module_id
        if module_.dynamic or module_id.indexOf(".") is -1:
            continue
        parts = module_id.split(".")
        parent_id = parts.slice(0, -1).join(".")
        child_name = parts[parts.length - 1]
        output.indent()
        output.print("if (ρσ_modules[")
        output.print_string(parent_id)
        output.print("]) ρσ_modules[")
        output.print_string(parent_id)
        output.print("][")
        output.print_string(child_name)
        output.print("] = ρσ_modules[")
        output.print_string(module_id)
        output.print("]")
        output.end_statement()

    # Output module code
    for module_ in imports:
        if module_.module_id is not "__main__" and not module_.dynamic:
            print_module(module_, output)


def write_main_name(output, filename=None):
    module_id = output.options.baselib_module_id
    if module_id:
        package_name = ".".join(module_id.split(".")[:-1])
        output.newline()
        output.indent()
        output.print("var __name__ = ")
        output.print_string(module_id)
        output.print(", __package__ = ")
        output.print_string(package_name)
        output.print(
            ", __loader__ = null, __cached__ = null, "
            "__builtins__ = globalThis, __doc__ = null"
        )
        output.semicolon()
        if filename:
            output.newline()
            output.indent()
            output.print("var __file__ = " + JSON.stringify(filename))
            output.semicolon()
        output.newline()
        output.indent()
        output.print("var __spec__ = {name:")
        output.print_string(module_id)
        output.print(",parent:")
        output.print_string(package_name)
        output.print(",origin:")
        output.print_string(filename or "")
        output.print(",loader:null,submodule_search_locations:null}")
        output.semicolon()
        output.newline()
        output.newline()
    elif output.options.write_name:
        output.newline()
        output.indent()
        if output.options.reuse_main_module:
            output.print(
                "if (!ρσ_modules.__main__."
                "__sagejs_main_magic_initialized__) {"
                '__name__ = "__main__"; __package__ = null; '
                "__loader__ = null; __spec__ = null; __cached__ = null; "
                "__builtins__ = ρσ_modules.builtins || {}; "
            )
            if filename:
                output.print("__file__ = " + JSON.stringify(filename) + "; ")
            output.print(
                "Object.defineProperty(ρσ_modules.__main__,"
                "'__sagejs_main_magic_initialized__',"
                "{value:true,configurable:true})}"
            )
        else:
            output.print(
                'var __name__ = "__main__", __package__ = null, '
                "__loader__ = null, __spec__ = null, __cached__ = null, "
                "__builtins__ = ρσ_modules.builtins || {}"
            )
        output.semicolon()
        if filename and not output.options.reuse_main_module:
            output.newline()
            output.indent()
            output.print("var __file__ = " + JSON.stringify(filename))
            output.semicolon()
        output.newline()
        output.newline()


def module_directory(filename):
    normalized = filename.replaceAll("\\", "/")
    index = normalized.lastIndexOf("/")
    return normalized.slice(0, index) if index >= 0 else "."


def write_module_metadata(module, output):
    """Create the standard import globals for an ordinary Python module."""
    module_id = module.module_id
    filename = module.filename or ""
    normalized = filename.replaceAll("\\", "/")
    is_package = normalized.endsWith("/__init__.py")
    package_name = module_id if is_package else ".".join(module_id.split(".")[:-1])
    directory = module_directory(filename)

    output.indent()
    output.print("var __name__ = ")
    output.print_string(module_id)
    output.print(", __file__ = ")
    output.print_string(filename)
    output.print(", __package__ = ")
    output.print_string(package_name)
    output.print(", __loader__ = null, __cached__ = null")
    output.print(", __builtins__ = ρσ_modules.builtins || {}")
    if is_package:
        output.print(", __path__ = [")
        output.print_string(directory)
        output.print("]")
    output.end_statement()

    output.indent()
    output.print("var __spec__ = {name:")
    output.print_string(module_id)
    output.print(",parent:")
    output.print_string(package_name)
    output.print(",origin:")
    output.print_string(filename)
    output.print(",loader:null,submodule_search_locations:")
    if is_package:
        output.print("__path__")
    else:
        output.print("null")
    output.print("}")
    output.end_statement()


def bind_module_namespace(module, output, hidden_names=None):
    """Expose module locals through a live Python module object."""
    hidden_names = hidden_names or []
    module_id = module.module_id
    display_module_id = output.options.baselib_module_id or module_id
    descriptor_prefix = (
        "{configurable:true,"
        if module_id == "__main__" and output.options.reuse_main_module
        else "{"
    )
    names = []
    seen = {}
    for symbol in module.localvars:
        if not seen[symbol.name]:
            seen[symbol.name] = True
            names.push(symbol.name)
    for nonlocal_name in module.nonlocalvars or []:
        name = nonlocal_name.name if nonlocal_name.name else nonlocal_name
        if name and not seen[name]:
            seen[name] = True
            names.push(name)
    for symbol in module.exports or []:
        if not seen[symbol.name]:
            seen[symbol.name] = True
            names.push(symbol.name)

    # Definitions executed in module-level control flow (for example, a
    # platform-dependent ``if`` or import fallback ``try``) are still module
    # globals.  The legacy scope analysis does not include every such nested
    # definition in ``localvars``, so collect their names while deliberately
    # stopping at function and class scope boundaries.
    def collect_control_flow_definition(node, descend):
        if is_node_type(node, AST_Toplevel):
            return
        if is_node_type(node, AST_Lambda) or is_node_type(node, AST_Class):
            if node.name and node.name.name and not seen[node.name.name]:
                seen[node.name.name] = True
                names.push(node.name.name)
            return True

    module.walk(TreeWalker(collect_control_flow_definition))
    magic_names = []
    if module_id is not "__main__":
        magic_names = [
            "__name__",
            "__file__",
            "__package__",
            "__loader__",
            "__spec__",
            "__cached__",
            "__builtins__",
        ]
        normalized_filename = (module.filename or "").replaceAll("\\", "/")
        if normalized_filename.endsWith("/__init__.py"):
            magic_names.push("__path__")
    elif output.options.write_name or output.options.baselib_module_id:
        magic_names = [
            "__name__",
            "__package__",
            "__loader__",
            "__spec__",
            "__cached__",
            "__builtins__",
        ]
        if output.options.baselib_module_id:
            magic_names.push("__doc__")
        if module.filename:
            magic_names.push("__file__")
    for name in magic_names:
        if not seen[name]:
            seen[name] = True
            names.push(name)

    output.indent()
    output.print("Object.defineProperties(")
    if module_id.indexOf(".") is -1:
        output.print("ρσ_modules." + module_id)
    else:
        output.print('ρσ_modules["' + module_id + '"]')
    output.comma()
    output.print("{")
    for index, name in enumerate(names):
        if index:
            output.comma()
        output.print_string(name)
        output.colon()
        if output.options.baselib_module_id:
            output.print(descriptor_prefix + "enumerable:true,get:()=>")
            output.print_name(name)
            output.print(",set:function(){")
            output.print_name(name)
            output.print("=arguments[0]}}")
        else:
            output.print(descriptor_prefix + "enumerable:true,get:function(){return ")
            output.print_name(name)
            output.print("},set:function(){")
            output.print_name(name)
            output.print("=arguments[0]}}")
    wrote_property = names.length > 0
    for entry in hidden_names:
        name = entry.name if entry.name else entry
        if seen[name]:
            continue
        if wrote_property:
            output.comma()
        wrote_property = True
        output.print_string(name)
        output.colon()
        if output.options.baselib_module_id:
            output.print(descriptor_prefix + "enumerable:false,get:()=>")
            output.print_name(name)
            output.print("}")
        else:
            output.print(descriptor_prefix + "enumerable:false,get:function(){return ")
            output.print_name(name)
            output.print("}}")
    output.print("})")
    output.end_statement()

    output.indent()
    output.print("if (!Object.prototype.hasOwnProperty.call(")
    if module_id.indexOf(".") is -1:
        output.print("ρσ_modules." + module_id)
    else:
        output.print('ρσ_modules["' + module_id + '"]')
    output.print(',"__repr__")) Object.defineProperty(')
    if module_id.indexOf(".") is -1:
        output.print("ρσ_modules." + module_id)
    else:
        output.print('ρσ_modules["' + module_id + '"]')
    output.print(',"__repr__",{value:function(){return ')
    output.print(JSON.stringify("<module '" + display_module_id + "'>"))
    output.print("}})")
    output.end_statement()


def declare_exports(module_id, exports, output, docstrings):
    seen = {}
    exported_symbols = list(exports)
    if output.options.keep_docstrings and docstrings and docstrings.length:
        exported_symbols.append(
            {
                "name": "__doc__",
                "refname": "ρσ_module_doc__",
            }
        )
        output.newline(), output.indent()
        v = "var"
        (
            output.assign(v + " ρσ_module_doc__"),
            output.print(JSON.stringify(create_doctring(docstrings))),
        )
        output.end_statement()
    output.newline()
    for symbol in exported_symbols:
        if not Object.prototype.hasOwnProperty.call(seen, symbol.name):
            output.indent()
            if module_id.indexOf(".") is -1:
                output.print("ρσ_modules." + module_id + "." + symbol.name)
            else:
                output.print('ρσ_modules["' + module_id + '"].' + symbol.name)
            (
                output.space(),
                output.print("="),
                output.space(),
                output.print(symbol.refname or symbol.name),
            )
            seen[symbol.name] = True
            output.end_statement()


def prologue(module, output):
    # any code that should appear before the main body
    if output.options.omit_baselib:
        return
    output.indent()
    v = "var"
    output.print(v), output.space()
    output.spaced.apply(
        output,
        (
            'ρσ_iterator_symbol = (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") ? Symbol.iterator : "iterator-Symbol-5d0927e5554349048cf0e3762a228256"'.split(
                " "
            )
        ),
    )
    output.end_statement()
    output.indent(), output.print(v), output.space()
    output.spaced.apply(
        output,
        (
            'ρσ_kwargs_symbol = (typeof Symbol === "function") ? Symbol("kwargs-object") : "kwargs-object-Symbol-5d0927e5554349048cf0e3762a228256"'.split(
                " "
            )
        ),
    )
    output.end_statement()
    (
        output.indent(),
        output.spaced(
            "var",
            "ρσ_cond_temp,",
            "ρσ_expr_temp,",
            "ρσ_prop_temp,",
            "ρσ_last_exception",
        ),
        output.end_statement(),
    )
    (
        output.indent(),
        output.spaced("var", "ρσ_object_counter", "=", "0"),
        output.end_statement(),
    )
    # Needed for Chrome < 51 and Edge as of August 2016
    (
        output.indent(),
        output.spaced(
            "if(",
            "typeof",
            "HTMLCollection",
            "!==",
            '"undefined"',
            "&&",
            "typeof",
            "Symbol",
            "===",
            '"function")',
            "NodeList.prototype[Symbol.iterator]",
            "=",
            "HTMLCollection.prototype[Symbol.iterator]",
            "=",
            "NamedNodeMap.prototype[Symbol.iterator]",
            "=",
            "Array.prototype[Symbol.iterator]",
        ),
    )
    output.end_statement()
    # output the baselib
    if not output.options.baselib_plain:
        raise ValueError(
            "The baselib is missing! Remember to set the baselib_plain field on the options for OutputStream"
        )
    output.print(output.options.baselib_plain)
    output.end_statement()


def print_top_level(self, output):
    effective_module_id = output.options.baselib_module_id or self.module_id
    set_module_name(effective_module_id)
    is_main = self.module_id is "__main__"
    numeric_literal_pool = prepare_numeric_literal_pool(self, output)
    output.module_control_flow_names = control_flow_import_names(self)

    def write_docstrings():
        if (
            is_main
            and output.options.keep_docstrings
            and self.docstrings
            and self.docstrings.length
        ):
            output.newline(), output.indent()
            v = "var"
            (
                output.assign(
                    v
                    + (
                        " __doc__"
                        if output.options.baselib_module_id
                        else " ρσ_module_doc__"
                    )
                ),
                output.print(JSON.stringify(create_doctring(self.docstrings))),
            )
            output.end_statement()

    if output.options.private_scope and is_main:

        def f_main_function():
            output.print("function()")

            def f_full_function():
                # strict mode is more verbose about errors, and less forgiving about them
                # kind of like Python
                output.indent()
                output.print('"use strict"')
                output.end_statement()

                prologue(self, output)
                write_imports(self, output)
                output.module_control_flow_names = control_flow_import_names(self)
                set_module_name(effective_module_id)
                output.newline()
                output.indent()

                def f_function():
                    output.print("function()")

                    def f_body():
                        write_main_name(output, self.filename)
                        output.newline()
                        write_numeric_literal_pool(numeric_literal_pool, output)
                        declare_vars(self.localvars, output)
                        bind_module_namespace(self, output, numeric_literal_pool)
                        display_body(self.body, True, output)
                        output.newline()
                        write_docstrings()
                        if self.comments_after and self.comments_after.length:
                            output.indent()
                            output_comments(self.comments_after, output)
                            output.newline()

                    output.with_block(f_body)

                output.with_parens(f_function)

                output.print("();")
                output.newline()

            output.with_block(f_full_function)

        output.with_parens(f_main_function)
        output.print("();")
        output.print("")
    else:
        if is_main:
            prologue(self, output)
            write_imports(self, output)
            output.module_control_flow_names = control_flow_import_names(self)
            set_module_name(effective_module_id)
            write_main_name(output, self.filename)
        else:
            write_module_metadata(self, output)

        write_numeric_literal_pool(numeric_literal_pool, output)
        declare_vars(self.localvars, output)
        bind_module_namespace(self, output, numeric_literal_pool)
        display_body(self.body, True, output)
        if self.comments_after and self.comments_after.length:
            output_comments(self.comments_after, output)
    set_module_name()


def print_module(self, output):
    set_module_name(self.module_id)
    # Cached modules contain rendered output and lightweight symbol metadata,
    # not a live AST. Their rendered variants already include the numeric
    # literal pool produced on the cache-writing pass.
    numeric_literal_pool = (
        [] if self.is_cached else prepare_numeric_literal_pool(self, output)
    )
    output.module_control_flow_names = (
        {} if self.is_cached else control_flow_import_names(self)
    )

    def output_module(output):
        write_numeric_literal_pool(numeric_literal_pool, output)
        declare_vars(self.localvars, output)
        bind_module_namespace(self, output, numeric_literal_pool)
        display_body(self.body, True, output)
        declare_exports(self.module_id, self.exports, output, self.docstrings)

    output.newline()
    output.indent()

    def f_print_module():
        output.print("function()")

        def dump_the_logic_of_this_module():
            print_comments(self, output)
            write_module_metadata(self, output)

            def output_key(beautify, keep_docstrings):
                return "beautify:" + beautify + " keep_docstrings:" + keep_docstrings

            okey = output_key(output.options.beautify, output.options.keep_docstrings)
            if self.is_cached and okey in self.outputs:
                output.print(self.outputs[okey])
            else:
                output_module(output)
                if self.srchash and self.filename:
                    cached = {
                        "version": get_compiler_version(),
                        "signature": self.srchash,
                        "classes": {},
                        "baselib": self.baselib,
                        "nonlocalvars": self.nonlocalvars,
                        "imported_module_ids": self.imported_module_ids,
                        "exports": [],
                        "outputs": {},
                        "discard_asserts": bool(output.options.discard_asserts),
                    }
                    for cname in Object.keys(self.classes):
                        cobj = self.classes[cname]
                        cached.classes[cname] = {
                            "name": {"name": cobj.name.name},
                            "static": cobj["static"],
                            "bound": cobj.bound,
                            "classvars": cobj.classvars,
                            # Only the names are compiler metadata in an
                            # imported-module cache.  The descriptor bodies
                            # remain in that module's emitted JavaScript.
                            "dynamic_properties": {
                                name: True
                                for name in Object.keys(cobj.dynamic_properties or {})
                            },
                        }
                    for symdef in self.exports:
                        cached.exports.push({"name": symdef.name})
                    for beautify in [True, False]:
                        for keep_docstrings in [True, False]:
                            co = OutputStream(
                                {
                                    "beautify": beautify,
                                    "keep_docstrings": keep_docstrings,
                                    "write_name": False,
                                    "discard_asserts": output.options.discard_asserts,
                                    "python_truthiness": output.options.python_truthiness,
                                    "python_ordering": output.options.python_ordering,
                                    "python_tuples": output.options.python_tuples,
                                    "python_attributes": output.options.python_attributes,
                                }
                            )
                            co.with_indent(
                                output.indentation(), lambda: output_module(co)
                            )
                            raw = co.get()
                            cached.outputs[output_key(beautify, keep_docstrings)] = raw
                    cached_name = cache_file_name(
                        self.filename, output.options.module_cache_dir
                    )
                    try:
                        if cached_name:
                            writefile(cached_name, JSON.stringify(cached, None, "\t"))
                    except Error as e:
                        console.error(
                            "Failed to write output cache file:",
                            cached_name,
                            "with error:",
                            e,
                        )

        output.with_block(dump_the_logic_of_this_module)

    output.with_parens(f_print_module)
    output.print("()")
    output.semicolon()
    output.newline()
    set_module_name()


def print_imports(container, output):
    is_first_aname = True

    def add_aname(aname, key, from_import):
        nonlocal is_first_aname
        if is_first_aname:
            is_first_aname = False
        else:
            output.indent()
        output.print("if (!Object.prototype.hasOwnProperty.call(ρσ_modules, ")
        output.print_string(key)
        output.print(")) throw new ImportError(")
        output.print_string("No module named '" + key + "'")
        output.print(")")
        output.end_statement()
        output.indent()
        if from_import:
            output.print("if (!Reflect.has(ρσ_modules[")
            output.print_string(key)
            output.print("], ")
            output.print_string(from_import)
            output.print(")) throw new ImportError(")
            output.print_string("cannot import name '" + from_import + "'")
            output.print(")")
            output.end_statement()
        output.indent()
        output.print("var ")
        output.print_name(aname)
        output.space()
        output.print("=")
        output.space()
        if key.indexOf(".") is -1:
            output.print("ρσ_modules."), output.print(key)
        else:
            output.print('ρσ_modules["'), output.print(key), output.print('"]')
        if from_import:
            output.print(".")
            output.print(from_import)
        output.end_statement()

    def import_star(key, target_module):
        output.print("if (!Object.prototype.hasOwnProperty.call(ρσ_modules, ")
        output.print_string(key)
        output.print(")) throw new ImportError(")
        output.print_string("No module named '" + key + "'")
        output.print(")")
        output.end_statement()
        output.indent()
        output.print("var ρσ_star_source = ρσ_modules[")
        output.print_string(key)
        output.print("]")
        output.end_statement()
        output.indent()
        output.print(
            "if (ρσ_star_source === null || "
            '(typeof ρσ_star_source !== "object" && '
            'typeof ρσ_star_source !== "function")) '
            'throw new ImportError("from-import target has no namespace")'
        )
        output.end_statement()
        output.indent()
        output.print('var ρσ_star_has_all = ρσ_hasattr(ρσ_star_source, "__all__")')
        output.end_statement()
        output.indent()
        output.print(
            "var ρσ_star_names = ρσ_star_has_all ? "
            'ρσ_getattr_internal(ρσ_star_source, "__all__", '
            "ρσ_getattr_missing) : "
            "ρσ_dir(ρσ_star_source)"
        )
        output.end_statement()
        output.indent()
        output.print("for (var ρσ_star_name of ρσ_star_names)")

        def copy_star_name():
            output.indent()
            output.print('if (!ρσ_star_has_all && ρσ_star_name[0] === "_") continue')
            output.end_statement()
            output.indent()
            output.print("ρσ_modules[")
            output.print_string(target_module)
            output.print(
                "][ρσ_star_name] = "
                "ρσ_getattr_internal(ρσ_star_source, ρσ_star_name, "
                "ρσ_getattr_missing)"
            )
            output.end_statement()
            output.indent()
            output.print("globalThis[ρσ_star_name] = ρσ_modules[")
            output.print_string(target_module)
            output.print("][ρσ_star_name]")
            output.end_statement()

        output.with_block(copy_star_name)

    def dynamic_import(self):
        def publish_local(name):
            if not self.target_module:
                return
            if self.target_module is "__main__":
                if not output.options.reuse_main_module:
                    return
                output.indent()
                output.print(
                    "if (!Object.prototype.hasOwnProperty.call(ρσ_modules.__main__,"
                )
                output.print_string(name)
                output.print(")) Object.defineProperty(ρσ_modules.__main__,")
                output.print_string(name)
                output.print(
                    ",{configurable:true,enumerable:true,get:function(){return "
                )
                output.print_name(name)
                output.print("},set:function(){")
                output.print_name(name)
                output.print("=arguments[0]}})")
                output.end_statement()
                return
            output.indent()
            output.print("ρσ_modules[")
            output.print_string(self.target_module)
            output.print("][")
            output.print_string(name)
            output.print("] = ")
            output.print_name(name)
            output.end_statement()

        output.print("var ρσ_imported_module")
        output.end_statement()
        output.indent()
        output.print("if (__import__.__sagejs_default_import__ === true)")

        def default_import():
            output.indent()
            output.assign("ρσ_imported_module")
            output.print("__import__(")
            output.print_string(self.key)
            output.print(", null, null, ")
            if self.argnames:
                output.print("ρσ_math_tuple([")
                for index, argname in enumerate(self.argnames):
                    if index:
                        output.comma()
                    output.print_string(argname.name)
                output.print("])")
            elif self.star or self.alias:
                output.print('ρσ_math_tuple(["*"])')
            else:
                output.print("null")
            output.comma()
            output.print(str(self.level or 0))
            output.print(")")
            output.end_statement()

        output.with_block(default_import)
        output.print(" else")

        def custom_import():
            output.indent()
            output.assign("ρσ_imported_module")
            output.print("__import__(")
            output.print_string(self.key)
            output.print(", null, null, ")
            if self.argnames:
                output.print("ρσ_math_tuple([")
                for index, argname in enumerate(self.argnames):
                    if index:
                        output.comma()
                    output.print_string(argname.name)
                output.print("])")
            elif self.star or self.alias:
                output.print('ρσ_math_tuple(["*"])')
            else:
                output.print("null")
            output.comma()
            output.print(str(self.level or 0))
            output.print(")")
            output.end_statement()

        output.with_block(custom_import)
        if self.star:
            output.indent()
            output.print("ρσ_modules[")
            output.print_string(self.key)
            output.print("] = ρσ_imported_module")
            output.end_statement()
            output.indent()
            import_star(self.key, self.target_module)
        elif self.argnames:
            for argname in self.argnames:
                local_name = argname.alias.name if argname.alias else argname.name
                output.indent()
                output.print("if (!ρσ_hasattr(ρσ_imported_module, ")
                output.print_string(argname.name)
                output.print(")) throw new ImportError(")
                output.print_string(
                    "cannot import name '" + argname.name + "' from '" + self.key + "'"
                )
                output.print(")")
                output.end_statement()
                output.indent()
                output.print("var ")
                output.print_name(local_name)
                output.space()
                output.print("=")
                output.space()
                output.print("ρσ_getattr_internal(ρσ_imported_module, ")
                output.print_string(argname.name)
                output.comma()
                output.print("ρσ_getattr_missing")
                output.print(")")
                output.end_statement()
                publish_local(local_name)
        else:
            local_name = self.alias.name if self.alias else self.key.split(".")[0]
            output.indent()
            output.print("var ")
            output.print_name(local_name)
            output.space()
            output.print("=")
            output.space()
            output.print("ρσ_imported_module")
            output.end_statement()
            publish_local(local_name)

    for self in container.imports:
        if self.intrinsic:
            if (
                output.options.reuse_main_module
                and self.target_module is "__main__"
                and self.alias
            ):
                local_name = self.alias.name
                output.indent()
                output.print("var ")
                output.print_name(local_name)
                output.space()
                output.print("=")
                output.space()
                output.print("ρσ_modules[")
                output.print_string(self.key)
                output.print("] || (ρσ_modules[")
                output.print_string(self.key)
                output.print("] = {__name__:")
                output.print_string(self.key)
                output.print("})")
                output.end_statement()
                output.indent()
                output.print("Object.defineProperty(ρσ_modules.__main__,")
                output.print_string(local_name)
                output.print(
                    ",{configurable:true,enumerable:true,get:function(){return "
                )
                output.print_name(local_name)
                output.print("},set:function(){")
                output.print_name(local_name)
                output.print("=arguments[0]}})")
                output.end_statement()
            continue
        if self.dynamic and self.key != "builtins":
            dynamic_import(self)
            continue
        if self.star:
            import_star(self.key, self.target_module)
            continue
        if self.argnames:
            # A from import
            for argname in self.argnames:
                akey = argname.alias.name if argname.alias else argname.name
                add_aname(akey, self.key, argname.name)
        else:
            if self.alias:
                add_aname(self.alias.name, self.key, False)
            else:
                parts = self.key.split(".")
                for i, part in enumerate(parts):
                    if i is 0:
                        add_aname(part, part, False)
                    else:
                        q = parts[: i + 1].join(".")
                        output.indent()
                        output.spaced(q, "=", 'ρσ_modules["' + q + '"]')
                        output.end_statement()
    if container.imports.length:
        # JavaScript reports the last assignment performed inside an import
        # statement as a script completion value.  Python import statements
        # never display a value in a REPL or notebook cell.
        output.indent()
        output.print("undefined")
        output.end_statement()
