# vim:fileencoding=utf-8
# License: BSD Copyright: 2016, Kovid Goyal <kovid at kovidgoyal.net>
from __python__ import hash_literals

from output.statements import print_bracketed, print_traceback_record


def print_try(self, output, with_finally=True):
    if self.bfinally and with_finally:
        # Cleanup handles an exception escaping try/except/else, not merely
        # one escaping the original try suite. Keep each pending value local.
        def outer():
            output.indent(), output.print("let ρσ_pending_exception")
            output.end_statement()
            output.indent(), output.print("try ")
            output.with_block(lambda: print_try(self, output, False))
            output.print(" catch (ρσ_pending_error) ")

            def pending():
                output.indent()
                output.print(
                    "ρσ_pending_exception = ρσ_normalize_exception(ρσ_pending_error)"
                )
                output.end_statement()
                print_traceback_record(output, "ρσ_pending_exception")
                output.indent(), output.print("throw ρσ_pending_exception")
                output.end_statement()

            output.with_block(pending)
            output.print(" finally ")

            def cleanup():
                logical = (
                    output.options.python_traceback_records
                    and output.traceback_function
                )
                if logical:
                    output.indent()
                    output.print(
                        "const ρσ_finally_reraised = ρσ_trace_reraised, ρσ_finally_captured = ρσ_trace_captured; ρσ_trace_reraised = ρσ_trace_captured = undefined"
                    )
                    output.end_statement()
                print_handled_body(
                    output,
                    "ρσ_pending_exception",
                    lambda: print_bracketed(self.bfinally, output),
                    True,
                )
                if logical:
                    output.indent()
                    output.print(
                        "if (ρσ_pending_exception) { ρσ_trace_reraised = ρσ_finally_reraised; ρσ_trace_captured = ρσ_finally_captured; }"
                    )
                    output.end_statement()

            output.with_block(cleanup)

        output.with_block(outer)
        return
    else_var_name = None

    def update_output_var(output):
        (
            output.indent(),
            output.assign(else_var_name),
            output.print("true"),
            output.end_statement(),
        )

    if self.belse:
        else_var_name = output.new_try_else_counter()
        (
            output.assign("var " + else_var_name),
            output.print("false"),
            output.end_statement(),
            output.indent(),
        )
    if self.bcatch:
        output.print("try")
        output.space()
    print_bracketed(
        self, output, False, None, None, update_output_var if else_var_name else None
    )
    if self.bcatch:
        output.space()
        print_catch(self.bcatch, output)
    if self.belse:
        output.newline()
        print_else(self.belse, else_var_name, output)


def print_handled_body(output, name, body, conditional=False):
    output.indent()
    output.print("let ρσ_previous_exception = ρσ_last_exception")
    output.end_statement()
    output.indent()
    output.print("const ρσ_handled_exception = ")
    if conditional:
        output.print(name + " ? ")
    output.print("ρσ_handled_state.enter(" + name + ")")
    if conditional:
        output.print(" : null")
    output.end_statement()
    output.indent()
    output.print("if (ρσ_handled_exception) ρσ_last_exception = " + name)
    output.end_statement()
    output.indent(), output.print("try ")
    output.with_block(body)
    output.print(" finally ")

    def restore():
        output.indent()
        output.print("ρσ_last_exception = ρσ_previous_exception")
        output.end_statement()
        output.indent()
        output.print(
            "if (ρσ_handled_exception) ρσ_handled_state.leave(ρσ_handled_exception)"
        )
        output.end_statement()

    output.with_block(restore)


def print_catch(self, output):
    output.print("catch")
    output.space()
    output.with_parens(lambda: output.print("ρσ_Exception"))
    output.space()

    def f_exception():
        output.indent()
        output.assign("ρσ_Exception")
        output.print("ρσ_normalize_exception(ρσ_Exception)")
        output.end_statement()
        print_traceback_record(output, "ρσ_Exception")
        if output.options.python_traceback_records and output.traceback_function:
            output.indent()
            output.print(
                "const ρσ_caught_reraised = ρσ_trace_reraised, ρσ_caught_captured = ρσ_trace_captured; ρσ_trace_reraised = ρσ_trace_captured = undefined"
            )
            output.end_statement()
        print_handled_body(output, "ρσ_Exception", f_dispatch)

    def f_dispatch():
        output.indent()
        no_default = True
        for i, exception in enumerate(self.body):
            if i:
                output.print("else ")

            if exception.errors.length:
                output.print("if")
                output.space()

                def f_errors():
                    for i, err in enumerate(exception.errors):
                        if i:
                            output.newline()
                            output.indent()
                            output.print("||")
                            output.space()

                        # Resolve the actual expression at runtime. A local
                        # binding named `Exception` must not retain the broad
                        # host-error behavior of Python's builtin Exception.
                        if (
                            output.options.python_traceback_records
                            and output.traceback_function
                        ):
                            output.print(
                                "(ρσ_trace_line = " + str(err.start.line) + ", "
                            )
                        output.print("ρσ_exception_matches(ρσ_Exception,")
                        err.print(output)
                        output.print(")")
                        if (
                            output.options.python_traceback_records
                            and output.traceback_function
                        ):
                            output.print(")")

                output.with_parens(f_errors)
                output.space()
            else:
                no_default = False
            print_bracketed(exception, output, True)
            output.space()
        if no_default:
            output.print("else")
            output.space()

            def f_throw():
                if (
                    output.options.python_traceback_records
                    and output.traceback_function
                ):
                    output.indent()
                    output.print(
                        "ρσ_trace_reraised = ρσ_caught_reraised; ρσ_trace_captured = ρσ_caught_captured"
                    )
                    output.end_statement()
                output.indent()
                output.print("throw")
                output.space()
                output.print("ρσ_Exception")
                output.semicolon()
                output.newline()

            output.with_block(f_throw)
        output.newline()

    output.with_block(f_exception)


def print_else(self, else_var_name, output):
    output.indent(), output.spaced("if", "(" + else_var_name + ")")
    output.space()
    print_bracketed(self, output)
