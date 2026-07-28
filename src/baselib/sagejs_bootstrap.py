"""Irreducible aliases and ABI glue used while Sage.js bootstraps itself.

This is the sole top-level baselib module which is intentionally not strict
mathematical Python. The aliases break the compiler's bootstrap import cycle;
the adapter below captures JavaScript's dynamic ``this`` value, which Python
has no source-level spelling for.
"""

# globals: AlgebraicExtensionFunctor, Atomics, Date, Element, Factorization
# globals: FiniteFieldElement, Int32Array, Number, Parent, PolynomialRing
# globals: QQ, QuotientFunctor
# globals: Rational, RuntimeError, SharedArrayBuffer, ZZ, ZeroDivisionError

algebraic_extension_functor = AlgebraicExtensionFunctor
element_class = Element
factorization_class = Factorization
finite_field_element_class = FiniteFieldElement
parent_class = Parent
polynomial_ring = PolynomialRing
qq = QQ
quotient_functor = QuotientFunctor
rational_class = Rational
zz = ZZ
zero_division_error = ZeroDivisionError


def ρσ_native_method_adapter(target_function):
    return r"""%js (() => {
        function method(...args) {
            args.unshift(this);
            return Reflect.apply(target_function, undefined, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = target_function.__argnames__.slice(1);
        }
        for (const name of [
            "__defaults__",
            "__handles_kwarg_interpolation__",
            "__kwonly__",
            "__positional_only__",
            "__varargs__",
            "__varkw__",
        ]) {
            method[name] = target_function[name];
        }
        return method;
    })()"""


def ρσ_output_write(text):
    return r"""%js (
        typeof process !== "undefined"
        && process.stdout
        && typeof process.stdout.write === "function"
        ? process.stdout.write(String(text))
        : console.log(String(text))
    )"""


def ρσ_wall_time():
    return r"%js Date.now() / 1000"


def ρσ_blocking_sleep(seconds):
    return r"""%js (() => {
        if (
            typeof SharedArrayBuffer !== "function" ||
            typeof Atomics !== "object" ||
            typeof Atomics.wait !== "function"
        ) {
            throw new RuntimeError(
                "time.sleep() requires Node.js or an isolated Web Worker"
            );
        }
        try {
            Atomics.wait(
                new Int32Array(new SharedArrayBuffer(4)),
                0,
                0,
                Number(seconds) * 1000
            );
        } catch (error) {
            throw new RuntimeError(
                "time.sleep() cannot block this JavaScript execution context"
            );
        }
    })()"""
