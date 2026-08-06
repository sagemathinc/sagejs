from __python__ import hash_literals

from ast_types import (
    AST_AnnotatedAssignment, AST_Class, AST_Method,
    AST_SymbolNonlocal, AST_SymbolRef, AST_Var, is_node_type
)
from output.functions import decorate, function_definition, function_annotation
from output.utils import create_doctring
from utils import has_prop


def print_class(output):
    self = this
    if self.external:
        return
    # Runtime-loaded package modules do not participate in the compiler's
    # cross-module class metadata cache. Keep emission robust when an imported
    # base supplied only the minimal dynamic shell used during lowering.
    self['static'] = self['static'] or {}
    self.classmethods = self.classmethods or {}
    self.bound = self.bound or []
    self.dynamic_properties = self.dynamic_properties or {}
    self.classvars = self.classvars or {}
    self.bases = self.bases or []
    self.namedtuple_fields = self.namedtuple_fields or []
    compiling_baselib = (
        output.options.omit_baselib
        and not output.options.private_scope
        and not output.options.write_name
        and not output.options.python_attributes
    )
    native_storage_parent = None
    if (
        is_node_type(self.parent, AST_SymbolRef)
        and self.parent.name in [
            'dict', 'int', 'list', 'map', 'str',
            'ρσ_dict', 'ρσ_int', 'ρσ_list_constructor', 'ρσ_str']
    ):
        native_storage_parent = self.parent.name

    def class_def(method, is_var):
        output.indent()
        self.name.print(output)
        if not is_var and method and has_prop(self['static'], method):
            output.assign("." + method)
        else:
            if is_var:
                output.assign(".prototype[" + method + "]")
            else:
                output.assign(".prototype" +
                              (("." + method) if method else ""))

    def define_method(stmt, is_property):
        name = stmt.name.name
        javascript_name = 'ρσ_method_' + name
        if not is_property:
            class_def(name)
        # only strip first argument if the method is static
        is_static = has_prop(self['static'], name)
        is_classmethod = has_prop(self.classmethods, name)
        strip_first = not is_static

        # decorate the method
        if stmt.decorators and stmt.decorators.length:
            decorate(
                stmt.decorators, output,
                lambda: function_definition(
                    stmt,
                    output,
                    strip_first,
                    True,
                    javascript_name,
                ))
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
                fname = self.name.name + ('.' if is_static else
                                          '.prototype.') + name
                function_annotation(stmt, output, strip_first, fname)
                if is_static:
                    output.indent()
                    self.name.print(output)
                    output.assign('.prototype.' + name)
                    self.name.print(output)
                    output.print('.' + name)
                    output.end_statement()
                    output.indent()
                    self.name.print(output)
                    output.print('.' + name + '.__staticmethod__ = true')
                    output.end_statement()
                elif is_classmethod:
                    output.indent()
                    self.name.print(output)
                    output.print(
                        '.prototype.' + name + '.__classmethod__ = true')
                    output.end_statement()
                if (
                    is_classmethod
                    or not is_static and not name.startswith('__')
                ):
                    output.indent()
                    self.name.print(output)
                    output.assign('.' + name)
                    self.name.print(output)
                    output.print('.prototype.' + name)
                    output.end_statement()

    def define_default_method(name, body):
        class_def(name)
        output.spaced('function', name, '()', '')
        output.with_block(lambda: [output.indent(), body()])
        output.end_statement()

    def add_hidden_property(name, proceed, writable=False):
        output.indent(), output.print('Object.defineProperty(')
        self.name.print(
            output), output.print('.prototype'), output.comma(), output.print(
                JSON.stringify(name)), output.comma()
        output.spaced(
            '{value:',
            ''), proceed()
        if writable:
            output.print(', writable:true, configurable:true')
        output.print('})'), output.end_statement()

    def add_hidden_class_property(name, proceed, writable=False):
        output.indent(), output.print('Object.defineProperty(')
        self.name.print(output), output.comma(), output.print(
            JSON.stringify(name)), output.comma()
        output.spaced(
            '{value:',
            ''), proceed()
        if writable:
            output.print(', writable:true, configurable:true')
        output.print('})'), output.end_statement()

    # generate constructor
    def write_constructor():
        uses_python_new = has_prop(self['static'], '__new__')
        instance_name = 'ρσ_python_instance' if uses_python_new else 'this'
        output.print("function")
        output.space()
        self.name.print(output)
        output.print("()")
        output.space()

        def f_constructor():
            output.indent()
            output.print('if (!(this instanceof ')
            self.name.print(output)
            output.print('))')

            def call_without_new():
                output.indent()
                output.print('var ρσ_allocated = Object.create(')
                self.name.print(output)
                output.print('.prototype)')
                output.end_statement()
                output.indent()
                output.print('return ')
                self.name.print(output)
                output.print('.apply(ρσ_allocated, arguments)')
                output.end_statement()

            output.with_block(call_without_new)
            if native_storage_parent:
                output.indent()
                if native_storage_parent in (
                    'list', 'ρσ_list_constructor'
                ):
                    output.print('if (!Array.isArray(this))')
                elif native_storage_parent in ('str', 'ρσ_str'):
                    output.print(
                        'if (Object.prototype.toString.call(this)'
                        ' !== "[object String]")')
                elif native_storage_parent in ('int', 'ρσ_int'):
                    output.print(
                        'if (Object.prototype.toString.call(this)'
                        ' !== "[object Number]")')
                elif native_storage_parent == 'map':
                    output.print(
                        'if (this.ρσ_native_map_subclass !== true)')
                else:
                    output.print(
                        'if (this.jsmap === undefined'
                        ' || this.keymap === undefined)')

                def f_native_storage():
                    output.indent()
                    output.print('var ρσ_native_instance = ')
                    if native_storage_parent in ('str', 'ρσ_str'):
                        output.print(
                            'Reflect.construct('
                            'String, arguments, ')
                        self.name.print(output)
                        output.print(')')
                    elif native_storage_parent in ('int', 'ρσ_int'):
                        output.print(
                            'Reflect.construct('
                            'Number, arguments, ')
                        self.name.print(output)
                        output.print(')')
                    elif native_storage_parent == 'map':
                        output.print(
                            'map.apply(undefined, arguments)')
                    else:
                        self.parent.print(output)
                        output.print('()')
                    output.end_statement()
                    if native_storage_parent == 'map':
                        output.indent()
                        output.print(
                            'Object.setPrototypeOf('
                            'map.prototype, '
                            'Object.getPrototypeOf('
                            'ρσ_native_instance))')
                        output.end_statement()
                        output.indent()
                        output.print(
                            'Object.defineProperty('
                            'ρσ_native_instance, '
                            '"ρσ_native_map_subclass", '
                            '{value: true})')
                        output.end_statement()
                    output.indent()
                    output.print(
                        'Object.setPrototypeOf('
                        'ρσ_native_instance, ')
                    self.name.print(output)
                    output.print('.prototype)')
                    output.end_statement()
                    output.indent()
                    self.name.print(output)
                    output.print(
                        '.apply(ρσ_native_instance, arguments)')
                    output.end_statement()
                    output.indent()
                    output.print('return ρσ_native_instance')
                    output.end_statement()

                output.with_block(f_native_storage)
            if uses_python_new:
                output.indent()
                output.print('var ' + instance_name + ' = ')
                self.name.print(output)
                output.print(
                    '.__new__.apply(undefined, [')
                self.name.print(output)
                output.print(
                    '].concat(Array.prototype.slice.call(arguments)))')
                output.end_statement()
                output.indent()
                output.print('if (!(' + instance_name + ' instanceof ')
                self.name.print(output)
                output.print(')) return ' + instance_name)
                output.end_statement()
            if not self.lightweight:
                output.indent()
                output.spaced(
                    'if',
                    '(' + instance_name + '.ρσ_object_id',
                    '===',
                    'undefined)',
                    'Object.defineProperty(' + instance_name + ',',
                    '"ρσ_object_id",',
                    '{"value":++ρσ_object_counter})',
                )
                output.end_statement()
            if self.bound.length:
                output.indent()
                self.name.print(output), output.print(
                    ".prototype.__bind_methods__.call("
                    + instance_name + ")")
                output.end_statement()
            output.indent()
            output.print('var ρσ_init_result = ')
            self.name.print(output)
            output.print(
                ".prototype.__init__.apply(" + instance_name
            ), output.comma(
            ), output.print('arguments)')
            output.end_statement()
            if not compiling_baselib:
                output.indent()
                output.print(
                    'if (ρσ_init_result !== undefined'
                    ' && ρσ_init_result !== null) '
                    'throw new TypeError('
                    '"__init__() should return None")')
                output.end_statement()
            output.indent()
            output.print('return ' + instance_name)
            output.end_statement()

        output.with_block(f_constructor)

    decorators = self.decorators or []
    if decorators.length or self.sequential_definition:
        output.print('var ')
        output.assign(self.name)
        write_constructor()
        output.semicolon()
    else:
        write_constructor()
    output.newline()

    add_hidden_class_property(
        '__name__',
        lambda: output.print(JSON.stringify(self.name.name)))
    add_hidden_class_property(
        '__qualname__',
        lambda: output.print(JSON.stringify(self.name.name)))

    def print_class_module():
        if self.module_id:
            output.print(JSON.stringify(self.module_id))
        else:
            output.print(
                '(typeof __name__ === "undefined" ? null : __name__)')

    add_hidden_class_property(
        '__module__',
        print_class_module)

    class_annotations = []
    for statement in self.body:
        annotated = statement
        if not is_node_type(annotated, AST_AnnotatedAssignment):
            annotated = getattr(statement, 'body', None)
        if (
            is_node_type(annotated, AST_AnnotatedAssignment)
            and is_node_type(annotated.target, AST_SymbolRef)
        ):
            class_annotations.append(annotated)
    if class_annotations.length:
        def print_class_annotations():
            if compiling_baselib:
                output.print('{')
                for index, annotated in enumerate(class_annotations):
                    if index:
                        output.comma()
                    output.print(JSON.stringify(annotated.target.name))
                    output.colon()
                    annotated.annotation.print(output)
                output.print('}')
                return
            output.print('(function(){var ρσ_annotations = ρσ_dict();')
            for annotated in class_annotations:
                output.print('ρσ_annotations.set(')
                output.print(JSON.stringify(annotated.target.name))
                output.comma()
                annotated.annotation.print(output)
                output.print(');')
            output.print('return ρσ_annotations;})()')

        add_hidden_class_property(
            '__annotations__', print_class_annotations, True)

    if decorators.length:
        output.indent()
        self.name.print(output)
        output.spaced('.ρσ_decorators', '=', '[')
        num = decorators.length
        for i in range(num):
            decorators[i].expression.print(output)
            output.spaced(',' if i < num - 1 else ']')
        output.semicolon()
        output.newline()

    # Validate bases before mutating any prototypes.  In particular, a bound
    # native method's JavaScript constructor is Function, but CPython does not
    # permit ``class C(type([].append))``.
    if self.bases.length:
        output.indent()
        output.print('ρσ_validate_class_bases([')
        for i, base in enumerate(self.bases):
            if i:
                output.comma()
            base.print(output)
        output.print('])')
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

    # method binding
    if self.bound.length:
        seen_methods = Object.create(None)

        def f_bind_methods():
            output.spaced('function', '()', '')

            def f_bases():
                if self.bases.length:
                    for i in range(self.bases.length - 1, -1, -1):
                        base = self.bases[i]
                        output.indent(), base.print(output), output.spaced(
                            '.prototype.__bind_methods__', '&&', '')
                        base.print(output), output.print(
                            '.prototype.__bind_methods__.call(this)')
                        output.end_statement()
                # Lightweight immutable mathematical values are often
                # allocated millions of times.  Their own methods use lazy
                # prototype accessors emitted below; only inherited methods
                # from ordinary classes need the traditional eager binding.
                if not self.lightweight:
                    for bname in self.bound:
                        if seen_methods[bname] or self.dynamic_properties[bname]:
                            continue
                        seen_methods[bname] = True
                        is_classmethod = has_prop(self.classmethods, bname)

                        def f_bind_one():
                            output.indent(), output.assign('this.' + bname)
                            self.name.print(output)
                            output.print(
                                '.prototype.' + bname + '.bind(')
                            output.print(
                                'this.constructor'
                                if is_classmethod else 'this')
                            output.print(')')
                            output.end_statement()
                            output.indent(), output.print(
                                'Object.assign(this.' + bname + ', ')
                            self.name.print(output), output.print(
                                '.prototype.' + bname + ')')
                            output.end_statement()
                            output.indent(), output.assign(
                                'this.' + bname + '.__func__')
                            self.name.print(output), output.print(
                                '.prototype.' + bname)
                            output.end_statement()
                            output.indent(), output.assign(
                                'this.' + bname + '.__self__')
                            output.print(
                                'this.constructor'
                                if is_classmethod else 'this')
                            output.end_statement()
                            output.indent(), output.assign(
                                'this.' + bname + '.__name__')
                            output.print(JSON.stringify(bname))
                            output.end_statement()

                        output.indent()
                        output.print('if (typeof ')
                        self.name.print(output)
                        output.print(
                            '.prototype.' + bname
                            + ' === "function")')
                        output.with_block(f_bind_one)

            output.with_block(f_bases)

        add_hidden_property('__bind_methods__', f_bind_methods)

    # dynamic properties
    property_names = Object.keys(self.dynamic_properties)
    if property_names.length:
        output.indent()
        output.print('Object.defineProperties')

        def f_props():
            self.name.print(output)
            output.print('.prototype')
            output.comma()
            output.space()

            def f_enum():
                for name in property_names:
                    prop = self.dynamic_properties[name]
                    output.indent(), output.print(JSON.stringify(name) +
                                                  ':'), output.space()

                    def f_enum2():
                        output.indent(), output.print(
                            '"enumerable":'), output.space(), output.print(
                                'true'), output.comma(), output.newline()
                        if prop.getter:
                            output.indent(), output.print(
                                '"get":'), output.space()
                            define_method(
                                prop.getter,
                                True), output.comma(), output.newline()
                        output.indent(), output.print('"set":'), output.space()
                        if prop.setter:
                            define_method(prop.setter, True), output.newline()
                        else:
                            output.spaced(
                                'function', '()', '{',
                                '''throw new AttributeError("can't set attribute")''',
                                '}'), output.newline()

                    output.with_block(f_enum2)
                    output.comma()
                    output.newline()

            output.with_block(f_enum)

        output.with_parens(f_props)
        output.end_statement()
        for name in property_names:
            prop = self.dynamic_properties[name]
            if prop.deleter:
                class_def('ρσ_property_deleter_' + name)
                define_method(prop.deleter, True)
                output.end_statement()

    # actual methods
    if not self.init:
        # Create a default __init__ method
        def f_default():
            if self.parent:
                self.parent.print(output)
                output.spaced('.prototype.__init__', '&&')
                output.space(), self.parent.print(output)
                output.print(".prototype.__init__.apply")

                def f_this_arguments():
                    output.print("this")
                    output.comma()
                    output.print("arguments")

                output.with_parens(f_this_arguments)
                output.end_statement()

        define_default_method('__init__', f_default)
        output.indent()
        self.name.print(output)
        output.print(
            '.prototype.__init__.__sagejs_synthetic_init__ = true')
        output.end_statement()

    defined_methods = {}

    for stmt in self.body:
        if is_node_type(stmt, AST_Method):
            if stmt.is_getter or stmt.is_setter or stmt.is_deleter:
                continue
            if stmt.name.name in self.nonlocal_names:
                output.indent()
                output.assign(stmt.name.name)
                function_definition(
                    stmt,
                    output,
                    False,
                    False,
                    stmt.name.name,
                )
                output.end_statement()
                function_annotation(
                    stmt, output, False, stmt.name.name)
                continue
            define_method(stmt)
            defined_methods[stmt.name.name] = True
            sname = stmt.name.name
            if sname is '__init__':
                # Copy argument handling data so that kwarg interpolation works when calling the constructor
                for attr in [
                        '.__argnames__',
                        '.__defaults__',
                        '.__handles_kwarg_interpolation__',
                        '.__annotations__',
                        '.__annotations_text__',
                        '.__kwonly__',
                        '.__varargs__',
                        '.__varkw__',
                ]:
                    output.indent(), self.name.print(output), output.assign(
                        attr)
                    self.name.print(output), output.print(
                        '.prototype.__init__' + attr), output.end_statement()
            if sname is '__iter__':
                class_def('ρσ_iterator_symbol', True)
                self.name.print(output)
                output.print('.prototype.' + stmt.name.name)
                output.end_statement()

        elif is_node_type(stmt, AST_Class):
            stmt.print(output)
            class_def(JSON.stringify(stmt.name.name), True)
            stmt.name.print(output)
            output.end_statement()

    if defined_methods['__next__']:
        class_def('next', False)
        # Built-in classes are emitted before the internal runtime adapter is
        # initialized.  Resolve it when iteration starts instead of capturing
        # its temporarily undefined value while the baselib is loading.
        output.print(
            'function(){return ρσ_python_iterator_next.call(this)}')
        output.end_statement()

    native_list_parent = native_storage_parent in (
        'list', 'ρσ_list_constructor')

    if not defined_methods['__repr__'] and not native_list_parent:

        def f_repr():
            if self.parent:
                output.print('if('), self.parent.print(output), output.spaced(
                    '.prototype.__repr__)', 'return', self.parent)
                output.print(
                    '.prototype.__repr__.call(this)'), output.end_statement()
            output.indent(), output.spaced('return', '"<"', '+', '__name__',
                                           '+', '"."', '+',
                                           'this.constructor.name', '')
            output.spaced('+', '" #"', '+', 'this.ρσ_object_id', '+', '">"')
            output.end_statement()

        define_default_method('__repr__', f_repr)
        output.indent()
        self.name.print(output)
        output.print(
            '.prototype.__repr__.__sagejs_synthetic_method__ = true')
        output.end_statement()

    if (
        not defined_methods['__str__']
        and (not native_list_parent or defined_methods['__repr__'])
    ):

        def f_str():
            if self.parent:
                output.print('if('), self.parent.print(output), output.spaced(
                    '.prototype.__str__)', 'return', self.parent)
                output.print(
                    '.prototype.__str__.call(this)'), output.end_statement()
            output.spaced('return', 'this.__repr__()')
            output.end_statement()

        define_default_method('__str__', f_str)
        output.indent()
        self.name.print(output)
        output.print(
            '.prototype.__str__.__sagejs_synthetic_method__ = true')
        output.end_statement()

    # Multiple inheritance
    def f_basis():
        if output.options.python_tuples:
            output.print('ρσ_math_tuple(')
        output.print('[')
        for i in range(len(self.bases)):
            self.bases[i].print(output)
            if i < self.bases.length - 1:
                output.comma()
        output.print(']')
        if output.options.python_tuples:
            output.print(')')

    add_hidden_property('__bases__', f_basis)
    add_hidden_class_property('__bases__', f_basis)

    def f_mro():
        output.print('ρσ_compute_mro(')
        self.name.print(output)
        output.comma()
        f_basis()
        output.print(')')

    add_hidden_class_property('__mro__', f_mro)

    if self.bases.length > 1:
        output.indent()
        output.print("ρσ_mixin(")
        self.name.print(output)
        for i in range(1, len(self.bases)):
            output.comma()
            self.bases[i].print(output)
        output.print(')'), output.end_statement()

    # Every Python class has ``__doc__``.  Keep the attribute present with a
    # value of ``None`` even when the class has no docstring; introspection
    # libraries rely on the distinction between a missing attribute and an
    # undocumented class.
    def f_doc():
        if self.docstrings and self.docstrings.length and output.options.keep_docstrings:
            output.print(JSON.stringify(create_doctring(self.docstrings)))
        else:
            output.print('null')

    add_hidden_property('__doc__', f_doc, True)
    add_hidden_class_property('__doc__', f_doc, True)

    # Other statements in the class context
    for stmt in self.statements:
        if not is_node_type(stmt, AST_Method):
            if (
                is_node_type(stmt, AST_Var)
                and all(
                    is_node_type(
                        definition.name, AST_SymbolNonlocal)
                    for definition in stmt.definitions
                )
            ):
                continue
            output.indent()
            previous_class_body = output.in_class_body
            output.in_class_body = True
            try:
                stmt.print(output)
            finally:
                output.in_class_body = previous_class_body
            output.newline()

    # Preserve Python bound-method behavior for lightweight mathematical
    # classes without eagerly allocating and decorating every bound method on
    # every instance.  A method is bound only when it is first retrieved.
    if self.lightweight and self.bound.length:
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
                    bname.startswith('_')
                    and not bname.startswith('__')
                )
            ):
                continue
            seen_lazy_methods[bname] = True
            is_classmethod = has_prop(self.classmethods, bname)
            output.indent()
            output.print('(function(ρσ_unbound_method, ρσ_prototype)')

            def f_lazy_binding():
                output.indent()
                output.print('Object.defineProperty(ρσ_prototype, ')
                output.print(JSON.stringify(bname))
                output.comma()
                output.space()
                output.print('{configurable: true, enumerable: true, ')
                output.print('get: function()')

                def f_lazy_getter():
                    output.indent()
                    output.print(
                        'if (this === ρσ_prototype) '
                        'return ρσ_unbound_method')
                    output.end_statement()
                    output.indent()
                    output.assign('var ρσ_receiver')
                    output.print(
                        'this.constructor'
                        if is_classmethod else 'this')
                    output.end_statement()
                    output.indent()
                    output.assign('var ρσ_bound_method')
                    output.print(
                        'ρσ_unbound_method.bind(ρσ_receiver)')
                    output.end_statement()
                    output.indent()
                    output.print(
                        'Object.assign(ρσ_bound_method, '
                        'ρσ_unbound_method)')
                    output.end_statement()
                    output.indent()
                    output.assign('ρσ_bound_method.__func__')
                    output.print('ρσ_unbound_method')
                    output.end_statement()
                    output.indent()
                    output.assign('ρσ_bound_method.__self__')
                    output.print('ρσ_receiver')
                    output.end_statement()
                    output.indent()
                    output.assign('ρσ_bound_method.__name__')
                    output.print(JSON.stringify(bname))
                    output.end_statement()
                    output.indent()
                    output.print('return ρσ_bound_method')
                    output.end_statement()

                output.with_block(f_lazy_getter)
                output.print(', set: function(ρσ_method_value)')

                def f_lazy_setter():
                    output.indent()
                    output.print('Object.defineProperty(this, ')
                    output.print(JSON.stringify(bname))
                    output.comma()
                    output.space()
                    output.print(
                        '{value: ρσ_method_value, writable: true, '
                        'configurable: true, enumerable: true})')
                    output.end_statement()

                output.with_block(f_lazy_setter)
                output.print('})')
                output.end_statement()

            output.with_block(f_lazy_binding)
            output.print(')(')
            self.name.print(output)
            output.print('.prototype.' + bname)
            output.comma()
            self.name.print(output)
            output.print('.prototype)')
            output.end_statement()

    # A property alias such as ``old_name = new_name`` is represented as a
    # native prototype descriptor.  Reading it from the prototype here would
    # execute its getter with the prototype as ``self``.  It is not also a
    # class variable, and native properties have no Python ``__set_name__``
    # hook to call.
    classvar_names = [
        name for name in Object.keys(self.classvars)
        if not self.dynamic_properties[name]
    ]
    for classvar_name in classvar_names:
        output.indent()
        output.print('if (typeof ')
        self.name.print(output)
        output.print('.prototype.' + classvar_name)
        output.print(' !== "function") ')
        self.name.print(output)
        output.assign('.' + classvar_name)
        self.name.print(output)
        output.print('.prototype.' + classvar_name)
        output.end_statement()
    if classvar_names.length:
        output.indent()
        output.print('ρσ_call_set_names(')
        self.name.print(output)
        output.comma()
        output.print(JSON.stringify(classvar_names))
        output.comma()
        output.print('[')
        for index in range(classvar_names.length):
            if index:
                output.comma()
            self.name.print(output)
            output.print(
                '.prototype.' + classvar_names[index])
        output.print('])')
        output.end_statement()
    inherited_callable_names = Object.keys(self['static']).concat(
        Object.keys(self.classmethods))
    for method_name in inherited_callable_names:
        output.indent()
        self.name.print(output)
        output.assign('.' + method_name)
        self.name.print(output)
        output.print('.prototype.' + method_name)
        output.end_statement()

    if decorators.length:
        output.indent()
        output.assign(self.name)
        for di in range(decorators.length):
            self.name.print(output)
            output.print(f'.ρσ_decorators[{di}](')
        self.name.print(output)
        output.print(')' * decorators.length)
        output.semicolon()
        output.newline()
        output.indent()
        output.spaced('delete ')
        self.name.print(output)
        output.print('.ρσ_decorators')
        output.semicolon()
        output.newline()

    if self.sequence_class:
        output.indent()
        output.assign(self.name)
        output.print('ρσ_callable_sequence_class(')
        self.name.print(output)
        output.print(')')
        output.end_statement()

    if self.callable_instance_class or defined_methods['__call__']:
        output.indent()
        output.assign(self.name)
        output.print('ρσ_callable_instance_class_adapter(')
        self.name.print(output)
        output.print(')')
        output.end_statement()

    # Python deliberately exposes class creation through a mutable builtin.
    # Keep the optimized native lowering for the default hook, but honor a
    # replacement hook when user code installs one through ``builtins``.
    if not compiling_baselib:
        output.indent()
        output.print(
            'if (typeof __build_class__ === "function" && '
            '!__build_class__.__sagejs_default_build_class__)')

        def call_build_class_hook():
            output.indent()
            output.assign(self.name)
            output.print('__build_class__(function(){}, ')
            output.print_string(self.name.name)
            if not self.implicit_object_base:
                for base in self.bases:
                    output.comma()
                    base.print(output)
            output.print(')')
            output.end_statement()

        output.with_block(call_build_class_hook)

    if self.namedtuple_fields.length:
        output.indent()
        output.assign(self.name)
        output.print('ρσ_finalize_namedtuple_class(')
        self.name.print(output)
        output.comma()
        output.print(JSON.stringify(self.namedtuple_fields))
        output.print(')')
        output.end_statement()

    # Definitions should not display their implementation object merely
    # because the class is the final statement entered in the REPL.
    output.indent()
    output.print('undefined')
    output.end_statement()
