# vim:fileencoding=utf-8
# License: BSD Copyright: 2016, Kovid Goyal <kovid at kovidgoyal.net>
from __python__ import hash_literals

from ast_types import (AST_Call, AST_Class, AST_ClassCall, AST_Dot, AST_Lambda,
                       AST_Method, AST_New, AST_PropAccess, AST_Scope,
                       AST_Seq, AST_SymbolRef, AST_Toplevel, has_calls,
                       is_node_type)
from output.stream import OutputStream
from output.statements import print_bracketed
from output.utils import create_doctring
from output.operators import print_getattr

anonfunc = 'ρσ_anonfunc'
module_name = 'null'


def set_module_name(x):
    global module_name
    module_name = '"' + x + '"' if x else 'null'


def decorate(decorators, output, func):
    pos = 0

    def wrap():
        nonlocal pos
        if pos < decorators.length:
            decorators[pos].expression.print(output)
            pos += 1
            output.with_parens(wrap)
        else:
            func()

    wrap()


def function_args(argnames, output, strip_first):
    def f():
        if argnames and argnames.length and (
                argnames.is_simple_func is True
                or argnames.is_simple_func is undefined):
            for i, arg in enumerate(
                (argnames.slice(1) if strip_first else argnames)):
                if i:
                    output.comma()
                arg.print(output)

    output.with_parens(f)
    output.space()


def function_preamble(node, output, offset, javascript_name):
    a = node.argnames
    if not a:
        return
    fname = (
        javascript_name
        or (node.name.name if node.name else anonfunc)
    )
    fname = output.make_name(fname)

    # Methods omit their first Python argument from the JavaScript formal
    # parameter list and receive it as ``this``.  A descriptor or decorator
    # may retain the underlying function and invoke it with an explicit
    # ``self``/``cls`` argument, just as Python's unbound functions do.  Shift
    # that argument into ``this`` before validating the remaining arguments.
    # This also makes ``C.method(instance, ...)`` behave like CPython.
    if offset and output.options.python_attributes:
        output.indent()
        output.print('if ((this === globalThis || this == null) ')
        output.print('&& arguments.length > 0) return arguments.callee.apply(')
        output.print('arguments[0], Array.prototype.slice.call(arguments, 1))')
        output.end_statement()

    def validate_arguments():
        if not output.options.python_attributes:
            return
        if a.starargs is undefined:
            output.indent()
            output.print('if (arguments.length > ' + str(
                a.length - offset))
            output.print(' && !(arguments[arguments.length - 1] ')
            output.print('&& arguments[arguments.length - 1]')
            output.print('[ρσ_kwargs_symbol] === true)) ')
            output.print(
                'throw ρσ_function_argument_error('
                '"too many positional arguments", ' + fname + ')')
            output.end_statement()
        for index, argument in enumerate(a):
            if index < offset:
                continue
            if not Object.prototype.hasOwnProperty.call(
                a.defaults, argument.name
            ):
                output.indent()
                output.print('if (typeof ')
                argument.print(output)
                output.print(' === "undefined") ')
                output.print(
                    'throw ρσ_function_argument_error('
                    '"missing required argument: '
                    + argument.name + '", ' + fname + ')')
                output.end_statement()
        for argument in a.kwonly:
            if not Object.prototype.hasOwnProperty.call(
                a.defaults, argument.name
            ):
                output.indent()
                output.print('if (typeof ')
                argument.print(output)
                output.print(' === "undefined") ')
                output.print(
                    'throw ρσ_function_argument_error('
                    '"missing required keyword-only '
                    + 'argument: ' + argument.name + '", ' + fname + ')')
                output.end_statement()

    if a.is_simple_func:
        validate_arguments()
        return
    # If this function has optional parameters/*args/**kwargs declare it differently
    kw = 'arguments[arguments.length-1]'
    # Define all formal parameters
    for c, arg in enumerate(a):
        i = c - offset
        if i >= 0:
            output.indent()
            output.print("var")
            output.space()
            output.assign(arg)
            if Object.prototype.hasOwnProperty.call(a.defaults, arg.name):
                output.spaced('(arguments[' + i + ']', '===', 'undefined',
                              '||', '(', i, '===', 'arguments.length-1', '&&',
                              kw, '!==', 'null', '&&', 'typeof', kw, '===',
                              '"object"', '&&', kw, '[ρσ_kwargs_symbol]',
                              '===', 'true))', '?', '')
                output.print(
                    fname + '.__defaults__[' + JSON.stringify(arg.name) + ']')
                output.space(), output.print(':'), output.space()
            else:
                output.spaced('(', i, '===', 'arguments.length-1', '&&', kw,
                              '!==', 'null', '&&', 'typeof', kw, '===',
                              '"object"', '&&', kw, '[ρσ_kwargs_symbol]',
                              '===', 'true)', '?', 'undefined', ':', '')
            output.print('arguments[' + i + ']')
            output.end_statement()
    if a.kwargs or a.has_defaults or a.kwonly.length:
        # Look for an options object
        kw = 'ρσ_kwargs_obj'
        if a.kwargs:
            kw = output.make_name(a.kwargs.name)
        output.indent()
        output.spaced('var', kw, '=', 'arguments[arguments.length-1]')
        output.end_statement()
        # Ensure kwargs is the options object
        output.indent()
        output.spaced('if', '(' + kw, '===', 'null', '||', 'typeof', kw, '!==',
                      '"object"', '||', kw, '[ρσ_kwargs_symbol]', '!==',
                      'true)', kw, '=', '{}')
        output.end_statement()
        # Read values from the kwargs object for any formal parameters
        if a.has_defaults:
            for dname in Object.keys(a.defaults):
                is_keyword_only = False
                for keyword_argument in a.kwonly:
                    if keyword_argument.name is dname:
                        is_keyword_only = True
                        break
                if is_keyword_only:
                    continue
                output.indent()
                output.spaced(
                    'if', '(Object.prototype.hasOwnProperty.call(' + kw + ',',
                    '"' + dname + '"))')

                def f():
                    output.indent()
                    output.spaced(
                        output.make_name(dname), '=',
                        kw + '[' + JSON.stringify(dname) + ']')
                    output.end_statement()
                    if a.kwargs:
                        output.indent()
                        output.spaced(
                            'delete', kw + '[' + JSON.stringify(dname) + ']')
                        output.end_statement()

                output.with_block(f)
                output.newline()

        for argument in a.kwonly:
            output.indent()
            output.print('var ')
            output.assign(argument)
            if Object.prototype.hasOwnProperty.call(
                a.defaults, argument.name
            ):
                output.print(
                    fname + '.__defaults__['
                    + JSON.stringify(argument.name) + ']')
            else:
                output.print('undefined')
            output.end_statement()
            output.indent()
            output.print(
                'if (Object.prototype.hasOwnProperty.call('
                + kw + ', ' + JSON.stringify(argument.name) + '))')

            def assign_keyword_only():
                output.indent()
                output.assign(argument)
                output.print(kw + '[' + JSON.stringify(
                    argument.name) + ']')
                output.end_statement()
                if a.kwargs:
                    output.indent()
                    output.print(
                        'delete ' + kw + '['
                        + JSON.stringify(argument.name) + ']')
                    output.end_statement()

            output.with_block(assign_keyword_only)
            output.newline()

    if a.starargs is not undefined:
        # Define the *args parameter, putting in whatever is left after assigning the formal parameters and the options object
        nargs = a.length - offset
        output.indent()
        starargs_name = output.make_name(a.starargs.name)
        output.spaced('var', starargs_name, '=',
                      'Array.prototype.slice.call(arguments,', nargs + ')')
        output.end_statement()
        # Remove the options object, if present
        output.indent()
        output.spaced('if', '(' + kw, '!==', 'null', '&&', 'typeof', kw, '===',
                      '"object"', '&&', kw, '[ρσ_kwargs_symbol]', '===',
                      'true)', starargs_name)
        output.print('.pop()')
        output.end_statement()
        if output.options.python_tuples:
            output.indent()
            output.assign(starargs_name)
            output.print('ρσ_math_tuple(' + starargs_name + ')')
            output.end_statement()

    if a.kwargs is not undefined and output.options.python_attributes:
        output.indent()
        kwargs_name = output.make_name(a.kwargs.name)
        output.assign(kwargs_name)
        output.print('ρσ_dict(' + kwargs_name + ')')
        output.end_statement()

    validate_arguments()


def has_annotations(self):
    if self.return_annotation:
        return True
    for arg in self.argnames:
        if arg.annotation:
            return True
    for arg in self.argnames.kwonly:
        if arg.annotation:
            return True
    if (
        self.argnames.starargs is not undefined
        and self.argnames.starargs.annotation
    ):
        return True
    if (
        self.argnames.kwargs is not undefined
        and self.argnames.kwargs.annotation
    ):
        return True
    return False


def print_annotation_text(self, output, strip_first):
    output.print('{')
    wrote = False

    def write_argument(arg):
        nonlocal wrote
        if arg.annotation:
            if wrote:
                output.comma()
            output.print(JSON.stringify(arg.name))
            output.print(':')
            output.space()
            output.print(JSON.stringify(
                arg.annotation_text or arg.name))
            wrote = True

    for index, arg in enumerate(self.argnames):
        if not (strip_first and index is 0):
            write_argument(arg)
    if self.argnames.starargs is not undefined:
        write_argument(self.argnames.starargs)
    for arg in self.argnames.kwonly:
        write_argument(arg)
    if self.argnames.kwargs is not undefined:
        write_argument(self.argnames.kwargs)
    if self.return_annotation:
        if wrote:
            output.comma()
        output.print('"return":')
        output.space()
        output.print(JSON.stringify(
            self.return_annotation_text or 'Any'))
    output.print('}')


def function_annotation(self, output, strip_first, name):
    fname = name or (self.name.name if self.name else anonfunc)
    props = Object.create(None)

    # Preserve the Python-facing name independently of JavaScript's inferred
    # Function.name.  Decorators and method adapters may replace the underlying
    # function, while introspection should continue to see the source name.
    def python_name():
        output.print(JSON.stringify(
            self.name.name if self.name else '<lambda>'))

    props.__name__ = python_name
    props.__qualname__ = python_name

    compiling_baselib = (
        output.options.omit_baselib
        and not output.options.private_scope
        and not output.options.write_name
    )
    if not compiling_baselib and not strip_first:

        def python_descriptor():
            output.print('true')

        props.__python_descriptor__ = python_descriptor

    # Keep the exact source spelling independently of runtime evaluation.
    # This powers help(), DocSpec, and the static reference manual even when
    # the ``typing`` names exist only for static checking.
    if has_annotations(self):

        def annotation_text():
            print_annotation_text(self, output, strip_first)

        props.__annotations_text__ = annotation_text

    # ``from __future__ import annotations`` stores strings, matching Python.
    # The explicit Sage.js compiler flag retains the historical evaluated
    # annotation mode used by compiler conformance tests.
    if self.annotations and has_annotations(self):

        def annotations():
            if not compiling_baselib:
                output.print('ρσ_dict(')
            if self.annotations is 'future':
                print_annotation_text(self, output, strip_first)
                if not compiling_baselib:
                    output.print(')')
                return
            output.print('{')
            wrote = False

            def write_evaluated(arg):
                nonlocal wrote
                if arg.annotation:
                    if wrote:
                        output.comma()
                    output.print(JSON.stringify(arg.name))
                    output.print(':'), output.space()
                    arg.annotation.print(output)
                    wrote = True

            for index, arg in enumerate(self.argnames):
                if not (strip_first and index is 0):
                    write_evaluated(arg)
            if self.argnames.starargs is not undefined:
                write_evaluated(self.argnames.starargs)
            for arg in self.argnames.kwonly:
                write_evaluated(arg)
            if self.argnames.kwargs is not undefined:
                write_evaluated(self.argnames.kwargs)
            if self.return_annotation:
                if wrote:
                    output.comma()
                output.print('return:'), output.space()
                self.return_annotation.print(output)
            output.print('}')
            if not compiling_baselib:
                output.print(')')

        props.__annotations__ = annotations
    else:
        # CPython exposes an annotations dictionary on every Python function,
        # even when it is empty.  functools.wraps and many package-level
        # decorators copy it unconditionally.
        props.__annotations__ = lambda: output.print(
            '{}' if compiling_baselib else 'ρσ_dict()')

    # Create __defaults__
    defaults = self.argnames.defaults
    dkeys = Object.keys(self.argnames.defaults)
    if dkeys.length:

        def __defaults__():
            output.print('{')
            for i, k in enumerate(dkeys):
                output.print(k + ':')
                default_value = defaults[k]
                if is_node_type(default_value, AST_Seq):
                    if output.options.python_tuples:
                        output.print('ρσ_math_tuple([')
                    else:
                        output.print('[')
                    default_value.print(output)
                    if output.options.python_tuples:
                        output.print('])')
                    else:
                        output.print(']')
                else:
                    default_value.print(output)
                if i is not dkeys.length - 1:
                    output.comma()
            output.print('}')

        props.__defaults__ = __defaults__

    kwdefault_names = []
    for argument in self.argnames.kwonly:
        if Object.prototype.hasOwnProperty.call(
            self.argnames.defaults, argument.name
        ):
            kwdefault_names.push(argument.name)

    def __kwdefaults__():
        if not kwdefault_names.length:
            output.print('null')
            return
        output.print('{')
        for index, name in enumerate(kwdefault_names):
            if index:
                output.comma()
            output.print_string(name)
            output.colon()
            self.argnames.defaults[name].print(output)
        output.print('}')

    props.__kwdefaults__ = __kwdefaults__

    # Create __handles_kwarg_interpolation__
    if not self.argnames.is_simple_func:

        def handle():
            output.print('true')

        props.__handles_kwarg_interpolation__ = handle

    # Every Python function has a positional-parameter tuple, including an
    # empty one.  Introspection must be able to distinguish ``*args``-only
    # functions from host JavaScript callables with no Python metadata.
    def argnames():
        output.print('[')
        emitted = False
        for i, arg in enumerate(self.argnames):
            if strip_first and i is 0:
                continue
            if emitted:
                output.comma()
            output.print(JSON.stringify(arg.name))
            emitted = True
        output.print(']')

    props.__argnames__ = argnames

    if self.argnames.starargs is not undefined:

        def varargs():
            output.print(JSON.stringify(self.argnames.starargs.name))

        props.__varargs__ = varargs

    if self.argnames.kwargs is not undefined:

        def varkw():
            output.print(JSON.stringify(self.argnames.kwargs.name))

        props.__varkw__ = varkw

    if self.argnames.kwonly.length:

        def kwonly():
            output.print('[')
            for index, argument in enumerate(self.argnames.kwonly):
                if index:
                    output.comma()
                output.print(JSON.stringify(argument.name))
            output.print(']')

        props.__kwonly__ = kwonly

    # Create __doc__
    if output.options.keep_docstrings and self.docstrings and self.docstrings.length:

        def doc():
            output.print(JSON.stringify(create_doctring(self.docstrings)))

        props.__doc__ = doc
    else:
        # Stripping documentation is a size optimization, not a semantic
        # license to remove the Python function attribute.  Libraries such as
        # pyparsing copy ``__doc__`` from callbacks and correctly expect
        # undocumented functions to expose ``None``.
        props.__doc__ = lambda: output.print('null')

    def module():
        output.print(module_name)

    props.__module__ = module

    for name in props:
        output.print(f"{fname}.{name} = ")
        props[name]()  # calling this prints it out
        output.end_statement()

    if not compiling_baselib and module_name != 'null':
        output.print('Object.defineProperty(' + fname)
        output.comma()
        output.print('"__globals__"')
        output.comma()
        output.print('{value:ρσ_live_scope_dict(ρσ_modules[')
        output.print(module_name)
        output.print(']),writable:false})')
        output.end_statement()
        output.assign(fname + '.__code__')
        output.print('ρσ_function_code(' + fname + ')')
        output.end_statement()
        output.assign(fname + '.__python_type__')
        output.print('ρσ_function_type')
        output.end_statement()

    output.print(
        "undefined"
    )  # so defining function in repl doesn't print out last assignment above.
    output.end_statement()


def function_definition(
    self,
    output,
    strip_first,
    as_expression,
    javascript_name,
):
    as_expression = as_expression or self.is_expression or self.is_anonymous
    if as_expression:
        orig_indent = output.indentation()
        output.set_indentation(output.next_indent())
        output.spaced('(function()', '{'), output.newline()
        output.indent(), output.spaced('var', anonfunc, '='), output.space()
    output.print("function"), output.space()
    if self.name:
        if javascript_name:
            output.print_name(javascript_name)
        else:
            self.name.print(output)

    def output_function_preamble(node, output, offset):
        function_preamble(
            node,
            output,
            offset,
            javascript_name,
        )

    if self.is_generator:
        output.print('()'), output.space()

        def output_generator():
            output.indent()
            output.print('function* js_generator')
            function_args(self.argnames, output, strip_first)
            print_bracketed(
                self,
                output,
                True,
                output_function_preamble,
            )

            output.newline()
            output.indent()
            output.spaced('var', 'result', '=', 'js_generator.apply(this,',
                          'arguments)')
            output.end_statement()
            # Python's generator objects use a separate method to send data to the generator
            output.indent()
            output.spaced(
                'result.send', '=',
                'ρσ_generator_send.bind(null, result)')
            output.end_statement()
            output.indent()
            output.assign('result.__started__')
            output.print('false')
            output.end_statement()
            output.indent()
            output.assign('result.__native_throw__')
            output.print('result.throw.bind(result)')
            output.end_statement()
            output.indent()
            output.spaced(
                'result.throw', '=',
                'ρσ_generator_throw.bind(null, result)')
            output.end_statement()
            output.indent()
            output.spaced(
                'result.close', '=',
                'ρσ_generator_close.bind(null, result)')
            output.end_statement()
            generator_name = (
                self.name.name if self.name else '<lambda>')
            output.indent()
            output.assign('result.__name__')
            output.print(JSON.stringify(generator_name))
            output.end_statement()
            output.indent()
            output.assign('result.__qualname__')
            output.print(JSON.stringify(generator_name))
            output.end_statement()
            output.indent()
            output.spaced('return', 'result')
            output.end_statement()

        output.with_block(output_generator)
    else:
        function_args(self.argnames, output, strip_first)
        def python_implicit_return(output):
            if output.options.python_truthiness:
                output.indent()
                output.spaced('return', 'null')
                output.end_statement()

        print_bracketed(
            self,
            output,
            True,
            output_function_preamble,
            None,
            python_implicit_return,
        )

    if as_expression:
        output.end_statement()
        function_annotation(self, output, strip_first, anonfunc)
        output.indent(), output.spaced('return',
                                       anonfunc), output.end_statement()
        output.set_indentation(orig_indent)
        output.indent(), output.print("})()")


def print_function(output):
    self = this

    if self.decorators and self.decorators.length:
        output.print("var")
        output.space()
        output.assign(self.name.name)

        def output_function_definition():
            function_definition(self, output, False, True)

        decorate(self.decorators, output, output_function_definition)
        output.end_statement()
    else:
        if (
            self.sequential_definition
            and not self.is_expression
            and not self.is_anonymous
        ):
            output.print("var")
            output.space()
            output.assign(self.name.name)
        function_definition(self, output, False)
        if not self.is_expression and not self.is_anonymous:
            output.end_statement()
            function_annotation(self, output, False)


def find_this(expression):
    if is_node_type(expression, AST_Dot):
        return expression.expression
    if not is_node_type(expression, AST_SymbolRef):
        return expression


def print_this(expression, output):
    obj = find_this(expression)
    if obj:
        obj.print(output)
    else:
        output.print('this')


def print_function_call(self, output):
    def scope_for_namespace(want_globals):
        stack = output.stack()
        for index in range(stack.length - 1, -1, -1):
            candidate = stack[index]
            if (
                want_globals and is_node_type(
                    candidate, AST_Toplevel)
                or not want_globals and is_node_type(
                    candidate, AST_Scope)
            ):
                return candidate

    def print_namespace(scope, live_globals):
        if (
            live_globals
            or is_node_type(scope, AST_Toplevel)
        ):
            output.print('ρσ_live_scope_dict(ρσ_modules[')
            output.print(JSON.stringify(scope.module_id))
            output.print('])')
            return

        names = []
        seen = {}

        def add_name(name):
            if name and not seen[name]:
                seen[name] = True
                names.push(name)

        if is_node_type(scope, AST_Class):
            for name in Object.keys(scope.classvars):
                add_name(name)
            for statement in scope.body:
                if is_node_type(statement, AST_Method):
                    add_name(statement.name.name)
        elif scope:
            for symbol in scope.localvars:
                add_name(symbol.name)
            if is_node_type(scope, AST_Lambda):
                for argument in scope.argnames:
                    add_name(argument.name)

        output.print('ρσ_scope_dict({')
        for index, name in enumerate(names):
            if index:
                output.comma()
            output.print(JSON.stringify(name))
            output.colon()
            if is_node_type(scope, AST_Class):
                scope.name.print(output)
                output.print(
                    '.prototype[' + JSON.stringify(name) + ']')
            else:
                output.print_name(name)
        output.print('})')

    if (
        is_node_type(self.expression, AST_SymbolRef)
        and self.expression.name in ('eval', 'exec')
        and self.args.length >= 1
        and self.args.length <= 3
        and not self.args.starargs
        and not self.args.kwargs.length
        and not self.args.kwarg_items.length
    ):
        output.print(
            'ρσ_eval'
            if self.expression.name is 'eval'
            else 'ρσ_exec'
        )

        def dynamic_args():
            for index, argument in enumerate(self.args):
                if index:
                    output.comma()
                argument.print(output)
            for _index in range(self.args.length, 3):
                output.comma()
                output.print('undefined')
            output.comma()
            print_namespace(
                scope_for_namespace(True), True)
            output.comma()
            print_namespace(
                scope_for_namespace(False), False)

        output.with_parens(dynamic_args)
        return

    if (
        is_node_type(self.expression, AST_SymbolRef)
        and self.expression.name in ('dir', 'locals', 'globals', 'vars')
        and (
            self.expression.name is not 'dir'
            or output.options.python_attributes
        )
        and self.args.length == 0
        and not self.args.starargs
        and not self.args.kwargs.length
        and not self.args.kwarg_items.length
    ):
        want_globals = self.expression.name is 'globals'
        want_dir = self.expression.name is 'dir'
        scope = None
        stack = output.stack()
        for index in range(stack.length - 1, -1, -1):
            candidate = stack[index]
            if (
                want_globals and is_node_type(candidate, AST_Toplevel)
                or not want_globals and is_node_type(candidate, AST_Scope)
            ):
                scope = candidate
                break
        names = []
        seen = {}

        def add_name(name):
            if name and not seen[name]:
                seen[name] = True
                names.push(name)

        if is_node_type(scope, AST_Class):
            for name in Object.keys(scope.classvars):
                add_name(name)
            for statement in scope.body:
                if is_node_type(statement, AST_Method):
                    add_name(statement.name.name)
        elif scope:
            for symbol in scope.localvars:
                add_name(symbol.name)
            if want_globals or (
                want_dir and is_node_type(scope, AST_Toplevel)
            ):
                for name in scope.nonlocalvars or []:
                    add_name(name.name if name.name else name)
                for symbol in scope.exports or []:
                    add_name(symbol.name)
            if is_node_type(scope, AST_Lambda):
                for argument in scope.argnames:
                    add_name(argument.name)
        if want_globals or (
            want_dir and is_node_type(scope, AST_Toplevel)
        ):
            add_name('__name__')
            add_name('__file__')
        if want_dir:
            # Sage.js exposes its interactive helpers as global names.
            add_name('help')

        if want_dir:
            output.print('ρσ_list_decorate([')
            for index, name in enumerate(names):
                if index:
                    output.comma()
                output.print(JSON.stringify(name))
            output.print('])')
            return

        if want_globals:
            output.print('ρσ_live_scope_dict(ρσ_modules[')
            output.print(JSON.stringify(scope.module_id))
            output.print('])')
            return

        output.print('ρσ_scope_dict({')
        for index, name in enumerate(names):
            if index:
                output.comma()
            output.print(JSON.stringify(name))
            output.colon()
            if is_node_type(scope, AST_Class):
                scope.name.print(output)
                output.print('.prototype[' + JSON.stringify(name) + ']')
            else:
                output.print_name(name)
        output.print('})')
        return

    if self.pooled_numeric_name:
        output.print(self.pooled_numeric_name)
        return

    is_prototype_call = False

    def print_function_name(no_call):
        nonlocal is_prototype_call
        if is_node_type(self, AST_ClassCall):
            # class methods are called through the prototype unless static
            if self['static']:
                self['class'].print(output)
                if self.classvar:
                    output.print(".prototype")
                output.print(".")
                output.print(self.method)
            else:
                is_prototype_call = True
                self['class'].print(output)
                output.print(".prototype.")
                output.print(self.method)
                if not no_call:
                    output.print(".call")
        else:
            if not is_repeatable:
                if is_node_type(self.expression, AST_Dot):
                    output.print('ρσ_expr_temp')
                    print_getattr(self.expression, output, True)
                elif no_call and not self.direct_call:
                    output.print(
                        '(ρσ_expr_temp?.__call__?.bind('
                        'ρσ_expr_temp) ?? ρσ_expr_temp)'
                    )
                else:
                    output.print('ρσ_expr_temp')
            elif (not is_new and not self.direct_call
                  and is_node_type(self.expression, AST_SymbolRef)):
                # Easy special case where we can make the __call__
                # operator work.  We are not doing the general case yet,
                # which is difficult because of this binding.
                # (f?.__call__?.bind(f) ?? f)
                # We will likely instead do the general case by making
                # classes ES6 classes that are just plain callable.
                output.print('(')
                self.expression.print(output)
                output.print("?.__call__?.bind(")
                self.expression.print(output)
                output.print(') ?? ')
                self.expression.print(output)
                output.print(')')
            else:
                parenthesize_constructor = (
                    is_new
                    and not is_node_type(
                        self.expression, AST_SymbolRef)
                    and not is_node_type(
                        self.expression, AST_Dot)
                )
                if parenthesize_constructor:
                    output.print('(')
                resolve_callable = (
                    not is_new
                    and not self.direct_call
                    and is_node_type(self.expression, AST_Call)
                )
                if resolve_callable:
                    output.print('ρσ_resolve_callable(')
                self.expression.print(output)
                if resolve_callable:
                    output.print(')')
                if parenthesize_constructor:
                    output.print(')')

    def print_kwargs():
        output.print(
            'ρσ_desugar_kwargs(['
            if output.options.python_attributes
            else 'ρσ_desugar_kwargs_legacy(['
        )
        if has_kwarg_items:
            for i, kwname in enumerate(self.args.kwarg_items):
                if i > 0:
                    output.print(',')
                    output.space()
                kwname.print(output)
            if has_kwarg_formals:
                output.print(',')
                output.space()

        if has_kwarg_formals:
            output.print('{')
            for i, pair in enumerate(self.args.kwargs):
                if i: output.comma()
                # Keyword names are Python strings, not JavaScript
                # identifiers.  In particular, ``default=...`` must remain
                # the key ``default`` even though a local variable with that
                # spelling has to be escaped for JavaScript.
                output.print_string(pair[0].name)
                output.print(':')
                output.space()
                pair[1].print(output)
            output.print('}')
        output.print('])')

    def print_new(apply):
        output.print(
            'ρσ_interpolate_kwargs_constructor('
            if output.options.python_attributes
            else 'ρσ_interpolate_kwargs_constructor_legacy('
        )
        output.print('Object.create('), self.expression.print(
            output), output.print('.prototype)')
        output.comma()
        output.print('true' if apply else 'false')
        output.comma()

    def do_print_this():
        if not is_repeatable:
            output.print('ρσ_expr_temp')
        else:
            print_this(self.expression, output)
        output.comma()

    def print_positional_args():
        # basic arguments
        i = 0
        while i < self.args.length:
            expr = self.args[i]
            is_first = i is 0
            if not is_first:
                output.print('.concat(')
            if expr.is_array:
                if output.options.python_attributes:
                    output.print('Array.from(ρσ_Iterable(')
                    expr.print(output)
                    output.print('))')
                else:
                    expr.print(output)
                i += 1
            else:
                output.print('[')
                while i < self.args.length and not self.args[i].is_array:
                    self.args[i].print(output)
                    if i + 1 < self.args.length and not self.args[i +
                                                                  1].is_array:
                        output.print(',')
                        output.space()
                    i += 1
                output.print(']')
            if not is_first:
                output.print(')')

    has_kwarg_items = self.args.kwarg_items and self.args.kwarg_items.length
    has_kwarg_formals = self.args.kwargs and self.args.kwargs.length
    has_kwargs = has_kwarg_items or has_kwarg_formals
    is_new = (
        is_node_type(self, AST_New)
        and not self.python_class
    )
    is_repeatable = True

    if is_new and not self.args.length and not has_kwargs and not self.args.starargs:
        output.print('new'), output.space()
        print_function_name()
        return  # new A is the same as new A() in javascript

    if not has_kwargs and not self.args.starargs:
        # A simple function call, do nothing special
        def print_args():
            for i, a in enumerate(self.args):
                if i:
                    output.comma()
                a.print(output)

        if is_new:
            output.print('new'), output.space()
        print_function_name()
        output.with_parens(print_args)
        return

    is_repeatable = is_new or not has_calls(self.expression)
    if not is_repeatable:
        output.assign('(ρσ_expr_temp'), print_this(self.expression,
                                                   output), output.comma()

    if has_kwargs:
        if is_new:
            print_new(False)
        else:
            output.print(
                'ρσ_interpolate_kwargs('
                if output.options.python_attributes
                else 'ρσ_interpolate_kwargs_legacy('
            )
            do_print_this()
        print_function_name(True)
        output.comma()
    else:
        if is_new:
            print_new(True)
            print_function_name(True)
            output.comma()
        else:
            print_function_name(True)
            output.print('.apply(')
            do_print_this()

    if is_prototype_call and self.args.length > 1:
        self.args.shift()

    print_positional_args()

    if has_kwargs:
        if self.args.length:
            output.print('.concat(')
        output.print('[')
        print_kwargs()
        output.print(']')
        if self.args.length:
            output.print(')')

    output.print(')')
    if not is_repeatable:
        output.print(')')
