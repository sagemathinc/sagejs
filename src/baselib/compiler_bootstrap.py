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


def ρσ_prepare_strict_float_region(values, count):
    """Validate and unbox one transactional strict-binary64 region."""
    return r"""%js (() => {
        if (!Number.isSafeInteger(count) || count < 0 ||
            !Array.isArray(values) || values.length === 0) return null;
        const unboxed = [];
        for (const value of values) {
            const number = ρσ_strict_float_unbox(value);
            if (number === null) return null;
            unboxed.push(number);
        }
        return Object.freeze({
            values: Object.freeze(unboxed),
            materialize: ρσ_float_result,
        });
    })()"""


def ρσ_prepare_machine_field_region(
    values, sequences, count, operation_mask, integer_constants
):
    """Validate and unbox one transactional finite-field region."""
    return r"""%js (() => {
        if (!Number.isSafeInteger(count) || count < 0 ||
            !Array.isArray(values) || values.length === 0 ||
            !Array.isArray(sequences) || !Array.isArray(integer_constants) ||
            !Number.isSafeInteger(operation_mask)) {
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
        const ADD = 1, SUB = 2, MUL = 4, NEG = 8, EQUAL = 16, STREAM = 32,
              POW = 64, IADD = 128, ISUB = 256, IMUL = 512,
              INTEGER_COERCION = 1024;
        const required = (bit) => (operation_mask & bit) !== 0;
        if (required(INTEGER_COERCION) !== (integer_constants.length !== 0)) {
            return null;
        }
        const streaming = required(STREAM);
        const inplaceNames = [];
        if (required(IADD)) inplaceNames.push("__iadd__");
        if (required(ISUB)) inplaceNames.push("__isub__");
        if (required(IMUL)) inplaceNames.push("__imul__");
        const hasNoInplaceDescriptor = (value) => {
            for (const name of inplaceNames) {
                let owner = value;
                while (owner !== null) {
                    if (Object.getOwnPropertyDescriptor(owner, name) !== undefined) {
                        return false;
                    }
                    owner = Object.getPrototypeOf(owner);
                }
            }
            return true;
        };
        if (inplaceNames.length !== 0 &&
            values.some((value) => !hasNoInplaceDescriptor(value))) return null;

        const validIntegerCoercion = () => {
            if (!required(INTEGER_COERCION)) return true;
            const model = parent._machineIntegerCoercionModel;
            const source = parent._machineIntegerCoercionSource;
            const conversion = parent._machineIntegerCoercion;
            const maps = parent._machineIntegerCoercionMaps;
            const targets = parent._machineIntegerCoercionTargets;
            const operations = parent._machineIntegerOperations;
            if (parent._machineIntegerCoercionReady !== true ||
                ρσ_fast_closed_binary !==
                    parent._machineIntegerFastClosedBinary ||
                ρσ_is_math_element !==
                    parent._machineIntegerIsMathElement ||
                ρσ_coercion_model !== model || model?._maps !== maps ||
                maps?.get(source) !== targets || targets?.get(parent) !== conversion ||
                model?._planCache !== parent._machineIntegerPlanCache ||
                model?._operations !== operations ||
                (required(ADD) &&
                    operations?.get("add") !== parent._machineIntegerOperationAdd) ||
                (required(SUB) &&
                    operations?.get("sub") !== parent._machineIntegerOperationSub) ||
                (required(MUL) &&
                    operations?.get("mul") !== parent._machineIntegerOperationMul) ||
                model?.binOp !== parent._machineIntegerBinOp ||
                model?.equals !== parent._machineIntegerEquals ||
                model?.coercePair !== parent._machineIntegerCoercePair ||
                model?.resolveParents !== parent._machineIntegerResolveParents ||
                model?.parentOf !== parent._machineIntegerParentOf ||
                model?._apply !== parent._machineIntegerApply ||
                model?._map !== parent._machineIntegerMap ||
                model?._cache !== parent._machineIntegerCache) return false;
            let leftPlan, rightPlan;
            try {
                leftPlan = model.resolveParents(source, parent);
                rightPlan = model.resolveParents(parent, source);
            } catch (_error) {
                return false;
            }
            const identity = parent._machineIntegerIdentityMap;
            if (leftPlan?.parent !== parent || leftPlan?.leftMap !== conversion ||
                leftPlan?.rightMap !== identity || rightPlan?.parent !== parent ||
                rightPlan?.leftMap !== identity ||
                rightPlan?.rightMap !== conversion ||
                parent._machineIntegerLeftPlanParent !== parent ||
                parent._machineIntegerRightPlanParent !== parent) return false;
            let callOwner = parent;
            let callDescriptor;
            while (callOwner !== null) {
                callDescriptor = Object.getOwnPropertyDescriptor(callOwner, "__call__");
                if (callDescriptor !== undefined) break;
                callOwner = Object.getPrototypeOf(callOwner);
            }
            return callOwner === parent._machineIntegerCallOwner &&
                callDescriptor?.get === parent._machineIntegerCallGetter &&
                callDescriptor?.value === parent._machineIntegerCallValue &&
                Reflect.get(parent, "__call__") === parent._machineIntegerCall;
        };
        if (!validIntegerCoercion()) return null;
        const canonicalIntegerConstants = (modulus) => {
            const result = Object.create(null);
            if (!required(INTEGER_COERCION)) return Object.freeze(result);
            const bigModulus = BigInt(modulus);
            for (const value of integer_constants) {
                if (!(typeof value === "bigint" || Number.isSafeInteger(value))) {
                    return null;
                }
                let residue = BigInt(value) % bigModulus;
                if (residue < 0n) residue += bigModulus;
                result[String(value)] = Number(residue);
            }
            return Object.freeze(result);
        };

        const primePrototype = parent._closedScalarElementPrototype;
        if (parent._machineResidues === true &&
            parent._closedScalarArithmetic === true &&
            parent._closedScalarCommutative === true &&
            primePrototype?._new_reduced === parent._closedScalarNewReduced &&
            (!required(ADD) || primePrototype?._add_ === parent._closedScalarAdd) &&
            (!required(SUB) || primePrototype?._sub_ === parent._closedScalarSub) &&
            (!required(MUL) || primePrototype?._mul_ === parent._closedScalarMul) &&
            (!required(NEG) || primePrototype?.__neg__ === parent._closedScalarNeg) &&
            (!required(POW) || primePrototype?.__pow__ === parent._closedScalarPow) &&
            (!required(EQUAL) || primePrototype?._eq_ === parent._closedScalarEq)) {
            const modulus = parent._residueModulus;
            if (!Number.isSafeInteger(modulus) || modulus <= 1) return null;
            const integerConstants = canonicalIntegerConstants(modulus);
            if (integerConstants === null) return null;
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
                if (streaming) {
                    packedSequences.push(source);
                    continue;
                }
                const packed = new Float64Array(count);
                for (let index = 0; index < count; index++) {
                    if (!scalar(source[index])) return null;
                    packed[index] = source[index]._value;
                }
                packedSequences.push(packed);
            }
            if (!streaming) {
                parent._lastCompilerOptimizationRoute =
                    "v8-number-residue-region";
            }
            return { kind: 1, parent, prototype: primePrototype, modulus,
                     values: unboxed, sequences: packedSequences,
                     elementBrand, streaming, integerConstants };
        }

        const extensionPrototype = parent._machineExtensionElementPrototype;
        const parentPrototype = Object.getPrototypeOf(parent);
        const degree = parent._machineExtensionDegree;
        const modulusCoefficients = parent._machineExtensionModulusCoefficients;
        if (!Number.isSafeInteger(degree) || degree < 2 || degree > 4 ||
            parent._machineExtensionCommutative !== true ||
            !(tupleBrand instanceof WeakSet) ||
            !tupleBrand.has(modulusCoefficients) ||
            modulusCoefficients.length !== degree ||
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
                negDescriptor?.get !== parent._machineExtensionNegGetter ||
                Reflect.get(negOwner, "__neg__", negOwner) !==
                    parent._machineExtensionNeg) return null;
        }
        if (required(POW)) {
            let powOwner = extensionPrototype;
            let powDescriptor;
            while (powOwner !== null) {
                powDescriptor = Object.getOwnPropertyDescriptor(powOwner, "__pow__");
                if (powDescriptor !== undefined) break;
                powOwner = Object.getPrototypeOf(powOwner);
            }
            if (powOwner !== parent._machineExtensionPowOwner ||
                powDescriptor?.get !== parent._machineExtensionPowGetter ||
                Reflect.get(powOwner, "__pow__", powOwner) !==
                    parent._machineExtensionPow) return null;
        }
        const modulus = parent._machineExtensionPrime;
        const exactBound = (degree + 2) * modulus * modulus + modulus;
        if (!Number.isSafeInteger(modulus) || modulus < 2 || modulus > 200000 ||
            modulusCoefficients.some((coefficient) =>
                !Number.isInteger(coefficient) || coefficient < 0 ||
                coefficient >= modulus) ||
            !Number.isSafeInteger(exactBound)) return null;
        const integerConstants = canonicalIntegerConstants(modulus);
        if (integerConstants === null) return null;
        const scalar = (value) => {
            if (!elementBrand.has(value) ||
                value._parent !== parent ||
                Object.getPrototypeOf(value) !== extensionPrototype) return false;
            const coordinates = value._machineCoordinates;
            return Array.isArray(coordinates) && Object.isFrozen(coordinates) &&
                coordinates.length === degree &&
                coordinates.every((coefficient) =>
                    Number.isInteger(coefficient) && coefficient >= 0 &&
                    coefficient < modulus);
        };
        if (!values.every(scalar)) return null;
        const unboxed = new Float64Array(degree * values.length);
        for (let index = 0; index < values.length; index++) {
            for (let component = 0; component < degree; component++) {
                unboxed[degree * index + component] =
                    values[index]._machineCoordinates[component];
            }
        }
        const packedSequences = [];
        for (const source of sequences) {
            if (streaming) {
                packedSequences.push(source);
                continue;
            }
            const packed = new Float64Array(degree * count);
            for (let index = 0; index < count; index++) {
                if (!scalar(source[index])) return null;
                for (let component = 0; component < degree; component++) {
                    packed[degree * index + component] =
                        source[index]._machineCoordinates[component];
                }
            }
            packedSequences.push(packed);
        }
        if (!streaming) {
            parent._lastCompilerOptimizationRoute =
                "v8-extension-tuple-region";
        }
        return { kind: 2, parent, prototype: extensionPrototype, modulus,
                 degree, modulusCoefficients, values: unboxed,
                 sequences: packedSequences, elementBrand, streaming,
                 integerConstants };
    })()"""


def ρσ_materialize_machine_field_value(context, coefficients):
    """Materialize one public value at a verified region exit."""
    return r"""%js (() => {
        if (context.kind === 1) {
            const result = Object.create(context.prototype);
            result._parent = context.parent;
            result._value = coefficients;
            return ρσ_brand_machine_field_element(result);
        }
        return context.parent._machineExtensionMaterialize.call(
            context.parent, coefficients
        );
    })()"""


def ρσ_machine_field_power(context, value, exponent):
    """Evaluate one verified primitive ring power with bounded scratch."""
    return r"""%js (() => {
        if (context === null || !Number.isSafeInteger(exponent) || exponent < 0) {
            throw new TypeError("invalid verified machine-field power");
        }
        const modulus = context.modulus;
        let remaining = exponent;
        if (context.kind === 1) {
            let result = 1;
            let factor = value;
            while (remaining > 0) {
                if (remaining % 2 === 1) result = (result * factor) % modulus;
                remaining = Math.floor(remaining / 2);
                if (remaining > 0) factor = (factor * factor) % modulus;
            }
            return result;
        }
        const degree = context.degree;
        if (!Array.isArray(value) || value.length !== degree) {
            throw new TypeError("invalid verified extension-field power");
        }
        const resultBuffers = [new Float64Array(degree), new Float64Array(degree)];
        const factorBuffers = [Float64Array.from(value), new Float64Array(degree)];
        const product = new Float64Array(2 * degree - 1);
        resultBuffers[0][0] = 1;
        let resultIndex = 0;
        let factorIndex = 0;
        const multiply = (left, right, output) => {
            product.fill(0);
            output.fill(0);
            for (let i = 0; i < degree; i++) {
                for (let j = 0; j < degree; j++) {
                    const position = i + j;
                    product[position] =
                        (product[position] + left[i] * right[j]) % modulus;
                }
            }
            for (let power = 2 * degree - 2; power >= degree; power--) {
                const coefficient = product[power];
                for (let index = 0; index < degree; index++) {
                    const position = power - degree + index;
                    let next = product[position] -
                        coefficient * context.modulusCoefficients[index];
                    next %= modulus;
                    if (next < 0) next += modulus;
                    product[position] = next;
                }
            }
            for (let index = 0; index < degree; index++) output[index] = product[index];
        };
        while (remaining > 0) {
            if (remaining % 2 === 1) {
                const nextResult = 1 - resultIndex;
                multiply(
                    resultBuffers[resultIndex],
                    factorBuffers[factorIndex],
                    resultBuffers[nextResult],
                );
                resultIndex = nextResult;
            }
            remaining = Math.floor(remaining / 2);
            if (remaining > 0) {
                const nextFactor = 1 - factorIndex;
                multiply(
                    factorBuffers[factorIndex],
                    factorBuffers[factorIndex],
                    factorBuffers[nextFactor],
                );
                factorIndex = nextFactor;
            }
        }
        return resultBuffers[resultIndex];
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
            parent._closedScalarCommutative === true &&
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
            return ρσ_brand_machine_field_element(result);
        }

        const extensionPrototype = parent._machineExtensionElementPrototype;
        const parentPrototype = Object.getPrototypeOf(parent);
        const materialize = parent._machineExtensionMaterialize;
        const isolated = parent._machineExtensionIsolated;
        const modulusCoefficients = parent._machineExtensionModulusCoefficients;
        const tupleBrand = ρσ_math_tuple.__machineFieldSequenceBrand;
        const degree = parent._machineExtensionDegree;
        if (!Number.isSafeInteger(degree) || degree < 2 || degree > 4 ||
            parent._machineExtensionCommutative !== true ||
            !(tupleBrand instanceof WeakSet) ||
            !tupleBrand.has(modulusCoefficients) ||
            modulusCoefficients.length !== degree ||
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
        const left = accumulator._machineCoordinates;
        const factor = multiplier._machineCoordinates;
        const addend = increment._machineCoordinates;
        const validCoordinates = (value) =>
            Array.isArray(value) && Object.isFrozen(value) &&
            value.length === degree && value.every((coefficient) =>
                Number.isInteger(coefficient) && coefficient >= 0 &&
                coefficient < prime);
        const exactBound = (degree + 2) * prime * prime + prime;
        if (!Number.isSafeInteger(prime) || prime < 2 || prime > 200000 ||
            modulusCoefficients.some((coefficient) =>
                !Number.isInteger(coefficient) || coefficient < 0 ||
                coefficient >= prime) ||
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
        if (degree === 3) {
            const modulusC0 = modulusCoefficients[0];
            const modulusC1 = modulusCoefficients[1];
            const modulusC2 = modulusCoefficients[2];
            let valueC0 = left[0];
            let valueC1 = left[1];
            let valueC2 = left[2];
            const factorC0 = factor[0];
            const factorC1 = factor[1];
            const factorC2 = factor[2];
            const addendC0 = addend[0];
            const addendC1 = addend[1];
            const addendC2 = addend[2];
            for (let index = 0; index < count; index++) {
                let productC0 = (valueC0 * factorC0) % prime;
                let productC1 = (
                    valueC0 * factorC1 + valueC1 * factorC0
                ) % prime;
                let productC2 = (
                    valueC0 * factorC2 + valueC1 * factorC1 +
                    valueC2 * factorC0
                ) % prime;
                let productC3 = (
                    valueC1 * factorC2 + valueC2 * factorC1
                ) % prime;
                const productC4 = (valueC2 * factorC2) % prime;

                let correction = (productC4 * modulusC0) % prime;
                productC1 = productC1 >= correction ?
                    productC1 - correction : productC1 + prime - correction;
                correction = (productC4 * modulusC1) % prime;
                productC2 = productC2 >= correction ?
                    productC2 - correction : productC2 + prime - correction;
                correction = (productC4 * modulusC2) % prime;
                productC3 = productC3 >= correction ?
                    productC3 - correction : productC3 + prime - correction;

                correction = (productC3 * modulusC0) % prime;
                productC0 = productC0 >= correction ?
                    productC0 - correction : productC0 + prime - correction;
                correction = (productC3 * modulusC1) % prime;
                productC1 = productC1 >= correction ?
                    productC1 - correction : productC1 + prime - correction;
                correction = (productC3 * modulusC2) % prime;
                productC2 = productC2 >= correction ?
                    productC2 - correction : productC2 + prime - correction;

                let sum = productC0 + addendC0;
                valueC0 = sum >= prime ? sum - prime : sum;
                sum = productC1 + addendC1;
                valueC1 = sum >= prime ? sum - prime : sum;
                sum = productC2 + addendC2;
                valueC2 = sum >= prime ? sum - prime : sum;
            }
            const result = materialize.call(
                parent, [valueC0, valueC1, valueC2]
            );
            parent._lastCompilerOptimizationRoute = "v8-extension-tuple";
            return result;
        }
        if (degree === 4) {
            const modulusC0 = modulusCoefficients[0];
            const modulusC1 = modulusCoefficients[1];
            const modulusC2 = modulusCoefficients[2];
            const modulusC3 = modulusCoefficients[3];
            let valueC0 = left[0];
            let valueC1 = left[1];
            let valueC2 = left[2];
            let valueC3 = left[3];
            const factorC0 = factor[0];
            const factorC1 = factor[1];
            const factorC2 = factor[2];
            const factorC3 = factor[3];
            const addendC0 = addend[0];
            const addendC1 = addend[1];
            const addendC2 = addend[2];
            const addendC3 = addend[3];
            for (let index = 0; index < count; index++) {
                let productC0 = (valueC0 * factorC0) % prime;
                let productC1 = (
                    valueC0 * factorC1 + valueC1 * factorC0
                ) % prime;
                let productC2 = (
                    valueC0 * factorC2 + valueC1 * factorC1 +
                    valueC2 * factorC0
                ) % prime;
                let productC3 = (
                    valueC0 * factorC3 + valueC1 * factorC2 +
                    valueC2 * factorC1 + valueC3 * factorC0
                ) % prime;
                let productC4 = (
                    valueC1 * factorC3 + valueC2 * factorC2 +
                    valueC3 * factorC1
                ) % prime;
                let productC5 = (
                    valueC2 * factorC3 + valueC3 * factorC2
                ) % prime;
                const productC6 = (valueC3 * factorC3) % prime;

                let correction = (productC6 * modulusC0) % prime;
                productC2 = productC2 >= correction ?
                    productC2 - correction : productC2 + prime - correction;
                correction = (productC6 * modulusC1) % prime;
                productC3 = productC3 >= correction ?
                    productC3 - correction : productC3 + prime - correction;
                correction = (productC6 * modulusC2) % prime;
                productC4 = productC4 >= correction ?
                    productC4 - correction : productC4 + prime - correction;
                correction = (productC6 * modulusC3) % prime;
                productC5 = productC5 >= correction ?
                    productC5 - correction : productC5 + prime - correction;

                correction = (productC5 * modulusC0) % prime;
                productC1 = productC1 >= correction ?
                    productC1 - correction : productC1 + prime - correction;
                correction = (productC5 * modulusC1) % prime;
                productC2 = productC2 >= correction ?
                    productC2 - correction : productC2 + prime - correction;
                correction = (productC5 * modulusC2) % prime;
                productC3 = productC3 >= correction ?
                    productC3 - correction : productC3 + prime - correction;
                correction = (productC5 * modulusC3) % prime;
                productC4 = productC4 >= correction ?
                    productC4 - correction : productC4 + prime - correction;

                correction = (productC4 * modulusC0) % prime;
                productC0 = productC0 >= correction ?
                    productC0 - correction : productC0 + prime - correction;
                correction = (productC4 * modulusC1) % prime;
                productC1 = productC1 >= correction ?
                    productC1 - correction : productC1 + prime - correction;
                correction = (productC4 * modulusC2) % prime;
                productC2 = productC2 >= correction ?
                    productC2 - correction : productC2 + prime - correction;
                correction = (productC4 * modulusC3) % prime;
                productC3 = productC3 >= correction ?
                    productC3 - correction : productC3 + prime - correction;

                let sum = productC0 + addendC0;
                valueC0 = sum >= prime ? sum - prime : sum;
                sum = productC1 + addendC1;
                valueC1 = sum >= prime ? sum - prime : sum;
                sum = productC2 + addendC2;
                valueC2 = sum >= prime ? sum - prime : sum;
                sum = productC3 + addendC3;
                valueC3 = sum >= prime ? sum - prime : sum;
            }
            const result = materialize.call(
                parent, [valueC0, valueC1, valueC2, valueC3]
            );
            parent._lastCompilerOptimizationRoute = "v8-extension-tuple";
            return result;
        }
        if (degree !== 2) return null;
        const modulusC0 = modulusCoefficients[0];
        const modulusC1 = modulusCoefficients[1];
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
        const result = materialize.call(parent, [valueC0, valueC1]);
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
