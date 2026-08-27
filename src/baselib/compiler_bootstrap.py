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
        Object.freeze(answer);
        let brand = ρσ_math_tuple.__machineFieldSequenceBrand;
        if (!(brand instanceof WeakSet)) {
            brand = new WeakSet();
            Object.defineProperty(ρσ_math_tuple, "__machineFieldSequenceBrand", {
                value: brand,
                enumerable: false,
                configurable: false,
                writable: false,
            });
        }
        brand.add(answer);
        return answer;
    })()"""


def ρσ_brand_machine_field_element(value):
    """Privately register one canonical field element for callback-free guards."""
    return r"""%js (() => {
        let brand = ρσ_brand_machine_field_element.__brand;
        if (!(brand instanceof WeakSet)) {
            brand = new WeakSet();
            Object.defineProperty(ρσ_brand_machine_field_element, "__brand", {
                value: brand,
                enumerable: false,
                configurable: false,
                writable: false,
            });
        }
        brand.add(value);
        return value;
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


def ρσ_machine_field_sequence_length(source):
    """Return the length of one non-proxy runtime tuple, or `-1`."""
    return r"""%js (() => {
        const brand = ρσ_math_tuple.__machineFieldSequenceBrand;
        return brand instanceof WeakSet && brand.has(source) ? source.length : -1;
    })()"""


def ρσ_prepare_machine_field_region(values, sequences, count, operation_mask):
    """Validate and unbox one transactional finite-field region."""
    return r"""%js (() => {
        if (!Number.isSafeInteger(count) || count < 0 ||
            !Array.isArray(values) || values.length === 0 ||
            !Array.isArray(sequences) || !Number.isSafeInteger(operation_mask)) {
            return null;
        }
        const elementBrand = ρσ_brand_machine_field_element.__brand;
        if (!(elementBrand instanceof WeakSet) ||
            values.some((value) => !elementBrand.has(value))) return null;
        const parent = values[0]._parent;
        if (parent === undefined) return null;
        const tupleBrand = ρσ_math_tuple.__machineFieldSequenceBrand;
        if (sequences.some((source) =>
            !(tupleBrand instanceof WeakSet) || !tupleBrand.has(source) ||
            source.length < count)) return null;
        const ADD = 1, SUB = 2, MUL = 4, NEG = 8, EQUAL = 16;
        const required = (bit) => (operation_mask & bit) !== 0;

        const primePrototype = parent._closedScalarElementPrototype;
        if (parent._machineResidues === true &&
            parent._closedScalarArithmetic === true &&
            primePrototype?._new_reduced === parent._closedScalarNewReduced &&
            (!required(ADD) || primePrototype?._add_ === parent._closedScalarAdd) &&
            (!required(SUB) || primePrototype?._sub_ === parent._closedScalarSub) &&
            (!required(MUL) || primePrototype?._mul_ === parent._closedScalarMul) &&
            (!required(NEG) || primePrototype?.__neg__ === parent._closedScalarNeg) &&
            (!required(EQUAL) || primePrototype?._eq_ === parent._closedScalarEq)) {
            const modulus = parent._residueModulus;
            if (!Number.isSafeInteger(modulus) || modulus <= 1) return null;
            const scalar = (value) =>
                elementBrand.has(value) &&
                value._parent === parent &&
                Object.getPrototypeOf(value) === primePrototype &&
                Number.isInteger(value._value) && value._value >= 0 &&
                value._value < modulus;
            if (!values.every(scalar)) return null;
            const unboxed = new Float64Array(values.length);
            for (let index = 0; index < values.length; index++) {
                unboxed[index] = values[index]._value;
            }
            const packedSequences = [];
            for (const source of sequences) {
                const packed = new Float64Array(count);
                for (let index = 0; index < count; index++) {
                    if (!scalar(source[index])) return null;
                    packed[index] = source[index]._value;
                }
                packedSequences.push(packed);
            }
            parent._lastCompilerOptimizationRoute = "v8-number-residue-region";
            return { kind: 1, parent, prototype: primePrototype, modulus,
                     values: unboxed, sequences: packedSequences };
        }

        const extensionPrototype = parent._machineExtensionElementPrototype;
        const parentPrototype = Object.getPrototypeOf(parent);
        if (parent._machineExtensionDegree2 !== true ||
            parentPrototype?._from_machine_coordinates !==
                parent._machineExtensionMaterialize) return null;
        if ((required(ADD) && extensionPrototype?._add_ !== parent._machineExtensionAdd) ||
            (required(SUB) && extensionPrototype?._sub_ !== parent._machineExtensionSub) ||
            (required(MUL) && extensionPrototype?._mul_ !== parent._machineExtensionMul) ||
            (required(EQUAL) && extensionPrototype?._eq_ !== parent._machineExtensionEq)) {
            return null;
        }
        if (required(NEG)) {
            let negOwner = extensionPrototype;
            let negDescriptor;
            while (negOwner !== null) {
                negDescriptor = Object.getOwnPropertyDescriptor(negOwner, "__neg__");
                if (negDescriptor !== undefined) break;
                negOwner = Object.getPrototypeOf(negOwner);
            }
            if (negOwner !== parent._machineExtensionNegOwner ||
                negDescriptor?.get !== parent._machineExtensionNegGetter) return null;
        }
        const modulus = parent._machineExtensionPrime;
        const modulusC0 = parent._machineExtensionModulusC0;
        const modulusC1 = parent._machineExtensionModulusC1;
        const exactBound = modulus * modulus * modulus +
            2 * modulus * modulus + modulus;
        if (!Number.isSafeInteger(modulus) || modulus < 2 || modulus > 200000 ||
            !Number.isInteger(modulusC0) || modulusC0 < 0 || modulusC0 >= modulus ||
            !Number.isInteger(modulusC1) || modulusC1 < 0 || modulusC1 >= modulus ||
            !Number.isSafeInteger(exactBound)) return null;
        const scalar = (value) => {
            if (!elementBrand.has(value) ||
                value._parent !== parent ||
                Object.getPrototypeOf(value) !== extensionPrototype) return false;
            const coordinates = value._machineCoordinates;
            return Array.isArray(coordinates) && Object.isFrozen(coordinates) &&
                coordinates.length === 2 &&
                Number.isInteger(coordinates[0]) && coordinates[0] >= 0 &&
                coordinates[0] < modulus &&
                Number.isInteger(coordinates[1]) && coordinates[1] >= 0 &&
                coordinates[1] < modulus;
        };
        if (!values.every(scalar)) return null;
        const unboxed = new Float64Array(2 * values.length);
        for (let index = 0; index < values.length; index++) {
            unboxed[2 * index] = values[index]._machineCoordinates[0];
            unboxed[2 * index + 1] = values[index]._machineCoordinates[1];
        }
        const packedSequences = [];
        for (const source of sequences) {
            const packed = new Float64Array(2 * count);
            for (let index = 0; index < count; index++) {
                if (!scalar(source[index])) return null;
                packed[2 * index] = source[index]._machineCoordinates[0];
                packed[2 * index + 1] = source[index]._machineCoordinates[1];
            }
            packedSequences.push(packed);
        }
        parent._lastCompilerOptimizationRoute = "v8-extension-tuple-region";
        return { kind: 2, parent, modulus, modulusC0, modulusC1,
                 values: unboxed, sequences: packedSequences };
    })()"""


def ρσ_materialize_machine_field_value(context, coefficient0, coefficient1=0):
    """Materialize one public value at a verified region exit."""
    return r"""%js (() => {
        if (context.kind === 1) {
            const result = Object.create(context.prototype);
            result._parent = context.parent;
            result._value = coefficient0;
            return ρσ_brand_machine_field_element(result);
        }
        return context.parent._machineExtensionMaterialize.call(
            context.parent, coefficient0, coefficient1
        );
    })()"""


def ρσ_fast_machine_residue_recurrence(accumulator, multiplier, increment, count):
    return r"""%js (() => {
        if (!Number.isSafeInteger(count) || count < 0 ||
            accumulator === null || multiplier === null || increment === null ||
            typeof accumulator !== "object" ||
            typeof multiplier !== "object" || typeof increment !== "object") {
            return null;
        }
        const elementBrand = ρσ_brand_machine_field_element.__brand;
        if (!(elementBrand instanceof WeakSet) ||
            !elementBrand.has(accumulator) || !elementBrand.has(multiplier) ||
            !elementBrand.has(increment)) return null;
        const parent = accumulator._parent;
        if (parent === undefined || parent !== multiplier._parent ||
            parent !== increment._parent) {
            return null;
        }

        const primePrototype = parent._closedScalarElementPrototype;
        if (parent._machineResidues === true &&
            parent._closedScalarArithmetic === true &&
            Object.getPrototypeOf(accumulator) === primePrototype &&
            Object.getPrototypeOf(multiplier) === primePrototype &&
            Object.getPrototypeOf(increment) === primePrototype &&
            primePrototype?._mul_ === parent._closedScalarMul &&
            primePrototype?._add_ === parent._closedScalarAdd &&
            primePrototype?._new_reduced === parent._closedScalarNewReduced) {
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
            if (count === 0) {
                parent._lastCompilerOptimizationRoute = "v8-number-residue";
                return accumulator;
            }
            for (let index = 0; index < count; index++) {
                value = (value * factor + addend) % modulus;
            }
            const result = Object.create(primePrototype);
            result._parent = parent;
            result._value = value;
            parent._lastCompilerOptimizationRoute = "v8-number-residue";
            return result;
        }

        const extensionPrototype = parent._machineExtensionElementPrototype;
        const parentPrototype = Object.getPrototypeOf(parent);
        const materialize = parent._machineExtensionMaterialize;
        const isolated = parent._machineExtensionIsolated;
        if (parent._machineExtensionDegree2 !== true ||
            Object.getPrototypeOf(accumulator) !== extensionPrototype ||
            Object.getPrototypeOf(multiplier) !== extensionPrototype ||
            Object.getPrototypeOf(increment) !== extensionPrototype ||
            extensionPrototype?._mul_ !== parent._machineExtensionMul ||
            extensionPrototype?._add_ !== parent._machineExtensionAdd ||
            parentPrototype?._from_machine_coordinates !== materialize ||
            parentPrototype?._machine_extension_affine_isolated !== isolated) {
            return null;
        }
        const prime = parent._machineExtensionPrime;
        const modulusC0 = parent._machineExtensionModulusC0;
        const modulusC1 = parent._machineExtensionModulusC1;
        const left = accumulator._machineCoordinates;
        const factor = multiplier._machineCoordinates;
        const addend = increment._machineCoordinates;
        const validCoordinates = (value) =>
            Array.isArray(value) && Object.isFrozen(value) && value.length === 2 &&
            Number.isInteger(value[0]) && value[0] >= 0 && value[0] < prime &&
            Number.isInteger(value[1]) && value[1] >= 0 && value[1] < prime;
        const exactBound = prime * prime * prime + 2 * prime * prime + prime;
        if (!Number.isSafeInteger(prime) || prime < 2 || prime > 200000 ||
            !Number.isInteger(modulusC0) || modulusC0 < 0 || modulusC0 >= prime ||
            !Number.isInteger(modulusC1) || modulusC1 < 0 || modulusC1 >= prime ||
            !Number.isSafeInteger(exactBound) ||
            !validCoordinates(left) || !validCoordinates(factor) ||
            !validCoordinates(addend)) {
            return null;
        }
        if (count === 0) {
            parent._lastCompilerOptimizationRoute = "v8-extension-tuple";
            return accumulator;
        }
        if (count >= parent._machineExtensionIsolatedMinSteps) {
            const result = isolated.call(
                parent, accumulator, multiplier, increment, count
            );
            if (result !== undefined) return result;
        }
        let valueC0 = left[0];
        let valueC1 = left[1];
        for (let index = 0; index < count; index++) {
            const quadratic = valueC1 * factor[1];
            let nextC0 = (
                valueC0 * factor[0] - quadratic * modulusC0 + addend[0]
            ) % prime;
            let nextC1 = (
                valueC0 * factor[1] + valueC1 * factor[0] -
                quadratic * modulusC1 + addend[1]
            ) % prime;
            if (nextC0 < 0) nextC0 += prime;
            if (nextC1 < 0) nextC1 += prime;
            valueC0 = nextC0;
            valueC1 = nextC1;
        }
        const result = materialize.call(parent, valueC0, valueC1);
        parent._lastCompilerOptimizationRoute = "v8-extension-tuple";
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
