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
    return_type, error_policy, error_exception, error_message, constraints
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
            if (
                typeof parameter_type === "string"
                && parameter_type.startsWith("resource:")
            ) {
                const tag = (
                    globalThis.__sagejs_ffi_resource_tag__ ??= Symbol(
                        "Sage.js declared FFI resource"
                    )
                );
                const state = value?.[tag];
                if (
                    state === undefined
                    || state.identity !== parameter_type
                ) {
                    throw new TypeError(
                        `invalid dynamic FFI argument for ${parameter_type}`
                    );
                }
                if ((state.root ?? state).closed) {
                    throw new ValueError("FFI resource is closed");
                }
                return state.handle;
            }
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
            if (parameter_type === "UInt64Buffer") {
                if (
                    value !== null
                    && (typeof value === "object"
                        || typeof value === "function")
                ) {
                    const length = Number(Reflect.get(value, "length"));
                    if (Number.isSafeInteger(length) && length >= 0) {
                        for (let position = 0; position < length; position++) {
                            const entry = Reflect.get(value, String(position));
                            const exact = typeof entry === "bigint"
                                ? entry
                                : Number.isSafeInteger(entry)
                                    ? BigInt(entry) : -1n;
                            if (exact < 0n || exact > 18446744073709551615n) {
                                throw new TypeError(
                                    "invalid UInt64Buffer entry"
                                );
                            }
                        }
                        return value;
                    }
                }
            }
            throw new TypeError(
                `invalid dynamic FFI argument for ${parameter_type}`
            );
        });
        for (const constraint of constraints) {
            const [kind, buffer, dimensions, parameter_names] = constraint;
            if (
                kind !== "buffer_length"
                || typeof buffer !== "string"
                || !Array.isArray(dimensions)
                || !Array.isArray(parameter_names)
            ) {
                throw new TypeError("invalid FFI call-plan constraint");
            }
            const buffer_index = parameter_types.length === 0 ? -1 :
                parameter_names.indexOf(buffer);
            if (buffer_index < 0) {
                throw new TypeError("FFI call plan names an unknown buffer");
            }
            let expected = 1n;
            for (const dimension of dimensions) {
                const index = parameter_names.indexOf(dimension);
                if (index < 0 || typeof marshalled[index] !== "bigint") {
                    throw new TypeError("FFI call plan names an invalid dimension");
                }
                expected *= marshalled[index];
            }
            if (BigInt(marshalled[buffer_index].length) !== expected) {
                throw new ValueError(
                    "packed buffer length does not match its declared dimensions"
                );
            }
        }
        const result = Reflect.apply(callable_value, backend, marshalled);
        if (error_policy === "zero_is_error" && result === false) {
            const exception_classes = {
                OverflowError, RuntimeError, TypeError, ValueError
            };
            const exception_class = exception_classes[error_exception];
            if (typeof exception_class !== "function") {
                throw new RuntimeError(
                    `unsupported FFI exception ${error_exception}`
                );
            }
            throw new exception_class(error_message);
        }
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


def ρσ_ffi_resource_create(
    declaration_identity, resource_identity, package_name, create_export,
    close_export, values, parameter_types, parameter_minimums,
    error_policy, error_exception,
    error_message
):
    """Create an opaque owned resource through a checked declaration."""
    return r"""%js (() => {
        if (
            typeof declaration_identity !== "string"
            || !/^[a-z][a-z0-9_]*@[0-9a-f]{64}:[A-Za-z_][A-Za-z0-9_]*$/
                .test(declaration_identity)
            || typeof resource_identity !== "string"
            || !/^resource:[a-z][a-z0-9_]*@[0-9a-f]{64}:[A-Za-z_][A-Za-z0-9_]*$/
                .test(resource_identity)
        ) {
            throw new TypeError("invalid FFI resource declaration identity");
        }
        if (
            values.length !== parameter_types.length
            || values.length !== parameter_minimums.length
        ) {
            throw new TypeError(
                `FFI declaration ${declaration_identity} argument count mismatch`
            );
        }
        const backend = __sagejs_runtime_require__(package_name);
        const create = Reflect.get(backend, create_export);
        const close = Reflect.get(backend, close_export);
        if (typeof create !== "function" || typeof close !== "function") {
            throw new RuntimeError(
                `FFI resource backend ${package_name} lacks `
                + `${create_export}/${close_export}`
            );
        }
        const marshalled = values.map((value, index) => {
            const type = parameter_types[index];
            if (type === "Integer") {
                if (typeof value === "bigint") return value;
                if (Number.isSafeInteger(value)) return BigInt(value);
            }
            if (type === "uint64") {
                const exact = typeof value === "bigint"
                    ? value
                    : Number.isSafeInteger(value) ? BigInt(value) : -1n;
                if (exact >= 0n && exact <= 18446744073709551615n) {
                    const minimum = parameter_minimums[index];
                    if (minimum !== null && exact < BigInt(minimum)) {
                        throw new ValueError(
                            `FFI resource argument is below minimum ${minimum}`
                        );
                    }
                    return exact;
                }
            }
            if (type === "bool" && typeof value === "boolean") return value;
            throw new TypeError(
                `invalid dynamic FFI resource argument for ${type}`
            );
        });
        const handle = Reflect.apply(create, backend, marshalled);
        if (error_policy === "zero_is_error" && handle === false) {
            const exceptions = {
                OverflowError, RuntimeError, TypeError, ValueError
            };
            const exception = exceptions[error_exception];
            if (typeof exception !== "function") {
                throw new RuntimeError(
                    `unsupported FFI exception ${error_exception}`
                );
            }
            throw new exception(error_message);
        }
        if (
            handle === null
            || (typeof handle !== "object" && typeof handle !== "function")
        ) {
            throw new TypeError(
                `FFI declaration ${declaration_identity} returned invalid resource`
            );
        }
        const tag = (
            globalThis.__sagejs_ffi_resource_tag__ ??= Symbol(
                "Sage.js declared FFI resource"
            )
        );
        const registry = (
            globalThis.__sagejs_ffi_resource_registry__ ??=
                new FinalizationRegistry((state) => {
                    if (state.closed) return;
                    try {
                        Reflect.apply(state.close, state.backend, [state.handle]);
                    } catch (_error) {
                        // Finalizers cannot report recoverable errors to user code.
                    } finally {
                        state.closed = true;
                        state.handle = null;
                    }
                })
        );
        const state = {
            identity: resource_identity,
            declaration: declaration_identity,
            backend,
            close,
            handle,
            closed: false,
            root: null,
            borrowed: false
        };
        state.root = state;
        const token = Object.create(null);
        Object.defineProperty(token, tag, {value: state});
        registry.register(token, state, token);
        return token;
    })()"""


def ρσ_ffi_resource_borrow(token, resource_identity):
    """Validate an opaque resource and retain only its unforgeable token."""
    return r"""%js (() => {
        const tag = globalThis.__sagejs_ffi_resource_tag__;
        const state = tag === undefined ? undefined : token?.[tag];
        if (state === undefined || state.identity !== resource_identity) {
            throw new TypeError(`expected ${resource_identity}`);
        }
        if ((state.root ?? state).closed) {
            throw new ValueError("FFI resource is closed");
        }
        return token;
    })()"""


def ρσ_ffi_view_create(
    declaration_identity, view_identity, owner_identity, owner_token, package_name,
    create_export, values, parameter_types, error_policy, error_exception,
    error_message
):
    """Construct an opaque borrowed view which strongly retains its owner."""
    return r"""%js (() => {
        const tag = globalThis.__sagejs_ffi_resource_tag__;
        const owner = tag === undefined ? undefined : owner_token?.[tag];
        const root = owner?.root ?? owner;
        if (
            owner === undefined || owner.identity !== owner_identity || root.closed
            || typeof declaration_identity !== "string"
            || !/^[a-z][a-z0-9_]*@[0-9a-f]{64}:[A-Za-z_][A-Za-z0-9_]*$/
                .test(declaration_identity)
            || typeof view_identity !== "string"
            || !/^resource:[a-z][a-z0-9_]*@[0-9a-f]{64}:[A-Za-z_][A-Za-z0-9_]*$/
                .test(view_identity)
        ) {
            if (owner !== undefined && root.closed) {
                throw new ValueError("FFI resource is closed");
            }
            throw new TypeError("invalid FFI borrowed-view owner");
        }
        if (values.length !== parameter_types.length) {
            throw new TypeError("FFI borrowed-view argument count mismatch");
        }
        const backend = __sagejs_runtime_require__(package_name);
        const create = Reflect.get(backend, create_export);
        if (typeof create !== "function") {
            throw new RuntimeError(
                `FFI borrowed-view backend lacks ${create_export}`
            );
        }
        const marshalled = values.map((value, index) => {
            const type = parameter_types[index];
            if (typeof type === "string" && type.startsWith("resource:")) {
                const state = value?.[tag];
                if (state === undefined || state.identity !== type) {
                    throw new TypeError(`invalid dynamic FFI argument for ${type}`);
                }
                if ((state.root ?? state).closed) {
                    throw new ValueError("FFI resource is closed");
                }
                return state.handle;
            }
            if (type === "uint64") {
                const exact = typeof value === "bigint"
                    ? value : Number.isSafeInteger(value) ? BigInt(value) : -1n;
                if (exact >= 0n && exact <= 18446744073709551615n) return exact;
            }
            if (type === "bool" && typeof value === "boolean") return value;
            throw new TypeError(`invalid dynamic FFI argument for ${type}`);
        });
        const handle = Reflect.apply(create, backend, marshalled);
        if (error_policy === "zero_is_error" && handle === false) {
            const exceptions = {OverflowError, RuntimeError, TypeError, ValueError};
            throw new exceptions[error_exception](error_message);
        }
        if (handle === null || (typeof handle !== "object" &&
            typeof handle !== "function")) {
            throw new TypeError(
                `FFI declaration ${declaration_identity} returned invalid view`
            );
        }
        const state = {
            identity: view_identity,
            declaration: declaration_identity,
            backend,
            handle,
            owner,
            owner_token,
            root,
            closed: false,
            borrowed: true
        };
        const token = Object.create(null);
        Object.defineProperty(token, tag, {value: state});
        return token;
    })()"""


def ρσ_ffi_view_valid(token):
    """Return whether a borrowed view's ownership root remains live."""
    return r"""%js (() => {
        const tag = globalThis.__sagejs_ffi_resource_tag__;
        const state = tag === undefined ? undefined : token?.[tag];
        if (state === undefined || !state.borrowed) {
            throw new TypeError("invalid FFI borrowed view");
        }
        return !(state.root ?? state).closed;
    })()"""


def ρσ_ffi_resource_close(token):
    """Close an owned resource once; repeated close operations are harmless."""
    return r"""%js (() => {
        const tag = globalThis.__sagejs_ffi_resource_tag__;
        const state = tag === undefined ? undefined : token?.[tag];
        if (state === undefined) throw new TypeError("invalid FFI resource");
        if (state.borrowed) throw new TypeError("borrowed FFI views cannot close");
        if (state.closed) return undefined;
        Reflect.apply(state.close, state.backend, [state.handle]);
        state.closed = true;
        state.handle = null;
        globalThis.__sagejs_ffi_resource_registry__?.unregister(token);
        return undefined;
    })()"""


def ρσ_ffi_resource_closed(token):
    """Return whether an opaque owned resource has been closed."""
    return r"""%js (() => {
        const tag = globalThis.__sagejs_ffi_resource_tag__;
        const state = tag === undefined ? undefined : token?.[tag];
        if (state === undefined) throw new TypeError("invalid FFI resource");
        return (state.root ?? state).closed;
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
