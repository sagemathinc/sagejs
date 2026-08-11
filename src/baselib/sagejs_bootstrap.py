"""Irreducible aliases and ABI glue used while Sage.js bootstraps itself.

This is the sole top-level baselib module which is intentionally not strict
mathematical Python. The aliases break the compiler's bootstrap import cycle;
the adapter below captures JavaScript's dynamic `this` value, which Python
has no source-level spelling for.
"""

# globals: AlgebraicExtensionFunctor, Atomics, Date, Element, Factorization
# globals: FiniteFieldElement, Int32Array, Number, Parent, PolynomialRing
# globals: QQ, QuotientFunctor, BigUint64Array, Uint8Array
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
    """Expose a JavaScript-receiver method as `method(self, *args)`."""
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
    return r"""%js (
        typeof globalThis.performance !== "undefined"
        && typeof globalThis.performance.now === "function"
        ? (globalThis.performance.timeOrigin + globalThis.performance.now()) / 1000
        : Date.now() / 1000
    )"""


def ρσ_uint64_buffer(source):
    """Allocate canonical host-owned unsigned-64-bit packed storage."""
    return r"""%js (() => {
        if (Number.isSafeInteger(source) && source >= 0) {
            return new BigUint64Array(source);
        }
        if (source instanceof BigUint64Array) {
            const start = source.byteOffset;
            const stop = start + source.byteLength;
            return new BigUint64Array(source.buffer.slice(start, stop));
        }
        return BigUint64Array.from(source, (value) => BigInt(value));
    })()"""


def ρσ_integer_buffer(source, minimum_word_capacity=1):
    """Pack primitive exact integers into owned signed-limb storage."""
    return r"""%js (() => {
        if (!Number.isSafeInteger(minimum_word_capacity) ||
            minimum_word_capacity <= 0) {
            throw new RangeError("invalid IntegerBuffer word capacity");
        }
        const packedSource = source !== null && typeof source === "object" &&
            source.sizes instanceof Int32Array &&
            source.limbs instanceof BigUint64Array &&
            Number.isSafeInteger(source.length) && source.length >= 0 &&
            Number.isSafeInteger(source.wordCapacity) &&
            source.wordCapacity > 0 &&
            source.sizes.length === source.length &&
            source.limbs.length === source.length * source.wordCapacity;
        const length = Number(Reflect.get(source, "length"));
        if (!Number.isSafeInteger(length) || length < 0) {
            throw new TypeError("IntegerBuffer source has invalid length");
        }
        const values = packedSource ? undefined : new Array(length);
        let capacity = minimum_word_capacity;
        for (let index = 0; index < length; index += 1) {
            if (packedSource) {
                capacity = Math.max(capacity, Math.abs(source.sizes[index]));
                continue;
            }
            const exact = Reflect.get(source, String(index));
            if (typeof exact !== "bigint" && !Number.isSafeInteger(exact)) {
                throw new TypeError(
                    "IntegerBuffer entries must be primitive exact integers"
                );
            }
            values[index] = exact;
            const magnitude = typeof exact === "number"
                ? Math.abs(exact) : exact < 0n ? -exact : exact;
            const words = magnitude === 0 || magnitude === 0n
                ? 0
                : typeof magnitude === "number"
                    ? 1 : Math.ceil(magnitude.toString(2).length / 64);
            capacity = Math.max(capacity, words);
        }
        if (length !== 0 &&
            capacity > Math.floor(Number.MAX_SAFE_INTEGER / length)) {
            throw new RangeError("invalid packed IntegerBuffer dimensions");
        }
        const packed = {
            sizes: new Int32Array(length),
            limbs: new BigUint64Array(length * capacity),
            length,
            wordCapacity: capacity,
        };
        if (packedSource) {
            packed.sizes.set(source.sizes);
            if (capacity === source.wordCapacity) {
                packed.limbs.set(source.limbs);
            } else {
                for (let index = 0; index < length; index += 1) {
                    const words = Math.abs(source.sizes[index]);
                    packed.limbs.set(
                        source.limbs.subarray(
                            index * source.wordCapacity,
                            index * source.wordCapacity + words,
                        ),
                        index * capacity,
                    );
                }
            }
        } else {
            for (let index = 0; index < length; index += 1) {
                const value = values[index];
                const negative = value < 0 || value < 0n;
                let magnitude = typeof value === "number"
                    ? BigInt(Math.abs(value)) : negative ? -value : value;
                let words = 0;
                while (magnitude !== 0n) {
                    packed.limbs[index * capacity + words] =
                        BigInt.asUintN(64, magnitude);
                    magnitude >>= 64n;
                    words += 1;
                }
                packed.sizes[index] = negative ? -words : words;
            }
        }
        packed.toArray = () => {
            const answer = new Array(length);
            for (let index = 0; index < length; index += 1) {
                const signedSize = packed.sizes[index];
                let value = 0n;
                for (let word = Math.abs(signedSize) - 1; word >= 0; word--) {
                    value = (value << 64n) +
                        packed.limbs[index * capacity + word];
                }
                answer[index] = signedSize < 0 ? -value : value;
            }
            return answer;
        };
        return packed;
    })()"""


def ρσ_integer_buffer_from_packed_bytes(source, length):
    """Decode SagePack signed magnitudes into owned IntegerBuffer storage."""
    return r"""%js (() => {
        if (!(source instanceof Uint8Array)) {
            throw new TypeError("packed integer source must be a Uint8Array");
        }
        if (!Number.isSafeInteger(length) || length < 0) {
            throw new RangeError("invalid packed integer entry count");
        }
        const view = new DataView(
            source.buffer, source.byteOffset, source.byteLength
        );
        let offset = 0;
        let capacity = 1;
        for (let index = 0; index < length; index += 1) {
            if (source.byteLength - offset < 4) {
                throw new RangeError("packed integer matrix is truncated");
            }
            const header = view.getUint32(offset, true);
            offset += 4;
            const byteCount = header & 0x7fffffff;
            if (byteCount > source.byteLength - offset) {
                throw new RangeError("packed integer matrix is truncated");
            }
            capacity = Math.max(capacity, Math.ceil(byteCount / 8));
            offset += byteCount;
        }
        if (offset !== source.byteLength) {
            throw new RangeError("packed integer matrix has trailing data");
        }
        if (length !== 0 &&
            capacity > Math.floor(Number.MAX_SAFE_INTEGER / length)) {
            throw new RangeError("invalid packed IntegerBuffer dimensions");
        }
        const packed = {
            sizes: new Int32Array(length),
            limbs: new BigUint64Array(length * capacity),
            length,
            wordCapacity: capacity,
        };
        offset = 0;
        for (let index = 0; index < length; index += 1) {
            const header = view.getUint32(offset, true);
            offset += 4;
            const byteCount = header & 0x7fffffff;
            const allocatedWords = Math.ceil(byteCount / 8);
            for (let word = 0; word < allocatedWords; word += 1) {
                let limb = 0n;
                const wordBytes = Math.min(8, byteCount - word * 8);
                for (let byte = 0; byte < wordBytes; byte += 1) {
                    limb |= BigInt(source[offset + word * 8 + byte]) <<
                        BigInt(byte * 8);
                }
                packed.limbs[index * capacity + word] = limb;
            }
            let words = allocatedWords;
            while (words > 0 &&
                packed.limbs[index * capacity + words - 1] === 0n) {
                words -= 1;
            }
            packed.sizes[index] = (header & 0x80000000) !== 0
                ? -words : words;
            offset += byteCount;
        }
        packed.toArray = () => {
            const answer = new Array(length);
            for (let index = 0; index < length; index += 1) {
                const signedSize = packed.sizes[index];
                let value = 0n;
                for (let word = Math.abs(signedSize) - 1; word >= 0; word--) {
                    value = (value << 64n) +
                        packed.limbs[index * capacity + word];
                }
                answer[index] = signedSize < 0 ? -value : value;
            }
            return answer;
        };
        return packed;
    })()"""


def ρσ_rational_buffers_from_packed_bytes(source, length):
    """Decode interleaved rational magnitudes into normalized owned buffers."""
    return r"""%js (() => {
        if (!(source instanceof Uint8Array)) {
            throw new TypeError("packed rational source must be a Uint8Array");
        }
        if (!Number.isSafeInteger(length) || length < 0) {
            throw new RangeError("invalid packed rational entry count");
        }
        const view = new DataView(
            source.buffer, source.byteOffset, source.byteLength
        );
        const numerators = new Array(length);
        const denominators = new Array(length);
        let offset = 0;
        for (let index = 0; index < length; index += 1) {
            const parts = [0n, 0n];
            for (let part = 0; part < 2; part += 1) {
                if (source.byteLength - offset < 4) {
                    throw new RangeError("packed rational matrix is truncated");
                }
                const header = view.getUint32(offset, true);
                offset += 4;
                if (part === 1 && (header & 0x80000000) !== 0) {
                    throw new RangeError(
                        "packed rational denominator is negative");
                }
                const byteCount = header & 0x7fffffff;
                if (byteCount > source.byteLength - offset) {
                    throw new RangeError("packed rational matrix is truncated");
                }
                let magnitude = 0n;
                for (let byte = byteCount - 1; byte >= 0; byte -= 1) {
                    magnitude = (magnitude << 8n) |
                        BigInt(source[offset + byte]);
                }
                parts[part] = part === 0 &&
                    (header & 0x80000000) !== 0 ? -magnitude : magnitude;
                offset += byteCount;
            }
            let numerator = parts[0];
            let denominator = parts[1];
            if (denominator === 0n) {
                throw new RangeError("packed rational denominator is zero");
            }
            if (numerator === 0n) {
                denominator = 1n;
            } else {
                let left = numerator < 0n ? -numerator : numerator;
                let right = denominator;
                while (right !== 0n) {
                    const remainder = left % right;
                    left = right;
                    right = remainder;
                }
                numerator /= left;
                denominator /= left;
            }
            numerators[index] = numerator;
            denominators[index] = denominator;
        }
        if (offset !== source.byteLength) {
            throw new RangeError("packed rational matrix has trailing data");
        }
        const pack = (values) => {
            let capacity = 1;
            for (const value of values) {
                const magnitude = value < 0n ? -value : value;
                const words = magnitude === 0n ? 0 :
                    Math.ceil(magnitude.toString(2).length / 64);
                capacity = Math.max(capacity, words);
            }
            if (length !== 0 &&
                capacity > Math.floor(Number.MAX_SAFE_INTEGER / length)) {
                throw new RangeError("invalid packed RationalBuffer dimensions");
            }
            const packed = {
                sizes: new Int32Array(length),
                limbs: new BigUint64Array(length * capacity),
                length,
                wordCapacity: capacity,
            };
            for (let index = 0; index < length; index += 1) {
                const value = values[index];
                const negative = value < 0n;
                let magnitude = negative ? -value : value;
                let words = 0;
                while (magnitude !== 0n) {
                    packed.limbs[index * capacity + words] =
                        BigInt.asUintN(64, magnitude);
                    magnitude >>= 64n;
                    words += 1;
                }
                packed.sizes[index] = negative ? -words : words;
            }
            packed.toArray = () => {
                const answer = new Array(length);
                for (let index = 0; index < length; index += 1) {
                    const signedSize = packed.sizes[index];
                    let value = 0n;
                    for (let word = Math.abs(signedSize) - 1;
                        word >= 0; word -= 1) {
                        value = (value << 64n) +
                            packed.limbs[index * capacity + word];
                    }
                    answer[index] = signedSize < 0 ? -value : value;
                }
                return answer;
            };
            return packed;
        };
        return [pack(numerators), pack(denominators)];
    })()"""


def ρσ_integer_buffer_to_packed_bytes(source):
    """Encode owned IntegerBuffer storage as SagePack signed magnitudes."""
    return r"""%js (() => {
        const valid = source !== null && typeof source === "object" &&
            source.sizes instanceof Int32Array &&
            source.limbs instanceof BigUint64Array &&
            Number.isSafeInteger(source.length) && source.length >= 0 &&
            Number.isSafeInteger(source.wordCapacity) &&
            source.wordCapacity > 0 &&
            source.sizes.length === source.length &&
            source.limbs.length === source.length * source.wordCapacity;
        if (!valid) {
            throw new TypeError("source must be a packed IntegerBuffer");
        }
        const byteCounts = new Uint32Array(source.length);
        let total = source.length * 4;
        for (let index = 0; index < source.length; index += 1) {
            let words = Math.abs(source.sizes[index]);
            if (words > source.wordCapacity) {
                throw new RangeError("invalid IntegerBuffer signed size");
            }
            while (words > 0 &&
                source.limbs[index * source.wordCapacity + words - 1] === 0n) {
                words -= 1;
            }
            let bytes = 0;
            if (words > 0) {
                let high = source.limbs[
                    index * source.wordCapacity + words - 1
                ];
                bytes = (words - 1) * 8;
                while (high !== 0n) {
                    bytes += 1;
                    high >>= 8n;
                }
            }
            byteCounts[index] = bytes;
            total += bytes;
            if (!Number.isSafeInteger(total)) {
                throw new RangeError("packed integer output is too large");
            }
        }
        const output = new Uint8Array(total);
        const view = new DataView(output.buffer);
        let offset = 0;
        for (let index = 0; index < source.length; index += 1) {
            const byteCount = byteCounts[index];
            const negative = source.sizes[index] < 0 && byteCount !== 0;
            view.setUint32(
                offset,
                byteCount | (negative ? 0x80000000 : 0),
                true,
            );
            offset += 4;
            for (let byte = 0; byte < byteCount; byte += 1) {
                const word = Math.floor(byte / 8);
                const shift = BigInt((byte % 8) * 8);
                output[offset + byte] = Number(
                    (source.limbs[index * source.wordCapacity + word] >> shift)
                    & 0xffn
                );
            }
            offset += byteCount;
        }
        return output;
    })()"""


def ρσ_uint64_buffer_prefix(source, length):
    """Copy a validated packed prefix into independently owned storage."""
    return r"""%js (() => {
        if (!(source instanceof BigUint64Array)) {
            throw new TypeError("source must be a BigUint64Array");
        }
        if (
            !Number.isSafeInteger(length)
            || length < 0
            || length > source.length
        ) {
            throw new RangeError("invalid uint64 buffer prefix length");
        }
        const start = source.byteOffset;
        const stop = start + length * BigUint64Array.BYTES_PER_ELEMENT;
        return new BigUint64Array(source.buffer.slice(start, stop));
    })()"""


def ρσ_uint64_pack_le(source, width):
    """Pack unsigned 64-bit entries into portable little-endian bytes."""
    return r"""%js (() => {
        if (!(source instanceof BigUint64Array)) {
            throw new TypeError("source must be a BigUint64Array");
        }
        if (width !== 1 && width !== 2 && width !== 4 && width !== 8) {
            throw new RangeError("uint64 packed width must be 1, 2, 4, or 8");
        }
        if (source.length > Math.floor(Number.MAX_SAFE_INTEGER / width)) {
            throw new RangeError("packed uint64 byte length is too large");
        }
        const output = new Uint8Array(source.length * width);
        const maximum = width === 8
            ? 0xffffffffffffffffn
            : (1n << BigInt(width * 8)) - 1n;
        for (let index = 0; index < source.length; index += 1) {
            let value = source[index];
            if (value > maximum) {
                throw new RangeError(
                    "uint64 entry does not fit the requested packed width"
                );
            }
            const offset = index * width;
            for (let byte = 0; byte < width; byte += 1) {
                output[offset + byte] = Number(value & 0xffn);
                value >>= 8n;
            }
        }
        return output;
    })()"""


def ρσ_uint64_unpack_le(source, width, length):
    """Unpack exact-length portable little-endian uint64 storage."""
    return r"""%js (() => {
        if (!(source instanceof Uint8Array)) {
            throw new TypeError("source must be a Uint8Array");
        }
        if (width !== 1 && width !== 2 && width !== 4 && width !== 8) {
            throw new RangeError("uint64 packed width must be 1, 2, 4, or 8");
        }
        if (!Number.isSafeInteger(length) || length < 0) {
            throw new RangeError("invalid unpacked uint64 length");
        }
        if (length > Math.floor(Number.MAX_SAFE_INTEGER / width)) {
            throw new RangeError("packed uint64 byte length is too large");
        }
        const byteLength = length * width;
        if (source.byteLength !== byteLength) {
            throw new RangeError(
                "packed uint64 byte length does not match entry count"
            );
        }
        const output = new BigUint64Array(length);
        for (let index = 0; index < length; index += 1) {
            const offset = index * width;
            let value = 0n;
            for (let byte = width - 1; byte >= 0; byte -= 1) {
                value = (value << 8n) + BigInt(source[offset + byte]);
            }
            output[index] = value;
        }
        return output;
    })()"""


def ρσ_uint64_matrix_format(source, rows, columns):
    """Format a row-major uint64 matrix using default Sage alignment."""
    return r"""%js (() => {
        if (!(source instanceof BigUint64Array)) {
            throw new TypeError("source must be a BigUint64Array");
        }
        if (!Number.isSafeInteger(rows) || rows < 0 ||
            !Number.isSafeInteger(columns) || columns < 0 ||
            (rows !== 0 &&
                columns > Math.floor(Number.MAX_SAFE_INTEGER / rows))) {
            throw new RangeError("invalid uint64 matrix dimensions");
        }
        if (source.length !== rows * columns) {
            throw new RangeError(
                "uint64 matrix entry count does not match dimensions"
            );
        }
        if (rows === 0) return "[]";
        const entries = new Array(source.length);
        let width = 0;
        for (let index = 0; index < source.length; index += 1) {
            const text = source[index].toString();
            entries[index] = text;
            if (text.length > width) width = text.length;
        }
        const lines = new Array(rows);
        for (let row = 0; row < rows; row += 1) {
            const fields = new Array(columns);
            const offset = row * columns;
            for (let column = 0; column < columns; column += 1) {
                fields[column] = entries[offset + column].padStart(width, " ");
            }
            lines[row] = "[" + fields.join(" ") + "]";
        }
        return lines.join("\n");
    })()"""


def ρσ_integer_buffer_prefix(source, length):
    """Copy a validated packed exact-integer prefix without decoding."""
    return r"""%js (() => {
        const sizes = Reflect.get(source, "sizes");
        const limbs = Reflect.get(source, "limbs");
        const sourceLength = Number(Reflect.get(source, "length"));
        const wordCapacity = Number(Reflect.get(source, "wordCapacity"));
        if (!(sizes instanceof Int32Array) ||
            !(limbs instanceof BigUint64Array) ||
            !Number.isSafeInteger(sourceLength) || sourceLength < 0 ||
            !Number.isSafeInteger(wordCapacity) || wordCapacity <= 0 ||
            sizes.length !== sourceLength ||
            limbs.length !== sourceLength * wordCapacity) {
            throw new TypeError("source must be a packed IntegerBuffer");
        }
        if (!Number.isSafeInteger(length) || length < 0 ||
            length > sourceLength) {
            throw new RangeError("invalid IntegerBuffer prefix length");
        }
        const packed = {
            sizes: sizes.slice(0, length),
            limbs: limbs.slice(0, length * wordCapacity),
            length,
            wordCapacity,
        };
        packed.toArray = () => {
            const answer = new Array(length);
            for (let index = 0; index < length; index += 1) {
                const signedSize = packed.sizes[index];
                let value = 0n;
                for (let word = Math.abs(signedSize) - 1; word >= 0; word--) {
                    value = (value << 64n) +
                        packed.limbs[index * wordCapacity + word];
                }
                answer[index] = signedSize < 0 ? -value : value;
            }
            return answer;
        };
        return packed;
    })()"""


def ρσ_integer_buffer_used_word_capacity(source):
    """Scan packed signed-limb metadata in the host representation layer."""
    return r"""%js (() => {
        const sizes = Reflect.get(source, "sizes");
        const length = Number(Reflect.get(source, "length"));
        if (!(sizes instanceof Int32Array) ||
            !Number.isSafeInteger(length) || length < 0 ||
            sizes.length !== length) {
            throw new TypeError("source must be a packed IntegerBuffer");
        }
        let maximum = 1;
        for (let index = 0; index < sizes.length; index += 1) {
            maximum = Math.max(maximum, Math.abs(sizes[index]));
        }
        return maximum;
    })()"""


def ρσ_uint64_residue_buffer(source, modulus):
    """Pack primitive exact integers modulo `modulus` when possible."""
    return r"""%js (() => {
        const prime = BigInt(modulus);
        if (prime <= 0n || prime > 0xffffffffffffffffn) {
            throw new RangeError("invalid uint64 residue modulus");
        }
        const length = source.length;
        if (!Number.isSafeInteger(length) || length < 0) return undefined;
        const output = new BigUint64Array(length);
        for (let index = 0; index < length; index += 1) {
            const value = source[index];
            let exact;
            if (typeof value === "bigint") {
                exact = value;
            } else if (Number.isSafeInteger(value)) {
                exact = BigInt(value);
            } else {
                return undefined;
            }
            let residue = exact % prime;
            if (residue < 0n) residue += prime;
            output[index] = residue;
        }
        return output;
    })()"""


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
    declaration_identity,
    package_name,
    export_name,
    values,
    parameter_types,
    return_type,
    result_domain,
    error_exception,
    error_message,
    constraints,
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
                        // A BigUint64Array is already a constant-time proof of
                        // the complete packed ABI contract.  Canonical matrix
                        // storage must not be rescanned at every FFI call.
                        if (value instanceof BigUint64Array) return value;
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
            if (parameter_type === "IntegerBuffer") {
                if (
                    value !== null
                    && (typeof value === "object"
                        || typeof value === "function")
                ) {
                    const length = Number(Reflect.get(value, "length"));
                    if (Number.isSafeInteger(length) && length >= 0) {
                        const sizes = Reflect.get(value, "sizes");
                        const limbs = Reflect.get(value, "limbs");
                        const capacity = Number(
                            Reflect.get(value, "wordCapacity")
                        );
                        if (
                            sizes instanceof Int32Array
                            && limbs instanceof BigUint64Array
                            && Number.isSafeInteger(capacity)
                            && capacity > 0
                            && sizes.length === length
                            && limbs.length === length * capacity
                        ) {
                            return value;
                        }
                        for (let position = 0; position < length; position++) {
                            const entry = Reflect.get(value, String(position));
                            if (
                                typeof entry !== "bigint"
                                && !Number.isSafeInteger(entry)
                            ) {
                                throw new TypeError(
                                    "invalid IntegerBuffer entry"
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
        const exception_classes = {
            OverflowError, RuntimeError, TypeError, ValueError
        };
        const exception_class = exception_classes[error_exception];
        if (
            error_exception !== null
            && typeof exception_class !== "function"
        ) {
            throw new RuntimeError(
                `unsupported FFI exception ${error_exception}`
            );
        }
        let result;
        try {
            result = Reflect.apply(callable_value, backend, marshalled);
        } catch (error) {
            // Generated host adapters translate a failed isolated-core status
            // before returning to JavaScript.  Re-enter the declaration's
            // semantic exception domain instead of leaking a generic host
            // Error through the safe Python surface.
            if (typeof exception_class === "function") {
                const message = typeof error?.message === "string"
                    ? error.message : error_message;
                throw new exception_class(message);
            }
            throw error;
        }
        if (
            !Array.isArray(result_domain)
            || result_domain.length !== 3
            || !["direct", "nullable", "status"].includes(result_domain[0])
        ) {
            throw new TypeError("invalid FFI result domain");
        }
        const failed = (
            (result_domain[0] === "status" && result === false)
            || (result_domain[0] === "nullable" && result == null)
        );
        if (failed) {
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
    declaration_identity,
    resource_identity,
    package_name,
    create_export,
    close_export,
    values,
    parameter_types,
    parameter_minimums,
    error_policy,
    error_exception,
    error_message,
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
            if (type.startsWith("resource:")) {
                const tag = globalThis.__sagejs_ffi_resource_tag__;
                const state = tag === undefined ? undefined : value?.[tag];
                if (
                    state === undefined
                    || state.identity !== type
                    || (state.root ?? state).closed
                ) {
                    throw new TypeError(
                        `invalid dynamic FFI resource argument for ${type}`
                    );
                }
                return state.handle;
            }
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
            if (type === "UInt64Buffer") {
                if (
                    value !== null
                    && (typeof value === "object"
                        || typeof value === "function")
                ) {
                    const length = Number(Reflect.get(value, "length"));
                    if (Number.isSafeInteger(length) && length >= 0) {
                        if (value instanceof BigUint64Array) return value;
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
                `invalid dynamic FFI resource argument for ${type}`
            );
        });
        const exception_classes = {
            OverflowError, RuntimeError, TypeError, ValueError
        };
        const exception_class = exception_classes[error_exception];
        if (
            error_exception !== null
            && typeof exception_class !== "function"
        ) {
            throw new RuntimeError(
                `unsupported FFI exception ${error_exception}`
            );
        }
        let handle;
        try {
            handle = Reflect.apply(create, backend, marshalled);
        } catch (error) {
            if (typeof exception_class === "function") {
                const message = typeof error?.message === "string"
                    ? error.message : error_message;
                throw new exception_class(message);
            }
            throw error;
        }
        if (error_policy === "zero_is_error" && handle === false) {
            if (typeof exception_class !== "function") {
                throw new RuntimeError(
                    `FFI declaration ${declaration_identity} returned a failed status without a declared exception`
                );
            }
            throw new exception_class(error_message);
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


def ρσ_ffi_resource_copy_bytes(token, resource_identity, copy_export):
    """Copy an owned resource's declared byte payload into host storage."""
    return r"""%js (() => {
        const tag = globalThis.__sagejs_ffi_resource_tag__;
        const state = tag === undefined ? undefined : token?.[tag];
        if (state === undefined || state.identity !== resource_identity) {
            throw new TypeError(`expected ${resource_identity}`);
        }
        if (state.borrowed) {
            throw new TypeError("borrowed FFI views have no owned byte payload");
        }
        if (state.closed) throw new ValueError("FFI resource is closed");
        const copy = Reflect.get(state.backend, copy_export);
        if (typeof copy !== "function") {
            throw new RuntimeError(
                `FFI resource backend lacks ${copy_export}`
            );
        }
        const result = Reflect.apply(copy, state.backend, [state.handle]);
        const tagName = Object.prototype.toString.call(result);
        if (
            !ArrayBuffer.isView(result)
            || tagName !== "[object Uint8Array]"
            || result.BYTES_PER_ELEMENT !== 1
        ) {
            throw new TypeError(
                `FFI resource transfer ${copy_export} did not return bytes`
            );
        }
        return result;
    })()"""


def ρσ_ffi_view_create(
    declaration_identity,
    view_identity,
    owner_identity,
    owner_token,
    package_name,
    create_export,
    values,
    parameter_types,
    error_policy,
    error_exception,
    error_message,
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
