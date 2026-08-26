"""Irreducible globals used by the compiler-only baselib.

These primitives execute before Python builtins have finished initializing.
They intentionally provide no Sage mathematical classes: the compiler emits
mathematical operations into generated programs but never evaluates them in
its own VM context.
"""

# globals: BigInt, Object, Reflect, TypeError


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
            "__annotations__", "__annotations_text__", "__code__",
            "__defaults__", "__doc__", "__globals__",
            "__handles_kwarg_interpolation__", "__kwdefaults__",
            "__kwonly__", "__module__", "__name__",
            "__positional_only__", "__python_type__", "__qualname__",
            "__varargs__", "__varkw__",
        ]) {
            const descriptor = Object.getOwnPropertyDescriptor(
                target_function, name
            );
            if (descriptor && typeof descriptor.get === "function") {
                Object.defineProperty(method, name, descriptor);
            } else {
                method[name] = target_function[name];
            }
        }
        method.__sagejs_native_method__ = true;
        return method;
    })()"""


def ρσ_unbound_method_adapter(target_function):
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
            "__annotations__", "__annotations_text__", "__code__",
            "__defaults__", "__doc__", "__globals__",
            "__handles_kwarg_interpolation__", "__kwdefaults__",
            "__kwonly__", "__module__", "__name__",
            "__positional_only__", "__python_type__", "__qualname__",
            "__varargs__", "__varkw__",
        ]) {
            if (name !== "__argnames__") {
                const descriptor = Object.getOwnPropertyDescriptor(
                    target_function, name
                );
                if (descriptor && typeof descriptor.get === "function") {
                    Object.defineProperty(method, name, descriptor);
                } else {
                    method[name] = target_function[name];
                }
            }
        }
        method.__func__ = target_function;
        method.__python_descriptor__ = true;
        target_function.__sagejs_unbound_adapter__ = method;
        return method;
    })()"""


def ρσ_exact_integer_range_values(start, step, length):
    return r"""%js (() => {
        function exactInteger(value) {
            return typeof value === "bigint" || Number.isSafeInteger(value);
        }
        function exactAdd(left, right) {
            if (typeof left === "bigint" || typeof right === "bigint") {
                return BigInt(left) + BigInt(right);
            }
            const answer = left + right;
            return Number.isSafeInteger(answer)
                ? answer
                : BigInt(left) + BigInt(right);
        }
        if (!exactInteger(start) || !exactInteger(step)) {
            throw new TypeError("exact range start and step must be integers");
        }
        if (step === 0 || step === 0n) {
            throw new RangeError("exact range step must not be zero");
        }
        let size;
        if (typeof length === "bigint") {
            if (length < 0n || length > 0xffffffffn) {
                throw new RangeError("exact range is too large to materialize");
            }
            size = Number(length);
        } else {
            if (!Number.isSafeInteger(length) || length < 0 ||
                length > 0xffffffff) {
                throw new RangeError("invalid exact range length");
            }
            size = length;
        }
        const answer = new Array(size);
        let current = start;
        for (let index = 0; index < size; index += 1) {
            answer[index] = current;
            current = exactAdd(current, step);
        }
        return answer;
    })()"""


def ρσ_exact_integer_range_iterator(start, step, length):
    return r"""%js (() => {
        const values = ρσ_exact_integer_range_values(start, step, length);
        return values[Symbol.iterator]();
    })()"""


def ρσ_dynamic_eval(javascript, input_namespace, module_id):
    return r"""%js (() => {
        const dynamicModules = {[module_id]: Object.assign({}, input_namespace)};
        const inputNamespace = input_namespace;
        const evaluate = new Function(
            "ρσ_modules", "__sagejs_input_namespace__", "javascript",
            "return eval(javascript)"
        );
        const completion = evaluate(dynamicModules, inputNamespace, javascript);
        return {completion, namespace: dynamicModules[module_id]};
    })()"""


def ρσ_output_write(text):
    return r"""%js (
        typeof globalThis.__sagejs_output_write__ === "function"
        ? globalThis.__sagejs_output_write__(String(text))
        : process.stdout.write(String(text))
    )"""


def ρσ_register_doc(name, value, metadata):
    return r"""%js (() => {
        const registry = (globalThis.__sagejs_doc_registry__ ??= []);
        registry.push([name, value, metadata ?? Object.create(null)]);
    })()"""


def ρσ_documentation_registry():
    return r"%js globalThis.__sagejs_doc_registry__ ?? []"


def ρσ_check_interrupt():
    return r"""%js (() => {
        const state = globalThis.__sagejs_interrupt_state__;
        if (state !== undefined && Atomics.exchange(state, 0, 0) !== 0) {
            throw ρσ_exception_value(new KeyboardInterrupt());
        }
    })()"""


def ρσ_normalize_exception(error):
    return r"""%js (() => {
        if (error?.code !== "ERR_SCRIPT_EXECUTION_INTERRUPTED") return error;
        const state = globalThis.__sagejs_interrupt_state__;
        if (state !== undefined) Atomics.store(state, 0, 0);
        return ρσ_exception_value(new KeyboardInterrupt());
    })()"""


def ρσ_is_exact_integer(value):
    return r"""%js (
        typeof value === "bigint" || Number.isSafeInteger(value)
    )"""


def ρσ_normalize_integer(value):
    return r"""%js (() => {
        if (typeof value === "number") {
            if (!Number.isSafeInteger(value)) {
                throw new TypeError("expected an exact integer");
            }
            return value;
        }
        if (typeof value !== "bigint") {
            throw new TypeError("expected an exact integer");
        }
        return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
            value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value;
    })()"""


def ρσ_integer_bigint(value):
    return r"""%js (() => {
        if (typeof value === "number" && !Number.isSafeInteger(value)) {
            throw new TypeError("expected an exact integer");
        }
        if (typeof value !== "number" && typeof value !== "bigint") {
            throw new TypeError("expected an exact integer");
        }
        return BigInt(value);
    })()"""


def ρσ_string_primitive(value):
    return r"%js String(value)"


def ρσ_native_jstype(value):
    """Return JavaScript's primitive representation tag."""
    return r"%js typeof value"


def ρσ_string_find(value, needle):
    return r"%js String.prototype.indexOf.call(value, needle)"


def ρσ_new_map():
    return r"%js new Map()"


def ρσ_modular_inverse(value, modulus):
    return r"""%js (() => {
        let oldRemainder = BigInt(value);
        const mod = BigInt(modulus);
        let remainder = mod;
        let oldCoefficient = 1n;
        let coefficient = 0n;
        while (remainder !== 0n) {
            const quotient = oldRemainder / remainder;
            [oldRemainder, remainder] = [
                remainder, oldRemainder - quotient * remainder
            ];
            [oldCoefficient, coefficient] = [
                coefficient, oldCoefficient - quotient * coefficient
            ];
        }
        if (oldRemainder !== 1n && oldRemainder !== -1n) {
            throw new RangeError("inverse does not exist");
        }
        if (oldRemainder === -1n) oldCoefficient = -oldCoefficient;
        oldCoefficient %= mod;
        return oldCoefficient < 0n ? oldCoefficient + mod : oldCoefficient;
    })()"""


def ρσ_modular_power(value, exponent, modulus):
    return r"""%js (() => {
        let base = BigInt(value);
        let power = BigInt(exponent);
        const mod = BigInt(modulus);
        let result = 1n;
        while (power > 0n) {
            if (power & 1n) result = (result * base) % mod;
            power >>= 1n;
            if (power) base = (base * base) % mod;
        }
        return result;
    })()"""


def ρσ_math_tuple(values):
    return r"""%js (() => {
        const answer = Array.isArray(values) ? values : Array.from(values);
        return Object.freeze(answer);
    })()"""


def ρσ_fast_closed_binary(left, right, operation, missing):
    return r"""%js (() => {
        if (left !== null && right !== null &&
            typeof left === "object" && typeof right === "object") {
            const parent = left._parent;
            if (parent !== undefined && parent === right._parent &&
                parent._closedScalarArithmetic === true) {
                switch (operation) {
                    case "add": return left._add_(right);
                    case "sub": return left._sub_(right);
                    case "mul": return left._mul_(right);
                    case "truediv": return left._truediv_(right);
                    default: throw new Error("invalid closed binary operation");
                }
            }
        }
        return missing;
    })()"""


def ρσ_fast_machine_residue_recurrence(accumulator, multiplier, increment, count):
    return r"""%js (() => {
        if (!Number.isSafeInteger(count) || count < 0 ||
            accumulator === null || multiplier === null || increment === null ||
            typeof accumulator !== "object" ||
            typeof multiplier !== "object" || typeof increment !== "object") {
            return null;
        }
        const parent = accumulator._parent;
        const prototype = parent?._closedScalarElementPrototype;
        if (parent === undefined || parent !== multiplier._parent ||
            parent !== increment._parent || parent._machineResidues !== true ||
            parent._closedScalarArithmetic !== true ||
            Object.getPrototypeOf(accumulator) !== prototype ||
            Object.getPrototypeOf(multiplier) !== prototype ||
            Object.getPrototypeOf(increment) !== prototype ||
            prototype?._mul_ !== parent._closedScalarMul ||
            prototype?._add_ !== parent._closedScalarAdd ||
            prototype?._new_reduced !== parent._closedScalarNewReduced) {
            return null;
        }
        const modulus = parent._residueModulus;
        let value = accumulator._value;
        const factor = multiplier._value;
        const addend = increment._value;
        if (!Number.isSafeInteger(modulus) || modulus <= 1 ||
            !Number.isInteger(value) || value < 0 || value >= modulus ||
            !Number.isInteger(factor) || factor < 0 || factor >= modulus ||
            !Number.isInteger(addend) || addend < 0 || addend >= modulus) {
            return null;
        }
        for (let index = 0; index < count; index++) {
            value = (value * factor + addend) % modulus;
        }
        const result = Object.create(prototype);
        result._parent = parent;
        result._value = value;
        return result;
    })()"""


def ρσ_flint_backend():
    raise TypeError("FLINT backend is unavailable inside compiler")


def ρσ_is_math_element(value):
    return False


def _compiler_math_unavailable(*args, **kwargs):
    raise TypeError("mathematical operation is unavailable inside compiler")


ρσ_coercion_model = Object.create(None)
IntegerFactorization = _compiler_math_unavailable
Rational = _compiler_math_unavailable
create_real_literal = _compiler_math_unavailable
