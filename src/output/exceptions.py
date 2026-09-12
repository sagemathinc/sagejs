# vim:fileencoding=utf-8
# License: BSD Copyright: 2016, Kovid Goyal <kovid at kovidgoyal.net>
from __python__ import hash_literals

from output.statements import print_bracketed


def print_try(self, output, with_finally=True):
    if self.bfinally and with_finally:
        # A pending exception is handled state while finally executes, including
        # when the exception came from an except/else clause. Keep the token
        # block-scoped: nested tries and suspension must not overwrite it.
        def f_outer():
            output.indent(), output.print("let ρσ_pending_exception")
            output.end_statement()
            output.indent(), output.print("try ")
            output.with_block(lambda: print_try(self, output, False))
            output.print(" catch (ρσ_pending_error) ")

            def f_pending():
                output.indent()
                output.print(
                    "ρσ_pending_exception = ρσ_handled_state.enter("
                    "ρσ_normalize_exception(ρσ_pending_error))"
                )
                output.end_statement()
                output.indent(), output.print("throw ρσ_pending_error")
                output.end_statement()

            output.with_block(f_pending)
            output.print(" finally ")

            def f_finally():
                output.indent(), output.print("try ")
                print_bracketed(self.bfinally, output)
                output.print(" finally ")

                def f_restore():
                    output.indent()
                    output.print(
                        "if (ρσ_pending_exception) "
                        "ρσ_handled_state.leave(ρσ_pending_exception)"
                    )
                    output.end_statement()

                output.with_block(f_restore)

            output.with_block(f_finally)

        output.with_block(f_outer)
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


def print_catch(self, output):
    output.print("catch")
    output.space()
    output.with_parens(lambda: output.print("ρσ_Exception"))
    output.space()

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
                        output.print("ρσ_exception_matches(ρσ_Exception,")
                        err.print(output)
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
                output.indent()
                output.print("throw")
                output.space()
                output.print("ρσ_Exception")
                output.semicolon()
                output.newline()

            output.with_block(f_throw)
        output.newline()

    def f_exception():
        output.indent()
        output.print("ρσ_Exception = ρσ_normalize_exception(ρσ_Exception)")
        output.end_statement()
        output.indent()
        output.print("ρσ_last_exception = ρσ_Exception")
        output.end_statement()
        output.indent()
        output.print(
            "const ρσ_handled_exception = ρσ_handled_state.enter(ρσ_Exception)"
        )
        output.end_statement()
        output.indent(), output.print("try ")
        output.with_block(f_dispatch)
        output.print(" finally ")

        def f_restore():
            output.indent()
            output.print("ρσ_handled_state.leave(ρσ_handled_exception)")
            output.end_statement()

        output.with_block(f_restore)

    output.with_block(f_exception)


def print_else(self, else_var_name, output):
    output.indent(), output.spaced("if", "(" + else_var_name + ")")
    output.space()
    print_bracketed(self, output)
