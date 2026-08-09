"""Irreducible aliases and ABI glue used while Sage.js bootstraps itself.

This is the sole top-level baselib module which is intentionally not strict
mathematical Python. The aliases break the compiler's bootstrap import cycle;
the adapter below captures JavaScript's dynamic ``this`` value, which Python
has no source-level spelling for.
"""

# globals: AlgebraicExtensionFunctor, Atomics, Date, Element, Factorization
# globals: FiniteFieldElement, Int32Array, Number, Parent, PolynomialRing
# globals: QQ, QuotientFunctor
# globals: BigInt, Rational, Reflect, RuntimeError, SharedArrayBuffer, TypeError
# globals: ZZ, ZeroDivisionError, __sagejs_runtime_require__
# globals: divisors, factor, is_prime, parent, prime_divisors

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
divisors_function = divisors
factor_function = factor
is_prime_function = is_prime
parent_function = parent
prime_divisors_function = prime_divisors

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
            "__annotations__",
            "__annotations_text__",
            "__code__",
            "__defaults__",
            "__doc__",
            "__globals__",
            "__handles_kwarg_interpolation__",
            "__kwdefaults__",
            "__kwonly__",
            "__module__",
            "__name__",
            "__positional_only__",
            "__python_type__",
            "__qualname__",
            "__varargs__",
            "__varkw__",
        ]) {
            method[name] = target_function[name];
        }
        method.__sagejs_native_method__ = true;
        return method;
    })()"""


def ρσ_unbound_method_adapter(target_function):
    """Expose a JavaScript-receiver method as ``method(self, *args)``."""
    return r"""%js (() => {
        if (target_function.__sagejs_unbound_adapter__) {
            return target_function.__sagejs_unbound_adapter__;
        }
        function method(receiver, ...args) {
            return Reflect.apply(target_function, receiver, args);
        }
        if (target_function.__argnames__) {
            method.__argnames__ = ["self", ...target_function.__argnames__];
        }
        for (const name of [
            "__annotations__",
            "__annotations_text__",
            "__code__",
            "__defaults__",
            "__doc__",
            "__globals__",
            "__handles_kwarg_interpolation__",
            "__kwdefaults__",
            "__kwonly__",
            "__module__",
            "__name__",
            "__positional_only__",
            "__python_type__",
            "__qualname__",
            "__varargs__",
            "__varkw__",
        ]) {
            if (name !== "__argnames__") method[name] = target_function[name];
        }
        method.__func__ = target_function;
        // The adapter still represents an ordinary Python function.  Mark it
        // as a descriptor so aliases assigned back onto a class (for example
        // ``C.__rtruediv__ = C.__rdiv__``) bind their eventual instance
        // before receiving the operator's other operand.
        method.__python_descriptor__ = true;
        target_function.__sagejs_unbound_adapter__ = method;
        return method;
    })()"""


def ρσ_native_freeze_tuple(values, prototype):
    """Implement the hot tuple finalization primitive in native JavaScript."""
    return r"""%js (
        Object.setPrototypeOf(values, prototype),
        Object.freeze(values),
        values
    )"""


def ρσ_output_write(text):
    return r"""%js (
        typeof globalThis.__sagejs_output_write__ === "function"
        ? globalThis.__sagejs_output_write__(String(text))
        : (
            typeof process !== "undefined"
            && process.stdout
            && typeof process.stdout.write === "function"
            ? process.stdout.write(String(text))
            : console.log(String(text))
        )
    )"""


def ρσ_wall_time():
    return r"%js Date.now() / 1000"


def ρσ_dynamic_eval(javascript, input_namespace, module_id):
    """Evaluate compiler output in an isolated dynamic module namespace."""
    return r"""%js (() => {
        const ρσ_dynamic_modules = {
            [module_id]: Object.assign({}, input_namespace)
        };
        const __sagejs_input_namespace__ = input_namespace;
        const evaluate = new Function(
            "ρσ_modules",
            "__sagejs_input_namespace__",
            "javascript",
            "return eval(javascript)"
        );
        const completion = evaluate(
            ρσ_dynamic_modules,
            __sagejs_input_namespace__,
            javascript
        );
        return {completion, namespace: ρσ_dynamic_modules[module_id]};
    })()"""


def ρσ_register_doc(name, value, metadata):
    return r"""%js (() => {
        const registry = (
            globalThis.__sagejs_doc_registry__ ??= []
        );
        registry.push([name, value, metadata ?? Object.create(null)]);
    })()"""


def ρσ_documentation_registry():
    return r"%js globalThis.__sagejs_doc_registry__ ?? []"


def ρσ_ffi_call(
    declaration_identity, package_name, export_name, values, parameter_types,
    return_type
):
    """Marshal a checked declaration call to its ordinary dynamic backend."""
    return r"""%js (() => {
        if (
            typeof declaration_identity !== "string"
            || !/^[a-z][a-z0-9_]*@[0-9a-f]{64}:[A-Za-z_][A-Za-z0-9_]*$/
                .test(declaration_identity)
        ) {
            throw new TypeError("invalid FFI declaration identity");
        }
        if (values.length !== parameter_types.length) {
            throw new TypeError(
                `FFI declaration ${declaration_identity} argument count mismatch`
            );
        }
        const backend = __sagejs_runtime_require__(package_name);
        const callable_value = Reflect.get(backend, export_name);
        if (typeof callable_value !== "function") {
            throw new RuntimeError(
                `FFI declaration ${declaration_identity} backend `
                + `${package_name} does not export ${export_name}`
            );
        }
        const marshalled = values.map((value, index) => {
            const parameter_type = parameter_types[index];
            if (parameter_type === "Integer") {
                if (typeof value === "bigint") return value;
                if (Number.isSafeInteger(value)) return BigInt(value);
            }
            if (parameter_type === "uint64") {
                const exact = typeof value === "bigint"
                    ? value
                    : Number.isSafeInteger(value) ? BigInt(value) : -1n;
                if (exact >= 0n && exact <= 18446744073709551615n) {
                    return exact;
                }
            }
            if (parameter_type === "bool" && typeof value === "boolean") {
                return value;
            }
            throw new TypeError(
                `invalid dynamic FFI argument for ${parameter_type}`
            );
        });
        const result = Reflect.apply(callable_value, backend, marshalled);
        if (return_type === "bool" && typeof result === "boolean") {
            return result;
        }
        if (return_type === "Integer" && typeof result === "bigint") {
            return result;
        }
        if (
            return_type === "uint64" && typeof result === "bigint"
            && result >= 0n && result <= 18446744073709551615n
        ) {
            return result;
        }
        throw new TypeError(
            `FFI declaration ${declaration_identity} returned invalid `
            + `${return_type}`
        );
    })()"""


ρσ_interrupt_counter = 0


def ρσ_check_interrupt():
    return r"""%js (() => {
        const state = globalThis.__sagejs_interrupt_state__;
        if (
            state !== undefined
            && Atomics.exchange(state, 0, 0) !== 0
        ) {
            throw ρσ_exception_value(new KeyboardInterrupt());
        }
    })()"""


def ρσ_normalize_exception(error):
    return r"""%js (() => {
        if (error?.code !== "ERR_SCRIPT_EXECUTION_INTERRUPTED") {
            return error;
        }
        const state = globalThis.__sagejs_interrupt_state__;
        if (state !== undefined) {
            Atomics.store(state, 0, 0);
        }
        return ρσ_exception_value(new KeyboardInterrupt());
    })()"""


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
            const state = (
                globalThis.__sagejs_interrupt_state__
                ?? new Int32Array(new SharedArrayBuffer(4))
            );
            Atomics.wait(
                state,
                0,
                0,
                Number(seconds) * 1000
            );
            ρσ_check_interrupt();
        } catch (error) {
            if (error?.code === "ERR_SCRIPT_EXECUTION_INTERRUPTED") {
                throw ρσ_normalize_exception(error);
            }
            if (
                error instanceof KeyboardInterrupt
                || error?.name === "KeyboardInterrupt"
            ) {
                throw error;
            }
            throw new RuntimeError(
                "time.sleep() cannot block this JavaScript execution context"
            );
        }
    })()"""
