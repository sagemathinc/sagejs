from __python__ import hash_literals

from ast_types import (
    AST_AnnotatedAssignment,
    AST_Class,
    AST_Method,
    AST_SymbolNonlocal,
    AST_SymbolRef,
    AST_Var,
    is_node_type,
)
from output.functions import decorate, function_definition, function_annotation
from output.utils import create_doctring
from utils import has_prop


def _print_prepared_body(self, output, state):
    previous = output.prepared_namespace
    definition = self.name.definition()
    output.prepared_namespace = {
        "scope": self,
        "state": state,
        "prefix": definition.name if definition else self.name.name,
        "parent": previous,
    }
    previous_class_body = output.in_class_body
    output.in_class_body = True
    try:
        names = Object.keys(self.own_classvars or self.classvars or {})
        for stmt in self.python_namespace_body or self.body:
            if is_node_type(stmt, AST_Method) or is_node_type(stmt, AST_Class):
                if names.indexOf(stmt.name.name) == -1:
                    names.push(stmt.name.name)
        names.push("__doc__", "__annotations__")
        output.indent()
        output.print(state + ".bind(" + JSON.stringify(names) + ")")
        output.end_statement()
        for statement in self.python_namespace_body or self.body:
            annotated = (
                statement
                if is_node_type(statement, AST_AnnotatedAssignment)
                else statement.body
            )
            if is_node_type(annotated, AST_AnnotatedAssignment):
                output.indent()
                output.print(state + ".setup_annotations()")
                output.end_statement()
                break
        if (
            self.docstrings
            and self.docstrings.length
            and output.options.keep_docstrings
        ):
            output.indent()
            output.print(state + '.bindings["__doc__"] = ')
            output.print(JSON.stringify(create_doctring(self.docstrings)))
            output.end_statement()
        for stmt in self.python_namespace_body or self.body:
            if is_node_type(stmt, AST_Method):
                name = stmt.name.name
                output.indent()
                if name in self.nonlocal_names:
                    output.print_python_name(name)
                else:
                    output.print(state + ".bindings[" + JSON.stringify(name) + "]")
                output.print(" = ")
                if (
                    name == "__new__"
                    and not (stmt.python_namespace_decorators or []).length
                ):
                    output.print("ρσ_staticmethod(")
                previous_static = stmt["static"]
                stmt["static"] = True
                try:
                    decorate(
                        stmt.python_namespace_decorators or stmt.decorators or [],
                        output,
                        lambda: function_definition(
                            stmt, output, False, True, "ρσ_prepared_method_" + name
                        ),
                    )
                finally:
                    stmt["static"] = previous_static
                if (
                    name == "__new__"
                    and not (stmt.python_namespace_decorators or []).length
                ):
                    output.print(")")
                output.end_statement()
            elif is_node_type(stmt, AST_Class):
                output.indent()
                stmt.print(output)
                if stmt.name.name not in self.nonlocal_names:
                    output.indent()
                    output.print(
                        state + ".bindings[" + JSON.stringify(stmt.name.name) + "] = "
                    )
                    stmt.name.print(output)
                    output.end_statement()
            elif not (
                is_node_type(stmt, AST_Var)
                and all(
                    is_node_type(item.name, AST_SymbolNonlocal)
                    for item in stmt.definitions
                )
            ):
                output.indent()
                stmt.print(output)
                output.newline()
    finally:
        output.prepared_namespace = previous
        output.in_class_body = previous_class_body


def print_class(output):
    self = this
    bases = self.bases or []
    requires_header = self.metaclass or bases.length
    if not output.options.python_attributes or self.external or not requires_header:
        return _print_legacy_class(self, output)
    output.prepared_class_serial = (output.prepared_class_serial or 0) + 1
    header = "ρσ_class_header_" + str(output.prepared_class_serial)
    state = "ρσ_class_namespace_" + str(output.prepared_class_serial)
    decorators = self.decorators or []
    output.indent()
    output.print("var " + header + " = [[")
    for index, decorator in enumerate(decorators):
        if index:
            output.comma()
        decorator.expression.print(output)
    output.print("], ρσ_math_tuple([")
    for index, base in enumerate(bases):
        if index:
            output.comma()
        base.print(output)
    output.print("]), ")
    if self.metaclass:
        self.metaclass.print(output)
    else:
        output.print("undefined")
    output.print("]")
    output.end_statement()
    output.indent()
    output.print("var " + state + " = ρσ_prepare_class(")
    output.print(JSON.stringify(self.name.name))
    output.print(", " + header + "[1], " + header + "[2], ")
    output.print(JSON.stringify(self.module_id or "__main__"))
    output.print(")")
    output.end_statement()
    output.indent()
    output.print("if (" + state + " !== undefined) ")

    def prepared():
        _print_prepared_body(self, output, state)
        output.indent()
        output.print("var ")
        self.name.print(output)
        output.print(" = " + state + ".finish()")
        output.end_statement()
        for index in range(len(decorators) - 1, -1, -1):
            output.indent()
            output.assign(self.name)
            output.print("ρσ_resolve_callable(" + header + "[0][" + str(index) + "])(")
            self.name.print(output)
            output.print(")")
            output.end_statement()

    output.with_block(prepared)
    output.print(" else ")
    original_parent = self.parent
    original_metaclass = self.metaclass
    original_decorators = [item.expression for item in decorators]
    self.bases = [
        AST_SymbolRef({"name": header + "[1][" + str(index) + "]"})
        for index in range(len(bases))
    ]
    self.python_header_original_bases = bases
    self.python_header_default = True
    if bases.length:
        self.parent = self.bases[0]
    if original_metaclass:
        self.metaclass = AST_SymbolRef({"name": header + "[2]"})
    for index, decorator in enumerate(decorators):
        decorator.expression = AST_SymbolRef(
            {"name": header + "[0][" + str(index) + "]"}
        )
    try:
        output.with_block(lambda: _print_legacy_class(self, output))
    finally:
        self.bases = bases
        self.python_header_original_bases = None
        self.python_header_default = False
        self.parent = original_parent
        self.metaclass = original_metaclass
        for index, decorator in enumerate(decorators):
            decorator.expression = original_decorators[index]


def _print_legacy_class(self, output):
    if self.external:
        return
    # Runtime-loaded package modules do not participate in the compiler's
    # cross-module class metadata cache. Keep emission robust when an imported
    # base supplied only the minimal dynamic shell used during lowering.
    self["static"] = self["static"] or {}
    self.classmethods = self.classmethods or {}
    self.bound = self.bound or []
    self.shadowed_bound = self.shadowed_bound or []
    self.bind_inherited_methods = self.bind_inherited_methods is not False
    self.dynamic_properties = self.dynamic_properties or {}
    self.classvars = self.classvars or {}
    self.bases = self.bases or []
    self.metaclass = self.metaclass or None
    self.namedtuple_fields = self.namedtuple_fields or []
    class_definition = self.name.definition()
    class_binding_name = (
        (class_definition.mangled_name or class_definition.name)
        if class_definition
        else self.name.name
    )
    compiling_baselib = (
        output.options.omit_baselib
        and not output.options.private_scope
        and not output.options.write_name
        and not output.options.python_attributes
    )
    native_storage_parent = None
    native_storage_names = [
        "dict",
        "int",
        "list",
        "map",
        "str",
        "ρσ_dict",
        "ρσ_int",
        "ρσ_list_constructor",
        "ρσ_str",
    ]
    for base in self.python_header_original_bases or self.bases:
        if is_node_type(base, AST_SymbolRef) and base.name in native_storage_names:
            native_storage_parent = base.name
            break

    live_keyword_constructor = (
        output.options.python_attributes
        and not compiling_baselib
        and not native_storage_parent
    )

    def class_def(method, is_var):
        output.indent()
        self.name.print(output)
        if not is_var and method and has_prop(self["static"], method):
            output.assign("." + method)
        else:
            if is_var:
                output.assign(".prototype[" + method + "]")
            else:
                output.assign(".prototype" + (("." + method) if method else ""))

    def define_method(stmt, is_property):
        name = stmt.name.name
        javascript_name = "ρσ_method_" + name
        if not is_property:
            class_def(name)
        # only strip first argument if the method is static
        is_static = has_prop(self["static"], name)
        is_classmethod = has_prop(self.classmethods, name)
        strip_first = not is_static

        # decorate the method
        if stmt.decorators and stmt.decorators.length:
            if is_property:
                output.print(
                    "(function(ρσ_property_function){return function"
                    + ("(value)" if stmt.is_setter else "()")
                    + "{return ρσ_resolve_callable(ρσ_property_function)(this"
                    + (", value" if stmt.is_setter else "")
                    + ")}})("
                )
                decorate(
                    stmt.decorators,
                    output,
                    lambda: function_definition(
                        stmt,
                        output,
                        strip_first,
                        True,
                        javascript_name,
                    ),
                )
                output.print(")")
            elif not is_static and not is_classmethod:
                # A mutating marker decorator such as pluggy's ``@hookimpl``
                # returns the original compiler-emitted method, whose receiver
                # already arrives through JavaScript ``this``.  A transforming
                # decorator such as ``@contextmanager`` returns a distinct
                # ordinary function expecting explicit ``self``.  Preserve
                # the former and adapt only the latter.
                output.print(
                    "(function(ρσ_original_method){"
                    "ρσ_original_method."
                    "__sagejs_method_signature_excludes_self__=true;"
                    "var ρσ_decorated_method="
                )
                decorate(
                    stmt.decorators,
                    output,
                    lambda: output.print("ρσ_original_method"),
                )
                output.print(";return ρσ_decorated_method === ρσ_original_method ? ")
                output.print("ρσ_decorated_method : ")
                output.print(
                    '(typeof ρσ_decorated_method === "function" '
                    "&& ρσ_decorated_method.__sagejs_native_method__ !== true) "
                    "? ρσ_native_method_adapter(ρσ_decorated_method) "
                    ": ρσ_decorated_method})("
                )
                function_definition(
                    stmt,
                    output,
                    strip_first,
                    True,
                    javascript_name,
                )
                output.print(")")
            else:
                decorate(
                    stmt.decorators,
                    output,
                    lambda: function_definition(
                        stmt,
                        output,
                        strip_first,
                        True,
                        javascript_name,
                    ),
                )
            if not is_property:
                output.end_statement()
        else:
            function_definition(
                stmt,
                output,
                strip_first,
                False,
                javascript_name,
            )
            if not is_property:
                output.end_statement()
                fname = (
                    (
                        output.make_python_name(class_binding_name)
                        if self.name.python_identifier
                        else output.make_name(class_binding_name)
                    )
                    + ("." if is_static else ".prototype.")
                    + name
                )
                function_annotation(stmt, output, strip_first, fname)
                if is_static:
                    output.indent()
                    self.name.print(output)
                    output.assign(".prototype." + name)
                    self.name.print(output)
                    output.print("." + name)
                    output.end_statement()
                    output.indent()
                    self.name.print(output)
                    output.print("." + name + ".__staticmethod__ = true")
                    output.end_statement()
                elif is_classmethod:
                    output.indent()
                    self.name.print(output)
                    output.print(".prototype." + name + ".__classmethod__ = true")
                    output.end_statement()
                if (
                    is_classmethod
                    or not is_static
                    and not name.startswith("__")
                    and name != "prototype"
                ):
                    output.indent()
                    if name in ("length", "name", "caller", "arguments"):
                        # A function already owns these, and `length` and `name`
                        # are not writable, so an ordinary assignment throws in
                        # the strict-mode wrapper.  Define the unbound method
                        # instead, which is what Python exposes here.
                        output.print("Object.defineProperty(")
                        self.name.print(output)
                        output.print(', "' + name + '", {value: ')
                        self.name.print(output)
                        output.print(
                            ".prototype."
                            + name
                            + ", configurable: true"
                            + ", writable: true, enumerable: false})"
                        )
                    else:
                        self.name.print(output)
                        output.assign("." + name)
                        self.name.print(output)
                        output.print(".prototype." + name)
                    output.end_statement()

        if not is_property and not is_static:
            output.indent()
            self.name.print(output)
            output.print(
                ".prototype."
                + name
                + ".__sagejs_method_signature_excludes_self__ = true"
            )
            output.end_statement()

    def define_default_method(name, body):
        class_def(name)
        output.spaced("function", name, "()", "")
        output.with_block(lambda: [output.indent(), body()])
        output.end_statement()

    def add_hidden_property(name, proceed, writable=False):
        output.indent(), output.print("Object.defineProperty(")
        (
            self.name.print(output),
            output.print(".prototype"),
            output.comma(),
            output.print(JSON.stringify(name)),
            output.comma(),
        )
        output.spaced("{value:", ""), proceed()
        if writable:
            output.print(", writable:true, configurable:true")
        output.print("})"), output.end_statement()

    def add_hidden_class_property(name, proceed, writable=False):
        output.indent(), output.print("Object.defineProperty(")
        (
            self.name.print(output),
            output.comma(),
            output.print(JSON.stringify(name)),
            output.comma(),
        )
        output.spaced("{value:", ""), proceed()
        if writable:
            output.print(", writable:true, configurable:true")
        output.print("})"), output.end_statement()

    # generate constructor
    def write_constructor():
        uses_python_new = has_prop(self["static"], "__new__")
        instance_name = "ρσ_python_instance" if uses_python_new else "this"
        output.print("function")
        output.space()
        self.name.print(output)
        output.print("()")
        output.space()

        def f_constructor():
            output.indent()
            output.print("if (!(this instanceof ")
            self.name.print(output)
            output.print("))")

            def call_without_new():
                output.indent()
                output.print("var ρσ_allocated = Object.create(")
                self.name.print(output)
                output.print(".prototype)")
                output.end_statement()
                output.indent()
                output.print("return Reflect.apply(")
                self.name.print(output)
                output.print(", ρσ_allocated, arguments)")
                output.end_statement()

            output.with_block(call_without_new)
            if live_keyword_constructor:
                output.indent()
                output.print(
                    "var ρσ_keyword_call = arguments.length > 0"
                    " && arguments[arguments.length - 1] != null"
                    " && arguments[arguments.length - 1][ρσ_kwargs_symbol] === true"
                )
                output.end_statement()
            # A user-defined ``__new__`` owns allocation.  In particular, it
            # may deliberately return an instance of a different subclass,
            # as pytz.LazyList does.  Preallocating native storage here would
            # discard that return value when the constructor recurses with
            # the newly allocated Array/Map wrapper.
            if native_storage_parent and not uses_python_new:
                output.indent()
                if native_storage_parent in ("list", "ρσ_list_constructor"):
                    output.print("if (!Array.isArray(this))")
                elif native_storage_parent in ("str", "ρσ_str"):
                    output.print(
                        "if (Object.prototype.toString.call(this)"
                        ' !== "[object String]")'
                    )
                elif native_storage_parent in ("int", "ρσ_int"):
                    output.print(
                        "if (Object.prototype.toString.call(this)"
                        ' !== "[object Number]")'
                    )
                elif native_storage_parent == "map":
                    output.print("if (this.ρσ_native_map_subclass !== true)")
                else:
                    output.print(
                        "if (this.jsmap === undefined || this.keymap === undefined)"
                    )

                def f_native_storage():
                    output.indent()
                    output.print("var ρσ_native_instance = ")
                    if native_storage_parent in ("str", "ρσ_str"):
                        output.print("Reflect.construct(String, arguments, ")
                        self.name.print(output)
                        output.print(")")
                    elif native_storage_parent in ("int", "ρσ_int"):
                        output.print("Reflect.construct(Number, arguments, ")
                        self.name.print(output)
                        output.print(")")
                    elif native_storage_parent == "map":
                        output.print("map.apply(undefined, arguments)")
                    elif native_storage_parent in ("list", "ρσ_list_constructor"):
                        output.print(native_storage_parent + "()")
                    else:
                        self.parent.print(output)
                        output.print("()")
                    output.end_statement()
                    if native_storage_parent == "map":
                        output.indent()
                        output.print(
                            "Object.setPrototypeOf("
                            "map.prototype, "
                            "Object.getPrototypeOf("
                            "ρσ_native_instance))"
                        )
                        output.end_statement()
                        output.indent()
                        output.print(
                            "Object.defineProperty("
                            "ρσ_native_instance, "
                            '"ρσ_native_map_subclass", '
                            "{value: true})"
                        )
                        output.end_statement()
                    output.indent()
                    output.print("Object.setPrototypeOf(ρσ_native_instance, ")
                    self.name.print(output)
                    output.print(".prototype)")
                    output.end_statement()
                    output.indent()
                    self.name.print(output)
                    output.print(".apply(ρσ_native_instance, arguments)")
                    output.end_statement()
                    output.indent()
                    output.print("return ρσ_native_instance")
                    output.end_statement()

                output.with_block(f_native_storage)
            if uses_python_new:
                output.indent()
                output.print("var " + instance_name + " = ")
                if live_keyword_constructor:
                    output.print("ρσ_keyword_call ? ρσ_call_keyword_allocator(")
                    self.name.print(output)
                    output.print(".__new__")
                    output.comma()
                    self.name.print(output)
                    output.comma()
                    output.print("arguments) : ")
                self.name.print(output)
                output.print(".__new__.apply(undefined, [")
                self.name.print(output)
                output.print("].concat(Array.prototype.slice.call(arguments)))")
                output.end_statement()
                output.indent()
                output.print("if (!(" + instance_name + " instanceof ")
                self.name.print(output)
                output.print(")) return " + instance_name)
                output.end_statement()
            if not self.lightweight:
                output.indent()
                output.spaced(
                    "if",
                    "(" + instance_name + ".ρσ_object_id",
                    "===",
                    "undefined)",
                    "Object.defineProperty(" + instance_name + ",",
                    '"ρσ_object_id",',
                    '{"value":++ρσ_object_counter})',
                )
                output.end_statement()
            if live_keyword_constructor:
                output.indent()
                output.print("var ρσ_initializer = ")
                self.name.print(output)
                output.print(".prototype.__init__")
                output.end_statement()
                output.indent()
                output.print(
                    "if (ρσ_initializer.__sagejs_synthetic_init__ === true)"
                    " ρσ_initializer = ρσ_live_initializer("
                )
                self.name.print(output)
                output.print(")")
                output.end_statement()
            output.indent()
            output.print("var ρσ_init_result = ")
            if output.options.python_attributes:
                output.print("ρσ_skip_init_for_custom_new(")
                self.name.print(output)
                output.comma()
                if live_keyword_constructor:
                    output.print("ρσ_initializer")
                else:
                    self.name.print(output)
                    output.print(".prototype.__init__")
                output.print(") ? undefined : ")
            if live_keyword_constructor:
                output.print(
                    "ρσ_keyword_call ? ρσ_call_keyword_initializer(ρσ_initializer"
                )
                output.comma()
                output.print(instance_name)
                output.comma()
                output.print("arguments) : ")
            if output.options.python_attributes:
                if live_keyword_constructor:
                    output.print("ρσ_initializer")
                else:
                    self.name.print(output)
                    output.print(".prototype.__init__")
                output.print(".__python_descriptor__ === true ? ")
                output.print("ρσ_call_assigned_initializer(")
                if live_keyword_constructor:
                    output.print("ρσ_initializer")
                else:
                    self.name.print(output)
                    output.print(".prototype.__init__")
                output.comma()
                output.print(instance_name)
                output.comma()
                output.print("arguments) : ")
            if live_keyword_constructor:
                output.print("ρσ_initializer")
            else:
                self.name.print(output)
                output.print(".prototype.__init__")
            (
                output.print(".apply(" + instance_name),
                output.comma(),
                output.print("arguments)"),
            )
            output.end_statement()
            if not compiling_baselib:
                output.indent()
                output.print(
                    "if (ρσ_init_result !== undefined"
                    " && ρσ_init_result !== null) "
                    "throw new TypeError("
                    '"__init__() should return None")'
                )
                output.end_statement()
            output.indent()
            output.print("return " + instance_name)
            output.end_statement()

        output.with_block(f_constructor)

    decorators = self.decorators or []
    if decorators.length or self.sequential_definition:
        output.print("var ")
        output.assign(self.name)
        write_constructor()
        output.semicolon()
    else:
        write_constructor()
    output.newline()

    add_hidden_class_property(
        "__name__", lambda: output.print(JSON.stringify(self.name.name)), True
    )
    add_hidden_class_property(
        "__qualname__", lambda: output.print(JSON.stringify(self.name.name)), True
    )

    def print_class_module():
        if output.options.baselib_module_id:
            output.print(JSON.stringify(output.options.baselib_module_id))
        elif self.module_id:
            output.print(JSON.stringify(self.module_id))
        else:
            output.print('(typeof __name__ === "undefined" ? null : __name__)')

    add_hidden_class_property("__module__", print_class_module, True)

    if not compiling_baselib:
        output.indent()
        output.print("ρσ_register_heap_class(")
        self.name.print(output)
        output.print(")")
        output.end_statement()

    class_annotations = []
    for statement in self.body:
        annotated = statement
        if not is_node_type(annotated, AST_AnnotatedAssignment):
            annotated = getattr(statement, "body", None)
        if is_node_type(annotated, AST_AnnotatedAssignment) and is_node_type(
            annotated.target, AST_SymbolRef
        ):
            class_annotations.append(annotated)
    if class_annotations.length:

        def print_class_annotations():
            if compiling_baselib:
                output.print("{")
                for index, annotated in enumerate(class_annotations):
                    if index:
                        output.comma()
                    output.print(JSON.stringify(annotated.target.name))
                    output.colon()
                    annotated.annotation.print(output)
                output.print("}")
                return
            output.print("(function(){var ρσ_annotations = ρσ_dict();")
            for annotated in class_annotations:
                output.print("ρσ_annotations.set(")
                output.print(JSON.stringify(annotated.target.name))
                output.comma()
                annotated.annotation.print(output)
                output.print(");")
            output.print("return ρσ_annotations;})()")

        add_hidden_class_property("__annotations__", print_class_annotations, True)

    if decorators.length:
        output.indent()
        self.name.print(output)
        output.spaced(".ρσ_decorators", "=", "[")
        num = decorators.length
        for i in range(num):
            decorators[i].expression.print(output)
            output.spaced("," if i < num - 1 else "]")
        output.semicolon()
        output.newline()

    # Validate bases before mutating any prototypes.  In particular, a bound
    # native method's JavaScript constructor is Function, but CPython does not
    # permit ``class C(type([].append))``.
    if self.bases.length:
        output.indent()
        output.print("ρσ_validate_class_bases([")
        for i, base in enumerate(self.bases):
            if i:
                output.comma()
            base.print(output)
        output.print("])")
        output.end_statement()

    # inheritance
    if self.parent:
        output.indent()
        output.print("ρσ_extends")

        def f_extends():
            self.name.print(output)
            output.comma()
            self.parent.print(output)

        output.with_parens(f_extends)
        output.end_statement()

    if not compiling_baselib:
        output.indent()
        output.print("ρσ_finalize_heap_class(")
        self.name.print(output)
        output.print(")")
        output.end_statement()

    if live_keyword_constructor:
        output.indent()
        output.print("ρσ_register_keyword_constructor(")
        self.name.print(output)
        output.print(")")
        output.end_statement()

    # dynamic properties
    property_names = Object.keys(self.dynamic_properties)
    if property_names.length:
        output.indent()
        output.print("Object.defineProperties")

        def f_props():
            self.name.print(output)
            output.print(".prototype")
            output.comma()
            output.space()

            def f_enum():
                for name in property_names:
                    prop = self.dynamic_properties[name]
                    (
                        output.indent(),
                        output.print(JSON.stringify(name) + ":"),
                        output.space(),
                    )

                    def f_enum2():
                        (
                            output.indent(),
                            output.print('"enumerable":'),
                            output.space(),
                            output.print("true"),
                            output.comma(),
                            output.newline(),
                        )
                        if prop.getter:
                            output.indent(), output.print('"get":'), output.space()
                            (
                                define_method(prop.getter, True),
                                output.comma(),
                                output.newline(),
                            )
                        output.indent(), output.print('"set":'), output.space()
                        if prop.setter:
                            define_method(prop.setter, True), output.newline()
                        else:
                            (
                                output.spaced(
                                    "function",
                                    "()",
                                    "{",
                                    """throw new AttributeError("can't set attribute")""",
                                    "}",
                                ),
                                output.newline(),
                            )

                    output.with_block(f_enum2)
                    output.comma()
                    output.newline()

            output.with_block(f_enum)

        output.with_parens(f_props)
        output.end_statement()
        output.indent()
        output.print("ρσ_register_data_descriptor_names(")
        output.print(JSON.stringify(property_names))
        output.print(")")
        output.end_statement()
        for name in property_names:
            prop = self.dynamic_properties[name]
            if prop.deleter:
                class_def("ρσ_property_deleter_" + name)
                define_method(prop.deleter, True)
                output.end_statement()
            if output.options.python_attributes:
                class_name = (
                    output.make_python_name(class_binding_name)
                    if self.name.python_identifier
                    else output.make_name(class_binding_name)
                )
                descriptor_name = (
                    "Object.getOwnPropertyDescriptor("
                    + class_name
                    + ".prototype, "
                    + JSON.stringify(name)
                    + ")"
                )
                for accessor, member in [
                    [prop.getter, descriptor_name + ".get"],
                    [prop.setter, descriptor_name + ".set"],
                    [
                        prop.deleter,
                        class_name + ".prototype.ρσ_property_deleter_" + name,
                    ],
                ]:
                    if accessor:
                        function_annotation(accessor, output, True, member)
                output.indent()
                output.print(
                    "ρσ_register_property("
                    + class_name
                    + ", "
                    + JSON.stringify(name)
                    + ", "
                    + ("true" if prop.setter else "false")
                    + ")"
                )
                output.end_statement()

    # Python executes a class body from top to bottom.  The JavaScript class
    # representation emits methods as prototype properties, but their default
    # arguments are still evaluated at definition time.  Emit the leading
    # ordinary class-body statements before the first method/nested class so a
    # default such as ``def f(self, value=SENTINEL)`` sees an earlier
    # ``SENTINEL = object()`` assignment.  Remaining statements stay in the
    # historical post-method section below; preserving arbitrary interleaving
    # is a separate, larger class-namespace lowering concern.
    early_statements = []
    for stmt in self.body:
        if is_node_type(stmt, AST_Method) or is_node_type(stmt, AST_Class):
            break
        if self.statements.indexOf(stmt) is not -1:
            early_statements.append(stmt)

    def print_class_statement(stmt):
        if is_node_type(stmt, AST_Var) and all(
            is_node_type(definition.name, AST_SymbolNonlocal)
            for definition in stmt.definitions
        ):
            return
        output.indent()
        previous_class_body = output.in_class_body
        output.in_class_body = True
        try:
            stmt.print(output)
        finally:
            output.in_class_body = previous_class_body
        output.newline()

    for stmt in early_statements:
        print_class_statement(stmt)

    emitted_statements = list(early_statements)

    constructor_signature_attributes = [
        ".__argnames__",
        ".__defaults__",
        ".__kwdefaults__",
        ".__handles_kwarg_interpolation__",
        ".__kwonly__",
        ".__positional_only__",
        ".__varargs__",
        ".__varkw__",
    ]
    constructor_annotation_attributes = [
        (".__annotations__", ".__signature_annotations__"),
        (".__annotations_text__", ".__signature_annotations_text__"),
    ]

    # actual methods
    if not self.init:
        # Create a default __init__ method
        def f_default():
            if self.parent:
                if output.options.python_attributes:
                    output.print("return ")
                self.parent.print(output)
                output.spaced(".prototype.__init__", "&&")
                if output.options.python_attributes:
                    output.print("(")
                    self.parent.print(output)
                    output.print(
                        ".prototype.__init__.__python_descriptor__ === true ? "
                    )
                    output.print("ρσ_call_assigned_initializer(")
                    self.parent.print(output)
                    output.print(".prototype.__init__")
                    output.comma()
                    output.print("this")
                    output.comma()
                    output.print("arguments) : ")
                    output.print("\u03c1\u03c3_forward_kwargs(")
                    output.print("this")
                    output.comma()
                    self.parent.print(output)
                    output.print(".prototype.__init__")
                    output.comma()
                    output.print("Array.from(arguments)")
                    output.print("))")
                else:
                    # The compiler's immutable stage-zero AST constructors
                    # intentionally pass a JavaScript initializer object
                    # through their synthetic inheritance chain.
                    self.parent.print(output)
                    output.print(".prototype.__init__.apply")

                    def f_this_arguments():
                        output.print("this")
                        output.comma()
                        output.print("arguments")

                    output.with_parens(f_this_arguments)
                output.end_statement()

        define_default_method("__init__", f_default)
        output.indent()
        self.name.print(output)
        output.print(".prototype.__init__.__sagejs_synthetic_init__ = true")
        output.end_statement()
        if self.parent:
            output.indent()
            self.name.print(output)
            output.print(".prototype.__init__.__sagejs_synthetic_init_target__ = ")
            self.parent.print(output)
            output.print(".prototype.__init__")
            output.end_statement()
            # The class call binder consults constructor metadata before the
            # synthetic forwarding method runs.  Mirror the inherited
            # initializer signature on both the forwarding method and class
            # so keyword validation and binding remain exact.
            for attr in constructor_signature_attributes:
                output.indent()
                self.name.print(output)
                output.print(".prototype.__init__")
                output.assign(attr)
                self.parent.print(output)
                output.print(".prototype.__init__ && ")
                self.parent.print(output)
                output.print(".prototype.__init__" + attr)
                output.end_statement()
                output.indent()
                self.name.print(output)
                output.assign(attr)
                self.name.print(output)
                output.print(".prototype.__init__" + attr)
                output.end_statement()
            for source_attr, target_attr in constructor_annotation_attributes:
                output.indent()
                self.name.print(output)
                output.print(".prototype.__init__")
                output.assign(source_attr)
                self.parent.print(output)
                output.print(".prototype.__init__ && ")
                self.parent.print(output)
                output.print(".prototype.__init__" + source_attr)
                output.end_statement()
                output.indent()
                self.name.print(output)
                output.assign(target_attr)
                self.name.print(output)
                output.print(".prototype.__init__" + source_attr)
                output.end_statement()

    defined_methods = {}

    for stmt in self.body:
        if is_node_type(stmt, AST_Method):
            if stmt.is_getter or stmt.is_setter or stmt.is_deleter:
                continue
            if stmt.name.name in self.nonlocal_names:
                output.indent()
                output.assign(
                    output.make_python_name(stmt.name.name)
                    if stmt.name.python_identifier
                    else stmt.name.name
                )
                function_definition(
                    stmt,
                    output,
                    False,
                    False,
                    (
                        output.make_python_name(stmt.name.name)
                        if stmt.name.python_identifier
                        else stmt.name.name
                    ),
                )
                output.end_statement()
                function_annotation(
                    stmt,
                    output,
                    False,
                    (
                        output.make_python_name(stmt.name.name)
                        if stmt.name.python_identifier
                        else stmt.name.name
                    ),
                )
                continue
            define_method(stmt)
            defined_methods[stmt.name.name] = True
            sname = stmt.name.name
            if sname is "__init__":
                # Copy argument handling data so that kwarg interpolation works when calling the constructor
                for attr in constructor_signature_attributes:
                    output.indent(), self.name.print(output), output.assign(attr)
                    (
                        self.name.print(output),
                        output.print(".prototype.__init__" + attr),
                        output.end_statement(),
                    )
                for source_attr, target_attr in constructor_annotation_attributes:
                    output.indent(), self.name.print(output), output.assign(target_attr)
                    (
                        self.name.print(output),
                        output.print(".prototype.__init__" + source_attr),
                        output.end_statement(),
                    )
            if sname is "__iter__":
                class_def("ρσ_iterator_symbol", True)
                self.name.print(output)
                output.print(".prototype." + stmt.name.name)
                output.end_statement()

        elif is_node_type(stmt, AST_Class):
            # Nested bases execute in the surrounding class namespace, just
            # like other class-body expressions. Preserve the scoped flag
            # while rendering the nested definition, then restore it.
            print_class_statement(stmt)
            if stmt.name.name not in self.nonlocal_names:
                class_def(JSON.stringify(stmt.name.name), True)
                stmt.name.print(output)
                output.end_statement()

        elif (
            self.statements.indexOf(stmt) is not -1
            and emitted_statements.indexOf(stmt) is -1
        ):
            # Class namespaces execute sequentially.  In particular, an
            # alias made between two definitions of the same method must keep
            # the first function object rather than resolving the final
            # prototype value after every method has been emitted.
            print_class_statement(stmt)
            emitted_statements.append(stmt)

    if not self.init and output.options.python_attributes:
        output.indent()
        output.print("ρσ_apply_custom_new_signature(")
        self.name.print(output)
        output.comma()
        self.name.print(output)
        output.print(".prototype.__init__)")
        output.end_statement()

    if defined_methods["__next__"]:
        class_def("next", False)
        # Built-in classes are emitted before the internal runtime adapter is
        # initialized.  Resolve it when iteration starts instead of capturing
        # its temporarily undefined value while the baselib is loading.
        output.print("function(){return ρσ_python_iterator_next.call(this)}")
        output.end_statement()

    native_list_parent = native_storage_parent in ("list", "ρσ_list_constructor")

    if not defined_methods["__repr__"] and not native_list_parent:

        def f_repr():
            if self.parent:
                (
                    output.print("if("),
                    self.parent.print(output),
                    output.spaced(".prototype.__repr__)", "return", self.parent),
                )
                output.print(".prototype.__repr__.call(this)"), output.end_statement()
            # A class can outlive (or be rendered outside) the JavaScript
            # scope which compiled its definition.  Derive the display name
            # from the class object instead of closing over the module's
            # ``__name__`` global.  Besides matching Python's metadata model,
            # this is essential for bootstrap classes whose defining scope
            # intentionally has no Python module globals.
            class_module = '(this.constructor.__module__ || "__main__")'
            class_name = (
                "(this.constructor.__qualname__ || "
                "this.constructor.__name__ || "
                "this.constructor.name)"
            )
            (
                output.indent(),
                output.spaced(
                    "return", '"<"', "+", class_module, "+", '"."', "+", class_name, ""
                ),
            )
            output.spaced("+", '" #"', "+", "this.ρσ_object_id", "+", '">"')
            output.end_statement()

        define_default_method("__repr__", f_repr)
        output.indent()
        self.name.print(output)
        output.print(".prototype.__repr__.__sagejs_synthetic_method__ = true")
        output.end_statement()

    if not defined_methods["__str__"] and (
        not native_list_parent or defined_methods["__repr__"]
    ):

        def f_str():
            if self.parent:
                (
                    output.print("if("),
                    self.parent.print(output),
                    output.spaced(".prototype.__str__)", "return", self.parent),
                )
                output.print(".prototype.__str__.call(this)"), output.end_statement()
            output.spaced("return", "this.__repr__()")
            output.end_statement()

        define_default_method("__str__", f_str)
        output.indent()
        self.name.print(output)
        output.print(".prototype.__str__.__sagejs_synthetic_method__ = true")
        output.end_statement()

    # Multiple inheritance
    def f_basis():
        if output.options.python_tuples:
            output.print("ρσ_math_tuple(")
        output.print("[")
        for i in range(len(self.bases)):
            self.bases[i].print(output)
            if i < self.bases.length - 1:
                output.comma()
        output.print("]")
        if output.options.python_tuples:
            output.print(")")

    add_hidden_property("__bases__", f_basis)
    add_hidden_class_property("__bases__", f_basis)

    def f_mro():
        output.print("ρσ_compute_mro(")
        self.name.print(output)
        output.comma()
        f_basis()
        output.print(")")

    add_hidden_class_property("__mro__", f_mro)

    if self.bases.length > 1:
        output.indent()
        output.print("ρσ_mixin(")
        self.name.print(output)
        for i in range(1, len(self.bases)):
            output.comma()
            self.bases[i].print(output)
        output.print(")"), output.end_statement()
        if not self.init:
            # C3 mixin resolution can replace a synthetic initializer from an
            # empty primary base with an explicit initializer from a later
            # base.  Refresh the class-call contract from the winning method.
            for attr in constructor_signature_attributes:
                output.indent()
                self.name.print(output)
                output.assign(attr)
                self.name.print(output)
                output.print(".prototype.__init__ && ")
                self.name.print(output)
                output.print(".prototype.__init__" + attr)
                output.end_statement()
            for source_attr, target_attr in constructor_annotation_attributes:
                output.indent()
                self.name.print(output)
                output.assign(target_attr)
                self.name.print(output)
                output.print(".prototype.__init__ && ")
                self.name.print(output)
                output.print(".prototype.__init__" + source_attr)
                output.end_statement()

    # Every Python class has ``__doc__``.  Keep the attribute present with a
    # value of ``None`` even when the class has no docstring; introspection
    # libraries rely on the distinction between a missing attribute and an
    # undocumented class.
    def f_doc():
        if (
            self.docstrings
            and self.docstrings.length
            and output.options.keep_docstrings
        ):
            output.print(JSON.stringify(create_doctring(self.docstrings)))
        else:
            output.print("null")

    add_hidden_property("__doc__", f_doc, True)
    add_hidden_class_property("__doc__", f_doc, True)

    # Other statements in the class context
    for stmt in self.statements:
        if (
            not is_node_type(stmt, AST_Method)
            and emitted_statements.indexOf(stmt) is -1
        ):
            print_class_statement(stmt)

    # Bind fresh method values on access, never in the instance namespace.
    # Saved methods retain their function/receiver; later reads see mutations.
    if self.bound.length:
        seen_lazy_methods = Object.create(None)
        for bname in self.bound:
            if (
                seen_lazy_methods[bname]
                or self.dynamic_properties[bname]
                # Single-underscore methods on these internal classes are
                # compiler/runtime hooks, not user-facing Python methods.
                # Leaving them as ordinary prototype functions lets hot
                # calls such as ``left._mul_(right)`` preserve JavaScript's
                # receiver without allocating a bound wrapper.
                or (
                    self.lightweight
                    and bname.startswith("_")
                    and not bname.startswith("__")
                )
            ):
                continue
            seen_lazy_methods[bname] = True
            is_classmethod = has_prop(self.classmethods, bname)
            output.indent()

            def f_lazy_binding():
                # Block-local captures avoid allocating an immediately invoked
                # factory for every method during runtime initialization.
                output.indent()
                output.print("const ρσ_prototype = ")
                self.name.print(output)
                output.print(".prototype")
                output.end_statement()
                output.indent()
                output.print("const ρσ_unbound_method = ρσ_prototype.")
                output.print(bname)
                output.end_statement()
                output.indent()
                output.print(
                    'if (typeof ρσ_unbound_method === "function" && '
                    "ρσ_unbound_method.__sagejs_callable_instance__ !== true) "
                )
                output.print("Object.defineProperty(ρσ_prototype, ")
                output.print(JSON.stringify(bname))
                output.comma()
                output.space()
                output.print("{configurable: true, enumerable: true, ")
                output.print("get: Object.assign(function()")

                def f_lazy_getter():
                    output.indent()
                    output.print("if (this === ρσ_prototype) return ρσ_unbound_method")
                    output.end_statement()
                    output.indent()
                    output.assign("var ρσ_receiver")
                    output.print("ρσ_type(this)" if is_classmethod else "this")
                    output.end_statement()
                    output.indent()
                    output.print(
                        "return ρσ_finish_bound_method("
                        "ρσ_unbound_method.bind(ρσ_receiver), "
                        "ρσ_unbound_method, ρσ_receiver)"
                    )
                    output.end_statement()

                output.with_block(f_lazy_getter)
                output.print(
                    ", {__sagejs_lazy_method_getter__: true, "
                    "__sagejs_unbound_method__: ρσ_unbound_method})"
                )
                output.print(", set: function(ρσ_method_value)")

                def f_lazy_setter():
                    output.indent()
                    output.print("Object.defineProperty(this, ")
                    output.print(JSON.stringify(bname))
                    output.comma()
                    output.space()
                    output.print(
                        "{value: ρσ_method_value, writable: true, "
                        "configurable: true, enumerable: true})"
                    )
                    output.end_statement()

                output.with_block(f_lazy_setter)
                output.print("})")
                output.end_statement()

            output.with_block(f_lazy_binding)
            output.end_statement()

    # A property alias such as ``old_name = new_name`` is represented as a
    # native prototype descriptor.  Reading it from the prototype here would
    # execute its getter with the prototype as ``self``.  It is not also a
    # class variable, and native properties have no Python ``__set_name__``
    # hook to call.
    classvar_names = [
        name
        for name in Object.keys(self.own_classvars or self.classvars)
        if not self.dynamic_properties[name]
    ]
    for classvar_name in classvar_names:
        output.indent()
        output.print("if (typeof ")
        self.name.print(output)
        output.print(".prototype[")
        output.print(JSON.stringify(classvar_name))
        output.print("]")
        output.print(' !== "function") ')
        if classvar_name in ("length", "name", "caller", "arguments"):
            # JavaScript functions reserve these properties.  Python class
            # variables with the same names must still replace the host
            # reflection value on the class object.  ``name`` and ``length``
            # are non-writable but configurable; ``caller`` and ``arguments``
            # are inherited poison-pill accessors in strict mode.
            output.print("Object.defineProperty(")
            self.name.print(output)
            output.comma()
            output.print(JSON.stringify(classvar_name))
            output.comma()
            output.print("{value: ")
            self.name.print(output)
            output.print(".prototype[")
            output.print(JSON.stringify(classvar_name))
            output.print("]")
            output.print(", configurable: true, writable: true})")
        elif classvar_name != "prototype":
            self.name.print(output)
            output.print("[")
            output.print(JSON.stringify(classvar_name))
            output.assign("]")
            self.name.print(output)
            output.print(".prototype[")
            output.print(JSON.stringify(classvar_name))
            output.print("]")
        else:
            # The JavaScript constructor's own non-configurable ``prototype``
            # slot is needed for instance construction.  Descriptor lookup on
            # Python classes still reaches the class namespace through the
            # prototype object, so do not overwrite the host slot here.
            output.print("void 0")
        output.end_statement()
    if classvar_names.length:
        output.indent()
        output.print("ρσ_call_set_names(")
        self.name.print(output)
        output.comma()
        output.print(JSON.stringify(classvar_names))
        output.comma()
        output.print("[")
        for index in range(classvar_names.length):
            if index:
                output.comma()
            self.name.print(output)
            output.print(".prototype." + classvar_names[index])
        output.print("])")
        output.end_statement()
    inherited_callable_names = Object.keys(self["static"]).concat(
        Object.keys(self.classmethods)
    )
    for method_name in inherited_callable_names:
        if (
            not compiling_baselib
            and method_name == "__annotations__"
            and not defined_methods[method_name]
            and not (self.own_classvars or {})[method_name]
        ):
            # The default type annotation slot is own-class-only. Do not
            # materialize an inherited callable annotation value as an own
            # constructor property and accidentally bypass that slot.
            continue
        output.indent()
        self.name.print(output)
        output.assign("." + method_name)
        self.name.print(output)
        output.print(".prototype." + method_name)
        output.end_statement()

    if not compiling_baselib:
        output.indent()
        output.print("ρσ_install_instance_dict(")
        self.name.print(output)
        output.comma()
        output.print(
            "true"
            if (self.own_classvars or {})["__dict__"]
            or defined_methods["__dict__"]
            or self.dynamic_properties["__dict__"]
            else "false"
        )
        output.print(")")
        output.end_statement()

    # An explicit Python 3 metaclass owns the final class object.  The native
    # lowering above efficiently evaluates the class body and gives us its
    # complete namespace; hand that namespace to the metaclass before class
    # decorators run, exactly as CPython does.
    if self.metaclass and not self.python_header_default:
        output.indent()
        output.assign(self.name)
        output.print("ρσ_apply_metaclass(")
        self.metaclass.print(output)
        output.comma()
        output.print_string(self.name.name)
        output.comma()
        f_basis()
        output.comma()
        self.name.print(output)
        output.print(")")
        output.end_statement()
    elif self.bases.length and not self.python_header_default:
        output.indent()
        output.assign(self.name)
        output.print("ρσ_apply_inherited_metaclass(")
        output.print_string(self.name.name)
        output.comma()
        f_basis()
        output.comma()
        self.name.print(output)
        output.print(")")
        output.end_statement()

    if decorators.length:
        output.indent()
        output.assign(self.name)
        for di in range(decorators.length):
            self.name.print(output)
            output.print(f".ρσ_decorators[{di}](")
        self.name.print(output)
        output.print(")" * decorators.length)
        output.semicolon()
        output.newline()
        output.indent()
        output.spaced("delete ")
        self.name.print(output)
        output.print(".ρσ_decorators")
        output.semicolon()
        output.newline()

    if self.sequence_class:
        output.indent()
        output.assign(self.name)
        output.print("ρσ_callable_sequence_class(")
        self.name.print(output)
        output.print(")")
        output.end_statement()

    if self.callable_instance_class or defined_methods["__call__"]:
        output.indent()
        output.assign(self.name)
        output.print("ρσ_callable_instance_class_adapter(")
        self.name.print(output)
        output.print(")")
        output.end_statement()

    # Python deliberately exposes class creation through a mutable builtin.
    # Keep the optimized native lowering for the default hook, but honor a
    # replacement hook when user code installs one through ``builtins``.
    if not compiling_baselib:
        output.indent()
        output.print(
            'if (typeof __build_class__ === "function" && '
            "!__build_class__.__sagejs_default_build_class__)"
        )

        def call_build_class_hook():
            output.indent()
            output.assign(self.name)
            output.print("__build_class__(function(){}, ")
            output.print_string(self.name.name)
            if not self.implicit_object_base:
                for base in self.bases:
                    output.comma()
                    base.print(output)
            output.print(")")
            output.end_statement()

        output.with_block(call_build_class_hook)

    if self.namedtuple_fields.length:
        output.indent()
        output.assign(self.name)
        output.print("ρσ_finalize_namedtuple_class(")
        self.name.print(output)
        output.comma()
        output.print(JSON.stringify(self.namedtuple_fields))
        output.print(")")
        output.end_statement()

    # Definitions should not display their implementation object merely
    # because the class is the final statement entered in the REPL.
    output.indent()
    output.print("undefined")
    output.end_statement()
